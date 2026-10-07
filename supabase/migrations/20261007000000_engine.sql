-- =====================================================================================
-- Leery — server-authoritative game engine
-- =====================================================================================
--
-- THE GAME (a.k.a. "I Doubt It" / "Cheat")
--   One 52-card deck is dealt around the table (2–8 players, bots allowed). The required rank
--   advances every turn: A, 2, 3 … K, A … The current player plays 1–4 cards FACE-DOWN and claims
--   they are all that rank (they may lie). A short challenge window opens: any other player may
--   call bluff or accept. If called, the cards are revealed: if any card isn't the claimed rank the
--   liar picks up the whole pile, otherwise the caller does. First player to empty their hand wins
--   (the last play can still be challenged).
--
-- STATE MACHINE (rooms.status)
--   lobby ──start──▶ turn ──play──▶ challenge ──window ends / all accept──▶ turn | finished
--                                      │
--                                      └──call──▶ reveal ──timer──▶ turn | finished
--   finished ──rematch──▶ lobby
--
-- SECURITY MODEL
--   * All tables live in the private `game` schema (never exposed through the Data API) with RLS
--     enabled and no policies, and no privileges for anon/authenticated.
--   * The only way in is the `public.leery_*` functions below. They are SECURITY DEFINER *on purpose*
--     (they ARE the API): every call must present a random device token whose SHA-256 hash is the
--     player's identity. Each function validates turn/phase/ownership server-side and only ever
--     returns the caller's own hand — other players' cards never leave the database.
--   * Supabase's advisors will flag these functions as "SECURITY DEFINER executable by anon".
--     That is expected and intentional for this design.
--
-- ABUSE LIMITS
--   Room creation is rate-limited per device token (20/hour) and per client address when the HTTP layer
--   exposes one (120/hour, `cf-connecting-ip`), counting creations rather than live rooms. The global
--   room cap (default 5000, `leery.room_cap`) retires the longest-idle lobbies instead of refusing everyone.
--   Banned-token lists, names, codes and card arrays are all bounded and validated before any real work.
--
-- TIME / BOTS
--   There is no worker process. Timers and bots are advanced LAZILY: every `leery_get_state` poll (and
--   every action) first applies any due transitions under the room's row lock (`game.advance`), so
--   a game keeps moving as long as at least one human has the page open, and nothing breaks if the
--   player whose turn it is closes their tab (they are auto-played, then put on autopilot).
--
-- CONCURRENCY
--   Every mutating call locks the room row (`FOR UPDATE`) first, then touches player rows, so there
--   is a single writer per room and a fixed lock order (room → players).
-- =====================================================================================

create schema if not exists game;
revoke all on schema game from public, anon, authenticated;
comment on schema game is 'Leery engine. Private: not exposed through the Data API.';

-- -------------------------------------------------------------------------------------
-- Tables
-- -------------------------------------------------------------------------------------

create table game.rooms (
  id                uuid primary key default gen_random_uuid(),
  code              text not null,
  status            text not null default 'lobby',
  version           integer not null default 0,          -- bumped by trigger on every update
  speed             text not null default 'standard',
  turn_seconds      integer not null default 45,
  challenge_seconds integer not null default 6,
  seat_turn         integer not null default 0,          -- seat that plays (or will play) next
  rank_idx          integer not null default 0,          -- required rank index (0 = A … 12 = K)
  pile              text[] not null default '{}',        -- face-down centre pile, play order
  play_seat         integer,                             -- seat of the pending (challengeable) play
  play_count        integer not null default 0,          -- how many cards that play contained
  turn_started_at   timestamptz,
  challenge_since   timestamptz,
  deadline          timestamptz,                         -- human turn timer / challenge end / reveal end
  act_at            timestamptz,                         -- bot move time (turn) or bot call time (challenge)
  bot_caller        uuid,                                -- bot that will call bluff in this window
  passed            uuid[] not null default '{}',        -- players who accepted the pending play
  reveal            jsonb,
  winner            uuid,
  banned            text[] not null default '{}',        -- token hashes kicked by the host
  log               jsonb not null default '[]',
  log_seq           integer not null default 0,
  turns             integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  last_active       timestamptz not null default now(),
  constraint rooms_code_key unique (code),
  constraint rooms_status_chk check (status in ('lobby', 'turn', 'challenge', 'reveal', 'finished')),
  constraint rooms_speed_chk check (speed in ('relaxed', 'standard', 'blitz')),
  constraint rooms_rank_chk check (rank_idx between 0 and 12),
  -- Postgres arrays can carry custom lower bounds and extra dimensions. The engine slices the pile by
  -- position, so only plain 1-D arrays starting at 1 may ever be stored.
  constraint rooms_pile_shape_chk check (cardinality(pile) = 0 or (array_ndims(pile) = 1 and array_lower(pile, 1) = 1))
);

create index rooms_last_active_idx on game.rooms (last_active);

create table game.players (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references game.rooms (id) on delete cascade,
  token_hash text,                                       -- null for bots
  seat       integer not null,
  name       text not null,
  color      integer not null default 0,
  is_host    boolean not null default false,
  is_bot     boolean not null default false,
  style      text,
  auto       boolean not null default false,             -- server plays for this human (AFK)
  has_left   boolean not null default false,             -- left mid-game; seat is played out by a bot
  missed     integer not null default 0,                 -- consecutive timed-out turns
  hand       text[] not null default '{}',               -- PRIVATE: only ever returned to its owner
  last_seen  timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint players_seat_key unique (room_id, seat) deferrable initially deferred,
  constraint players_name_chk check (char_length(name) between 1 and 16),
  constraint players_style_chk check (style is null or style in ('cautious', 'balanced', 'reckless', 'paranoid')),
  constraint players_hand_shape_chk check (cardinality(hand) = 0 or (array_ndims(hand) = 1 and array_lower(hand, 1) = 1))
);

create unique index players_room_token_key on game.players (room_id, token_hash) where token_hash is not null;
create unique index players_room_name_key on game.players (room_id, lower(name));
create index players_room_seen_idx on game.players (room_id, last_seen);

-- Room-creation events (kept ~2 hours) for rate limiting. Counting creations rather than live rooms
-- means that creating a room and immediately leaving it still counts.
create table game.create_log (
  at         timestamptz not null default clock_timestamp(),
  token_hash text not null,
  client     text not null
);
create index create_log_at_idx on game.create_log (at);
create index create_log_token_idx on game.create_log (token_hash, at);
create index create_log_client_idx on game.create_log (client, at);

alter table game.rooms enable row level security;
alter table game.players enable row level security;
alter table game.create_log enable row level security;
-- No policies on purpose: nothing but the SECURITY DEFINER API below may touch these tables.
revoke all on game.rooms, game.players, game.create_log from public;
revoke all on game.rooms, game.players, game.create_log from anon, authenticated;

create function game.rooms_touch() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  new.version := old.version + 1;
  new.updated_at := clock_timestamp();
  -- last_active is indexed: refresh it at most once a minute so ordinary updates stay HOT.
  if clock_timestamp() - old.last_active > interval '1 minute' then
    new.last_active := clock_timestamp();
  end if;
  return new;
end
$$;

create trigger rooms_touch before update on game.rooms
  for each row execute function game.rooms_touch();

-- -------------------------------------------------------------------------------------
-- Pure helpers
-- -------------------------------------------------------------------------------------

create function game.ms(t timestamptz) returns bigint
language sql immutable set search_path = pg_catalog, pg_temp
as $$ select (extract(epoch from t) * 1000)::bigint $$;

create function game.ranks() returns text[]
language sql immutable set search_path = pg_catalog, pg_temp
as $$ select array['A','2','3','4','5','6','7','8','9','10','J','Q','K'] $$;

create function game.suits() returns text[]
language sql immutable set search_path = pg_catalog, pg_temp
as $$ select array['S','H','D','C'] $$;

create function game.rank_of(c text) returns text
language sql immutable set search_path = pg_catalog, pg_temp
as $$ select left(c, -1) $$;

create function game.rank_pos(r text) returns integer
language sql immutable set search_path = pg_catalog, pg_temp
as $$ select array_position(game.ranks(), r) - 1 $$;

