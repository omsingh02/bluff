import { motion } from "framer-motion";
import { LogoMark } from "./Logo";

/** Full-screen loading state: the brand's side-eye glancing around over a soft glow. */
export function Splash({ label = "Shuffling the deck…" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="splash"
      className="grid min-h-dvh place-items-center px-6"
    >
      <div className="flex flex-col items-center gap-5">
        <div className="relative">
          <motion.div
            aria-hidden
            className="absolute inset-0 rounded-full bg-primary/50 blur-2xl"
            animate={{ opacity: [0.35, 0.8, 0.35], scale: [0.9, 1.25, 0.9] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          >
            <LogoMark size={72} glance className="relative drop-shadow-[0_0_24px_hsl(var(--primary)/0.6)]" />
          </motion.div>
        </div>
        <p className="font-display text-sm tracking-wide text-muted">{label}</p>
      </div>
    </div>
  );
}
