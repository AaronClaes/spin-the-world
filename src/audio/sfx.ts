import * as Tone from "tone";
import { duckForSkip, songVoicing } from "../music/rig";

// SFX (spec §8.5) — all synthesized, nothing loaded. They live on their own
// channel to the destination, not the music master: the master swells and
// ducks with game state and the SFX must not ride along.
//
// The two-tier miss rule (spec §8.1) is enforced here by what exists: the
// record-skip glitch is a piece-only sound; note misses get a near-silent
// tick so a markless miss never reads as a dropped input.

const SFX_DB = -9;

// Note pickups climb a pentatonic run as the combo grows, and a combo break
// drops the next pickup back to the bottom. The run, the piece chime and the
// low hits are the mounted song's — they follow the record's key so pickups
// sit inside the music instead of on top of it (music/types.ts Voicing).

let out: Tone.Channel | null = null;
let pluck: Tone.PolySynth | null = null;
let chime: Tone.PolySynth | null = null;
let thump: Tone.MembraneSynth | null = null;
let thud: Tone.MembraneSynth | null = null;
let scratch: Tone.NoiseSynth | null = null;
let tick: Tone.NoiseSynth | null = null;
let surface: Tone.NoiseSynth | null = null;
let spin: Tone.NoiseSynth | null = null;
let spinFilter: Tone.Filter | null = null;

// Idempotent; call once after Tone.start() (needle-drop click is the gesture).
export function initSfx() {
  if (out) return;
  out = new Tone.Channel({ volume: SFX_DB }).toDestination();

  pluck = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "triangle" },
    envelope: { attack: 0.002, decay: 0.18, sustain: 0, release: 0.15 },
  }).connect(out);
  pluck.maxPolyphony = 6;

  chime = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "sine" },
    envelope: { attack: 0.002, decay: 0.5, sustain: 0, release: 0.9 },
  }).connect(out);
  chime.maxPolyphony = 6;

  thump = new Tone.MembraneSynth({
    pitchDecay: 0.06,
    octaves: 4,
    envelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.05 },
    volume: -4,
  }).connect(out);

  // the skip's body thud is its own synth — a slow frame can resolve a
  // pickup AND a skip together, and one membrane can't play both
  thud = new Tone.MembraneSynth({
    pitchDecay: 0.08,
    octaves: 3,
    envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.05 },
    volume: -4,
  }).connect(out);

  // record-skip scratch — a harsh mid band, nothing like the music.
  // Short explicit releases everywhere: a NoiseSynth whose release is still
  // scheduled when the next attack lands throws "time must be greater than
  // or equal to the last scheduled time".
  const scratchBand = new Tone.Filter(2400, "bandpass").connect(out);
  scratch = new Tone.NoiseSynth({
    noise: { type: "pink" },
    envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.01 },
    volume: 2,
  }).connect(scratchBand);

  // near-silent tick for note misses + needle clicks
  const tickHp = new Tone.Filter(5200, "highpass").connect(out);
  tick = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.001, decay: 0.02, sustain: 0, release: 0.01 },
    volume: -14,
  }).connect(tickHp);

  // dusty surface noise for the needle landing/leaving the groove
  const surfaceLp = new Tone.Filter(1100, "lowpass").connect(out);
  surface = new Tone.NoiseSynth({
    noise: { type: "brown" },
    envelope: { attack: 0.005, decay: 0.16, sustain: 0, release: 0.02 },
    volume: -2,
  }).connect(surfaceLp);

  // motor spin-up — noise through a band that sweeps upward like a platter
  // coming to speed
  spinFilter = new Tone.Filter(150, "bandpass", -24);
  spinFilter.Q.value = 2.5;
  spinFilter.connect(out);
  spin = new Tone.NoiseSynth({
    noise: { type: "brown" },
    envelope: { attack: 0.28, decay: 0.55, sustain: 0, release: 0.1 },
    volume: -6,
  }).connect(spinFilter);
}

// Note pickup: pitched to the record's scale, cycling up the pentatonic run
// as the combo grows (spec §8.5). combo is the value AFTER the catch, so
// combo 1 = bottom of the run.
export function sfxNotePickup(combo: number) {
  if (!pluck) return;
  const run = songVoicing().pickupRun;
  const idx = Math.max(0, combo - 1) % run.length;
  const vel = 0.45 + 0.35 * (idx / (run.length - 1));
  safely(() => pluck?.triggerAttackRelease(run[idx], "16n", undefined, vel));
}

