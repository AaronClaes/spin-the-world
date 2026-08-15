import * as Tone from "tone";
import { safeHit } from "./rig";
import type { Keep, SongDef } from "./types";

// "Neon 78" — city pop, 140bpm, A minor. Same four-stem structure as the
// other two records (see meadow.ts for why every part starts at 0 and loops),
// but this is the fast, dry, electric one: a tight plate instead of a hall,
// four-on-the-floor under sixteenth hats, a busy octave bass, chorused
// electric-piano stabs, and a portamento lead.
//
// Harmony is one 4-bar loop of sevenths — Am7 – Dm7 – G7 – Cmaj7. In C that's
// vi – ii – V – I, the turnaround the whole genre is built on; heard from the
// A it's a minor record that keeps almost resolving somewhere brighter, which
// is the right feeling for a city at night. At 8 beats a revolution the loop
// is two turns of the disc, same as the shanty.

const CHORDS = {
  // close voicings with the common tones held — a stab that leaps an octave
  // every bar reads as four unrelated chords rather than one turnaround
  Am7: ["A3", "C4", "E4", "G4"],
  Dm7: ["A3", "C4", "D4", "F4"],
  G7: ["G3", "B3", "D4", "F4"],
  Cmaj7: ["G3", "B3", "C4", "E4"],
};
const PROGRESSION: (keyof typeof CHORDS)[] = ["Am7", "Dm7", "G7", "Cmaj7"];

type NoteEvent = { time: string; note: string; dur: string; vel?: number };
type ChordEvent = { time: string; notes: string[]; dur: string; vel: number };

// ---------------------------------------------------------------- drums ----

function scheduleDrums(out: Tone.Channel, keep: Keep) {
  // 16 eighth-note steps = 2 bars = 1 disc revolution.
  // Four on the floor with a push on the and-of-4 pulling into bar two —
  // straight four would be house, and the push is what makes it swing.
  const KICK = "x...x..xx...x...";
  const CLAP = "..x...x...x...x."; // backbeat on 2 and 4

  // Sixteenths, 32 steps over the same two bars. This is the genre's
  // signature and it's why this record sounds busy at rest: 'x' accents the
  // and of each beat, 'o' is the soft in-between.
  const HAT = Array.from({ length: 32 }, (_, i) =>
    i % 4 === 2 ? "x" : "o",
  ).join("");

  const kick = keep(
    new Tone.MembraneSynth({
      pitchDecay: 0.035,
      octaves: 4.5,
      envelope: { attack: 0.001, decay: 0.22, sustain: 0 },
      volume: -2,
    }).connect(out),
  );

  // tighter and higher than the shanty's hand-clap band — this is a gated
  // drum machine, not a room full of people
  const clapBody = keep(new Tone.Filter(1800, "bandpass").connect(out));
  const clap = keep(
    new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.12, sustain: 0 },
      volume: -7,
    }).connect(clapBody),
  );

  const hatFilter = keep(new Tone.Filter(9000, "highpass").connect(out));
  const hat = keep(
    new Tone.NoiseSynth({
      noise: { type: "white" },
      // very short: at 140bpm a sixteenth is 107ms, and anything with a tail
      // turns thirty-two of these into one continuous hiss
      envelope: { attack: 0.001, decay: 0.022, sustain: 0 },
      volume: -22,
    }).connect(hatFilter),
  );

  const seq = (
    pattern: string,
    subdivision: string,
    hit: (time: number, step: string) => void,
  ) =>
    keep(
      new Tone.Sequence(
        (time, step) => {
          if (step !== ".") safeHit(() => hit(time, step));
        },
        [...pattern],
        subdivision,
      ).start(0),
    );

  seq(KICK, "8n", (t) => kick.triggerAttackRelease("A1", "8n", t));
  seq(CLAP, "8n", (t) => clap.triggerAttackRelease("16n", t));
  seq(HAT, "16n", (t, step) =>
    hat.triggerAttackRelease("64n", t, step === "x" ? 1 : 0.45),
  );
}

// ----------------------------------------------------------------- bass ----

