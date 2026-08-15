import * as Tone from "tone";
import { safeHit } from "./rig";
import type { Keep, SongDef } from "./types";

// "Harbour 33" — sea shanty, 100bpm, D minor. Same four-stem structure as
// Meadow (see meadow.ts for why every part starts at 0 and loops), but the
// room is wetter and the instruments are the shanty ones: a heave-ho kick
// under a stomp-and-clap backbeat, a rolling root-fifth bass, a reedy
// concertina on the bellows push-pull, and a tin whistle over the top.
//
// Harmony is one 4-bar loop, i – III – VII – i: Dm – F – C – Dm. At 8 beats a
// revolution that's two turns of the record per pass, so the disc and the
// chord change never line up in a way that makes the loop obvious.

const CHORDS = {
  Dm: ["D3", "F3", "A3", "D4"],
  F: ["F3", "A3", "C4", "F4"],
  C: ["C3", "E3", "G3", "C4"],
};
const PROGRESSION: (keyof typeof CHORDS)[] = ["Dm", "F", "C", "Dm"];

type NoteEvent = { time: string; note: string; dur: string; vel?: number };
type ChordEvent = { time: string; notes: string[]; dur: string; vel: number };

// ---------------------------------------------------------------- drums ----

function scheduleDrums(out: Tone.Channel, keep: Keep) {
  // 16 eighth-note steps = 2 bars = 1 disc revolution.
  // The kick is a doubled pull rather than Meadow's steady four — a rowing
  // heave, which is most of what separates this groove from the folk one.
  const KICK = "x..xx...x..xx...";
  const CLAP = "..x...x...x...x."; // stomp-and-clap backbeat
  const TICK = "x.x.x.x.x.x.x.x."; // dry eighth shaker, well under the mix

  const kick = keep(
    new Tone.MembraneSynth({
      pitchDecay: 0.05,
      octaves: 5,
      envelope: { attack: 0.001, decay: 0.28, sustain: 0 },
      volume: -3,
    }).connect(out),
  );

  // wider and longer than Meadow's snare band — hands, not a snare drum
  const clapBody = keep(new Tone.Filter(1200, "bandpass").connect(out));
  const clap = keep(
    new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.002, decay: 0.19, sustain: 0 },
      volume: -8,
    }).connect(clapBody),
  );

  const tickFilter = keep(new Tone.Filter(7000, "highpass").connect(out));
  const tick = keep(
    new Tone.NoiseSynth({
      noise: { type: "brown" },
      envelope: { attack: 0.001, decay: 0.045, sustain: 0 },
      volume: -19,
    }).connect(tickFilter),
  );

  const seq = (pattern: string, hit: (time: number) => void) =>
    keep(
      new Tone.Sequence(
        (time, step) => {
          if (step === "x") safeHit(() => hit(time));
        },
        [...pattern],
        "8n",
      ).start(0),
    );

  seq(KICK, (t) => kick.triggerAttackRelease("D1", "8n", t));
  seq(CLAP, (t) => clap.triggerAttackRelease("16n", t));
  seq(TICK, (t) => tick.triggerAttackRelease("32n", t));
}

// ----------------------------------------------------------------- bass ----

function scheduleBass(out: Tone.Channel, keep: Keep) {
  const bass = keep(
    new Tone.MonoSynth({
      oscillator: { type: "triangle" },
      filter: { type: "lowpass", Q: 1 },
      filterEnvelope: {
        attack: 0.005,
        decay: 0.24,
        sustain: 0.45,
        release: 0.3,
        baseFrequency: 80,
        octaves: 2.4,
      },
      envelope: { attack: 0.012, decay: 0.3, sustain: 0.55, release: 0.35 },
    }).connect(out),
  );

  // Root and fifth on the quarters with the third on the turn, and a pickup
  // eighth at the end of the loop walking back up to D.
  const line: { time: string; note: string }[] = [
    { time: "0:0", note: "D2" },
    { time: "0:1", note: "A2" },
    { time: "0:2", note: "D2" },
    { time: "0:3", note: "F2" },
    { time: "1:0", note: "F2" },
    { time: "1:1", note: "C3" },
    { time: "1:2", note: "F2" },
    { time: "1:3", note: "A2" },
    { time: "2:0", note: "C2" },
    { time: "2:1", note: "G2" },
    { time: "2:2", note: "C2" },
    { time: "2:3", note: "E2" },
    { time: "3:0", note: "D2" },
    { time: "3:1", note: "A2" },
    { time: "3:2", note: "D2" },
    { time: "3:3", note: "A2" },
    { time: "3:3.5", note: "C2" }, // walk back up to D
  ];

  const part = keep(
    new Tone.Part(
      (time, e: { time: string; note: string }) =>
        safeHit(() => bass.triggerAttackRelease(e.note, "8n", time, 0.9)),
      line,
    ),
  );
  part.loop = true;
  part.loopEnd = "4:0";
  part.start(0);
}

// ---------------------------------------------------------- concertina ----

