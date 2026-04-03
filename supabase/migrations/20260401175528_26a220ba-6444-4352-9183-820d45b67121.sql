
-- Create game_rooms table
CREATE TABLE public.game_rooms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'waiting',
  current_turn_index INTEGER NOT NULL DEFAULT 0,
  center_pile JSONB NOT NULL DEFAULT '[]'::jsonb,
  claimed_rank TEXT,
  last_played_by TEXT,
  last_played_count INTEGER NOT NULL DEFAULT 0,
  winner_id TEXT,
  bluff_timer_end BIGINT,
  host_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create game_players table
CREATE TABLE public.game_players (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.game_rooms(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL,
  nickname TEXT NOT NULL,
  hand JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_host BOOLEAN NOT NULL DEFAULT false,
  turn_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (room_id, player_id)
);

-- Enable RLS
ALTER TABLE public.game_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_players ENABLE ROW LEVEL SECURITY;

-- Public access policies (casual game, no auth required)
CREATE POLICY "Anyone can view rooms" ON public.game_rooms FOR SELECT USING (true);
CREATE POLICY "Anyone can create rooms" ON public.game_rooms FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update rooms" ON public.game_rooms FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete rooms" ON public.game_rooms FOR DELETE USING (true);

CREATE POLICY "Anyone can view players" ON public.game_players FOR SELECT USING (true);
CREATE POLICY "Anyone can join" ON public.game_players FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update players" ON public.game_players FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete players" ON public.game_players FOR DELETE USING (true);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_players;

-- Index for room lookup
CREATE INDEX idx_game_rooms_code ON public.game_rooms(room_code);
CREATE INDEX idx_game_players_room ON public.game_players(room_id);
