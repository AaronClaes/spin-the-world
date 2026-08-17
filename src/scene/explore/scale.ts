import {
  GRASS_Y,
  HEX_R,
  hexToWorld,
  type IslandDef,
  type Placement,
  type Spot,
  TILE_LIFT,
  type TileKind,
} from "../islandLayout";

// Explore mode walks the islands the game builds, at a size that has a person
// standing on them (spec §8.4 is authored for a 200px plate seen from above).
//
// Nothing about the worlds themselves changes here. Every prop keeps the size
// it was kitbashed at and every spot keeps its tile — the whole mode is one
// multiplier applied to the same IslandDef, so the islands cannot drift out of
// agreement with the diorama by being walked around in.
//
// SCALE is the only number worth tuning, and it is the only one that is
// visible: the runner is pinned at a fixed height in world units, so raising
// SCALE makes the player smaller and the island bigger in exactly one step.
//
// 16 puts the island at 29m across — a courtyard you cross in twelve seconds
// at a walk, five at a run — with tiles 5.2m wide and the tallest block 6.7m.
// Deliberately below life size: the taxi comes out 2.1m long and the street
// lights 2.2m, so the runner reads a little oversized against the world rather
// than lost in it. That's the model-village look, and it's the point — an
// island you can see all of while standing on it is a different thing from a
// city block, and the better thing for a record you finished.
export const DEFAULT_SCALE = 16;

// The runner GLB stands 2.28 units tall, and 1.8 world units is a person.
// Deliberately independent of SCALE: this is the ruler, not a thing measured.
const RUNNER_GLB_H = 2.28;
export const RUNNER_H = 1.8;
export const RUNNER_SCALE = RUNNER_H / RUNNER_GLB_H;

// Explore mode's own elevations. TILE_LIFT is a readability device — a hill
// stands 0.07 proud so the tallest prop reads as being on a rise from above —
// and at any scale that puts a person on the island it becomes a sheer hex
// cliff nothing can walk up (1.8m at SCALE 26). Compressed to a step here.
//
// Only the hill needs it. Everything else lands right at uniform scale: the
// path is a 13cm kerb, the beach a 31cm step down, the water a 78cm ledge you
// wade into. Squashing the whole plate to fix one tile kind would have
// flattened three transitions that are already correct.
export const EXPLORE_LIFT: Record<TileKind, number> = {
  ...TILE_LIFT,
  hill: 0.02,
};

export const exploreTop = (kind: TileKind): number =>
  GRASS_Y + EXPLORE_LIFT[kind];

// placementForSpot's twin, on explore elevations. A separate function rather
// than a parameter on the original because the diorama's placement is on the
// hot path of three components and has a test suite pinned to it.
export function explorePlacement(island: IslandDef, spot: Spot): Placement {
  const [hx, hz] = hexToWorld(spot.q, spot.r);
  const tile = island.tiles.find((t) => t.q === spot.q && t.r === spot.r);
  return {
    x: hx + (spot.dx ?? 0),
    y: exploreTop(tile?.kind ?? "grass") + (spot.dy ?? 0),
    z: hz + (spot.dz ?? 0),
    rot: ((spot.rot ?? 0) * Math.PI) / 180,
  };
}

// Somewhere to arrive that isn't inside a building. Every tile that carries a
// world piece or a piece of scenery is occupied, so the spawn is the tile
// furthest from the middle that has nothing on it at all — the outer ring is
// where the empty tiles are, and arriving at the coast means the island is in
// front of you rather than around you.
export function spawnTile(island: IslandDef): { x: number; y: number; z: number } {
  const taken = new Set<string>();
  for (const spot of Object.values(island.spots)) taken.add(`${spot.q},${spot.r}`);
  for (const def of island.scenery) taken.add(`${def.q},${def.r}`);

  const free = island.tiles.filter(
    (t) => t.kind !== "water" && !taken.has(`${t.q},${t.r}`),
  );
  const pick =
    free.sort((a, b) => Math.hypot(b.x, b.z) - Math.hypot(a.x, a.z))[0] ??
    island.tiles[0];
  return { x: pick.x, y: exploreTop(pick.kind), z: pick.z };
}

// Which axial neighbour sits across each of a tile's six edges, in the order
// three.js walks the hexagon: edge i spans vertex i to vertex i+1, and vertex i
// is at (sin(i·60°), cos(i·60°))·HEX_R. Derived rather than guessed — every one
// of these was checked against hexToWorld's own offsets.
export const EDGE_NEIGHBOUR: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
];

// Side of a regular hexagon equals its circumradius, so an edge wall is HEX_R
// long and stands at the apothem.
const APOTHEM = (Math.sqrt(3) / 2) * HEX_R;

export interface EdgeWall {
  key: string;
  position: [number, number, number];
  rotation: [number, number, number];
  args: [number, number, number];
}

// The coast, as something you cannot step off.
//
// The first cut of this fenced the rim of the LABEL instead, which worked and
// was wrong twice over. It let you walk off the island onto the label paper —
// a 0.86m drop that takes a jump to climb back out of, so the apron was a trap
// you had to guess your way out of — and it made the widest surface in the
// frame a featureless orange plain, which is the worst thing on the record to
// be standing on.
//
// Walling the outer EDGES instead means the island has no exit at all: no drop
// to fall down, no apron to cross, and the record underneath goes back to being
// the thing it reads best as, which is scenery. An edge is outer when the tile
// across it doesn't exist, so the wall follows the hexagon-minus-corners
// outline exactly, notches included.
export function coastWalls(
  tiles: ReadonlyArray<{ q: number; r: number; kind: TileKind; x: number; z: number }>,
  scale: number,
  height: number,
): EdgeWall[] {
  const present = new Set(tiles.map((t) => `${t.q},${t.r}`));
  const walls: EdgeWall[] = [];
  for (const t of tiles) {
    EDGE_NEIGHBOUR.forEach(([dq, dr], i) => {
      if (present.has(`${t.q + dq},${t.r + dr}`)) return;
      // Outward normal of edge i, and the rotation that aims a box's local +z
      // along it: rotation-y by φ maps +z to (sin φ, cos φ).
      const phi = (i + 0.5) * (Math.PI / 3);
      walls.push({
        key: `${t.q},${t.r}:${i}`,
        position: [
          (t.x + Math.sin(phi) * APOTHEM) * scale,
          exploreTop(t.kind) * scale + height / 2,
          (t.z + Math.cos(phi) * APOTHEM) * scale,
        ],
        rotation: [0, phi, 0],
        // A hair over half a side, so two walls meeting in a notch's inside
        // corner overlap instead of leaving a gap to squeeze through.
        args: [(HEX_R * scale) / 2 + 0.05, height / 2, 0.1],
      });
    });
  }
  return walls;
}

// The six corners of a tile, top and bottom, as a flat vertex list for a
// convex hull collider. Matches three.js CylinderGeometry's winding exactly —
// it starts a radial segment on +z and steps toward +x — so the collider is
// the same hexagon the plate draws, not an inscribed or circumscribed guess at
// it. A cylinder would leave a bump at every tile seam or a gap at every
// corner; the hull is exact.
export function hexPrism(r: number, y0: number, y1: number): Float32Array {
  const v: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    v.push(x, y0, z, x, y1, z);
  }
  return new Float32Array(v);
}
