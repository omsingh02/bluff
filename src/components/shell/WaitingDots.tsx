import { motion } from "framer-motion";

/** Three softly pulsing dots — "waiting for someone". Decorative; pair with visible text. */
export function WaitingDots({ className }: { className?: string }) {
  return (
    <span aria-hidden className={className ?? "inline-flex items-center gap-1 align-middle"}>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-current"
          animate={{ opacity: [0.25, 1, 0.25], y: [0, -2, 0] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.18, ease: "easeInOut" }}
        />
      ))}
    </span>
  );
}
