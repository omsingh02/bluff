import { describe, expect, it } from "vitest";
import { describeLog, nextRank, opponentsInOrder, playerAfter, rankOf, sortCards, suitOf } from "@/lib/game";
import { friendlyError } from "@/lib/api";
import { parseRoomCode } from "@/pages/helpers";
import { fixture } from "@/dev/fixtures";
import type { RoomView } from "@/lib/types";
import { normalizeCode } from "@/lib/utils";

describe("cards", () => {
  it("splits codes into rank and suit (including 10)", () => {
    expect(rankOf("10H")).toBe("10");
    expect(suitOf("10H")).toBe("H");
    expect(rankOf("AS")).toBe("A");
  });

  it("sorts by rank then suit and does not mutate", () => {
    const hand = ["KD", "AS", "10C", "3H", "3S", "AH"];
    const sorted = sortCards(hand);
    expect(sorted).toEqual(["AS", "AH", "3S", "3H", "10C", "KD"]);
    expect(hand[0]).toBe("KD");
  });

  it("the required rank wraps K → A", () => {
    expect(nextRank("K")).toBe("A");
    expect(nextRank("9")).toBe("10");
  });
});

describe("players", () => {
  const view = fixture("turn-mine") as RoomView;
  it("orders opponents clockwise starting after me", () => {
    const names = opponentsInOrder(view.players, view.me.id).map((p) => p.name);
    expect(names).toEqual(["Mira", "Vex", "Juno"]);
    const mira = view.players[1];
    expect(opponentsInOrder(view.players, mira.id).map((p) => p.name)).toEqual(["Vex", "Juno", "Alex"]);
  });

  it("finds the next seat, wrapping around", () => {
    expect(playerAfter(view.players, "p-juno")?.name).toBe("Alex");
    expect(playerAfter(view.players, "nobody")).toBeUndefined();
  });
});

describe("room codes", () => {
  it("uppercases, strips junk and caps at 6 characters", () => {
    expect(parseRoomCode("ab-cd3efgh")).toBe("ABCD3E");
    expect(parseRoomCode("k7q")).toBe("K7Q");
    expect(normalizeCode("k7 qx-m2!")).toBe("K7QXM2");
  });

  it("drops characters that can't appear in a code (0, 1, I, L, O)", () => {
    expect(parseRoomCode("0O1ILk7q")).toBe("K7Q");
  });

  it("extracts a code from a pasted invite link or sentence", () => {
    expect(parseRoomCode("https://liars.example/r/k7qxm2")).toBe("K7QXM2");
    expect(parseRoomCode("https://liars.example/r/K7QXM2?utm=x")).toBe("K7QXM2");
    expect(parseRoomCode("join me! code is k7qxm2 ok")).toBe("K7QXM2");
  });
});

describe("game log", () => {
  it("describes plays and calls readably", () => {
    expect(describeLog({ n: 1, t: 0, k: "play", pn: "Mira", c: 2, r: "7" }).text).toBe("Mira played 2 cards as Sevens");
    expect(describeLog({ n: 2, t: 0, k: "play", pn: "Mira", c: 1, r: "A" }).text).toBe("Mira played 1 card as Aces");
    const caught = describeLog({ n: 3, t: 0, k: "call", pn: "Vex", an: "Mira", b: true, x: 6 });
    expect(caught.tone).toBe("good");
    expect(caught.text).toContain("Mira was lying and takes 6 cards");
    const wrong = describeLog({ n: 4, t: 0, k: "call", pn: "Vex", an: "Mira", b: false, x: 1 });
    expect(wrong.tone).toBe("bad");
    expect(wrong.text).toContain("Vex takes 1 card");
  });
});

describe("errors", () => {
  it("has a friendly message for every code", () => {
    for (const code of ["bad_phase", "not_your_turn", "bad_cards", "room_full", "name_taken", "setup", "network", "unknown"] as const) {
      expect(friendlyError(code).length).toBeGreaterThan(5);
    }
  });
});
