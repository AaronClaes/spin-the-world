import { describe, expect, it } from "vitest";
import { RECORDS } from "../records";
import type { WorldPieceDef } from "../records/types";
import { solveChart } from "./solver";

const piece = (id: string, beat: number, lane: 0 | 1 | 2): WorldPieceDef => ({
  id,
  beat,
  lane,
  prop: id,
});

describe("chart completability solver", () => {
  it("solves a chart with no conflicts trivially", () => {
    const plan = solveChart([piece("a", 8, 0), piece("b", 24, 2)], 64);
    expect(plan).toEqual([8, 24]);
  });

  it("resolves a cluster via recurrence", () => {
    // Two pieces on the same beat: one must be caught a lap later.
    const plan = solveChart([piece("a", 16, 0), piece("b", 16, 2)], 64);
    expect(plan).not.toBeNull();
    const beats = [...(plan as number[])].sort((x, y) => x - y);
    expect(beats[0]).toBe(16);
    expect(beats[1]).toBe(24); // 16 + one revolution
  });

  it("fails a cluster authored too late to recur", () => {
    // Both recurrences of the losing piece land past the end of the track.
    const plan = solveChart([piece("a", 60, 0), piece("b", 60, 2)], 64);
    expect(plan).toBeNull();
  });

  it("backtracks when the greedy choice blocks a later piece", () => {
    // "a" caught at 16 forces "b" to 24 — but a third piece already owns 24
    // and has no other occurrence, so "a"+"b" must shift down a lap.
    const plan = solveChart(
      [piece("a", 16, 0), piece("b", 16, 2), piece("c", 24, 1)],
      40,
    );
    expect(plan).not.toBeNull();
    expect(new Set(plan as number[]).size).toBe(3);
  });

  // Every record on the shelf, not just the first: a chart that can't be
  // completed can't earn its first star, and the piece spacing is exactly the
  // thing that gets edited when a new record is being tuned.
  it.each(RECORDS.map((r) => [r.id, r] as const))(
    "proves the %s chart completable",
    (_id, record) => {
      const plan = solveChart(record.worldPieces, record.totalBeats);
      expect(plan).not.toBeNull();
      // and every catch lands before the needle reaches the label
      for (const beat of plan as number[]) {
        expect(beat).toBeLessThanOrEqual(record.totalBeats);
      }
    },
  );
});
