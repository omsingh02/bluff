import { useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { PlayingCard } from "./PlayingCard";

export interface Point {
  x: number;
  y: number;
}

/** A short burst of face-down cards travelling between two screen points. */
export interface Flight {
  id: number;
  from: Point;
  to: Point;
  /** Number of cards (capped at 4 when rendered). */
  count: number;
  /** Pixels per em of the flying cards. */
  unit: number;
  /** Seconds before the first card leaves. */
  delay?: number;
}

const DURATION = 0.42;

function FlyingCard({ flight, index, last, onDone }: { flight: Flight; index: number; last: boolean; onDone: () => void }) {
  const { from, to, unit } = flight;
  const w = unit * 5;
  const h = unit * 7;
  // deterministic little scatter so the cards fan out instead of stacking exactly
  const spread = (index - (Math.min(flight.count, 4) - 1) / 2) * 7;
  const rot = (index - 1) * 6 + ((flight.id * 13) % 7) - 3;
  return (
    <motion.div
      className="absolute left-0 top-0"
      initial={{ x: from.x - w / 2 + spread, y: from.y - h / 2, rotate: rot * 1.8, scale: 0.9, opacity: 0.95 }}
      animate={{ x: to.x - w / 2 + spread * 0.4, y: to.y - h / 2, rotate: rot, scale: 1, opacity: 1 }}
      transition={{ delay: (flight.delay ?? 0) + index * 0.055, duration: DURATION, ease: [0.22, 0.9, 0.3, 1] }}
      onAnimationComplete={last ? onDone : undefined}
    >
      <PlayingCard faceDown unit={unit} />
    </motion.div>
  );
}

function SkipFlight({ onDone }: { onDone: () => void }) {
  useEffect(onDone, [onDone]);
  return null;
}

/** Fixed, click-through layer that renders flights and reports each one finished. Skipped under reduced motion. */
export function FlyLayer({ flights, onDone }: { flights: Flight[]; onDone: (id: number) => void }) {
  const reduced = useReducedMotion();
  if (typeof document === "undefined" || flights.length === 0) return null;
  return createPortal(
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      {flights.map((f) =>
        reduced ? (
          <SkipFlight key={f.id} onDone={() => onDone(f.id)} />
        ) : (
          Array.from({ length: Math.min(f.count, 4) }, (_, i) => (
            <FlyingCard key={`${f.id}-${i}`} flight={f} index={i} last={i === Math.min(f.count, 4) - 1} onDone={() => onDone(f.id)} />
          ))
        ),
      )}
    </div>,
    document.body,
  );
}
