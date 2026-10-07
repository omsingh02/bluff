/**
 * Leery's logo as plain SVG strings: the side-eye mark, the app-icon tile, and the horizontal lockup.
 *
 * The mark is a wary, half-lidded eye — the look you give right before calling a bluff. Its pupil is a
 * spade, because the thing it's side-eyeing is a card. Everything is hand-drawn paths on a 64×64 grid
 * (no fonts, no rasters), so the files render the same in browsers, GitHub and image viewers.
 *
 * src/components/shell/Logo.tsx draws the same geometry for the app UI — keep the two in sync.
 */
import { WORDMARK } from "./wordmark.mjs";

export const COLOR = {
  ink: "#0b0716",
  violet: "#8b5cf6",
  violetDeep: "#7c3aed",
  pink: "#ec4899",
  pinkDeep: "#db2777",
  gold: "#fbbf24",
  ivory: "#f6f1e7",
};

const ALMOND = "M4.5 33C12 13.5 52 13.5 59.5 33C52 52.5 12 52.5 4.5 33Z";
const SPADE =
  "M12 2C12 2 4 9 4 14.2a4 4 0 0 0 7 2.6C10.7 19 10 20.6 8.5 22h7c-1.5-1.4-2.2-3-2.5-5.2a4 4 0 0 0 7-2.6C20 9 12 2 12 2z";

const XMLNS = 'xmlns="http://www.w3.org/2000/svg"';

/** Gradient + clip definitions for one inlined copy of the mark (`id` keeps them unique per document). */
const markDefs = (id) =>
  `<linearGradient id="${id}g" x1="6" y1="18" x2="58" y2="48" gradientUnits="userSpaceOnUse"><stop stop-color="${COLOR.violet}"/><stop offset="1" stop-color="${COLOR.pink}"/></linearGradient>` +
  `<linearGradient id="${id}i" x1="30" y1="24" x2="54" y2="48" gradientUnits="userSpaceOnUse"><stop stop-color="#fde68a"/><stop offset="1" stop-color="#f59e0b"/></linearGradient>` +
  `<clipPath id="${id}c"><path d="${ALMOND}"/></clipPath>`;

/** The eye itself: ivory eyeball, gradient iris, spade pupil, heavy gradient lid. */
const eyeBody = (id) =>
  `<g clip-path="url(#${id}c)">` +
  `<rect width="64" height="64" fill="${COLOR.ivory}"/>` +
  `<circle cx="42.5" cy="37.2" r="12.8" fill="url(#${id}i)"/>` +
  `<path transform="translate(38.2 32) scale(.55)" fill="${COLOR.ink}" d="${SPADE}"/>` +
  `<path d="M0 0H64V31.3L0 37.8Z" fill="${COLOR.ink}"/>` +
  `<path d="M0 0H64V29L0 35.5Z" fill="url(#${id}g)"/>` +
  `</g>`;

/** App-icon tile (dark rounded square with a faint gradient ring) around the eye, on the 64×64 grid. */
const tileBody = (id) =>
  `<rect width="64" height="64" rx="15" fill="${COLOR.ink}"/>` +
  `<rect x=".75" y=".75" width="62.5" height="62.5" rx="14.25" fill="none" stroke="url(#${id}g)" stroke-opacity=".5" stroke-width="1.5"/>` +
  `<g transform="translate(1.6 1.65) scale(.95)">${eyeBody(id)}</g>`;

const svg = (viewBox, label, inner, extra = "") =>
  `<svg ${XMLNS} viewBox="${viewBox}" role="img" aria-label="${label}"${extra}>${inner}</svg>\n`;

/** public/favicon.svg — the app-icon tile. */
export const faviconSvg = () => {
  const id = "f";
  return svg("0 0 64 64", "Leery", `<defs>${markDefs(id)}</defs>${tileBody(id)}`);
};

