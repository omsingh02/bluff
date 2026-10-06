import { useId } from "react";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: { box: 28, text: "text-[15px]" },
  md: { box: 36, text: "text-lg" },
  lg: { box: 52, text: "text-2xl" },
} as const;

/** The spade-in-a-rounded-square brand mark (matches /favicon.svg). */
export function LogoMark({ size = 36, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className={cn("shrink-0", className)}>
      <defs>
        <linearGradient id={`lh-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c3aed" />
          <stop offset="1" stopColor="#ec4899" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="#0b0716" />
      <rect x="2" y="2" width="60" height="60" rx="13" fill="none" stroke={`url(#lh-${id})`} strokeWidth="2" />
      <path
        fill={`url(#lh-${id})`}
        d="M32 11c0 0-17 15.5-17 27.5a9.5 9.5 0 0 0 16.2 6.7C30.7 49.8 29 53.5 25 57h14c-4-3.5-5.7-7.2-6.2-11.8A9.5 9.5 0 0 0 49 38.5C49 26.5 32 11 32 11z"
      />
    </svg>
  );
}

/** Mark + wordmark. */
export function Logo({
  size = "md",
  showText = true,
  className,
}: {
  size?: keyof typeof SIZES;
  showText?: boolean;
  className?: string;
}) {
  const s = SIZES[size];
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={s.box} />
      {showText && (
        <span className={cn("font-display font-extrabold leading-none tracking-tight", s.text)}>
          Liar&apos;s <span className="brand-gradient-text">Hand</span>
        </span>
      )}
    </span>
  );
}
