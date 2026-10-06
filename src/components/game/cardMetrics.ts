import type { Rank } from "@/lib/types";

export type CardSize = "xs" | "sm" | "md" | "lg";

/**
 * Cards are drawn in `em` units (5em × 7em, the 5:7 poker ratio) so every internal measurement
 * scales from one number: the font-size. These are pixels-per-em for each preset.
 */
export const CARD_UNIT: Record<CardSize, number> = { xs: 6, sm: 8, md: 11, lg: 15 };

export const CARD_EM_W = 5;
export const CARD_EM_H = 7;

/** Pixel dimensions of a card drawn at `unit` px per em. */
export const cardPx = (unit: number) => ({ w: unit * CARD_EM_W, h: unit * CARD_EM_H });

type Pip = readonly [x: number, y: number];

/**
 * Classic pip layouts for 2–10. x/y are 0..1 inside the pip field (centre of each pip);
 * pips in the lower half are drawn upside-down, like a real deck.
 */
export const PIP_LAYOUT: Partial<Record<Rank, readonly Pip[]>> = {
  "2": [[0.5, 0], [0.5, 1]],
  "3": [[0.5, 0], [0.5, 0.5], [0.5, 1]],
  "4": [[0, 0], [1, 0], [0, 1], [1, 1]],
  "5": [[0, 0], [1, 0], [0.5, 0.5], [0, 1], [1, 1]],
  "6": [[0, 0], [1, 0], [0, 0.5], [1, 0.5], [0, 1], [1, 1]],
  "7": [[0, 0], [1, 0], [0.5, 0.25], [0, 0.5], [1, 0.5], [0, 1], [1, 1]],
  "8": [[0, 0], [1, 0], [0.5, 0.25], [0, 0.5], [1, 0.5], [0.5, 0.75], [0, 1], [1, 1]],
  "9": [[0, 0], [1, 0], [0, 1 / 3], [1, 1 / 3], [0.5, 0.5], [0, 2 / 3], [1, 2 / 3], [0, 1], [1, 1]],
  "10": [[0, 0], [1, 0], [0.5, 1 / 6], [0, 1 / 3], [1, 1 / 3], [0, 2 / 3], [1, 2 / 3], [0.5, 5 / 6], [0, 1], [1, 1]],
};
