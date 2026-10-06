import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  cacheDir: process.env.VITE_CACHE_DIR || undefined,
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    // Never let a unit test reach a real backend, whatever .env contains.
    env: { VITE_SUPABASE_URL: "http://127.0.0.1:1", VITE_SUPABASE_PUBLISHABLE_KEY: "unit-test", VITE_REALTIME: "off" },
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    // DB tests need a real Postgres (see scripts/test-db.sh); they skip themselves when TEST_DATABASE_URL is unset.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // The engine tests share one database, so run files serially.
    fileParallelism: false,
  },
});
