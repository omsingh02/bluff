import { motion } from "framer-motion";
import { Player } from "@/lib/gameLogic";
import { cn } from "@/lib/utils";
import { Crown } from "lucide-react";

interface OpponentBarProps {
  players: Player[];
  currentPlayerId: string | null;
  currentTurnIndex: number;
}

export function OpponentBar({ players, currentPlayerId, currentTurnIndex }: OpponentBarProps) {
  const opponents = players.filter(p => p.id !== currentPlayerId);

  return (
    <div className="flex justify-center gap-1.5 sm:gap-3 px-2 py-2 overflow-x-auto scrollbar-hide shrink-0 pt-safe">
      {opponents.map((player) => {
        const isTheirTurn = players[currentTurnIndex]?.id === player.id;
        return (
          <motion.div
            key={player.id}
            layout
            className={cn(
              "flex flex-col items-center gap-0.5 px-1.5 sm:px-2 py-1 rounded-xl transition-all min-w-0 shrink-0",
              isTheirTurn && "bg-primary/10 ring-2 ring-primary glow-purple"
            )}
          >
            <div className={cn(
              "w-11 h-11 sm:w-14 sm:h-14 rounded-full flex items-center justify-center text-xs sm:text-base font-bold border-2 shrink-0",
              isTheirTurn
                ? "border-primary bg-primary/20 text-primary"
                : "border-border bg-muted text-muted-foreground"
            )}>
              {player.nickname.slice(0, 2).toUpperCase()}
            </div>
            <span className="text-[11px] sm:text-sm text-foreground font-medium truncate max-w-[56px] sm:max-w-[70px] leading-tight">
              {player.nickname}
            </span>
            <span className={cn(
              "text-[10px] sm:text-xs font-mono font-bold leading-tight",
              player.hand.length === 0 ? "text-secondary" : "text-muted-foreground"
            )}>
              {player.hand.length} 🃏
            </span>
            {player.isHost && <Crown className="w-3 h-3 text-yellow-500" />}
          </motion.div>
        );
      })}
    </div>
  );
}
