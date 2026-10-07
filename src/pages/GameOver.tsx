import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Crown, LogOut, RotateCcw, Trophy } from "lucide-react";
import { Badge } from "@/components/shell/Badge";
import { WaitingDots } from "@/components/shell/WaitingDots";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { RoomController } from "@/hooks/useRoom";
import { playerById } from "@/lib/game";
import { sfx } from "@/lib/sound";
import type { RoomView } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useDocumentTitle } from "./helpers";

const spring = { type: "spring" as const, stiffness: 380, damping: 28 };

/** Small deterministic PRNG so the confetti layout is stable across re-renders / StrictMode. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash = (s: string) => Array.from(s).reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

const CONFETTI = ["#fbbf24", "#f472b6", "#8b5cf6", "#2dd4bf", "#f87171", "#fde68a", "#a5b4fc"];

/** One-shot confetti burst from just above centre — pure framer-motion, no libraries. */
function Confetti({ count, seed }: { count: number; seed: number }) {
  const pieces = useMemo(() => {
    const rnd = mulberry32(seed);
    return Array.from({ length: count }, (_, i) => {
      const angle = -Math.PI * (0.08 + rnd() * 0.84); // fan out across the upper half-circle
      const speed = 130 + rnd() * 300;
      const size = 6 + rnd() * 7;
      const round = rnd() > 0.6;
      return {
        i,
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed,
        fall: 280 + rnd() * 380,
        rot: (rnd() - 0.5) * 1000,
        w: size,
        h: round ? size : size * 0.5,
        round,
        color: CONFETTI[i % CONFETTI.length],
        delay: rnd() * 0.22,
        dur: 2 + rnd() * 1.2,
      };
    });
  }, [count, seed]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-10 overflow-hidden">
      <div className="absolute left-1/2 top-[24%]">
        {pieces.map((p) => (
          <motion.span
            key={p.i}
            className="absolute block"
            style={{ width: p.w, height: p.h, background: p.color, borderRadius: p.round ? "50%" : 2 }}
            initial={{ x: 0, y: 0, opacity: 0, rotate: 0 }}
            animate={{ x: [0, p.dx, p.dx * 1.15], y: [0, p.dy, p.dy + p.fall], opacity: [0, 1, 0], rotate: p.rot }}
            transition={{ duration: p.dur, delay: p.delay, times: [0, 0.35, 1], ease: "easeOut" }}
          />
        ))}
      </div>
    </div>
  );
}

const cardsLeft = (n: number) => (n === 0 ? "Cleared" : `${n} card${n === 1 ? "" : "s"} left`);

