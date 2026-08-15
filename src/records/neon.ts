import type { RecordDef } from "./types";

// The third pressing, and the fast one. Same chart conventions as the other
// two — pieces on step 6 of their bar (beat ≡ 3 mod 4), every note pattern
// leaving step 6 empty in all lanes — but 140bpm is 17.5 RPM, so the disc is
// genuinely moving under you. The names are the speeds: the 45 is the single,
// the 33 is the LP, and this is the shellac 78.
//
// It's also the hard record on the shelf, in two ways that stack:
//   - notes are denser (168 over 48 bars against Harbour's 110 over 40, at
//     40% more tempo), so the lane you're standing in is wrong more often
//   - the stems unlock later, [0, 3, 6, 9] against the other records'
//     [0, 2, 5, 8]. The lead only arrives on the ninth piece, so hearing the
//     full band at all is the reward for a run that's nearly clean.
export const neon: RecordDef = {
  id: "neon",
  title: "Neon 78",
  genre: "city pop",
  bpm: 140,
  totalBeats: 192, // 48 bars, 24 revolutions, 82s at 140bpm
  // identical band to the other two: the disc geometry is shared and these
  // radii were tuned against it (spec risk table)
  band: { startRadius: 4.4, endRadius: 2.0, laneGap: 0.55 },

  stems: ["drums", "bass", "keys", "lead"],
  stemUnlockAtPieces: [0, 3, 6, 9],
  // 2nd star pulled up from the shelf's 0.6 — on the fast record a 60% run is
  // a stroll, and the star should mean something different here
  starThresholds: [0.65, 1],

  worldPieces: [
    { id: "np01", beat: 19, lane: 1, prop: "tower" },
    { id: "np02", beat: 35, lane: 0, prop: "block" },
    { id: "np03", beat: 51, lane: 2, prop: "neonsign" },
    { id: "np04", beat: 67, lane: 1, prop: "stall" },
    { id: "np05", beat: 83, lane: 0, prop: "lamp" },
    { id: "np06", beat: 99, lane: 2, prop: "signal" },
    { id: "np07", beat: 115, lane: 1, prop: "taxi" },
    { id: "np08", beat: 135, lane: 2, prop: "watertower" },
    { id: "np09", beat: 155, lane: 0, prop: "hydrant" },
    // pulled in off the run-out so even the last piece survives one miss —
    // 179 + 8 is still inside the track
    { id: "np10", beat: 179, lane: 1, prop: "dumpster" },
  ],

  // 8 steps per bar (eighths), lane 0 first. Step 6 stays empty everywhere —
  // that's the world-piece slot.
  // NOTE: the rows fix the RHYTHM only — lanes are re-dealt at load by the
  // seeded scatter (items.ts), so which row an x sits in doesn't matter.
  notePatterns: [
    { fromBar: 0, toBar: 4, lanes: ["x-------", "----x---", "--------"] },
    { fromBar: 4, toBar: 16, lanes: ["x---x---", "--x-----", "--------"] },
    { fromBar: 16, toBar: 28, lanes: ["x--x----", "----x---", "-------x"] },
    // the peak: five a bar, with the syncopated pair either side of the
    // piece slot doing most of the lane-switching
    { fromBar: 28, toBar: 40, lanes: ["x--x-x--", "-x------", "-------x"] },
    { fromBar: 40, toBar: 48, lanes: ["----x---", "x-------", "--------"] },
  ],

  dioramaModel: "/models/neon-diorama.glb",

  // The first record to bring its own weather. A neon sign is only neon after
  // dark, and under the shelf's cartoon-blue daylight this island read as a
  // scale model of a city rather than a city — the lit windows and the sign
  // had nothing to be brighter than. Dusk, then: a violet horizon, a cool
  // moon key, and a magenta bounce off the buildings standing in for the
  // street glow the record can't afford to light for real.
  sky: {
    bg: "#2a1c46",
    top: "#100a22",
    mid: "#4a2a63",
    low: "#1d1233",
    cloud: "#b98ac9", // the whole cloud field goes violet through one multiply
    key: "#a9b8ff",
    fill: "#ff6fb0",
    hemiSky: "#6a52a0",
    hemiGround: "#2e2440",
    // not a blackout — the props still have to read at 60px. Enough to stop
    // the concrete blowing out, which is all the neon needs to win.
    dim: 0.72,
  },

  accentColor: "#ff4d9d", // sign magenta — the brightest thing on the island
};
