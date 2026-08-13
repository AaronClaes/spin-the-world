import { Canvas, useFrame } from "@react-three/fiber";
import { getBeatPos } from "../audio/transport";
import { clockState } from "../game/clockState";
import { meadow } from "../records/meadow";
import { BeatCube } from "./BeatCube";
import { Disc } from "./Disc";

// Sole writer of clockState.beatPos. Mounted first so every other useFrame
// in the tree reads this frame's value, not last frame's.
function ClockDriver() {
  useFrame(() => {
    // Clamp: the end-of-track pause lands a few ms after totalBeats.
    if (clockState.playing)
      clockState.beatPos = Math.min(getBeatPos(meadow.bpm), meadow.totalBeats);
  });
  return null;
}

export function Scene() {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 6.5, 9.5], fov: 42 }}
      onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
    >
      <color attach="background" args={["#0a0c14"]} />

      <ClockDriver />

      {/* Warm key (desk-lamp amber) + cool fill, per the art direction */}
      <ambientLight intensity={0.25} />
      <directionalLight position={[6, 8, 4]} intensity={1.6} color="#ffc98a" />
      <directionalLight
        position={[-7, 5, -6]}
        intensity={0.5}
        color="#6a83c9"
      />

      <Disc />
      <BeatCube />
    </Canvas>
  );
}
