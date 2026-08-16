import { DISC_THICKNESS } from "../game/constants";

// The label's terrain (spec §8.4). The world used to be a flat green circle
// with props scattered on a golden-angle spiral — even spacing, but no
// arrangement, so it read as objects dropped on a sticker rather than a place.
//
// This is a hex-tile plate instead: pointy-top prisms with soil sides and a
// coloured cap, raised proud of the label paper so the world has an edge you
// can see. Tiles carry the composition — a rise under the tallest prop, water,
// a track — and every prop is hand-placed on a named tile.
//
// One island per record. The plate outline is shared (a radius-3 hexagon with
// its corners knocked off, which is what fits inside the label) but the tile
// kinds, the palette and the prop spots are the record's own.
//
// The whole thing rides inside the rotating disc group and turns once every
// 8 beats, so there is no front: each layout is balanced around the circle and
// the tallest piece anchors the middle.

const DISC_TOP = DISC_THICKNESS / 2;

export const HEX_R = 0.186; // circumradius of one tile
const SQRT3 = Math.sqrt(3);

// The plate: soil starts just above the label paper, grass tops out 0.054
// higher. That band is the visible edge — at the play camera's ~24° downward
// look it's about the thickness of a coaster.
export const ISLAND_BASE = DISC_TOP + 0.005;
export const GRASS_Y = DISC_TOP + 0.059;
export const CAP_H = 0.022; // the coloured lip sitting on the soil

export type TileKind = "grass" | "hill" | "path" | "water" | "sand";

export const TILE_LIFT: Record<TileKind, number> = {
  grass: 0,
  hill: 0.07,
  path: -0.005, // worn down a touch, so the path reads even in silhouette
  sand: -0.012, // the beach slopes into the water
  // as deep as the plate allows — any lower and the water cap sinks into the
  // label paper underneath it
  water: -0.03,
};

export const tileTop = (kind: TileKind) => GRASS_Y + TILE_LIFT[kind];

export const hexToWorld = (q: number, r: number): [number, number] => [
  HEX_R * SQRT3 * (q + r / 2),
  HEX_R * 1.5 * r,
];

// A hexagon of radius 3 with its six corners knocked off — 31 tiles, reaching
// 0.92 from the spindle, just inside the label's 1.2.
const RING = 3;
const CORNERS = new Set(["3,0", "0,3", "-3,3", "-3,0", "0,-3", "3,-3"]);

export interface Tile {
  q: number;
  r: number;
  kind: TileKind;
  x: number;
  z: number;
}

// Where each world piece lands, hand-placed so the island reads as one place
// rather than a scatter of models.
export interface Spot {
  q: number;
  r: number;
  dx?: number; // offset within the tile, world units
  dz?: number;
  dy?: number; // lift off the tile top — a pier standing over water
  rot?: number; // degrees
}

// Scenery: props the island puts down itself. Never collected, never in the
// chart, present from the first beat — and, unlike a Spot, repeatable. The
// same model can appear a dozen times.
//
// This is the difference between a world and a set of objects. Ten props on
// thirty-one tiles leaves two thirds of the island as bare coloured plastic,
// however good the ten are, and no amount of collecting fixes that because
// the count is fixed by the chart. Scenery is what fills the gaps in between,
// and it costs nothing to catch.
//
// A Spot is where a named thing goes; a SceneryDef is one instance of a thing
// there may be many of, so it carries its own scale — three tufts at 0.8,
// 1.0 and 1.3 read as three plants, where three at 1.0 read as one plant
// stamped three times.
export interface SceneryDef extends Spot {
  prop: string; // named node in the diorama GLB, same namespace as a Spot's key
  scale?: number; // multiplies the size authored in build-diorama.mjs
}

export interface IslandDef {
  tiles: Tile[];
  radius: number;
  spots: Record<string, Spot>;
  scenery: SceneryDef[];
  palette: Record<TileKind, string>;
  waterLit: string; // the second tone water shimmers toward
  // Tile kinds whose rim is lit, and in what colour. A thin additive band
  // around the top edge of every tile of that kind (Island.tsx) — which on
  // the city turns the street plan into a glowing grid, and is the closest
  // this gets to the wet, lit asphalt the whole look is built on. Undefined
  // on an island that doesn't want it, which is both of the outdoor ones.
  glow?: Partial<Record<TileKind, string>>;
}