create function game.card_order(c text) returns integer
language sql immutable set search_path = pg_catalog, pg_temp
as $$ select game.rank_pos(left(c, -1)) * 4 + (array_position(game.suits(), right(c, 1)) - 1) $$;

create function game.sort_cards(cards text[]) returns text[]
language sql immutable set search_path = pg_catalog, pg_temp
as $$ select coalesce(array_agg(c order by game.card_order(c)), '{}') from unnest(cards) c $$;

create function game.remove_cards(hand text[], gone text[]) returns text[]
language sql immutable set search_path = pg_catalog, pg_temp
as $$
  select coalesce(array_agg(t.c order by t.i), '{}')
  from unnest(hand) with ordinality as t(c, i)
  where t.c <> all (gone)
$$;

-- Shuffled deck using the cryptographically strong gen_random_uuid() as the sort key.
create function game.new_deck() returns text[]
language sql volatile set search_path = pg_catalog, pg_temp
as $$
  select array_agg(r || s order by gen_random_uuid())
  from unnest(game.ranks()) r cross join unnest(game.suits()) s
$$;

create function game.new_code() returns text
language plpgsql volatile set search_path = pg_catalog, pg_temp
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   -- no I, L, O, 0, 1
  code text := '';
  bytes bytea := uuid_send(gen_random_uuid());                    -- bytes 0..5 of a v4 uuid are fully random
begin
  for i in 0..5 loop
    code := code || substr(alphabet, 1 + (get_byte(bytes, i) % length(alphabet)), 1);
  end loop;
  return code;
end
$$;

create function game.norm_code(p_code text) returns text
language sql immutable set search_path = pg_catalog, pg_temp
as $$
  select case when length(p_code) > 16 then ''          -- bound the work for absurd inputs
              else upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')) end
$$;

create function game.auth_hash(p_token text) returns text
language plpgsql immutable set search_path = pg_catalog, pg_temp
as $$
begin
  if p_token is null or length(p_token) < 32 or length(p_token) > 128 then
    raise exception 'bad_request';
  end if;
  return encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
end
$$;

create function game.clean_name(p_name text) returns text
language plpgsql immutable set search_path = pg_catalog, pg_temp
as $$
declare
  v text;
begin
  v := left(coalesce(p_name, ''), 64);                                   -- bound the work before any regex
  v := regexp_replace(v, '[[:cntrl:]]', '', 'g');
  -- invisible / formatting characters (zero-width, bidi controls, fillers, tag characters …) — they allow
  -- names that look identical to someone else's or that visually reorder the text around them
  v := regexp_replace(v, '[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u200b\u200c\u200e\u200f\u202a-\u202e\u2060-\u206f\u2800\u3164\ufeff\uffa0\U000e0000-\U000e007f]', '', 'g');
  -- every kind of space (incl. no-break) collapses to a single plain space
  v := regexp_replace(v, '[\s\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+', ' ', 'g');
  v := btrim(normalize(v, NFKC));                                        -- full-width / compatibility look-alikes → plain
  -- ZWJ and variation selectors are legitimate inside emoji sequences but must not make up a whole name
  if v ~ '^[\s\u200d\ufe00-\ufe0f]*$' or char_length(v) < 1 or char_length(v) > 16 then
    raise exception 'name_invalid';
  end if;
  return v;
end
$$;

create function game.speed_turn_seconds(p_speed text) returns integer
language sql immutable set search_path = pg_catalog, pg_temp
as $$ select case p_speed when 'relaxed' then 90 when 'blitz' then 20 else 45 end $$;

create function game.speed_challenge_seconds(p_speed text) returns integer
language sql immutable set search_path = pg_catalog, pg_temp
as $$ select case p_speed when 'relaxed' then 9 when 'blitz' then 4 else 6 end $$;

-- -------------------------------------------------------------------------------------
-- Bots: personalities and card-play heuristics
-- -------------------------------------------------------------------------------------

create function game.bot_pool() returns jsonb
language sql immutable set search_path = pg_catalog, pg_temp
as $$
  select '[
    {"n":"Vex","s":"reckless"},   {"n":"Mortimer","s":"cautious"}, {"n":"Juno","s":"paranoid"},
    {"n":"Rook","s":"balanced"},  {"n":"Slick","s":"reckless"},    {"n":"Nyx","s":"paranoid"},
    {"n":"Dex","s":"balanced"},   {"n":"Kit","s":"cautious"},      {"n":"Zed","s":"balanced"},
    {"n":"Mox","s":"reckless"}
  ]'::jsonb
$$;

-- lie    = chance to sneak a dishonest card in alongside honest ones
-- greed  = chance to dump an extra card when forced to bluff
-- sus    = base suspicion (chance to call bluff on an unremarkable play)
create function game.style(p_style text) returns jsonb
language sql immutable set search_path = pg_catalog, pg_temp
as $$
  select case p_style
    when 'cautious' then '{"lie":0.05,"greed":0.10,"sus":0.02}'::jsonb
    when 'balanced' then '{"lie":0.12,"greed":0.18,"sus":0.045}'::jsonb
    when 'reckless' then '{"lie":0.28,"greed":0.32,"sus":0.03}'::jsonb
    when 'paranoid' then '{"lie":0.08,"greed":0.12,"sus":0.085}'::jsonb
    else                 '{"lie":0.04,"greed":0.06,"sus":0.02}'::jsonb   -- autopilot for a human
  end
$$;

-- Choose which cards to dump when lying: prefer singletons, and ranks that will not come up for
-- this player again for the longest time (the rank advances one step per turn, so the player's
-- k-th future turn claims rank_idx + k * players).
create function game.pick_junk(p_cards text[], p_rank_idx integer, p_players integer, p_n integer)
returns text[]
language sql volatile set search_path = pg_catalog, pg_temp
as $$
  with inv as (
    select x as v from generate_series(1, 12) x where (p_players * x) % 13 = 1
  ),
  c as (
    select card, game.rank_of(card) as r from unnest(p_cards) card
  ),
  cnt as (
    select r, count(*) as k from c group by r
  ),
  scored as (
    select c.card, cnt.k,
           case when t = 0 then 13 else t end as turns_away
    from c
    join cnt using (r)
    cross join inv
    cross join lateral (
      select ((((game.rank_pos(c.r) - p_rank_idx) % 13) + 13) % 13 * inv.v) % 13 as t
    ) s
  )
  select coalesce(array_agg(card), '{}')
  from (select card from scored order by k asc, turns_away desc, random() limit p_n) picked
$$;

create function game.choose_play(p_hand text[], p_rank_idx integer, p_style text, p_players integer)
returns text[]
language plpgsql volatile set search_path = pg_catalog, pg_temp
as $$
declare
  st      jsonb := game.style(p_style);
  v_rank  text := (game.ranks())[p_rank_idx + 1];
  honest  text[];
  others  text[];
  v_take  text[];
  v_n     integer;
  v_p     numeric;
begin
  select coalesce(array_agg(c), '{}') into honest from unnest(p_hand) c where game.rank_of(c) = v_rank;
  select coalesce(array_agg(c), '{}') into others from unnest(p_hand) c where game.rank_of(c) <> v_rank;

  if cardinality(honest) > 0 then
    v_take := honest;
    -- Sometimes sneak junk in with the honest cards (more likely when only a few junk cards are left).
    v_p := (st->>'lie')::numeric * case when cardinality(others) <= 2 then 2.5 else 1 end;
    if cardinality(others) > 0 and cardinality(v_take) < 4 and random() < v_p then
      v_n := least(4 - cardinality(v_take), case when cardinality(others) <= 2 then cardinality(others) else 1 end);
      v_take := v_take || game.pick_junk(others, p_rank_idx, p_players, v_n);
    end if;
    return v_take;
  end if;

  -- Nothing honest to play: bluff with 1 card, sometimes 2–3.
  v_n := 1;
  if random() < (st->>'greed')::numeric then v_n := 2; end if;
  if v_n = 2 and random() < (st->>'greed')::numeric * 0.5 then v_n := 3; end if;
  v_n := least(v_n, cardinality(p_hand), 4);
  return game.pick_junk(p_hand, p_rank_idx, p_players, v_n);
