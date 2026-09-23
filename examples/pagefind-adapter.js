/*
 * fm design system — Pagefind adapter (optional example)
 * ------------------------------------------------------
 * Connects a Pagefind search to the engine-neutral core in `fm-search.js`.
 * Pagefind is NOT a required dependency of the design system and is NOT
 * vendored — this adapter imports the consumer's own Pagefind bundle at
 * runtime through a dynamic import.
 *
 * Usage:
 *   import { createSearch }
 *     from 'https://design-system.flomotlik.me/fm-search.js';
 *   import { pagefindAdapter }
 *     from 'https://design-system.flomotlik.me/examples/pagefind-adapter.js';
 *
 *   createSearch({
 *     input: '#search',
 *     overlay: '#search-overlay',
 *     search: pagefindAdapter({ bundlePath: '/pagefind/' }),
 *   });
 *
 * Debouncing and the race guard live in fm-search, so the adapter calls
 * `pf.debouncedSearch(query, opts, 0)` with a wait of 0 and passes `null`
 * (superseded) straight through; fm-search ignores null.
 *
 * XSS note: Pagefind's `excerpt` is HTML-escaped (with <mark>) and therefore
 * safe for innerHTML. `meta.title` is NOT escaped — fm-search's default
 * renderer escapes the title via textContent. If you supply your own
 * `renderItem`, escape the title yourself.
 *
 * Licence: MIT (same as design-system.css).
 */

export function pagefindAdapter({ bundlePath = "/pagefind/", limit = 10, filters } = {}) {
  let pf = null;
  let initPromise = null;

  async function init() {
    if (pf) return pf;
    if (!initPromise) {
      initPromise = (async () => {
        // Load the consumer's bundle dynamically. /* @vite-ignore */ stops
        // Vite from trying to resolve the path at build time.
        const mod = await import(/* @vite-ignore */ `${bundlePath}pagefind.js`);
        await mod.options({ bundlePath });
        pf = mod;
        return pf;
      })();
    }
    return initPromise;
  }

  return async function search(query) {
    try {
      const engine = await init();
      const opts = filters ? { filters } : {};
      // Wait 0: fm-search does the debouncing, so there is no double debounce.
      const res = await engine.debouncedSearch(query, opts, 0);
      // null = superseded -> pass it straight through; fm-search ignores it.
      if (res == null) return null;

      const hits = res.results.slice(0, limit);
      const data = await Promise.all(hits.map((r) => r.data()));
      return data.map((d) => ({
        id: d.url,
        title: (d.meta && d.meta.title) || "",
        excerpt: d.excerpt, // Pagefind liefert HTML-escaped excerpt mit <mark>
        url: d.url,
        meta: d.meta,
      }));
    } catch (error) {
      // Stiller Fallback: im Dev-Modus fehlt `pagefind.js`, bis
      // `pagefind --site dist` gelaufen ist.
      return [];
    }
  };
}
