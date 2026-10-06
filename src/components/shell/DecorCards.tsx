import { motion } from "framer-motion";
import type { Suit } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Crisp vector suit pip. Inherits colour from `currentColor`. */
export function SuitGlyph({ suit, className }: { suit: Suit; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      {suit === "S" && (
        <path d="M12 2C12 2 4 9 4 14.2a4 4 0 0 0 7 2.6C10.7 19 10 20.6 8.5 22h7c-1.5-1.4-2.2-3-2.5-5.2a4 4 0 0 0 7-2.6C20 9 12 2 12 2z" />
      )}
      {suit === "H" && <path d="M12 21.5S3 15.2 3 8.8A4.8 4.8 0 0 1 12 6.5a4.8 4.8 0 0 1 9 2.3c0 6.4-9 12.7-9 12.7z" />}
      {suit === "D" && <path d="M12 2l7 10-7 10-7-10z" />}
      {suit === "C" && (
        <>
          <circle cx="12" cy="7.2" r="4.2" />
          <circle cx="7.2" cy="13.4" r="4.2" />
          <circle cx="16.8" cy="13.4" r="4.2" />
          <path d="M12 12.5c.3 3.3-.6 6.6-2.6 9.5h5.2c-2-2.9-2.9-6.2-2.6-9.5z" />
        </>
      )}
    </svg>
  );
}

interface FanCard {
  rank: string;
  suit: Suit | null; // null → face-down
}

const FAN: FanCard[] = [
  { rank: "A", suit: "S" },
  { rank: "K", suit: "H" },
  { rank: "?", suit: null },
  { rank: "J", suit: "D" },
  { rank: "10", suit: "C" },
];

const ANGLES = [-34, -17, 0, 17, 34];

function FanFace({ card }: { card: FanCard }) {
  if (!card.suit) {
    // The liar's card: face-down with a glowing spade.
    return (
      <div
        className="relative grid h-full w-full place-items-center overflow-hidden rounded-[0.55em] border border-primary/60 shadow-card"
        style={{
          background:
            "repeating-linear-gradient(45deg, hsl(var(--primary) / .22) 0 .35em, transparent .35em .7em), linear-gradient(145deg, #3b1d8f, #1a0f45 55%, #5b1d6e)",
        }}
      >
        <div className="absolute inset-[0.35em] rounded-[0.35em] border border-white/15" />
        <SuitGlyph suit="S" className="h-[2.1em] w-[2.1em] text-primary drop-shadow-[0_0_10px_hsl(var(--primary))]" />
      </div>
    );
  }
  const red = card.suit === "H" || card.suit === "D";
  return (
    <div
      className={cn(
        "relative h-full w-full rounded-[0.55em] bg-gradient-to-b from-ivory to-[hsl(40_30%_88%)] shadow-card",
        red ? "text-crimson" : "text-ink",
      )}
    >
      <div className="absolute left-[0.45em] top-[0.35em] flex flex-col items-center leading-none">
        <span className="font-display text-[1.05em] font-extrabold">{card.rank}</span>
        <SuitGlyph suit={card.suit} className="mt-[0.15em] h-[0.9em] w-[0.9em]" />
      </div>
      <SuitGlyph suit={card.suit} className="absolute left-1/2 top-1/2 h-[2.1em] w-[2.1em] -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-[0.35em] right-[0.45em] flex rotate-180 flex-col items-center leading-none">
        <span className="font-display text-[1.05em] font-extrabold">{card.rank}</span>
        <SuitGlyph suit={card.suit} className="mt-[0.15em] h-[0.9em] w-[0.9em]" />
      </div>
    </div>
  );
}

/**
 * Decorative fan of five playing cards (one of them face-down — the liar's). Purely ornamental,
 * deliberately independent of the in-game PlayingCard so the landing page stays light.
 * Size it with the `--cw` (card width) custom property, e.g. `[--cw:4rem]`.
 */
export function CardFan({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="A fan of playing cards, one of them face-down"
      className={cn(
        "relative [--cw:3.5rem] sm:[--cw:4.2rem] lg:[--cw:6rem]",
        "h-[calc(var(--cw)*2.15)] w-[calc(var(--cw)*3.9)] animate-float",
        className,
      )}
    >
      {FAN.map((card, i) => {
        const angle = ANGLES[i];
        return (
          <motion.div
            key={card.rank}
            className="absolute bottom-0 left-1/2"
            style={{
              width: "var(--cw)",
              height: "calc(var(--cw) * 1.4)",
              marginLeft: "calc(var(--cw) / -2)",
              fontSize: "calc(var(--cw) * 0.36)",
              transformOrigin: "50% 190%",
              zIndex: i === 2 ? 5 : 4 - Math.abs(2 - i),
            }}
            initial={{ rotate: 0, y: 70, opacity: 0, scale: 0.8 }}
            animate={{ rotate: angle, y: 0, opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 220, damping: 19, delay: 0.12 + i * 0.07 }}
          >
            <FanFace card={card} />
          </motion.div>
        );
      })}
    </div>
  );
}
