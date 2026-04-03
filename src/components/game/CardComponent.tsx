import { motion } from "framer-motion";
import { Card, SUIT_SYMBOLS } from "@/lib/gameLogic";
import { cn } from "@/lib/utils";

interface CardComponentProps {
  card: Card;
  selected?: boolean;
  onClick?: () => void;
  faceDown?: boolean;
  index?: number;
}

export function CardComponent({ card, selected, onClick, faceDown, index = 0 }: CardComponentProps) {
  if (faceDown) {
    return (
      <motion.div
        initial={{ scale: 0, rotateY: 180 }}
        animate={{ scale: 1, rotateY: 0 }}
        transition={{ delay: index * 0.05, type: "spring", stiffness: 300 }}
        className="w-[2.75rem] h-[4rem] sm:w-14 sm:h-20 rounded-lg bg-gradient-to-br from-primary/80 to-primary/40 border border-primary/50 flex items-center justify-center shadow-lg"
      >
        <span className="text-primary-foreground/30 text-xl sm:text-2xl">🂠</span>
      </motion.div>
    );
  }

  const isRed = card.suit === "hearts" || card.suit === "diamonds";

  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.92 }}
      initial={{ scale: 0, y: 50 }}
      animate={{ scale: 1, y: selected ? -14 : 0 }}
      transition={{ delay: index * 0.03, type: "spring", stiffness: 400, damping: 25 }}
      className={cn(
        "w-[2.75rem] h-[4rem] sm:w-14 sm:h-20 rounded-lg flex flex-col items-center justify-between p-1 sm:p-1.5 cursor-pointer transition-shadow shrink-0 select-none",
        "bg-gradient-to-b from-card to-muted border",
        selected
          ? "border-primary glow-purple ring-1 ring-primary"
          : "border-border hover:border-primary/50"
      )}
    >
      <span className={cn("text-[10px] sm:text-xs font-bold self-start leading-none", isRed ? "text-red-500" : "text-foreground")}>
        {card.rank}
      </span>
      <span className={cn("text-base sm:text-xl leading-none", isRed ? "text-red-500" : "text-foreground")}>
        {SUIT_SYMBOLS[card.suit]}
      </span>
      <span className={cn("text-[10px] sm:text-xs font-bold self-end rotate-180 leading-none", isRed ? "text-red-500" : "text-foreground")}>
        {card.rank}
      </span>
    </motion.button>
  );
}
