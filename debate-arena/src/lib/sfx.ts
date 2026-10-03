// Tiny synthesized sound kit — no audio files to ship.
import { reportSfx } from "./rec";

let ctx: AudioContext | null = null;
let muted = localStorage.getItem("muted") === "1";

function ac() {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType = "sine", gain = 0.15, when = 0, slideTo?: number) {
  if (muted) return;
  const a = ac();
  const t = a.currentTime + when;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, gain = 0.08, when = 0, filterFreq = 1200) {
  if (muted) return;
  const a = ac();
  const t = a.currentTime + when;
  const buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = filterFreq;
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

const cues = {
  tick: () => tone(1400, 0.05, "square", 0.04),
  pop: () => tone(620, 0.09, "sine", 0.12, 0, 900),
  join: () => {
    tone(520, 0.12, "triangle", 0.12);
    tone(780, 0.16, "triangle", 0.1, 0.08);
  },
  whoosh: () => noise(0.5, 0.12, 0, 800),
  boom: () => {
    tone(140, 0.9, "sine", 0.35, 0, 40);
    noise(0.3, 0.1, 0, 200);
  },
  glitch: () => {
    for (let i = 0; i < 7; i++) tone(200 + Math.random() * 1600, 0.04, "square", 0.06, i * 0.045);
  },
  drumroll: (seconds = 2.5) => {
    for (let i = 0; i < seconds * 22; i++) noise(0.05, 0.03 + (i / (seconds * 22)) * 0.07, i / 22, 300);
  },
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.35, "triangle", 0.12, i * 0.11)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.4, "sawtooth", 0.06, i * 0.14)),
  bell: () => {
    tone(880, 1.2, "sine", 0.18);
    tone(1320, 0.9, "sine", 0.06);
  },
  honk: () => {
    tone(240, 0.22, "sawtooth", 0.09, 0, 170);
    tone(200, 0.3, "sawtooth", 0.09, 0.2, 130);
  },
  ding: () => {
    tone(988, 0.18, "triangle", 0.12);
    tone(1318, 0.3, "triangle", 0.1, 0.09);
  },
  gavel: () => {
    tone(180, 0.18, "square", 0.14, 0, 90);
    noise(0.12, 0.2, 0, 900);
  },
};

type Cues = typeof cues;
const reported = Object.fromEntries(
  Object.entries(cues).map(([name, play]) => [
    name,
    (arg?: number) => {
      reportSfx(name, arg);
      (play as (arg?: number) => void)(arg);
    },
  ]),
) as Cues;

export const sfx = {
  unlock: () => ac(),
  isMuted: () => muted,
  toggleMute() {
    muted = !muted;
    localStorage.setItem("muted", muted ? "1" : "0");
    return muted;
  },
  ...reported,
};
