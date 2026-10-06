# Liar's Hand

A realtime multiplayer **bluffing card game** — play cards face-down, claim anything, call your friends' bluffs, and be the first to empty your hand. Play with friends via a 6-letter room code, or jump straight into a game against bots. No accounts, no installs.

React + TypeScript + Vite + Tailwind on the front, **Supabase (Postgres)** on the back. All game rules run **inside the database**, so the server is the only referee: nobody can peek at your hand, play out of turn, or fake a result.

## How to play

1. One 52-card deck is dealt out. 2–8 players (bots can fill seats).
2. The **required rank advances every turn**: A, 2, 3 … K, A …
3. On your turn, play **1–4 cards face-down** and claim they are all the required rank. You may lie.
4. A short **challenge window** opens. Everyone else can **call bluff** or **accept**.
5. If someone calls: the cards are revealed. If *any* card isn't the claimed rank, the liar picks up the whole pile — otherwise the **caller** does.
6. First player to **empty their hand wins**. (Your last play can still be challenged.)

Turn timers run on the server. If you go AFK you're auto-played, then put on autopilot; if you leave mid-game a bot takes over your cards.

## Architecture

```
 Browser (React) ──supabase-js RPC──▶  PostgREST ──▶ public.lh_*  (SECURITY DEFINER, the only API)
      ▲   ▲                                                │
      │   └── Realtime broadcast "ping" (optional) ◀───────┤
      └────── polling at server-reported deadlines         ▼
                                              game.rooms / game.players  (private schema, RLS on, no policies)
                                              game.advance(): bots, timers, challenge windows
```

