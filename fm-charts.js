/*
 * fm design system — chart helper module
 * --------------------------------------
 * Palette and helpers for ECharts-based data tools:
 *
 *   import { PALETTE, INK, LABEL_SIZE, AXIS_SIZE,
 *            BAR_MAX_DENSE, BAR_MAX_WIDE, PATTERN_DECAL,
 *            tip, legend, grid, planActualSeries }
 *     from 'https://design-system.flomotlik.me/fm-charts.js';
 *
 * ECharts itself is not bundled here — load it yourself. This module ships
 * no third-party code.
 *
 * TWO LAYERS, deliberately separate:
 *
 *   PALETTE / INK          static values, identical to the stylesheet's
 *                          defaults. Readable at module level and without a
 *                          DOM, which is what makes them testable in Node.
 *                          They know nothing about theming.
 *
 *   palette() / ink()      read the same values from the CSS tokens at CALL
 *   / font()               time, so they follow a local override. With no
 *                          DOM, or before the stylesheet has loaded, they
 *                          fall back to the static values above.
 *
 * Use the functions if the page re-themes the design system; otherwise the
 * constants are fine. The two are kept in sync by hand — if you change a
 * chart token in design-system.css, change PALETTE here too.
 *
 * Licence: MIT (same as design-system.css).
 */

// Reads a CSS custom property off the root element. Falls back to
// `fallback` when there is no DOM (Node), the stylesheet has not loaded
// yet, or the token is empty.
function token(name, fallback) {
  if (typeof document === "undefined" || typeof getComputedStyle !== "function") {
    return fallback;
  }
  try {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
    return value || fallback;
  } catch {
    return fallback;
  }
}

/* Eight categorical tones, same order as --fm-web-chart-1..8.
   No two of them share both a close hue and a close luminance, so they stay
   apart for a red-green colour-blind reader and in greyscale print. */
export const PALETTE = [
  "#2f6f96", // --fm-web-chart-1  blue — primary series
  "#c08a2e", // --fm-web-chart-2  ochre
  "#4e8f6d", // --fm-web-chart-3  green
  "#a8503c", // --fm-web-chart-4  rust
  "#6d5b9e", // --fm-web-chart-5  violet
  "#4fb0ad", // --fm-web-chart-6  light teal
  "#6b4a2e", // --fm-web-chart-7  brown
  "#7d838c", // --fm-web-chart-8  slate grey
];

export const INK = {
  text:     "#22262b",
  soft:     "#5a616b",
  mute:     "#69707a",
  hairline: "#dfe4ea",
  gridline: "#e8ecf1",
  axis:     "#c9d0d8",
  primary:  "#2f6f96",
  clay:     "#9c5a38",
  slate:    "#7d838c",
};

export const LABEL_SIZE    = 15;
export const AXIS_SIZE     = 14;
export const BAR_MAX_DENSE = 56;
export const BAR_MAX_WIDE  = 130;

/* A hatch pattern for the secondary series of a paired comparison, so the
   pair stays readable without relying on colour alone. */
export const PATTERN_DECAL = {
  symbol:      "rect",
  symbolSize:  1,
  dashArrayX:  [3, 0],
  dashArrayY:  [1, 6],
  color:       "rgba(255,255,255,0.45)",
  rotation:    -Math.PI / 4,
};

/* Runtime variants — these follow local token overrides. */

// The eight categorical tones, in the same order as PALETTE.
export function palette() {
  return PALETTE.map((fallback, i) => token(`--fm-web-chart-${i + 1}`, fallback));
}

// Tonal colours. `gridline` and `axis` have no token of their own in the
// stylesheet and therefore always return the static values.
export function ink() {
  return {
    text:     token("--fm-web-text",       INK.text),
    soft:     token("--fm-web-text-soft",  INK.soft),
    mute:     token("--fm-web-text-mute",  INK.mute),
    hairline: token("--fm-web-hairline",   INK.hairline),
    gridline: INK.gridline,
    axis:     INK.axis,
    primary:  token("--fm-web-chart-1",    INK.primary),
    clay:     token("--fm-web-clay-text",  INK.clay),
    slate:    token("--fm-web-chart-8",    INK.slate),
  };
}

// Type family for chart labels.
export function font() {
  return token("--fm-font-copy", "'Inter', system-ui, sans-serif");
}

export function tip(extra = {}) {
  const colour = ink();
  return {
    trigger:         "axis",
    backgroundColor: token("--fm-web-surface", "#ffffff"),
    borderColor:     colour.hairline,
    borderWidth:     1,
    extraCssText:
      "box-shadow: 0 4px 14px rgba(26,32,40,.08); border-radius: 8px;",
    textStyle: {
      color:      colour.text,
      fontFamily: font(),
      fontSize:   LABEL_SIZE,
    },
    ...extra,
  };
}

export function legend(extra = {}) {
  return {
    textStyle: { color: ink().soft, fontSize: LABEL_SIZE },
    itemGap:   14,
    ...extra,
  };
}

export function grid(extra = {}) {
  return {
    left:         10,
    right:        18,
    top:          14,
    bottom:       10,
    containLabel: true,
    ...extra,
  };
}

/* A paired "actual vs plan" bar series. The second series carries the hatch
   pattern so the pair is distinguishable without colour. Pass your own names
   if the domain calls them something else. */
export function planActualSeries(actualName = "Actual", planName = "Plan") {
  return [
    { name: actualName, type: "bar", data: [] },
    {
      name: planName,
      type: "bar",
      data: [],
      itemStyle: { decal: PATTERN_DECAL },
    },
  ];
}
