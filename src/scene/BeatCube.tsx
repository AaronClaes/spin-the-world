import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh, MeshStandardMaterial } from "three";
import { clockState } from "../game/clockState";

// Debug cube: scales on every beat, driven purely by beatPos. If this pulses
// with the kick over the whole track, the clock is proven.
export function BeatCube() {
  const mesh = useRef<Mesh>(null);

  useFrame(() => {
    if (!mesh.current) return;
    const phase = clockState.beatPos % 1; // 0 at each beat onset
    const pulse = Math.pow(1 - phase, 3);
    const s = 0.6 + 0.35 * pulse;
    mesh.current.scale.setScalar(s);
    const mat = mesh.current.material as MeshStandardMaterial;
    mat.emissiveIntensity = 0.3 + 1.6 * pulse;
  });

  return (
    <mesh ref={mesh} position={[6.2, 0.6, 0]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color="#7cc4ff"
        emissive="#7cc4ff"
        emissiveIntensity={0.3}
      />
    </mesh>
  );
}
