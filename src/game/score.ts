import type { RecordDef } from "../records/types";
import { expandNotes } from "./items";

export const NOTE_SCORE = 10; // × combo multiplier (spec §8.7)
export const PIECE_SCORE = 100;

// The score multiplier caps even though the combo counter keeps climbing.
// Uncapped 10×combo makes max score quadratic in streak length — one
// mid-track miss halves a perfect score and starThresholds (fractions of
// max) become unreachable. Capped, a miss costs the ramp back up (~450 pts),
// which is a sting, not a death sentence.
export const COMBO_MULT_CAP = 10;

export const noteScoreAt = (combo: number) =>
  NOTE_SCORE * Math.min(combo, COMBO_MULT_CAP);

// Max score is computable from the chart (spec §8.7): every note caught in
// one unbroken combo, every piece collected.
export function computeMaxScore(record: RecordDef): number {
  const noteCount = expandNotes(record.notePatterns).length;
  let notes = 0;
  for (let i = 1; i <= noteCount; i++) notes += noteScoreAt(i);
  return notes + record.worldPieces.length * PIECE_SCORE;
}

// 0–3 stars. Completion gates everything: a run that didn't build the whole
// world is a failed run, no matter the score. Finishing the world IS the
// first star; score fractions (starThresholds) earn the other two.
export function starsForRun(
  completed: boolean,
  score: number,
  maxScore: number,
  thresholds: readonly [number, number],
): number {
  if (!completed) return 0;
  const frac = maxScore > 0 ? score / maxScore : 0;
  let stars = 1;
  for (const t of thresholds) if (frac >= t) stars++;
  return stars;
}
