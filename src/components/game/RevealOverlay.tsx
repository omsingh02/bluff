import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Trophy, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { playerById, rankOf, RANK_PLURAL } from "@/lib/game";
import { sfx } from "@/lib/sound";
import type { CardCode, PlayerView, RevealView, RoomView } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PlayingCard } from "./PlayingCard";
import { RankChip } from "./PhaseBanner";
import { revealTimeline } from "./revealTimeline";
import { useMediaQuery } from "./useMediaQuery";
import "./game.css";

interface FlipProps {
  code: CardCode;
  claimed: RevealView["rank"];
  unit: number;
  delay: number;
  reduced: boolean;
}

/** A card that arrives face-down, then flips to show what it really was (green = matches the claim, red = lie). */
function FlipCard({ code, claimed, unit, delay, reduced }: FlipProps) {
  const ok = rankOf(code) === claimed;
  const w = unit * 5;
  const h = unit * 7;
  const face = (
    <PlayingCard
      code={code}
      unit={unit}
      className={ok ? "ring-2 ring-trust shadow-glow-trust" : "ring-2 ring-bluff shadow-glow-bluff"}
    />
  );
  return (
    <div className="relative pb-9">
      <div style={{ perspective: 900, width: w, height: h }}>
        {reduced ? (
          <div className="relative" style={{ width: w, height: h }}>
            <motion.div className="absolute inset-0" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ delay, duration: 0.2 }}>
              <PlayingCard faceDown unit={unit} />
            </motion.div>
            <motion.div className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay, duration: 0.2 }}>
              {face}
            </motion.div>
          </div>
        ) : (
          <motion.div
            className="relative"
            style={{ width: w, height: h, transformStyle: "preserve-3d" }}
            initial={{ rotateY: 0, y: 30, opacity: 0 }}
            animate={{ rotateY: 180, y: 0, opacity: 1 }}
            transition={{
              y: { type: "spring", stiffness: 380, damping: 26 },
              opacity: { duration: 0.18 },
              rotateY: { delay, duration: 0.5, ease: [0.3, 1.1, 0.4, 1] },
            }}
          >
            <div className="absolute inset-0" style={{ backfaceVisibility: "hidden" }}>
              <PlayingCard faceDown unit={unit} />
            </div>
            <div className="absolute inset-0" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
              {face}
            </div>
          </motion.div>
        )}
      </div>
      <motion.span
        aria-hidden
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: delay + 0.42, type: "spring", stiffness: 500, damping: 20 }}
        className={cn(
          "absolute bottom-1 left-1/2 grid h-7 w-7 -translate-x-1/2 place-items-center rounded-full text-background",
          ok ? "bg-trust" : "bg-bluff",
        )}
      >
        {ok ? <Check className="h-4 w-4" strokeWidth={3.5} /> : <X className="h-4 w-4" strokeWidth={3.5} />}
      </motion.span>
    </div>
  );
}

