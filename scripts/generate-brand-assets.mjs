#!/usr/bin/env node
/**
 * Regenerates every brand image from source — logo SVGs, app icons, README screenshots, social previews.
 *
 *   E2E_CHROMIUM=/usr/bin/chromium node scripts/generate-brand-assets.mjs [group ...]
 *
 * Groups (default: all)
 *   logo     public/favicon.svg, docs/brand/logo*.svg
 *   icons    public/icon-*.png, public/apple-touch-icon.png
 *   screens  docs/screenshots/*.webp — real UI, rendered from the dev playground fixtures (src/dev/fixtures.ts)
 *   social   public/og.png, docs/social-preview.png, docs/banner.png, docs/screenshots/hero.webp
 *
 * Needs: @playwright/test + a Chromium (`npx playwright install chromium`, or point E2E_CHROMIUM at a system
 * browser) and python3 with Pillow for PNG/WebP optimisation (the standard wheels include libimagequant,
 * which keeps the gradients clean in the 256-colour og.png). The Vite playground is started (and stopped)
 * by this script; set BRAND_BASE_URL to reuse one that's already running. Scratch files go to os.tmpdir().
 * Screenshots embed live countdowns, so re-run it when the UI or brand changes, not on every commit.
 *
 * Source of truth: scripts/brand/{logo,wordmark,compose}.mjs — the mark's geometry is mirrored in
 * src/components/shell/Logo.tsx.
 */
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { bannerHtml, heroHtml, socialHtml } from "./brand/compose.mjs";
import { faviconSvg, iconSvg, lockupSvg, markSvg } from "./brand/logo.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dest = (...p) => path.join(root, ...p);
const GROUPS = ["logo", "icons", "screens", "social"];

const usage = `usage: node scripts/generate-brand-assets.mjs [${GROUPS.join("|")} ...]`;
const wanted = process.argv.slice(2);
if (wanted.some((a) => a === "-h" || a === "--help")) {
  console.log(usage);
  process.exit(0);
}
const unknown = wanted.filter((g) => !GROUPS.includes(g));
if (unknown.length) {
  console.error(`unknown group: ${unknown.join(", ")}\n${usage}`);
  process.exit(1);
}
const todo = new Set(wanted.length ? wanted : GROUPS);

const work = mkdtempSync(path.join(tmpdir(), "leery-brand-"));
const scratch = (name) => path.join(work, name);

// ------------------------------------------------------------------------------------------ output helpers

function write(file, data) {
  mkdirSync(path.dirname(dest(file)), { recursive: true });
  writeFileSync(dest(file), data);
}

function report(file, dims) {
  const kb = Math.max(1, Math.round(statSync(dest(file)).size / 1024));
  console.log(`  ${file.padEnd(38)} ${String(kb).padStart(4)} KB  ${dims}`);
}

/** Shrinks `src` into the repo with the Pillow helper. */
function optimize(kind, src, file, ...flags) {
  mkdirSync(path.dirname(dest(file)), { recursive: true });
  execFileSync(process.env.PYTHON || "python3", [dest("scripts/brand/optimize.py"), kind, src, dest(file), ...flags], {
    stdio: ["ignore", "inherit", "inherit"],
  });
}

// ------------------------------------------------------------------------------------------ browser + dev server

let browserPromise;
const browser = () =>
  (browserPromise ??= chromium.launch({ executablePath: process.env.E2E_CHROMIUM || undefined, args: ["--no-sandbox"] }));

let playground;
/** Base URL of the Vite dev server that serves /dev/*.html (the real components rendered from fixtures). */
async function playgroundUrl() {
  if (process.env.BRAND_BASE_URL) return process.env.BRAND_BASE_URL;
  if (!playground) {
    const { createServer } = await import("vite");
    const server = await createServer({
      root,
      cacheDir: scratch("vite"),
      logLevel: "error",
      clearScreen: false,
      optimizeDeps: { entries: ["dev/*.html"] },
      server: { host: "127.0.0.1", port: 5199, strictPort: false, hmr: false },
    });
    await server.listen();
    playground = { server, url: server.resolvedUrls.local[0] };
  }
  return playground.url;
}

