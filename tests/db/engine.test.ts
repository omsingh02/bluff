import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cardsIn, createTestDb, expectError, hasDb, Seat, set, type TestDb, type View } from "./helpers";

/**
 * Engine tests run against a real Postgres (see scripts/test-db.sh). They call the public `lh_*`
 * functions exactly as PostgREST would (as the `anon` role) and use superuser SQL only to set up
 * scenarios and to inspect hidden state. Time never passes by sleeping: `db.shift()` moves every
 * stored timestamp into the past, which is equivalent to the clock moving forward.
 */
describe.skipIf(!hasDb)("Liar's Hand engine", () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(async () => {
    await db?.close();
  });

  // ---- helpers ----------------------------------------------------------------------------
  async function table(n: number, opts: { speed?: string } = {}) {
    const host = new Seat(db, "Host");
    const v = await host.create({ speed: opts.speed });
    const seats = [host];
    for (let i = 1; i < n; i++) {
      const s = new Seat(db, `P${i}`);
      await s.join(v.code);
      seats.push(s);
    }
    return { code: v.code as string, seats };
  }

  const roomRow = async (code: string) =>
    (await db.sql<Record<string, any>>("select * from game.rooms where code = $1", [code]))[0]; // eslint-disable-line @typescript-eslint/no-explicit-any
  const playerRows = (code: string) =>
    db.sql<{ id: string; seat: number; name: string; hand: string[]; missed: number; auto: boolean; has_left: boolean; is_host: boolean; is_bot: boolean }>(
      `select p.* from game.players p join game.rooms r on r.id = p.room_id where r.code = $1 order by p.seat`,
      [code],
    );

  /** Deterministic scenario: whose turn, which rank, and exact hands (by seat). */
  async function setup(code: string, o: { seat: number; rankIdx?: number; hands: Record<number, string[]> }) {
    const room = await roomRow(code);
    for (const [seat, hand] of Object.entries(o.hands)) {
      await db.sql("update game.players set hand = $1 where room_id = $2 and seat = $3", [hand, room.id, Number(seat)]);
    }
    await db.sql(
      `update game.rooms set seat_turn = $2, rank_idx = $3, pile = '{}', status = 'turn',
         turn_started_at = clock_timestamp(), deadline = clock_timestamp() + interval '45 seconds',
         act_at = null, bot_caller = null, passed = '{}', play_seat = null, play_count = 0, reveal = null
       where code = $1`,
      [code, o.seat, o.rankIdx ?? 0],
    );
  }

  async function assertInvariants(code: string) {
    const r = await roomRow(code);
    const ps = await playerRows(code);
    expect(ps.map((p) => p.seat)).toEqual(ps.map((_, i) => i));
    const all = [...(r.pile as string[]), ...ps.flatMap((p) => p.hand)];
    if (r.status === "lobby") {
      expect(all).toHaveLength(0);
    } else {
      expect(all).toHaveLength(52);
      expect(new Set(all).size).toBe(52);
    }
    expect(r.rank_idx).toBeGreaterThanOrEqual(0);
    expect(r.rank_idx).toBeLessThanOrEqual(12);
  }

  // ---- lobby --------------------------------------------------------------------------------
  describe("lobby", () => {
    it("creates a room with a 6-char code and the host seated", async () => {
      const host = new Seat(db, "Alex");
      const v = await host.create();
      expect(v.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/);
      expect(v.status).toBe("lobby");
      expect(v.players).toHaveLength(1);
      expect(v.me).toMatchObject({ host: true, seat: 0, hand: [], canPlay: false });
      expect(v.settings).toEqual({ speed: "standard", turnSeconds: 45, challengeSeconds: 6 });
    });

    it("lets players join, normalises codes and rejects bad names", async () => {
      const host = new Seat(db, "Alex");
      const { code } = await host.create();

      const mira = new Seat(db, "  Mira   Q ");
      const v = await mira.join(code.toLowerCase().replace(/^(..)/, "$1 -"));
      expect(v.players.map((p: View) => p.name)).toEqual(["Alex", "Mira Q"]);
      mira.code = code;

      await expectError(new Seat(db, "alex").join(code), "name_taken");
      await expectError(new Seat(db, "").join(code), "name_invalid");
      await expectError(new Seat(db, "x".repeat(17)).join(code), "name_invalid");
      await expectError(new Seat(db, "   ").join(code), "name_invalid");
    });

    it("assigns unique avatar colours and contiguous seats", async () => {
      const { code, seats } = await table(8);
      const v = await seats[0].state();
      expect(new Set(v.players.map((p: View) => p.color)).size).toBe(8);
      expect(v.players.map((p: View) => p.seat)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
      await expectError(new Seat(db, "Ninth").join(code), "room_full");
    });

    it("rejects unknown rooms, malformed tokens and shows a preview to outsiders", async () => {
      await expectError(db.rpc("lh_get_state", { p_token: "x".repeat(48), p_code: "ZZZZZ" }), "room_not_found");
      await expectError(db.rpc("lh_get_state", { p_token: "short", p_code: "ZZZZZ" }), "bad_request");
      const host = new Seat(db, "Alex");
      const { code } = await host.create();
      const outsider = new Seat(db, "Out", undefined, code);
      const pv = await outsider.state();
      expect(pv).toMatchObject({ preview: true, status: "lobby", count: 1, max: 8, host: "Alex", joinable: true, reason: null });
      expect(pv.me).toBeUndefined();
    });

    it("bots: host-only, unique names, capped at 8 seats", async () => {
      const { code, seats } = await table(2);
      await expectError(seats[1].addBot(), "not_host");
      let v: View = await seats[0].state();
      for (let i = 0; i < 6; i++) v = await seats[0].addBot();
      expect(v.players).toHaveLength(8);
      expect(new Set(v.players.map((p: View) => p.name.toLowerCase())).size).toBe(8);
      const bots = v.players.filter((p: View) => p.bot);
      expect(bots).toHaveLength(6);
      expect(bots.every((b: View) => ["cautious", "balanced", "reckless", "paranoid"].includes(b.style))).toBe(true);
      await expectError(seats[0].addBot(), "room_full");
      expect(code).toBeTruthy();
    });

    it("kick bans the player; removing a bot compacts seats; cannot remove yourself", async () => {
      const { code, seats } = await table(3);
      const v = await seats[0].addBot();
      const bot = v.players.find((p: View) => p.bot);
      const kicked = v.players.find((p: View) => p.name === "P1");

      await expectError(seats[1].kick(bot.id), "not_host");
      await expectError(seats[0].kick(v.me.id), "bad_request");

      const after = await seats[0].kick(kicked.id);
      expect(after.players.map((p: View) => p.seat)).toEqual([0, 1, 2]);
      const pv = await seats[1].state();
      expect(pv).toMatchObject({ preview: true, joinable: false, reason: "banned" });
      await expectError(seats[1].join(code), "banned");

      const after2 = await seats[0].kick(bot.id);
      expect(after2.players.map((p: View) => p.seat)).toEqual([0, 1]);
    });

    it("speed is host-only and validated", async () => {
      const { seats } = await table(2);
      await expectError(seats[1].setSpeed("blitz"), "not_host");
      await expectError(seats[0].setSpeed("warp"), "bad_request");
      const v = await seats[0].setSpeed("blitz");
      expect(v.settings).toEqual({ speed: "blitz", turnSeconds: 20, challengeSeconds: 4 });
      expect((await seats[0].setSpeed("relaxed")).settings).toEqual({ speed: "relaxed", turnSeconds: 90, challengeSeconds: 9 });
    });

    it("start needs the host and 2+ players; joining after start is refused", async () => {
      const host = new Seat(db, "Alex");
      const { code } = await host.create();
      await expectError(host.start(), "need_players");
      const g = new Seat(db, "Guest");
      await g.join(code);
      await expectError(g.start(), "not_host");
      const v = await host.start();
      expect(v.status).toBe("turn");
      await expectError(host.start(), "bad_phase");
      await expectError(new Seat(db, "Late").join(code), "room_started");
      expect(await new Seat(db, "Late", undefined, code).state()).toMatchObject({ preview: true, joinable: false, reason: "started" });
    });

    it("host leaving transfers host; the last human leaving deletes the room", async () => {
      const { code, seats } = await table(3);
      await seats[0].leave();
      const v = await seats[1].state();
      expect(v.players.map((p: View) => p.name)).toEqual(["P1", "P2"]);
      expect(v.players.map((p: View) => p.seat)).toEqual([0, 1]);
      expect(v.me.host).toBe(true);
      await seats[1].leave();
      await seats[2].leave();
      await expectError(seats[2].state(), "room_not_found");
      expect(await roomRow(code)).toBeUndefined();
    });

    it("a lobby with only bots left behind is deleted when the last human leaves", async () => {
      const host = new Seat(db, "Solo");
      const v = await host.create({ bots: 3 });
      await host.leave();
      expect(await roomRow(v.code)).toBeUndefined();
    });
  });

  // ---- privacy -------------------------------------------------------------------------------
  describe("privacy and permissions", () => {
    it("anon cannot read or call anything in the private schema", async () => {
      const c = await db.anon();
      try {
        await expect(c.query("select * from game.rooms")).rejects.toThrow(/permission denied/i);
        await expect(c.query("select * from game.players")).rejects.toThrow(/permission denied/i);
        await expect(c.query("select game.api_get_state('x','y')")).rejects.toThrow(/permission denied/i);
        await expect(c.query("select game.view(null, null, now())")).rejects.toThrow(/permission denied/i);
        // …but the public API works.
        const r = await c.query("select public.lh_get_state($1, 'ZZZZZ')", ["z".repeat(40)]).catch((e: Error) => e);
        expect((r as Error).message).toBe("room_not_found");
      } finally {
        await c.end();
      }
    });

    it("no table in the public schema exposes game data", async () => {
      const rows = await db.sql<{ n: string }>(
        `select c.relname as n from pg_class c join pg_namespace s on s.oid = c.relnamespace
         where s.nspname = 'public' and c.relkind in ('r','v','m','p','f')`,
      );
      expect(rows).toEqual([]);
    });

    it("a player's view never contains cards that aren't theirs (in any phase)", async () => {
      const { code, seats } = await table(4);
      await seats[0].start();

      const check = async () => {
        for (const s of seats) {
          const v = await s.state();
          if (v.status === "reveal") continue; // revealed cards are public by design
          const mine = new Set<string>(v.me.hand);
          for (const c of cardsIn(v)) expect(mine.has(c), `leaked ${c} to ${s.name} (${v.status})`).toBe(true);
        }
      };
      await check(); // turn

      const views = await Promise.all(seats.map((s) => s.state()));
      const idx = views.findIndex((v) => v.me.canPlay);
      await seats[idx].play([views[idx].me.hand[0]]);
      await check(); // challenge
      expect(await roomRow(code)).toBeTruthy();
    });

    it("wrong or foreign tokens cannot act", async () => {
      const { code, seats } = await table(2);
      await seats[0].start();
      const imposter = new Seat(db, "Imposter", undefined, code);
      await expectError(imposter.play(["AS"]), "not_in_room");
      await expectError(imposter.callBluff(), "not_in_room");
      await expectError(imposter.start(), "not_in_room");
    });
  });

  // ---- dealing --------------------------------------------------------------------------------
  describe("dealing", () => {
    for (const n of [2, 3, 5, 8]) {
      it(`deals a full deck fairly to ${n} players`, async () => {
        const { code, seats } = await table(n);
        const v = await seats[0].start();
        expect(v.status).toBe("turn");
        const rows = await playerRows(code);
        const sizes = rows.map((r) => r.hand.length);
        expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
        expect(sizes.reduce((a, b) => a + b, 0)).toBe(52);
        await assertInvariants(code);

        const views = await Promise.all(seats.map((s) => s.state()));
        expect(views.filter((x) => x.me.canPlay)).toHaveLength(1);
        expect(views[0].turn.rank).toBe("A");
        expect(views[0].players.every((p: View) => p.cards === sizes[p.seat])).toBe(true);
        // each human's own hand is sorted and matches the DB
        views.forEach((x, i) => expect(set(x.me.hand)).toEqual(set(rows[i].hand)));
      });
    }
  });

  // ---- playing --------------------------------------------------------------------------------
  describe("turn rules", () => {
    it("validates turn order, phase and the cards played", async () => {
      const { code, seats } = await table(3);
      await expectError(seats[0].play(["AS"]), "bad_phase"); // lobby
      await seats[0].start();
      await setup(code, { seat: 1, hands: { 0: ["2S", "3S"], 1: ["AS", "AH", "5C", "6C", "7C"], 2: ["9D"] } });

      await expectError(seats[0].play(["2S"]), "not_your_turn");
      await expectError(seats[1].play([]), "bad_cards");
      await expectError(seats[1].play(["9D"]), "bad_cards"); // not in hand
      await expectError(seats[1].play(["AS", "AS"]), "bad_cards"); // duplicate
      await expectError(seats[1].play(["AS", "AH", "5C", "6C", "7C"]), "bad_cards"); // five cards
      await expectError(seats[1].call("lh_play", { p_cards: null as unknown as string[] }), "bad_cards");

      const v = await seats[1].play(["AS", "AH"]);
      expect(v.status).toBe("challenge");
      expect(v.challenge).toMatchObject({ by: v.me.id, count: 2, rank: "A", passed: [] });
      expect(v.pile).toBe(2);
      expect(v.me.hand).toEqual(["5C", "6C", "7C"]);
      expect(v.me).toMatchObject({ canPlay: false, canCall: false, canPass: false });
      await expectError(seats[1].play(["5C"]), "bad_phase");
    });

    it("the claimed rank advances A,2,3…K,A each turn regardless of calls", async () => {
      const { code, seats } = await table(2);
      await seats[0].start();
      await setup(code, { seat: 0, rankIdx: 11, hands: { 0: ["3C", "4C", "5C"], 1: ["6C", "7C", "8C"] } });
      await seats[0].play(["3C"]); // claims Q
      await seats[1].pass();
      await db.shift(code, 1.2);
      const v = await seats[1].state();
      expect(v.status).toBe("turn");
      expect(v.turn).toMatchObject({ player: v.me.id, rank: "K" });
      await seats[1].play(["6C"]);
      await seats[0].pass();
      await db.shift(code, 1.2);
      expect((await seats[0].state()).turn.rank).toBe("A"); // wraps
    });
  });

  // ---- challenge window ---------------------------------------------------------------------
  describe("challenge window", () => {
    it("only others can call/pass; passing is idempotent; early close needs the beat", async () => {
      const { code, seats } = await table(3);
      await seats[0].start();
      await setup(code, { seat: 0, hands: { 0: ["AS", "5C"], 1: ["9D"], 2: ["9H"] } });
      await seats[0].play(["AS"]);

      await expectError(seats[0].callBluff(), "bad_phase");
      await expectError(seats[0].pass(), "bad_phase");
      const v1 = await seats[1].state();
      expect(v1.me).toMatchObject({ canCall: true, canPass: true, passed: false });

      await seats[1].pass();
      const again = await seats[1].pass();
      expect(again.challenge.passed).toHaveLength(1);
      expect(again.me).toMatchObject({ canCall: true, canPass: false, passed: true });

      const mid = await seats[2].pass(); // everyone accepted, but the beat hasn't elapsed yet
      expect(mid.status).toBe("challenge");
      expect(mid.due).not.toBeNull();

      await db.shift(code, 1);
      const after = await seats[2].state();
      expect(after.status).toBe("turn");
      expect(after.turn.rank).toBe("2");
      expect(after.players[0].cards).toBe(1);
      expect(after.pile).toBe(1);
    });

    it("closes by itself when the window times out", async () => {
      const { code, seats } = await table(2);
      await seats[0].start();
      await setup(code, { seat: 0, hands: { 0: ["AS", "5C"], 1: ["9D"] } });
      await seats[0].play(["AS"]);
      expect((await seats[1].state()).status).toBe("challenge");
      await db.shift(code, 3);
      expect((await seats[1].state()).status).toBe("challenge");
      await db.shift(code, 4);
      const v = await seats[1].state();
      expect(v.status).toBe("turn");
      expect(v.turn.player).toBe(v.me.id);
      expect(v.adv).toBe(true);
    });

    it("a lie called out: the liar picks up the pile, reveal is public, next turn follows the accused", async () => {
      const { code, seats } = await table(3);
      await seats[0].start();
      await setup(code, { seat: 1, hands: { 0: ["2S"], 1: ["3H", "4D", "9C"], 2: ["KC"] } });
      await seats[1].play(["3H"]); // claims A, it's a 3
      const v = await seats[2].callBluff();

      expect(v.status).toBe("reveal");
      expect(v.reveal).toMatchObject({ bluff: true, cards: ["3H"], rank: "A", pickup: 1 });
      expect(v.reveal.picker).toBe(v.reveal.accused);
      expect(v.reveal.caller).toBe(v.me.id);
      expect(v.reveal.winner).toBeNull();
      expect(v.pile).toBe(0);
      expect(v.log.at(-1)).toMatchObject({ k: "call", b: true, x: 1 });
      const rows = await playerRows(code);
      expect(set(rows[1].hand)).toEqual(set(["3H", "4D", "9C"]));
      await assertInvariantsLoose(code);

      await expectError(seats[0].callBluff(), "bad_phase"); // already resolved
      await db.shift(code, 5);
      const next = await seats[2].state();
      expect(next.status).toBe("turn");
      expect(next.turn).toMatchObject({ player: next.me.id, rank: "2" }); // seat after the accused (seat 1 → seat 2)
    });

    it("a wrong call: the caller picks up the pile", async () => {
      const { code, seats } = await table(2);
      await seats[0].start();
      await setup(code, { seat: 0, hands: { 0: ["AH", "AD", "9C"], 1: ["4C", "5C"] } });
      await seats[0].play(["AH", "AD"]);
      const v = await seats[1].callBluff();
      expect(v.reveal).toMatchObject({ bluff: false, pickup: 2 });
      expect(v.reveal.picker).toBe(v.me.id);
      const rows = await playerRows(code);
      expect(set(rows[1].hand)).toEqual(set(["4C", "5C", "AH", "AD"]));
      expect(rows[0].hand).toEqual(["9C"]);
    });

    it("an honest final play wins after the reveal when challenged", async () => {
      const { code, seats } = await table(2);
      await seats[0].start();
      await setup(code, { seat: 0, hands: { 0: ["AH"], 1: ["4C"] } });
      await seats[0].play(["AH"]);
      const v = await seats[1].callBluff();
      expect(v.reveal).toMatchObject({ bluff: false, winner: v.reveal.accused });
      expect(v.status).toBe("reveal");
      await db.shift(code, 5);
      const done = await seats[1].state();
      expect(done.status).toBe("finished");
      expect(done.winner).toBe(done.players[0].id);
      expect(done.players[0].cards).toBe(0);
      expect(done.log.at(-1).k).toBe("win");
    });

    it("an unchallenged final play wins when the window closes", async () => {
      const { code, seats } = await table(2);
      await seats[0].start();
      await setup(code, { seat: 0, hands: { 0: ["5H"], 1: ["4C"] } }); // a LIE nobody calls
      await seats[0].play(["5H"]);
      await seats[1].pass();
      await db.shift(code, 1.2);
      const v = await seats[1].state();
      expect(v.status).toBe("finished");
      expect(v.winner).toBe(v.players[0].id);
      await expectError(seats[0].play(["5H"]), "bad_phase");
    });

    it("a final play that was a lie and gets called does NOT win", async () => {
      const { code, seats } = await table(2);
      await seats[0].start();
      await setup(code, { seat: 0, hands: { 0: ["5H"], 1: ["4C"] } });
      await seats[0].play(["5H"]);
      const v = await seats[1].callBluff();
      expect(v.reveal).toMatchObject({ bluff: true, winner: null });
      await db.shift(code, 5);
      const next = await seats[0].state();
      expect(next.status).toBe("turn");
      expect(next.players[0].cards).toBe(1); // picked the 5H back up
    });

    it("simultaneous calls resolve exactly once", async () => {
      const { code, seats } = await table(4);
      await seats[0].start();
      await setup(code, { seat: 0, hands: { 0: ["2S", "3S"], 1: ["4S"], 2: ["5S"], 3: ["6S"] } });
      await seats[0].play(["2S"]);
      const res = await Promise.allSettled([seats[1].callBluff(), seats[2].callBluff(), seats[3].callBluff()]);
      expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      for (const r of res) if (r.status === "rejected") expect((r.reason as Error).message).toBe("bad_phase");
      const rows = await playerRows(code);
      expect(rows.flatMap((r) => r.hand).length).toBe(5); // the pile went to exactly one picker
      await assertInvariantsLoose(code);
    });

    it("a bot that can PROVE a lie calls it (holds the other aces)", async () => {
      const host = new Seat(db, "Host");
      const v0 = await host.create({ bots: 1, speed: "blitz" });
      await host.start();
      const code = v0.code as string;
      await setup(code, { seat: 0, hands: { 0: ["3C", "4C", "5D"], 1: ["AS", "AH", "AD", "AC"] } });
      await host.play(["3C", "4C"]); // claims two Aces; the bot holds all four → impossible
      const pending = await roomRow(code);
      expect(pending.bot_caller).not.toBeNull();
      await db.shift(code, 5);
      const v = await host.state();
      expect(v.status).toBe("reveal");
      expect(v.reveal).toMatchObject({ bluff: true });
      expect(v.reveal.caller).toBe(v.players[1].id);
      expect(v.reveal.picker).toBe(v.me.id);
    });

    it("a bot facing a winning play almost always calls", async () => {
      let calls = 0;
      const N = 30;
      for (let i = 0; i < N; i++) {
        const host = new Seat(db, `H${i}`);
        const v0 = await host.create({ bots: 1 });
        await host.start();
        await setup(v0.code, { seat: 0, hands: { 0: ["5H"], 1: ["4C", "9S", "JD"] } });
        await host.play(["5H"]);
        const r = await roomRow(v0.code);
        if (r.bot_caller) calls++;
      }
      expect(calls).toBeGreaterThanOrEqual(N * 0.7);
    });
  });

  /** Advance time and poll until the room reaches `status` (server-controlled seats may add steps). */
  async function settle(code: string, seat: Seat, status: string, step = 5, max = 6): Promise<View> {
    let v: View = await seat.state();
    for (let i = 0; i < max && v.status !== status; i++) {
      await db.shift(code, step);
      v = await seat.state();
    }
    return v;
  }

  /** Card conservation without requiring a full deck (scenarios use partial hands). */
  async function assertInvariantsLoose(code: string) {
    const r = await roomRow(code);
    const ps = await playerRows(code);
    const all = [...(r.pile as string[]), ...ps.flatMap((p) => p.hand)];
    expect(new Set(all).size).toBe(all.length);
  }

  // ---- timers / AFK ------------------------------------------------------------------------
  describe("turn timers and autopilot", () => {
    it("auto-plays a human who runs out of time (after a 2s grace) and counts the miss", async () => {
      const { code, seats } = await table(2);
      await seats[0].start();
      await setup(code, { seat: 0, hands: { 0: ["AS", "5C", "6C", "7C", "8C"], 1: ["9D", "10D", "JD", "QD", "KD"] } });

      await db.shift(code, 46); // soft deadline passed, still inside the 2s grace → the human may still play
      const grace = await seats[0].state();
      expect(grace.status).toBe("turn");
      expect(grace.me.canPlay).toBe(true);

      await db.shift(code, 3);
      const v = await seats[1].state(); // someone else's poll applies the timeout
      expect(v.status).toBe("challenge");
      expect(v.log.some((e: View) => e.k === "timeout")).toBe(true);
      const rows = await playerRows(code);
      expect(rows[0]).toMatchObject({ missed: 1, auto: false });
      expect(rows[0].hand.length).toBeLessThanOrEqual(4);
      expect(rows[0].hand).not.toContain("AS"); // played its honest Ace
      await assertInvariantsLoose(code);
    });

    it("the second consecutive miss puts the human on autopilot", async () => {
      const { code, seats } = await table(2);
      await seats[0].start();
      await db.sql("update game.players set missed = 1 where room_id = (select id from game.rooms where code = $1) and seat = 0", [code]);
      await setup(code, { seat: 0, hands: { 0: ["AS", "5C", "6C"], 1: ["9D", "10D", "JD"] } });
      await db.shift(code, 50);
      const v = await seats[1].state();
      expect(v.players[0]).toMatchObject({ auto: true });
      expect(v.log.some((e: View) => e.k === "auto")).toBe(true);
      expect((await playerRows(code))[0]).toMatchObject({ missed: 2, auto: true });
    });

    it("an autopilot human is played quickly by the server and can resume", async () => {
      const { code, seats } = await table(2);
      await seats[0].start();
      await db.sql("update game.players set auto = true, missed = 2 where room_id = (select id from game.rooms where code = $1) and seat = 0", [code]);
      await setup(code, { seat: 1, hands: { 0: ["AS", "5C"], 1: ["9D", "8D", "7D"] } });
      await seats[1].play(["9D"]);
      await db.sql("update game.rooms set bot_caller = null, act_at = null where code = $1", [code]); // no random call
      await db.shift(code, 1.2); // the autopilot seat isn't waited for, so the window closes after the beat
      const v = await seats[1].state(); // seat 0's (autopilot) turn begins with a bot-style act_at
      expect(v.turn.player).toBe(v.players[0].id);
      expect(v.turn.deadline).toBeNull(); // no human timer
      expect(v.due).not.toBeNull();

      const back = await seats[0].resume();
      expect(back.me.auto).toBe(false);
      expect(back.turn.deadline).not.toBeNull(); // human timer restarted for the current turn
      expect(back.log.at(-1).k).toBe("resume");
      const rows = await playerRows(code);
      expect(rows[0]).toMatchObject({ missed: 0, auto: false });
    });

    it("any real action clears autopilot", async () => {
      const { code, seats } = await table(2);
      await seats[0].start();
      await db.sql("update game.players set auto = true, missed = 2 where room_id = (select id from game.rooms where code = $1) and seat = 1", [code]);
      await setup(code, { seat: 0, hands: { 0: ["AS", "5C"], 1: ["9D"] } });
      await seats[0].play(["AS"]);
      await seats[1].pass();
      const rows = await playerRows(code);
      expect(rows[1]).toMatchObject({ auto: false, missed: 0 });
    });

    it("an offline human only gets a short fuse on their turn, and never blocks an early close", async () => {
      const { code, seats } = await table(3);
      await seats[0].start();
      await setup(code, { seat: 2, hands: { 0: ["AS", "5C"], 1: ["9D", "8D"], 2: ["KD", "QD"] } });
      await seats[2].play(["KD"]);
      await seats[0].pass();
      // Seat 1 vanished (no heartbeat for a minute) — their silence must not hold the window open.
      await db.sql("update game.players set last_seen = now() - interval '60 seconds' where room_id = (select id from game.rooms where code = $1) and seat = 1", [code]);
      await db.shift(code, 1);
      const v = await seats[0].state();
      expect(v.status).toBe("turn");
      expect(v.turn.player).toBe(v.players[0].id);
      expect(v.players[1].online).toBe(false);

      // When the offline human's own turn comes, the timer is the short fuse (≤10s), not 45s.
      await seats[0].play(["AS"]);
      await seats[2].pass();
      await db.shift(code, 1.2);
      const t = await seats[2].state();
      expect(t.turn.player).toBe(t.players[1].id);
      expect(t.turn.deadline - t.now).toBeLessThanOrEqual(10_000);
    });
  });

  // ---- leaving mid-game -----------------------------------------------------------------------
  describe("leaving and rematch", () => {
    it("a player who leaves mid-game is replaced by the server; host transfers", async () => {
      const { code, seats } = await table(3);
      await seats[0].start();
      await seats[0].leave();
      const v = await seats[1].state();
      expect(v.players[0]).toMatchObject({ left: true, auto: true, host: false });
      expect(v.players.find((p: View) => p.host).name).not.toBe("Host");
      expect(v.players).toHaveLength(3); // seat stays, played out by the server
      await expectError(seats[0].play(["AS"]), "not_in_room");
      expect(await seats[0].state()).toMatchObject({ preview: true, joinable: false });
      await assertInvariants(code);

      // The abandoned seat keeps getting played: poll until it has acted at least once.
      let acted = false;
      for (let i = 0; i < 60 && !acted; i++) {
        let s = await seats[1].state();
        if (s.me.canPlay) await seats[1].play([s.me.hand[0]]);
        s = await seats[2].state();
        if (s.me.canPlay) await seats[2].play([s.me.hand[0]]);
        if (s.me.canPass && !s.me.passed) await seats[2].pass();
        s = await seats[1].state();
        if (s.me.canPass && !s.me.passed) await seats[1].pass();
        await db.shift(code, 1.3);
        const rows = await playerRows(code);
        acted = rows[0].hand.length < 18 || (await roomRow(code)).status === "finished";
      }
      expect(acted).toBe(true);
      await assertInvariants(code);
    });

    it("the room is deleted when the last human leaves mid-game", async () => {
      const { code, seats } = await table(2);
      await seats[0].start();
      await seats[0].leave();
      await seats[1].leave();
      expect(await roomRow(code)).toBeUndefined();
    });

    it("rematch (host only, finished only) returns to a clean lobby and drops leavers", async () => {
      const { code, seats } = await table(3);
      await seats[0].start();
      await expectError(seats[0].rematch(), "bad_phase");
      await seats[2].leave(); // mid-game leaver
      await setup(code, { seat: 0, hands: { 0: ["AS"], 1: ["5C"], 2: ["9D"] } });
      await seats[0].play(["AS"]);
      await seats[1].pass();
      const fin = await settle(code, seats[1], "finished", 7, 5);
      expect(fin.status).toBe("finished");

      await expectError(seats[1].rematch(), "not_host");
      const lobby = await seats[0].rematch();
      expect(lobby.status).toBe("lobby");
      expect(lobby.players.map((p: View) => p.name)).toEqual(["Host", "P1"]);
      expect(lobby.players.map((p: View) => p.seat)).toEqual([0, 1]);
      expect(lobby.players.every((p: View) => p.cards === 0 && !p.auto && !p.left)).toBe(true);
      expect(lobby.pile).toBe(0);
      expect(lobby.winner).toBeNull();
      await assertInvariants(code);

      const again = await seats[0].start();
      expect(again.status).toBe("turn");
      await assertInvariants(code);
    });
  });

  // ---- concurrency ---------------------------------------------------------------------------
  describe("concurrency", () => {
    it("many simultaneous polls at a due moment apply the bot move exactly once", async () => {
      const host = new Seat(db, "Host");
      const v0 = await host.create({ bots: 1 });
      const code = v0.code as string;
      await host.start();
      await setup(code, { seat: 1, hands: { 0: ["AS", "5C"], 1: ["AH", "9D", "KD"] } });
      await db.sql("update game.rooms set status='turn', act_at = clock_timestamp() - interval '1 second', deadline = null where code = $1", [code]);
      const before = (await roomRow(code)).turns as number;
      const results = await Promise.all(Array.from({ length: 16 }, () => host.state()));
      expect(results.every((r) => r.status === "challenge" || r.status === "turn" || r.status === "reveal")).toBe(true);
      expect(results.filter((r) => r.adv)).toHaveLength(1);
      expect((await roomRow(code)).turns).toBe(before + 1);
      await assertInvariantsLoose(code);
    });

    it("random concurrent actions never corrupt a game (no deadlocks, cards conserved)", async () => {
      const { code, seats } = await table(4);
      await seats[0].start();
      const ok = new Set(["bad_phase", "not_your_turn", "bad_cards", "not_in_room"]);
      let errors = 0;
      for (let round = 0; round < 60; round++) {
        const views = await Promise.all(seats.map((s) => s.state()));
        const tasks: Promise<unknown>[] = [];
        views.forEach((v, i) => {
          if (v.status === "finished") return;
          if (v.me.canPlay) tasks.push(seats[i].play(v.me.hand.slice(0, 1 + (round % 3))));
          else if (v.me.canCall) tasks.push(round % 5 === 0 ? seats[i].callBluff() : seats[i].pass());
          tasks.push(seats[(i + 1) % 4].state()); // concurrent pollers
          tasks.push(seats[(i + 2) % 4].callBluff()); // deliberately racy calls
        });
        const res = await Promise.allSettled(tasks);
        for (const r of res) {
          if (r.status === "rejected") {
            errors++;
            const m = (r.reason as Error).message;
            expect(ok.has(m), `unexpected failure: ${m}`).toBe(true);
          }
        }
        await db.shift(code, 1.5);
        await assertInvariants(code);
        if ((await roomRow(code)).status === "finished") break;
      }
      expect(errors).toBeGreaterThanOrEqual(0);
    });
  });

  // ---- full games ---------------------------------------------------------------------------
  describe("full games with bots", () => {
    interface GameStats { turns: number; calls: number; plays: number; pickups: number; winnerIsBot: boolean; capped: boolean }

    async function playGame(humans: number, bots: number, speed: string): Promise<GameStats> {
      const seats: Seat[] = [];
      const host = new Seat(db, "H0");
      const v0 = await host.create({ speed, bots });
      seats.push(host);
      for (let i = 1; i < humans; i++) {
        const s = new Seat(db, `H${i}`);
        await s.join(v0.code);
        seats.push(s);
      }
      const code = v0.code as string;
      await host.start();

      const seen = new Set<number>();
      const st: GameStats = { turns: 0, calls: 0, plays: 0, pickups: 0, winnerIsBot: false, capped: false };
      let finished: View = null;

      for (let tick = 0; tick < 6000 && !finished; tick++) {
        for (const s of seats) {
          const v = await s.state();
          for (const e of v.log as View[]) {
            if (seen.has(e.n)) continue;
            seen.add(e.n);
            if (e.k === "play") st.plays++;
            if (e.k === "call") {
              st.calls++;
              if (e.b) st.pickups++;
            }
          }
          if (v.status === "finished") {
            finished = v;
            break;
          }
          if (v.me.canPlay) {
            const rank = v.turn.rank as string;
            const honest = (v.me.hand as string[]).filter((c) => c.slice(0, -1) === rank);
            const cards = honest.length ? honest : [v.me.hand[Math.floor(Math.random() * v.me.hand.length)]];
            await s.play(cards);
          } else if (v.me.canPass && !v.me.passed) {
            if (Math.random() < 0.15) await s.callBluff();
            else await s.pass();
          }
        }
        await db.shift(code, 1.3);
        if (tick % 40 === 0) await assertInvariants(code);
      }
      expect(finished, "game did not finish").not.toBeNull();
      await assertInvariants(code);
      const row = await roomRow(code);
      const ps = await playerRows(code);
      st.turns = row.turns;
      st.capped = row.turns >= 400;
      const w = ps.find((p) => p.id === finished.winner)!;
      st.winnerIsBot = w.is_bot;
      if (!st.capped) expect(w.hand).toHaveLength(0);
      return st;
    }

    // [humans, bots, speed]
    const configs: [number, number, string][] = [
      [1, 1, "standard"], [1, 3, "standard"], [1, 3, "blitz"], [1, 7, "standard"],
      [2, 2, "standard"], [3, 0, "standard"], [2, 0, "relaxed"], [4, 4, "blitz"],
    ];

    it.each(configs)("%iH + %iB (%s): games terminate with a valid winner and conserved cards", async (h, b, speed) => {
      const stats: GameStats[] = [];
      for (let i = 0; i < 3; i++) stats.push(await playGame(h, b, speed));
      const avg = (f: (s: GameStats) => number) => Math.round(stats.reduce((a, s) => a + f(s), 0) / stats.length);
      const turns = avg((s) => s.turns);
      const calls = avg((s) => s.calls);
      console.log(
        `sim ${h}H+${b}B ${speed.padEnd(8)} turns≈${String(turns).padStart(3)}  calls≈${String(calls).padStart(3)} ` +
          `(${Math.round((100 * calls) / Math.max(1, avg((s) => s.plays)))}% of plays)  right-calls≈${String(avg((s) => s.pickups)).padStart(3)}  capped=${stats.filter((s) => s.capped).length}`,
      );
      expect(stats.some((s) => s.capped), "hit the turn cap").toBe(false);
    }, 600_000);
  });
});
