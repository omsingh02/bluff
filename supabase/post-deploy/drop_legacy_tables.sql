-- RUN MANUALLY, AFTER the new frontend is live and you have played a game on it.
-- (Deliberately NOT in supabase/migrations/: `supabase db push` must stay purely additive.)
--
-- The v1 prototype kept game state in two world-writable tables in `public`: anyone holding the
-- (public) API key could read every player's hand and rewrite or delete any room. The new engine keeps
-- all state in the private `game` schema behind validated functions, so these tables are dead weight
-- and an open write surface. Dropping them also removes them from the `supabase_realtime` publication.
--
-- This only deletes throw-away prototype game rows. Run it in the Supabase SQL editor, or:
--   supabase db query --linked -f supabase/post-deploy/drop_legacy_tables.sql
drop table if exists public.game_players;
drop table if exists public.game_rooms;