function Body({ reveal, players, serverNow }: { reveal: RevealView; players: PlayerView[]; serverNow: () => number }) {
  const reduced = useReducedMotion() ?? false;
  const desktop = useMediaQuery("(min-width: 1024px)");
  // Fewer cards → bigger cards (4 × 5em must still fit a phone: 13em·5·4 + gaps ≈ 330px).
  const count = reveal.cards.length;
  const unit = desktop ? (count <= 3 ? 20 : 18) : count <= 2 ? 16 : count === 3 ? 15 : 13;
  const tl = useMemo(() => revealTimeline(reveal.cards.length), [reveal.cards.length]);

  // Joined mid-reveal? Compress the choreography so the verdict still lands before the server moves on.
  const [skip] = useState(() => Math.max(0, tl.result + 900 - Math.max(0, reveal.until - serverNow())));
  const at = (ms: number) => Math.max(0, ms - skip);

  const [stage, setStage] = useState(0); // 0 header · 1 claim + cards · 2 verdict · 3 consequence
  useEffect(() => {
    sfx.play("call");
    const timers = [
      setTimeout(() => setStage((s) => Math.max(s, 1)), at(tl.claim)),
      setTimeout(() => {
        setStage((s) => Math.max(s, 2));
        sfx.play(reveal.bluff ? "liar" : "honest");
      }, at(tl.verdict)),
      setTimeout(() => setStage((s) => Math.max(s, 3)), at(tl.result)),
    ];
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the choreography is planned once, at mount
  }, []);

  const caller = playerById(players, reveal.caller);
  const accused = playerById(players, reveal.accused);
  const picker = playerById(players, reveal.picker);
  const winner = playerById(players, reveal.winner);
  const n = reveal.cards.length;
  const flipDelay = (i: number) => (at(tl.flip0 + i * tl.stagger) - at(tl.claim)) / 1000;

  return (
    <>
      {/* colour wash when the verdict lands */}
      {stage >= 2 && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.55, 0.22] }}
          transition={{ duration: 0.8 }}
          style={{
            background: `radial-gradient(60% 45% at 50% 50%, hsl(var(${reveal.bluff ? "--bluff" : "--trust"}) / 0.45), transparent 70%)`,
          }}
        />
      )}

      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 26 }}
        className="relative flex items-center gap-3 sm:gap-4"
      >
        {caller && <Avatar name={caller.name} color={caller.color} bot={caller.bot} size={desktop ? 56 : 44} className="ring-2 ring-bluff/70" />}
        <div className="text-center">
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-bluff">Bluff called</div>
          <p className="font-display text-base font-bold leading-tight sm:text-xl lg:text-2xl">
            <span className="text-foreground">{caller?.name ?? "Someone"}</span> <span className="text-muted">calls bluff on</span>{" "}
            <span className="text-foreground">{accused?.name ?? "someone"}</span>!
          </p>
        </div>
        {accused && <Avatar name={accused.name} color={accused.color} bot={accused.bot} size={desktop ? 56 : 44} className="ring-2 ring-white/20" />}
      </motion.div>

      {stage >= 1 && (
        <>
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-wrap items-center justify-center gap-2 text-sm text-muted sm:text-base"
          >
            <span>{accused?.name ?? "They"} claimed</span>
            <b className="text-foreground">
              {n} × {RANK_PLURAL[reveal.rank]}
            </b>
            <RankChip rank={reveal.rank} size="sm" />
          </motion.p>

          <div data-testid="reveal-cards" className="flex flex-wrap items-start justify-center gap-2.5 sm:gap-4">
            {reveal.cards.map((code, i) => (
              <FlipCard key={code} code={code} claimed={reveal.rank} unit={unit} delay={flipDelay(i)} reduced={reduced} />
            ))}
          </div>
        </>
      )}

      {stage >= 2 && (
        <motion.div
          initial={reduced ? { opacity: 0 } : { scale: 2.6, rotate: -16, opacity: 0 }}
          animate={reduced ? { opacity: 1 } : { scale: 1, rotate: -5, opacity: 1 }}
          transition={{ type: "spring", stiffness: 380, damping: 17 }}
        >
          <motion.div
            data-testid="reveal-verdict"
            animate={reveal.bluff && !reduced ? { x: [0, -9, 9, -6, 6, 0] } : undefined}
            transition={{ delay: 0.22, duration: 0.45 }}
            className={cn(
              "rounded-2xl border-4 bg-background/70 px-6 py-1.5 font-display text-4xl font-extrabold uppercase tracking-wider text-glow sm:px-8 sm:text-5xl",
              reveal.bluff ? "border-bluff text-bluff shadow-glow-bluff" : "border-trust text-trust shadow-glow-trust",
            )}
          >
            {reveal.bluff ? "BLUFF!" : "HONEST"}
          </motion.div>
        </motion.div>
      )}

      {stage >= 3 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-2"
          data-testid="reveal-result"
        >
          <div className="flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm sm:text-base">
            {picker && <Avatar name={picker.name} color={picker.color} bot={picker.bot} size={28} />}
            <span>
              <b>{picker?.name ?? "Someone"}</b> picks up{" "}
              <b className="text-gold">
                {reveal.pickup} card{reveal.pickup === 1 ? "" : "s"}
              </b>
            </span>
          </div>
          {winner && (
            <p className="flex items-center gap-2 font-display text-sm font-bold text-gold sm:text-base">
              <Trophy className="h-4 w-4" aria-hidden /> {winner.name} played their last cards — wins!
            </p>
          )}
        </motion.div>
      )}
    </>
  );
}

/** Full-area overlay shown while the server holds the room in "reveal". Mounted/unmounted by the status, never by its own timer. */
export function RevealOverlay({ view, serverNow }: { view: RoomView; serverNow: () => number }) {
  const reveal = view.reveal;
  if (!reveal) return null;
  return (
    <motion.div
      data-testid="reveal-overlay"
      role="region"
      aria-label="Bluff called"
      className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 overflow-y-auto bg-background/90 px-4 py-6 backdrop-blur-md sm:gap-5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Body reveal={reveal} players={view.players} serverNow={serverNow} />
    </motion.div>
  );
}
