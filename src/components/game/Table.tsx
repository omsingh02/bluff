import { useMemo, type CSSProperties, type ReactNode, type Ref } from "react";
import { opponentsInOrder } from "@/lib/game";
import type { PlayerView, RoomView } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PhaseBanner } from "./PhaseBanner";
import { Pile } from "./Pile";
import { Seat, type SeatRole, type SeatVariant } from "./Seat";
import { arcPositions } from "./seatLayout";
import { useMediaQuery } from "./useMediaQuery";
import "./game.css";

interface TableProps {
  view: RoomView;
  serverNow: () => number;
  /** Attached to the pile so the screen can animate cards flying to it. */
  pileRef: Ref<HTMLDivElement>;
  /** Lets the screen find a seat's DOM node (for flying-card animations). */
  registerSeat: (id: string, el: HTMLElement | null) => void;
  /** Rendered below the felt: my bar, hand and actions. */
  children?: ReactNode;
}

interface SeatState {
  active: boolean;
  role: SeatRole;
  tag: string | null;
  accepted: boolean;
}

/** What each opponent is doing right now, derived from the current phase. */
function seatState(view: RoomView, p: PlayerView): SeatState {
  const { status, turn, challenge, reveal } = view;
  let role: SeatRole = null;
  let tag: string | null = null;

  if (status === "challenge" && challenge?.by === p.id) {
    role = "accused";
    tag = `played ×${challenge.count}`;
  }
  if (status === "reveal" && reveal) {
    if (reveal.caller === p.id) {
      role = "caller";
      tag = "called bluff";
    } else if (reveal.accused === p.id) {
      role = "accused";
      tag = "accused";
    }
    if (reveal.picker === p.id) {
      role = "picker";
      tag = `picks up ${reveal.pickup}`;
    }
  }
  return {
    active: status === "turn" && turn?.player === p.id,
    role,
    tag,
    accepted: status === "challenge" && !!challenge?.passed.includes(p.id),
  };
}

/**
 * The table: opponents around the top, the felt in the middle with the pile and the phase banner,
 * and (via `children`) my own bar, hand and actions underneath.
 * Phones: opponents wrap in a rail above the felt. ≥ lg: they sit on an arc around the felt.
 */
export function Table({ view, serverNow, pileRef, registerSeat, children }: TableProps) {
  const desktop = useMediaQuery("(min-width: 1024px)");
  const short = useMediaQuery("(max-height: 700px)");
  const opponents = useMemo(() => opponentsInOrder(view.players, view.me.id), [view.players, view.me.id]);
  const n = opponents.length;

  const arcLayout = desktop && !short;
  const variant: SeatVariant = short
    ? "mini"
    : arcLayout
      ? n >= 6 ? "compact" : n >= 5 ? "default" : "large"
      : n >= 5 ? "compact" : "default";
  const turnSince = view.status === "turn" ? view.turn?.since : undefined;
  const turnDeadline = view.status === "turn" ? (view.turn?.deadline ?? null) : null;

  const renderSeat = (p: PlayerView, style?: CSSProperties) => {
    const st = seatState(view, p);
    return (
      <Seat
        key={p.id}
        ref={(el) => registerSeat(p.id, el)}
        player={p}
        serverNow={serverNow}
        variant={variant}
        active={st.active}
        turnSince={turnSince}
        deadline={st.active ? turnDeadline : null}
        role={st.role}
        accepted={st.accepted}
        tag={st.tag}
        style={style}
      />
    );
  };

  const feltContent = (
    <>
      <PhaseBanner view={view} serverNow={serverNow} />
      <Pile ref={pileRef} count={view.pile} unit={arcLayout ? 15 : short ? (desktop ? 10 : 8) : 13} />
    </>
  );

  if (arcLayout) {
    const arc = arcPositions(n);
    return (
      <div className="mx-auto flex min-h-0 w-full max-w-[1180px] flex-1 flex-col px-8">
        <div className={cn("relative flex-1", short ? "min-h-[240px]" : "min-h-[320px]")}>
          <div
            className={cn(
              "felt leery-felt-texture absolute inset-x-[2%] bottom-1 top-[17%] flex flex-col overflow-y-auto rounded-[999px] px-10 pb-4 no-scrollbar",
              short ? "pt-14" : "pt-20",
            )}
          >
            <div className="m-auto flex flex-col items-center gap-4">{feltContent}</div>
          </div>
          {opponents.map((p, i) =>
            renderSeat(p, {
              position: "absolute",
              left: `${arc[i].x}%`,
              top: `${arc[i].y}%`,
              transform: "translate(-50%, -50%)",
            }),
          )}
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[1180px] flex-1 flex-col">
      <div className="shrink-0 px-2 pt-2">
        <div className="flex flex-wrap items-start justify-center gap-x-1 gap-y-2">{opponents.map((p) => renderSeat(p))}</div>
      </div>
      <div className="min-h-0 flex-1 px-3 py-2">
        <div className="felt leery-felt-texture relative flex h-full flex-col overflow-y-auto rounded-[2rem] px-3 py-3 no-scrollbar">
          <div className="m-auto flex flex-col items-center gap-3">{feltContent}</div>
        </div>
      </div>
      {children}
    </div>
  );
}
