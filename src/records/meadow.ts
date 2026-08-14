import type { RecordDef } from "./types";

export type { RecordDef } from "./types";

// Chart conventions for this record:
// - World pieces sit on step 6 of their bar (the snare backbeat, beat ≡ 3 mod
//   4). Every note pattern leaves step 6 empty in all lanes, so pieces never
//   share a beat+lane with a note — and since recurrence is +8 beats, a
//   recurring piece can't collide with a note either.
// - Every piece has its own beat (spec §7): same-beat clusters were cut —
//   a charted forced miss reads as unfair. Steady 12-beat spacing through
//   the mid-track, opening up toward the end.
export const meadow: RecordDef = {
  id: "meadow",
  title: "Meadow 45",
  genre: "folk",
  bpm: 120,
  totalBeats: 176, // 44 bars, 22 revolutions, 88s at 120bpm
  // laneGap widened from 0.45 for readability (spec risk table); startRadius
  // pulled in so the outer lane starts at 4.95, inside the disc rim (5.0).
  band: { startRadius: 4.4, endRadius: 2.0, laneGap: 0.55 },

  stems: ["drums", "bass", "keys", "lead"],
  stemUnlockAtPieces: [0, 2, 5, 8],
  starThresholds: [0.5, 0.75, 0.9],

  worldPieces: [
    { id: "wp01", beat: 15, lane: 1, prop: "mill" },
    { id: "wp02", beat: 27, lane: 0, prop: "cottage" },
    { id: "wp03", beat: 39, lane: 2, prop: "oak" },
    { id: "wp04", beat: 51, lane: 2, prop: "pond" },
    { id: "wp05", beat: 63, lane: 0, prop: "sheep" },
    { id: "wp06", beat: 75, lane: 2, prop: "fence" },
    { id: "wp07", beat: 87, lane: 1, prop: "haycart" },
    { id: "wp08", beat: 99, lane: 0, prop: "flowers" },
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