end
$$;

-- -------------------------------------------------------------------------------------
-- Room helpers
-- -------------------------------------------------------------------------------------

-- Best-effort caller identity for throttling, from the headers PostgREST exposes. Behind Supabase's edge
-- `cf-connecting-ip` is set by the proxy; `x-forwarded-for` is only a fallback. 'direct' = no HTTP layer.
create function game.client_key() returns text
language plpgsql stable set search_path = pg_catalog, pg_temp
as $$
declare
  h json;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    h := null;
  end;
  if h is null then return 'direct'; end if;
  return coalesce(
    nullif(h->>'cf-connecting-ip', ''),
    nullif(btrim(split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1)), ''),
    nullif(h->>'x-real-ip', ''),
    'unknown');
end
$$;

create function game.player_count(p_room uuid) returns integer
language sql stable set search_path = pg_catalog, pg_temp
as $$ select count(*)::int from game.players where room_id = p_room $$;

create function game.compact_seats(p_room uuid) returns void
language sql volatile set search_path = pg_catalog, pg_temp
as $$
  update game.players p
  set seat = s.rn - 1
  from (select id, row_number() over (order by seat) as rn from game.players where room_id = p_room) s
  where p.id = s.id and p.seat <> s.rn - 1
$$;

create function game.free_color(p_room uuid) returns integer
language sql stable set search_path = pg_catalog, pg_temp
as $$
  select coalesce(
    (select min(c) from generate_series(0, 7) c where c not in (select color from game.players where room_id = p_room)),
    0)
$$;

create function game.log_event(p_room uuid, p_kind text, p_data jsonb default '{}'::jsonb) returns void
language sql volatile set search_path = pg_catalog, pg_temp
as $$
  update game.rooms
  set log_seq = log_seq + 1,
      log = (case when jsonb_array_length(log) >= 40 then log - 0 else log end)
            || jsonb_build_array(
                 jsonb_build_object('n', log_seq + 1, 't', game.ms(clock_timestamp()), 'k', p_kind) || p_data)
  where id = p_room
$$;

create function game.add_bot_to(p_room uuid) returns uuid
language plpgsql volatile set search_path = pg_catalog, pg_temp
as $$
declare
  v_bot  jsonb;
  v_n    integer;
  v_id   uuid;
  v_name text;
begin
  select count(*)::int into v_n from game.players where room_id = p_room;
  if v_n >= 8 then raise exception 'room_full'; end if;

  select b into v_bot
  from jsonb_array_elements(game.bot_pool()) b
  where lower(b->>'n') not in (select lower(name) from game.players where room_id = p_room)
  order by random() limit 1;

  v_name := coalesce(v_bot->>'n', 'Bot ' || (v_n + 1));
  insert into game.players (room_id, token_hash, seat, name, color, is_bot, style)
  values (p_room, null, v_n, v_name, game.free_color(p_room), true, coalesce(v_bot->>'s', 'balanced'))
  returning id into v_id;

  perform game.log_event(p_room, 'bot', jsonb_build_object('p', v_id, 'pn', v_name));
  return v_id;
end
$$;

-- Are all *human, present* players (other than the one who played) done deciding?
create function game.all_humans_passed(p_room uuid, p_play_seat integer, p_passed uuid[], p_now timestamptz)
returns boolean
language sql stable set search_path = pg_catalog, pg_temp
as $$
  select not exists (
    select 1 from game.players p
    where p.room_id = p_room
      and not (p.is_bot or p.auto or p.has_left)
      and p.seat <> p_play_seat
      and p.last_seen > p_now - interval '25 seconds'
      and p.id <> all (p_passed)
  )
$$;

-- Earliest time at which something should happen without any player acting (NULL = nothing pending).
create function game.next_due(r game.rooms, p_now timestamptz) returns timestamptz
language sql stable set search_path = pg_catalog, pg_temp
as $$
  select case r.status
    when 'turn' then coalesce(r.act_at, r.deadline + interval '2 seconds')
    when 'challenge' then least(
      r.deadline,
      case when r.bot_caller is not null then r.act_at end,
      case when r.bot_caller is null and game.all_humans_passed(r.id, r.play_seat, r.passed, p_now)
           then r.challenge_since + interval '900 milliseconds' end)
    when 'reveal' then r.deadline
  end
$$;

