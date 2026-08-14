import * as Tone from "tone";

// "Meadow 45" — folk, 120bpm, G major. Four stems on four channels, ALL
// scheduled from transport 0 and looping for the whole track; unlocking a
// stem is a volume ramp, never a late start, so phase lock is structural
// (spec §8.5). Harmony is one 4-bar loop (G – Em – C – D); the lead is an
// 8-bar call-and-response phrase over two passes of it.

// Locked stems sit at -60dB instead of -Infinity so rampTo interpolates
// cleanly in dB. -60 under a playing mix is silence.
const LOCKED_DB = -60;
const STEM_MIX_DB = [-6, -7, -12, -9]; // drums, bass, keys, lead
const MASTER_DB = -2;
const ALIVE_SWELL_DB = 0; // master ramps here when the world comes alive

let master: Tone.Channel | null = null;
let masterTarget = MASTER_DB; // where the duck recovers to (alive swell moves it)
let stems: Tone.Channel[] = [];
let scheduled = false;

const CHORDS = {
  G: ["G3", "B3", "D4", "G4"],
  Em: ["E3", "G3", "B3", "E4"],
  C: ["E3", "G3", "C4", "E4"],
  D: ["F#3", "A3", "D4", "F#4"],
};
const PROGRESSION: (keyof typeof CHORDS)[] = ["G", "Em", "C", "D"];

type NoteEvent = { time: string; note: string; dur: string; vel?: number };
type ChordEvent = { time: string; notes: string[]; dur: string; vel: number };

// After a long main-thread stall the Transport catches up by firing the
// missed events in one burst with clamped times — a mono synth started twice
// at the same clamped time throws. Dropping that hit is inaudible; letting
// the throw escape a clock callback is not.
const safeHit = (fn: () => void) => {
  try {
    fn();
  } catch {
    // catch-up burst after a stall — skip this hit
  }
};

// ---------------------------------------------------------------- drums ----

function scheduleDrums(out: Tone.Channel) {
  // 16 eighth-note steps = 2 bars = 1 disc revolution.
  const KICK = "x...x...x...x.x.";
  const SNARE = "..x...x...x...x.";
  const HAT = "x.xxx.xxx.xxx.xx";

  const kick = new Tone.MembraneSynth({
    pitchDecay: 0.04,
    octaves: 6,
    envelope: { attack: 0.001, decay: 0.32, sustain: 0 },
    volume: -2,
  }).connect(out);

  const snareBody = new Tone.Filter(1800, "bandpass").connect(out);
  const snare = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.001, decay: 0.14, sustain: 0 },
    volume: -6,
  }).connect(snareBody);

  const hatFilter = new Tone.Filter(9000, "highpass").connect(out);
  const hat = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.001, decay: 0.035, sustain: 0 },
    volume: -16,
  }).connect(hatFilter);

  const seq = (pattern: string, hit: (time: number) => void) =>
    new Tone.Sequence(
      (time, step) => {
        if (step === "x") safeHit(() => hit(time));
      },
      [...pattern],
      "8n",
    ).start(0);

  seq(KICK, (t) => kick.triggerAttackRelease("C1", "8n", t));
  seq(SNARE, (t) => snare.triggerAttackRelease("16n", t));
  seq(HAT, (t) => hat.triggerAttackRelease("32n", t));
}

// ----------------------------------------------------------------- bass ----

function scheduleBass(out: Tone.Channel) {
  const bass = new Tone.MonoSynth({
    oscillator: { type: "triangle" },
    filter: { type: "lowpass", Q: 1 },
    filterEnvelope: {
      attack: 0.005,
      decay: 0.2,
      sustain: 0.4,
      release: 0.3,
      baseFrequency: 90,
      octaves: 2.2,
    },
    envelope: { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.35 },
  }).connect(out);

  // Country/folk alternating bass: root and fifth on the quarters, one
  // pickup eighth at the end of the loop walking back up to G.
  const line: { time: string; note: string }[] = [
    { time: "0:0", note: "G2" },
    { time: "0:1", note: "D2" },
    { time: "0:2", note: "G2" },
    { time: "0:3", note: "D2" },
    { time: "1:0", note: "E2" },
    { time: "1:1", note: "B1" },
    { time: "1:2", note: "E2" },
    { time: "1:3", note: "B1" },
    { time: "2:0", note: "C2" },
    { time: "2:1", note: "G2" },
    { time: "2:2", note: "C2" },
    { time: "2:3", note: "G2" },
    { time: "3:0", note: "D2" },
    { time: "3:1", note: "A1" },
    { time: "3:2", note: "D2" },
    { time: "3:3", note: "A1" },
    { time: "3:3.5", note: "F#2" }, // walk back up to G
  ];

  const part = new Tone.Part(
    (time, e: { time: string; note: string }) =>
      safeHit(() => bass.triggerAttackRelease(e.note, "8n", time, 0.9)),
    line,
  );
  part.loop = true;
  part.loopEnd = "4:0";
  part.start(0);
}

