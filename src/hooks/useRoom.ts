import { useEffect, useMemo, useSyncExternalStore } from "react";
import { RoomSync, type Connection, type Snapshot } from "@/lib/roomSync";
import { getToken } from "@/lib/session";
import type { CardCode, Speed } from "@/lib/types";
import { normalizeCode } from "@/lib/utils";

export type { Connection };

/**
 * Everything the UI needs for one room. Action methods resolve `true` on success; on failure they
 * have already shown a toast and resynced, so callers don't need their own error handling.
 */
export interface RoomController extends Snapshot {
  code: string;
  /** Server-corrected `Date.now()`. Compare server timestamps (deadlines etc.) against this. */
  serverNow: () => number;
  /** Join as a new player (when `preview` is set). */
  join: (name: string) => Promise<boolean>;
  /** Play 1–4 cards face-down, claiming `turn.rank`. */
  play: (cards: CardCode[]) => Promise<boolean>;
  /** Call bluff on the pending play. */
  call: () => Promise<boolean>;
  /** Accept the pending play (lets the game move on sooner). */
  pass: () => Promise<boolean>;
  /** Take back control from autopilot. */
  resume: () => Promise<boolean>;
  /** Host: start the game. */
  start: () => Promise<boolean>;
  /** Host: add a bot to the lobby. */
  addBot: () => Promise<boolean>;
  /** Host: remove a bot or kick a human (lobby only). */
  removePlayer: (playerId: string) => Promise<boolean>;
  /** Host: change game speed (lobby only). */
  setSpeed: (speed: Speed) => Promise<boolean>;
  /** Host: go back to the lobby for another round (after the game finished). */
  rematch: () => Promise<boolean>;
  /** Leave the room for good. Navigate home afterwards. */
  leave: () => Promise<boolean>;
  refresh: () => Promise<void>;
}

export function useRoom(rawCode: string): RoomController {
  const code = normalizeCode(rawCode);
  const sync = useMemo(() => new RoomSync(code, getToken()), [code]);

  useEffect(() => {
    sync.start();
    return () => sync.stop();
  }, [sync]);

  const snap = useSyncExternalStore(sync.subscribe, sync.getSnapshot, sync.getSnapshot);

  return useMemo<RoomController>(
    () => ({
      ...snap,
      code: sync.code,
      serverNow: sync.serverNow,
      join: sync.join,
      play: sync.play,
      call: sync.call,
      pass: sync.pass,
      resume: sync.resume,
      start: sync.start_,
      addBot: sync.addBot,
      removePlayer: sync.removePlayer,
      setSpeed: sync.setSpeed,
      rematch: sync.rematch,
      leave: sync.leave,
      refresh: sync.refresh,
    }),
    [snap, sync],
  );
}
