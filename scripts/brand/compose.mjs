/**
 * HTML templates for the composed brand images (social previews, README banner, README hero).
 * Each builder returns a complete page that scripts/generate-brand-assets.mjs renders with Chromium.
 */
import { lockupSvg, markSvg } from "./logo.mjs";

/** Ratio of the phone screenshots (390×844 CSS px). */
const SHOT_RATIO = 844 / 390;

const dataUri = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

const GRAIN = `data:image/svg+xml;utf8,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .9 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>",
)}`;

/** A page with the app's "neon noir" aurora behind `body` (violet top-left, pink bottom-right, a hint of teal). */
function page({ w, h, fonts, css = "", body }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fonts}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: ${w}px; height: ${h}px; overflow: hidden; background: #07040f; }
body { position: relative; font-family: 'I', system-ui, sans-serif; color: #f6f1e7; -webkit-font-smoothing: antialiased; }
.aurora { position: absolute; inset: 0; background:
  radial-gradient(${w * 0.62}px ${h * 1.15}px at 4% -12%, rgba(139,92,246,.5), transparent 62%),
  radial-gradient(${w * 0.55}px ${h * 1.05}px at 102% 112%, rgba(236,72,153,.42), transparent 62%),
  radial-gradient(${w * 0.4}px ${h * 0.7}px at 55% 45%, rgba(45,212,191,.07), transparent 70%); }
.grain { position: absolute; inset: 0; opacity: .06; mix-blend-mode: overlay; background-image: url("${GRAIN}"); }
.stage { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
${css}
</style></head><body><div class="aurora"></div><div class="grain"></div>${body}</body></html>`;
}

/** A phone: dark bezel around a screenshot. `w` is the outer width; position is the top-left before rotation. */
function phone({ src, w, x, y, rot = 0, z = 1 }) {
  const bezel = Math.round(w * 0.03);
  const radius = Math.round(w * 0.17);
  const sw = w - bezel * 2;
  const sh = Math.round(sw * SHOT_RATIO);
  return `<div class="phone" style="left:${x}px;top:${y}px;width:${w}px;height:${sh + bezel * 2}px;padding:${bezel}px;border-radius:${radius}px;transform:rotate(${rot}deg);z-index:${z}">
  <img src="${src}" style="width:${sw}px;height:${sh}px;border-radius:${radius - bezel}px">
</div>`;
}

const PHONE_CSS = `
.phone { position: absolute; background: linear-gradient(150deg, #2b2342, #0d0917 45%, #1b1432);
  box-shadow: 0 0 0 1.5px rgba(255,255,255,.16), 0 0 0 3.5px #04020a, 0 60px 90px -30px rgba(0,0,0,.95), 0 0 90px -20px rgba(139,92,246,.45); }
.phone img { display: block; background: #07040f; }
.phone::after { content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
  background: linear-gradient(115deg, rgba(255,255,255,.1), transparent 28%); }
`;

const SUITS = {
  S: "M12 2C12 2 4 9 4 14.2a4 4 0 0 0 7 2.6C10.7 19 10 20.6 8.5 22h7c-1.5-1.4-2.2-3-2.5-5.2a4 4 0 0 0 7-2.6C20 9 12 2 12 2z",
  H: "M12 21.5S3 15.2 3 8.8A4.8 4.8 0 0 1 12 6.5a4.8 4.8 0 0 1 9 2.3c0 6.4-9 12.7-9 12.7z",
  D: "M12 2l7 10-7 10-7-10z",
};
const pip = (suit, cls = "") =>
  `<svg class="pip ${cls}" viewBox="0 0 24 24" fill="currentColor">${
    suit === "C"
      ? `<circle cx="12" cy="7.2" r="4.2"/><circle cx="7.2" cy="13.4" r="4.2"/><circle cx="16.8" cy="13.4" r="4.2"/><path d="M12 12.5c.3 3.3-.6 6.6-2.6 9.5h5.2c-2-2.9-2.9-6.2-2.6-9.5z"/>`
      : `<path d="${SUITS[suit]}"/>`
  }</svg>`;

/** The app's decorative card fan (A♠ K♥ ? J♦ 10♣): the face-down card carries the side-eye. */
function cardFan({ cw, x, y }) {
  const cards = [
    { rank: "A", suit: "S", angle: -34 },
    { rank: "K", suit: "H", angle: -17 },
    { rank: "", suit: null, angle: 0 },
    { rank: "J", suit: "D", angle: 17 },
    { rank: "10", suit: "C", angle: 34 },
  ];
  const ch = cw * 1.4;
  const eye = dataUri(markSvg());
  const faces = cards
    .map((c, i) => {
      const z = i === 2 ? 5 : 4 - Math.abs(2 - i);
      const body = c.suit
        ? `<div class="idx ${c.suit === "H" || c.suit === "D" ? "red" : ""}"><b>${c.rank}</b>${pip(c.suit)}</div>
           ${pip(c.suit, "mid")}
           <div class="idx br ${c.suit === "H" || c.suit === "D" ? "red" : ""}"><b>${c.rank}</b>${pip(c.suit)}</div>`
        : `<img class="eye" src="${eye}">`;
      return `<div class="fc ${c.suit ? "" : "back"}" style="z-index:${z};transform:rotate(${c.angle}deg)">${body}</div>`;
    })
    .join("");
  return `<div class="fan" style="left:${x}px;top:${y}px;--cw:${cw}px;width:${cw * 3.9}px;height:${cw * 2.15}px">${faces}</div>`;
}

const FAN_CSS = `
.fan { position: absolute; }
.fc { position: absolute; bottom: 0; left: 50%; width: var(--cw); height: calc(var(--cw) * 1.4); margin-left: calc(var(--cw) / -2);
  transform-origin: 50% 190%; border-radius: calc(var(--cw) * .1); font-size: calc(var(--cw) * .36);
  background: linear-gradient(180deg, #faf6ee, #ebe4d3); color: #1b1432;
  box-shadow: 0 1px 0 rgba(255,255,255,.7) inset, 0 18px 32px -10px rgba(0,0,0,.8), 0 3px 6px rgba(0,0,0,.4); }
.fc .red { color: #dc1f4a; }
.fc .idx { position: absolute; left: .45em; top: .35em; display: flex; flex-direction: column; align-items: center; line-height: 1; font-family: 'U'; }
.fc .idx b { font-size: 1.05em; font-weight: 800; }
.fc .idx .pip { width: .9em; height: .9em; margin-top: .15em; }
.fc .idx.br { left: auto; top: auto; right: .45em; bottom: .35em; transform: rotate(180deg); }
.fc .mid { position: absolute; left: 50%; top: 50%; width: 2.1em; height: 2.1em; transform: translate(-50%, -50%); }
.fc.back { background: repeating-linear-gradient(45deg, rgba(139,92,246,.22) 0 .35em, transparent .35em .7em), linear-gradient(145deg, #3b1d8f, #1a0f45 55%, #5b1d6e);
  border: 1px solid rgba(139,92,246,.6); display: grid; place-items: center;
  box-shadow: 0 0 40px rgba(139,92,246,.45), 0 18px 32px -10px rgba(0,0,0,.8); }
.fc.back::before { content: ""; position: absolute; inset: .35em; border-radius: .35em; border: 1px solid rgba(255,255,255,.15); }
.fc .eye { width: 2.6em; position: relative; filter: drop-shadow(0 0 10px rgba(139,92,246,.9)); }
`;

const lockup = () => dataUri(lockupSvg({ theme: "dark" }));

/** The tagline with the same colours as the app's landing page. */
const TAGLINE = `<span style="color:#f6f1e7">Lie.</span> <span style="color:#ff3d5e">Call it.</span> <span style="color:#fbbf24">Clear your hand.</span>`;

/**
 * Link-preview card, designed on a 1200×630 canvas and fitted to `w`×`h` (the GitHub social preview is
 * 1280×640, so the design is scaled to the height and centred). `shots` are URLs of 390×844 screenshots.
 */
export function socialHtml({ w, h, fonts, shots }) {
  const k = h / 630;
  const dx = (w - 1200 * k) / 2;
  const body = `<div class="stage" style="width:1200px;height:630px;transform:translate(${dx}px,0) scale(${k})">
  <div class="copy">
    <img class="lockup" src="${lockup()}">
    <p class="what">The bluffing card game</p>
    <p class="tag">${TAGLINE}</p>
    <p class="feat">2–8 players &nbsp;·&nbsp; Bots &nbsp;·&nbsp; No sign-up</p>
  </div>
  ${phone({ src: shots.reveal, w: 242, x: 912, y: 66, rot: 7, z: 1 })}
  ${phone({ src: shots.challenge, w: 254, x: 690, y: 46, rot: -5, z: 2 })}
</div>`;
  const css = `
${PHONE_CSS}
.copy { position: absolute; left: 76px; top: 0; bottom: 0; width: 560px; display: flex; flex-direction: column; justify-content: center; padding-bottom: 8px; }
.lockup { width: 452px; height: auto; display: block; filter: drop-shadow(0 0 40px rgba(139,92,246,.35)); }
.what { margin-top: 38px; font-size: 44px; font-weight: 700; letter-spacing: -.015em; line-height: 1.1; }
.tag { margin-top: 20px; font-family: 'U'; font-weight: 700; font-size: 25px; letter-spacing: -.01em; }
.feat { margin-top: 34px; font-size: 24px; font-weight: 500; color: #a79fbd; }
`;
  return page({ w, h, fonts, css, body });
}

/** README header: logo lockup + tagline on the aurora, with the card fan. 1600×420. */
export function bannerHtml({ w, h, fonts }) {
  const body = `<div class="copy">
  <img class="lockup" src="${lockup()}">
  <p class="what">The bluffing card game</p>
  <p class="tag">${TAGLINE}</p>
</div>
${cardFan({ cw: 142, x: 930, y: -22 })}`;
  const css = `
${FAN_CSS}
.copy { position: absolute; left: 120px; top: 0; bottom: 0; display: flex; flex-direction: column; justify-content: center; }
.lockup { width: 520px; height: auto; display: block; filter: drop-shadow(0 0 40px rgba(139,92,246,.35)); }
.what { margin-top: 30px; font-size: 40px; font-weight: 700; letter-spacing: -.015em; }
.tag { margin-top: 16px; font-family: 'U'; font-weight: 700; font-size: 25px; letter-spacing: -.01em; }
`;
  return page({ w, h, fonts, css, body });
}

/** README hero: three phones on the aurora. 1600×900. */
export function heroHtml({ w, h, fonts, shots }) {
  const body = `${phone({ src: shots.lobby, w: 350, x: 278, y: 118, rot: -6, z: 1 })}
${phone({ src: shots.reveal, w: 350, x: 972, y: 118, rot: 6, z: 1 })}
${phone({ src: shots.challenge, w: 392, x: 604, y: 40, rot: 0, z: 2 })}`;
  return page({ w, h, fonts, css: PHONE_CSS, body });
}
