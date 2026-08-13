import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense } from "react";
import { getBeatPos } from "../audio/transport";
import { clockState } from "../game/clockState";
import type { ResolveEvent } from "../game/run";
import { resolveCrossings } from "../game/run";
import { activeRun } from "../game/runState";
import { useGameStore } from "../game/store";
import { meadow } from "../records/meadow";
import { CameraRig } from "./CameraRig";
import { Disc } from "./Disc";
import { Runner } from "./Runner";

const events: ResolveEvent[] = [];

// Sole writer of clockState. Mounted first so every other useFrame in the
// tree reads this frame's value, not last frame's. Also runs the collection
// loop — resolution is arithmetic on the committed lane (spec §6.4).
function ClockDriver() {
  useFrame((_, delta) => {
    const lane = useGameStore.getState().lane;
    clockState.laneVisual +=
      (lane - clockState.laneVisual) * (1 - Math.exp(-14 * delta));

    if (!clockState.playing) return;
    // Clamp: the end-of-track pause lands a few ms after totalBeats.
    clockState.beatPos = Math.min(getBeatPos(meadow.bpm), meadow.totalBeats);

    events.length = 0;
    resolveCrossings(activeRun, clockState.beatPos, lane, events);
    for (const e of events) {
      const store = useGameStore.getState();
      if (e.item.kind === "note") {
        if (e.collected) store.collectNote();
        else store.missNote();
      } else if (e.collected) {
        store.collectPiece(e.item.prop as string);
      } else if (e.item.status === "lost") {
        store.losePiece();
      }
      // a recurring piece (still pending) needs no store change — its beat
      // moved one revolution ahead and it will come around again
    }
  });
  return null;
}

export function Scene() {
  return (
    <Canvas dpr={[1, 2]} camera={{ position: [-3.9, 3.1, 6.6], fov: 42 }}>
      <color attach="background" args={["#0a0c14"]} />

      <ClockDriver />
      <CameraRig />

      {/* Warm key (desk-lamp amber) + cool fill, per the art direction */}
      <ambientLight intensity={0.25} />
      <directionalLight position={[6, 8, 4]} intensity={1.6} color="#ffc98a" />
      <directionalLight
        position={[-7, 5, -6]}
        intensity={0.5}
        color="#6a83c9"
      />

      <Disc />
      <Suspense fallback={null}>
        <Runner />
      </Suspense>
    </Canvas>
  );
}
