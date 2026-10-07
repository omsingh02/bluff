import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Check, Copy, Ellipsis, HelpCircle, LogOut, ScrollText, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { RulesDialog } from "@/components/shell/RulesDialog";
import { SoundToggle } from "@/components/shell/SoundToggle";
import type { RoomController } from "@/hooks/useRoom";
import { describeLog, RANK_PLURAL } from "@/lib/game";
import { sfx } from "@/lib/sound";
import type { CardCode, RoomView } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ActionBar } from "./ActionBar";
import { FlyLayer, type Flight, type Point } from "./FlyLayer";
import { GameLog } from "./GameLog";
import { Hand } from "./Hand";
import { MyBar } from "./MyBar";
import { myNextTurn } from "./myNext";
import { RevealOverlay } from "./RevealOverlay";
import { revealTimeline } from "./revealTimeline";
import { Table } from "./Table";
import { useMediaQuery } from "./useMediaQuery";
import "./game.css";

const PLAYABLE = new Set(["turn", "challenge", "reveal"]);

function centerOf(el: Element | null | undefined, topBias = false): Point | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { x: r.left + r.width / 2, y: topBias ? r.top + Math.min(40, r.height / 2) : r.top + r.height / 2 };
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

const headerButton =
  "grid h-10 w-10 place-items-center rounded-full text-muted transition-colors hover:bg-white/10 hover:text-foreground";

/** ⋯ menu: a tiny accessible popover (Esc / outside click closes). */
function HeaderMenu({ onRules, onLeave }: { onRules: () => void; onLeave: () => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    wrapRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-white/10 focus-visible:bg-white/10";

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={btnRef}
        type="button"
        data-testid="game-menu"
        aria-label="Menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={headerButton}
      >
        <Ellipsis className="h-5 w-5" aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          className="glass-strong absolute right-0 top-full z-50 mt-2 w-52 rounded-2xl p-1.5 shadow-2xl animate-in fade-in-0 zoom-in-95"
        >
          <button
            role="menuitem"
            type="button"
            data-testid="menu-rules"
            className={item}
            onClick={() => {
              setOpen(false);
              onRules();
            }}
          >
            <HelpCircle className="h-4 w-4 text-primary" aria-hidden /> How to play
          </button>
          <button
            role="menuitem"
            type="button"
            data-testid="leave-game-menu"
            className={cn(item, "text-rose-300")}
            onClick={() => {
              setOpen(false);
              onLeave();
            }}
          >
            <LogOut className="h-4 w-4" aria-hidden /> Leave game
          </button>
        </div>
      )}
    </div>
  );
}