-- -------------------------------------------------------------------------------------
-- State transitions (all assume the caller holds the room's row lock)
-- -------------------------------------------------------------------------------------

create function game.begin_turn(p_room uuid, p_now timestamptz) returns void
language plpgsql volatile set search_path = pg_catalog, pg_temp
as $$
declare
  r      game.rooms;
  p      game.players;
  v_k    numeric;
  v_secs numeric;
begin
  select * into r from game.rooms where id = p_room;
  select * into p from game.players where room_id = p_room and seat = r.seat_turn;

  if p.is_bot or p.auto or p.has_left then
    v_k := case r.speed when 'blitz' then 0.55 when 'relaxed' then 1.3 else 1 end;
    update game.rooms
    set status = 'turn', turn_started_at = p_now, deadline = null,
        act_at = p_now + make_interval(secs => (1.0 + random() * 1.5) * v_k),
        bot_caller = null, passed = '{}', play_seat = null, play_count = 0
    where id = p_room;
  else
    -- A human who has been silent for a while gets a short fuse instead of the full turn timer.
    v_secs := case when p.last_seen < p_now - interval '30 seconds' then least(r.turn_seconds, 10) else r.turn_seconds end;
    update game.rooms
    set status = 'turn', turn_started_at = p_now, deadline = p_now + make_interval(secs => v_secs),
        act_at = null, bot_caller = null, passed = '{}', play_seat = null, play_count = 0
    where id = p_room;
  end if;
end
$$;

-- Decide whether a server-controlled player will call bluff on the pending play, and when.
create function game.plan_bot_call(p_room uuid, p_now timestamptz) returns void
language plpgsql volatile set search_path = pg_catalog, pg_temp
as $$
declare
  r        game.rooms;
  accused  game.players;
  b        record;
  st       jsonb;
  v_claim  text;
  v_k      integer;
  v_rem    integer;
  v_m      integer;
  v_p      numeric;
  v_at     timestamptz;
  v_best   uuid;
  v_best_at timestamptz;
begin
  select * into r from game.rooms where id = p_room;
  select * into accused from game.players where room_id = p_room and seat = r.play_seat;
  v_claim := (game.ranks())[r.rank_idx + 1];
  v_k := r.play_count;
  v_rem := cardinality(accused.hand);

  for b in
    select * from game.players
    where room_id = p_room and id <> accused.id and (is_bot or auto or has_left)
    order by seat
  loop
    st := game.style(case when b.is_bot then b.style end);
    select count(*)::int into v_m from unnest(b.hand) c where game.rank_of(c) = v_claim;

    if v_k + v_m > 4 then
      v_p := 1.0;                                  -- provably a lie: only four of each rank exist
    else
      v_p := (st->>'sus')::numeric + 0.06 * (v_k - 1);
      if v_m >= 2 then v_p := v_p + 0.035 * (v_m - 1); end if;    -- holding many of it makes it scarcer
      if v_rem = 0 then v_p := greatest(v_p, 0.85);               -- they win unless somebody calls
      elsif v_rem <= 2 then v_p := v_p + 0.06;
      elsif v_rem <= 4 then v_p := v_p + 0.02;
      end if;
      if v_rem > 0 and cardinality(r.pile) > 14 then v_p := v_p * 0.8; end if;  -- wrong calls are costly
      v_p := least(v_p, 0.95);
    end if;

    if random() < v_p then
      v_at := p_now + make_interval(secs => 0.7 + random() * greatest(0.2, 0.6 * r.challenge_seconds - 0.7));
      if v_best_at is null or v_at < v_best_at then
        v_best_at := v_at;
        v_best := b.id;
      end if;
    end if;
  end loop;

  update game.rooms set bot_caller = v_best, act_at = v_best_at where id = p_room;
end
$$;

-- Put cards on the pile, open the challenge window.
create function game.apply_play(p_room uuid, p_player uuid, p_cards text[], p_now timestamptz) returns void
language plpgsql volatile set search_path = pg_catalog, pg_temp
as $$
declare
  r       game.rooms;
  p       game.players;
  v_cards text[];
begin
  select * into r from game.rooms where id = p_room;
  select * into p from game.players where id = p_player;

  -- Rebuild as a fresh plain 1-D array (never store a caller-supplied array object as it came).
  v_cards := array(select c from unnest(p_cards) with ordinality t(c, i) order by i);

  update game.players set hand = game.remove_cards(hand, v_cards) where id = p_player;

  update game.rooms
  set pile = pile || v_cards,
      play_seat = p.seat,
      play_count = cardinality(v_cards),
      status = 'challenge',
      challenge_since = p_now,
      deadline = p_now + make_interval(secs => r.challenge_seconds),
      passed = '{}',
      bot_caller = null,
      act_at = null,
      turns = turns + 1
  where id = p_room;

  perform game.log_event(p_room, 'play', jsonb_build_object(
    'p', p.id, 'pn', p.name, 'c', cardinality(v_cards), 'r', (game.ranks())[r.rank_idx + 1]));
  perform game.plan_bot_call(p_room, p_now);
end
$$;

create function game.finish(p_room uuid, p_winner uuid, p_now timestamptz) returns void
language plpgsql volatile set search_path = pg_catalog, pg_temp
as $$
declare
  v_name text;
begin
  select name into v_name from game.players where id = p_winner;
  update game.rooms
  set status = 'finished', winner = p_winner, deadline = null, act_at = null,
      bot_caller = null, passed = '{}', turn_started_at = null
  where id = p_room;
  perform game.log_event(p_room, 'win', jsonb_build_object('p', p_winner, 'pn', v_name));
end
$$;

-- Safety net so a (very unlikely) endless game still terminates: fewest cards wins.
create function game.finish_by_count(p_room uuid, p_now timestamptz) returns void
language plpgsql volatile set search_path = pg_catalog, pg_temp
as $$
declare
  v_winner uuid;
begin
  select id into v_winner from game.players where room_id = p_room order by cardinality(hand), seat limit 1;
  perform game.finish(p_room, v_winner, p_now);
end
$$;

-- The challenge window passed (or everybody accepted) without a call.
create function game.close_window(p_room uuid, p_now timestamptz) returns void
language plpgsql volatile set search_path = pg_catalog, pg_temp
as $$
declare
  r       game.rooms;
  accused game.players;
begin
  select * into r from game.rooms where id = p_room;
  select * into accused from game.players where room_id = p_room and seat = r.play_seat;

  if cardinality(accused.hand) = 0 then
    perform game.finish(p_room, accused.id, p_now);
    return;
  end if;
  if r.turns >= 400 then
    perform game.finish_by_count(p_room, p_now);
    return;
  end if;

  update game.rooms
  set seat_turn = (r.play_seat + 1) % game.player_count(p_room),
      rank_idx = (r.rank_idx + 1) % 13
  where id = p_room;
  perform game.begin_turn(p_room, p_now);
end
$$;

-- Somebody called bluff: reveal, move the pile, set up the next turn.
create function game.resolve_call(p_room uuid, p_caller uuid, p_now timestamptz) returns void
language plpgsql volatile set search_path = pg_catalog, pg_temp
as $$
declare
  r        game.rooms;
  caller   game.players;
  accused  game.players;
  picker   game.players;
  v_n      integer;
  v_played text[];
  v_claim  text;
  v_bluff  boolean;
  v_winner uuid;
  v_until  timestamptz;
begin
  select * into r from game.rooms where id = p_room;
  select * into caller from game.players where id = p_caller;
  select * into accused from game.players where room_id = p_room and seat = r.play_seat;

  v_n := cardinality(r.pile);
  v_played := r.pile[v_n - r.play_count + 1 : v_n];
  v_claim := (game.ranks())[r.rank_idx + 1];
  v_bluff := exists (select 1 from unnest(v_played) c where game.rank_of(c) <> v_claim);
  picker := case when v_bluff then accused else caller end;

  update game.players set hand = game.sort_cards(hand || r.pile) where id = picker.id;

  -- Honest last play: the accused wins once the reveal is over.
  if not v_bluff and cardinality(accused.hand) = 0 then
    v_winner := accused.id;
  end if;

  v_until := p_now + interval '4500 milliseconds';
  update game.rooms
  set status = 'reveal',
      pile = '{}',
      deadline = v_until,
      act_at = null, bot_caller = null, passed = '{}',
      seat_turn = (r.play_seat + 1) % game.player_count(p_room),
      rank_idx = (r.rank_idx + 1) % 13,
      reveal = jsonb_build_object(
        'caller', caller.id, 'accused', accused.id, 'cards', to_jsonb(v_played), 'rank', v_claim,
        'bluff', v_bluff, 'picker', picker.id, 'pickup', v_n, 'winner', v_winner, 'until', game.ms(v_until))
  where id = p_room;

  perform game.log_event(p_room, 'call', jsonb_build_object(
    'p', caller.id, 'pn', caller.name, 'a', accused.id, 'an', accused.name,
    'r', v_claim, 'b', v_bluff, 'x', v_n));
end
$$;

create function game.end_reveal(p_room uuid, p_now timestamptz) returns void
language plpgsql volatile set search_path = pg_catalog, pg_temp
as $$
declare
  r game.rooms;
begin
  select * into r from game.rooms where id = p_room;
  if (r.reveal->>'winner') is not null then
    perform game.finish(p_room, (r.reveal->>'winner')::uuid, p_now);
  elsif r.turns >= 400 then
    perform game.finish_by_count(p_room, p_now);
  else
    perform game.begin_turn(p_room, p_now);
  end if;
end
$$;

-- Server plays a seat: bots and autopilot humans on their move time, humans whose timer ran out.
create function game.auto_play(p_room uuid, p_now timestamptz, p_timeout boolean) returns void
language plpgsql volatile set search_path = pg_catalog, pg_temp
as $$
declare
  r       game.rooms;
  p       game.players;
  v_cards text[];
begin
  select * into r from game.rooms where id = p_room;
  select * into p from game.players where room_id = p_room and seat = r.seat_turn;

  if p_timeout and not (p.is_bot or p.auto or p.has_left) then
    update game.players set missed = missed + 1 where id = p.id;
    perform game.log_event(p_room, 'timeout', jsonb_build_object('p', p.id, 'pn', p.name));
    if p.missed + 1 >= 2 then
      update game.players set auto = true where id = p.id;
      perform game.log_event(p_room, 'auto', jsonb_build_object('p', p.id, 'pn', p.name));
    end if;
  end if;

  v_cards := game.choose_play(p.hand, r.rank_idx, case when p.is_bot then p.style end, game.player_count(p_room));
  perform game.apply_play(p_room, p.id, v_cards, p_now);
end
$$;

-- A lobby / finished room whose host has gone silent would be dead for everyone (only the host can start,
-- add bots, or run a rematch): hand the role to the longest-seated human who is actually here.
create function game.maybe_promote_host(p_room uuid, p_now timestamptz) returns boolean
language plpgsql volatile set search_path = pg_catalog, pg_temp
as $$
declare
  v_status    text;
  v_host      uuid;
  v_host_seen timestamptz;
  v_new       uuid;
begin
  select status into v_status from game.rooms where id = p_room;
  if v_status is null or v_status not in ('lobby', 'finished') then return false; end if;

  select id, last_seen into v_host, v_host_seen
  from game.players where room_id = p_room and is_host and not has_left limit 1;
  if v_host is not null and v_host_seen > p_now - interval '60 seconds' then return false; end if;

  select id into v_new
  from game.players
  where room_id = p_room and not is_bot and not has_left
    and last_seen > p_now - interval '25 seconds'
    and id is distinct from v_host
  order by created_at limit 1;
  if v_new is null then return false; end if;

  update game.players set is_host = (id = v_new) where room_id = p_room and (is_host or id = v_new);
  perform game.log_event(p_room, 'host', jsonb_build_object('p', v_new, 'pn', (select name from game.players where id = v_new)));
  return true;
end
$$;

-- Apply every due transition (bounded). Returns true if anything changed.
create function game.advance(p_room uuid, p_now timestamptz) returns boolean
language plpgsql volatile set search_path = pg_catalog, pg_temp
as $$
declare
  r       game.rooms;
  v_iter  integer := 0;
  v_moved boolean := false;
begin
  if game.maybe_promote_host(p_room, p_now) then
    v_moved := true;
  end if;

  loop
    v_iter := v_iter + 1;
    exit when v_iter > 8;
    select * into r from game.rooms where id = p_room;
    exit when not found;

    if r.status = 'turn' then
      if r.act_at is not null and p_now >= r.act_at then
        perform game.auto_play(p_room, p_now, false);
      elsif r.deadline is not null and p_now >= r.deadline + interval '2 seconds' then
        perform game.auto_play(p_room, p_now, true);
      else
        exit;
      end if;
    elsif r.status = 'challenge' then
      if r.bot_caller is not null and p_now >= r.act_at then
        perform game.resolve_call(p_room, r.bot_caller, p_now);
      elsif p_now >= r.deadline then
        perform game.close_window(p_room, p_now);
      elsif r.bot_caller is null
            and p_now >= r.challenge_since + interval '900 milliseconds'
            and game.all_humans_passed(r.id, r.play_seat, r.passed, p_now) then
        perform game.close_window(p_room, p_now);
      else
        exit;
      end if;
    elsif r.status = 'reveal' then
      if p_now >= r.deadline then
        perform game.end_reveal(p_room, p_now);
      else
        exit;
      end if;
    else
      exit;
    end if;
    v_moved := true;
  end loop;
  return v_moved;
end
$$;

create function game.start_game(p_room uuid, p_now timestamptz) returns void
language plpgsql volatile set search_path = pg_catalog, pg_temp
as $$
declare
  v_deck text[] := game.new_deck();
  v_n    integer := game.player_count(p_room);
begin
  update game.players p
  set hand = game.sort_cards(d.cards), auto = false, missed = 0
  from (
    select pl.id,
           (select coalesce(array_agg(v_deck[i] order by i), '{}')
              from generate_series(1, 52) i where (i - 1) % v_n = pl.seat) as cards
    from game.players pl where pl.room_id = p_room
  ) d
  where p.id = d.id;

  update game.rooms
  set pile = '{}', winner = null, reveal = null, turns = 0, rank_idx = 0,
      seat_turn = floor(random() * v_n)::int, play_seat = null, play_count = 0, passed = '{}'
  where id = p_room;

  perform game.log_event(p_room, 'start');
  perform game.begin_turn(p_room, p_now);
end
$$;

-- -------------------------------------------------------------------------------------
-- Views (what a client may see)
-- -------------------------------------------------------------------------------------

-- One statement = one consistent snapshot. Never includes anyone else's hand.
create function game.view(p_room uuid, p_me uuid, p_now timestamptz, p_adv boolean default false)
returns jsonb
language sql stable set search_path = pg_catalog, pg_temp
as $$
  select jsonb_build_object(
    'v', r.version,
    'now', game.ms(p_now),
    'code', r.code,
    'status', r.status,
    'settings', jsonb_build_object('speed', r.speed, 'turnSeconds', r.turn_seconds, 'challengeSeconds', r.challenge_seconds),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'seat', p.seat, 'name', p.name, 'color', p.color, 'host', p.is_host, 'bot', p.is_bot,
        'style', p.style, 'auto', p.auto, 'left', p.has_left,
        'online', (p.is_bot or p.has_left or p.last_seen > p_now - interval '25 seconds'),
        'cards', cardinality(p.hand)) order by p.seat)
      from game.players p where p.room_id = r.id), '[]'::jsonb),
    'me', jsonb_build_object(
      'id', me.id, 'seat', me.seat, 'host', me.is_host,
      'hand', to_jsonb(game.sort_cards(me.hand)), 'auto', me.auto,
      'passed', (me.id = any (r.passed)),
      'canPlay', (r.status = 'turn' and cur.id = me.id),
      'canCall', (r.status = 'challenge' and acc.id <> me.id),
      'canPass', (r.status = 'challenge' and acc.id <> me.id and not (me.id = any (r.passed)))),
    'pile', cardinality(r.pile),
    'turn', case when r.status = 'turn' then jsonb_build_object(
        'player', cur.id,
        'rank', (game.ranks())[r.rank_idx + 1],
        'since', game.ms(r.turn_started_at),
        'deadline', case when cur.is_bot or cur.auto or cur.has_left then null else game.ms(r.deadline) end) end,
    'challenge', case when r.status = 'challenge' then jsonb_build_object(
        'by', acc.id, 'count', r.play_count, 'rank', (game.ranks())[r.rank_idx + 1],
        'since', game.ms(r.challenge_since), 'deadline', game.ms(r.deadline), 'passed', to_jsonb(r.passed)) end,
    'reveal', case when r.status = 'reveal' then r.reveal end,
    'winner', r.winner,
    -- During a challenge the true next event can be a server-seat's planned call, whose timing would hint at
    -- that seat's hand: only ever advertise "check again soon" while the window is open.
    'due', game.ms(case when r.status = 'challenge' then least(r.deadline, p_now + interval '700 milliseconds')
                        else game.next_due(r, p_now) end),
    'log', r.log
  ) || case when p_adv then jsonb_build_object('adv', true) else '{}'::jsonb end
  from game.rooms r
  join game.players me on me.id = p_me
  left join game.players cur on cur.room_id = r.id and cur.seat = r.seat_turn
  left join game.players acc on acc.room_id = r.id and acc.seat = r.play_seat
  where r.id = p_room
