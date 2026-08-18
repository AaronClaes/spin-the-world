import { afterEach, describe, expect, it } from "vitest";
import { exploreSupported } from "./exploreSupported";

// The gate on both "Step inside" buttons, and the reason this is worth a test:
// getting it backwards ships a reward that either never appears on a desktop or
// strands a phone inside an island it can't walk.

type MM = typeof globalThis.matchMedia;
const stub = (hoverNone: boolean) => {
  (globalThis as { matchMedia?: MM }).matchMedia = ((query: string) => ({
    matches: query.includes("hover: none") ? hoverNone : false,
    media: query,
  })) as MM;
};

afterEach(() => {
  delete (globalThis as { matchMedia?: MM }).matchMedia;
});

describe("exploreSupported", () => {
  it("offers the mode on a device with hover", () => {
    stub(false);
    expect(exploreSupported()).toBe(true);
  });

  it("withholds it where there is no hover, and so no keyboard", () => {
    stub(true);
    expect(exploreSupported()).toBe(false);
  });

  it("assumes yes where the question can't be asked", () => {
    // node, and any browser old enough to lack matchMedia — a missing answer
    // must not silently retire the feature
    expect(globalThis.matchMedia).toBeUndefined();
    expect(exploreSupported()).toBe(true);
  });
});
