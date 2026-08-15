import type { RecordDef } from "./types";

// The second pressing. Same chart conventions as Meadow — pieces on step 6 of
// their bar (beat ≡ 3 mod 4), every note pattern leaving step 6 empty in all
// lanes, one piece per beat — but slower: 100bpm is 12.5 RPM against Meadow's
// 15, which is a calmer record to stand on as well as a calmer tune. The name
// is the speed: the 45 is the single, this is the LP.
export const harbour: RecordDef = {
  id: "harbour",
  title: "Harbour 33",
  genre: "sea shanty",
  bpm: 100,
  totalBeats: 160, // 40 bars, 20 revolutions, 96s at 100bpm
  // identical band to Meadow: the disc geometry is shared and these radii were
  // tuned against it (spec risk table), so a second record has no business
  // moving them
  band: { startRadius: 4.4, endRadius: 2.0, laneGap: 0.55 },

  stems: ["drums", "bass", "concertina", "whistle"],
  stemUnlockAtPieces: [0, 2, 5, 8],
  starThresholds: [0.6, 1],

  worldPieces: [
    { id: "hp01", beat: 15, lane: 1, prop: "lighthouse" },
    { id: "hp02", beat: 27, lane: 2, prop: "boathouse" },
    { id: "hp03", beat: 39, lane: 0, prop: "dock" },
    { id: "hp04", beat: 51, lane: 1, prop: "sailboat" },
    { id: "hp05", beat: 63, lane: 2, prop: "crate" },
    { id: "hp06", beat: 75, lane: 0, prop: "barrel" },
    { id: "hp07", beat: 87, lane: 2, prop: "chest" },
    { id: "hp08", beat: 99, lane: 1, prop: "rocks" },
    // the last two open up — the needle is deep into the label by here and the
    // spacing wants to breathe rather than sprint to the finish
    { id: "hp09", beat: 119, lane: 0, prop: "palm" },
    { id: "hp10", beat: 139, lane: 1, prop: "anchor" },
  ],

  // 8 steps per bar (eighths), lane 0 first. Step 6 stays empty everywhere —
  // that's the world-piece slot. The arc thickens through the middle and
  // thins out under the last two pieces.
  // NOTE: the rows fix the RHYTHM only — lanes are re-dealt at load by the
  // seeded scatter (items.ts), so which row an x sits in doesn't matter.
  notePatterns: [
    { fromBar: 0, toBar: 2, lanes: ["--------", "----x---", "--------"] },
    { fromBar: 2, toBar: 12, lanes: ["x-------", "--------", "----x---"] },
    { fromBar: 12, toBar: 24, lanes: ["x---x---", "--x-----", "--------"] },
    // the heave: an off-beat on the and-of-4 pulling into the next bar
    { fromBar: 24, toBar: 34, lanes: ["x---x---", "-x-----x", "--------"] },
    { fromBar: 34, toBar: 40, lanes: ["----x---", "x-------", "--------"] },
  ],

  dioramaModel: "/models/harbour-diorama.glb",

  accentColor: "#5fd8e8", // lighthouse-beam cyan — reads on near-black vinyl
};
