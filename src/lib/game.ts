import {
  RANKS,
  SUITS,
  type BotStyle,
  type CardCode,
  type LogEntry,
  type PlayerView,
  type Rank,
  type Speed,
  type Suit,
} from "./types";

export const rankOf = (c: CardCode): Rank => c.slice(0, -1) as Rank;
export const suitOf = (c: CardCode): Suit => c.slice(-1) as Suit;
export const nextRank = (r: Rank): Rank => RANKS[(RANKS.indexOf(r) + 1) % RANKS.length];

export const RANK_SINGULAR: Record<Rank, string> = {
  A: "Ace", "2": "Two", "3": "Three", "4": "Four", "5": "Five", "6": "Six", "7": "Seven",
  "8": "Eight", "9": "Nine", "10": "Ten", J: "Jack", Q: "Queen", K: "King",
};

export const RANK_PLURAL: Record<Rank, string> = {
  A: "Aces", "2": "Twos", "3": "Threes", "4": "Fours", "5": "Fives", "6": "Sixes", "7": "Sevens",
  "8": "Eights", "9": "Nines", "10": "Tens", J: "Jacks", Q: "Queens", K: "Kings",
};

export const SUIT_NAME: Record<Suit, string> = { S: "Spades", H: "Hearts", D: "Diamonds", C: "Clubs" };
export const SUIT_SYMBOL: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
export const isRedSuit = (s: Suit): boolean => s === "H" || s === "D";

/** Accessible name, e.g. "7 of Hearts". */
export const cardLabel = (c: CardCode): string => `${rankOf(c)} of ${SUIT_NAME[suitOf(c)]}`;

const cardOrder = (c: CardCode) => RANKS.indexOf(rankOf(c)) * 4 + SUITS.indexOf(suitOf(c));
/** Sort by rank (A→K) then suit (♠♥♦♣). Does not mutate. */
export const sortCards = (cards: CardCode[]): CardCode[] => [...cards].sort((a, b) => cardOrder(a) - cardOrder(b));

export const playerById = (players: PlayerView[], id: string | null | undefined): PlayerView | undefined =>
  id ? players.find((p) => p.id === id) : undefined;

/** The player seated after `id` (turn order wraps). */
export function playerAfter(players: PlayerView[], id: string): PlayerView | undefined {
  const i = players.findIndex((p) => p.id === id);
  return i < 0 ? undefined : players[(i + 1) % players.length];
}

/** Everyone except me, in turn order starting with the seat after mine (clockwise around the table). */
export function opponentsInOrder(players: PlayerView[], meId: string): PlayerView[] {
  const i = players.findIndex((p) => p.id === meId);
  if (i < 0) return players.filter((p) => p.id !== meId);
  return [...players.slice(i + 1), ...players.slice(0, i)];
}

export const SPEEDS: Record<Speed, { label: string; blurb: string; turnSeconds: number; challengeSeconds: number }> = {
  relaxed: { label: "Relaxed", blurb: "90s turns · 9s to call", turnSeconds: 90, challengeSeconds: 9 },
  standard: { label: "Standard", blurb: "45s turns · 6s to call", turnSeconds: 45, challengeSeconds: 6 },
  blitz: { label: "Blitz", blurb: "20s turns · 4s to call", turnSeconds: 20, challengeSeconds: 4 },
};

export const BOT_STYLES: Record<BotStyle, { label: string; blurb: string }> = {
  cautious: { label: "Cautious", blurb: "Rarely lies, rarely calls." },
  balanced: { label: "Balanced", blurb: "A bit of everything." },
  reckless: { label: "Reckless", blurb: "Lies a lot. Calls less." },
  paranoid: { label: "Paranoid", blurb: "Calls bluff at the slightest doubt." },
};

const cards = (n: number) => `${n} card${n === 1 ? "" : "s"}`;

export type LogTone = "neutral" | "play" | "call" | "good" | "bad";

/** Human-readable line for the game log / live-region announcements. */
export function describeLog(e: LogEntry): { text: string; tone: LogTone } {
  const p = e.pn ?? "Someone";
  const a = e.an ?? "someone";
  switch (e.k) {
    case "join": return { text: `${p} joined`, tone: "neutral" };
    case "leave": return { text: `${p} left`, tone: "neutral" };
    case "kick": return { text: `${p} was removed`, tone: "neutral" };
    case "bot": return { text: `${p} (bot) joined`, tone: "neutral" };
    case "host": return { text: `${p} is now the host`, tone: "neutral" };
    case "start": return { text: "Cards dealt — good luck!", tone: "neutral" };
    case "play": return { text: `${p} played ${cards(e.c ?? 1)} as ${e.r ? RANK_PLURAL[e.r] : "?"}`, tone: "play" };
    case "call":
      return e.b
        ? { text: `${p} called bluff — ${a} was lying and takes ${cards(e.x ?? 0)}`, tone: "good" }
        : { text: `${p} called bluff — ${a} was honest, ${p} takes ${cards(e.x ?? 0)}`, tone: "bad" };
    case "timeout": return { text: `${p} ran out of time and was auto-played`, tone: "neutral" };
    case "auto": return { text: `${p} is away — a bot is playing for them`, tone: "neutral" };
    case "resume": return { text: `${p} is back`, tone: "neutral" };
    case "win": return { text: `${p} wins!`, tone: "good" };
    case "rematch": return { text: "New round — back to the lobby", tone: "neutral" };
    default: return { text: "", tone: "neutral" };
  }
}
