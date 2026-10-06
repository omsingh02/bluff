import { cardPx } from "./cardMetrics";

/** Headroom above the first row so a selected (lifted) card never gets clipped. */
export const LIFT_ROOM = 16;
/** How far a selected card lifts, in px. */
export const LIFT = 14;
/** Fraction of a card's height that the next row covers. */
const ROW_STEP = 0.64;

export interface HandLayout {
  /** Pixels per em for the cards in this layout. */
  unit: number;
  cardW: number;
  cardH: number;
  /** Top-left of every card, in hand order. */
  positions: { x: number; y: number }[];
  /** Index of the first card in each row. */
  rowStarts: number[];
  /** Row index of each card. */
  rowOf: number[];
  /** Height of the fan (without LIFT_ROOM). */
  height: number;
}

export function unitForWidth(width: number, compact = false): number {
  if (compact) return width < 640 ? 9 : 12;
  if (width < 400) return 11;
  if (width < 640) return 12;
  if (width < 1000) return 13;
  return 16;
}

/**
 * Fits `count` overlapping cards into `width` px: as few rows as possible (max 3) while each card's
 * visible strip stays tappable; every row's overlap is computed to span the row exactly (centered).
 */
export function layoutHand(count: number, width: number, compact = false): HandLayout {
  const unit = unitForWidth(width, compact);
  const { w: cardW, h: cardH } = cardPx(unit);
  const minStrip = width < 400 ? (compact ? 22 : 26) : Math.round(unit * 2.1);
  const maxStrip = cardW * 0.62;
  const hardMin = 14;

  const capacity = (strip: number) => Math.max(1, Math.floor((width - cardW) / strip) + 1);
  const rows = Math.min(3, Math.max(1, Math.ceil(count / capacity(minStrip))));

  const base = Math.floor(count / rows);
  const extra = count % rows;
  const positions: HandLayout["positions"] = [];
  const rowStarts: number[] = [];
  const rowOf: number[] = [];

  for (let r = 0; r < rows; r++) {
    const m = base + (r < extra ? 1 : 0);
    rowStarts.push(positions.length);
    const strip = m > 1 ? Math.min(maxStrip, Math.max(hardMin, (width - cardW) / (m - 1))) : 0;
    const rowWidth = cardW + (m - 1) * strip;
    const x0 = Math.max(0, (width - rowWidth) / 2);
    for (let j = 0; j < m; j++) {
      positions.push({ x: Math.round(x0 + j * strip), y: Math.round(r * cardH * ROW_STEP) });
      rowOf.push(r);
    }
  }

  const height = count === 0 ? 0 : Math.round(cardH + (rows - 1) * cardH * ROW_STEP);
  return { unit, cardW, cardH, positions, rowStarts, rowOf, height };
}