function scheduleConcertina(out: Tone.Channel, keep: Keep) {
  // A reed, not a pluck: detuned saws with a soft attack and real sustain is
  // an accordion in one oscillator setting, and it's the sound that says
  // "shanty" faster than any melody could.
  const reeds = keep(
    new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "fatsawtooth", count: 2, spread: 22 },
      envelope: { attack: 0.07, decay: 0.2, sustain: 0.62, release: 0.28 },
    }).connect(out),
  );
  reeds.maxPolyphony = 16;
  reeds.volume.value = -8; // saws are far hotter than Meadow's triangles

  // Bellows: a long push on the downbeat, then two shorter pulls. The last
  // one is the top three notes only, which lifts without thickening.
  const BELLOWS: { beat: string; dur: string; vel: number; top: boolean }[] = [
    { beat: "0", dur: "2n", vel: 0.75, top: false },
    { beat: "2", dur: "4n", vel: 0.6, top: false },
    { beat: "3", dur: "4n", vel: 0.42, top: true },
  ];

  const events: ChordEvent[] = PROGRESSION.flatMap((chord, bar) =>
    BELLOWS.map(({ beat, dur, vel, top }) => ({
      time: `${bar}:${beat}`,
      notes: top ? CHORDS[chord].slice(1) : CHORDS[chord],
      dur,
      vel,
    })),
  );

  const part = keep(
    new Tone.Part(
      (time, e: ChordEvent) =>
        safeHit(() => reeds.triggerAttackRelease(e.notes, e.dur, time, e.vel)),
      events,
    ),
  );
  part.loop = true;
  part.loopEnd = "4:0";
  part.start(0);
}

// -------------------------------------------------------------- whistle ----

// 8-bar tune over two passes of the progression. A (bars 0–3) is the call,
// sitting low and ending on the fifth; B (bars 4–7) answers an octave up and
// walks back down to A4, which pulls into the D of the next pass.
const WHISTLE_TUNE: NoteEvent[] = [
  // bar 0 — Dm
  { time: "0:0", note: "A4", dur: "4n" },
  { time: "0:1", note: "D5", dur: "4n" },
  { time: "0:2", note: "F5", dur: "4n" },
  { time: "0:3", note: "E5", dur: "8n" },
  { time: "0:3.5", note: "D5", dur: "8n", vel: 0.7 },
  // bar 1 — F
  { time: "1:0", note: "C5", dur: "2n" },
  { time: "1:2", note: "A4", dur: "4n" },
  { time: "1:3", note: "C5", dur: "4n", vel: 0.7 },
  // bar 2 — C
  { time: "2:0", note: "E5", dur: "4n" },
  { time: "2:1", note: "G5", dur: "4n" },
  { time: "2:2", note: "E5", dur: "8n" },
  { time: "2:2.5", note: "C5", dur: "8n" },
  { time: "2:3", note: "D5", dur: "4n" },
  // bar 3 — Dm
  { time: "3:0", note: "F5", dur: "4n" },
  { time: "3:1", note: "E5", dur: "8n" },
  { time: "3:1.5", note: "D5", dur: "8n" },
  { time: "3:2", note: "A4", dur: "2n" },
  // bar 4 — Dm (the answer, up the octave)
  { time: "4:0", note: "D5", dur: "4n" },
  { time: "4:1", note: "F5", dur: "4n" },
  { time: "4:2", note: "A5", dur: "4n" },
  { time: "4:3", note: "G5", dur: "8n" },
  { time: "4:3.5", note: "F5", dur: "8n", vel: 0.7 },
  // bar 5 — F
  { time: "5:0", note: "F5", dur: "2n" },
  { time: "5:2", note: "E5", dur: "4n" },
  { time: "5:3", note: "D5", dur: "4n", vel: 0.7 },
  // bar 6 — C
  { time: "6:0", note: "E5", dur: "4n" },
  { time: "6:1", note: "G5", dur: "4n" },
  { time: "6:2", note: "C5", dur: "2n" },
  // bar 7 — Dm
  { time: "7:0", note: "D5", dur: "2n." },
  { time: "7:3", note: "A4", dur: "4n", vel: 0.65 },
];

function scheduleWhistle(out: Tone.Channel, keep: Keep) {
  // Tin whistle: a triangle is reedier than Meadow's sine, with a wider,
  // slower vibrato and a shorter echo so it doesn't smear the shanty's pulse.
  const whistle = keep(
    new Tone.Synth({
      oscillator: { type: "triangle" },
      portamento: 0.015,
      envelope: { attack: 0.05, decay: 0.12, sustain: 0.78, release: 0.28 },
    }),
  );
  const vibrato = keep(new Tone.Vibrato(4.4, 0.16));
  const delay = keep(
    new Tone.FeedbackDelay({ delayTime: "4n", feedback: 0.22, wet: 0.18 }),
  );
  whistle.chain(vibrato, delay, out);

  const part = keep(
    new Tone.Part(
      (time, e: NoteEvent) =>
        safeHit(() =>
          whistle.triggerAttackRelease(e.note, e.dur, time, e.vel ?? 0.9),
        ),
      WHISTLE_TUNE,
    ),
  );
  part.loop = true;
  part.loopEnd = "8:0";
  part.start(0);
}

export const harbourSong: SongDef = {
  id: "harbour",
  mixDb: [-6, -7, -13, -9], // drums, bass, concertina, whistle
  // wetter than the meadow — this record is supposed to sound like open water
  verbSendDb: [-24, -30, -12, -8],
  reverb: { decay: 3.4, preDelay: 0.03 },
  // D minor pentatonic — pickups land inside the key of the record
  voicing: {
    pickupRun: ["D4", "F4", "G4", "A4", "C5", "D5", "F5", "G5", "A5", "C6"],
    pieceChime: ["D5", "F5", "A5"],
    pieceThump: "D1",
    skipThud: "D0",
  },
  schedule(stems, keep) {
    scheduleDrums(stems[0], keep);
    scheduleBass(stems[1], keep);
    scheduleConcertina(stems[2], keep);
    scheduleWhistle(stems[3], keep);
  },
};
