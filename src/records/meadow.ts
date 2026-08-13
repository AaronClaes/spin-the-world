import type { RecordDef } from "./types";

export type { RecordDef } from "./types";

// Chart conventions for this record:
// - World pieces sit on step 6 of their bar (the snare backbeat, beat ≡ 3 mod
//   4). Every note pattern leaves step 6 empty in all lanes, so pieces never
//   share a beat+lane with a note — and since recurrence is +8 beats, a
//   recurring piece can't collide with a note either.
// - Three clusters (two pieces, same beat, different lanes) at beats 27, 75
//   and 99 — all inside the first 60% of the track (spec §7) so recurrence
//   has room to work.
export const meadow: RecordDef = {
  id: "meadow",
  title: "Meadow 45",
  genre: "folk",
  bpm: 120,
  totalBeats: 176, // 44 bars, 22 revolutions, 88s at 120bpm
  band: { startRadius: 4.5, endRadius: 2.0, laneGap: 0.45 },

  stems: ["drums", "bass", "keys", "lead"],
  stemUnlockAtPieces: [0, 2, 5, 8],
  starThresholds: [0.5, 0.75, 0.9],

  worldPieces: [
    { id: "wp01", beat: 15, lane: 1, prop: "mill" },
    { id: "wp02", beat: 27, lane: 0, prop: "cottage" },
    { id: "wp03", beat: 27, lane: 2, prop: "oak" }, // cluster 1
    { id: "wp04", beat: 51, lane: 2, prop: "pond" },
    { id: "wp05", beat: 75, lane: 0, prop: "sheep" },
    { id: "wp06", beat: 75, lane: 2, prop: "fence" }, // cluster 2
    { id: "wp07", beat: 99, lane: 1, prop: "haycart" },
    { id: "wp08", beat: 99, lane: 0, prop: "flowers" }, // cluster 3
    { id: "wp09", beat: 123, lane: 2, prop: "birch" },
    { id: "wp10", beat: 147, lane: 1, prop: "well" },
  ],

  // 8 steps per bar (eighths), lane 0 first. Step 6 stays empty everywhere —
  // that's the world-piece slot. Density follows the arc of the track.
  notePatterns: [
    { fromBar: 0, toBar: 2, lanes: ["--------", "----x---", "--------"] },
    { fromBar: 2, toBar: 13, lanes: ["x-------", "--------", "----x---"] },
    { fromBar: 13, toBar: 26, lanes: ["x---x---", "-x------", "--------"] },
    { fromBar: 26, toBar: 38, lanes: ["x---x---", "-------x", "--x-----"] },
    { fromBar: 38, toBar: 44, lanes: ["----x---", "x-------", "--------"] },
  ],

  accentColor: "#ffd27a",
};
