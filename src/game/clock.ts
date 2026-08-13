// Pure time↔beat conversions. The Transport IS the clock: beatPos is derived
// from Tone.Transport.seconds (see src/audio/transport.ts), never integrated
// from rAF deltas — so the disc cannot drift relative to the music.

export const secondsToBeats = (seconds: number, bpm: number) =>
  seconds * (bpm / 60);

export const beatsToSeconds = (beats: number, bpm: number) =>
  beats * (60 / bpm);

export const songProgress = (beatPos: number, totalBeats: number) =>
  Math.min(1, Math.max(0, beatPos / totalBeats));

export const barBeat = (beatPos: number) => {
  const bar = Math.floor(beatPos / 4);
  const beat = Math.floor(beatPos % 4);
  return { bar, beat };
};
