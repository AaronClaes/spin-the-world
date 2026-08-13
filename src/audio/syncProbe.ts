import { beatsToSeconds } from "../game/clock";

// Measures scheduling drift: every quarter-note callback receives the exact
// AudioContext time its sound is heard. Relative to beat 0, each beat must
// land at exactly beat * (60/bpm) seconds. Any deviation is real drift
// between the audio and the beat grid the disc renders from.
export const syncProbe = {
  startTime: -1,
  beat: -1,
  lastDriftMs: 0,
  maxDriftMs: 0,

  reset() {
    this.startTime = -1;
    this.beat = -1;
    this.lastDriftMs = 0;
    this.maxDriftMs = 0;
  },

  sample(time: number, beat: number, bpm: number) {
    if (beat === 0) this.startTime = time;
    if (this.startTime < 0) return;
    const expected = this.startTime + beatsToSeconds(beat, bpm);
    const driftMs = (time - expected) * 1000;
    this.beat = beat;
    this.lastDriftMs = driftMs;
    if (Math.abs(driftMs) > Math.abs(this.maxDriftMs))
      this.maxDriftMs = driftMs;
  },
};