$$;

-- What someone who is not (or no longer) in the room sees.
create function game.preview(r game.rooms, p_hash text) returns jsonb
language sql stable set search_path = pg_catalog, pg_temp
as $$
  select jsonb_build_object(
    'preview', true,
    'code', r.code,
    'status', r.status,
    'count', n.c,
    'max', 8,
    'host', (select name from game.players where room_id = r.id and is_host and not has_left limit 1),
    'joinable', (r.status = 'lobby' and n.c < 8 and p_hash <> all (r.banned)),
    'reason', case when p_hash = any (r.banned) then 'banned'
                   when r.status <> 'lobby' then 'started'
                   when n.c >= 8 then 'full' end)
  from (select count(*)::int as c from game.players where room_id = r.id) n
$$;

-- -------------------------------------------------------------------------------------
-- API implementation (called only through the public.leery_* wrappers)
-- -------------------------------------------------------------------------------------

-- Common entry for member actions: validates the token, locks the room, applies due transitions.
create function game.enter(p_token text, p_code text, p_advance boolean default true)
returns table (rid uuid, pid uuid, now_ts timestamptz)
language plpgsql volatile set search_path = pg_catalog, pg_temp
as $$
declare
  v_hash text := game.auth_hash(p_token);
  r      game.rooms;
  me     game.players;
  v_now  timestamptz;
begin
  select * into r from game.rooms where code = game.norm_code(p_code) for update;
  if not found then raise exception 'room_not_found'; end if;
  select * into me from game.players where room_id = r.id and token_hash = v_hash;
  if not found or me.has_left then raise exception 'not_in_room'; end if;

  v_now := clock_timestamp();
  -- Heartbeat BEFORE advancing: a player whose own request starts their turn must count as present.
  update game.players set last_seen = v_now where id = me.id;
  if p_advance then
    perform game.advance(r.id, v_now);
  end if;
  return query select r.id, me.id, v_now;
end
$$;

create function game.touch_actor(p_player uuid, p_now timestamptz) returns void
language sql volatile set search_path = pg_catalog, pg_temp
as $$ update game.players set missed = 0, auto = false, last_seen = p_now where id = p_player $$;

