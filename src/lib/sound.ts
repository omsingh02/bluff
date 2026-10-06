import { isMuted, setMutedPref } from "./session";

/**
 * Tiny WebAudio synth — no audio assets to load. Browsers only allow audio after a user gesture,
 * so call `sfx.unlock()` from any click/tap handler (the app does this once on first pointerdown).
 */
export type Cue = "select" | "play" | "turn" | "call" | "liar" | "honest" | "win" | "lose" | "tick" | "join";

let ctx: AudioContext | null = null;
let muted = isMuted();
const listeners = new Set<() => void>();

function audio(fromGesture = false): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    // Creating a context before any user interaction only produces an autoplay warning; cues that fire
    // from timers (e.g. before the first tap after a reload) are simply skipped until the user has interacted.
    const ua = typeof navigator !== "undefined" ? navigator.userActivation : undefined;
    if (!fromGesture && ua && !ua.hasBeenActive) return null;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

interface ToneOpts {
  freq: number;
  to?: number;
  dur: number;
  at?: number;
  type?: OscillatorType;
  gain?: number;
}

function tone(c: AudioContext, { freq, to, dur, at = 0, type = "sine", gain = 0.06 }: ToneOpts) {
  const t0 = c.currentTime + at;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(c: AudioContext, dur: number, at = 0, gain = 0.05) {
  const t0 = c.currentTime + at;
  const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1800;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(c.destination);
  src.start(t0);
}

const CUES: Record<Cue, (c: AudioContext) => void> = {
  select: (c) => tone(c, { freq: 660, to: 760, dur: 0.05, gain: 0.04 }),
  tick: (c) => tone(c, { freq: 1000, dur: 0.025, type: "square", gain: 0.02 }),
  join: (c) => tone(c, { freq: 440, to: 660, dur: 0.08, gain: 0.05 }),
  play: (c) => {
    noise(c, 0.09, 0, 0.07);
    tone(c, { freq: 190, to: 80, dur: 0.14, type: "triangle", gain: 0.09 });
  },
  turn: (c) => {
    tone(c, { freq: 523, dur: 0.12, gain: 0.06 });
    tone(c, { freq: 784, dur: 0.18, at: 0.11, gain: 0.06 });
  },
  call: (c) => {
    tone(c, { freq: 330, to: 110, dur: 0.28, type: "sawtooth", gain: 0.07 });
    tone(c, { freq: 220, to: 70, dur: 0.28, type: "square", gain: 0.04 });
  },
  liar: (c) => {
    tone(c, { freq: 440, to: 70, dur: 0.55, type: "sawtooth", gain: 0.07 });
    noise(c, 0.2, 0, 0.05);
  },
  honest: (c) => {
    [392, 494, 587].forEach((f, i) => tone(c, { freq: f, dur: 0.14, at: i * 0.09, gain: 0.06 }));
  },
  win: (c) => {
    [523, 659, 784, 1047].forEach((f, i) => tone(c, { freq: f, dur: 0.32, at: i * 0.12, gain: 0.07 }));
    tone(c, { freq: 1047, dur: 0.9, at: 0.5, gain: 0.05 });
  },
  lose: (c) => {
    [392, 311, 262].forEach((f, i) => tone(c, { freq: f, dur: 0.3, at: i * 0.16, type: "triangle", gain: 0.07 }));
  },
};

export const sfx = {
  play(cue: Cue) {
    const c = audio();
    if (!c) return;
    try {
      CUES[cue](c);
    } catch {
      /* audio is best-effort */
    }
  },
  /** Call from a user gesture so later cues are allowed to play. */
  unlock() {
    const c = audio(true);
    if (c && c.state === "suspended") void c.resume();
  },
  isMuted: () => muted,
  setMuted(next: boolean) {
    muted = next;
    setMutedPref(next);
    listeners.forEach((l) => l());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
