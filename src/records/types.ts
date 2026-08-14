import type { Lane } from "../game/geometry";

export interface WorldPieceDef {
  id: string;
  beat: number; // arrival beat; must be an integer or clean subdivision
  lane: Lane;
  prop: string; // named node in the diorama GLB (M4); placeholder box label until then
}

export interface NotePattern {
  fromBar: number; // inclusive
  toBar: number; // exclusive
  // 8 steps per bar (eighth notes), one string per lane, lane 0 first.
  // 'x' = note, '-' = rest.
  lanes: [string, string, string];
}

export interface RecordDef {
  id: string;
  title: string;
  genre: string;
  bpm: number;
  totalBeats: number; // must be a multiple of 16 (whole revolutions, whole 4-bar phrases)
  band: { startRadius: number; endRadius: number; laneGap: number };

  stems: [string, string, string, string]; // channel names, in unlock order
  stemUnlockAtPieces: [number, number, number, number]; // stem 0 must be 0
  starThresholds: [number, number, number]; // fractions of the chart's max score

  worldPieces: WorldPieceDef[];
  notePatterns: NotePattern[];

  accentColor: string; // per-record accent: lane guides, piece rings, runner
  // headphones (spec §9) — notes use the shared palette (scene/notePalette.ts)
}
