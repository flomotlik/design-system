/*
 * fm design system — search behaviour module
 * ------------------------------------------
 * Engine-neutral ES module for the `.fm-search` template (search field plus
 * result overlay). It supplies the generic behaviour once, consistently:
 * open/close, arrow-key navigation, ARIA combobox/listbox/option, focus trap
 * in the modal (via the native <dialog>), `returnFocus`, Ctrl/Cmd-K, debounce
 * with a race guard, and prefers-reduced-motion. The module knows NOTHING
 * about any search engine — you pass an adapter function
 * `async (query, { signal }) => SearchResult[]` and, optionally, a render
 * schema.
 *
 * Delivered as:
 *   import { createSearch }
 *     from 'https://design-system.flomotlik.me/fm-search.js';
 *
 *   const controller = createSearch({
 *     input: '#search',
 *     overlay: '#search-overlay',
 *     search: async (q, { signal }) => myEngine.find(q, { signal }),
 *   });
 *
 * SearchResult slot schema (what the adapter MUST return):
 *   { id, title, excerpt?, url, badge?, meta? }
 *   - `title` is escaped by the default renderer via textContent (XSS-safe).
 *   - `excerpt` may contain HTML (e.g. <mark>) — ONLY if the adapter escaped
 *     it itself; it is assigned through innerHTML.
 *
 * The module has NO side effects on import (no top-level DOM access, so it is
 * SSR-safe); everything happens inside createSearch(). Typography is left to
 * CSS via --fm-font-*; no font strings are set here on purpose.
 *
 * Labels default to English. Pass `labels` to localise them.
 *
 * Licence: MIT (same as design-system.css).
 */

let idCounter = 0;

const DEFAULT_LABELS = {
  placeholder: "Search …",
  noResults: "No results.",
  hint: "Type at least {n} characters …",
  loading: "Searching …",
  count: "{n} results",
};

function resolveEl(ref, root) {
  if (!ref) return null;
  if (typeof ref === "string") return (root || document).querySelector(ref);
  return ref;
}

function isMod(event) {
  return event.metaKey || event.ctrlKey;
}

