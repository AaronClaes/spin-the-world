import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group, InstancedMesh, Object3D } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RingGeometry } from "three";
import { clockState } from "../game/clockState";
import { DISC_RADIUS, DISC_THICKNESS, LABEL_RADIUS } from "../game/constants";
import { discRotation } from "../game/geometry";
import { Diorama } from "./Diorama";
import { Items } from "./Items";

// Art direction (spec §9): near-black vinyl with low roughness so it catches
// one specular streak from the amber key light; concentric grooves as thin
// lighter rings (one merged geometry, one draw call); rotation-readability
// cues — surface dust specks that ride the disc, a slight eccentric wobble
// like a real pressing, and an off-centre label.

const DISC_TOP = DISC_THICKNESS / 2;
const WOBBLE = 0.012; // eccentric pressing: rotation centre ≠ geometry centre
const SPECK_COUNT = 90;

// Deterministic pseudo-random — specks land identically every mount.
const rand = (i: number, salt: number) => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

function GrooveRings() {
  const geometry = useMemo(() => {
    const rings = [];
    for (let r = LABEL_RADIUS + 0.22; r < DISC_RADIUS - 0.18; r += 0.155) {
      rings.push(new RingGeometry(r - 0.006, r + 0.006, 128));
    }
    const merged = mergeGeometries(rings);
    for (const ring of rings) ring.dispose();
    return merged;
  }, []);

  return (
    <mesh
      geometry={geometry}
      rotation-x={-Math.PI / 2}
      position-y={DISC_TOP + 0.0012}
    >
      <meshStandardMaterial color="#23262e" roughness={0.45} metalness={0.1} />
    </mesh>
  );
}

// A scatter of dust specks pressed into the surface — rotation-invariant
// rings can't show spin; these can (spec §9).
function Specks() {
  const mesh = useRef<InstancedMesh>(null);

  const setup = (inst: InstancedMesh) => {
    const d = new Object3D();
    for (let i = 0; i < SPECK_COUNT; i++) {
      const radius =
        LABEL_RADIUS + 0.25 + rand(i, 1) * (DISC_RADIUS - LABEL_RADIUS - 0.5);
      const angle = rand(i, 2) * Math.PI * 2;
      d.position.set(
        Math.sin(angle) * radius,
        DISC_TOP + 0.0018,
        Math.cos(angle) * radius,
      );
      d.rotation.set(-Math.PI / 2, 0, 0);
      d.scale.setScalar(0.5 + rand(i, 3));
      d.updateMatrix();
      inst.setMatrixAt(i, d.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
  };

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, SPECK_COUNT]}
      onUpdate={setup}
    >
      <circleGeometry args={[0.014, 8]} />
      <meshStandardMaterial color="#4a4e5a" roughness={0.8} />
    </instancedMesh>
  );
}

export function Disc() {
  const group = useRef<Group>(null);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const rot = discRotation(clockState.beatPos);
    g.rotation.y = rot;
    // the pressing is a hair off-centre — the whole disc orbits the spindle
    g.position.set(Math.sin(rot) * WOBBLE, 0, Math.cos(rot) * WOBBLE);
  });

  return (
    <group ref={group}>
      {/* vinyl */}
      <mesh>
        <cylinderGeometry
          args={[DISC_RADIUS, DISC_RADIUS, DISC_THICKNESS, 128]}
        />
        <meshStandardMaterial
          color="#16181d"
          roughness={0.28}
          metalness={0.2}
        />
      </mesh>

      <GrooveRings />
      <Specks />

      {/* label paper */}
      <mesh position-y={DISC_TOP + 0.003}>
        <cylinderGeometry args={[LABEL_RADIUS, LABEL_RADIUS, 0.012, 64]} />
        <meshStandardMaterial color="#c98a3d" roughness={0.7} />
      </mesh>
      {/* off-centre print ring on the label — asymmetry that shows spin */}
      <mesh rotation-x={-Math.PI / 2} position={[0.05, DISC_TOP + 0.011, 0.03]}>
        <ringGeometry args={[LABEL_RADIUS - 0.1, LABEL_RADIUS - 0.06, 64]} />
        <meshStandardMaterial color="#8a5a22" roughness={0.75} />
      </mesh>
      {/* spindle */}
      <mesh position-y={DISC_TOP + 0.012}>
        <cylinderGeometry args={[0.045, 0.045, 0.03, 16]} />
        <meshStandardMaterial color="#0c0d11" roughness={0.4} />
      </mesh>

      {/* items are pressed into the grooves — they live in disc space and
          rotate with the record, as does the world being built on the label */}
      <Items />
      <Diorama />
    </group>
  );
}
