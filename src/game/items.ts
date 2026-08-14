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
  misses?: number; // pieces only: times it has recurred — once missed, it
  // stays surfaced and visibly rides the disc back around
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

// Lane scatter (spec §7): the authored pattern rows fix WHERE notes land on
// the grid — the rhythm — but repeating one lane string for ten bars
// telegraphs the route. Lanes are re-dealt here, seeded on the record id so
// every load and replay gets the identical chart. Constraint: the runner
// moves one lane per half beat, so each note must be reachable from the
// previous item AND must leave the next world piece reachable — variety
// never charts a forced miss.

// how far the runner can move between two arrivals `gap` beats apart
const maxLaneDelta = (gap: number) => Math.min(2, Math.floor(gap / 0.5));

// deterministic per-note roll — no Math.random, charts must replay identically
function laneRoll(seed: string, beat: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const x = Math.sin(h * 0.013 + beat * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

export function scatterNoteLanes(
  notes: RunItem[],
  pieces: readonly { beat: number; lane: Lane }[],
  seed: string,
): void {
  const fixed = [...pieces].sort((a, b) => a.beat - b.beat);
  const sorted = [...notes].sort((a, b) => a.beat - b.beat);

  let prevBeat = -8;
  let prevLane: Lane = 1; // the run starts in the centre lane
  let sameRun = 0; // consecutive notes dealt the same lane
  let fi = 0;
  const usedAtBeat = new Set<Lane>(); // same-beat notes must not collide

  for (const note of sorted) {
    // pieces passed since the last note anchor the reachability chain
    while (fi < fixed.length && fixed[fi].beat <= note.beat) {
      prevBeat = fixed[fi].beat;
      prevLane = fixed[fi].lane;
      fi++;
    }
    if (note.beat !== prevBeat) usedAtBeat.clear();

    const next = fixed[fi];
    const candidates = ([0, 1, 2] as Lane[]).filter((l) => {
      if (usedAtBeat.has(l)) return false;
      if (Math.abs(l - prevLane) > maxLaneDelta(note.beat - prevBeat))
        return false;
      if (next && Math.abs(l - next.lane) > maxLaneDelta(next.beat - note.beat))
        return false;
      return true;
    });
    // break up three-in-a-row runs when there's a choice
    const varied =
      sameRun >= 2 && candidates.length > 1
        ? candidates.filter((l) => l !== prevLane)
        : candidates;

    if (varied.length > 0) {
      const pick =
        varied[Math.floor(laneRoll(seed, note.beat) * varied.length)];
      sameRun = pick === prevLane ? sameRun + 1 : 0;
      note.lane = pick;
    }
    // no candidate (shouldn't happen on a valid chart): keep the authored lane

    usedAtBeat.add(note.lane);
    prevBeat = note.beat;
    prevLane = note.lane;
  }
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
  // Note lanes are re-dealt by the scatter, so a note anywhere on a piece's
  // beat could land in its lane — piece beats must stay clear in every lane.
  const pieceBeats = new Map(record.worldPieces.map((p) => [p.beat, p.id]));
  for (const note of expandNotes(record.notePatterns)) {
    const piece = pieceBeats.get(note.beat);
    if (piece)
      problems.push(
        `note at beat ${note.beat} shares the piece beat of ${piece} — leave piece beats empty in all lanes`,
      );
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
  const notes = expandNotes(record.notePatterns);
  scatterNoteLanes(notes, record.worldPieces, record.id);
  return [...notes, ...pieces].sort((a, b) => a.beat - b.beat);
}
