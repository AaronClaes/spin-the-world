import { useGLTF } from "@react-three/drei";
import { useMemo } from "react";
import type { Object3D } from "three";

// One GLB holds every world-piece prop as a named root node (spec §8.4),
// kitbashed by scripts/build-diorama.mjs. Each prop is already miniature
// scale, centred on x/z, standing on y=0. The same prop appears in three
// places — riding the groove, flying to the label, planted in the diorama —
// so everyone clones from the same template here.

const DIORAMA_URL = "/models/meadow-diorama.glb";

export function usePropClone(prop: string): Object3D {
  const { scene } = useGLTF(DIORAMA_URL);
  return useMemo(() => {
    const template = scene.getObjectByName(prop);
    if (!template) throw new Error(`diorama GLB has no prop "${prop}"`);
    return template.clone(true);
  }, [scene, prop]);
}

useGLTF.preload(DIORAMA_URL);