// ----------------------------------------------------------------- keys ----

function scheduleKeys(out: Tone.Channel) {
  // Plucky poly synth standing in for a strummed guitar: fast decay, low
  // sustain. D-DU-UDU folk strum; up-strums are the top three notes, softer.
  const keys = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "triangle" },
    envelope: { attack: 0.004, decay: 0.28, sustain: 0.12, release: 0.35 },
  }).connect(out);
  keys.maxPolyphony = 16;

  const STRUM: { beat: string; up: boolean }[] = [
    { beat: "0", up: false },
    { beat: "1", up: false },
    { beat: "1.5", up: true },
    { beat: "2.5", up: true },
    { beat: "3", up: false },
    { beat: "3.5", up: true },
  ];

  const events: ChordEvent[] = PROGRESSION.flatMap((chord, bar) =>
    STRUM.map(({ beat, up }) => ({
      time: `${bar}:${beat}`,
      notes: up ? CHORDS[chord].slice(1) : CHORDS[chord],
      dur: up ? "8n" : "4n",
      vel: up ? 0.45 : 0.8,
    })),
  );

  const part = new Tone.Part(
    (time, e: ChordEvent) =>
      safeHit(() => keys.triggerAttackRelease(e.notes, e.dur, time, e.vel)),
    events,
  );
  part.loop = true;
  part.loopEnd = "4:0";
  part.start(0);
}

// ----------------------------------------------------------------- lead ----

// 8-bar phrase: A (bars 0–3) lands on the hanging A, B (bars 4–7) answers
// and resolves down to F#, which pulls back to the G of the next pass.
const LEAD_PHRASE: NoteEvent[] = [
  // bar 0 — G
  { time: "0:0", note: "D5", dur: "4n" },
  { time: "0:1", note: "B4", dur: "8n" },
  { time: "0:1.5", note: "A4", dur: "8n" },
  { time: "0:2", note: "G4", dur: "4n" },
  { time: "0:3.5", note: "A4", dur: "8n", vel: 0.6 },
  // bar 1 — Em
  { time: "1:0", note: "B4", dur: "4n." },
  { time: "1:1.5", note: "A4", dur: "8n" },
  { time: "1:2", note: "G4", dur: "2n" },
  // bar 2 — C
  { time: "2:0", note: "E5", dur: "4n" },
  { time: "2:1", note: "D5", dur: "8n" },
  { time: "2:1.5", note: "E5", dur: "8n" },
  { time: "2:2", note: "D5", dur: "2n" },
  // bar 3 — D
  { time: "3:0", note: "A4", dur: "4n" },
  { time: "3:1", note: "B4", dur: "4n" },
  { time: "3:2", note: "A4", dur: "8n" },
  { time: "3:2.5", note: "G4", dur: "8n" },
  { time: "3:3", note: "A4", dur: "4n" },
  // bar 4 — G
  { time: "4:0", note: "D5", dur: "4n" },
  { time: "4:1", note: "B4", dur: "8n" },
  { time: "4:1.5", note: "A4", dur: "8n" },
  { time: "4:2", note: "G4", dur: "4n" },
  { time: "4:3", note: "A4", dur: "8n", vel: 0.6 },
  { time: "4:3.5", note: "B4", dur: "8n", vel: 0.7 },
  // bar 5 — Em
  { time: "5:0", note: "E5", dur: "4n." },
  { time: "5:1.5", note: "D5", dur: "8n" },
  { time: "5:2", note: "B4", dur: "2n" },
  // bar 6 — C
  { time: "6:0", note: "A4", dur: "8n" },
  { time: "6:0.5", note: "G4", dur: "8n" },
  { time: "6:1", note: "E4", dur: "4n" },
  { time: "6:2", note: "G4", dur: "4n" },
  { time: "6:3", note: "A4", dur: "8n", vel: 0.6 },
  { time: "6:3.5", note: "B4", dur: "8n", vel: 0.7 },
  // bar 7 — D
  { time: "7:0", note: "A4", dur: "2n." },
  { time: "7:3", note: "F#4", dur: "4n" },
];

