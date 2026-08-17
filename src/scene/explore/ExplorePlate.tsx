import { CuboidCollider, ConvexHullCollider, RigidBody } from "@react-three/rapier";
import { useMemo } from "react";
import { Color, type InstancedMesh, Object3D } from "three";
import {
  DISC_RADIUS,
  DISC_THICKNESS,
  LABEL_RADIUS,
} from "../../game/constants";
import { CAP_H, HEX_R, ISLAND_BASE, type IslandDef } from "../islandLayout";
import { coastWalls, exploreTop, hexPrism } from "./scale";

// The terrain, at walking size, with something under it to stand on.
//
// Deliberately not the diorama's Island component. That one draws a contact
// ring to fake a shadow onto the label and a completion sweep for the tenth
// piece — both of which are about a plate seen from above — and it has no
// reason to know what a collider is. What the two share is the data: the same
// IslandDef, the same tile list, the same palette.
//
// The visual is instanced, the collision is one convex hull per tile, and both
// read exploreTop(), so the ground you see and the ground you stand on cannot
// disagree.

const SOIL = "#8a6440";

export function ExplorePlate({
  island,
  scale: S,
}: {
  island: IslandDef;
  scale: number;
}) {
  const { tiles, palette } = island;

  const colors = useMemo(
    () => tiles.map((t) => new Color(palette[t.kind])),
    [tiles, palette],
  );

  const layoutBody = (inst: InstancedMesh) => {
    const d = new Object3D();
    tiles.forEach((t, i) => {
      const capBottom = exploreTop(t.kind) - CAP_H;
      const h = Math.max(0.004, capBottom - ISLAND_BASE) * S;
      d.position.set(t.x * S, ISLAND_BASE * S + h / 2, t.z * S);
      d.scale.set(S, h, S);
      d.updateMatrix();
      inst.setMatrixAt(i, d.matrix);
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.frustumCulled = false;
  };

  const layoutCaps = (inst: InstancedMesh) => {
    const d = new Object3D();
    tiles.forEach((t, i) => {
      d.position.set(t.x * S, (exploreTop(t.kind) - CAP_H / 2) * S, t.z * S);
      d.scale.setScalar(S);
      d.updateMatrix();
      inst.setMatrixAt(i, d.matrix);
      inst.setColorAt(i, colors[i]);
    });
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.frustumCulled = false;
  };

  // One hull per tile, spanning the whole column from the label up to the cap.
  // Soil and cap share a radius, so a single prism is exact for both, and the
  // step where a tile meets a taller neighbour comes out of the geometry
  // rather than having to be authored.
  const hulls = useMemo(
    () =>
      tiles.map((t) => ({
        key: `${t.q},${t.r}`,
        x: t.x * S,
        z: t.z * S,
        points: hexPrism(HEX_R * S, ISLAND_BASE * S, exploreTop(t.kind) * S),
      })),
    [tiles, S],
  );

  // Tall enough that a running jump can't clear it and land on the label.
  const WALL_H = 4;
  const walls = useMemo(() => coastWalls(tiles, S, WALL_H), [tiles, S]);

  return (
    <>
      <instancedMesh
        args={[undefined, undefined, tiles.length]}
        onUpdate={layoutBody}
        receiveShadow
      >
        <cylinderGeometry args={[HEX_R, HEX_R, 1, 6]} />
        <meshStandardMaterial color={SOIL} roughness={0.95} />
      </instancedMesh>
      <instancedMesh
        args={[undefined, undefined, tiles.length]}
        onUpdate={layoutCaps}
        receiveShadow
      >
        <cylinderGeometry args={[HEX_R, HEX_R, CAP_H, 6]} />
        <meshStandardMaterial color="#ffffff" roughness={0.85} />
      </instancedMesh>

      {/* The record, scaled with everything else. Visual only — a scaled group
          is safe for meshes and is exactly what Rapier must never be given, so
          every collider above and below is computed in explore units instead. */}
      <group scale={S}>
        <mesh position-y={0}>
          <cylinderGeometry
            args={[DISC_RADIUS, DISC_RADIUS, DISC_THICKNESS, 128]}
          />
          <meshStandardMaterial
            color="#16181d"
            roughness={0.28}
            metalness={0.2}
          />
        </mesh>
        <mesh position-y={DISC_THICKNESS / 2 + 0.003} receiveShadow>
          <cylinderGeometry args={[LABEL_RADIUS, LABEL_RADIUS, 0.012, 64]} />
          <meshStandardMaterial color="#c98a3d" roughness={0.7} />
        </mesh>
      </group>

      <RigidBody type="fixed" colliders={false}>
        {hulls.map((h) => (
          <ConvexHullCollider
            key={h.key}
            args={[h.points]}
            position={[h.x, 0, h.z]}
          />
        ))}
        {walls.map((w) => (
          <CuboidCollider
            key={w.key}
            args={w.args}
            position={w.position}
            rotation={w.rotation}
          />
        ))}
        {/* Nothing should ever reach the label — but a body that squeezes
            through a seam would otherwise fall forever, and a floor is cheaper
            than finding out. */}
        <CuboidCollider
          args={[LABEL_RADIUS * S, 0.5, LABEL_RADIUS * S]}
          position={[0, (DISC_THICKNESS / 2 + 0.009) * S - 0.5, 0]}
        />
      </RigidBody>
    </>
  );
}
