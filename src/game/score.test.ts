import { describe, expect, it } from "vitest";
import { meadow } from "../records/meadow";
import type { RecordDef } from "../records/types";
import { expandNotes } from "./items";
import {
  COMBO_MULT_CAP,
  computeMaxScore,
  noteScoreAt,
  PIECE_SCORE,
  starsForRun,
} from "./score";

const tiny: RecordDef = {
  ...meadow,
  notePatterns: [
    // 3 notes per bar × 2 bars = 6 notes
    { fromBar: 0, toBar: 2, lanes: ["x---x---", "--x-----", "--------"] },
  ],
  worldPieces: [{ id: "wp01", beat: 3, lane: 1, prop: "mill" }],
};

describe("noteScoreAt", () => {
  it("scales with combo up to the cap, then flattens", () => {
    expect(noteScoreAt(1)).toBe(10);
    expect(noteScoreAt(COMBO_MULT_CAP)).toBe(100);
    expect(noteScoreAt(COMBO_MULT_CAP + 50)).toBe(100);
  });
});

describe("computeMaxScore", () => {
  it("sums a perfect combo run plus all pieces", () => {
    // 6 notes, all under the cap: 10+20+30+40+50+60 = 210, +1 piece
    expect(computeMaxScore(tiny)).toBe(210 + PIECE_SCORE);
  });

  it("applies the cap for long charts", () => {
    const n = expandNotes(meadow.notePatterns).length;
    expect(n).toBeGreaterThan(COMBO_MULT_CAP);
    const rampUp = (10 * COMBO_MULT_CAP * (COMBO_MULT_CAP + 1)) / 2;
    const capped = (n - COMBO_MULT_CAP) * 10 * COMBO_MULT_CAP;
    expect(computeMaxScore(meadow)).toBe(
      rampUp + capped + meadow.worldPieces.length * PIECE_SCORE,
    );
  });
});

describe("starsForRun", () => {
  const thresholds = [0.6, 1] as const;

  it("an incomplete world is a failed run — no stars at any score", () => {
    expect(starsForRun(false, 0, 1000, thresholds)).toBe(0);
    expect(starsForRun(false, 1000, 1000, thresholds)).toBe(0);
  });

  it("completing the world IS the first star", () => {
    expect(starsForRun(true, 0, 1000, thresholds)).toBe(1);
    expect(starsForRun(true, 599, 1000, thresholds)).toBe(1);
  });

  it("score fractions earn the second and third", () => {
    expect(starsForRun(true, 600, 1000, thresholds)).toBe(2);
    expect(starsForRun(true, 999, 1000, thresholds)).toBe(2);
    expect(starsForRun(true, 1000, 1000, thresholds)).toBe(3);
  });

  it("handles a zero max score without dividing by zero", () => {
    expect(starsForRun(true, 0, 0, thresholds)).toBe(1);
  });
});