/** The eye alone on a transparent background (docs/brand/logo-mark.svg). A hairline rim keeps it legible on light pages. */
export const markSvg = () => {
  const id = "m";
  return svg(
    "3 16 58 34",
    "Leery",
    `<defs>${markDefs(id)}</defs>${eyeBody(id)}<path d="${ALMOND}" fill="none" stroke="url(#${id}g)" stroke-opacity=".7" stroke-width="1"/>`,
  );
};

/**
 * An app icon for PNG export. `bleed` fills the whole square (maskable and Apple icons — the platform
 * rounds or masks them) and scales the eye by `scale` to stay inside the safe zone.
 */
export const iconSvg = ({ size, bleed = false, scale = 1 }) => {
  const id = "i";
  const inner = bleed
    ? `<rect width="64" height="64" fill="${COLOR.ink}"/><g transform="translate(${+(32 * (1 - scale)).toFixed(2)} ${+(32 * (1 - scale) - scale).toFixed(2)}) scale(${scale})">${eyeBody(id)}</g>`
    : tileBody(id);
  return `<svg ${XMLNS} width="${size}" height="${size}" viewBox="0 0 64 64"><defs>${markDefs(id)}</defs>${inner}</svg>`;
};

/** Shifts every x coordinate of an absolute-command path (M L H V Q C Z — what the wordmark uses) by `dx`. */
const shiftPath = (d, dx) =>
  d.replace(/([MLHVQC])([^MLHVQCZ]*)/g, (_, cmd, args) => {
    if (cmd === "V") return cmd + args;
    const nums = args.match(/-?\d*\.?\d+/g).map(Number);
    const shifted = nums.map((n, i) => (cmd === "H" || i % 2 === 0 ? +(n + dx).toFixed(1) : n));
    return cmd + shifted.join(" ");
  });

/**
 * "Leery" as a single outlined path (one path, so a gradient fill spans the whole word).
 * `size` is the font size in px (cap height = 0.75 × size), `tracking` is in em. The left ink edge sits at
 * `x`, the baseline at `baseline`. Returns the SVG fragment and the word's ink width.
 */
export function wordmark({ x = 0, baseline = 0, size, tracking = 0.015, fill }) {
  const k = size / WORDMARK.unitsPerEm;
  const step = tracking * WORDMARK.unitsPerEm;
  const { ink, layout, paths } = WORDMARK;
  const d = layout.map(([ch, gx], i) => shiftPath(paths[ch], gx + i * step)).join("");
  const width = (ink.right - ink.left + (layout.length - 1) * step) * k;
  const tx = +(x - ink.left * k).toFixed(2);
  return {
    width,
    svg: `<path transform="translate(${tx} ${baseline}) scale(${+k.toFixed(5)})" fill="${fill}" d="${d}"/>`,
  };
}

/**
 * Horizontal lockup: tile + wordmark, transparent background.
 * `theme: "dark"` has the full violet → pink → gold gradient for dark pages; `"light"` a deeper violet → pink
 * that holds contrast on white.
 */
export function lockupSvg({ theme = "dark" } = {}) {
  const id = "l";
  const tile = 80;
  const gap = 22;
  const size = 60;
  const baseline = tile / 2 + (WORDMARK.capHeight * size) / WORDMARK.unitsPerEm / 2;
  const word = wordmark({ x: tile + gap, baseline, size, fill: `url(#${id}w)` });
  const width = Math.ceil(tile + gap + word.width);
  const stops =
    theme === "dark"
      ? `<stop stop-color="${COLOR.violet}"/><stop offset=".6" stop-color="${COLOR.pink}"/><stop offset="1" stop-color="${COLOR.gold}"/>`
      : `<stop stop-color="${COLOR.violetDeep}"/><stop offset="1" stop-color="${COLOR.pinkDeep}"/>`;
  return svg(
    `0 0 ${width} ${tile}`,
    "Leery",
    `<defs>${markDefs(id)}<linearGradient id="${id}w" x1="0" y1="0" x2="1" y2=".25">${stops}</linearGradient></defs>` +
      `<g transform="scale(${tile / 64})">${tileBody(id)}</g>` +
      word.svg,
  );
}
