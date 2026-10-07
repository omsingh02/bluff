/**
 * Wire contract between the Postgres game engine (supabase/migrations/*_engine.sql,
 * see `game.view()`) and the UI.
 *
 * The server is authoritative: the client never computes game state, it only renders what it is
 * sent and asks the server to act. All timestamps are SERVER epoch milliseconds — convert with
 * `RoomController.serverNow()` before comparing against `Date.now()`.
 */

export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
export type Rank = (typeof RANKS)[number];

export const SUITS = ["S", "H", "D", "C"] as const; // spades, hearts, diamonds, clubs
export type Suit = (typeof SUITS)[number];

/** Rank immediately followed by a suit letter: "AS", "10H", "7D". */
export type CardCode = string;

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
/** You may play 1–4 cards per turn (only four of any rank exist). */
export const MAX_PLAY = 4;
export const MAX_NAME = 16;
export const CODE_LENGTH = 6;
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export type RoomStatus =
  | "lobby" // players gathering, host configures
  | "turn" // `turn.player` must play 1–4 cards face-down and claim they are `turn.rank`
  | "challenge" // a play is pending: everyone else may call bluff or accept until `challenge.deadline`
  | "reveal" // a bluff was called: the cards are shown until `reveal.until`
  | "finished"; // `winner` emptied their hand

export type Speed = "relaxed" | "standard" | "blitz";
export type BotStyle = "cautious" | "balanced" | "reckless" | "paranoid";

export interface PlayerView {
  /** Public player id (uuid). Stable for the lifetime of the room. */
  id: string;
  /** Seat index 0..n-1 in turn order (clockwise). */
  seat: number;
  name: string;
  /** Avatar colour index 0..7 (unique within the room). */
  color: number;
  host: boolean;
  bot: boolean;
  /** Personality of a bot, null for humans. */
  style: BotStyle | null;
  /** Server-controlled seat: the human went AFK (missed turns) or left mid-game. */
  auto: boolean;
  /** The human left mid-game; a bot is playing their cards out. */
  left: boolean;
  /** Heard from recently (always true for bots). */
  online: boolean;
  /** Hand size. Hidden information (the actual cards) is never sent for other players. */
  cards: number;
}

export interface MeView {
  id: string;
  seat: number;
  host: boolean;
  /** My cards, sorted by rank then suit. */
  hand: CardCode[];
  /** I am on autopilot (AFK). Show a "Resume" button → `resume()`. */
  auto: boolean;
  /** I already accepted the pending play. */
  passed: boolean;
  /** Server-computed permissions — the UI should simply obey these. */
  canPlay: boolean;
  canCall: boolean;
  canPass: boolean;
}

/** status === "turn" */
export interface TurnView {
  /** Player who must act. */
  player: string;
  /** The rank every card played this turn must claim to be. Advances A,2,3…K,A… each turn. */
  rank: Rank;
  since: number;
  /** When a human's turn timer runs out (they get auto-played). null → a bot/autopilot is "thinking". */
  deadline: number | null;
}

/** status === "challenge" */
export interface ChallengeView {
  /** Player who just played (and may not call their own play). */
  by: string;
  /** How many cards they played (face-down) … */
  count: number;
  /** … and the rank they claimed all of them are. */
  rank: Rank;
  since: number;
  /** The window closes here if nobody calls bluff. */
  deadline: number;
  /** Players who already accepted. */
  passed: string[];
}

/** status === "reveal" */
export interface RevealView {
  caller: string;
  accused: string;
  /** The actual cards that were played (public now). */
  cards: CardCode[];
  rank: Rank;
  /** true → at least one card wasn't the claimed rank. */
  bluff: boolean;
  /** Who picks up the pile: the accused if they bluffed, otherwise the caller. */
  picker: string;
  /** Number of cards in the pile that get picked up. */
  pickup: number;
  /** Set when the accused played their last cards honestly — they win after the reveal. */
  winner: string | null;
  until: number;
}

export type LogKind =
  | "join"
  | "leave"
  | "kick"
  | "bot"
  | "host"
  | "start"
  | "play"
  | "call"
  | "timeout"
  | "auto"
  | "resume"
  | "win"
  | "rematch";

/** One line of the game log. Names are embedded so entries stay readable after players leave. */
export interface LogEntry {
  /** Monotonic sequence number — use as a React key / to detect new events. */
  n: number;
  /** Server epoch ms. */
  t: number;
  k: LogKind;
  /** Primary player id + name (the actor; for "call" the caller). */
  p?: string;
  pn?: string;
  /** Secondary player id + name (for "call": the accused). */
  a?: string;
  an?: string;
  /** play: number of cards. */
  c?: number;
  /** play/call: the claimed rank. */
  r?: Rank;
  /** call: was it a bluff? */
  b?: boolean;
  /** call: how many cards were picked up. */
  x?: number;
}

export interface RoomView {
  /** Monotonic version of the room; bumps on every change. */
  v: number;
  /** Server time when this snapshot was built. */
  now: number;
  code: string;
  status: RoomStatus;
  settings: { speed: Speed; turnSeconds: number; challengeSeconds: number };
  /** All seats in seat order (includes bots and — once started — players who left). */
  players: PlayerView[];
  me: MeView;
  /** Cards in the face-down centre pile. */
  pile: number;
  turn: TurnView | null;
  challenge: ChallengeView | null;
  reveal: RevealView | null;
  /** Winner's player id once status === "finished". */
  winner: string | null;
  /** Server time of the next time-based transition (bot move, window end, reveal end…), or null. Poll then. */
  due: number | null;
  /** Newest last (max ~40). */
  log: LogEntry[];
  /** true when THIS request caused a server-side transition (client then pings the other players). */
  adv?: boolean;
}

/** What someone who is NOT in the room sees when they open its link. */
export interface RoomPreview {
  preview: true;
  code: string;
  status: RoomStatus;
  count: number;
  max: number;
  host: string;
  joinable: boolean;
  reason: null | "started" | "full" | "banned";
}

export type StateResponse = RoomView | RoomPreview;

export const isPreview = (r: StateResponse): r is RoomPreview => (r as RoomPreview).preview === true;
