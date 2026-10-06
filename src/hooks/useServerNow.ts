import { useEffect, useState } from "react";

interface HasClock {
  serverNow: () => number;
}

/** Server-corrected "now" (epoch ms) that re-renders the caller every `intervalMs`. */
export function useServerNow(room: HasClock, intervalMs = 100): number {
  const { serverNow } = room;
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    setNow(serverNow());
    const id = setInterval(() => setNow(serverNow()), intervalMs);
    return () => clearInterval(id);
  }, [serverNow, intervalMs]);
  return now;
}

/** Time left until a server deadline. `remainingMs`/`seconds` are null when there is no deadline. */
export function useCountdown(
  deadline: number | null | undefined,
  room: HasClock,
  intervalMs = 100,
): { remainingMs: number | null; seconds: number | null } {
  const now = useServerNow(room, intervalMs);
  if (deadline == null) return { remainingMs: null, seconds: null };
  const remainingMs = Math.max(0, deadline - now);
  return { remainingMs, seconds: Math.ceil(remainingMs / 1000) };
}
