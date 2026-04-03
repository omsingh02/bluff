export type Suit = "hearts" | "diamonds" | "clubs" | "spades";
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";

export interface Card {
  suit: Suit;
  rank: Rank;
  id: string;
}

export interface Player {
  id: string;
  nickname: string;
  hand: Card[];
  isHost: boolean;
  turnOrder: number;
}

export type GameStatus = "waiting" | "playing" | "bluff_window" | "finished";

export interface GameState {
  roomCode: string;
  status: GameStatus;
  players: Player[];
  currentTurnIndex: number;
  centerPile: Card[];
  claimedRank: Rank | null;
  lastPlayedBy: string | null;
  lastPlayedCount: number;
  winnerId: string | null;
  bluffTimerEnd: number | null;
}

export const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
export const SUITS: Suit[] = ["hearts", "diamonds", "clubs", "spades"];

export const SUIT_SYMBOLS: Record<Suit, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

export const SUIT_COLORS: Record<Suit, string> = {
  hearts: "text-red-500",
  diamonds: "text-red-500",
  clubs: "text-foreground",
  spades: "text-foreground",
};

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, id: `${rank}-${suit}` });
    }
  }
  return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function dealCards(deck: Card[], playerCount: number): Card[][] {
  const hands: Card[][] = Array.from({ length: playerCount }, () => []);
  deck.forEach((card, i) => {
    hands[i % playerCount].push(card);
  });
  return hands;
}

export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function getNextTurnIndex(currentIndex: number, playerCount: number): number {
  return (currentIndex + 1) % playerCount;
}