* **Private tables.** Everything lives in the `game` schema, which is never exposed through the Data API and has RLS enabled with no policies. The only entry points are the 13 `public.lh_*` functions, which are `SECURITY DEFINER` *by design*. (Supabase's advisor will flag that; it is intentional — see the header of the engine migration.)
* **Identity without accounts.** Each device keeps a random 192-bit token in `localStorage`; only its SHA-256 hash is stored. Every RPC carries the token; each function checks it, the phase and the turn. A player's view contains only *their own* cards.
* **No worker process.** Bots, turn timers and challenge windows advance **lazily**: every state poll (and every action) first applies any due transition under the room's row lock (`game.advance`). The game keeps moving as long as one human has the page open, and nothing stalls if the player whose turn it is closes their tab. Clients poll right at the server-reported `due` time, so transitions feel instant.
* **Realtime is optional.** After a change, clients broadcast a tiny "ping" on a Realtime channel so others refetch immediately. If Realtime is blocked or disabled the game falls back to fast polling — nothing else changes.
* **Concurrency.** Each mutating call locks the room row first (`FOR UPDATE`), then touches player rows: one writer per room, a fixed lock order, no deadlocks (covered by a concurrency test).

Server-controlled seats (bots, AFK players, leavers) share the same heuristics: they play honestly when they can, bluff with the cards that will be least useful to them, and call bluff using what they can prove (only four of any rank exist), how many cards the player has left, and their personality (`cautious`, `balanced`, `reckless`, `paranoid`).

## Security & abuse protection

The engine was reviewed adversarially (information leaks, privilege escalation, wedged states, DoS) and every confirmed finding has a regression test in `tests/db/hardening.test.ts`. What that gives you:

* **Nobody can see or fake anything.** Other players' hands and the face-down pile never leave the database; every action is validated against phase, turn and ownership. Card arrays are shape-checked at the API *and* constrained in storage (Postgres arrays can otherwise carry custom lower bounds or extra dimensions).
* **No internal errors reach clients.** The engine's own errors are stable codes (`not_your_turn`, `bad_cards`, …); anything unexpected becomes a bare `server_error` and the details stay in the server log. All functions pin `search_path = pg_catalog, pg_temp`.
* **Abuse limits.** Room creation is limited per device (20/hour) and per client address (120/hour, via the proxy's `cf-connecting-ip`), counting creations rather than live rooms. (For that, the caller's address from the proxy header is stored next to the creation event for 2 hours and then purged; nothing else about a visitor is recorded.) The global room cap (default 5000, `alter database … set lh.room_cap = '20000'`) retires the longest-idle lobbies instead of locking everyone out. Names, codes, ban lists and card arrays are bounded and normalised (invisible/bidi characters stripped, full-width and no-break look-alikes folded).
* **Self-healing rooms.** A host who vanishes hands the role on after 60 s of silence; a player who leaves on their turn is replaced instantly; leaving always works, even if a room is wedged.
* **Room codes are 6 characters** (~887M combinations) so lobbies can't be found by guessing.

Known limits — worth knowing before a large public launch:

* Anyone holding the (public) API key can create rooms; the limits above blunt that but a determined botnet needs an edge rate-limiter (e.g. Cloudflare) in front.
* Look-alike names using *different alphabets* (Cyrillic "Н" for Latin "H") are not detected.
* The Realtime channel `lh:<code>` is a public broadcast: anyone who knows a code can send "ping"s. Clients throttle them (≤ 2 refreshes/s), so the worst case is wasted polling, never wrong data.
* Device tokens travel in request bodies — keep request/statement logging off for the API.

## Run it locally

You need Node 20+.

```bash
npm install
cp .env.example .env.local     # then fill in the two VITE_SUPABASE_* values
npm run dev                    # http://localhost:8080
```

### Backend option A — the real Supabase stack (needs Docker)

```bash
supabase start                 # prints the local API URL and publishable/anon key
supabase db reset              # applies supabase/migrations/*
# put the printed URL + key into .env.local
```

### Backend option B — lightweight (any Postgres, no Supabase stack)

`scripts/dev-api.mjs` serves the app's RPC calls straight from Postgres (as the `anon` role, like PostgREST). Realtime isn't included, so the app uses polling.

```bash
docker run -d --name lh-pg -e POSTGRES_PASSWORD=postgres -p 127.0.0.1:54399:5432 postgres:16-alpine
DEV_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54399/postgres npm run dev:api      # :54321
# .env.local → VITE_SUPABASE_URL=http://127.0.0.1:54321  VITE_SUPABASE_PUBLISHABLE_KEY=dev  VITE_REALTIME=off
```

Handy for solo testing: open the app with `?as=alice` and `?as=bob` in two tabs to get two independent identities in one browser.

### UI playground (no backend at all)

Every screen can be previewed from hand-written snapshots (`src/dev/fixtures.ts`), which is how the interface was built and screenshot-tested:

```bash
npm run dev:ui                                    # → /dev/game.html?state=turn-mine
# other states:  turn-theirs · turn-bot · turn-auto · challenge-call · challenge-accused · reveal-bluff · reveal-honest · eight-players …
# lobby / join / game-over / error screens:  /dev/shell.html?state=lobby-host | finished-win | preview | error-room_not_found | …   (?page=home)
```

## Tests

| Command | What it covers |
| --- | --- |
| `npm run typecheck` / `npm run lint` | TypeScript (app, UI playground, tests) and ESLint |
| `npm test` | Unit tests for the client sync layer (polling at server deadlines, backoff, clock skew, stale-response handling, double-submit protection, error recovery) and the pure helpers. DB tests are skipped unless `TEST_DATABASE_URL` is set |
| `npm run test:db` | The engine, against a throwaway Postgres in Docker: lobby rules, privacy (no card ever leaks, `anon` can't touch tables), every phase transition, timers/AFK, leaving, rematch, concurrency races, and full bot-driven games with card-conservation checks |
| `npm run e2e` | Playwright drives the real UI against the real engine on a phone-sized viewport: solo game vs bots, invite link → two humans + a bot, reload restores your seat, finish + rematch, kicking, error screens. Needs a Postgres (see `playwright.config.ts`). `E2E_VISUAL=1 npm run e2e` runs the screenshot tour on mobile + desktop instead |

`TEST_DATABASE_URL=<superuser url> npm run test:db` uses your own Postgres instead of Docker. `.github/workflows/ci.yml` runs all of it (verify, engine, e2e) on every push and pull request.

## Deploy

**1. Database** — one migration creates the private `game` schema and the public API. Use a fresh Supabase project (the migration adds only the `game` schema and the 13 `public.lh_*` functions; it creates no tables in `public`):

```bash
supabase login
supabase link --project-ref <your-project-ref>      # asks for the database password
supabase db push
```

**2. Frontend (Vercel)** — the repo does not commit `.env`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the Vercel project (Production **and** Preview), then deploy — a push to `main` does it when the project is Git-connected. `vercel.json` provides the SPA fallback (deep links like `/r/ABCDEF`), immutable asset caching and security headers including a CSP. The CSP's `connect-src` allows `https://*.supabase.co` / `wss://*.supabase.co`; **if you use a custom Supabase domain, add it there.**

**3. Optional housekeeping** — abandoned rooms are also cleaned up opportunistically whenever a room is created. To sweep on a schedule with `pg_cron`:

```sql
select cron.schedule('lh-cleanup', '*/30 * * * *',
  $$ delete from game.rooms r where r.last_active < now() - interval '6 hours'
       and not exists (select 1 from game.players p where p.room_id = r.id and p.last_seen > now() - interval '6 hours') $$);
```

> The Supabase project doesn't need Auth, anonymous sign-ins or any dashboard toggles. Realtime Broadcast is used only as an accelerator.

## Project layout

```
supabase/migrations/   the engine: tables, rules, bots, API (a single migration)
src/lib/               types (server contract), api client, sync engine (polling/realtime/clock), sound
src/hooks/             useRoom, useServerNow/useCountdown
src/components/game/   cards, hand, seats, table, action bar, reveal overlay
src/components/shell/  logo, rules, toaster, error boundary, banners
src/pages/             Home, Lobby, Join, Game over, Room switchboard
src/dev/ + dev/        fixtures for every game phase and a harness to preview screens without a backend
tests/db/              engine tests          tests/unit/  client logic          tests/e2e/   Playwright specs
scripts/               test-db.sh, dev-api.mjs, generate-brand-assets.mjs
```

## Tuning

Game feel lives in a few SQL functions (new migration to change them): `game.speed_*_seconds` (turn/challenge timers), `game.style` (bot personalities: `lie`, `greed`, `sus`), `game.plan_bot_call` (when bots call bluff) and `game.choose_play` (what they play). The simulation in `npm run test:db` prints average game length and call rates so changes are easy to evaluate.

## Troubleshooting

* *"The game server isn't set up yet"* — the migrations haven't been applied to the project in `VITE_SUPABASE_URL`.
* *Updates feel a second slow* — Realtime is blocked; the game polls instead. Nothing is broken.
* *"You're not part of this room" after clearing site data* — your device token is gone; ask the host to start a new game, or join a lobby again.
