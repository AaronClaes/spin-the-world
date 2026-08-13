import { describe, expect, it } from "vitest";
import { barBeat, beatsToSeconds, secondsToBeats, songProgress } from "./clock";

describe("time ↔ beat conversion", () => {
  it("round-trips", () => {
    for (const bpm of [90, 100, 120, 140]) {
      for (const beats of [0, 1, 15.25, 176]) {
        expect(secondsToBeats(beatsToSeconds(beats, bpm), bpm)).toBeCloseTo(
          beats,
          12,
        );
      }
    }
  });

  it("120bpm: one beat is half a second, 176 beats is 88s", () => {
    expect(secondsToBeats(0.5, 120)).toBeCloseTo(1, 12);
    expect(beatsToSeconds(176, 120)).toBeCloseTo(88, 12);
  });
});

describe("song progress", () => {
  it("clamps to [0, 1]", () => {
    expect(songProgress(-4, 176)).toBe(0);
    expect(songProgress(88, 176)).toBeCloseTo(0.5, 12);
    expect(songProgress(200, 176)).toBe(1);
  });
});

describe("bar:beat display", () => {
  it("reads 4/4 positions", () => {
    expect(barBeat(0)).toEqual({ bar: 0, beat: 0 });
    expect(barBeat(5.9)).toEqual({ bar: 1, beat: 1 });
    expect(barBeat(175)).toEqual({ bar: 43, beat: 3 });
  });
});
