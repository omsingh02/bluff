import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/** false → the app shows a configuration screen instead of crashing. */
export const configured = Boolean(url && key);

/** Realtime is only an accelerator (pings); the game works with polling alone. */
export const REALTIME_ENABLED = import.meta.env.VITE_REALTIME !== "off";

/**
 * We never use Supabase Auth: identity is a random device token sent to the database functions
 * (see `session.ts`), and all game tables are private behind SECURITY DEFINER RPCs.
 */
export const supabase = createClient(url ?? "http://localhost:54321", key ?? "missing-key", {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  realtime: { params: { eventsPerSecond: 10 } },
});
