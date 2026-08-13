import { describe, expect, it } from "vitest";
import { BEATS_PER_REV, RAD_PER_BEAT } from "./constants";
import {
  bandCenter,
  discRotation,
  itemLocalAngle,
  itemRadius,
  laneRadius,
  worldAngle,
} from "./geometry";

const TWO_PI = Math.PI * 2;

describe("beat ↔ angle identities", () => {
  it("one revolution is exactly BEATS_PER_REV beats", () => {
    expect(BEATS_PER_REV * RAD_PER_BEAT).toBeCloseTo(TWO_PI, 12);
  });

  it("an item authored at beat N is at the player when beatPos === N", () => {
    for (const beat of [0, 1, 7, 8, 14.5, 100.25, 176]) {
      expect(worldAngle(beat, beat)).toBe(0);
    }
  });

  it("items recur every revolution: beat N and N + BEATS_PER_REV share an angle", () => {
    for (const beat of [0, 3, 5.5]) {
      const a = itemLocalAngle(beat);
      const b = itemLocalAngle(beat + BEATS_PER_REV);
      // circular distance: 0 and 2π are the same angle
      const raw = (((b - a) % TWO_PI) + TWO_PI) % TWO_PI;
      const diff = Math.min(raw, TWO_PI - raw);
      expect(diff).toBeCloseTo(0, 12);
    }
  });

  it("disc rotation cancels authored angle at arrival", () => {
    // world angle = local angle + disc rotation, for any beat/beatPos pair
    for (const beat of [2, 9, 33.5]) {
      for (const beatPos of [0, 2, 8.75, 33.5]) {
        const viaIdentity = worldAngle(beat, beatPos);
        const viaComposition = beat * RAD_PER_BEAT + discRotation(beatPos);
        expect(viaComposition).toBeCloseTo(viaIdentity, 12);
      }
    }
  });

  it("worldAngle is positive while the item is still ahead", () => {
    expect(worldAngle(10, 8)).toBeGreaterThan(0);
    expect(worldAngle(10, 12)).toBeLessThan(0);
  });
});

describe("band and lanes", () => {
  it("band centre migrates linearly from start to end radius", () => {
    expect(bandCenter(0, 4.5, 2.0)).toBe(4.5);
    expect(bandCenter(1, 4.5, 2.0)).toBe(2.0);
    expect(bandCenter(0.5, 4.5, 2.0)).toBeCloseTo(3.25, 12);
  });

  it("lane 1 sits on the band centre, 0 inside, 2 outside", () => {
    expect(laneRadius(1, 3, 0.45)).toBe(3);
    expect(laneRadius(0, 3, 0.45)).toBeCloseTo(2.55, 12);
    expect(laneRadius(2, 3, 0.45)).toBeCloseTo(3.45, 12);
  });

  it("item radius is fixed at the item's own beat, not the current one", () => {
    // A piece at beat 88 of 176 sits at the band centre's halfway radius
    // regardless of where the player currently is.
    const r = itemRadius(1, 88, 176, 4.5, 2.0, 0.45);
    expect(r).toBeCloseTo(3.25, 12);
  });

  it("a missed piece re-inserted one revolution later migrates inward", () => {
    const first = itemRadius(1, 40, 176, 4.5, 2.0, 0.45);
    const retry = itemRadius(1, 40 + BEATS_PER_REV, 176, 4.5, 2.0, 0.45);
    expect(retry).toBeLessThan(first);
  });
});
