import type { CSSProperties } from "react";
import type { Suit } from "@/lib/types";

/** Crisp inline-SVG suit pips (24×24 viewBox, `currentColor`). Size with width/height classes. */
export function SuitIcon({ suit, className, style }: { suit: Suit; className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} style={style} aria-hidden focusable="false">
      {suit === "H" && (
        <path d="M12 21.2C11.2 20.5 3 14.2 3 8.5 3 5.4 5.3 3.4 7.9 3.4c1.7 0 3.1.8 4.1 2.2 1-1.4 2.4-2.2 4.1-2.2 2.6 0 4.9 2 4.9 5.1 0 5.7-8.2 12-9 12.7z" />
      )}
      {suit === "D" && <path d="M12 1.8 19.6 12 12 22.2 4.4 12z" />}
      {suit === "S" && (
        <>
          <path d="M12 2.8c.8.7 9 7 9 12.7 0 3.1-2.3 5.1-4.9 5.1-1.7 0-3.1-.8-4.1-2.2-1 1.4-2.4 2.2-4.1 2.2C5.3 20.6 3 18.6 3 15.5 3 9.8 11.2 3.5 12 2.8z" />
          <path d="M12 14.5c0 3.5-.8 5.700-3.200 7.500h6.400c-2.400-1.800-3.200-4-3.200-7.500z" />
        </>
      )}
      {suit === "C" && (
        <>
          <circle cx="12" cy="7.3" r="4.6" />
          <circle cx="6.5" cy="14.3" r="4.6" />
          <circle cx="17.5" cy="14.3" r="4.6" />
          <circle cx="12" cy="12.4" r="3.4" />
          <path d="M12 12.5c0 4.700-.8 7.500-3.200 9.500h6.400c-2.400-2-3.200-4.800-3.200-9.500z" />
        </>
      )}
    </svg>
  );
}
