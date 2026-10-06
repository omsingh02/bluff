import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ScrollText, X } from "lucide-react";
import { describeLog, type LogTone } from "@/lib/game";
import type { LogEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

const TONE_TEXT: Record<LogTone, string> = {
  neutral: "text-muted",
  play: "text-foreground",
  call: "text-foreground",
  good: "text-trust",
  bad: "text-rose-300",
};

const TONE_DOT: Record<LogTone, string> = {
  neutral: "bg-white/25",
  play: "bg-primary",
  call: "bg-bluff",
  good: "bg-trust",
  bad: "bg-bluff",
};

interface GameLogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  log: LogEntry[];
}

/** What's happened so far, newest first. A bottom sheet on phones, a side panel on desktop. */
export function GameLog({ open, onOpenChange, log }: GameLogProps) {
  const entries = [...log].reverse();
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          data-testid="game-log"
          className={cn(
            "glass-strong fixed z-50 flex flex-col shadow-2xl outline-none",
            "inset-x-0 bottom-0 max-h-[72dvh] rounded-t-3xl",
            "lg:inset-y-0 lg:left-auto lg:right-0 lg:max-h-none lg:w-[380px] lg:rounded-none lg:rounded-l-3xl",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom lg:data-[state=open]:slide-in-from-right",
            "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom lg:data-[state=closed]:slide-out-to-right",
          )}
        >
          <div className="flex items-center gap-2.5 px-5 pb-2 pt-5">
            <ScrollText className="h-5 w-5 text-primary" aria-hidden />
            <DialogPrimitive.Title className="flex-1 font-display text-lg font-bold">Game log</DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="Close log"
              className="grid h-9 w-9 place-items-center rounded-full text-muted transition-colors hover:bg-white/10 hover:text-foreground"
            >
              <X className="h-5 w-5" aria-hidden />
            </DialogPrimitive.Close>
          </div>
          <ol className="flex-1 space-y-1 overflow-y-auto px-5 pb-6 pt-1">
            {entries.length === 0 && <li className="py-6 text-center text-sm text-muted">Nothing yet.</li>}
            {entries.map((e) => {
              const { text, tone } = describeLog(e);
              return (
                <li key={e.n} className="flex items-start gap-3 rounded-xl px-2 py-2 text-sm leading-snug even:bg-white/[0.025]">
                  <span aria-hidden className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", TONE_DOT[tone])} />
                  <span className={TONE_TEXT[tone]}>{text}</span>
                </li>
              );
            })}
          </ol>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
