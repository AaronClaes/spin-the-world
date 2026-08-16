import { describe, expect, it } from "vitest";
import { RECORDS } from "../records";
import { islandFor } from "./islandLayout";

// Authoring guards. A hand-placed layout has no compiler behind it: `q: 3,
// r: 0` is a knocked-off corner and `q: 4` is off the plate entirely, and
// neither throws — placementForSpot just can't find the tile, falls back to
// grass height, and the prop stands in mid-air off the coast where nobody
// looking at the code will notice. These are cheap and they catch typos the
// moment they're made rather than four screenshots later.

describe("island layouts", () => {
  for (const record of RECORDS) {
    const island = islandFor(record.id);
    const onPlate = new Set(island.tiles.map((t) => `${t.q},${t.r}`));

    describe(record.id, () => {
      it("puts every world piece on a tile of its own island", () => {
        for (const piece of record.worldPieces) {
          const spot = island.spots[piece.prop];
          expect(spot, `${piece.prop} has no authored spot`).toBeDefined();
          expect(
            onPlate.has(`${spot.q},${spot.r}`),
            `${piece.prop} sits at ${spot.q},${spot.r}, which is not a tile`,
          ).toBe(true);
        }
      });

      it("puts every scenery instance on a tile", () => {
        island.scenery.forEach((def, i) => {
          expect(
            onPlate.has(`${def.q},${def.r}`),
            `scenery[${i}] ${def.prop} sits at ${def.q},${def.r}, which is not a tile`,
          ).toBe(true);
        });
      });

      // Scenery may reuse a world piece's model — the harbour's quay is three
      // of the same shed — so this checks the model is one the record's GLB
      // will actually contain, not that the two lists are disjoint.
      it("only places scenery whose model the record knows about", () => {
        const known = new Set([
          ...Object.keys(island.spots),
          ...island.scenery.map((d) => d.prop),
        ]);
        for (const def of island.scenery) {
          expect(known.has(def.prop)).toBe(true);
        }
      });

      it("keeps every authored spot inside the label", () => {
        // the plate reaches ~0.92 and the label is 1.2; a prop nudged past the
        // coast by a fat dx would hang over bare vinyl
        for (const [prop, spot] of Object.entries(island.spots)) {
          const off = Math.hypot(spot.dx ?? 0, spot.dz ?? 0);
          expect(
            off,
            `${prop} is nudged ${off.toFixed(2)} off its tile`,
          ).toBeLessThan(0.2);
        }
      });
    });
  }
});