function scheduleBass(out: Tone.Channel, keep: Keep) {
  const bass = keep(
    new Tone.MonoSynth({
      // sawtooth through a resonant lowpass is the electric-bass-through-a-
      // synth sound the genre runs on; the triangle the other two records use
      // has no bite at this tempo
      oscillator: { type: "sawtooth" },
      filter: { type: "lowpass", Q: 3 },
      filterEnvelope: {
        attack: 0.004,
        decay: 0.13,
        sustain: 0.2,
        release: 0.2,
        baseFrequency: 90,
        octaves: 2.8,
      },
      envelope: { attack: 0.006, decay: 0.16, sustain: 0.3, release: 0.16 },
      volume: -4,
    }).connect(out),
  );

  // Root on the downbeat, then an octave jump and a walk into the next chord.
  // Sparser than eight-to-the-bar on purpose — the sixteenth hats already
  // fill the grid, so a busy bass on top just turns to mud.
  const line: { time: string; note: string }[] = [
    // Am7
    { time: "0:0", note: "A1" },
    { time: "0:1", note: "A1" },
    { time: "0:1.5", note: "E2" },
    { time: "0:2.5", note: "A2" },
    { time: "0:3.5", note: "G2" },
    // Dm7
    { time: "1:0", note: "D2" },
    { time: "1:1", note: "D2" },
    { time: "1:1.5", note: "A2" },
    { time: "1:2.5", note: "D3" },
    { time: "1:3.5", note: "C3" },
    // G7
    { time: "2:0", note: "G1" },
    { time: "2:1", note: "G1" },
    { time: "2:1.5", note: "D2" },
    { time: "2:2.5", note: "G2" },
    { time: "2:3.5", note: "F2" },
    // Cmaj7 — the last two walk back up to the A
    { time: "3:0", note: "C2" },
    { time: "3:1", note: "C2" },
    { time: "3:1.5", note: "G2" },
    { time: "3:2.5", note: "E2" },
    { time: "3:3", note: "G2" },
    { time: "3:3.5", note: "A2" },
  ];

  const part = keep(
    new Tone.Part(
      (time, e: { time: string; note: string }) =>
        safeHit(() => bass.triggerAttackRelease(e.note, "16n", time, 0.95)),
      line,
    ),
  );
  part.loop = true;
  part.loopEnd = "4:0";
  part.start(0);
}

// ----------------------------------------------------------------- keys ----

function scheduleKeys(out: Tone.Channel, keep: Keep) {
  // Electric piano: a triangle with a fast attack and a short decay is close
  // enough at this size, and the chorus does the rest — a slow, wide chorus is
  // most of what people hear as "eighties keyboard".
  const keys = keep(
    new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.004, decay: 0.42, sustain: 0.12, release: 0.5 },
    }),
  );
  keys.maxPolyphony = 16;
  keys.volume.value = -6;

  const chorus = keep(new Tone.Chorus(1.6, 3.2, 0.55));
  chorus.start();
  keys.chain(chorus, out);

  // One held voicing on the downbeat, then two off-beat stabs. The stabs land
  // between the kicks, so the two stems interlock instead of stacking.
  const HITS: { beat: string; dur: string; vel: number }[] = [
    { beat: "0", dur: "2n", vel: 0.5 },
    { beat: "1.5", dur: "8n", vel: 0.72 },
    { beat: "2.5", dur: "8n", vel: 0.6 },
    { beat: "3.5", dur: "8n", vel: 0.68 },
  ];

  const events: ChordEvent[] = PROGRESSION.flatMap((chord, bar) =>
    HITS.map(({ beat, dur, vel }) => ({
      time: `${bar}:${beat}`,
      notes: CHORDS[chord],
      dur,
      vel,
    })),
  );

  const part = keep(
    new Tone.Part(
      (time, e: ChordEvent) =>
        safeHit(() => keys.triggerAttackRelease(e.notes, e.dur, time, e.vel)),
      events,
    ),
  );
  part.loop = true;
  part.loopEnd = "4:0";
  part.start(0);
}

// ----------------------------------------------------------------- lead ----

