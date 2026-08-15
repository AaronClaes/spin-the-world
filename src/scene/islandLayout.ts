import { DISC_THICKNESS } from "../game/constants";

// The label's terrain (spec §8.4). The world used to be a flat green circle
// with props scattered on a golden-angle spiral — even spacing, but no
// arrangement, so it read as objects dropped on a sticker rather than a place.
//
// This is a hex-tile plate instead: pointy-top prisms with soil sides and a
// coloured cap, raised proud of the label paper so the world has an edge you
// can see. Tiles carry the composition — a rise under the mill, a sunken pond,
// a dirt path — and every prop is hand-placed on a named tile.
//
// The whole thing rides inside the rotating disc group and turns once every
// 8 beats, so there is no front: the layout is balanced around the circle and
// the tallest piece (the mill) anchors the middle.

const DISC_TOP = DISC_THICKNESS / 2;

export const HEX_R = 0.186; // circumradius of one tile
const SQRT3 = Math.sqrt(3);

// The plate: soil starts just above the label paper, grass tops out 0.054
// higher. That band is the visible edge — at the play camera's ~24° downward
// look it's about the thickness of a coaster.
export const ISLAND_BASE = DISC_TOP + 0.005;
export const GRASS_Y = DISC_TOP + 0.059;
export const CAP_H = 0.022; // the coloured lip sitting on the soil

export type TileKind = "grass" | "hill" | "path" | "water";

export const TILE_LIFT: Record<TileKind, number> = {
  grass: 0,
  hill: 0.07,
  path: -0.005, // worn down a touch, so the path reads even in silhouette
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
// 1.045 from the spindle, just inside the label's 1.2.
const RING = 3;
const CORNERS = new Set(["3,0", "0,3", "-3,3", "-3,0", "0,-3", "3,-3"]);

// The composition, in axial coordinates. Everything not listed is grass.
const KINDS: Record<string, TileKind> = {
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
};

export interface Tile {
  q: number;
  r: number;
  kind: TileKind;
  x: number;
  z: number;
}

export const TILES: Tile[] = (() => {
  const out: Tile[] = [];
  for (let q = -RING; q <= RING; q++) {
    for (let r = -RING; r <= RING; r++) {
      // axial hex distance: the third cube coordinate is -(q + r)
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) > RING) continue;
      const key = `${q},${r}`;
      if (CORNERS.has(key)) continue;
      const [x, z] = hexToWorld(q, r);
      out.push({ q, r, kind: KINDS[key] ?? "grass", x, z });
    }
  }
  return out;
})();

export const ISLAND_RADIUS =
  Math.max(...TILES.map((t) => Math.hypot(t.x, t.z))) + HEX_R;

const kindAt = (q: number, r: number): TileKind =>
  KINDS[`${q},${r}`] ?? "grass";

// ------------------------------------------------------------- prop spots --

// Where each world piece lands. Hand-placed so the village reads as one
// settlement: cottage and well face the track, the sheep has a paddock behind
// its wall, the lily sits on open water, and the two trees flank the mill from
// opposite sides so the silhouette stays balanced as the record turns.
export interface Spot {
  q: number;
  r: number;
  dx?: number; // offset within the tile, world units
  dz?: number;
  rot?: number; // degrees
}

// The long props — the wall and the cart — are turned to run tangentially:
// aimed any other way, a 0.39-long prop on a 0.92 island hangs its end out
// over the coast.
export const SPOTS: Record<string, Spot> = {
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
};

export interface Placement {
  x: number;
  y: number;
  z: number;
  rot: number; // radians
}

// Falls back to the disc centre for a prop with no authored spot — a second
// record can ship props this island has never heard of.
export function placementFor(prop: string): Placement {
  const spot = SPOTS[prop];
  if (!spot) return { x: 0, y: GRASS_Y, z: 0, rot: 0 };
  const [hx, hz] = hexToWorld(spot.q, spot.r);
  return {
    x: hx + (spot.dx ?? 0),
    y: tileTop(kindAt(spot.q, spot.r)),
    z: hz + (spot.dz ?? 0),
    rot: ((spot.rot ?? 0) * Math.PI) / 180,
  };
}