export function createSearch(options = {}) {
  const {
    input,
    overlay = null,
    search,
    renderItem = null,
    getItemHref = (result) => result && result.url,
    minQueryLength = 3,
    debounceMs = 200,
    mode = "inline",
    shortcut = true,
    triggers = [],
    // Extra containers (elements and/or selector strings) that count as
    // "inside" for the click-outside check, like the overlay does. Needed
    // when a consumer renders results into its own panel outside the
    // overlay (adapter returns []) — clicks in there must not close the
    // search. Default: empty.
    extraContainers = [],
    closeOnSelect = true,
    labels: userLabels = {},
  } = options;

  // Keep the raw references and resolve them only on click, so panels and
  // selectors mounted later still resolve reliably.
  const extraContainerRefs = Array.isArray(extraContainers)
    ? extraContainers
    : extraContainers
      ? [extraContainers]
      : [];

  const inputEl = resolveEl(input);
  if (!inputEl) {
    throw new Error("fm-search: `input` is required (element or selector).");
  }
  if (typeof search !== "function") {
    throw new Error("fm-search: a `search` adapter (async function) is required.");
  }

  const labels = { ...DEFAULT_LABELS, ...userLabels };
  const triggerEls = (Array.isArray(triggers) ? triggers : [triggers])
    .map((t) => resolveEl(t))
    .filter(Boolean);

  // Overlay container: expected or created in inline mode; in modal mode it
  // lives inside the dialog. If none is given, one is created next to the
  // input.
  let overlayEl = resolveEl(overlay);
  let dialogEl = null;
  if (mode === "modal") {
    dialogEl = inputEl.closest("dialog");
  }
  if (!overlayEl) {
    overlayEl = document.createElement("div");
    overlayEl.className = "fm-search__overlay";
    if (inputEl.parentElement) {
      inputEl.parentElement.appendChild(overlayEl);
    }
  }

  // Result list (role=listbox) and status region inside the overlay.
  const uid = `fm-search-${++idCounter}`;
  const listId = `${uid}-list`;
  if (!overlayEl.id) overlayEl.id = `${uid}-overlay`;

  const countEl = document.createElement("div");
  countEl.className = "fm-search__count";
  countEl.hidden = true;

  const listEl = document.createElement("ul");
  listEl.className = "fm-search__results";
  listEl.id = listId;
  listEl.setAttribute("role", "listbox");
  listEl.setAttribute("aria-label", labels.placeholder);

  const stateEl = document.createElement("div");
  stateEl.className = "fm-search__state";
  // Live region, so state changes are announced.
  stateEl.setAttribute("aria-live", "polite");

  overlayEl.append(countEl, listEl, stateEl);

  // --- ARIA-Verdrahtung am Input (combobox-with-listbox, APG-Pattern) -------
  inputEl.setAttribute("role", "combobox");
  inputEl.setAttribute("aria-expanded", "false");
  inputEl.setAttribute("aria-controls", listId);
  inputEl.setAttribute("aria-autocomplete", "list");
  inputEl.setAttribute("aria-haspopup", "listbox");
  if (!inputEl.hasAttribute("autocomplete")) inputEl.setAttribute("autocomplete", "off");
  if (!inputEl.placeholder) inputEl.placeholder = labels.placeholder;

  // --- Interner Zustand ------------------------------------------------------
  let results = [];
  let activeIndex = -1;
  let isOpen = false;
  let generation = 0; // race guard against stale async results
  let debounceTimer = null;
  let lastReturnFocus = null;
  let scrollLockPrev = "";

  // --- Rendering -------------------------------------------------------------
  function defaultRender(result) {
    const item = document.createElement("a");
    const title = document.createElement("span");
    title.className = "fm-search__item-title";
    // XSS: Titel IMMER via textContent escapen.
    title.textContent = result.title != null ? String(result.title) : "";
    item.appendChild(title);

    if (result.excerpt != null) {
      const ex = document.createElement("span");
      ex.className = "fm-search__item-excerpt";
      // excerpt darf HTML enthalten (vom Adapter escaped) -> innerHTML.
      ex.innerHTML = String(result.excerpt);
      item.appendChild(ex);
    }
    if (result.badge != null) {
      const badge = document.createElement("span");
      badge.className = "fm-search__item-badge";
      badge.textContent = String(result.badge);
      item.appendChild(badge);
    }
    return item;
  }

  function renderResults(query) {
    listEl.textContent = "";
    activeIndex = -1;

    results.forEach((result, index) => {
      const rendered = renderItem ? renderItem(result) : defaultRender(result);
      let node;
      if (typeof rendered === "string") {
        const li = document.createElement("li");
        li.innerHTML = rendered;
        node = li;
      } else if (rendered instanceof HTMLElement) {
        node = rendered.tagName === "LI" ? rendered : wrapInListItem(rendered);
      } else {
        node = document.createElement("li");
      }

      if (!node.classList.contains("fm-search__item")) {
        node.classList.add("fm-search__item");
      }
      node.id = `${uid}-opt-${index}`;
      node.setAttribute("role", "option");
      node.setAttribute("aria-selected", "false");

      const href = getItemHref(result);
      if (href && node.tagName === "A") node.setAttribute("href", href);

      node.addEventListener("click", (event) => {
        event.preventDefault();
        selectIndex(index);
      });
      node.addEventListener("mousemove", () => setActive(index, false));

      listEl.appendChild(node);
    });

    if (results.length > 0) {
      countEl.hidden = false;
      countEl.textContent = labels.count.replace("{n}", String(results.length));
      setState(null);
      emit("results", { query, count: results.length });
    } else {
      countEl.hidden = true;
      setState("no-results", labels.noResults);
      emit("results", { query, count: 0 });
    }
  }

  function wrapInListItem(el) {
    const li = document.createElement("li");
    li.appendChild(el);
    return li;
  }

  function itemNodes() {
    return Array.from(listEl.querySelectorAll(".fm-search__item"));
  }

  function setState(kind, message) {
    const map = {
      empty: labels.placeholder,
      hint: labels.hint.replace("{n}", String(minQueryLength)),
      loading: labels.loading,
      "no-results": labels.noResults,
    };
    stateEl.className = "fm-search__state";
    if (!kind) {
      stateEl.hidden = true;
      stateEl.textContent = "";
      return;
    }
    stateEl.hidden = false;
    stateEl.classList.add(`fm-search__state--${kind}`);
    stateEl.textContent = message != null ? message : map[kind] || "";
    if (kind === "loading" || kind === "hint" || kind === "no-results" || kind === "empty") {
      // While a state is shown, suppress the result list and the count.
      countEl.hidden = true;
      listEl.textContent = "";
      activeIndex = -1;
    }
  }

  // --- Active-Item / Tastatur-Navigation ------------------------------------
  function setActive(index, scroll = true) {
    const nodes = itemNodes();
    if (nodes.length === 0) {
      activeIndex = -1;
      inputEl.removeAttribute("aria-activedescendant");
      return;
    }
    nodes.forEach((n) => {
      n.classList.remove("is-active");
      n.setAttribute("aria-selected", "false");
    });
    activeIndex = ((index % nodes.length) + nodes.length) % nodes.length;
    const node = nodes[activeIndex];
    node.classList.add("is-active");
    node.setAttribute("aria-selected", "true");
    inputEl.setAttribute("aria-activedescendant", node.id);
    if (scroll) node.scrollIntoView({ block: "nearest" });
  }

  function moveActive(delta) {
    const nodes = itemNodes();
    if (nodes.length === 0) return;
    const next = activeIndex < 0 ? (delta > 0 ? 0 : nodes.length - 1) : activeIndex + delta;
    setActive(next);
  }

  function selectIndex(index) {
    const result = results[index];
    if (!result) return;
    // A consumer can preventDefault() the `select` event and handle the
    // navigation itself (client-side routing, for instance).
    const prevented = emit("select", { result });
    const href = getItemHref(result);
    if (closeOnSelect) close();
    if (!prevented && href) {
      window.location.assign(href);
    }
  }

  // --- Open / Close ----------------------------------------------------------
  function open() {
    if (isOpen) return;
    isOpen = true;
    inputEl.setAttribute("aria-expanded", "true");

    if (mode === "modal" && dialogEl && typeof dialogEl.showModal === "function") {
      lastReturnFocus = document.activeElement;
      lockScroll();
      if (!dialogEl.open) dialogEl.showModal();
      // In the modal the overlay is static inside the dialog — no [hidden]
      // toggle needed,
      // aber wir entfernen es konsistent.
      overlayEl.hidden = false;
      window.requestAnimationFrame(() => inputEl.focus());
    } else {
      overlayEl.hidden = false;
      overlayEl.classList.add("is-open");
    }
    if (!results.length && inputEl.value.trim().length < minQueryLength) {
      setState("hint");
    }
    emit("open", {});
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    inputEl.setAttribute("aria-expanded", "false");
    inputEl.removeAttribute("aria-activedescendant");
    activeIndex = -1;

    if (mode === "modal" && dialogEl) {
      unlockScroll();
      if (dialogEl.open) dialogEl.close();
      // returnFocus: closes the documented focus gap on dismissal.
      if (lastReturnFocus && typeof lastReturnFocus.focus === "function") {
        lastReturnFocus.focus();
      }
      lastReturnFocus = null;
    } else {
      overlayEl.classList.remove("is-open");
      overlayEl.hidden = true;
    }
    emit("close", {});
  }

  function lockScroll() {
    scrollLockPrev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  function unlockScroll() {
    document.body.style.overflow = scrollLockPrev;
  }

  // --- Search pipeline: debounce plus generation guard ----------------------
  function onInput() {
    const query = inputEl.value.trim();
    if (debounceTimer) clearTimeout(debounceTimer);

    if (query.length < minQueryLength) {
      results = [];
      generation++; // invalidate the in-flight search
      setState("hint");
      emit("query", { query });
      return;
    }

    emit("query", { query });
    if (!isOpen) open();
    setState("loading");

    debounceTimer = setTimeout(() => runSearch(query), debounceMs);
  }

  async function runSearch(query) {
    const myGen = ++generation;
    const controllerSignal = createSignal();
    let payload;
    try {
      payload = await search(query, { signal: controllerSignal.signal });
    } catch (error) {
      if (myGen !== generation) return; // veraltet -> ignorieren
      results = [];
      setState("no-results");
      return;
    }
    // Race-Guard: ein neuerer Lauf hat begonnen -> dieses Ergebnis verwerfen.
    if (myGen !== generation) return;
    // null = superseded (z. B. Pagefind debouncedSearch) -> ignorieren.
    if (payload == null) return;

    results = Array.isArray(payload) ? payload : [];
    if (!isOpen) open();
    renderResults(query);
  }

  function createSignal() {
    if (typeof AbortController === "function") {
      const ac = new AbortController();
      return { signal: ac.signal, abort: () => ac.abort() };
    }
    return { signal: undefined, abort: () => {} };
  }

  // --- Tastatur am Input -----------------------------------------------------
  function onKeydown(event) {
    switch (event.key) {
      case "ArrowDown":
        if (!isOpen) open();
        event.preventDefault();
        moveActive(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveActive(-1);
        break;
      case "Home":
        if (itemNodes().length) {
          event.preventDefault();
          setActive(0);
        }
        break;
      case "End":
        if (itemNodes().length) {
          event.preventDefault();
          setActive(itemNodes().length - 1);
        }
        break;
      case "Enter":
        if (activeIndex >= 0) {
          event.preventDefault();
          selectIndex(activeIndex);
        }
        break;
      case "Escape":
        if (isOpen) {
          event.preventDefault();
          if (mode !== "modal") inputEl.blur();
          close();
        }
        break;
      default:
        break;
    }
  }

  // --- Globale Shortcuts (Strg/Cmd+K, '/') ----------------------------------
  function onGlobalKeydown(event) {
    const k = event.key.toLowerCase();
    const isShortcut = (isMod(event) && k === "k") || (event.key === "/" && !isTypingTarget(event.target));
    if (isShortcut) {
      event.preventDefault();
      open();
      window.requestAnimationFrame(() => inputEl.focus());
    }
  }

  function isTypingTarget(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
  }

  // --- Inline mode: a click outside closes ----------------------------------
  function onDocumentPointerDown(event) {
    if (mode === "modal") return;
    if (!isOpen) return;
    const within =
      inputEl.contains(event.target) ||
      (overlayEl && overlayEl.contains(event.target)) ||
      extraContainerRefs.some((ref) => {
        const el = resolveEl(ref);
        return el ? el.contains(event.target) : false;
      });
    if (!within) close();
  }

  // --- Catch the dialog-native close (ESC / backdrop) for returnFocus -------
  function onDialogClose() {
    if (isOpen) close();
  }

  // --- CustomEvents ----------------------------------------------------------
  function emit(type, detail) {
    const event = new CustomEvent(`fm-search:${type}`, {
      detail,
      bubbles: true,
      cancelable: true,
    });
    inputEl.dispatchEvent(event);
    if (overlayEl && overlayEl !== inputEl) overlayEl.dispatchEvent(event);
    return event.defaultPrevented;
  }

  // --- Listener wiring (stored so destroy() can unwind it cleanly) ----------
  const bound = [];
  function on(target, type, handler, opts) {
    target.addEventListener(type, handler, opts);
    bound.push(() => target.removeEventListener(type, handler, opts));
  }

  on(inputEl, "input", onInput);
  on(inputEl, "keydown", onKeydown);
  on(inputEl, "focus", () => {
    if (mode === "inline" && inputEl.value.trim().length >= minQueryLength && results.length) open();
  });
  on(document, "pointerdown", onDocumentPointerDown);
  if (shortcut) on(document, "keydown", onGlobalKeydown);
  triggerEls.forEach((t) =>
    on(t, "click", (event) => {
      event.preventDefault();
      open();
      window.requestAnimationFrame(() => inputEl.focus());
    }),
  );
  if (dialogEl) on(dialogEl, "close", onDialogClose);

  // Initialer Zustand.
  if (mode === "inline") {
    overlayEl.hidden = true;
  }
  setState("empty");

  // --- Public controller ----------------------------------------------------
  return {
    open,
    close,
    focus() {
      inputEl.focus();
    },
    setQuery(q) {
      inputEl.value = q == null ? "" : String(q);
      onInput();
    },
    refresh() {
      onInput();
    },
    destroy() {
      if (debounceTimer) clearTimeout(debounceTimer);
      generation++;
      bound.forEach((off) => off());
      bound.length = 0;
      if (isOpen) close();
    },
  };
}
