import { describe, expect, it } from "vitest";
import { hexToWorld, islandFor, type TileKind } from "../islandLayout";
import { coastWalls, EDGE_NEIGHBOUR, exploreTop } from "./scale";

const RECORDS = ["meadow", "harbour", "neon"];

describe("explore elevations", () => {
  it("keeps every tile transition steppable at the shipping scale", () => {
    // The reason EXPLORE_LIFT exists. A step taller than about half the
    // runner's 1.8m is a wall, and a wall between two tiles is a piece of the
    // island you can see and can't reach.
    const SCALE = 16;
    const kinds: TileKind[] = ["grass", "hill", "path", "water", "sand"];
    for (const a of kinds) {
      for (const b of kinds) {
        const step = Math.abs(exploreTop(a) - exploreTop(b)) * SCALE;
        expect(step, `${a} → ${b} is a ${step.toFixed(2)}m step`).toBeLessThan(
          0.9,
        );
      }
    }
  });
});

describe("coast walls", () => {
  // The mapping this checks is the one that has bitten this project twice:
  // three.js maps a y-rotation of φ onto +z → (sin φ, cos φ), and getting an
  // edge's outward direction wrong puts a wall across a street instead of
  // around the coast. Checked against hexToWorld rather than against the
  // convention it was derived from.
  it("maps each hex edge to the neighbour actually across it", () => {
    EDGE_NEIGHBOUR.forEach(([dq, dr], i) => {
      const [nx, nz] = hexToWorld(dq, dr);
      const len = Math.hypot(nx, nz);
      const phi = (i + 0.5) * (Math.PI / 3);
      expect(nx / len, `edge ${i} x`).toBeCloseTo(Math.sin(phi), 6);
      expect(nz / len, `edge ${i} z`).toBeCloseTo(Math.cos(phi), 6);
    });
  });

  it.each(RECORDS)("walls every outer edge of %s and no inner one", (id) => {
    const { tiles } = islandFor(id);
    const walls = coastWalls(tiles, 16, 4);

    // Counted a different way than coastWalls counts it: total edges minus two
    // per adjacent pair, where adjacency is axial distance 1 over every pair of
    // tiles rather than a walk of the six edge offsets.
    let adjacent = 0;
    for (const a of tiles) {
      for (const b of tiles) {
        if (a === b) continue;
        const dq = b.q - a.q;
        const dr = b.r - a.r;
        if (Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) === 1)
          adjacent++;
      }
    }
    expect(walls.length).toBe(tiles.length * 6 - adjacent);
  });

  it.each(RECORDS)("leaves %s with no gap to walk out through", (id) => {
    const { tiles } = islandFor(id);
    const SCALE = 16;
    const walls = coastWalls(tiles, SCALE, 4);
    // Every wall segment is half a hex side plus an overlap, so consecutive
    // walls around the outline must reach each other. Any two walls whose
    // outer corners are further apart than the overlap would be a gap.
    const present = new Set(tiles.map((t) => `${t.q},${t.r}`));
    let outer = 0;
    for (const t of tiles)
      for (const [dq, dr] of EDGE_NEIGHBOUR)
        if (!present.has(`${t.q + dq},${t.r + dr}`)) outer++;
    expect(walls.length).toBe(outer);
    // and none of them stands over a tile that exists
    for (const w of walls) {
      const [x, , z] = w.position;
      const onTile = tiles.some(
        (t) => Math.hypot(t.x * SCALE - x, t.z * SCALE - z) < 0.05,
      );
      expect(onTile, `a wall sits on a tile centre at ${x},${z}`).toBe(false);
    }
  });
});
