import { useState } from "react";
import { motion } from "framer-motion";
import { Card, Rank, RANKS } from "@/lib/gameLogic";
import { CardComponent } from "./CardComponent";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send } from "lucide-react";

interface PlayerHandProps {
  cards: Card[];
  isMyTurn: boolean;
  onPlayCards: (cardIds: string[], claimedRank: Rank) => void;
}

export function PlayerHand({ cards, isMyTurn, onPlayCards }: PlayerHandProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [claimedRank, setClaimedRank] = useState<Rank>("A");

  const toggleCard = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 4) next.add(id);
      return next;
    });
  };

  const handlePlay = () => {
    if (selectedIds.size === 0) return;
    onPlayCards(Array.from(selectedIds), claimedRank);
    setSelectedIds(new Set());
  };

  const sorted = [...cards].sort((a, b) => RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank));

  // Dynamic overlap: more cards = tighter overlap
  const getOverlapClass = () => {
    if (sorted.length > 12) return "-ml-[0.9rem]";
    if (sorted.length > 9) return "-ml-3";
    if (sorted.length > 6) return "-ml-2.5";
    return "-ml-1.5";
  };
  const overlapClass = getOverlapClass();

  return (
    <motion.div
      initial={{ y: 80 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="flex flex-col gap-2 px-3 pb-2"
    >
      {/* Card row — overlapping fan */}
      <div className="flex justify-start sm:justify-center items-end overflow-x-auto scrollbar-hide py-1 px-4">
        {sorted.map((card, i) => (
          <div key={card.id} className={i === 0 ? "shrink-0" : `${overlapClass} shrink-0`}>
            <CardComponent
              card={card}
              index={i}
              selected={selectedIds.has(card.id)}
              onClick={() => isMyTurn && toggleCard(card.id)}
            />
          </div>
        ))}
      </div>

      {/* Controls */}
      {isMyTurn && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2"
        >
          <Select value={claimedRank} onValueChange={(v) => setClaimedRank(v as Rank)}>
            <SelectTrigger className="w-[5.5rem] sm:w-24 bg-muted border-border text-sm h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANKS.map(r => (
                <SelectItem key={r} value={r}>{r === "A" ? "Ace" : r === "J" ? "Jack" : r === "Q" ? "Queen" : r === "K" ? "King" : r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={handlePlay}
            disabled={selectedIds.size === 0}
            className="flex-1 bg-primary hover:bg-primary/90 glow-purple font-bold text-sm sm:text-base h-10 active:scale-[0.97] transition-transform"
          >
            <Send className="w-4 h-4 mr-1.5" />
            Play {selectedIds.size} card{selectedIds.size !== 1 ? "s" : ""}
          </Button>
        </motion.div>
      )}
    </motion.div>
  );
}
