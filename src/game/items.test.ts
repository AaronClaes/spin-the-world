import { describe, expect, it } from "vitest";
import { meadow } from "../records/meadow";
import type { RecordDef } from "../records/types";
import { buildRunItems, expandNotes, validateRecord } from "./items";

const base: RecordDef = {
  ...meadow,
  id: "test",
  worldPieces: [{ id: "wp01", beat: 3, lane: 1, prop: "box" }],
  notePatterns: [
    { fromBar: 0, toBar: 2, lanes: ["x-------", "----x---", "--------"] },
  ],
  stemUnlockAtPieces: [0, 0, 1, 1],
};

describe("pattern expansion", () => {
  it("expands steps to beats: step n is bar*4 + n/2", () => {
    const notes = expandNotes([
      { fromBar: 2, toBar: 3, lanes: ["x--x----", "--------", "-------x"] },
    ]);
    expect(notes.map((n) => [n.beat, n.lane])).toEqual([
      [8, 0],
      [9.5, 0],
      [11.5, 2],
    ]);
  });

  it("repeats the pattern for every bar in the range", () => {
    const notes = expandNotes([
      { fromBar: 0, toBar: 4, lanes: ["x---x---", "--------", "--------"] },
    ]);
    expect(notes).toHaveLength(8);
    expect(notes[7].beat).toBe(14); // bar 3, step 4
  });
});

describe("validation", () => {
  it("meadow passes", () => {
    expect(() => validateRecord(meadow)).not.toThrow();
  });

  it("rejects totalBeats not a multiple of 16", () => {
    expect(() => validateRecord({ ...base, totalBeats: 170 })).toThrow(
      /multiple of 16/,
    );
  });

  it("rejects a note and piece on the same beat+lane", () => {
    const bad = {
      ...base,
      // piece at beat 2 lane 1 collides with the pattern's step-4 note
      worldPieces: [{ id: "wp01", beat: 2, lane: 1 as const, prop: "box" }],
    };
    expect(() => validateRecord(bad)).toThrow(/share beat\+lane/);
  });

  it("rejects two pieces on the same beat+lane", () => {
    const bad = {
      ...base,
      worldPieces: [
        { id: "a", beat: 3, lane: 1 as const, prop: "box" },
        { id: "b", beat: 3, lane: 1 as const, prop: "crate" },
      ],
    };
    expect(() => validateRecord(bad)).toThrow(/share beat\+lane/);
  });

  it("rejects malformed pattern strings", () => {
    const bad = {
      ...base,
      notePatterns: [
        {
          fromBar: 0,
          toBar: 1,
          lanes: ["x---", "--------", "--------"] as [string, string, string],
        },
      ],
    };
    expect(() => validateRecord(bad)).toThrow(/8 chars/);
  });

  it("rejects stem unlocks beyond the piece count", () => {
    const bad = {
      ...base,
      stemUnlockAtPieces: [0, 1, 1, 5] as [number, number, number, number],
    };
    expect(() => validateRecord(bad)).toThrow(/exceeds piece count/);
  });
});

describe("buildRunItems", () => {
  it("merges notes and pieces sorted by beat", () => {
    const items = buildRunItems(base);
    for (let i = 1; i < items.length; i++) {
      expect(items[i].beat).toBeGreaterThanOrEqual(items[i - 1].beat);
    }
    expect(items.some((i) => i.kind === "piece")).toBe(true);
    expect(items.some((i) => i.kind === "note")).toBe(true);
  });

  it("meadow has ~90–130 notes and 10 pieces", () => {
    const items = buildRunItems(meadow);
    const notes = items.filter((i) => i.kind === "note");
    const pieces = items.filter((i) => i.kind === "piece");
    expect(pieces).toHaveLength(10);
    expect(notes.length).toBeGreaterThanOrEqual(90);
    expect(notes.length).toBeLessThanOrEqual(130);
  });

  it("meadow reserves step 6 for pieces: no note on beat ≡ 3 (mod 4)", () => {
    const notes = expandNotes(meadow.notePatterns);
    expect(notes.every((n) => n.beat % 4 !== 3)).toBe(true);
  });
});
