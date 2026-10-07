import { supabase } from "./supabase";
import type { CardCode, RoomView, Speed, StateResponse } from "./types";

/** Machine-readable errors raised by the database functions (the exception message). */
export const API_ERROR_CODES = [
  "bad_request",
  "room_not_found",
  "not_in_room",
  "room_started",
  "room_full",
  "name_taken",
  "name_invalid",
  "banned",
  "not_host",
  "bad_phase",
  "not_your_turn",
  "bad_cards",
  "need_players",
  "too_many_rooms",
  "rate_limited",
  "server_error",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number] | "setup" | "network" | "unknown";

const MESSAGES: Record<ApiErrorCode, string> = {
  bad_request: "Something was wrong with that request.",
  room_not_found: "That room doesn't exist (anymore).",
  not_in_room: "You're not part of this room.",
  room_started: "That game has already started.",
  room_full: "That room is full.",
  name_taken: "Someone in the room already uses that name.",
  name_invalid: "Pick a name between 1 and 16 characters.",
  banned: "The host removed you from this room.",
  not_host: "Only the host can do that.",
  bad_phase: "Too late — the game has moved on.",
  not_your_turn: "It's not your turn.",
  bad_cards: "Pick 1–4 cards from your hand.",
  need_players: "You need at least two players (bots count).",
  too_many_rooms: "The server is busy. Try again in a minute.",
  rate_limited: "Slow down a little — try again shortly.",
  server_error: "The server hit a snag. Please try again.",
  setup: "The game server isn't set up yet (database migration missing).",
  network: "Can't reach the server. Check your connection.",
  unknown: "Something went wrong. Please try again.",
};

export const friendlyError = (code: ApiErrorCode): string => MESSAGES[code];

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  constructor(code: ApiErrorCode, message?: string) {
    super(message ?? MESSAGES[code]);
    this.name = "ApiError";
    this.code = code;
  }
}

const KNOWN = new Set<string>(API_ERROR_CODES);

function toApiError(err: { message?: string; code?: string }): ApiError {
  const msg = (err.message ?? "").trim();
  if (KNOWN.has(msg)) return new ApiError(msg as ApiErrorCode);
  // PostgREST: function missing from the schema cache → migration not applied.
  if (err.code === "PGRST202" || err.code === "42883" || /could not find the function|schema cache/i.test(msg)) {
    return new ApiError("setup");
  }
  if (/failed to fetch|network|load failed|fetch failed|timeout|abort/i.test(msg)) return new ApiError("network");
  return new ApiError("unknown", undefined);
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  let res;
  try {
    res = await supabase.rpc(fn, args);
  } catch (e) {
    throw toApiError({ message: e instanceof Error ? e.message : String(e) });
  }
  if (res.error) throw toApiError(res.error);
  return res.data as T;
}

export interface CreateOptions {
  speed?: Speed;
  /** Seat this many bots right away (0–7). */
  bots?: number;
  /** Start immediately (needs ≥ 2 players including bots) — used for "play vs bots". */
  start?: boolean;
}

/** Thin typed wrappers over the `leery_*` database functions. Every call returns the caller's fresh RoomView. */
export const api = {
  createRoom: (token: string, name: string, opts: CreateOptions = {}) =>
    rpc<RoomView>("leery_create_room", {
      p_token: token,
      p_name: name,
      p_speed: opts.speed ?? "standard",
      p_bots: opts.bots ?? 0,
      p_start: opts.start ?? false,
    }),
  joinRoom: (token: string, code: string, name: string) =>
    rpc<RoomView>("leery_join_room", { p_token: token, p_code: code, p_name: name }),
  /** Heartbeat + lazy timer/bot advancement + snapshot. Returns a RoomPreview if you're not a member. */
  getState: (token: string, code: string) => rpc<StateResponse>("leery_get_state", { p_token: token, p_code: code }),
  addBot: (token: string, code: string) => rpc<RoomView>("leery_add_bot", { p_token: token, p_code: code }),
  removePlayer: (token: string, code: string, playerId: string) =>
    rpc<RoomView>("leery_remove_player", { p_token: token, p_code: code, p_player: playerId }),
  setSpeed: (token: string, code: string, speed: Speed) =>
    rpc<RoomView>("leery_set_speed", { p_token: token, p_code: code, p_speed: speed }),
  start: (token: string, code: string) => rpc<RoomView>("leery_start", { p_token: token, p_code: code }),
  play: (token: string, code: string, cards: CardCode[]) =>
    rpc<RoomView>("leery_play", { p_token: token, p_code: code, p_cards: cards }),
  call: (token: string, code: string) => rpc<RoomView>("leery_call", { p_token: token, p_code: code }),
  pass: (token: string, code: string) => rpc<RoomView>("leery_pass", { p_token: token, p_code: code }),
  resume: (token: string, code: string) => rpc<RoomView>("leery_resume", { p_token: token, p_code: code }),
  rematch: (token: string, code: string) => rpc<RoomView>("leery_rematch", { p_token: token, p_code: code }),
  leave: (token: string, code: string) => rpc<{ ok: true }>("leery_leave", { p_token: token, p_code: code }),
};
