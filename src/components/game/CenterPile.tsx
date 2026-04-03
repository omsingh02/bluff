import { motion, AnimatePresence } from "framer-motion";
import { Rank } from "@/lib/gameLogic";
import { Layers } from "lucide-react";

interface CenterPileProps {
  pileCount: number;
  claimedRank: Rank | null;
  lastPlayedCount: number;
}

export function CenterPile({ pileCount, claimedRank, lastPlayedCount }: CenterPileProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <motion.div
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 0.3 }}
        key={pileCount}
        className="relative w-16 h-[5.5rem] sm:w-20 sm:h-28 flex items-center justify-center"
      >
        {pileCount > 0 ? (
          <>
            {Array.from({ length: Math.min(pileCount, 5) }).map((_, i) => (
              <motion.div
                key={i}
                initial={{ scale: 0, rotate: 0 }}
                animate={{ scale: 1, rotate: (i - 2) * 8 }}
                className="absolute w-12 h-[4.25rem] sm:w-14 sm:h-20 rounded-lg bg-gradient-to-br from-primary/60 to-primary/20 border border-primary/30"
                style={{ zIndex: i }}
              />
            ))}
            <span className="relative z-10 text-sm sm:text-lg font-bold text-foreground bg-background/80 rounded-full w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center">
              {pileCount}
            </span>
          </>
        ) : (
          <div className="w-12 h-[4.25rem] sm:w-14 sm:h-20 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
            <Layers className="w-5 h-5 sm:w-6 sm:h-6 text-muted-foreground/30" />
          </div>
        )}
      </motion.div>

      <AnimatePresence mode="wait">
        {claimedRank && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="text-center"
          >
            <p className="text-[10px] sm:text-sm text-muted-foreground leading-tight">Claimed</p>
            <p className="text-base sm:text-xl font-bold text-primary text-glow-purple">
              {lastPlayedCount}× {claimedRank === "A" ? "Ace" : claimedRank === "J" ? "Jack" : claimedRank === "Q" ? "Queen" : claimedRank === "K" ? "King" : claimedRank}s
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
