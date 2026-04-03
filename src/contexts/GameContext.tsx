import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import {
  GameState, Player, Card, Rank, GameStatus,
  createDeck, shuffleDeck, dealCards, generateRoomCode, getNextTurnIndex
} from "@/lib/gameLogic";
import { supabase } from "@/integrations/supabase/client";
import { Json } from "@/integrations/supabase/types";
import { RealtimeChannel } from "@supabase/supabase-js";

interface GameContextType {
  gameState: GameState | null;
  currentPlayerId: string | null;
  nickname: string;
  setNickname: (name: string) => void;
  createGame: () => Promise<string>;
  joinGame: (roomCode: string) => Promise<boolean>;
  addBot: () => Promise<void>;
  startGame: () => Promise<void>;
  playCards: (cardIds: string[], claimedRank: Rank) => Promise<void>;
  callBluff: () => Promise<void>;
  isMyTurn: boolean;
  isBluffWindow: boolean;
  myPlayer: Player | null;
  resetGame: () => void;
  loading: boolean;
}

const GameContext = createContext<GameContextType | null>(null);

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used within GameProvider");
  return ctx;
}

// Get or create a persistent player ID stored in localStorage
function getPlayerId(): string {
  let id = localStorage.getItem("bluff_player_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("bluff_player_id", id);
  }
  return id;
}

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [currentPlayerId] = useState<string>(getPlayerId());
  const [nickname, setNickname] = useState(() => localStorage.getItem("bluff_nickname") || "");
  const [loading, setLoading] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const bluffTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleSetNickname = useCallback((name: string) => {
    setNickname(name);
    localStorage.setItem("bluff_nickname", name);
  }, []);

  // Build GameState from DB rows
  const buildGameState = useCallback((room: any, players: any[]): GameState => {
    const parsedPlayers: Player[] = players
      .sort((a: any, b: any) => a.turn_order - b.turn_order)
      .map((p: any) => ({
        id: p.player_id,
        nickname: p.nickname,
        hand: (p.hand as Card[]) || [],
        isHost: p.is_host,
        turnOrder: p.turn_order,
      }));

    return {
      roomCode: room.room_code,
      status: room.status as GameStatus,
      players: parsedPlayers,
      currentTurnIndex: room.current_turn_index,
      centerPile: (room.center_pile as Card[]) || [],
      claimedRank: room.claimed_rank as Rank | null,
      lastPlayedBy: room.last_played_by,
      lastPlayedCount: room.last_played_count,
      winnerId: room.winner_id,
      bluffTimerEnd: room.bluff_timer_end,
    };
  }, []);

  // Fetch full state from DB
  const fetchGameState = useCallback(async (roomId: string) => {
    const [roomRes, playersRes] = await Promise.all([
      supabase.from("game_rooms").select("*").eq("id", roomId).single(),
      supabase.from("game_players").select("*").eq("room_id", roomId),
    ]);
    if (roomRes.data && playersRes.data) {
      const state = buildGameState(roomRes.data, playersRes.data);
      setGameState(state);
      return state;
    }
    return null;
  }, [buildGameState]);

  // Subscribe to realtime changes
  const subscribeToRoom = useCallback((roomId: string) => {
    // Cleanup old subscription
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }
    roomIdRef.current = roomId;

    const channel = supabase
      .channel(`room-${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_rooms", filter: `id=eq.${roomId}` },
        () => { fetchGameState(roomId); }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_players", filter: `room_id=eq.${roomId}` },
        () => { fetchGameState(roomId); }
      )
      .subscribe();

    channelRef.current = channel;
  }, [fetchGameState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
      if (bluffTimerRef.current) clearTimeout(bluffTimerRef.current);
    };
  }, []);

  const createGame = useCallback(async () => {
    setLoading(true);
    const roomCode = generateRoomCode();

    const { data: room, error: roomError } = await supabase
      .from("game_rooms")
      .insert({
        room_code: roomCode,
        host_id: currentPlayerId,
        status: "waiting",
      })
      .select()
      .single();

    if (roomError || !room) {
      setLoading(false);
      throw new Error("Failed to create room");
    }

    await supabase.from("game_players").insert({
      room_id: room.id,
      player_id: currentPlayerId,
      nickname,
      is_host: true,
      turn_order: 0,
    });

    subscribeToRoom(room.id);
    await fetchGameState(room.id);
    setLoading(false);
    return roomCode;
  }, [currentPlayerId, nickname, subscribeToRoom, fetchGameState]);

  const joinGame = useCallback(async (roomCode: string): Promise<boolean> => {
    setLoading(true);
    const { data: room } = await supabase
      .from("game_rooms")
      .select("*")
      .eq("room_code", roomCode)
      .eq("status", "waiting")
      .single();

    if (!room) {
      setLoading(false);
      return false;
    }

    // Check if already in the room
    const { data: existing } = await supabase
      .from("game_players")
      .select("id")
      .eq("room_id", room.id)
      .eq("player_id", currentPlayerId)
      .maybeSingle();

    if (existing) {
      // Already joined, just subscribe
      subscribeToRoom(room.id);
      await fetchGameState(room.id);
      setLoading(false);
      return true;
    }

    // Count current players
    const { count } = await supabase
      .from("game_players")
      .select("id", { count: "exact", head: true })
      .eq("room_id", room.id);

    if ((count ?? 0) >= 6) {
      setLoading(false);
      return false;
    }

    await supabase.from("game_players").insert({
      room_id: room.id,
      player_id: currentPlayerId,
      nickname,
      is_host: false,
      turn_order: count ?? 0,
    });

    subscribeToRoom(room.id);
    await fetchGameState(room.id);
    setLoading(false);
    return true;
  }, [currentPlayerId, nickname, subscribeToRoom, fetchGameState]);

  const addBot = useCallback(async () => {
    if (!roomIdRef.current) return;
    const botNames = ["BluffBot", "CardShark", "PokerFace", "Trickster", "Wildcard", "Dealer"];
    const botId = `bot-${crypto.randomUUID()}`;

    const { count } = await supabase
      .from("game_players")
      .select("id", { count: "exact", head: true })
      .eq("room_id", roomIdRef.current);

    const name = botNames[(count ?? 1) - 1] || `Bot${count}`;

    await supabase.from("game_players").insert({
      room_id: roomIdRef.current,
      player_id: botId,
      nickname: name,
      is_host: false,
      turn_order: count ?? 0,
    });
  }, []);

  const startGame = useCallback(async () => {
    if (!roomIdRef.current) return;

    const { data: players } = await supabase
      .from("game_players")
      .select("*")
      .eq("room_id", roomIdRef.current)
      .order("turn_order");

    if (!players || players.length < 2) return;

    const deck = shuffleDeck(createDeck());
    const hands = dealCards(deck, players.length);

    // Update each player's hand
    const updates = players.map((p, i) =>
      supabase.from("game_players").update({ hand: hands[i] as unknown as Json }).eq("id", p.id)
    );
    await Promise.all(updates);

    // Update room status
    await supabase
      .from("game_rooms")
      .update({ status: "playing" })
      .eq("id", roomIdRef.current);
  }, []);

  const startBluffTimer = useCallback(async () => {
    if (bluffTimerRef.current) clearTimeout(bluffTimerRef.current);
    if (!roomIdRef.current) return;

    const end = Date.now() + 5000;
    await supabase
      .from("game_rooms")
      .update({ status: "bluff_window", bluff_timer_end: end })
      .eq("id", roomIdRef.current);

    bluffTimerRef.current = setTimeout(async () => {
      if (!roomIdRef.current) return;
      // Re-fetch current state to check for win
      const { data: room } = await supabase
        .from("game_rooms")
        .select("*")
        .eq("id", roomIdRef.current)
        .single();

      if (!room || room.status !== "bluff_window") return;

      // Check if the player who last played has 0 cards
      if (room.last_played_by) {
        const { data: lastPlayer } = await supabase
          .from("game_players")
          .select("hand, player_id")
          .eq("room_id", roomIdRef.current)
          .eq("player_id", room.last_played_by)
          .single();

        if (lastPlayer && (lastPlayer.hand as unknown as Card[]).length === 0) {
          await supabase
            .from("game_rooms")
            .update({ status: "finished", winner_id: lastPlayer.player_id, bluff_timer_end: null })
            .eq("id", roomIdRef.current);
          return;
        }
      }

      const { count } = await supabase
        .from("game_players")
        .select("id", { count: "exact", head: true })
        .eq("room_id", roomIdRef.current);

      await supabase
        .from("game_rooms")
        .update({
          status: "playing",
          current_turn_index: getNextTurnIndex(room.current_turn_index, count ?? 2),
          bluff_timer_end: null,
        })
        .eq("id", roomIdRef.current);
    }, 5000);
  }, []);

  const playCards = useCallback(async (cardIds: string[], claimedRank: Rank) => {
    if (!roomIdRef.current || !gameState) return;

    const currentPlayer = gameState.players[gameState.currentTurnIndex];
    if (currentPlayer.id !== currentPlayerId) return;

    const playedCards = currentPlayer.hand.filter(c => cardIds.includes(c.id));
    const remainingHand = currentPlayer.hand.filter(c => !cardIds.includes(c.id));

    // Update player's hand
    await supabase
      .from("game_players")
      .update({ hand: remainingHand as unknown as Json })
      .eq("room_id", roomIdRef.current)
      .eq("player_id", currentPlayerId);

    // Update room: add cards to pile, set claimed rank
    const newPile = [...gameState.centerPile, ...playedCards];
    await supabase
      .from("game_rooms")
      .update({
        center_pile: newPile as unknown as Json,
        claimed_rank: claimedRank,
        last_played_by: currentPlayerId,
        last_played_count: playedCards.length,
      })
      .eq("id", roomIdRef.current);

    // Start bluff timer (only host runs timer to avoid race conditions)
    await startBluffTimer();
  }, [currentPlayerId, gameState, startBluffTimer]);

  const callBluff = useCallback(async () => {
    if (bluffTimerRef.current) clearTimeout(bluffTimerRef.current);
    if (!roomIdRef.current || !gameState || !gameState.lastPlayedBy || !gameState.claimedRank) return;

    const lastPlayed = gameState.centerPile.slice(-gameState.lastPlayedCount);
    const wasBluffing = lastPlayed.some(c => c.rank !== gameState.claimedRank);

    // Determine who picks up the pile
    const pickUpPlayerId = wasBluffing ? gameState.lastPlayedBy : currentPlayerId;
    const pickUpPlayer = gameState.players.find(p => p.id === pickUpPlayerId);
    if (!pickUpPlayer) return;

    const newHand = [...pickUpPlayer.hand, ...gameState.centerPile];

    // Update the player who picks up the pile
    await supabase
      .from("game_players")
      .update({ hand: newHand as unknown as Json })
      .eq("room_id", roomIdRef.current)
      .eq("player_id", pickUpPlayerId);

    // Reset the room state
    await supabase
      .from("game_rooms")
      .update({
        center_pile: [] as unknown as Json,
        claimed_rank: null,
        last_played_by: null,
        last_played_count: 0,
        status: "playing",
        current_turn_index: getNextTurnIndex(gameState.currentTurnIndex, gameState.players.length),
        bluff_timer_end: null,
      })
      .eq("id", roomIdRef.current);
  }, [currentPlayerId, gameState]);

  const resetGame = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (bluffTimerRef.current) clearTimeout(bluffTimerRef.current);
    roomIdRef.current = null;
    setGameState(null);
  }, []);

  // Reconnect to a room by code (for page refresh / direct URL navigation)
  const reconnectToRoom = useCallback(async (roomCode: string) => {
    const { data: room } = await supabase
      .from("game_rooms")
      .select("*")
      .eq("room_code", roomCode)
      .single();

    if (!room) return;

    // Check if we're a player in this room
    const { data: player } = await supabase
      .from("game_players")
      .select("id")
      .eq("room_id", room.id)
      .eq("player_id", currentPlayerId)
      .maybeSingle();

    if (!player) return;

    subscribeToRoom(room.id);
    await fetchGameState(room.id);
  }, [currentPlayerId, subscribeToRoom, fetchGameState]);

  // Expose reconnect via context for pages to call
  const contextValue = React.useMemo(() => {
    const myPlayer = gameState?.players.find(p => p.id === currentPlayerId) ?? null;
    const isMyTurn = gameState?.status === "playing" &&
      gameState.players[gameState.currentTurnIndex]?.id === currentPlayerId;
    const isBluffWindow = gameState?.status === "bluff_window" &&
      gameState.lastPlayedBy !== currentPlayerId;

    return {
      gameState, currentPlayerId, nickname, setNickname: handleSetNickname,
      createGame, joinGame, addBot, startGame, playCards, callBluff,
      isMyTurn, isBluffWindow, myPlayer, resetGame, loading,
      reconnectToRoom,
    };
  }, [gameState, currentPlayerId, nickname, handleSetNickname,
    createGame, joinGame, addBot, startGame, playCards, callBluff,
    resetGame, loading, reconnectToRoom]);

  return (
    <GameContext.Provider value={contextValue as any}>
      {children}
    </GameContext.Provider>
  );
}
