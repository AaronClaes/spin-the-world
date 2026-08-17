import { use } from "react";

// Every prop's world-space bounding box, written next to the diorama GLB by
// scripts/build-diorama.mjs. The build script is the only place that knows
// these: normalization already measures the source bounds and computes the
// scale, so the box is those two multiplied, and re-deriving it at runtime
// would mean walking geometry the loader has already flattened and merged.
//
// One box per prop is enough because every prop comes out of the kitbash
// centred on x/z and standing on y=0 — the same frame every consumer places it
// in — so the collider is the box sitting half its height up, with no per-
// instance measurement.

export type PropBox = [number, number, number]; // w, h, d in world units

const cache = new Map<string, Promise<Record<string, PropBox>>>();

export function usePropBoxes(dioramaModel: string): Record<string, PropBox> {
  const url = dioramaModel.replace(/-diorama\.glb$/, "-props.json");
  let pending = cache.get(url);
  if (!pending) {
    pending = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      return r.json() as Promise<Record<string, PropBox>>;
    });
    cache.set(url, pending);
  }
  return use(pending);
}

// A prop wider than it is tall by 4:1 is a decal — a lily pad, a patch of
// sand, the hole the treasure came out of. Boxing those puts an invisible
// knee-high wall on a texture, which is the exact species of bug that makes a
// walkable space feel broken, so they get no collider at all.
export const isDecal = (box: PropBox): boolean =>
  box[1] < 0.25 * Math.max(box[0], box[2]);