function scheduleLead(out: Tone.Channel) {
  // Whistle-ish: sine with vibrato and a touch of portamento, echoed on a
  // dotted-eighth delay.
  const lead = new Tone.Synth({
    oscillator: { type: "sine" },
    portamento: 0.02,
    envelope: { attack: 0.06, decay: 0.1, sustain: 0.8, release: 0.3 },
  });
  const vibrato = new Tone.Vibrato(5, 0.12);
  const delay = new Tone.FeedbackDelay({
    delayTime: "8n.",
    feedback: 0.25,
    wet: 0.2,
  });
  lead.chain(vibrato, delay, out);

  const part = new Tone.Part(
    (time, e: NoteEvent) =>
      safeHit(() =>
        lead.triggerAttackRelease(e.note, e.dur, time, e.vel ?? 0.9),
      ),
    LEAD_PHRASE,
  );
  part.loop = true;
  part.loopEnd = "8:0";
  part.start(0);
}

// ------------------------------------------------------------- stem API ----

export function scheduleMeadowMusic() {
  if (scheduled) return;
  scheduled = true;

  master = new Tone.Channel({ volume: MASTER_DB }).toDestination();

  // Shared reverb return bus — most of the distance between "programmer
  // music" and "music" (spec §10).
  const reverb = new Tone.Reverb({ decay: 2.6, preDelay: 0.02, wet: 1 });
  const verbReturn = new Tone.Channel();
  verbReturn.receive("verb");
  verbReturn.chain(reverb, master);

  stems = STEM_MIX_DB.map((_, i) => {
    const ch = new Tone.Channel({
      volume: i === 0 ? STEM_MIX_DB[0] : LOCKED_DB,
    }).connect(master as Tone.Channel);
    return ch;
  });
  stems[0].send("verb", -24);
  stems[1].send("verb", -30);
  stems[2].send("verb", -14);
  stems[3].send("verb", -10);

  scheduleDrums(stems[0]);
  scheduleBass(stems[1]);
  scheduleKeys(stems[2]);
  scheduleLead(stems[3]);
}

// Volume-ramp every stem to match the collected-piece count (spec §8.5).
// Idempotent — ramping to the level a stem is already at is a no-op sound-
// wise, so callers can invoke this on every collect.
export function applyStemUnlocks(
  piecesCollected: number,
  unlockAt: readonly number[],
  immediate = false,
) {
  stems.forEach((ch, i) => {
    const target = piecesCollected >= unlockAt[i] ? STEM_MIX_DB[i] : LOCKED_DB;
    if (immediate) ch.volume.value = target;
    else ch.volume.rampTo(target, 0.5);
  });
}

// Debug/HUD: current stem channel volumes in dB.
export function stemVolumes(): number[] {
  return stems.map((ch) => ch.volume.value);
}

// Full completion: the mix swells with the world (spec §8.4).
export function swellAliveMix() {
  masterTarget = ALIVE_SWELL_DB;
  master?.volume.rampTo(ALIVE_SWELL_DB, 1.5);
}

export function resetAliveMix() {
  masterTarget = MASTER_DB;
  if (master) master.volume.value = MASTER_DB;
}

// Record-skip (spec §8.1): the music itself drops out for a beat, like the
// needle actually left the groove, then recovers.
export function duckForSkip() {
  if (!master) return;
  try {
    const now = Tone.now();
    master.volume.cancelScheduledValues(now);
    master.volume.rampTo(masterTarget - 10, 0.03, now);
    master.volume.rampTo(masterTarget, 0.3, now + 0.16);
  } catch {
    // scheduling edge case (e.g. two skips in one frame) — skip the duck
  }
}
