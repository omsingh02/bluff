import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface BluffButtonProps {
  isActive: boolean;
  timerEnd: number | null;
  onCallBluff: () => void;
}

export function BluffButton({ isActive, timerEnd, onCallBluff }: BluffButtonProps) {
  const [timeLeft, setTimeLeft] = useState(5);

  useEffect(() => {
    if (!isActive || !timerEnd) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((timerEnd - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 100);
    return () => clearInterval(interval);
  }, [isActive, timerEnd]);

  if (!isActive) return null;

  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      exit={{ scale: 0 }}
      className="flex flex-col items-center gap-2"
    >
      <motion.div
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ repeat: Infinity, duration: 0.8 }}
      >
        <Button
          onClick={onCallBluff}
          size="lg"
          className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-black text-base sm:text-lg px-6 py-5 sm:px-8 sm:py-6 rounded-xl shadow-[0_0_30px_hsl(0_84%_60%/0.4)] active:scale-95 transition-transform"
        >
          <AlertTriangle className="w-5 h-5 mr-2" />
          CALL BLUFF!
        </Button>
      </motion.div>
      <div className="flex items-center gap-1.5">
        <div className="w-20 sm:w-24 h-1.5 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-destructive rounded-full"
            initial={{ width: "100%" }}
            animate={{ width: "0%" }}
            transition={{ duration: 5, ease: "linear" }}
          />
        </div>
        <span className="text-[11px] sm:text-xs text-muted-foreground font-mono tabular-nums">{timeLeft}s</span>
      </div>
    </motion.div>
  );
}
