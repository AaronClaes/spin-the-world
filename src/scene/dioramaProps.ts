import { useGLTF } from "@react-three/drei";
import { useMemo } from "react";
import type { Object3D } from "three";
import { RECORDS } from "../records";
import { dressProp } from "./neonDressing";
import { PROC_PROPS } from "./procProps";

// One GLB per record holds that record's world-piece props as named root
// nodes (spec §8.4), kitbashed by scripts/build-diorama.mjs. Each prop is
// already miniature scale, centred on x/z, standing on y=0. The same prop
// appears in three places — riding the groove, flying to the label, planted in
// the diorama — so everyone clones from the same template here.
//
// A prop the GLB doesn't have falls through to the procedural registry: some
// pieces are built from primitives so they can animate parts of themselves.
//
// Everything then goes through the neon dressing pass, which is a no-op for
// props that aren't on its list. It has to run per clone rather than once on
// the cached GLB: it writes vertex colours and swaps materials, and the cache
// is shared by every record on the shelf.

export function usePropClone(prop: string, model: string): Object3D {
  const { scene } = useGLTF(model);
  return useMemo(() => {
    const template = scene.getObjectByName(prop);
    if (template) return dressProp(prop, template.clone(true));
    const build = PROC_PROPS[prop];
    if (build) return dressProp(prop, build());
    throw new Error(`no prop "${prop}" in ${model} or the procedural registry`);
  }, [scene, prop, model]);
}

for (const record of RECORDS) useGLTF.preload(record.dioramaModel);
