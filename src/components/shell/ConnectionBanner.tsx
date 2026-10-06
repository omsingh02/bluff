import { AnimatePresence, motion } from "framer-motion";
import { Loader2, WifiOff } from "lucide-react";

/** Slim strip pinned to the very top while the connection to the server is down. */
export function ConnectionBanner({ offline }: { offline: boolean }) {
  return (
    <AnimatePresence>
      {offline && (
        <motion.div
          key="offline"
          role="status"
          aria-live="polite"
          data-testid="connection-banner"
          initial={{ y: "-100%" }}
          animate={{ y: 0 }}
          exit={{ y: "-100%" }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          className="pointer-events-none fixed inset-x-0 top-0 z-[60] border-b border-gold/30 bg-[hsl(var(--surface)/0.96)] pt-[env(safe-area-inset-top)] backdrop-blur"
        >
          <div className="flex h-6 items-center justify-center gap-2 text-[11px] font-semibold text-gold">
            <WifiOff className="h-3 w-3" aria-hidden />
            Reconnecting…
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
