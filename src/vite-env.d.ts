/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** "off" disables Realtime pings (polling only). */
  readonly VITE_REALTIME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
