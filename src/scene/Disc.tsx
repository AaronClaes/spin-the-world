import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { clockState } from "../game/clockState";
import { DISC_RADIUS, DISC_THICKNESS, LABEL_RADIUS } from "../game/constants";
import { discRotation } from "../game/geometry";

const GROOVE_RADII = [1.6, 2.1, 2.6, 3.1, 3.6, 4.1, 4.6];

export function Disc() {
  const group = useRef<Group>(null);

  useFrame(() => {
    if (group.current)
      group.current.rotation.y = discRotation(clockState.beatPos);
  });

  return (
    <group ref={group}>
      {/* vinyl */}
      <mesh>
        <cylinderGeometry
          args={[DISC_RADIUS, DISC_RADIUS, DISC_THICKNESS, 96]}
        />
        <meshStandardMaterial
          color="#1a1c21"
          roughness={0.35}
          metalness={0.15}
        />
      </mesh>

      {/* groove rings — slightly lighter concentric circles */}
      {GROOVE_RADII.map((r) => (
        <mesh
          key={r}
          rotation-x={-Math.PI / 2}
          position-y={DISC_THICKNESS / 2 + 0.001}
        >
          <ringGeometry args={[r - 0.012, r + 0.012, 96]} />
          <meshStandardMaterial color="#2a2d35" roughness={0.5} />
        </mesh>
      ))}

      {/* label */}
      <mesh position-y={DISC_THICKNESS / 2 + 0.005}>
        <cylinderGeometry args={[LABEL_RADIUS, LABEL_RADIUS, 0.02, 48]} />
        <meshStandardMaterial color="#c98a3d" roughness={0.7} />
      </mesh>

      {/* off-centre label dot — rotation readability (spec §9) */}
      <mesh position={[0.7, DISC_THICKNESS / 2 + 0.02, 0]}>
        <cylinderGeometry args={[0.14, 0.14, 0.02, 24]} />
        <meshStandardMaterial color="#3a2a16" roughness={0.8} />
      </mesh>

      {/* debug: bright marker at authored beat 0, rim side — must sweep past
          the player exactly when beatPos crosses a multiple of 8 */}
      <mesh position={[4.7, DISC_THICKNESS / 2 + 0.06, 0]}>
        <boxGeometry args={[0.12, 0.12, 0.12]} />
        <meshStandardMaterial
          color="#7cc4ff"
          emissive="#7cc4ff"
          emissiveIntensity={1.2}
        />
      </mesh>
    </group>
  );
}
