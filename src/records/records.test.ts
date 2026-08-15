import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BEATS_PER_REV } from "../game/constants";
import { buildRunItems, validateRecord } from "../game/items";
import { songFor } from "../music";
import { islandFor } from "../scene/islandLayout";
import { DRESSING } from "../scene/neonDressing";
import { PROC_PROPS } from "../scene/procProps";
import { DEFAULT_RECORD, RECORDS, recordById } from ".";

// Root node names in a .glb, read straight out of the embedded JSON chunk.
// Pulling in a GLTF parser for this would be overkill: the header is 12 bytes
// and the first chunk is the JSON.
function glbRootNames(url: string): string[] {
  const buf = readFileSync(`public${url}`);
  const jsonLength = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.subarray(20, 20 + jsonLength).toString("utf8"));
  const scene = gltf.scenes[gltf.scene ?? 0];
  return scene.nodes.map((i: number) => gltf.nodes[i].name);
}

// Whole-shelf invariants. The per-chart rules live in items.test.ts; this is
// the net that catches a newly pressed record that was never wired up, or one
// whose conventions drifted from the rest of the shelf.

describe("the shelf", () => {
  it("has unique record ids", () => {
    const ids = RECORDS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("resolves ids, and falls back to the default record for an unknown one", () => {
    for (const record of RECORDS) expect(recordById(record.id)).toBe(record);
    expect(recordById("no-such-record")).toBe(DEFAULT_RECORD);
  });

  // The wall hangs RECORDS in array order and prints each record's own badge
  // under it, so the two can disagree silently: re-hang the row and the
  // badges read easy, hard, medium. They're one promise made twice.
  it("hangs left to right in ascending difficulty", () => {
    expect(RECORDS.map((r) => r.difficulty)).toEqual([
      "easy",
      "medium",
      "hard",
    ]);
    // and the badge has to be honest about the thing the player will feel
    // first — how fast the floor is moving under them
    const bpms = RECORDS.map((r) => r.bpm);
    expect(bpms).toEqual([...bpms].sort((a, b) => a - b));
  });

  it.each(RECORDS.map((r) => [r.id, r] as const))(
    "%s passes chart validation",
    (_id, record) => {
      expect(() => validateRecord(record)).not.toThrow();
    },
  );

  it.each(RECORDS.map((r) => [r.id, r] as const))(
    "%s has an arrangement whose voicing covers the SFX",
    (_id, record) => {
      const song = songFor(record.id);
      expect(song.mixDb).toHaveLength(record.stems.length);
      expect(song.verbSendDb).toHaveLength(record.stems.length);
      // the pickup ladder is indexed by combo, so an empty one would divide
      // by zero in sfxNotePickup
      expect(song.voicing.pickupRun.length).toBeGreaterThan(1);
      expect(song.voicing.pieceChime).toHaveLength(3);
    },
  );

  it.each(RECORDS.map((r) => [r.id, r] as const))(
    "%s keeps every world piece recoverable at least once",
    (_id, record) => {
      // a piece charted inside the last revolution can be missed exactly once
      // and then it is lost for good — fine at the very end of the track, but
      // it should never be the case for a piece in the body of the record
      for (const piece of record.worldPieces.slice(0, -1)) {
        expect(piece.beat + BEATS_PER_REV).toBeLessThanOrEqual(
          record.totalBeats,
        );
      }
    },
  );

  // The failure this catches is silent and total: usePropClone throws inside
  // the Canvas, React swallows the stack, and the whole scene goes black.
  it.each(RECORDS.map((r) => [r.id, r] as const))(
    "%s can build every prop it charts",
    (_id, record) => {
      const available = new Set([
        ...glbRootNames(record.dioramaModel),
        ...Object.keys(PROC_PROPS),
      ]);
      for (const piece of record.worldPieces)
        expect({ piece: piece.id, prop: piece.prop }).toEqual({
          piece: piece.id,
          prop: available.has(piece.prop) ? piece.prop : `MISSING`,
        });
    },
  );

  it.each(RECORDS.map((r) => [r.id, r] as const))(
    "%s has an authored island spot for every prop",
    (_id, record) => {
      const island = islandFor(record.id);
      // placementFor falls back to the middle of the plate, so a typo here
      // stacks props on the spindle rather than throwing
      const props = record.worldPieces.map((p) => p.prop).sort();
      expect(Object.keys(island.spots).sort()).toEqual(props);
    },
  );

  // The neon dressing registry is keyed by prop name alone, so a future
  // record shipping a prop called "lamp" or "block" would silently have its
  // materials swapped for glowing ones.
  it("only lights props that belong to the neon record", () => {
    for (const record of RECORDS) {
      if (record.id === "neon") continue;
      for (const piece of record.worldPieces)
        expect({ record: record.id, prop: piece.prop, dressed: false }).toEqual(
          {
            record: record.id,
            prop: piece.prop,
            dressed: piece.prop in DRESSING,
          },
        );
    }
  });

  it.each(RECORDS.map((r) => [r.id, r] as const))(
    "%s deals a playable set of items",
    (_id, record) => {
      const items = buildRunItems(record);
      const notes = items.filter((i) => i.kind === "note");
      const pieces = items.filter((i) => i.kind === "piece");
      expect(pieces).toHaveLength(record.worldPieces.length);
      expect(notes.length).toBeGreaterThan(60);
      expect(notes.length).toBeLessThan(200);
      // sorted by beat — the resolve loop walks this with a single pointer
      for (let i = 1; i < items.length; i++)
        expect(items[i].beat).toBeGreaterThanOrEqual(items[i - 1].beat);
    },
  );
});