create function game.api_create_room(p_token text, p_name text, p_speed text, p_bots integer, p_start boolean)
returns jsonb
language plpgsql volatile set search_path = pg_catalog, pg_temp
as $$
declare
  v_hash  text := game.auth_hash(p_token);
  v_name  text := game.clean_name(p_name);
  v_now   timestamptz := clock_timestamp();
  v_speed text := coalesce(p_speed, 'standard');
  v_bots  integer := coalesce(p_bots, 0);
  v_code  text;
  v_room  uuid;
  v_me    uuid;
  v_client text;
  v_cap   integer;
begin
  if v_speed not in ('relaxed', 'standard', 'blitz') then raise exception 'bad_request'; end if;
  if v_bots < 0 or v_bots > 7 then raise exception 'bad_request'; end if;
  if coalesce(p_start, false) and v_bots < 1 then raise exception 'need_players'; end if;

  -- Opportunistic cleanup of abandoned rooms (no mutation and no heartbeat for hours).
  delete from game.rooms r
  where r.last_active < v_now - interval '6 hours'
    and not exists (select 1 from game.players p where p.room_id = r.id and p.last_seen >= v_now - interval '6 hours');

  -- Rate limits count creations (a creation that is immediately abandoned still counts).
  v_client := game.client_key();
  delete from game.create_log where at < v_now - interval '2 hours';
  if (select count(*) from game.create_log where token_hash = v_hash and at > v_now - interval '1 hour') >= 20 then
    raise exception 'rate_limited';
  end if;
  if v_client not in ('direct', 'unknown')
     and (select count(*) from game.create_log where client = v_client and at > v_now - interval '1 hour') >= 120 then
    raise exception 'rate_limited';   -- generous: a whole classroom may share one address
  end if;

  -- Global cap (tunable: `alter database … set leery.room_cap = '20000'`). At the cap, retire the longest-idle
  -- lobbies / finished games instead of refusing everyone.
  v_cap := coalesce(nullif(current_setting('leery.room_cap', true), '')::integer, 5000);
  if (select count(*) from game.rooms) >= v_cap then
    delete from game.rooms where id in (
      select id from game.rooms
      where status in ('lobby', 'finished') and last_active < v_now - interval '30 minutes'
      order by last_active limit greatest(10, v_cap / 10));
    if (select count(*) from game.rooms) >= v_cap then raise exception 'too_many_rooms'; end if;
  end if;
  insert into game.create_log (token_hash, client) values (v_hash, v_client);

  for i in 1..25 loop
    v_code := game.new_code();
    begin
      insert into game.rooms (code, speed, turn_seconds, challenge_seconds)
      values (v_code, v_speed, game.speed_turn_seconds(v_speed), game.speed_challenge_seconds(v_speed))
      returning id into v_room;
      exit;
    exception when unique_violation then
      v_room := null;
    end;
  end loop;
  if v_room is null then raise exception 'too_many_rooms'; end if;

  insert into game.players (room_id, token_hash, seat, name, color, is_host, last_seen)
  values (v_room, v_hash, 0, v_name, 0, true, v_now)
  returning id into v_me;
  perform game.log_event(v_room, 'join', jsonb_build_object('p', v_me, 'pn', v_name));

  for i in 1..v_bots loop
    perform game.add_bot_to(v_room);
  end loop;

  if coalesce(p_start, false) then
    perform game.start_game(v_room, v_now);
  end if;

  return game.view(v_room, v_me, clock_timestamp());
end
$$;

create function game.api_join_room(p_token text, p_code text, p_name text) returns jsonb
language plpgsql volatile set search_path = pg_catalog, pg_temp
as $$
declare
  v_hash text := game.auth_hash(p_token);
  r      game.rooms;
  me     game.players;
  v_name text;
  v_now  timestamptz;
  v_id   uuid;
  v_n    integer;
begin
  select * into r from game.rooms where code = game.norm_code(p_code) for update;
  if not found then raise exception 'room_not_found'; end if;
  v_now := clock_timestamp();

  -- Already seated (page refresh / second device tab): just return the view.
  select * into me from game.players where room_id = r.id and token_hash = v_hash;
  if found and not me.has_left then
    perform game.advance(r.id, v_now);
    update game.players set last_seen = v_now where id = me.id;
    return game.view(r.id, me.id, v_now);
  end if;

  if v_hash = any (r.banned) then raise exception 'banned'; end if;
  if r.status <> 'lobby' then raise exception 'room_started'; end if;
  v_name := game.clean_name(p_name);
  select count(*)::int into v_n from game.players where room_id = r.id;
  if v_n >= 8 then raise exception 'room_full'; end if;
  if exists (select 1 from game.players where room_id = r.id and lower(name) = lower(v_name)) then
    raise exception 'name_taken';
  end if;

  insert into game.players (room_id, token_hash, seat, name, color, last_seen)
  values (r.id, v_hash, v_n, v_name, game.free_color(r.id), v_now)
  returning id into v_id;
  perform game.log_event(r.id, 'join', jsonb_build_object('p', v_id, 'pn', v_name));
  return game.view(r.id, v_id, v_now);
end
$$;

create function game.api_get_state(p_token text, p_code text) returns jsonb
language plpgsql volatile set search_path = pg_catalog, pg_temp
as $$
declare
  v_hash  text := game.auth_hash(p_token);
  v_now   timestamptz := clock_timestamp();
  r       game.rooms;
  me      game.players;
  v_adv   boolean := false;
  v_view  jsonb;
