import { describe, expect, it } from "vitest";
import { fovForAspect } from "./CameraRig";

// The game's composition is horizontal: at beat 0 the label sits dead centre
// vertically and it's the SIDE of the frame it falls out of. fov is vertical,
// so every framing number in CameraRig is only meaningful if the horizontal
// angle holds across window shapes — which is the one thing worth pinning.
const hFov = (aspect: number) =>
  2 *
  Math.atan(Math.tan((fovForAspect(aspect) / 2) * (Math.PI / 180)) * aspect);

describe("fovForAspect", () => {
  const reference = hFov(16 / 9);

  it("leaves 16:9 and wider alone", () => {
    expect(fovForAspect(16 / 9)).toBe(42);
    expect(fovForAspect(21 / 9)).toBe(42);
    // phone landscape — wider than the reference, so it gets more, not less
    expect(hFov(844 / 390)).toBeGreaterThan(reference);
  });

  it("holds the horizontal angle on narrower windows", () => {
    for (const aspect of [16 / 10, 4 / 3, 5 / 4]) {
      expect(hFov(aspect)).toBeCloseTo(reference, 6);
    }
  });

  it("stops widening before a portrait window distorts", () => {
    expect(fovForAspect(0.5)).toBe(70);
    expect(fovForAspect(9 / 16)).toBe(70);
  });
});