// Build the shared plate outline, then paint it with the record's tile kinds.
// Anything not listed in `kinds` is grass.
//
// Named rather than positional: with scenery and glow both optional, the call
// sites were heading for `island(kinds, spots, palette, lit, undefined, [...])`.
function island({
  kinds,
  spots,
  scenery = [],
  palette,
  waterLit,
  glow,
}: {
  kinds: Record<string, TileKind>;
  spots: Record<string, Spot>;
  scenery?: SceneryDef[];
  palette: Record<TileKind, string>;
  waterLit: string;
  glow?: Partial<Record<TileKind, string>>;
}): IslandDef {
  const tiles: Tile[] = [];
  for (let q = -RING; q <= RING; q++) {
    for (let r = -RING; r <= RING; r++) {
      // axial hex distance: the third cube coordinate is -(q + r)
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) > RING) continue;
      const key = `${q},${r}`;
      if (CORNERS.has(key)) continue;
      const [x, z] = hexToWorld(q, r);
      tiles.push({ q, r, kind: kinds[key] ?? "grass", x, z });
    }
  }
  const radius = Math.max(...tiles.map((t) => Math.hypot(t.x, t.z))) + HEX_R;
  return { tiles, radius, spots, scenery, palette, waterLit, glow };
}

// ------------------------------------------------------------- the meadow --

