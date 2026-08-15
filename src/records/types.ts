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

// The sky and lighting a record plays under (records/sky.ts). Optional on a
// record; DAYLIGHT is what the first two shipped with.
export interface SkyPalette {
  bg: string; // scene background behind the dome
  top: string; // dome gradient, straight up
  mid: string; // dome gradient, at the horizon
  low: string; // dome gradient, far below the deck
  cloud: string; // multiplies the cloud field's own shading — white is a no-op
  key: string; // the sun/moon directional
  fill: string; // the cool bounce from the other side
  hemiSky: string;
  hemiGround: string;
  dim: number; // scales every light's play-time intensity
}

// What the wall promises before you commit to three minutes. It's authored
// rather than derived: tempo is most of the story but not all of it, and the
// badge has to agree with the order the records hang in (records/index.ts).
export type Difficulty = "easy" | "medium" | "hard";

export interface RecordDef {
  id: string;
  title: string;
  genre: string;
  difficulty: Difficulty;
  bpm: number;
  totalBeats: number; // must be a multiple of 16 (whole revolutions, whole 4-bar phrases)
  band: { startRadius: number; endRadius: number; laneGap: number };

  stems: [string, string, string, string]; // channel names, in unlock order
  stemUnlockAtPieces: [number, number, number, number]; // stem 0 must be 0
  starThresholds: [number, number]; // score fractions for the 2nd and 3rd
  // star — the 1st star is collecting every world piece (game/score.ts)

  worldPieces: WorldPieceDef[];
  notePatterns: NotePattern[];

  // GLB holding one named root node per world piece, kitbashed by
  // scripts/build-diorama.mjs. The island layout for this record is keyed on
  // the record id in scene/islandLayout.ts.
  dioramaModel: string;

  sky?: SkyPalette; // defaults to DAYLIGHT (records/sky.ts)

  accentColor: string; // per-record accent: lane guides, piece rings, runner
  // headphones (spec §9) — notes use the shared palette (scene/notePalette.ts)
}
