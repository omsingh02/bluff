import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const TONES = {
  gold: "bg-gold/15 text-gold",
  primary: "bg-primary/20 text-[#d0c0ff]",
  trust: "bg-trust/15 text-trust",
  bluff: "bg-bluff/15 text-bluff",
  muted: "bg-white/10 text-muted",
} as const;

/** Tiny uppercase status pill (HOST, YOU, BOT…). */
export function Badge({
  tone = "muted",
  className,
  children,
}: {
  tone?: keyof typeof TONES;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase leading-4 tracking-wider",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
