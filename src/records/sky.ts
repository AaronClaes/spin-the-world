import type { RecordDef, SkyPalette } from "./types";

// The weather a record plays under.
//
// For two records this was a set of constants in Scene.tsx and SkyWorld.tsx,
// and that was right while every record was an outdoor daytime one. The city
// broke it: a neon sign is only neon after dark, and a night island under a
// cartoon blue sky reads as a model of a city rather than a city. So the sky
// became something a record can own.
//
// It's optional and it defaults to exactly the constants that shipped, so the
// meadow and the harbour render the same as they did before this existed.
//
// The studio wall is deliberately NOT part of this: the room the records hang
// in is the same room whichever one you pick, and it stays warm and lamp-lit.

export const DAYLIGHT: SkyPalette = {
  bg: "#a5d9f5",
  top: "#3f92d4", // straight up: the deep end
  mid: "#a8d8f2", // horizon haze
  low: "#5f9ecd", // far below: a real blue to sit the deck on
  cloud: "#ffffff", // a no-op tint — the cloud shapes carry their own shading
  key: "#fff2d0",
  fill: "#6a83c9",
  hemiSky: "#cde6f7",
  hemiGround: "#d9c49a",
  dim: 1,
};

export const skyFor = (record: RecordDef): SkyPalette => record.sky ?? DAYLIGHT;