const fontFile = (pkg, name) =>
  pathToFileURL(realpathSync(path.join(root, "node_modules", "@fontsource-variable", pkg, "files", name))).href;
const FONTS = `
@font-face { font-family: 'U'; font-weight: 200 900; src: url('${fontFile("unbounded", "unbounded-latin-wght-normal.woff2")}') format('woff2'); }
@font-face { font-family: 'I'; font-weight: 100 900; src: url('${fontFile("inter", "inter-latin-wght-normal.woff2")}') format('woff2'); }`;

/** Renders a standalone HTML string (written to scratch so it can load file:// fonts and images) to a PNG. */
async function renderHtml(html, name, w, h, { transparent = false } = {}) {
  const htmlFile = scratch(`${name}.html`);
  const pngFile = scratch(`${name}.png`);
  writeFileSync(htmlFile, html);
  const page = await (await browser()).newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(htmlFile).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: pngFile, omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } });
  await page.close();
  return pngFile;
}

// ------------------------------------------------------------------------------------------ logo

function buildLogo() {
  console.log("logo");
  write("public/favicon.svg", faviconSvg());
  report("public/favicon.svg", "64×64 viewBox");
  write("docs/brand/logo-mark.svg", markSvg());
  report("docs/brand/logo-mark.svg", "mark only, transparent");
  write("docs/brand/logo.svg", lockupSvg({ theme: "dark" }));
  report("docs/brand/logo.svg", "lockup, for dark backgrounds");
  write("docs/brand/logo-on-light.svg", lockupSvg({ theme: "light" }));
  report("docs/brand/logo-on-light.svg", "lockup, for light backgrounds");
}

// ------------------------------------------------------------------------------------------ icons

async function buildIcons() {
  console.log("icons");
  const icons = [
    // "any" icons keep the rounded tile on a transparent square; maskable/Apple icons bleed to the edge
    ["public/icon-192.png", 192, iconSvg({ size: 192 }), true],
    ["public/icon-512.png", 512, iconSvg({ size: 512 }), true],
    ["public/icon-maskable-512.png", 512, iconSvg({ size: 512, bleed: true, scale: 0.8 }), false],
    ["public/apple-touch-icon.png", 180, iconSvg({ size: 180, bleed: true, scale: 0.9 }), false],
  ];
  for (const [file, size, svg, transparent] of icons) {
    const html = `<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`;
    const png = await renderHtml(html, path.basename(file, ".png"), size, size, { transparent });
    optimize("png", png, file);
    report(file, `${size}×${size}`);
  }
}

// ------------------------------------------------------------------------------------------ screenshots

const MOBILE = { width: 390, height: 844, scale: 2 };
const DESKTOP = { width: 1440, height: 900, scale: 1.5 };

// The pile flying to whoever picks it up after a reveal is mid-air in a still frame — keep it out of the shot.
const NO_FLIGHTS = ".z-\\[60\\] { display: none !important }";

/** `url` is relative to /dev/; `ready` is a selector that means the screen has rendered; `settle` lets animations land. */
const SHOTS = [
  { name: "home", url: "shell.html?page=home", ready: "[data-testid=create-room]", settle: 1600 },
  { name: "lobby", url: "shell.html?state=lobby-host", ready: "[data-testid=start-game]" },
  { name: "table", url: "game.html?state=turn-mine", ready: "[data-testid=play-button]" },
  { name: "challenge", url: "game.html?state=challenge-call", ready: "[data-testid=call-bluff]" },
  { name: "reveal-bluff", url: "game.html?state=reveal-bluff", ready: "[data-testid=reveal-result]", settle: 400, css: NO_FLIGHTS },
  { name: "reveal-honest", url: "game.html?state=reveal-honest", ready: "[data-testid=reveal-result]", settle: 400, css: NO_FLIGHTS },
  { name: "game-over", url: "shell.html?state=finished-win", ready: "[data-testid=rematch]", settle: 1800 },
  { name: "desktop-table", url: "game.html?state=turn-mine", ready: "[data-testid=play-button]", desktop: true },
  { name: "desktop-lobby", url: "shell.html?state=lobby-host", ready: "[data-testid=start-game]", desktop: true },
];

