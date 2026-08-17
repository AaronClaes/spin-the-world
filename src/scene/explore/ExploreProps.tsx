import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { useMemo } from "react";
import type { Object3D } from "three";
import { usePropClone } from "../dioramaProps";
import type { IslandDef, Spot } from "../islandLayout";
import { isDecal, type PropBox, usePropBoxes } from "./propBoxes";
import { explorePlacement } from "./scale";

// Every prop on the island, standing where the record put it.
//
// The whole world is here from the first frame, world pieces and scenery
// alike — explore mode is only reachable on a record you've already completed
// (one star means every piece was caught), so there is no such thing as a
// partly built island to walk around in.
//
// Visuals and colliders are rendered separately rather than as one component
// per prop. Nothing here moves, so the colliders are a single fixed body with
// one box per prop, which is one Rapier body for a whole island instead of
// fifty; and it keeps the hook-per-clone out of the physics tree.

interface Instance {
  prop: string;
  key: string;
  x: number;
  y: number;
  z: number;
  rot: number;
  scale: number;
}

function instancesOf(island: IslandDef): Instance[] {
  const out: Instance[] = [];
  const add = (prop: string, spot: Spot, scale: number, key: string) => {
    const at = explorePlacement(island, spot);
    out.push({ prop, key, x: at.x, y: at.y, z: at.z, rot: at.rot, scale });
  };
  for (const [prop, spot] of Object.entries(island.spots))
    add(prop, spot, 1, `spot-${prop}`);
  island.scenery.forEach((def, i) =>
    add(def.prop, def, def.scale ?? 1, `scenery-${def.prop}-${i}`),
  );
  return out;
}

function PropVisual({
  instance,
  model,
  scale: S,
}: {
  instance: Instance;
  model: string;
  scale: number;
}) {
  const clone: Object3D = usePropClone(instance.prop, model);
  // Shadows are what connect a prop to the ground once the camera is standing
  // on it — the diorama never needed them because it fakes one contact ring
  // for the whole plate from above.
  clone.traverse((o) => {
    o.castShadow = true;
  });
  return (
    <group
      position={[instance.x * S, instance.y * S, instance.z * S]}
      rotation-y={instance.rot}
      scale={instance.scale * S}
    >
      <primitive object={clone} />
    </group>
  );
}

export function ExploreProps({
  island,
  model,
  scale: S,
}: {
  island: IslandDef;
  model: string;
  scale: number;
}) {
  const boxes = usePropBoxes(model);
  const instances = useMemo(() => instancesOf(island), [island]);

  const solid = useMemo(
    () =>
      instances
        .map((i) => ({ i, box: boxes[i.prop] as PropBox | undefined }))
        .filter(
          (e): e is { i: Instance; box: PropBox } => !!e.box && !isDecal(e.box),
        ),
    [instances, boxes],
  );

  return (
    <>
      {instances.map((instance) => (
        <PropVisual
          key={instance.key}
          instance={instance}
          model={model}
          scale={S}
        />
      ))}
      <RigidBody type="fixed" colliders={false}>
        {solid.map(({ i, box }) => {
          const k = i.scale;
          return (
            <CuboidCollider
              key={i.key}
              args={[
                (box[0] * k * S) / 2,
                (box[1] * k * S) / 2,
                (box[2] * k * S) / 2,
              ]}
              position={[i.x * S, (i.y + (box[1] * k) / 2) * S, i.z * S]}
              rotation={[0, i.rot, 0]}
            />
          );
        })}
      </RigidBody>
    </>
  );
}
