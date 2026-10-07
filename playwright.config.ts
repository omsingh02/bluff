import { defineConfig, devices } from "@playwright/test";
import os from "node:os";
import path from "node:path";

/**
 * End-to-end tests drive the real UI against the real engine.
 *
 * They need a Postgres (any 14+) and use scripts/dev-api.mjs as the PostgREST stand-in, so the
 * full Supabase stack isn't required. Provide a superuser URL, e.g.
 *   docker run -d --name leery-pg -e POSTGRES_PASSWORD=postgres -p 127.0.0.1:54399:5432 postgres:16-alpine
 *   E2E_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54399/postgres npm run e2e
 *
 * Set E2E_CHROMIUM=/usr/bin/chromium to use a system browser instead of Playwright's download.
 * NOTE: the web server below is started with explicit VITE_* values so tests can never reach a real
 * Supabase project that might be configured in .env.
 */
const API_PORT = Number(process.env.E2E_API_PORT ?? 54322);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5190);
const DB = process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54399/postgres";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: "test-results",
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      executablePath: process.env.E2E_CHROMIUM || undefined,
      args: ["--no-sandbox"],
    },
  },
  // `E2E_VISUAL=1` runs only the screenshot tour, on mobile and desktop.
  grep: process.env.E2E_VISUAL ? /@visual/ : undefined,
  grepInvert: process.env.E2E_VISUAL ? undefined : /@visual/,
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"], browserName: "chromium" } },
    ...(process.env.E2E_VISUAL
      ? [{ name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, browserName: "chromium" as const } }]
      : []),
  ],
  webServer: [
    {
      command: "node scripts/dev-api.mjs",
      url: `http://127.0.0.1:${API_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      env: { PORT: String(API_PORT), DEV_DATABASE_URL: DB, DEV_DB_NAME: "leery_e2e", RESET: "1" },
      timeout: 60_000,
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort --host 127.0.0.1`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_CACHE_DIR: path.join(os.tmpdir(), "leery-vite-cache"),
        VITE_SUPABASE_URL: `http://127.0.0.1:${API_PORT}`,
        VITE_SUPABASE_PUBLISHABLE_KEY: "e2e-key",
        VITE_REALTIME: "off",
      },
      timeout: 60_000,
    },
  ],
});
