import { useId } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: { box: 28, text: "text-[15px]" },
  md: { box: 36, text: "text-lg" },
  lg: { box: 52, text: "text-2xl" },
} as const;

// Same geometry as scripts/brand/logo.mjs, which renders the standalone SVG files — keep the two in sync.
const ALMOND = "M4.5 33C12 13.5 52 13.5 59.5 33C52 52.5 12 52.5 4.5 33Z";
const SPADE =
  "M12 2C12 2 4 9 4 14.2a4 4 0 0 0 7 2.6C10.7 19 10 20.6 8.5 22h7c-1.5-1.4-2.2-3-2.5-5.2a4 4 0 0 0 7-2.6C20 9 12 2 12 2z";

interface LogoMarkProps {
  /** Width in px, or any CSS length (e.g. "0.8em" to scale with the surrounding text). */
  size?: number | string;
  /** `true`: the app-icon tile (square). `false`: just the eye, on a transparent background. */
  tile?: boolean;
  /** Let the eye slide its gaze back and forth — for loading states. */
  glance?: boolean;
  className?: string;
}

/** The side-eye brand mark: a half-lidded eye whose pupil is a spade (matches /favicon.svg). */
export function LogoMark({ size = 36, tile = true, glance = false, className }: LogoMarkProps) {
  const id = useId().replace(/:/g, "");
  const gaze = glance
    ? { animate: { x: [0, -10, -10, 0, 0] }, transition: { duration: 3.4, repeat: Infinity, ease: "easeInOut" as const, times: [0, 0.25, 0.55, 0.8, 1] } }
    : {};
  const eye = (
    <g clipPath={`url(#${id}c)`}>
      <rect width="64" height="64" fill="#f6f1e7" />
      <motion.g {...gaze}>
        <circle cx="42.5" cy="37.2" r="12.8" fill={`url(#${id}i)`} />
        <path transform="translate(38.2 32) scale(.55)" fill="#0b0716" d={SPADE} />
      </motion.g>
      <path d="M0 0H64V31.3L0 37.8Z" fill="#0b0716" />
      <path d="M0 0H64V29L0 35.5Z" fill={`url(#${id}g)`} />
    </g>
  );
  return (
    <svg
      width={size}
      height={tile ? size : undefined}
      viewBox={tile ? "0 0 64 64" : "3 16 58 34"}
      aria-hidden
      className={cn("shrink-0", !tile && "h-auto", className)}
    >
      <defs>
        <linearGradient id={`${id}g`} x1="6" y1="18" x2="58" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#ec4899" />
        </linearGradient>
        <linearGradient id={`${id}i`} x1="30" y1="24" x2="54" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fde68a" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
        <clipPath id={`${id}c`}>
          <path d={ALMOND} />
        </clipPath>
      </defs>
      {tile ? (
        <>
          <rect width="64" height="64" rx="15" fill="#0b0716" />
          <rect x=".75" y=".75" width="62.5" height="62.5" rx="14.25" fill="none" stroke={`url(#${id}g)`} strokeOpacity=".5" strokeWidth="1.5" />
          <g transform="translate(1.6 1.65) scale(.95)">{eye}</g>
        </>
      ) : (
        <>
          {eye}
          <path d={ALMOND} fill="none" stroke={`url(#${id}g)`} strokeOpacity=".7" strokeWidth="1" />
        </>
      )}
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
        <span className={cn("font-display font-extrabold leading-none tracking-[0.015em]", s.text)}>
          <span className="brand-gradient-text">Leery</span>
        </span>
      )}
    </span>
  );
}
