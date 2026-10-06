import { nextRank } from "@/lib/game";
import { RANKS, type Rank, type RoomView } from "@/lib/types";

export interface MyNext {
  /** The rank I will have to claim on my next turn. */
  rank: Rank;
  /** 0 = it is my turn right now, 1 = I'm up next, 2 = after one more player… */
  turnsAway: number;
}

/**
 * Turn order and the required rank both advance by exactly one per turn, so what I'll need to claim
 * on my next turn is deterministic — handy for highlighting the right cards (and for pre-selecting)
 * while waiting. Display-only: the server remains the source of truth.
 */
export function myNextTurn(view: RoomView): MyNext | null {
  const n = view.players.length;
  const seatOf = (id: string) => view.players.findIndex((p) => p.id === id);
  const mine = seatOf(view.me.id);
  if (n === 0 || mine < 0) return null;

  let seat: number;
  let rank: Rank;
  let offset = 0; // turns between "now" and the base seat's turn
  if (view.status === "turn" && view.turn) {
    seat = seatOf(view.turn.player);
    rank = view.turn.rank;
  } else if (view.status === "challenge" && view.challenge) {
    seat = (seatOf(view.challenge.by) + 1) % n;
    rank = nextRank(view.challenge.rank);
    offset = 1;
  } else if (view.status === "reveal" && view.reveal) {
    seat = (seatOf(view.reveal.accused) + 1) % n;
    rank = nextRank(view.reveal.rank);
    offset = 1;
  } else {
    return null;
  }
  if (seat < 0) return null;

  const dist = (mine - seat + n) % n;
  return { rank: RANKS[(RANKS.indexOf(rank) + dist) % RANKS.length], turnsAway: dist + offset };
}