// 8-bar tune over two passes of the turnaround. A (bars 0–3) states it around
// the fifth and settles on D; B (bars 4–7) answers from the octave and walks
// down to E, which is the leading note back into the A.
const LEAD_TUNE: NoteEvent[] = [
  // bar 0 — Am7
  { time: "0:0", note: "E5", dur: "4n" },
  { time: "0:1", note: "G5", dur: "8n" },
  { time: "0:1.5", note: "A5", dur: "4n" },
  { time: "0:2.5", note: "G5", dur: "8n", vel: 0.75 },
  { time: "0:3", note: "E5", dur: "4n" },
  // bar 1 — Dm7
  { time: "1:0", note: "D5", dur: "4n" },
  { time: "1:1", note: "F5", dur: "4n" },
  { time: "1:2", note: "A5", dur: "2n" },
  // bar 2 — G7
  { time: "2:0", note: "B4", dur: "8n" },
  { time: "2:0.5", note: "D5", dur: "8n" },
  { time: "2:1", note: "G5", dur: "4n" },
  { time: "2:2", note: "F5", dur: "4n" },
  { time: "2:3", note: "D5", dur: "4n", vel: 0.75 },
  // bar 3 — Cmaj7
  { time: "3:0", note: "E5", dur: "2n" },
  { time: "3:2", note: "C5", dur: "4n" },
  { time: "3:3", note: "D5", dur: "4n", vel: 0.7 },
  // bar 4 — Am7 (the answer, from the octave)
  { time: "4:0", note: "A5", dur: "4n" },
  { time: "4:1", note: "C6", dur: "4n" },
  { time: "4:2", note: "B5", dur: "8n" },
  { time: "4:2.5", note: "A5", dur: "8n" },
  { time: "4:3", note: "G5", dur: "4n" },
  // bar 5 — Dm7
  { time: "5:0", note: "A5", dur: "4n" },
  { time: "5:1", note: "G5", dur: "8n" },
  { time: "5:1.5", note: "F5", dur: "4n" },
  { time: "5:2.5", note: "D5", dur: "4n" },
  { time: "5:3.5", note: "F5", dur: "8n", vel: 0.7 },
  // bar 6 — G7
  { time: "6:0", note: "G5", dur: "4n" },
  { time: "6:1", note: "F5", dur: "4n" },
  { time: "6:2", note: "D5", dur: "4n" },
  { time: "6:3", note: "B4", dur: "4n", vel: 0.7 },
  // bar 7 — Cmaj7
  { time: "7:0", note: "C5", dur: "2n." },
  { time: "7:3", note: "E5", dur: "4n", vel: 0.65 },
];

function scheduleLead(out: Tone.Channel, keep: Keep) {
  const lead = keep(
    new Tone.Synth({
      // a soft square reads as a synth lead where the meadow's sine reads as
      // a whistle; the portamento is long enough to hear on the leaps
      oscillator: { type: "square8" },
      portamento: 0.03,
      envelope: { attack: 0.012, decay: 0.14, sustain: 0.6, release: 0.22 },
      volume: -10,
    }),
  );
  // dotted eighth, the synthwave delay — it lands off the sixteenth grid, so
  // the echoes weave through the hats rather than doubling them
  const delay = keep(
    new Tone.FeedbackDelay({ delayTime: "8n.", feedback: 0.3, wet: 0.24 }),
  );
  lead.chain(delay, out);

  const part = keep(
    new Tone.Part(
      (time, e: NoteEvent) =>
        safeHit(() =>
          lead.triggerAttackRelease(e.note, e.dur, time, e.vel ?? 0.9),
        ),
      LEAD_TUNE,
    ),
  );
  part.loop = true;
  part.loopEnd = "8:0";
  part.start(0);
}

export const neonSong: SongDef = {
  id: "neon",
  mixDb: [-5, -6, -12, -10], // drums, bass, keys, lead
  // the driest record on the shelf. The harbour wanted open water; a city at
  // night is close walls and a plate reverb on the snare, nothing more
  verbSendDb: [-26, -34, -16, -11],
  reverb: { decay: 1.8, preDelay: 0.015 },
  // A minor pentatonic — pickups land inside the key of the record
  voicing: {
    pickupRun: ["A3", "C4", "D4", "E4", "G4", "A4", "C5", "D5", "E5", "G5"],
    pieceChime: ["A4", "C5", "E5"],
    pieceThump: "A1",
    skipThud: "A0",
  },
  schedule(stems, keep) {
    scheduleDrums(stems[0], keep);
    scheduleBass(stems[1], keep);
    scheduleKeys(stems[2], keep);
    scheduleLead(stems[3], keep);
  },
};