function GameScreenInner({ room, view }: { room: RoomController; view: RoomView }) {
  const navigate = useNavigate();
  const { me } = view;
  const short = useMediaQuery("(max-height: 700px)");

  const [selected, setSelected] = useState<CardCode[]>([]);
  const [limitHits, setLimitHits] = useState(0);
  const [logOpen, setLogOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [flights, setFlights] = useState<Flight[]>([]);

  const pileRef = useRef<HTMLDivElement>(null);
  const handWrapRef = useRef<HTMLDivElement>(null);
  const seatEls = useRef(new Map<string, HTMLElement>());
  const flightId = useRef(0);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(view);
  useEffect(() => {
    latest.current = view;
  });
  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  const registerSeat = useCallback((id: string, el: HTMLElement | null) => {
    if (el) seatEls.current.set(id, el);
    else seatEls.current.delete(id);
  }, []);

  const launch = useCallback((f: Omit<Flight, "id">) => {
    setFlights((cur) => [...cur, { ...f, id: ++flightId.current }]);
  }, []);
  const endFlight = useCallback((id: number) => setFlights((cur) => cur.filter((f) => f.id !== id)), []);

  // ---- selection (lives here so it survives phase changes; pruned against the real hand) -------------
  useEffect(() => {
    setSelected((prev) => {
      const next = prev.filter((c) => me.hand.includes(c));
      return next.length === prev.length ? prev : next;
    });
  }, [me.hand]);

  const toggleCard = useCallback((code: CardCode) => {
    setSelected((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }, []);
  const onLimit = useCallback(() => setLimitHits((h) => h + 1), []);

  const handlePlay = useCallback(async () => {
    if (selected.length === 0) return;
    const ok = await room.play(selected);
    if (ok) setSelected([]);
  }, [room, selected]);

  // ---- "it just became my turn" -----------------------------------------------------------------------
  const myTurn = view.status === "turn" && view.turn?.player === me.id;
  const wasMyTurn = useRef(myTurn);
  useEffect(() => {
    if (myTurn && !wasMyTurn.current) {
      sfx.play("turn");
      navigator.vibrate?.(60);
    }
    wasMyTurn.current = myTurn;
  }, [myTurn]);

  useEffect(() => {
    const previous = document.title;
    document.title = myTurn ? "▶ Your turn · Leery" : `Leery · ${view.code}`;
    return () => {
      document.title = previous;
    };
  }, [myTurn, view.code]);

  // ---- new plays: thud + cards flying to the pile ------------------------------------------------------
  const lastLogN = useRef(view.log.length ? view.log[view.log.length - 1].n : 0);
  useEffect(() => {
    const fresh = view.log.filter((e) => e.n > lastLogN.current);
    if (fresh.length === 0) return;
    lastLogN.current = fresh[fresh.length - 1].n;
    for (const e of fresh.slice(-2)) {
      if (e.k !== "play" || !e.p) continue;
      sfx.play("play");
      const to = centerOf(pileRef.current);
      const mine = e.p === me.id;
      const from = mine ? centerOf(handWrapRef.current, true) : centerOf(seatEls.current.get(e.p));
      if (from && to) launch({ from, to, count: e.c ?? 1, unit: mine ? 9 : 6 });
    }
  }, [view.log, me.id, launch]);

  // ---- after a reveal: the pile flies to whoever has to pick it up -------------------------------------
  const revealKey = view.status === "reveal" && view.reveal ? view.reveal.until : null;
  useEffect(() => {
    if (revealKey == null) return;
    const t = setTimeout(() => {
      const v = latest.current;
      const rv = v.reveal;
      if (!rv) return;
      const from = centerOf(pileRef.current);
      const to = rv.picker === v.me.id ? centerOf(handWrapRef.current, true) : centerOf(seatEls.current.get(rv.picker));
      if (from && to) launch({ from, to, count: Math.min(rv.pickup, 4), unit: 7 });
    }, revealTimeline(view.reveal?.cards.length ?? 1).result + 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the reveal's end time only; the rest is read via `latest`
  }, [revealKey, launch]);

  // ---- header actions ----------------------------------------------------------------------------------
  const copyInvite = async () => {
    const ok = await copyText(`${window.location.origin}/r/${view.code}`);
    if (!ok) return;
    setCopied(true);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 1600);
  };

  const confirmLeave = async () => {
    setLeaving(true);
    const ok = await room.leave();
    setLeaving(false);
    if (ok) navigate("/");
  };

  const next = myNextTurn(view);
  const latestLog = view.log.length ? view.log[view.log.length - 1] : null;

  return (
    <div data-testid="game-screen" className="relative mx-auto flex h-dvh min-h-[520px] w-full flex-col overflow-hidden">
      <header className="safe-pt relative z-40 flex shrink-0 items-center gap-1.5 px-3 pb-1 pt-1 lg:px-6">
        <button
          type="button"
          data-testid="game-room-code"
          onClick={() => void copyInvite()}
          aria-label={`Room ${view.code}. Copy invite link`}
          className="glass flex h-9 items-center gap-2 rounded-full pl-3.5 pr-3 text-sm transition-colors hover:bg-white/10"
        >
          <span className="font-display text-[13px] font-bold tracking-[0.2em]">{view.code}</span>
          {copied ? <Check className="h-3.5 w-3.5 text-trust" aria-hidden /> : <Copy className="h-3.5 w-3.5 text-muted" aria-hidden />}
          <span className="sr-only">{copied ? "Invite link copied" : ""}</span>
        </button>
        {room.connection === "offline" && (
          <span
            role="status"
            data-testid="offline-pill"
            className="flex items-center gap-1.5 rounded-full bg-amber-400/15 px-2.5 py-1 text-[11px] font-semibold text-amber-300"
          >
            <WifiOff className="h-3 w-3" aria-hidden /> Reconnecting…
          </span>
        )}
        <div className="ml-auto flex items-center">
          <SoundToggle />
          <button type="button" data-testid="game-log-toggle" aria-label="Game log" onClick={() => setLogOpen(true)} className={headerButton}>
            <ScrollText className="h-5 w-5" aria-hidden />
          </button>
          <HeaderMenu onRules={() => setRulesOpen(true)} onLeave={() => setLeaveOpen(true)} />
        </div>
      </header>

      <main className="relative flex min-h-0 flex-1 flex-col">
        <Table view={view} serverNow={room.serverNow} pileRef={pileRef} registerSeat={registerSeat}>
          <div className="shrink-0">
            <MyBar view={view} />
            <div ref={handWrapRef} className="mx-auto w-full max-w-[1100px] px-3 lg:px-0">
              <Hand
                cards={me.hand}
                selected={selected}
                onToggle={toggleCard}
                requiredRank={next?.rank ?? null}
                interactive={view.status !== "reveal"}
                onLimit={onLimit}
                compact={short}
              />
            </div>
            <ActionBar room={room} view={view} selected={selected} onPlay={() => void handlePlay()} onSelectMany={setSelected} limitHits={limitHits} compact={short} />
          </div>
        </Table>

        <AnimatePresence>
          {view.status === "reveal" && view.reveal && <RevealOverlay key={`reveal-${view.reveal.until}`} view={view} serverNow={room.serverNow} />}
        </AnimatePresence>
      </main>

      <FlyLayer flights={flights} onDone={endFlight} />
      <GameLog open={logOpen} onOpenChange={setLogOpen} log={view.log} />
      <RulesDialog open={rulesOpen} onOpenChange={setRulesOpen} />

      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DialogContent title="Leave this game?" description="A bot will take over your cards and the game goes on without you.">
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setLeaveOpen(false)}>
              Stay
            </Button>
            <Button variant="bluff" className="flex-1" data-testid="leave-game-confirm" loading={leaving} onClick={() => void confirmLeave()}>
              Leave game
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Screen-reader announcements: newest log line + "your turn". */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {latestLog ? describeLog(latestLog).text : ""}
      </div>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {myTurn && view.turn ? `Your turn. Play ${RANK_PLURAL[view.turn.rank]}.` : ""}
      </div>
    </div>
  );
}

/** The in-game screen for `turn | challenge | reveal`. Renders nothing for other statuses. */
export function GameScreen({ room }: { room: RoomController }) {
  const view = room.view;
  if (!view || !PLAYABLE.has(view.status)) return null;
  return <GameScreenInner room={room} view={view} />;
}