export function GameOver({ room, view }: { room: RoomController; view: RoomView }) {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [rematching, setRematching] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const { players, me, winner: winnerId } = view;
  const winner = playerById(players, winnerId);
  const iWon = winnerId === me.id;
  const host = players.find((p) => p.host);

  // Winner first, then fewest cards left (ties by seat).
  const standings = useMemo(
    () =>
      [...players].sort((a, b) => {
        if (a.id === winnerId) return -1;
        if (b.id === winnerId) return 1;
        return a.cards - b.cards || a.seat - b.seat;
      }),
    [players, winnerId],
  );
  /** Competition ranking: equal card counts share a place; the winner is always 1st. */
  const placeOf = (id: string, cards: number) =>
    id === winnerId ? 1 : 2 + players.filter((o) => o.id !== winnerId && o.cards < cards).length;
  const myPlace = placeOf(me.id, players.find((p) => p.id === me.id)?.cards ?? 0);

  useDocumentTitle(iWon ? "You won! · Leery" : `${winner?.name ?? "Someone"} won · Leery`);

  const sounded = useRef(false);
  useEffect(() => {
    if (sounded.current) return;
    sounded.current = true;
    sfx.play(iWon ? "win" : "lose");
  }, [iWon]);

  async function rematch() {
    if (rematching) return;
    setRematching(true);
    const ok = await room.rematch();
    if (!ok) setRematching(false); // on success the lobby replaces this screen
  }

  async function leave() {
    if (leaving) return;
    setLeaving(true);
    const ok = await room.leave();
    if (ok) navigate("/");
    else setLeaving(false);
  }

  const headline = iWon ? "You win!" : `${winner?.name ?? "Someone"} wins!`;
  const subline = iWon
    ? "You cleared your hand. Smooth liar."
    : `You finished #${myPlace} with ${cardsLeft(players.find((p) => p.id === me.id)?.cards ?? 0).toLowerCase()}.`;

  return (
    <main
      data-testid="game-over"
      className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center px-4 py-8 safe-pt safe-pb"
    >
      {!reduceMotion && <Confetti count={iWon ? 54 : 18} seed={hash(view.code)} />}

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.05 }}
        className="relative z-20 w-full text-center"
      >
        <div className="relative mx-auto grid h-32 w-32 place-items-center">
          <div aria-hidden className="absolute inset-2 rounded-full bg-gold/35 blur-2xl motion-safe:animate-pulse" />
          <div aria-hidden className="absolute inset-0 rounded-full border border-gold/30 motion-safe:animate-ring-pulse" />
          <motion.div
            initial={{ scale: 0, rotate: -25 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.15 }}
            className="relative"
          >
            {winner ? (
              <Avatar name={winner.name} color={winner.color} bot={winner.bot} size={96} className="ring-4 ring-gold/70">
                <Crown
                  className="absolute -top-7 left-1/2 h-9 w-9 -translate-x-1/2 -rotate-6 fill-gold text-gold drop-shadow-[0_0_12px_hsl(var(--gold))]"
                  aria-hidden
                />
              </Avatar>
            ) : (
              <Trophy className="h-20 w-20 text-gold" aria-hidden />
            )}
          </motion.div>
        </div>

        <p className="mt-7 text-xs font-semibold uppercase tracking-[0.28em] text-gold">{iWon ? "Victory" : "Game over"}</p>
        <h1
          data-testid="winner-name"
          className="mt-1.5 break-words font-display text-[2.4rem] font-black leading-[1.05] tracking-tight sm:text-5xl"
        >
          <span className="bg-gradient-to-b from-amber-100 via-gold to-amber-500 bg-clip-text text-transparent drop-shadow-[0_0_26px_hsl(var(--gold)/0.45)]">
            {headline}
          </span>
        </h1>
        <p className="mt-2 text-sm text-muted">{subline}</p>
      </motion.div>

      <motion.section
        aria-labelledby="standings-heading"
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.22 }}
        className="glass relative z-20 mt-7 w-full rounded-3xl p-4"
      >
        <h2 id="standings-heading" className="mb-2.5 px-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
          Final standings
        </h2>
        <ol data-testid="standings" className="space-y-1.5">
          {standings.map((p, i) => {
            const isWinner = p.id === winnerId;
            return (
              <motion.li
                key={p.id}
                data-testid={`standing-${p.id}`}
                initial={{ opacity: 0, x: -14 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...spring, delay: 0.3 + i * 0.06 }}
                className={cn(
                  "flex h-[52px] items-center gap-3 rounded-2xl border px-3",
                  isWinner ? "border-gold/40 bg-gold/[0.08]" : p.id === me.id ? "border-primary/35 bg-white/[0.04]" : "border-white/[0.06] bg-white/[0.03]",
                )}
              >
                <span
                  className={cn(
                    "grid h-7 w-7 shrink-0 place-items-center rounded-full font-display text-xs font-bold",
                    isWinner ? "bg-gold text-ink" : "bg-white/10 text-muted",
                  )}
                  aria-label={`Place ${placeOf(p.id, p.cards)}`}
                >
                  {isWinner ? <Trophy className="h-3.5 w-3.5" aria-hidden /> : placeOf(p.id, p.cards)}
                </span>
                <Avatar name={p.name} color={p.color} bot={p.bot} size={34} />
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span className="truncate font-semibold">{p.name}</span>
                  {p.id === me.id && <Badge tone="primary">You</Badge>}
                  {p.left && <Badge>Left</Badge>}
                </div>
                <span className={cn("shrink-0 text-sm tabular-nums", isWinner ? "font-semibold text-gold" : "text-muted")}>
                  {cardsLeft(p.cards)}
                </span>
              </motion.li>
            );
          })}
        </ol>
      </motion.section>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.4 }}
        className="relative z-20 mt-6 flex w-full flex-col gap-2.5"
      >
        {me.host ? (
          <Button variant="gold" size="xl" className="w-full" data-testid="rematch" loading={rematching} onClick={() => void rematch()}>
            <RotateCcw className="h-5 w-5" aria-hidden />
            Play again
          </Button>
        ) : (
          <p
            role="status"
            data-testid="waiting-rematch"
            className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-center text-sm"
          >
            Waiting for <strong className="font-semibold text-gold">{host?.name ?? "the host"}</strong> to start another round{" "}
            <WaitingDots className="ml-0.5 inline-flex items-center gap-1 align-middle text-muted" />
          </p>
        )}
        <Button variant="ghost" className="w-full" data-testid="leave-game" loading={leaving} onClick={() => void leave()}>
          <LogOut className="h-4 w-4" aria-hidden />
          Leave
        </Button>
      </motion.div>
    </main>
  );
}
