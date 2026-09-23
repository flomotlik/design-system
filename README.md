# fm design system

A shared stylesheet for small web tools — consistent colour, typography and
spacing, plus the components a data tool actually needs: header, forms,
tables, dropzones, toasts, modals and search.

Hosted as a static site on GitHub Pages: <https://flomotlik.github.io/design-system/>

## Using it

One link. No npm, no build step, no install:

```html
<link rel="stylesheet" href="https://flomotlik.github.io/design-system/design-system.css">
```

For anything you want to stay visually stable — a generated report, an
archived artifact — link the **versioned** URL instead. It is frozen for the
life of the major version:

```html
<link rel="stylesheet" href="https://flomotlik.github.io/design-system/v1/design-system.css">
```

### The four lines everybody forgets

`design-system.css` deliberately sets **no tag defaults**. It styles no
`body`, no `h1`, no bare element. Without your own base layout the page
renders as serif text on white and looks like the stylesheet failed. The
minimum is four properties, built from `--fm-*` tokens:

```css
body {
  margin: 0;
  background: var(--fm-color-surface);
  color: var(--fm-color-text);
  font-family: var(--fm-font-copy);
}
```

A complete working page is in [examples/minimal.html](examples/minimal.html),
live at <https://flomotlik.github.io/design-system/examples/minimal.html>.

## Tokens

Colours are named by **role**, never by hue — there is no `--fm-color-blue`.
That is what lets a consuming tool re-theme the system by overriding a dozen
values and nothing else.

| Group | Tokens |
|---|---|
| Brand | `--fm-color-primary`, `-primary-strong`, `-secondary`, `-accent`, `-highlight` |
| Semantic | `--fm-color-text`, `-surface`, `-on-primary`, `-on-secondary` |
| Web layer | `--fm-web-bg`, `-surface`, `-text`, `-text-soft`, `-text-mute`, `-hairline`, `-primary`, `-primary-deep`, `-primary-tint` |
| Status | `--fm-web-status-success`, `-warn`, `-error` |
| Charts | `--fm-web-chart-1` … `-8` |
| Layout | `--fm-space-1..6`, `--fm-radius-*`, `--fm-text-*`, `--fm-leading-*` |

Two layers sit alongside each other: the **brand** tokens (`--fm-color-*`) for
display work, and the **web** layer (`--fm-web-*`) — a desaturated reading
palette for data tools with long reading stretches. Components use the web
layer.

Every colour in the source carries its measured contrast ratio in a comment.
If you change one, re-measure it and update the number.

## Themes

A theme is a flat set of token values and nothing else — it never touches a
component. Set it on `<html>`, `<body>`, or any element:

```html
<html data-fm-theme="report" data-fm-density="dense">
```

| Theme | For | Character |
|---|---|---|
| `tool` (default) | interactive tools, dashboards, viewers | screen-first, neutral ground, ink-blue primary |
| `report` | reports and audits | near-monochrome, tighter by default, made to be printed |
| `notebook` | briefs and notes | warm paper, editorial ink |

Three independent axes, which compose:

| Attribute | Values | Does |
|---|---|---|
| `data-fm-theme` | `tool` · `report` · `notebook` | The palette and its dark counterpart |
| `data-fm-scheme` | `light` · `dark` | Pins the colour scheme. Omit to follow the viewer's system setting |
| `data-fm-density` | `normal` · `compact` · `dense` | Tightens the spacing scale, so it reaches every component at once |

A theme carries a preferred density; an explicit `data-fm-density` still wins.

Every theme has its own dark palette rather than a filter applied on top.
Without `data-fm-scheme` the page follows `prefers-color-scheme`; with it, the
choice wins in both directions.

The selectors are plain attribute selectors, so a theme can be scoped to a
subtree — useful for a preview pane or a side-by-side comparison.

**Three things a theme may not change:**

- **Status colours.** `--fm-web-status-*` and the warn/error/success variants
  are declared once and mean the same thing everywhere. Only `info` follows the
  brand, on purpose.
- **High contrast.** `.fm-mode-hc` resolves through `--fm-hc-surface` /
  `--fm-hc-text` / `--fm-hc-accent`, which are fixed and sit outside the theme
  system. It is an accessibility mode, so it has to land in the same
  deterministic place under every theme and scheme.
- **Print.** Printing resets the tokens to the report palette whatever is on
  screen and sets an A4 page box. A dark theme printing dark wastes toner and
  usually comes out unreadable.

If none of the three fits, do not add a fourth — override the tokens in your
own stylesheet, below.

