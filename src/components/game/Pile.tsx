import { forwardRef, memo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { PlayingCard } from "./PlayingCard";
import "./game.css";

interface PileProps {
  /** Cards in the pile. */
  count: number;
  /** Pixels per em of the cards (card = 5em × 7em). */
  unit?: number;
  className?: string;
}

/** Deterministic "messy stack" jitter so the pile looks hand-tossed but never flickers between renders. */
const jitter = (i: number) => ({
  rot: (((i * 37 + 11) % 19) - 9) * 1.15,
  dx: (((i * 53 + 7) % 13) - 6) * 1.5,
  dy: (((i * 29 + 3) % 9) - 4) * 1.25,
});

/** The face-down centre pile: a loose stack of card backs with a big count badge. */
export const Pile = memo(
  forwardRef<HTMLDivElement, PileProps>(function Pile({ count, unit = 11, className }, ref) {
    const shown = Math.min(count, 7);
    const w = unit * 5;
    const h = unit * 7;
    const tight = unit <= 10; // short screens: less breathing room around the stack
    return (
      <div
        ref={ref}
        data-testid="pile"
        className={cn("relative grid shrink-0 place-items-center", className)}
        style={{ width: w + (tight ? 22 : 36), height: h + (tight ? 12 : 26) }}
      >
        {count === 0 ? (
          <div
            className="grid place-items-center rounded-[0.6em] border-2 border-dashed border-white/20 text-center text-[11px] font-semibold uppercase tracking-widest text-white/40"
            style={{ fontSize: unit, width: "5em", height: "7em" }}
          >
            <span style={{ fontSize: 11 }}>Empty</span>
          </div>
        ) : (
          Array.from({ length: shown }, (_, i) => {
            const { rot, dx, dy } = jitter(i);
            const top = i === shown - 1;
            return (
              <div
                key={i}
                className="absolute"
                style={{ transform: `translate(${dx}px, ${dy}px) rotate(${top ? -2 : rot}deg)` }}
              >
                {top ? (
                  // Re-keyed by count so the top card gives a little "thump" whenever cards land.
                  <motion.div
                    key={count}
                    initial={{ scale: 1.1, y: -6 }}
                    animate={{ scale: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 520, damping: 26 }}
                  >
                    <PlayingCard faceDown unit={unit} />
                  </motion.div>
                ) : (
                  <PlayingCard faceDown unit={unit} />
                )}
              </div>
            );
          })
        )}
        <span
          data-testid="pile-count"
          aria-label={`${count} cards in the pile`}
          className="absolute -bottom-0.5 right-0 min-w-[2rem] rounded-full border border-white/15 bg-background/85 px-2.5 py-0.5 text-center font-display text-sm font-bold tabular-nums text-foreground shadow-lg backdrop-blur"
        >
          {count}
        </span>
      </div>
    );
  }),
);
