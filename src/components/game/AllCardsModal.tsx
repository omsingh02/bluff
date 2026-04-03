import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { CardComponent } from "./CardComponent";
import { Card, RANKS } from "@/lib/gameLogic";

interface AllCardsModalProps {
  isOpen: boolean;
  onClose: () => void;
  cards: Card[];
}

export function AllCardsModal({ isOpen, onClose, cards }: AllCardsModalProps) {
  const sorted = [...cards].sort((a, b) => RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank));

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed inset-x-0 bottom-0 z-50 h-[75dvh] sm:h-[60dvh] bg-card border-t border-border rounded-t-3xl shadow-2xl flex flex-col pb-safe"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-lg font-bold">All Your Cards ({cards.length})</h2>
              <button
                onClick={onClose}
                className="p-2 rounded-full bg-muted hover:bg-muted/80 text-muted-foreground transition-colors active:scale-95"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-20">
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3 sm:gap-4 place-items-center">
                {sorted.map((card, i) => (
                  <div key={card.id}>
                    <CardComponent card={card} index={i % 8} />
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