// The long props — the wall and the cart — are turned to run tangentially:
// aimed any other way, a 0.39-long prop on a 0.92 island hangs its end out
// over the coast.
const MEADOW = island({
  kinds: {
    // the rise the windmill stands on, straddling the middle
    "0,0": "hill",
    "0,-1": "hill",
    "1,-1": "hill",
    // an enclosed pond, one tile in from the coast
    "2,-1": "water",
    "2,-2": "water",
    // a track curving up from the south shore, skirting the rise
    "-1,2": "path",
    "0,1": "path",
    "1,0": "path",
  },
  spots: {
    mill: { q: 0, r: 0, dz: -0.02, rot: 24 },
    cottage: { q: -2, r: 1, dx: -0.02, dz: -0.03, rot: 58 },
    well: { q: 0, r: 2, dx: -0.03, dz: -0.05, rot: 15 },
    // Beside the lane, at its landward end. Shrinking it to the pack's own
    // proportions stopped it being house-sized but left it inside the nearest
    // rail, because it had been placed to look right while it was 2.5× too
    // big — one 0.32 tile cannot hold a cart AND two fence sections, so the
    // fence run now starts one section further along.
    haycart: { q: -1, r: 2, dx: -0.06, dz: 0.02, rot: 60 },
    pond: { q: 2, r: -1, dx: 0.01, dz: 0.02, rot: -20 },
    sheep: { q: -1, r: -1, dx: -0.14, dz: -0.08, rot: 145 },
    fence: { q: -1, r: -1, dx: 0.01, dz: 0.01, rot: 150 },
    // out on the coast — the outer ring of tiles reads as bare plain unless
    // something stands on it, and it's the half nearest the camera
    oak: { q: -2, r: 3, dx: 0.02, dz: -0.02, rot: -60 },
    birch: { q: 2, r: -3, dx: -0.02, dz: 0.03, rot: 40 },
    // The pond's other building, facing its wheel at the water. It answers
    // the windmill across the island: two landmarks, both turning, one on the
    // rise and one down at the water.
    // -90, not 90. The wheel node sits on the model's -z face, and a y-rotation
    // of +90 maps -z to -x — which put the wheel on the landward side, turning
    // in a field. -90 maps it to +x, which is where the water is.
    watermill: { q: 1, r: -2, dx: 0.12, dz: 0.01, rot: -90 },
  },
  // Twenty-three of this island's thirty-one tiles are plain grass and nine
  // of them had anything on them, which is why a windmill village read as a
  // windmill on a lawn. Read roughly: the lane, the farmyard, the pond, then
  // the woods closing in from the far side.
  scenery: [
    // -- the track, fenced down one side --
    // Sections laid end to end along the lane the way the harbour lays its
    // jetty. All five hang off the path tiles they flank rather than their
    // own, so the run stays straight across a diagonal of hexes.
    { prop: "railing", q: -1, r: 2, dx: 0.19, dz: -0.02, rot: -30 },
    { prop: "railing", q: 0, r: 1, dx: -0.04, dz: -0.08, rot: -30 },
    { prop: "railing", q: 0, r: 1, dx: 0.1, dz: -0.01, rot: -30 },
    { prop: "railing", q: 1, r: 0, dx: -0.02, dz: -0.07, rot: -30 },
    { prop: "stone", q: 0, r: 1, dx: 0.06, dz: 0.08, rot: 40 },

    // -- the farmyard: the cottage's yard and the foot of the mill --
    { prop: "sack", q: -2, r: 1, dx: 0.08, dz: 0.06, rot: 25 },
    { prop: "sack", q: -2, r: 1, dx: 0.12, dz: 0.02, rot: -40, scale: 0.9 },
    { prop: "crate", q: -2, r: 1, dx: -0.06, dz: 0.09, rot: 60 },
    { prop: "barrel", q: -1, r: 1, dx: -0.05, dz: -0.05, rot: 0 },
    { prop: "barrel", q: -1, r: 1, dx: 0.01, dz: -0.08, rot: 35, scale: 0.85 },
    { prop: "lumber", q: -1, r: 0, dx: 0.04, dz: 0.05, rot: 110 },
    { prop: "crate", q: 0, r: -1, dx: 0.09, dz: 0.07, rot: -20, scale: 1.1 },
    { prop: "bucket", q: 0, r: 2, dx: 0.07, dz: 0.02, rot: 15 },
    { prop: "bucket", q: 0, r: 2, dx: -0.09, dz: -0.06, rot: -55, scale: 0.9 },

    // -- the pond: lilies and reeds around the one the player catches --
    { prop: "lily", q: 2, r: -1, dx: -0.07, dz: 0.07, rot: 40, scale: 0.85 },
    { prop: "lily", q: 2, r: -2, dx: 0.05, dz: -0.04, rot: 155 },
    { prop: "reed", q: 2, r: -2, dx: -0.09, dz: 0.06, rot: 20 },
    { prop: "reed", q: 2, r: -1, dx: 0.08, dz: -0.06, rot: 240, scale: 1.15 },

    // -- the woods, closing in from the west and south --
    { prop: "copse-l", q: -3, r: 2, dx: 0.02, dz: -0.02, rot: 25 },
    { prop: "copse-m", q: 3, r: -2, dx: -0.02, dz: 0.02, rot: 130 },
    { prop: "copse-m", q: -2, r: 2, dx: 0.03, dz: 0.02, rot: -50 },
    { prop: "copse-s", q: -1, r: 3, dx: -0.02, dz: -0.03, rot: 200 },
    { prop: "copse-s", q: -2, r: 0, dx: -0.05, dz: -0.02, rot: 75 },
    { prop: "copse-m", q: -1, r: -2, dx: 0.02, dz: 0.01, rot: 15 },
    { prop: "copse-s", q: 1, r: -3, dx: -0.03, dz: 0.02, rot: 160, scale: 0.9 },
    { prop: "copse-s", q: 1, r: 2, dx: 0.04, dz: -0.03, rot: -25, scale: 0.8 },
    // felled, beside the woodpile — the village is where the trees stop
    { prop: "stump", q: -2, r: 0, dx: 0.08, dz: 0.06, rot: 0 },
    { prop: "stump", q: -1, r: 0, dx: -0.03, dz: 0.02, rot: 45, scale: 0.85 },

    // -- rough ground on the edges --
    { prop: "boulder", q: 3, r: -1, dx: -0.04, dz: 0.03, rot: 60 },
    { prop: "boulder", q: -2, r: -1, dx: 0.05, dz: -0.05, rot: 145 },
    { prop: "stone", q: 0, r: -2, dx: -0.06, dz: 0.04, rot: 30 },
    { prop: "stone", q: 2, r: 0, dx: 0.03, dz: -0.06, rot: 190, scale: 1.2 },
    { prop: "boulder", q: -3, r: 1, dx: 0.09, dz: -0.07, rot: 100, scale: 0.8 },
    { prop: "stone", q: 2, r: 1, dx: -0.02, dz: 0.03, rot: 260 },
    { prop: "stump", q: 1, r: 1, dx: 0.06, dz: 0.04, rot: 120, scale: 0.9 },
  ],
  palette: {
    grass: "#5f9c44",
    hill: "#6cab4f",
    path: "#b8925e",
    sand: "#d9c48d", // unused here — the meadow has no beach
    water: "#3f83bd",
  },
  waterLit: "#6fb6e0",
});