// A slow frame can resolve several items at once, so a mono synth can be
// triggered twice at an identical time, which Tone's scheduler rejects (and
// the throw would abort the resolve loop mid-frame). Nudge repeat events
// forward — it reads as a fast double-hit — and swallow anything that still
// slips through: a dropped SFX is fine, a broken frame is not.
let lastPickupT = -1;
let lastSkipT = -1;
let lastTickT = -1;
const clearOf = (last: number, t: number, gap: number) =>
  t <= last + gap ? last + gap : t;
const safely = (fn: () => void) => {
  try {
    fn();
  } catch {
    // audio scheduling edge case — skip the sound, never break the frame
  }
};

// Near-silent, never fully invisible (spec §8.1).
export function sfxNoteMiss() {
  if (!tick) return;
  const t = clearOf(lastTickT, Tone.now(), 0.06);
  lastTickT = t;
  safely(() => tick?.triggerAttackRelease("32n", t, 0.4));
}

// The 3-2-1 before the needle drops. Pitched out of the mounted record's own
// voicing like everything else in this file, so the count belongs to the
// record you picked rather than sitting on top of it: three taps on the root
// of its run, then the piece chime's arpeggio on GO with a thump underneath.
// step 3/2/1 counts; step 0 is GO.
export function sfxCount(step: number) {
  if (!pluck || !chime || !thump) return;
  const { pickupRun, pieceChime, pieceThump } = songVoicing();
  const t = Tone.now();
  safely(() => {
    if (step > 0) {
      pluck?.triggerAttackRelease(pickupRun[0], "16n", t, 0.6);
      return;
    }
    thump?.triggerAttackRelease(pieceThump, "8n", t, 0.7);
    chime?.triggerAttackRelease(pieceChime[0], "8n", t, 0.75);
    chime?.triggerAttackRelease(pieceChime[2], "4n", t + 0.04, 0.7);
  });
}

// World piece pickup: chime plus a low thump (spec §8.5).
export function sfxPiecePickup() {
  if (!chime || !thump) return;
  const t = clearOf(lastPickupT, Tone.now(), 0.35);
  lastPickupT = t;
  const { pieceChime, pieceThump } = songVoicing();
  safely(() => {
    thump?.triggerAttackRelease(pieceThump, "8n", t, 0.8);
    chime?.triggerAttackRelease(pieceChime[0], "8n", t, 0.7);
    chime?.triggerAttackRelease(pieceChime[1], "8n", t + 0.05, 0.55);
    chime?.triggerAttackRelease(pieceChime[2], "4n", t + 0.1, 0.65);
  });
}

// The diegetic fail (spec §8.1): the needle jumps — two scratch hits, a body
// thud, and the music itself ducks for a beat like the groove was skipped.
// Reserved for world pieces ONLY.
export function sfxRecordSkip() {
  if (!scratch || !thud) return;
  const t = clearOf(lastSkipT, Tone.now(), 0.25);
  lastSkipT = t;
  safely(() => {
    scratch?.triggerAttackRelease(0.05, t, 1);
    scratch?.triggerAttackRelease(0.05, t + 0.09, 0.7);
    thud?.triggerAttackRelease(songVoicing().skipThud, "8n", t + 0.015, 0.6);
  });
  duckForSkip();
}

export function sfxNeedleDrop() {
  if (!surface || !thump || !tick) return;
  const t = Tone.now();
  lastTickT = t + 0.41;
  safely(() => {
    tick?.triggerAttackRelease("32n", t, 0.9);
    thump?.triggerAttackRelease(songVoicing().pieceThump, "8n", t + 0.01, 0.35);
    surface?.triggerAttackRelease("8n", t + 0.02, 0.8);
    // a couple of dust pops as the groove settles
    tick?.triggerAttackRelease("32n", t + 0.22, 0.5);
    tick?.triggerAttackRelease("32n", t + 0.41, 0.35);
  });
}

export function sfxNeedleLift() {
  if (!surface || !tick) return;
  const t = clearOf(lastTickT, Tone.now(), 0.06);
  lastTickT = t + 0.06;
  safely(() => {
    surface?.triggerAttackRelease("16n", t, 0.5);
    tick?.triggerAttackRelease("32n", t + 0.06, 0.7);
  });
}

export function sfxSpinUp() {
  if (!spin || !spinFilter) return;
  const t = Tone.now();
  safely(() => {
    spinFilter?.frequency.cancelScheduledValues(t);
    spinFilter?.frequency.setValueAtTime(150, t);
    spinFilter?.frequency.exponentialRampToValueAtTime(950, t + 0.7);
    spin?.triggerAttackRelease(0.6, t);
  });
}
