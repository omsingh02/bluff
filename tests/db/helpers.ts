import { Pool, Client } from "pg";
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/** Superuser connection string for a scratch Postgres (see scripts/test-db.sh). Tests skip when unset. */
export const ADMIN_URL = process.env.TEST_DATABASE_URL;
export const hasDb = Boolean(ADMIN_URL);

const MIGRATIONS = path.resolve(__dirname, "../../supabase/migrations");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type View = any;

export const tok = () => randomBytes(24).toString("hex");

/** pg emits 'error' on a client the server terminates (e.g. DROP DATABASE … FORCE at teardown); never let that be uncaught. */
const ignoreErrors = () => undefined;

const CAST: Record<string, string> = {
  p_player: "uuid",
  p_cards: "text[]",
  p_bots: "int",
  p_start: "boolean",
};

export interface TestDb {
  /** Call a public.leery_* function as the `anon` role (exactly what PostgREST does). */
  rpc: (fn: string, args: Record<string, unknown>) => Promise<View>;
  /** Run arbitrary SQL as superuser (inspection / scenario setup). */
  sql: <T = Record<string, unknown>>(q: string, params?: unknown[]) => Promise<T[]>;
  /** Pretend `seconds` have passed in a room by moving every stored timestamp into the past. */
  shift: (code: string, seconds: number) => Promise<void>;
  /** A direct anon connection for privilege tests. */
  anon: () => Promise<Client>;
  close: () => Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  if (!ADMIN_URL) throw new Error("TEST_DATABASE_URL is not set");
  const admin = new Client({ connectionString: ADMIN_URL });
  admin.on("error", ignoreErrors);
  await admin.connect();
  await admin.query(`do $$ begin
    if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  end $$`);
  const name = `leery_test_${randomBytes(4).toString("hex")}`;
  await admin.query(`create database ${name}`);

  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  const dbUrl = url.toString();

  const setup = new Client({ connectionString: dbUrl });
  await setup.connect();
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) await setup.query(readFileSync(path.join(MIGRATIONS, f), "utf8"));
  await setup.end();

  const adminPool = new Pool({ connectionString: dbUrl, max: 4 });
  adminPool.on("error", ignoreErrors);
  adminPool.on("connect", (c) => c.on("error", ignoreErrors));
  // Every connection runs as `anon` from the start (what PostgREST does for unauthenticated requests).
  const anonPool = new Pool({ connectionString: dbUrl, max: 24, options: "-c role=anon" });
  anonPool.on("error", ignoreErrors);
  anonPool.on("connect", (c) => c.on("error", ignoreErrors));

  const rpc: TestDb["rpc"] = async (fn, args) => {
    const keys = Object.keys(args);
    const named = keys.map((k, i) => `${k} => $${i + 1}::${CAST[k] ?? "text"}`).join(", ");
    const res = await anonPool.query(`select public.${fn}(${named}) as r`, keys.map((k) => args[k]));
    return res.rows[0].r;
  };

  const sql: TestDb["sql"] = async <T,>(q: string, params: unknown[] = []) =>
    (await adminPool.query(q, params)).rows as T[];

  const shift: TestDb["shift"] = async (code, seconds) => {
    await adminPool.query(
      `update game.rooms set
         deadline = deadline - make_interval(secs => $2),
         act_at = act_at - make_interval(secs => $2),
         turn_started_at = turn_started_at - make_interval(secs => $2),
         challenge_since = challenge_since - make_interval(secs => $2)
       where code = $1`,
      [code, seconds],
    );
    await adminPool.query(
      `update game.players set last_seen = last_seen - make_interval(secs => $2)
       where room_id = (select id from game.rooms where code = $1)`,
      [code, seconds],
    );
  };

  return {
    rpc,
    sql,
    shift,
    anon: async () => {
      const c = new Client({ connectionString: dbUrl, options: "-c role=anon" });
      c.on("error", ignoreErrors);
      await c.connect();
      return c;
    },
    close: async () => {
      // Let every pooled connection finish closing before the database is dropped from under it.
      await Promise.allSettled([anonPool.end(), adminPool.end()]);
      await admin.query(`drop database ${name} with (force)`);
      await admin.end();
    },
  };
}

/** Expect an RPC to fail with the engine's machine-readable message. */
export async function expectError(p: Promise<unknown>, code: string) {
  try {
    await p;
  } catch (e) {
    const msg = (e as Error).message;
    if (msg !== code) throw new Error(`expected error "${code}" but got "${msg}"`);
    return;
  }
  throw new Error(`expected error "${code}" but the call succeeded`);
}

/** A human at the table, identified by a device token. */
export class Seat {
  constructor(
    public db: TestDb,
    public name: string,
    public token = tok(),
    public code = "",
  ) {}

  call = (fn: string, extra: Record<string, unknown> = {}) =>
    this.db.rpc(fn, { p_token: this.token, p_code: this.code, ...extra });

  state = () => this.call("leery_get_state");
  play = (cards: string[]) => this.call("leery_play", { p_cards: cards });
  callBluff = () => this.call("leery_call");
  pass = () => this.call("leery_pass");
  resume = () => this.call("leery_resume");
  start = () => this.call("leery_start");
  addBot = () => this.call("leery_add_bot");
  setSpeed = (s: string) => this.call("leery_set_speed", { p_speed: s });
  rematch = () => this.call("leery_rematch");
  leave = () => this.call("leery_leave");
  kick = (id: string) => this.call("leery_remove_player", { p_player: id });
  join = async (code: string) => {
    this.code = code;
    return this.db.rpc("leery_join_room", { p_token: this.token, p_code: code, p_name: this.name });
  };
  create = async (opts: { speed?: string; bots?: number; start?: boolean } = {}) => {
    const v = await this.db.rpc("leery_create_room", {
      p_token: this.token,
      p_name: this.name,
      p_speed: opts.speed ?? "standard",
      p_bots: opts.bots ?? 0,
      p_start: opts.start ?? false,
    });
    this.code = v.code;
    return v as View;
  };
}

/** Card codes → set, ignoring order. */
export const set = (xs: string[]) => [...xs].sort();

const CARD_RE = /"((?:10|[2-9AJQK])[SHDC])"/g;
/** Every card code that appears anywhere in a JSON-serialisable value. */
export function cardsIn(v: unknown): string[] {
  return [...JSON.stringify(v).matchAll(CARD_RE)].map((m) => m[1]);
}

/** Shared scenario helpers: a table of humans, direct row access, deterministic positions. */
export function scenario(db: TestDb) {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roomRow = async (code: string) => (await db.sql<Record<string, any>>("select * from game.rooms where code = $1", [code]))[0];
  const playerRows = (code: string) =>
    db.sql<{ id: string; seat: number; name: string; hand: string[]; missed: number; auto: boolean; has_left: boolean; is_host: boolean; is_bot: boolean }>(
      "select p.* from game.players p join game.rooms r on r.id = p.room_id where r.code = $1 order by p.seat",
      [code],
    );
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
  const setLastSeen = (code: string, seat: number, ago: string) =>
    db.sql(
      `update game.players set last_seen = now() - $3::interval
       where room_id = (select id from game.rooms where code = $1) and seat = $2`,
      [code, seat, ago],
    );
  return { table, roomRow, playerRows, setup, setLastSeen };
}
