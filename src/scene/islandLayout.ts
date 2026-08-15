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

export interface IslandDef {
  tiles: Tile[];
  radius: number;
  spots: Record<string, Spot>;
  palette: Record<TileKind, string>;
  waterLit: string; // the second tone water shimmers toward
}

// Build the shared plate outline, then paint it with the record's tile kinds.
// Anything not listed in `kinds` is grass.
function island(
  kinds: Record<string, TileKind>,
  spots: Record<string, Spot>,
  palette: Record<TileKind, string>,
  waterLit: string,
): IslandDef {
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
  return { tiles, radius, spots, palette, waterLit };
}

// ------------------------------------------------------------- the meadow --

// The long props — the wall and the cart — are turned to run tangentially:
// aimed any other way, a 0.39-long prop on a 0.92 island hangs its end out
// over the coast.
const MEADOW = island(
  {
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
  {
    mill: { q: 0, r: 0, dz: -0.02, rot: 24 },
    cottage: { q: -2, r: 1, dx: -0.02, dz: -0.03, rot: 58 },
    well: { q: 0, r: 2, dx: -0.03, dz: -0.05, rot: 15 },
    haycart: { q: -1, r: 2, dz: -0.02, rot: 60 },
    pond: { q: 2, r: -1, dx: 0.01, dz: 0.02, rot: -20 },
    sheep: { q: -1, r: -1, dx: -0.14, dz: -0.08, rot: 145 },
    fence: { q: -1, r: -1, dx: 0.01, dz: 0.01, rot: 150 },
    // out on the coast — the outer ring of tiles reads as bare plain unless
    // something stands on it, and it's the half nearest the camera
    oak: { q: -2, r: 3, dx: 0.02, dz: -0.02, rot: -60 },
    birch: { q: 2, r: -3, dx: -0.02, dz: 0.03, rot: 40 },
    flowers: { q: 2, r: 1, dx: -0.03, dz: -0.02, rot: 200 },
  },
  {
    grass: "#5f9c44",
    hill: "#6cab4f",
    path: "#b8925e",
    sand: "#d9c48d", // unused here — the meadow has no beach
    water: "#3f83bd",
  },
  "#6fb6e0",
);

// ------------------------------------------------------------ the harbour --

// A coast rather than a field. A bay bites into the east side, the beach that
// rings it carries the cargo, and the lighthouse takes the middle the way the
// windmill does on the meadow. The wild west shore is deliberately emptier —
// but not empty: the outer ring reads as bare plain unless something stands
// on it, so the palm, the rocks and the washed-up chest are all out there.
const HARBOUR = island(
  {
    // the rocky rise the lighthouse stands on
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
  {
    lighthouse: { q: 0, r: 0, dz: -0.01, rot: 0 },
    // The pier runs RADIALLY: it starts on the sand at (1,0) and reaches out
    // over the bay, which is what a jetty does. Its long axis is z in the
    // model, so 90° turns it to point along +x, straight out from the middle
    // of the island. It stands over the water on its posts, hence the lift off
    // the sunken water cap.
    dock: { q: 2, r: 0, dx: -0.04, dy: 0.03, rot: 90 },
    sailboat: { q: 3, r: -1, dx: 0.01, dz: 0.02, dy: 0.012, rot: 125 },
    boathouse: { q: 1, r: 1, dx: -0.02, dz: 0.02, rot: 200 },
    // Cargo shares a beach tile the way the meadow's sheep shares one with its
    // wall — one tile over from the pier head, because landing it on (1,0) put
    // it underneath the jetty's landward end.
    crate: { q: 1, r: -1, dx: -0.05, dz: 0.03, rot: 25 },
    barrel: { q: 1, r: -1, dx: 0.05, dz: -0.04, rot: -15 },
    anchor: { q: 2, r: -2, dz: 0.02, rot: 70 },
    // the wild shore, opposite the harbour
    palm: { q: -2, r: 3, dx: 0.02, dz: -0.03, rot: -40 },
    rocks: { q: -3, r: 1, dx: 0.03, dz: 0.01, rot: 130 },
    chest: { q: -2, r: -1, dx: -0.01, dz: 0.02, rot: 155 },
  },
  {
    grass: "#6b9b52", // coastal scrub — drier than the meadow's pasture
    // Warm dark rock, not grey. The lighthouse's own red and white are the
    // contrast here; a pale grey headland next to pale sand next to pale water
    // left the middle of the island with no colour in it at all.
    hill: "#6f6455",
    path: "#a8794a", // weathered boardwalk timber
    sand: "#d8bd7d",
    water: "#2f74b5", // open sea, deeper than the meadow's pond
  },
  // A tighter shimmer than the meadow's. The pond is two tiles and can afford
  // to sparkle; a five-tile bay swinging this far toward the light tone just
  // reads as washed out.
  "#4a93cc",
);

const ISLANDS: Record<string, IslandDef> = {
  meadow: MEADOW,
  harbour: HARBOUR,
};

export const islandFor = (recordId: string): IslandDef =>
  ISLANDS[recordId] ?? MEADOW;

export interface Placement {
  x: number;
  y: number;
  z: number;
  rot: number; // radians
}

// Falls back to the middle of the plate for a prop with no authored spot, so
// a record can ship a piece its island has never heard of without throwing.
export function placementFor(island: IslandDef, prop: string): Placement {
  const spot = island.spots[prop];
  if (!spot) return { x: 0, y: GRASS_Y, z: 0, rot: 0 };
  const [hx, hz] = hexToWorld(spot.q, spot.r);
  const tile = island.tiles.find((t) => t.q === spot.q && t.r === spot.r);
  return {
    x: hx + (spot.dx ?? 0),
    y: tileTop(tile?.kind ?? "grass") + (spot.dy ?? 0),
    z: hz + (spot.dz ?? 0),
    rot: ((spot.rot ?? 0) * Math.PI) / 180,
  };
}