// ------------------------------------------------------------ the harbour --

// A pirate cove. A bay bites into the east side, the beach that rings it
// carries the cargo, and a fort tower takes the middle the way the windmill
// does on the meadow — watching the one way in, which is what a tower on a
// harbour is for.
//
// Ten collected props on thirty-one tiles is not a place, so the `scenery`
// list below is roughly three times as many things again. None of them are
// catchable and none are in the chart: they're what the island looks like
// before you play a note, so the run fills in landmarks on a coast that
// already exists rather than assembling one out of nothing.
const HARBOUR = island({
  kinds: {
    // the rocky rise the tower stands on
    "0,0": "hill",
    "0,-1": "hill",
    // the bay, cutting in from the east coast
    "2,-1": "water",
    "2,0": "water",
    "2,1": "water",
    "3,-1": "water",
    "3,-2": "water",
    // beach ringing the bay
    "1,-1": "sand",
    "1,0": "sand",
    "1,1": "sand",
    "2,-2": "sand",
    // a boardwalk running from the far side of the island down to the water
    "-1,2": "path",
    "-1,1": "path",
    "0,1": "path",
  },
  spots: {
    watchtower: { q: 0, r: 0, dz: -0.01, rot: 18 },
    // The cannon shares the rise with the tower, turned out over the bay —
    // it's the reason the tower is there, so it shouldn't be somewhere else.
    cannon: { q: 0, r: -1, dx: 0.05, dz: 0.02, rot: 118 },
    // The pier HEAD — the seaward end, with two more sections behind it in
    // `scenery` running back to the beach. It sits ON the water, not beside
    // it: `sink` in build-diorama.mjs drives the pilings down through the
    // surface, so the deck lands at gunwale height instead of a
    // boat-and-a-half above it.
    dock: { q: 2, r: 0, dx: 0.03, rot: 90 },
    // Moored ALONGSIDE the jetty, not off the end of it. Crossing the pier at
    // an angle put a 0.32 hull through a 0.32 deck; a boat ties up parallel to
    // the thing it is tied to, which is also why the pier wants to be long and
    // narrow rather than one square platform.
    ship: { q: 2, r: -1, dx: 0.12, rot: 90 },
    // pushed inland off its tile, or it shoulders into the pier head and the
    // two of them read as one brown mass from the play camera
    hut: { q: 1, r: 1, dx: -0.09, dz: 0.06, rot: 200 },
    // Cargo shares a beach tile the way the meadow's sheep shares one with its
    // wall — one tile over from the pier head, because landing it on (1,0) put
    // it underneath the jetty's landward end.
    crate: { q: 1, r: -1, dx: -0.05, dz: 0.03, rot: 25 },
    barrel: { q: 1, r: -1, dx: 0.05, dz: -0.04, rot: -15 },
    // the wild shore, opposite the harbour
    palm: { q: -2, r: 3, dx: 0.02, dz: -0.03, rot: -40 },
    rocks: { q: -3, r: 1, dx: 0.03, dz: 0.01, rot: 130 },
    // dropped a hair into the pit that's been waiting for it all run
    chest: { q: -2, r: -1, dx: -0.01, dz: 0.02, dy: -0.006, rot: 155 },
  },
  // Read roughly outward: the rise, the working harbour, the beach, then the
  // wild shore. Rotations are arbitrary on purpose — a tuft repeated at the
  // same angle four times reads as a texture bug rather than as grass.
  scenery: [
    // -- the rise: a flag by the tower, and the rock it all stands on --
    { prop: "flag", q: 0, r: 0, dx: 0.08, dz: 0.06, rot: -25 },
    { prop: "rock-small", q: 0, r: 0, dx: -0.09, dz: 0.07, rot: 40 },
    {
      prop: "rock-small",
      q: 0,
      r: -1,
      dx: -0.07,
      dz: -0.05,
      rot: 200,
      scale: 1.3,
    },
    { prop: "tuft", q: 0, r: -1, dx: 0.02, dz: -0.09, rot: 75, scale: 0.9 },

    // -- the boardwalk down to the water, with two more of the shed --
    // The same model as the hut, smaller and turned: three sheds in a row is
    // a quay, where one shed on its own is a shack someone left behind. This
    // is the whole point of scenery being repeatable.
    { prop: "hut", q: -1, r: 1, dx: 0.06, dz: -0.04, rot: 12, scale: 0.72 },
    { prop: "hut", q: 0, r: 1, dx: 0.04, dz: -0.05, rot: -8, scale: 0.62 },
    { prop: "bottle", q: -1, r: 2, dx: -0.05, dz: 0.04, rot: 15 },
    { prop: "barrel", q: -1, r: 2, dx: 0.05, dz: -0.02, rot: 62, scale: 0.85 },

    // -- the rest of the jetty: two more sections back to the beach --
    // All three sections are authored against (2,0) and spaced by dx alone,
    // rather than each sitting on the tile it physically covers. That's on
    // purpose: placementForSpot takes its height from the tile it names, and
    // the sand tile the landward end reaches is 0.018 proud of the water, so
    // per-tile placement would build a jetty with a step in it. A walkway is
    // level. Sections are 0.2 long, so 0.2 apart is butted end to end.
    { prop: "dock", q: 2, r: 0, dx: -0.17, rot: 90 },
    { prop: "dock", q: 2, r: 0, dx: -0.37, rot: 90 },

    // -- the working beach: cargo spilling off the pier, a boat pulled up --
    { prop: "sand-patch", q: 1, r: 0, dz: 0.03, rot: 20 },
    { prop: "crate", q: 1, r: 1, dx: 0.06, dz: -0.05, rot: -40, scale: 0.85 },
    { prop: "crate", q: 1, r: 1, dx: 0.11, dz: -0.02, rot: 12, scale: 0.7 },
    { prop: "barrel", q: 1, r: 0, dx: -0.06, dz: -0.06, rot: 0, scale: 0.8 },
    { prop: "rowboat", q: 2, r: -2, dx: -0.02, dz: 0.05, rot: 145 },
    { prop: "rock-shore", q: 2, r: -2, dx: 0.06, dz: -0.05, rot: 70 },
    { prop: "bottle", q: 1, r: -1, dx: 0.09, dz: 0.06, rot: -30 },

    // -- the headland north of the bay --
    { prop: "rock-shore", q: 1, r: -2, dx: 0.04, dz: 0.02, rot: 15 },
    { prop: "rock-small", q: 2, r: -3, dx: -0.03, dz: 0.04, rot: 130 },
    { prop: "tuft", q: 1, r: -3, dx: 0.03, dz: -0.02, rot: 250 },
    { prop: "plant", q: 1, r: -2, dx: -0.07, dz: -0.06, rot: 95 },
    { prop: "scrub-patch", q: 0, r: -2, dx: 0.02, dz: 0.01, rot: 140 },
    { prop: "palm-small", q: 0, r: -2, dx: -0.06, dz: -0.06, rot: -15 },

    // -- the wild west shore: the palm's own grove, and scrub between --
    { prop: "palm-small", q: -1, r: 3, dx: 0.04, dz: -0.02, rot: 60 },
    {
      prop: "palm-small",
      q: -2,
      r: 3,
      dx: -0.08,
      dz: 0.05,
      rot: 210,
      scale: 0.8,
    },
    { prop: "scrub-patch", q: -2, r: 2, dx: -0.01, dz: 0.03, rot: 25 },
    { prop: "tuft", q: -2, r: 2, dx: 0.07, dz: -0.05, rot: 170, scale: 1.15 },
    { prop: "plant", q: -3, r: 2, dx: 0.02, dz: -0.04, rot: 300 },
    { prop: "rock-small", q: -3, r: 1, dx: -0.08, dz: -0.04, rot: 55 },
    { prop: "tuft", q: -2, r: 1, dx: 0.03, dz: 0.05, rot: 20 },
    { prop: "plant", q: -2, r: 0, dx: -0.05, dz: 0.02, rot: 240, scale: 1.2 },
    {
      prop: "rock-small",
      q: -1,
      r: 0,
      dx: 0.06,
      dz: -0.07,
      rot: 100,
      scale: 0.9,
    },
    { prop: "tuft", q: -1, r: -1, dx: -0.04, dz: 0.06, rot: 285 },
    { prop: "scrub-patch", q: -2, r: -1, dx: 0.06, dz: -0.04, rot: 65 },
    // the pit, dug and empty, exactly where hp07 lands
    { prop: "hole", q: -2, r: -1, dx: -0.01, dz: 0.02, rot: 20 },
    { prop: "tuft", q: -1, r: -2, dx: 0.01, dz: 0.03, rot: 130, scale: 0.85 },
    { prop: "plant", q: 0, r: 2, dx: 0.05, dz: -0.03, rot: 45 },
    { prop: "tuft", q: 1, r: 2, dx: -0.03, dz: -0.02, rot: 195, scale: 1.1 },
    {
      prop: "rock-small",
      q: -3,
      r: 2,
      dx: -0.07,
      dz: 0.05,
      rot: 15,
      scale: 0.75,
    },
  ],
  // Pulled toward the pack rather than chosen freely. Every prop standing on
  // these tiles is now drawn from Kenney's 512² colormap, and a scrub tuft
  // sampled at #61cb8b sitting on the old yellow-green #6b9b52 read as a
  // sticker on a lawn. The tile kinds keep their jobs; the hues move to the
  // atlas the things on top of them come from.
  palette: {
    grass: "#69ae7a", // coastal scrub, in the pack's green
    // Warm dark rock, not grey — a pale grey headland next to pale sand next
    // to pale water left the middle of the island with no colour in it at all,
    // and the tower on top of it is already the cool thing in the frame.
    hill: "#7a6a55",
    path: "#a8794a", // weathered boardwalk timber
    sand: "#e2c295", // the pack's sand, a shade under its own patches
    water: "#2f74b5", // open sea, deeper than the meadow's pond
  },
  // A tighter shimmer than the meadow's. The pond is two tiles and can afford
  // to sparkle; a five-tile bay swinging this far toward the light tone just
  // reads as washed out.
  waterLit: "#4a93cc",
});

