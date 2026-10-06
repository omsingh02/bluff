import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { rankOf } from "@/lib/game";
import { sfx } from "@/lib/sound";
import type { CardCode, Rank } from "@/lib/types";
import { cn } from "@/lib/utils";
import { layoutHand, LIFT_ROOM } from "./handLayout";
import { PlayingCard } from "./PlayingCard";
import "./game.css";

interface HandProps {
  /** My cards, already sorted. */
  cards: readonly CardCode[];
  /** Currently selected card codes. */
  selected: readonly CardCode[];
  onToggle: (code: CardCode) => void;
  /** Cards of this rank get a small gold marker (the honest-play hint). */
  requiredRank?: Rank | null;
  /** false → cards are shown but can't be toggled (e.g. during a reveal). */
  interactive?: boolean;
  maxSelect?: number;
  /** Called when the player tries to select more than `maxSelect` cards. */
  onLimit?: () => void;
  /** Short viewport: smaller cards so everything still fits without scrolling. */
  compact?: boolean;
  className?: string;
}

interface HandCardProps {
  code: CardCode;
  index: number;
  x: number;
  y: number;
  cardW: number;
  cardH: number;
  unit: number;
  selected: boolean;
  highlighted: boolean;
  interactive: boolean;
  shaking: boolean;
  tabbable: boolean;
  onToggle: (code: CardCode) => void;
  onFocusIndex: (index: number) => void;
  onKey: (e: KeyboardEvent<HTMLButtonElement>, index: number) => void;
  register: (code: CardCode, el: HTMLElement | null) => void;
}

/** One card in the fan. Memoised so selecting a card only re-renders that card. */
const HandCard = memo(function HandCard(p: HandCardProps) {
  const { code, index, register } = p;
  return (
    <div
      className="absolute left-0 top-0"
      style={{
        width: p.cardW,
        height: p.cardH,
        zIndex: index + 1,
        transform: `translate(${p.x}px, ${p.y + LIFT_ROOM}px)`,
        transition: "transform 300ms cubic-bezier(.22,1,.36,1)",
      }}
    >
      {/* Three wrappers so the mount pop-in, the limit shake and the selection lift never fight over `transform`. */}
      <div className="animate-pop-in" style={{ animationDelay: `${Math.min(index * 16, 360)}ms` }}>
        <div className={p.shaking ? "animate-shake" : undefined}>
          <PlayingCard
            ref={(el) => register(code, el)}
            code={code}
            unit={p.unit}
            selected={p.selected}
            highlighted={p.highlighted}
            disabled={!p.interactive}
            tabIndex={p.tabbable ? 0 : -1}
            onClick={() => p.onToggle(code)}
            onFocus={() => p.onFocusIndex(index)}
            onKeyDown={(e) => p.onKey(e, index)}
          />
        </div>
      </div>
    </div>
  );
});

/**
 * My hand as an overlapping fan that fits its container: 1–3 rows, each row's overlap computed to
 * span the row exactly, so even 30+ cards stay tappable on a phone. Cards are absolutely positioned
 * with stable keys, so the fan re-flows smoothly instead of re-mounting when the hand changes.
 */
export const Hand = memo(function Hand({
  cards,
  selected,
  onToggle,
  requiredRank = null,
  interactive = true,
  maxSelect = 4,
  onLimit,
  compact = false,
  className,
}: HandProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<CardCode, HTMLElement>());
  const [width, setWidth] = useState(0);
  const [focusIdx, setFocusIdx] = useState(0);
  const [shaking, setShaking] = useState<CardCode | null>(null);
  const shakeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => () => clearTimeout(shakeTimer.current), []);

  const sel = useMemo(() => new Set(selected), [selected]);
  const layout = useMemo(() => (width > 0 ? layoutHand(cards.length, width, compact) : null), [cards.length, width, compact]);
  const activeIdx = Math.min(focusIdx, Math.max(0, cards.length - 1));

  // Latest values behind stable callbacks, so memoised cards don't re-render when they change.
  const latest = useRef({ sel, interactive, maxSelect, onLimit, onToggle, cards, layout });
  useEffect(() => {
    latest.current = { sel, interactive, maxSelect, onLimit, onToggle, cards, layout };
  });

  const toggle = useCallback((code: CardCode) => {
    const s = latest.current;
    if (!s.interactive) return;
    if (!s.sel.has(code) && s.sel.size >= s.maxSelect) {
      s.onLimit?.();
      setShaking(code);
      clearTimeout(shakeTimer.current);
      shakeTimer.current = setTimeout(() => setShaking(null), 450);
      return;
    }
    sfx.play("select");
    s.onToggle(code);
  }, []);

  const register = useCallback((code: CardCode, el: HTMLElement | null) => {
    if (el) cardRefs.current.set(code, el);
    else cardRefs.current.delete(code);
  }, []);

  const onKey = useCallback((e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const { layout: l, cards: list } = latest.current;
    if (!l) return;
    const focusAt = (target: number) => {
      const idx = Math.max(0, Math.min(list.length - 1, target));
      setFocusIdx(idx);
      cardRefs.current.get(list[idx])?.focus();
    };
    const row = l.rowOf[i];
    const col = i - l.rowStarts[row];
    const toRow = (r: number) => {
      if (r < 0 || r >= l.rowStarts.length) return i;
      const start = l.rowStarts[r];
      const end = r + 1 < l.rowStarts.length ? l.rowStarts[r + 1] : list.length;
      return Math.min(end - 1, start + col);
    };
    switch (e.key) {
      case "ArrowRight": e.preventDefault(); focusAt(i + 1); break;
      case "ArrowLeft": e.preventDefault(); focusAt(i - 1); break;
      case "ArrowUp": e.preventDefault(); focusAt(toRow(row - 1)); break;
      case "ArrowDown": e.preventDefault(); focusAt(toRow(row + 1)); break;
      case "Home": e.preventDefault(); focusAt(0); break;
      case "End": e.preventDefault(); focusAt(list.length - 1); break;
      default: break;
    }
  }, []);

  return (
    <div
      ref={wrapRef}
      data-testid="hand"
      role="group"
      aria-label={`Your hand, ${cards.length} card${cards.length === 1 ? "" : "s"}`}
      className={cn("relative w-full", className)}
      style={{ height: layout ? layout.height + LIFT_ROOM : LIFT_ROOM + (compact ? 64 : 80) }}
    >
      {layout &&
        cards.map((code, i) => (
          <HandCard
            key={code}
            code={code}
            index={i}
            x={layout.positions[i].x}
            y={layout.positions[i].y}
            cardW={layout.cardW}
            cardH={layout.cardH}
            unit={layout.unit}
            selected={sel.has(code)}
            highlighted={requiredRank != null && rankOf(code) === requiredRank}
            interactive={interactive}
            shaking={shaking === code}
            tabbable={i === activeIdx}
            onToggle={toggle}
            onFocusIndex={setFocusIdx}
            onKey={onKey}
            register={register}
          />
        ))}
    </div>
  );
});
