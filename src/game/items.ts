import type { NotePattern, RecordDef } from "../records/types";
import type { Lane } from "./geometry";
import { solveChart } from "./solver";

export type ItemKind = "note" | "piece";
export type ItemStatus = "pending" | "collected" | "missed" | "lost";

export interface RunItem {
  id: string;
  kind: ItemKind;
  beat: number; // next arrival; piece recurrence advances this by BEATS_PER_REV
  lane: Lane;
  status: ItemStatus;
  prop?: string; // pieces only
}

export const BEATS_PER_BAR = 4;
export const STEPS_PER_BAR = 8; // eighth notes; step → beat offset is step / 2

// Expand per-bar patterns into concrete note items (spec §7: never hand-write
// 90 note entries).
export function expandNotes(patterns: NotePattern[]): RunItem[] {
  const notes: RunItem[] = [];
  for (const pattern of patterns) {
    for (let bar = pattern.fromBar; bar < pattern.toBar; bar++) {
      pattern.lanes.forEach((steps, lane) => {
        for (let step = 0; step < STEPS_PER_BAR; step++) {
          if (steps[step] !== "x") continue;
          const beat = bar * BEATS_PER_BAR + step / 2;
          notes.push({
            id: `n-${beat}-${lane}`,
            kind: "note",
            beat,
            lane: lane as Lane,
            status: "pending",
          });
        }
      });
    }
  }
  return notes;
}

// Load-time validation (spec §7). A record that fails here is a bug in the
// chart, not a difficulty setting — throw loudly.
export function validateRecord(record: RecordDef): void {
  const problems: string[] = [];

  if (record.totalBeats % 16 !== 0)
    problems.push(`totalBeats ${record.totalBeats} is not a multiple of 16`);

  const totalBars = record.totalBeats / BEATS_PER_BAR;
  for (const p of record.notePatterns) {
    if (p.fromBar < 0 || p.toBar > totalBars || p.fromBar >= p.toBar)
      problems.push(
        `pattern range ${p.fromBar}–${p.toBar} outside 0–${totalBars}`,
      );
    for (const lane of p.lanes) {
      if (!/^[x-]{8}$/.test(lane))
        problems.push(`pattern lane "${lane}" must be 8 chars of x/-`);
    }
  }

  if (record.stemUnlockAtPieces.length !== 4)
    problems.push("stemUnlockAtPieces must have 4 entries");
  if (record.stemUnlockAtPieces[0] !== 0)
    problems.push("stem 0 must unlock at 0 pieces (plays from the start)");
  for (const n of record.stemUnlockAtPieces) {
    if (n > record.worldPieces.length)
      problems.push(
        `stem unlock at ${n} pieces exceeds piece count ${record.worldPieces.length}`,
      );
  }

  const seen = new Map<string, string>();
  const props = new Set<string>();
  for (const piece of record.worldPieces) {
    if (props.has(piece.prop))
      problems.push(
        `duplicate prop "${piece.prop}" — diorama slots are keyed by prop`,
      );
    props.add(piece.prop);
  }
  for (const piece of record.worldPieces) {
    if (piece.beat >= record.totalBeats)
      problems.push(
        `piece ${piece.id} at beat ${piece.beat} is past the track`,
      );
    const key = `${piece.beat}/${piece.lane}`;
    if (seen.has(key))
      problems.push(
        `pieces ${seen.get(key)} and ${piece.id} share beat+lane ${key}`,
      );
    seen.set(key, piece.id);
  }
  for (const note of expandNotes(record.notePatterns)) {
    const key = `${note.beat}/${note.lane}`;
    if (seen.has(key))
      problems.push(`note and piece ${seen.get(key)} share beat+lane ${key}`);
  }

  if (solveChart(record.worldPieces, record.totalBeats) === null)
    problems.push("chart is not completable — no route collects every piece");

  if (problems.length > 0)
    throw new Error(
      `record "${record.id}" failed validation:\n  ${problems.join("\n  ")}`,
    );
}

// Notes and pieces merged into one list sorted by beat — the resolution loop
// (src/game/run.ts) walks it with a single pointer.
export function buildRunItems(record: RecordDef): RunItem[] {
  const pieces: RunItem[] = record.worldPieces.map((p) => ({
    id: p.id,
    kind: "piece",
    beat: p.beat,
    lane: p.lane,
    status: "pending",
    prop: p.prop,
  }));
  return [...expandNotes(record.notePatterns), ...pieces].sort(
    (a, b) => a.beat - b.beat,
  );
}