let shotsPromise;
/** Captures every playground screen once per run → { name: png path }. */
function captureShots() {
  return (shotsPromise ??= (async () => {
    const base = await playgroundUrl();
    const b = await browser();
    const files = {};
    const warm = async (url) => {
      const page = await b.newPage();
      await page.goto(new URL(`dev/${url}`, base).href, { waitUntil: "networkidle" });
      await page.close();
    };
    await warm("game.html?state=turn-mine"); // let Vite finish pre-bundling before the real captures
    await warm("shell.html?page=home");

    for (const shot of SHOTS) {
      const view = shot.desktop ? DESKTOP : MOBILE;
      const context = await b.newContext({
        viewport: { width: view.width, height: view.height },
        deviceScaleFactor: view.scale,
        colorScheme: "dark",
        locale: "en-US",
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(new URL(`dev/${shot.url}`, base).href, { waitUntil: "networkidle" });
      // The playground paints an opaque body; the real app lets the ambient aurora show through.
      await page.addStyleTag({ content: `body { background: transparent !important } ${shot.css ?? ""}` });
      await page.waitForSelector(shot.ready, { state: "visible" });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(shot.settle ?? 1300);
      files[shot.name] = scratch(`shot-${shot.name}.png`);
      await page.screenshot({ path: files[shot.name] });
      await context.close();
      if (errors.length) throw new Error(`${shot.name}: ${errors.join("; ")}`);
    }
    return files;
  })());
}

async function buildScreens() {
  console.log("screens");
  const files = await captureShots();
  for (const shot of SHOTS) {
    const view = shot.desktop ? DESKTOP : MOBILE;
    const file = `docs/screenshots/${shot.name}.webp`;
    optimize("webp", files[shot.name], file, "--quality", shot.desktop ? "90" : "92");
    report(file, `${view.width * view.scale}×${view.height * view.scale}`);
  }
}

// ------------------------------------------------------------------------------------------ social images

async function buildSocial() {
  console.log("social");
  const files = await captureShots();
  const shots = {
    lobby: pathToFileURL(files.lobby).href,
    challenge: pathToFileURL(files.challenge).href,
    reveal: pathToFileURL(files["reveal-bluff"]).href,
  };

  // link preview (WhatsApp rejects images over ~300 KB) and the GitHub repo social preview (limit 1 MB)
  let png = await renderHtml(socialHtml({ w: 1200, h: 630, fonts: FONTS, shots }), "og", 1200, 630);
  optimize("png", png, "public/og.png", "--max-kb", "300");
  report("public/og.png", "1200×630");

  png = await renderHtml(socialHtml({ w: 1280, h: 640, fonts: FONTS, shots }), "social-preview", 1280, 640);
  optimize("png", png, "docs/social-preview.png", "--max-kb", "900");
  report("docs/social-preview.png", "1280×640");

  png = await renderHtml(bannerHtml({ w: 1600, h: 420, fonts: FONTS }), "banner", 1600, 420);
  optimize("png", png, "docs/banner.png", "--max-kb", "300");
  report("docs/banner.png", "1600×420");

  png = await renderHtml(heroHtml({ w: 1600, h: 900, fonts: FONTS, shots }), "hero", 1600, 900);
  optimize("webp", png, "docs/screenshots/hero.webp", "--quality", "90");
  report("docs/screenshots/hero.webp", "1600×900");
}

// ------------------------------------------------------------------------------------------ run

try {
  if (todo.has("logo")) buildLogo();
  if (todo.has("icons")) await buildIcons();
  if (todo.has("screens")) await buildScreens();
  if (todo.has("social")) await buildSocial();
} finally {
  if (browserPromise) await (await browserPromise).close();
  if (playground) await playground.server.close();
  rmSync(work, { recursive: true, force: true });
}