// --------------------------------------------------------------- the city --

// A block, not a landscape — so the five tile kinds get read as city surfaces
// rather than terrain. The lifts happen to be exactly right for it:
//
//   grass → concrete pavement, the default surface     (lift  0)
//   path  → asphalt, sunk below the kerb               (lift -0.005)
//   sand  → a painted forecourt, lower again           (lift -0.012)
//   hill  → the podium the tower stands on             (lift +0.07)
//   water → a canal cutting in from the north edge     (lift -0.03)
//
// Adding city-only kinds would mean two more dead palette entries on every
// other island for one record's private need; the kinds are really just
// "terrain slot with a lift and a per-island colour", and this is what that
// abstraction is for.
//
// The streets are what compose this one. A main road runs clean across the
// island, with a branch north to the canal quay and an alley south — so from
// any angle the eye has a line to follow, which is the job the meadow's track
// and the harbour's coastline do.
const NEON = island({
  kinds: {
    // the podium, straddling the middle
    "0,0": "hill",
    "0,-1": "hill",
    // the main street, edge to edge
    "-3,1": "path",
    "-2,1": "path",
    "-1,1": "path",
    "0,1": "path",
    "1,1": "path",
    "2,1": "path",
    // north branch, running down to the water
    "1,0": "path",
    "1,-1": "path",
    // south alley
    "0,2": "path",
    "-1,3": "path",
    // the canal
    "1,-3": "water",
    "2,-3": "water",
    "1,-2": "water",
    // painted forecourt outside the food stall
    "-1,2": "sand",
    "-2,2": "sand",
  },
  spots: {
    tower: { q: 0, r: 0, dz: -0.01, rot: 18 },
    // the mid-rise sits back off the street with an alley between it and the
    // tower — buildings shoulder to shoulder on a 0.92 island just read as
    // one lump
    block: { q: -2, r: -1, dx: 0.02, dz: -0.02, rot: 96 },
    dumpster: { q: -2, r: 0, dx: 0.04, dz: -0.03, rot: 104 },
    // the sign takes the corner where the branch leaves the main street, so
    // it's lit from the busiest part of the plate
    neonsign: { q: 2, r: 0, dx: -0.03, dz: 0.02, rot: -34 },
    watertower: { q: 3, r: -2, dx: -0.02, dz: 0.02, rot: 25 },
    // Kerbside props are nudged toward the road they belong to rather than
    // centred on their tile — a street light standing in the middle of the
    // pavement reads as a lamp in a field.
    // the boom arm runs out along the model's +x, so it has to be turned
    // INWARD or it reaches out past the coast with nothing under it
    signal: { q: 1, r: 2, dx: 0.02, dz: -0.07, rot: 0 },
    hydrant: { q: -1, r: 0, dx: 0.03, dz: 0.06, rot: 40 },
    lamp: { q: -2, r: 3, dx: 0.06, dz: -0.05, rot: -20 },
    // the stall faces back across its forecourt toward the road
    stall: { q: -1, r: 2, dx: -0.01, dz: 0.04, rot: 195 },
    // the one prop actually standing on the asphalt, turned to run along the
    // street (the main road runs in +x, which is 90° from the model's length)
    taxi: { q: -1, r: 1, dx: 0.02, rot: 90 },
  },
  palette: {
    // Cool slate against the label's amber paper. The island is the dark
    // thing on this record — everything that reads is either lit (the sign)
    // or a bright kerbside prop, which is what a city at night actually
    // looks like from above.
    // The values are spread much wider than the other two islands need to be.
    // A meadow can carry a gentle green-on-green; a city is only legible as a
    // city if the STREETS read, and at 200px across on a turning disc that
    // takes a hard step between asphalt and kerb, not a shade.
    grass: "#79738c", // concrete pavement
    hill: "#8b839f", // the podium, catching more of the key light
    path: "#2b2833", // asphalt — the darkest thing on the plate
    sand: "#9a8a70", // forecourt, under a sodium light
    water: "#1a2c50", // the canal
  },
  // The canal shimmers violet rather than sky-blue: the only things lighting
  // it on this record are the sign and a dusk sky.
  waterLit: "#5b6fd8",
  // The street plan, lit. Magenta down every road and cyan around the canal
  // and the forecourt: the roads were already the thing carrying the
  // composition, and this is what makes them carry it at a glance.
  glow: { path: "#ff2d8e", water: "#2de0ff", sand: "#ffb43d" },
});

