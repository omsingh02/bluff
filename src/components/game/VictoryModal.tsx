import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Trophy, RotateCcw } from "lucide-react";

interface VictoryModalProps {
  winnerName: string;
  isMe: boolean;
  onPlayAgain: () => void;
}

export function VictoryModal({ winnerName, isMe, onPlayAgain }: VictoryModalProps) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-5"
      >
        <motion.div
          initial={{ scale: 0, rotate: -10 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 15 }}
          className="bg-card border border-border rounded-2xl p-6 sm:p-8 text-center max-w-sm w-full space-y-4"
        >
          <motion.div
            animate={{ rotate: [0, -10, 10, -10, 0] }}
            transition={{ delay: 0.5, duration: 0.5 }}
          >
            <Trophy className="w-14 h-14 sm:w-16 sm:h-16 mx-auto text-yellow-500" />
          </motion.div>

          <h2 className="text-xl sm:text-2xl font-black text-foreground">
            {isMe ? "🎉 YOU WIN! 🎉" : `${winnerName} Wins!`}
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground">
            {isMe ? "Master bluffer! You played all your cards." : "Better luck next time!"}
          </p>

          <Button onClick={onPlayAgain} className="w-full h-12 bg-primary glow-purple font-bold active:scale-[0.97] transition-transform">
            <RotateCcw className="w-4 h-4 mr-2" />
            Play Again
          </Button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