### Re-theming

Link your own stylesheet after the design system and override tokens in a
plain `:root` block:

```html
<link rel="stylesheet" href="https://flomotlik.github.io/design-system/design-system.css">
<link rel="stylesheet" href="local.css">
```

A plain `:root` block is enough because the defaults *and the themes* live in
`@layer` rules, and unlayered declarations beat layered ones regardless of
document order — so your override wins over every built-in theme.

Two rules:

- **Override tokens, never components.** The moment you redefine `.fm-btn`,
  the next release breaks your tool silently.
- **Status colours are not themeable.** `--fm-web-status-*` and the
  `warn`/`error`/`success` callouts, tags and toasts keep their meaning in
  every theme. Green means ok and red means error everywhere. The one
  deliberate exception is `info`, which draws from the primary tint and
  follows your brand.

The most common failure is a brand colour that is too light:
`--fm-color-primary` and `--fm-web-primary-deep` carry **white text**, so they
need at least 4.5:1 against white. If the brand colour fails, do not change
the brand — split the roles. Use it as a surface (`--fm-color-secondary`,
`--fm-web-primary-tint`) and a darkened variant wherever white text sits on
it. Write down in your file that the darker value is derived for legibility,
or someone will "correct" it back later.

## Chart helpers (ES module)

For ECharts-based data tools:

```js
import { PALETTE, INK, tip, legend, grid, palette, ink, font }
  from 'https://flomotlik.github.io/design-system/fm-charts.js';

chart.setOption({
  color: palette(),                                   // follows --fm-web-chart-1..8
  textStyle: { color: ink().text, fontFamily: font() },
});
```

ECharts itself is loaded by the consumer — the design system bundles no
third-party library.

`PALETTE` and `INK` are static values usable without a DOM (handy in Node
tests) and know nothing about theming. `palette()`, `ink()` and `font()` read
the same values from the CSS tokens at call time and follow an override. If
you re-theme, use the functions.

The eight chart tones are chosen so that no two share both a close hue and a
close luminance — they stay distinguishable for a red-green colour-blind
reader and in greyscale print.

## Search helper (ES module)

A search field plus result overlay, with the generic behaviour handled
centrally: open/close without layout shift, arrow-key navigation, ARIA
combobox/listbox/option, Enter/Esc, debounce with a race guard, and
prefers-reduced-motion.

```html
<div class="fm-search">
  <input type="search" class="fm-input fm-search__field" id="search">
  <div class="fm-search__overlay" id="search-overlay" hidden></div>
</div>

<script type="module">
  import { createSearch }
    from 'https://flomotlik.github.io/design-system/fm-search.js';

  createSearch({
    input:   '#search',
    overlay: '#search-overlay',
    search:  async (query, { signal }) => myIndex.find(query, { signal }),
  });
</script>
```

The module is engine-neutral: you pass an adapter,
`async (query, { signal }) => SearchResult[]`. For the modal / Ctrl-K variant
set `mode: 'modal'`. A worked Pagefind adapter is in
[examples/pagefind-adapter.js](examples/pagefind-adapter.js).

Labels default to English — pass `labels` to localise them.

## Accessibility

- High-contrast mode: put `.fm-mode-hc` on `<body>` or any ancestor. Every
  component has a hand-written override. The toggle button is yours to build.
- Inputs carry a 44px touch-target floor (WCAG 2.5.5 / 2.5.8). Override the
  token for a denser look if the context is pointer-only.
- The focus ring is configurable through `--fm-web-focus-ring` and
  `--fm-web-focus-offset`.

## Fonts

Inter (body and UI), Spectral (display and emphasis), JetBrains Mono (code and
figures) and Caveat (marginalia only). Self-hosted as Latin-subset woff2 under
`assets/fonts/`.

Self-hosting is a deliberate exception to "never vendor": an OFL binary is a
licensed asset, not a dependency with a transitive tree. It keeps the system
GDPR-safe in DACH — no third-party font CDN is contacted at view time — and
means print fidelity does not depend on a CDN being reachable. The licences
travel with the binaries in `assets/fonts/OFL-*.txt`, as OFL §2 requires.

## Development

```bash
npm install --include=dev
npm run build     # src/design-system.css -> design-system.css (Tailwind v4)
npm run watch
```

`design-system.css` is committed, and CI fails if it drifts from a fresh
build of the source. Edit `src/design-system.css`, never the built file.

## Licence

[MIT](LICENSE). The bundled fonts are OFL 1.1 — see `assets/fonts/OFL-*.txt`.