const ISLANDS: Record<string, IslandDef> = {
  meadow: MEADOW,
  harbour: HARBOUR,
  neon: NEON,
};

export const islandFor = (recordId: string): IslandDef =>
  ISLANDS[recordId] ?? MEADOW;

export interface Placement {
  x: number;
  y: number;
  z: number;
  rot: number; // radians
}

// Tile coordinates and offsets to a world position. Takes the Spot rather
// than a prop name because scenery has no name to look up: a SceneryDef IS a
// Spot with a model attached, and there may be twelve of them.
export function placementForSpot(island: IslandDef, spot: Spot): Placement {
  const [hx, hz] = hexToWorld(spot.q, spot.r);
  const tile = island.tiles.find((t) => t.q === spot.q && t.r === spot.r);
  return {
    x: hx + (spot.dx ?? 0),
    y: tileTop(tile?.kind ?? "grass") + (spot.dy ?? 0),
    z: hz + (spot.dz ?? 0),
    rot: ((spot.rot ?? 0) * Math.PI) / 180,
  };
}

// Falls back to the middle of the plate for a prop with no authored spot, so
// a record can ship a piece its island has never heard of without throwing.
export function placementFor(island: IslandDef, prop: string): Placement {
  const spot = island.spots[prop];
  if (!spot) return { x: 0, y: GRASS_Y, z: 0, rot: 0 };
  return placementForSpot(island, spot);
}
