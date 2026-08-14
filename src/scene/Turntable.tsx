import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Group, InstancedMesh, Object3D } from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { clockState } from "../game/clockState";
import { DISC_THICKNESS } from "../game/constants";
import { discRotation } from "../game/geometry";

// The machine under the record (art direction: retro plastic portable —
// cream body, charcoal platter, orange controls). The vinyl used to float in
// the void; now it sits on a platter on a deck, the tonearm stands on that
// deck, and the whole game world is one toy record player.
//
// Everything here is static world-space dressing except the platter, which
// spins with the disc (without the disc's eccentric wobble — the wobble is
// the pressing orbiting the spindle, not the machine shaking).

const VINYL_BOTTOM = -DISC_THICKNESS / 2;

// platter top carries a thin slipmat; the slipmat top meets the vinyl
const SLIPMAT_TOP = VINYL_BOTTOM;
const PLATTER_R = 5.35;

export const DECK_TOP = -0.34; // plinth surface — the tonearm stands here
const DECK_W = 13.6;
const DECK_D = 14.4;
const DECK_H = 0.9;
const DECK_CZ = -0.6; // extra depth behind the disc for the tonearm corner

const CREAM = "#ece1cb";
const CHARCOAL = "#3b3f49";
const ORANGE = "#e08a3c";

const STROBE_COUNT = 40;

// Strobe dots on the slipmat ring that shows around the vinyl — the retro
// platter-rim detail, and a spin cue right at the rim.
function StrobeDots() {
  const setup = (inst: InstancedMesh) => {
    const d = new Object3D();
    for (let i = 0; i < STROBE_COUNT; i++) {
      const a = (i / STROBE_COUNT) * Math.PI * 2;
      d.position.set(
        Math.sin(a) * 5.17,
        SLIPMAT_TOP + 0.002,
        Math.cos(a) * 5.17,
      );
      d.rotation.set(-Math.PI / 2, 0, 0);
      d.updateMatrix();
      inst.setMatrixAt(i, d.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
  };

  return (
    <instancedMesh args={[undefined, undefined, STROBE_COUNT]} onUpdate={setup}>
      <circleGeometry args={[0.04, 8]} />
      <meshStandardMaterial color={CHARCOAL} roughness={0.7} />
    </instancedMesh>
  );
}

function Platter() {
  const spin = useRef<Group>(null);

  useFrame(() => {
    if (spin.current)
      spin.current.rotation.y = discRotation(clockState.beatPos);
  });

  return (
    <group ref={spin}>
      <mesh position-y={VINYL_BOTTOM - 0.16}>
        <cylinderGeometry args={[PLATTER_R, PLATTER_R, 0.28, 96]} />
        <meshStandardMaterial color={CHARCOAL} roughness={0.5} />
      </mesh>
      {/* slipmat — the orange ring peeking out around the vinyl */}
      <mesh position-y={SLIPMAT_TOP - 0.01}>
        <cylinderGeometry args={[5.32, 5.32, 0.02, 96]} />
        <meshStandardMaterial color="#c97f3a" roughness={0.85} />
      </mesh>
      <StrobeDots />
    </group>
  );
}

function ControlCluster() {
  return (
    <group position-y={DECK_TOP}>
      {/* start/stop — the one big satisfying button */}
      <group position={[-2.6, 0, 5.85]}>
        <mesh position-y={0.02}>
          <cylinderGeometry args={[0.34, 0.36, 0.06, 24]} />
          <meshStandardMaterial color={CHARCOAL} roughness={0.5} />
        </mesh>
        <mesh position-y={0.07}>
          <cylinderGeometry args={[0.26, 0.26, 0.09, 24]} />
          <meshStandardMaterial color={ORANGE} roughness={0.45} />
        </mesh>
      </group>
      {/* 33 / 45 speed pills */}
      {[-1.7, -1.15].map((x, i) => (
        <mesh key={x} position={[x, 0.035, 5.85]}>
          <boxGeometry args={[0.36, 0.07, 0.22]} />
          <meshStandardMaterial
            color={i === 0 ? CHARCOAL : CREAM}
            roughness={0.5}
          />
        </mesh>
      ))}
    </group>
  );
}

export function Turntable() {
  const plinth = useMemo(
    () => new RoundedBoxGeometry(DECK_W, DECK_H, DECK_D, 4, 0.18),
    [],
  );

  return (
    <group>
      <mesh geometry={plinth} position={[0, DECK_TOP - DECK_H / 2, DECK_CZ]}>
        <meshStandardMaterial color={CREAM} roughness={0.55} />
      </mesh>

      {/* squat rubber feet at the corners */}
      {(
        [
          [-5.9, -7.1],
          [5.9, -7.1],
          [-5.9, 5.9],
          [5.9, 5.9],
        ] as const
      ).map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, DECK_TOP - DECK_H - 0.1, z]}>
          <cylinderGeometry args={[0.42, 0.36, 0.24, 16]} />
          <meshStandardMaterial color={CHARCOAL} roughness={0.8} />
        </mesh>
      ))}

      <Platter />

      {/* spindle — static: the disc's eccentric wobble orbits around it */}
      <mesh position-y={VINYL_BOTTOM + 0.055}>
        <cylinderGeometry args={[0.045, 0.045, 0.19, 16]} />
        <meshStandardMaterial
          color="#c9ced8"
          roughness={0.35}
          metalness={0.4}
        />
      </mesh>

      <ControlCluster />
    </group>
  );
}
