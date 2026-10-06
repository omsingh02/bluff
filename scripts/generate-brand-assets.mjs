#!/usr/bin/env node
/**
 * Renders the social-share image and PNG app icons into /public using headless Chromium and the
 * self-hosted brand fonts (so they match the app exactly).
 *
 *   E2E_CHROMIUM=/usr/bin/chromium node scripts/generate-brand-assets.mjs
 *
 * Needs @playwright/test (a devDependency) and a Chromium: either `npx playwright install chromium`
 * or point E2E_CHROMIUM at a system browser.
 */
import { chromium } from "@playwright/test";
import { mkdtempSync, readFileSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pub = path.join(root, "public");
const fontFile = (pkg, name) => pathToFileURL(realpathSync(path.join(root, "node_modules", "@fontsource-variable", pkg, "files", name))).href;

const FONTS = `
@font-face { font-family: 'U'; font-weight: 200 900; src: url('${fontFile("unbounded", "unbounded-latin-wght-normal.woff2")}') format('woff2'); }
@font-face { font-family: 'I'; font-weight: 100 900; src: url('${fontFile("inter", "inter-latin-wght-normal.woff2")}') format('woff2'); }
`;

const SPADE = `<path fill="url(#g)" d="M32 11c0 0-17 15.5-17 27.5a9.5 9.5 0 0 0 16.2 6.7C30.7 49.8 29 53.5 25 57h14c-4-3.5-5.700-7.200-6.200-11.800A9.500 9.500 0 0 0 49 38.500C49 26.500 32 11 32 11z"/>`;

const iconSvg = (size, { maskable = false } = {}) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b5cf6"/><stop offset="1" stop-color="#ec4899"/></linearGradient>
  <radialGradient id="bg" cx="30%" cy="20%" r="90%"><stop offset="0" stop-color="#1c1038"/><stop offset="1" stop-color="#07040f"/></radialGradient></defs>
  <rect width="64" height="64" rx="${maskable ? 0 : 15}" fill="url(#bg)"/>
  ${maskable ? "" : `<rect x="2" y="2" width="60" height="60" rx="13" fill="none" stroke="url(#g)" stroke-width="2"/>`}
  <g transform="${maskable ? "translate(9.6 9.6) scale(0.7)" : "translate(0 0)"}">${SPADE}</g>
</svg>`;

const card = (rank, suit, red, rot, x, y, back = false) => `
<div class="card ${back ? "back" : ""}" style="transform: translate(${x}px, ${y}px) rotate(${rot}deg)">
  ${back ? `<div class="emblem">♠</div>` : `<div class="c ${red ? "red" : ""}"><b>${rank}</b><i>${suit}</i></div><div class="pip ${red ? "red" : ""}">${suit}</div><div class="c br ${red ? "red" : ""}"><b>${rank}</b><i>${suit}</i></div>`}
</div>`;

const ogHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
${FONTS}
* { box-sizing: border-box; margin: 0; }
body { width: 1200px; height: 630px; overflow: hidden; background: #07040f; font-family: 'I', system-ui, sans-serif; color: #f6f1e7; position: relative; }
.glow1 { position: absolute; width: 900px; height: 700px; left: -250px; top: -300px; background: radial-gradient(closest-side, rgba(139,92,246,.45), transparent); }
.glow2 { position: absolute; width: 800px; height: 700px; right: -250px; bottom: -330px; background: radial-gradient(closest-side, rgba(236,72,153,.38), transparent); }
.glow3 { position: absolute; width: 520px; height: 520px; left: 500px; top: 60px; background: radial-gradient(closest-side, rgba(45,212,191,.12), transparent); }
.copy { position: absolute; left: 76px; top: 118px; width: 640px; }
.pill { display: inline-block; padding: 10px 20px; border-radius: 999px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.05); font-size: 22px; letter-spacing: .02em; color: #c9c3d9; }
h1 { font-family: 'U', sans-serif; font-weight: 800; font-size: 118px; line-height: .98; letter-spacing: -.035em; margin-top: 30px;
     background: linear-gradient(100deg, #8b5cf6 0%, #ec4899 58%, #fbbf24 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }
.tag { margin-top: 30px; font-size: 40px; font-weight: 600; letter-spacing: -.01em; }
.sub { margin-top: 14px; font-size: 26px; color: #a79fbd; }
.fan { position: absolute; right: 70px; top: 120px; width: 400px; height: 400px; }
.card { position: absolute; left: 130px; top: 40px; width: 190px; height: 266px; border-radius: 18px; background: linear-gradient(180deg, #fbf8f0, #ece5d4);
        box-shadow: 0 30px 60px -20px rgba(0,0,0,.8), 0 0 0 1px rgba(255,255,255,.5) inset; transform-origin: 50% 120%; }
.card.back { background: repeating-linear-gradient(45deg, #2a1f5c 0 10px, #1b1342 10px 20px); box-shadow: 0 30px 60px -20px rgba(0,0,0,.8), 0 0 0 3px #8b5cf6 inset, 0 0 40px rgba(139,92,246,.6); }
.emblem { position: absolute; inset: 0; display: grid; place-items: center; font-size: 84px; color: #ec4899; text-shadow: 0 0 24px #ec4899; }
.c { position: absolute; left: 16px; top: 12px; display: flex; flex-direction: column; align-items: center; line-height: 1; color: #1b1432; font-family: 'U'; }
.c b { font-size: 34px; } .c i { font-style: normal; font-size: 30px; margin-top: 2px; }
.c.br { left: auto; top: auto; right: 16px; bottom: 12px; transform: rotate(180deg); }
.red { color: #dc2650 !important; }
.pip { position: absolute; inset: 0; display: grid; place-items: center; font-size: 104px; color: #1b1432; }
</style></head><body>
<div class="glow1"></div><div class="glow2"></div><div class="glow3"></div>
<div class="copy"><span class="pill">Free · multiplayer · bots included</span><h1>Liar's<br/>Hand</h1>
<div class="tag">Lie. Call it. Clear your hand.</div><div class="sub">The bluffing card game for you and your friends.</div></div>
<div class="fan">
  ${card("A", "♠", false, -26, -100, 40)}
  ${card("7", "♥", true, -9, -34, 8)}
  ${card("", "", false, 8, 30, -4, true)}
  ${card("K", "♦", true, 24, 96, 20)}
</div></body></html>`;

const browser = await chromium.launch({ executablePath: process.env.E2E_CHROMIUM || undefined, args: ["--no-sandbox"] });
const dir = mkdtempSync(path.join(tmpdir(), "lh-assets-"));

async function shot(html, file, w, h) {
  const f = path.join(dir, file + ".html");
  writeFileSync(f, html);
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(f).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(pub, file), clip: { x: 0, y: 0, width: w, height: h } });
  await page.close();
  console.log("wrote public/" + file);
}

const iconPage = (svg, size) => `<!doctype html><html><body style="margin:0;background:transparent">${svg.replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`)}</body></html>`;

await shot(ogHtml, "og.png", 1200, 630);
await shot(iconPage(iconSvg(192), 192), "icon-192.png", 192, 192);
await shot(iconPage(iconSvg(512), 512), "icon-512.png", 512, 512);
await shot(iconPage(iconSvg(512, { maskable: true }), 512), "icon-maskable-512.png", 512, 512);
await shot(iconPage(iconSvg(180, { maskable: true }), 180), "apple-touch-icon.png", 180, 180);
await browser.close();
// keep the SVG source in sync with the favicon
writeFileSync(path.join(dir, "readme.txt"), readFileSync(path.join(pub, "favicon.svg")));
