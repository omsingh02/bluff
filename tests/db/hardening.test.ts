import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, expectError, hasDb, scenario, Seat, tok, type TestDb } from "./helpers";

/**
 * Regression tests for the findings of an independent adversarial review of the engine. Each test is
 * named after the attack or failure it prevents.
 */
describe.skipIf(!hasDb)("engine hardening", () => {
  let db: TestDb;
  let sc: ReturnType<typeof scenario>;

  beforeAll(async () => {
    db = await createTestDb();
    sc = scenario(db);
  });
  afterAll(async () => {
    await db?.close();
  });

  // ---- CRITICAL: array shape ------------------------------------------------------------------
  describe("card array shape (custom lower bounds / extra dimensions)", () => {
    it.each([
      ["a custom lower bound", "[7:7]={3H}"],
      ["lower bound 0", "[0:0]={3H}"],
      ["two dimensions", [["3H", "4D"], ["9C", "KC"]]],
      ["a nested single card", [["3H"]]],
    ])("rejects %s and leaves the game untouched", async (_label, cards) => {
      const { code, seats } = await sc.table(2);
      await seats[0].start();
      await sc.setup(code, { seat: 0, hands: { 0: ["3H", "4D", "9C", "KC"], 1: ["5C"] } });

      await expectError(seats[0].play(cards as unknown as string[]), "bad_cards");

      const v = await seats[0].state();
      expect(v.status).toBe("turn");
      expect(v.me.canPlay).toBe(true);
      expect(v.me.hand).toEqual(["3H", "4D", "9C", "KC"]);
      expect(v.pile).toBe(0);
      expect((await seats[0].play(["3H"])).status).toBe("challenge"); // a normal play still works
    });

    it("liar immunity is gone: a lie that empties the hand and is called does not win", async () => {
      const { code, seats } = await sc.table(2);
      await seats[0].start();
      await sc.setup(code, { seat: 0, hands: { 0: ["3H"], 1: ["5C"] } });
      await expectError(seats[0].play("[7:7]={3H}" as unknown as string[]), "bad_cards");
      await seats[0].play(["3H"]); // claims Ace — a lie, and the last card
      const v = await seats[1].callBluff();
      expect(v.reveal).toMatchObject({ bluff: true, cards: ["3H"], winner: null });
      expect(v.reveal.picker).toBe(v.reveal.accused);
    });

    it("storage refuses odd arrays even if the API check were bypassed", async () => {
      const { code } = await sc.table(2);
      await expect(db.sql("update game.rooms set pile = '[2:2]={KC}'::text[] where code = $1", [code])).rejects.toThrow(/rooms_pile_shape_chk/);
      await expect(
        db.sql("update game.players set hand = '{{AS,KS},{2S,3S}}'::text[] where room_id = (select id from game.rooms where code = $1)", [code]),
      ).rejects.toThrow(/players_hand_shape_chk/);
    });
  });

  // ---- abuse limits --------------------------------------------------------------------------
  describe("room creation limits", () => {
    it("counts creations, not live rooms: create-and-leave churn is still limited (20/hour per device)", async () => {
      const churn = new Seat(db, "Churn");
      for (let i = 0; i < 20; i++) {
        await churn.create({ bots: 1 });
        await churn.leave(); // the room disappears, the creation still counts
      }
      await expectError(churn.create(), "rate_limited");
      await new Seat(db, "Other").create(); // a different device is unaffected
    });

    it("limits per client address (120/hour), shared by every token behind it", async () => {
      const c = await db.anon();
      try {
        const as = (headers: Record<string, string>) => c.query("select set_config('request.headers', $1, false)", [JSON.stringify(headers)]);
        const create = () => c.query("select public.leery_create_room($1, 'Nat', 'standard', 0, false)", [tok()]);

        await as({ "cf-connecting-ip": "203.0.113.7" });
        for (let i = 0; i < 120; i++) await create();
        await expect(create()).rejects.toThrow("rate_limited");

        await as({ "cf-connecting-ip": "203.0.113.8" }); // another address is fine
        await create();

        await as({ "x-forwarded-for": "198.51.100.9, 10.0.0.1" }); // falls back to the first hop
        for (let i = 0; i < 120; i++) await create();
        await expect(create()).rejects.toThrow("rate_limited");
      } finally {
        await c.end();
      }
    });

    it("at the room cap, long-idle lobbies are retired instead of refusing everyone", async () => {
      const [{ n }] = await db.sql<{ n: number }>("select count(*)::int as n from game.rooms");
      const c = await db.anon();
      try {
        await c.query("select set_config('leery.room_cap', $1, false)", [String(n + 1)]);
        const create = () => c.query("select public.leery_create_room($1, 'Cap', 'standard', 0, false)", [tok()]);
        await create(); // takes the last slot
        await expect(create()).rejects.toThrow("too_many_rooms"); // everything is fresh: nothing to retire
        await db.sql("update game.rooms set last_active = now() - interval '2 hours' where status = 'lobby'");
        await create(); // idle lobbies were retired to make room
        const [{ n2 }] = await db.sql<{ n2: number }>("select count(*)::int as n2 from game.rooms");
        expect(n2).toBeLessThanOrEqual(n + 1);
      } finally {
        await c.end();
      }
    });
  });

  // ---- stranded host ------------------------------------------------------------------------
  describe("a vanished host", () => {
    it("a silent host hands the role to the longest-seated present human; a brief silence does not", async () => {
      const { code, seats } = await sc.table(3);
      await sc.setLastSeen(code, 0, "30 seconds");
      expect((await seats[2].state()).me.host).toBe(false);

      await sc.setLastSeen(code, 0, "90 seconds");
      const v = await seats[2].state(); // P2 polls first, but P1 has been seated longest
      expect(v.players.find((p: { host: boolean }) => p.host)?.name).toBe("P1");
      expect(v.log.at(-1)).toMatchObject({ k: "host", pn: "P1" });

      const p1 = await seats[1].state();
      expect(p1.me.host).toBe(true);
      expect((await seats[0].state()).me.host).toBe(false); // the returning old host is just a player now
      expect((await seats[1].start()).status).toBe("turn"); // and the new host can run the room
    });

    it("a host who vanishes after the game doesn't strand the rematch", async () => {
      const { code, seats } = await sc.table(2);
      await seats[0].start();
      await sc.setup(code, { seat: 0, hands: { 0: ["AH"], 1: ["5C"] } });
      await seats[0].play(["AH"]);
      await seats[1].pass();
      await db.shift(code, 1.2);
      expect((await seats[1].state()).status).toBe("finished");

      await expectError(seats[1].rematch(), "not_host");
      await sc.setLastSeen(code, 0, "120 seconds");
      expect((await seats[1].rematch()).status).toBe("lobby");
    });
  });

  // ---- autopilot / leaving ---------------------------------------------------------------------
  describe("server-controlled seats", () => {
    it("accepting a play cancels a call this seat had planned while on autopilot", async () => {
      const { code, seats } = await sc.table(2);
      await seats[0].start();
      await db.sql("update game.players set auto = true, missed = 2 where room_id = (select id from game.rooms where code = $1) and seat = 1", [code]);
      await sc.setup(code, { seat: 0, hands: { 0: ["3C", "9D"], 1: ["AS", "AH", "AD", "AC"] } }); // seat 1 holds every Ace
      await seats[0].play(["3C"]); // claims an Ace: provably false to seat 1 → a planned call
      expect((await sc.roomRow(code)).bot_caller).not.toBeNull();

      await seats[1].pass(); // the human is back and decides to let it slide
      expect((await sc.roomRow(code)).bot_caller).toBeNull();
      await db.shift(code, 7);
      expect((await seats[1].state()).status).toBe("turn"); // no phantom call
    });

    it("a player who leaves on their own turn doesn't stall the table", async () => {
      const { code, seats } = await sc.table(3);
      await seats[0].start();
      await sc.setup(code, { seat: 1, hands: { 0: ["AS", "2S"], 1: ["3S", "4S", "5S"], 2: ["6S", "7S"] } });
      await seats[1].leave();

      const room = await sc.roomRow(code);
      expect(room.deadline).toBeNull();
      expect(room.act_at).not.toBeNull();
      const v = await seats[2].state();
      expect(v.due - v.now).toBeLessThanOrEqual(2500);
      await db.shift(code, 3);
      expect((await seats[2].state()).status).toBe("challenge"); // the server played the abandoned move
    });

    it("a winner who leaves stays in the standings until the rematch", async () => {
      const { code, seats } = await sc.table(3);
      await seats[0].start();
      await sc.setup(code, { seat: 0, hands: { 0: ["AH"], 1: ["5C"], 2: ["9D"] } });
      await seats[0].play(["AH"]);
      await seats[1].pass();
      await seats[2].pass();
      await db.shift(code, 1.2);
      const fin = await seats[1].state();
      expect(fin.status).toBe("finished");

      await seats[0].leave();
      const after = await seats[1].state();
      expect(after.winner).toBe(fin.winner);
      expect(after.players.find((p: { id: string }) => p.id === fin.winner)).toMatchObject({ left: true });
      expect(after.players).toHaveLength(3);
      expect(after.me.host).toBe(true); // host moved on
      expect((await seats[1].rematch()).players).toHaveLength(2);
    });

    it("a returning player whose own poll starts their turn gets the full timer", async () => {
      const { code, seats } = await sc.table(2);
      await seats[0].start();
      await sc.setup(code, { seat: 0, hands: { 0: ["AS", "5C"], 1: ["9D", "8D"] } });
      await seats[0].play(["AS"]);
      await sc.setLastSeen(code, 1, "60 seconds"); // seat 1 has been silent for a minute…
      await db.shift(code, 7); // …and the window ran out
      const v = await seats[1].state(); // their OWN poll opens their turn
      expect(v.turn.player).toBe(v.me.id);
      expect(v.turn.deadline - v.now).toBeGreaterThan(40_000); // full 45s, not the 10s short fuse
    });
  });

  // ---- information leaks ---------------------------------------------------------------------
  describe("timing side channel", () => {
    it("the advertised due time during a challenge never reveals a server seat's planned call", async () => {
      for (const botHoldsAces of [true, false]) {
        const host = new Seat(db, "Host");
        const v0 = await host.create({ bots: 1, speed: "blitz" });
        await host.start();
        await sc.setup(v0.code, { seat: 0, hands: { 0: ["3C", "4C", "5D"], 1: botHoldsAces ? ["AS", "AH", "AD", "AC"] : ["2S", "2H", "2D", "2C"] } });
        await host.play(["3C", "4C"]);
        const planned = (await sc.roomRow(v0.code)).bot_caller !== null;
        if (botHoldsAces) expect(planned).toBe(true); // a provable lie is always called; without Aces it's only a hunch
        const v = await host.state();
        expect(v.status).toBe("challenge");
        expect(v.due - v.now).toBeLessThanOrEqual(800); // "check again soon" either way
        expect(v.due - v.now).toBeGreaterThan(0);
      }
    });
  });

  // ---- names, inputs ---------------------------------------------------------------------------
  describe("names and inputs", () => {
    it("rejects invisible-only names and strips invisible/bidi characters", async () => {
      const { code } = await sc.table(1);
      for (const bad of ["\u200b", "\u200d", "\ufe0f\u200d", "\u202e", "   ", "\u00a0\u00a0", "\u2800", "\u{e0041}"]) {
        await expectError(new Seat(db, bad).join(code), "name_invalid");
      }
      const v = await new Seat(db, "ab\u202ecd\u200bef\u0007").join(code);
      expect(v.players.map((p: { name: string }) => p.name)).toContain("abcdef");
    });

    it("blocks look-alike impersonation (zero-width, no-break space, full-width, case)", async () => {
      const { code } = await sc.table(1); // the host is called "Host"
      for (const twin of ["Host\u200b", "Host\u00a0", "\uff28\uff4f\uff53\uff54", "hOsT", "Ho\u200bst"]) {
        await expectError(new Seat(db, twin).join(code), "name_taken");
      }
    });

    it("emoji names are welcome", async () => {
      const { code } = await sc.table(1);
      const v1 = await new Seat(db, "🔥 Fire").join(code);
      const v2 = await new Seat(db, "🔥").join(code);
      const v3 = await new Seat(db, "👨‍👩‍👧").join(code);
      expect(v3.players.map((p: { name: string }) => p.name)).toEqual(expect.arrayContaining(["🔥 Fire", "🔥", "👨‍👩‍👧"]));
      expect(v1.players.length + v2.players.length).toBeGreaterThan(0);
    });

    it("absurd inputs fail fast instead of burning CPU", async () => {
      const { code } = await sc.table(1);
      const t0 = Date.now();
      await expectError(new Seat(db, "x".repeat(2_000_000)).join(code), "name_invalid");
      await expectError(db.rpc("leery_get_state", { p_token: tok(), p_code: "A".repeat(2_000_000) }), "room_not_found");
      expect(Date.now() - t0).toBeLessThan(1500);
    });

    it("the ban list is bounded: the oldest entries age out, recent ones stay banned", async () => {
      const host = new Seat(db, "Host");
      const { code } = await host.create();
      const tokens: string[] = [];
      for (let i = 0; i < 70; i++) {
        const g = new Seat(db, `G${i}`);
        await g.join(code);
        tokens.push(g.token);
        const v = await host.state();
        await host.kick(v.players.find((p: { name: string }) => p.name === `G${i}`).id);
      }
      const [{ n }] = await db.sql<{ n: number }>("select cardinality(banned) as n from game.rooms where code = $1", [code]);
      expect(n).toBeLessThanOrEqual(64);
      await expectError(new Seat(db, "Newest", tokens[69]).join(code), "banned");
      expect((await new Seat(db, "Oldest", tokens[0]).join(code)).players.length).toBe(2); // aged out
    });
  });

  // ---- error hygiene ------------------------------------------------------------------------
  describe("unexpected failures", () => {
    it("never leak internals, and leaving still works when the room is wedged", async () => {
      const { code, seats } = await sc.table(2);
      await seats[0].start();
      // Make every hand update blow up with a message that contains the (secret) hand.
      await db.sql(`
        create function game.test_boom() returns trigger language plpgsql as $f$
        begin raise exception 'secret detail: %', old.hand using errcode = '22000'; end $f$;
        create trigger test_boom before update of hand on game.players for each row execute function game.test_boom();`);
      try {
        await sc.setup(code, { seat: 0, hands: { 0: ["AS", "2S"], 1: ["3S"] } }).catch(() => undefined);
        await db.sql("alter table game.players disable trigger test_boom");
        await sc.setup(code, { seat: 0, hands: { 0: ["AS", "2S"], 1: ["3S"] } });
        await db.sql("alter table game.players enable trigger test_boom");
        await expectError(seats[0].play(["AS"]), "server_error"); // generic: no hand, no Postgres detail
        await seats[1].leave(); // …yet leaving is unaffected (it never steps the engine)
        await seats[0].leave();
        expect(await sc.roomRow(code)).toBeUndefined();
      } finally {
        await db.sql("drop trigger if exists test_boom on game.players; drop function if exists game.test_boom()");
      }
    });

    it("a misconfigured setting surfaces as a generic server_error", async () => {
      const c = await db.anon();
      try {
        await c.query("select set_config('leery.room_cap', 'abc', false)");
        await expect(c.query("select public.leery_create_room($1, 'X', 'standard', 0, false)", [tok()])).rejects.toThrow(/^server_error$/);
      } finally {
        await c.end();
      }
    });
  });

  // ---- static properties of the schema ---------------------------------------------------------
  describe("privileges and function configuration", () => {
    it("every function pins search_path with pg_temp last", async () => {
      const rows = await db.sql<{ n: string }>(
        `select p.oid::regprocedure::text as n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
         where s.nspname in ('game', 'public') and (p.proconfig is null or p.proconfig::text not like '%search_path=pg_catalog, pg_temp%')`,
      );
      expect(rows).toEqual([]);
    });

    it("anon has exactly the 13 public entry points and nothing else", async () => {
      const exec = await db.sql<{ n: string }>(
        `select p.proname as n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
         where s.nspname in ('game', 'public') and has_function_privilege('anon', p.oid, 'EXECUTE') order by 1`,
      );
      expect(exec.map((r) => r.n)).toEqual(
        ["leery_add_bot", "leery_call", "leery_create_room", "leery_get_state", "leery_join_room", "leery_leave", "leery_pass", "leery_play", "leery_rematch", "leery_remove_player", "leery_resume", "leery_set_speed", "leery_start"],
      );
      const [{ usage }] = await db.sql<{ usage: boolean }>("select has_schema_privilege('anon', 'game', 'USAGE') as usage");
      expect(usage).toBe(false);
      const tables = await db.sql<{ t: string }>(
        `select c.relname as t from pg_class c join pg_namespace s on s.oid = c.relnamespace
         where s.nspname = 'game' and c.relkind = 'r' and (has_table_privilege('anon', c.oid, 'SELECT') or has_table_privilege('authenticated', c.oid, 'INSERT'))`,
      );
      expect(tables).toEqual([]);
    });
  });
});
