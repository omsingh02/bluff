import { forwardRef, memo, type CSSProperties } from "react";
import { motion } from "framer-motion";
import { Check, Crown, WifiOff } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useCountdown } from "@/hooks/useServerNow";
import { BOT_STYLES } from "@/lib/game";
import type { PlayerView } from "@/lib/types";
import { clamp, cn } from "@/lib/utils";
import { PlayingCard } from "./PlayingCard";
import "./game.css";

export type SeatVariant = "mini" | "compact" | "default" | "large";
export type SeatRole = "accused" | "caller" | "picker" | null;

export interface SeatProps {
  player: PlayerView;
  serverNow: () => number;
  variant?: SeatVariant;
  /** It's this player's turn to play. */
  active?: boolean;
  /** Server time the turn started (for the countdown ring's total). */
  turnSince?: number;
  /** Human turn timer deadline. null/undefined while `active` → a bot/autopilot is "thinking". */
  deadline?: number | null;
  role?: SeatRole;
  /** Accepted the pending play. */
  accepted?: boolean;
  /** Short caption under the name, e.g. "played ×2". */
  tag?: string | null;
  className?: string;
  style?: CSSProperties;
}

const DIM = {
  mini: { avatar: 32, fan: 0, width: 66, name: "text-[11px]" },
  compact: { avatar: 34, fan: 3.4, width: 74, name: "text-[11px]" },
  default: { avatar: 42, fan: 4.2, width: 92, name: "text-xs" },
  large: { avatar: 54, fan: 5.2, width: 124, name: "text-sm" },
} as const;

/** Circular countdown around the avatar — only mounted while a human's turn timer is running. */
function TimerRing({ since, deadline, serverNow, size }: { since: number; deadline: number; serverNow: () => number; size: number }) {
  const { remainingMs } = useCountdown(deadline, { serverNow }, 120);
  const left = remainingMs ?? 0;
  const frac = clamp(left / Math.max(1000, deadline - since), 0, 1);
  const r = size / 2 + 4;
  const c = 2 * Math.PI * r;
  const low = left < 8000 || frac < 0.2;
  const box = (r + 3) * 2;
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2"
      width={box}
      height={box}
      viewBox={`0 0 ${box} ${box}`}
      style={{ transform: "translate(-50%, -50%) rotate(-90deg)" }}
    >
      <circle cx={box / 2} cy={box / 2} r={r} fill="none" stroke="hsl(0 0% 100% / 0.12)" strokeWidth={3} />
      <circle
        cx={box / 2}
        cy={box / 2}
        r={r}
        fill="none"
        stroke={low ? "hsl(var(--bluff))" : "hsl(var(--gold))"}
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - frac)}
      />
    </svg>
  );
}

function MiniFan({ count, unit }: { count: number; unit: number }) {
  const n = Math.min(3, count);
  const w = unit * 5;
  const h = unit * 7;
  if (n === 0) {
    return <span aria-hidden className="inline-block rounded-[3px] border border-dashed border-white/25" style={{ width: w, height: h }} />;
  }
  const step = w * 0.45;
  return (
    <span aria-hidden className="relative inline-block" style={{ width: w + (n - 1) * step, height: h }}>
      {Array.from({ length: n }, (_, i) => (
        <span
          key={i}
          className="absolute top-0"
          style={{ left: i * step, transform: `rotate(${(i - (n - 1) / 2) * 10}deg)`, transformOrigin: "50% 100%" }}
        >
          <PlayingCard faceDown unit={unit} />
        </span>
      ))}
    </span>
  );
}

const ROLE_TAG: Record<NonNullable<SeatRole>, string> = {
  accused: "bg-bluff/15 text-rose-200",
  caller: "bg-bluff/25 text-rose-100",
  picker: "bg-gold/20 text-gold",
};

