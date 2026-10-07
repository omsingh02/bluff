/**
 * The "Leery" wordmark as outlined vector paths, so logo SVGs render identically everywhere
 * (GitHub, browsers, image viewers) without needing the Unbounded font.
 *
 * Source: Unbounded Variable (OFL) instantiated at wght 800 — outlines extracted with fontTools,
 * pen positions (kerning included) measured in Chromium. Units are font units (1000 per em), y-down,
 * baseline at y = 0. Regenerate only if the wordmark's weight or casing changes.
 */
export const WORDMARK = {
  unitsPerEm: 1000,
  capHeight: 750,
  /** Ink extents of the word before tracking (left of the L stem … right edge of the y; cap top … y descender). */
  ink: { left: 65, right: 3605.4, top: -750, bottom: 182 },
  /** Pen position of each glyph, kerning included, before tracking. */
  layout: [["L", 0], ["e", 757.4], ["e", 1499.4], ["r", 2237.4], ["y", 2806.4]],
  paths: {
    L: "M297.6 -750V-103L193 -207.2H752.4V0H64.8V-750Z",
    e: "M394.8 17.2Q289.4 17.2 206.4 -21.1Q123.4 -59.4 75.4 -128.4Q27.4 -197.4 27.4 -288.8Q27.4 -379.2 73.7 -446.9Q120 -514.6 200.3 -552.5Q280.6 -590.4 381.2 -590.4Q485.8 -590.4 559.7 -545.5Q633.6 -500.6 673.2 -418.4Q712.8 -336.2 712.8 -224.2H214.2V-355.2H581.4L514 -310.2Q510.2 -349.4 493.9 -376.6Q477.6 -403.8 451.3 -418.1Q425 -432.4 388.6 -432.4Q347.6 -432.4 318.7 -416.2Q289.8 -400 274.2 -371.7Q258.6 -343.4 258.6 -307.2Q258.6 -256.2 281.5 -221Q304.4 -185.8 350.1 -167.3Q395.8 -148.8 463.8 -148.8Q526.4 -148.8 587.2 -164.1Q648 -179.4 698.4 -207.6V-65.6Q636.8 -25.6 561.5 -4.2Q486.2 17.2 394.8 17.2Z",
    r: "M25.2 -573.2H259.2L293.2 -369.6V0H64V-377ZM553.8 -583.6V-388.8Q522.2 -394.8 495.4 -397.4Q468.6 -400 447.2 -400Q405.8 -400 370.8 -384.4Q335.8 -368.8 314.5 -331.3Q293.2 -293.8 293.2 -228L251.2 -280.2Q260 -341.8 275.7 -397.5Q291.4 -453.2 318.1 -496.6Q344.8 -540 385.4 -565.2Q426 -590.4 485.4 -590.4Q501.4 -590.4 518.4 -588.7Q535.4 -587 553.8 -583.6Z",
    y: "M257 182.2Q189.4 182.2 137.7 165.7Q86 149.2 35.8 112.8V-43Q85.8 -11 129.1 2.8Q172.4 16.6 223.4 16.6Q265.2 16.6 296.8 -1.1Q328.4 -18.8 348.6 -68L555.6 -573.2H799.2L531 1.6Q499.8 69.2 455.3 108.9Q410.8 148.6 359.9 165.4Q309 182.2 257 182.2ZM244.4 -65.2 7.6 -573.2H260.2L463.8 -65.2Z",
  },
};