begin
  select * into r from game.rooms where code = game.norm_code(p_code);
  if not found then raise exception 'room_not_found'; end if;

  select * into me from game.players where room_id = r.id and token_hash = v_hash;
  if not found or me.has_left then
    return game.preview(r, v_hash);
  end if;

  -- Only take the exclusive lock when something is actually due (or a lobby's host went silent).
  -- Lock order is always room → player rows, so the heartbeat happens after the lock on this path.
  if game.next_due(r, v_now) <= v_now
     or (r.status in ('lobby', 'finished') and not me.is_host and exists (
           select 1 from game.players h
           where h.room_id = r.id and h.is_host and h.last_seen <= v_now - interval '60 seconds')) then
    perform 1 from game.rooms where id = r.id for update;
    if not found then raise exception 'room_not_found'; end if;
    v_now := clock_timestamp();
    update game.players set last_seen = v_now where id = me.id;     -- present BEFORE the engine steps
    v_adv := game.advance(r.id, v_now);
  elsif me.last_seen < v_now - interval '5 seconds' then
    update game.players set last_seen = v_now where id = me.id;
  end if;

  v_view := game.view(r.id, me.id, v_now, v_adv);
  if v_view is null then
    -- Raced with a kick / leave / teardown between the checks above and now: answer like an outsider.
    select * into r from game.rooms where id = r.id;
    if not found then raise exception 'room_not_found'; end if;
    return game.preview(r, v_hash);
  end if;
  return v_view;
end
$$;

create function game.api_add_bot(p_token text, p_code text) returns jsonb
language plpgsql volatile set search_path = pg_catalog, pg_temp
as $$
declare
  e record;
  r game.rooms;
  me game.players;
begin
  select * into e from game.enter(p_token, p_code);
  select * into r from game.rooms where id = e.rid;
  select * into me from game.players where id = e.pid;
  if not me.is_host then raise exception 'not_host'; end if;
  if r.status <> 'lobby' then raise exception 'bad_phase'; end if;
  perform game.add_bot_to(r.id);
  return game.view(r.id, me.id, e.now_ts);
end
$$;

create function game.api_remove_player(p_token text, p_code text, p_player uuid) returns jsonb
language plpgsql volatile set search_path = pg_catalog, pg_temp
as $$
declare
  e      record;
  r      game.rooms;
  me     game.players;
  target game.players;
begin
  select * into e from game.enter(p_token, p_code);
  select * into r from game.rooms where id = e.rid;
  select * into me from game.players where id = e.pid;
  if not me.is_host then raise exception 'not_host'; end if;
  if r.status <> 'lobby' then raise exception 'bad_phase'; end if;

  select * into target from game.players where id = p_player and room_id = r.id;
  if not found or target.id = me.id then raise exception 'bad_request'; end if;

  if target.token_hash is not null then
    -- bounded: the oldest entries fall off after 64 kicks so a room row can't grow without limit
    update game.rooms
    set banned = (case when cardinality(banned) >= 64 then banned[2:cardinality(banned)] else banned end) || target.token_hash
    where id = r.id;
  end if;
  delete from game.players where id = target.id;
  perform game.compact_seats(r.id);
  perform game.log_event(r.id, 'kick', jsonb_build_object('p', target.id, 'pn', target.name));
  return game.view(r.id, me.id, e.now_ts);
end
$$;

create function game.api_set_speed(p_token text, p_code text, p_speed text) returns jsonb
language plpgsql volatile set search_path = pg_catalog, pg_temp
as $$
declare
  e  record;
  r  game.rooms;
  me game.players;
begin
  if p_speed is null or p_speed not in ('relaxed', 'standard', 'blitz') then raise exception 'bad_request'; end if;
  select * into e from game.enter(p_token, p_code);
  select * into r from game.rooms where id = e.rid;
  select * into me from game.players where id = e.pid;
  if not me.is_host then raise exception 'not_host'; end if;
  if r.status <> 'lobby' then raise exception 'bad_phase'; end if;
  update game.rooms
  set speed = p_speed, turn_seconds = game.speed_turn_seconds(p_speed), challenge_seconds = game.speed_challenge_seconds(p_speed)
  where id = r.id;
  return game.view(r.id, me.id, e.now_ts);
end
$$;

create function game.api_start(p_token text, p_code text) returns jsonb
language plpgsql volatile set search_path = pg_catalog, pg_temp
as $$
declare
  e  record;
  r  game.rooms;
  me game.players;
begin
  select * into e from game.enter(p_token, p_code);
  select * into r from game.rooms where id = e.rid;
  select * into me from game.players where id = e.pid;
  if not me.is_host then raise exception 'not_host'; end if;
  if r.status <> 'lobby' then raise exception 'bad_phase'; end if;
  if game.player_count(r.id) < 2 then raise exception 'need_players'; end if;
  perform game.start_game(r.id, e.now_ts);
  return game.view(r.id, me.id, e.now_ts);
end
$$;

create function game.api_play(p_token text, p_code text, p_cards text[]) returns jsonb
language plpgsql volatile set search_path = pg_catalog, pg_temp
as $$
declare
  e   record;
  r   game.rooms;
  me  game.players;
  v_n integer;
begin
  select * into e from game.enter(p_token, p_code);
  select * into r from game.rooms where id = e.rid;
  select * into me from game.players where id = e.pid;

  if r.status <> 'turn' then raise exception 'bad_phase'; end if;
  if me.seat <> r.seat_turn then raise exception 'not_your_turn'; end if;

  -- Only a plain 1-D array indexed from 1 is acceptable: Postgres arrays may carry custom lower bounds or
  -- extra dimensions, which would corrupt the position-based pile logic.
  if p_cards is null or array_ndims(p_cards) is distinct from 1 or array_lower(p_cards, 1) is distinct from 1 then
    raise exception 'bad_cards';
  end if;
  v_n := cardinality(p_cards);
  if v_n < 1 or v_n > 4 then raise exception 'bad_cards'; end if;
  if (select count(distinct c) from unnest(p_cards) c) <> v_n then raise exception 'bad_cards'; end if;
  if exists (select 1 from unnest(p_cards) c where c is null or c <> all (me.hand)) then raise exception 'bad_cards'; end if;

  perform game.touch_actor(me.id, e.now_ts);
  perform game.apply_play(r.id, me.id, p_cards, e.now_ts);
  return game.view(r.id, me.id, e.now_ts);
end
$$;

create function game.api_call(p_token text, p_code text) returns jsonb
language plpgsql volatile set search_path = pg_catalog, pg_temp
as $$
declare
  e  record;
  r  game.rooms;
  me game.players;
begin
  select * into e from game.enter(p_token, p_code);
  select * into r from game.rooms where id = e.rid;
  select * into me from game.players where id = e.pid;
  if r.status <> 'challenge' or me.seat = r.play_seat then raise exception 'bad_phase'; end if;

  perform game.touch_actor(me.id, e.now_ts);
  perform game.resolve_call(r.id, me.id, e.now_ts);
  return game.view(r.id, me.id, e.now_ts);
end
$$;

create function game.api_pass(p_token text, p_code text) returns jsonb
language plpgsql volatile set search_path = pg_catalog, pg_temp
as $$
declare
  e  record;
  r  game.rooms;
  me game.players;
  v_adv boolean;
begin
  select * into e from game.enter(p_token, p_code);
  select * into r from game.rooms where id = e.rid;
  select * into me from game.players where id = e.pid;
  if r.status <> 'challenge' or me.seat = r.play_seat then raise exception 'bad_phase'; end if;

  perform game.touch_actor(me.id, e.now_ts);
  -- If this seat was an autopilot caller-in-waiting, the human has just decided otherwise.
  update game.rooms set bot_caller = null, act_at = null where id = r.id and bot_caller = me.id;
  update game.rooms set passed = array_append(passed, me.id) where id = r.id and me.id <> all (passed);
  v_adv := game.advance(r.id, e.now_ts);   -- may close the window early
  return game.view(r.id, me.id, e.now_ts, v_adv);
end
$$;

create function game.api_resume(p_token text, p_code text) returns jsonb
language plpgsql volatile set search_path = pg_catalog, pg_temp
as $$
declare
  e  record;
  r  game.rooms;
  me game.players;
begin
  select * into e from game.enter(p_token, p_code);
  select * into r from game.rooms where id = e.rid;
  select * into me from game.players where id = e.pid;

  if me.auto then
    perform game.touch_actor(me.id, e.now_ts);
    perform game.log_event(r.id, 'resume', jsonb_build_object('p', me.id, 'pn', me.name));
    -- Hand control back immediately if it is currently my turn / I was the planned bot caller.
    if r.status = 'turn' and r.seat_turn = me.seat and r.act_at is not null then
      update game.rooms set act_at = null, deadline = e.now_ts + make_interval(secs => r.turn_seconds) where id = r.id;
    elsif r.status = 'challenge' and r.bot_caller = me.id then
      update game.rooms set bot_caller = null, act_at = null where id = r.id;
    end if;
  else
    perform game.touch_actor(me.id, e.now_ts);
  end if;
  return game.view(r.id, me.id, e.now_ts);
end
$$;

create function game.api_rematch(p_token text, p_code text) returns jsonb
language plpgsql volatile set search_path = pg_catalog, pg_temp
as $$
declare
  e  record;
  r  game.rooms;
  me game.players;
begin
  select * into e from game.enter(p_token, p_code);
  select * into r from game.rooms where id = e.rid;
  select * into me from game.players where id = e.pid;
  if not me.is_host then raise exception 'not_host'; end if;
  if r.status <> 'finished' then raise exception 'bad_phase'; end if;

  delete from game.players where room_id = r.id and has_left;
  perform game.compact_seats(r.id);
  update game.players set hand = '{}', auto = false, missed = 0 where room_id = r.id;
  update game.rooms
  set status = 'lobby', pile = '{}', winner = null, reveal = null, deadline = null, act_at = null,
      bot_caller = null, passed = '{}', play_seat = null, play_count = 0, turn_started_at = null,
      challenge_since = null, turns = 0, rank_idx = 0, seat_turn = 0
  where id = r.id;
  perform game.log_event(r.id, 'rematch');
  return game.view(r.id, me.id, e.now_ts);
end
$$;

create function game.api_leave(p_token text, p_code text) returns jsonb
language plpgsql volatile set search_path = pg_catalog, pg_temp
as $$
declare
  e        record;
  r        game.rooms;
  me       game.players;
  v_humans integer;
  v_host   uuid;
begin
  -- No `advance` here: leaving must work even if the room is somehow in a state the engine can't step.
  select * into e from game.enter(p_token, p_code, false);
  select * into r from game.rooms where id = e.rid;
  select * into me from game.players where id = e.pid;

  select count(*)::int into v_humans
  from game.players where room_id = r.id and not is_bot and not has_left and id <> me.id;

  if v_humans = 0 then
    delete from game.rooms where id = r.id;       -- nobody left to play with: tear the room down
    return jsonb_build_object('ok', true);
  end if;

  if r.status = 'lobby' then
    delete from game.players where id = me.id;
    perform game.compact_seats(r.id);
  else
    -- Mid-game the seat is played out by the server; after the game the row stays so standings (and the
    -- winner) remain intact until the rematch clears leavers out.
    update game.players set has_left = true, auto = true, is_host = false where id = me.id;
    if r.status = 'turn' and r.seat_turn = me.seat then
      -- It was their move: let the server play it right away instead of waiting out a human timer.
      update game.rooms set act_at = e.now_ts + make_interval(secs => 1.0 + random()), deadline = null where id = r.id;
    end if;
  end if;
  perform game.log_event(r.id, 'leave', jsonb_build_object('p', me.id, 'pn', me.name));

  if me.is_host then
    select id into v_host from game.players
    where room_id = r.id and not is_bot and not has_left order by created_at limit 1;
    update game.players set is_host = true where id = v_host;
    perform game.log_event(r.id, 'host', jsonb_build_object('p', v_host, 'pn', (select name from game.players where id = v_host)));
  end if;
  return jsonb_build_object('ok', true);
end
$$;

-- -------------------------------------------------------------------------------------
-- Public API (the only thing exposed through PostgREST)
-- -------------------------------------------------------------------------------------
-- Each wrapper lets the engine's own machine-readable errors (RAISE EXCEPTION 'not_your_turn' …) through
-- untouched, and turns anything unexpected into a bare 'server_error': raw Postgres errors can carry DETAIL
-- such as "Failing row contains (…)", which must never reach a client. The real cause goes to the server log.

create function public.leery_create_room(p_token text, p_name text, p_speed text default 'standard', p_bots integer default 0, p_start boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, pg_temp
as $$
begin
  return game.api_create_room(p_token, p_name, p_speed, p_bots, p_start);
exception
  when raise_exception then raise;
  when others then
    raise log 'leery_create_room failed [%]: %', sqlstate, sqlerrm;
    raise exception 'server_error';
end
$$;

create function public.leery_join_room(p_token text, p_code text, p_name text)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, pg_temp
as $$
begin
  return game.api_join_room(p_token, p_code, p_name);
exception
  when raise_exception then raise;
  when others then
    raise log 'leery_join_room failed [%]: %', sqlstate, sqlerrm;
    raise exception 'server_error';
end
$$;

create function public.leery_get_state(p_token text, p_code text)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, pg_temp
as $$
begin
  return game.api_get_state(p_token, p_code);
exception
  when raise_exception then raise;
  when others then
    raise log 'leery_get_state failed [%]: %', sqlstate, sqlerrm;
    raise exception 'server_error';
end
$$;

create function public.leery_add_bot(p_token text, p_code text)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, pg_temp
as $$
begin
  return game.api_add_bot(p_token, p_code);
exception
  when raise_exception then raise;
  when others then
    raise log 'leery_add_bot failed [%]: %', sqlstate, sqlerrm;
    raise exception 'server_error';
end
$$;

create function public.leery_remove_player(p_token text, p_code text, p_player uuid)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, pg_temp
as $$
begin
  return game.api_remove_player(p_token, p_code, p_player);
exception
  when raise_exception then raise;
  when others then
    raise log 'leery_remove_player failed [%]: %', sqlstate, sqlerrm;
    raise exception 'server_error';
end
$$;

create function public.leery_set_speed(p_token text, p_code text, p_speed text)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, pg_temp
as $$
begin
  return game.api_set_speed(p_token, p_code, p_speed);
exception
  when raise_exception then raise;
  when others then
    raise log 'leery_set_speed failed [%]: %', sqlstate, sqlerrm;
    raise exception 'server_error';
end
$$;

create function public.leery_start(p_token text, p_code text)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, pg_temp
as $$
begin
  return game.api_start(p_token, p_code);
exception
  when raise_exception then raise;
  when others then
    raise log 'leery_start failed [%]: %', sqlstate, sqlerrm;
    raise exception 'server_error';
end
$$;

create function public.leery_play(p_token text, p_code text, p_cards text[])
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, pg_temp
as $$
begin
  return game.api_play(p_token, p_code, p_cards);
exception
  when raise_exception then raise;
  when others then
    raise log 'leery_play failed [%]: %', sqlstate, sqlerrm;
    raise exception 'server_error';
end
$$;

create function public.leery_call(p_token text, p_code text)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, pg_temp
as $$
begin
  return game.api_call(p_token, p_code);
exception
  when raise_exception then raise;
  when others then
    raise log 'leery_call failed [%]: %', sqlstate, sqlerrm;
    raise exception 'server_error';
end
$$;

create function public.leery_pass(p_token text, p_code text)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, pg_temp
as $$
begin
  return game.api_pass(p_token, p_code);
exception
  when raise_exception then raise;
  when others then
    raise log 'leery_pass failed [%]: %', sqlstate, sqlerrm;
    raise exception 'server_error';
end
$$;

create function public.leery_resume(p_token text, p_code text)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, pg_temp
as $$
begin
  return game.api_resume(p_token, p_code);
exception
  when raise_exception then raise;
  when others then
    raise log 'leery_resume failed [%]: %', sqlstate, sqlerrm;
    raise exception 'server_error';
end
$$;

create function public.leery_rematch(p_token text, p_code text)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, pg_temp
as $$
begin
  return game.api_rematch(p_token, p_code);
exception
  when raise_exception then raise;
  when others then
    raise log 'leery_rematch failed [%]: %', sqlstate, sqlerrm;
    raise exception 'server_error';
end
$$;

create function public.leery_leave(p_token text, p_code text)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, pg_temp
as $$
begin
  return game.api_leave(p_token, p_code);
exception
  when raise_exception then raise;
  when others then
    raise log 'leery_leave failed [%]: %', sqlstate, sqlerrm;
    raise exception 'server_error';
end
$$;

-- Lock everything down, then open exactly the public API (explicit grants: do not rely on defaults).
revoke all on all functions in schema game from public;
revoke all on all functions in schema game from anon, authenticated;

revoke all on function public.leery_create_room(text, text, text, integer, boolean) from public;
revoke all on function public.leery_join_room(text, text, text) from public;
revoke all on function public.leery_get_state(text, text) from public;
revoke all on function public.leery_add_bot(text, text) from public;
revoke all on function public.leery_remove_player(text, text, uuid) from public;
revoke all on function public.leery_set_speed(text, text, text) from public;
revoke all on function public.leery_start(text, text) from public;
revoke all on function public.leery_play(text, text, text[]) from public;
revoke all on function public.leery_call(text, text) from public;
revoke all on function public.leery_pass(text, text) from public;
revoke all on function public.leery_resume(text, text) from public;
revoke all on function public.leery_rematch(text, text) from public;
revoke all on function public.leery_leave(text, text) from public;

grant execute on function public.leery_create_room(text, text, text, integer, boolean) to anon, authenticated;
grant execute on function public.leery_join_room(text, text, text) to anon, authenticated;
grant execute on function public.leery_get_state(text, text) to anon, authenticated;
grant execute on function public.leery_add_bot(text, text) to anon, authenticated;
grant execute on function public.leery_remove_player(text, text, uuid) to anon, authenticated;
grant execute on function public.leery_set_speed(text, text, text) to anon, authenticated;
grant execute on function public.leery_start(text, text) to anon, authenticated;
grant execute on function public.leery_play(text, text, text[]) to anon, authenticated;
grant execute on function public.leery_call(text, text) to anon, authenticated;
grant execute on function public.leery_pass(text, text) to anon, authenticated;
grant execute on function public.leery_resume(text, text) to anon, authenticated;
grant execute on function public.leery_rematch(text, text) to anon, authenticated;
grant execute on function public.leery_leave(text, text) to anon, authenticated;

comment on function public.leery_get_state(text, text) is
  'Heartbeat + lazy timer/bot advancement + snapshot for the caller (or a preview if not a member).';