/** An opponent at the table. */
export const Seat = memo(
  forwardRef<HTMLDivElement, SeatProps>(function Seat(
    { player, serverNow, variant = "default", active, turnSince, deadline, role = null, accepted, tag, className, style },
    ref,
  ) {
    const d = DIM[variant];
    const offline = !player.online && !player.bot;
    const thinking = active && deadline == null;

    const ring = active
      ? "ring-2 ring-gold"
      : role === "accused"
        ? "ring-2 ring-bluff shadow-[0_0_16px_hsl(var(--bluff)/0.5)]"
        : role === "caller"
          ? "ring-2 ring-bluff/70"
          : role === "picker"
            ? "ring-2 ring-gold/80"
            : "ring-1 ring-white/10";

    const label = [
      player.name,
      player.bot ? "bot" : null,
      `${player.cards} card${player.cards === 1 ? "" : "s"}`,
      active ? "playing now" : null,
      player.auto ? "on autopilot" : null,
      player.left ? "left the game" : null,
      offline ? "offline" : null,
    ]
      .filter(Boolean)
      .join(", ");

    return (
      <div
        ref={ref}
        data-testid={`seat-${player.id}`}
        role="group"
        aria-label={label}
        className={cn(
          "relative flex flex-col items-center gap-1 text-center transition-opacity",
          offline && (active ? "opacity-85" : "opacity-60"),
          player.left && "opacity-70",
          className,
        )}
        style={{ width: d.width, ...style }}
      >
        <div className="relative rounded-full" style={{ width: d.avatar, height: d.avatar }}>
          {active && <span aria-hidden className="absolute inset-0 rounded-full animate-ring-pulse" />}
          {active && <span aria-hidden className="leery-breathe absolute -inset-3 rounded-full bg-gold/25 blur-xl" />}
          <Avatar name={player.name} color={player.color} bot={player.bot} size={d.avatar} className={cn("transition-shadow", ring)} />
          {active && deadline != null && turnSince != null && (
            <TimerRing since={turnSince} deadline={deadline} serverNow={serverNow} size={d.avatar} />
          )}
          {player.host && (
            <span aria-hidden className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-background ring-1 ring-gold/60">
              <Crown className="h-2.5 w-2.5 text-gold" />
            </span>
          )}
          {accepted && (
            <span aria-hidden className="absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-trust text-ink ring-2 ring-background">
              <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
            </span>
          )}
          {offline && (
            <span aria-hidden className="absolute -left-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-background ring-1 ring-white/20">
              <WifiOff className="h-2.5 w-2.5 text-amber-300" />
            </span>
          )}
        </div>

        <span className={cn("max-w-full truncate font-semibold leading-tight", d.name, active ? "text-gold" : "text-foreground")} title={player.name}>
          {player.name}
        </span>

        <div className="flex items-center gap-1.5" aria-hidden>
          {d.fan > 0 && <MiniFan count={player.cards} unit={d.fan} />}
          <motion.span
            key={player.cards}
            data-testid={`seat-cards-${player.id}`}
            initial={{ scale: 1.4 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 22 }}
            className="min-w-[1.5rem] rounded-full bg-black/45 px-1.5 py-px text-[11px] font-bold tabular-nums text-foreground"
          >
            {player.cards}
          </motion.span>
        </div>

        <div className="flex min-h-[18px] flex-wrap items-center justify-center gap-1" aria-hidden>
          {thinking ? (
            <span className="inline-flex items-center gap-[3px] text-gold" title="Thinking…">
              <i className="leery-dot" />
              <i className="leery-dot" />
              <i className="leery-dot" />
            </span>
          ) : tag ? (
            <span className={cn("whitespace-nowrap rounded-full px-1.5 py-px text-[10px] font-bold uppercase tracking-wide", role ? ROLE_TAG[role] : "bg-white/10 text-muted")}>
              {tag}
            </span>
          ) : null}
          {player.bot && (
            <span
              className="rounded-full bg-primary/20 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-violet-200"
              title={player.style ? `${BOT_STYLES[player.style].label}: ${BOT_STYLES[player.style].blurb}` : "Bot"}
            >
              Bot{variant === "large" && player.style ? ` · ${BOT_STYLES[player.style].label}` : ""}
            </span>
          )}
          {player.auto && !player.bot && (
            <span className="rounded-full bg-gold/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-gold">Auto</span>
          )}
          {player.left && (
            <span className="rounded-full bg-white/10 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-muted">Left</span>
          )}
        </div>
      </div>
    );
  }),
);
