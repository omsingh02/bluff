import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { CODE_LENGTH } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Clamp a number into [min, max]. */
export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Normalise user-typed room codes: uppercase, strip anything outside the code alphabet. */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH);
}
