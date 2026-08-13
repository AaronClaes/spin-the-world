import * as Tone from "tone";

// M1: one sequenced stem — drums — scheduled on the Transport from 0.
// Patterns are 16 eighth-note steps (2 bars = 1 disc revolution).
const KICK = "x...x...x...x.x.";
const SNARE = "..x...x...x...x.";
const HAT = "x.xxx.xxx.xxx.xx";

export function scheduleDrumStem() {
  const channel = new Tone.Channel({ volume: -4 }).toDestination();

  const kick = new Tone.MembraneSynth({
    pitchDecay: 0.04,
    octaves: 6,
    envelope: { attack: 0.001, decay: 0.32, sustain: 0 },
    volume: -2,
  }).connect(channel);

  const snareBody = new Tone.Filter(1800, "bandpass").connect(channel);
  const snare = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.001, decay: 0.14, sustain: 0 },
    volume: -6,
  }).connect(snareBody);

  const hatFilter = new Tone.Filter(9000, "highpass").connect(channel);
  const hat = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.001, decay: 0.035, sustain: 0 },
    volume: -16,
  }).connect(hatFilter);

  const seq = (pattern: string, hit: (time: number) => void) =>
    new Tone.Sequence(
      (time, step) => {
        if (step === "x") hit(time);
      },
      [...pattern],
      "8n",
    ).start(0);

  seq(KICK, (t) => kick.triggerAttackRelease("C1", "8n", t));
  seq(SNARE, (t) => snare.triggerAttackRelease("16n", t));
  seq(HAT, (t) => hat.triggerAttackRelease("32n", t));
}
