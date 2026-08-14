import { Color } from "three";

// Collectible notes come in a handful of fun vibrant colours instead of one
// uniform accent — candy pastels that sit together at similar luminance, so
// no colour reads as "worth more" than another. The meadow's original accent
// gold leads the set.
export const NOTE_PALETTE = [
  "#ffd27a", // sun gold (the original accent)
  "#ff8fb3", // bubblegum pink
  "#8ee08f", // spring green
  "#7cc9ff", // sky blue
  "#c9a2ff", // lavender
  "#5fded2", // aqua
];

const paletteColors = NOTE_PALETTE.map((c) => new Color(c));

// Deterministic deal, keyed on the note's chart position — no Math.random,
// so every load and replay colours the chart identically, and the catch pop
// (NotePop) can re-derive the same colour from the caught item.
// Returns a shared Color instance: copy it, never mutate it.
export function noteColor(beat: number, lane: number): Color {
  const x = Math.sin(beat * 91.17 + lane * 41.3) * 43758.5453;
  const f = x - Math.floor(x);
  return paletteColors[Math.floor(f * paletteColors.length)];
}
