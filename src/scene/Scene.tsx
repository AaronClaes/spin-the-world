import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useRef } from "react";
import type { AmbientLight, DirectionalLight } from "three";
import { getBeatPos } from "../audio/transport";
import { clockState } from "../game/clockState";
import type { ResolveEvent } from "../game/run";
import { resolveCrossings } from "../game/run";
import { activeRun } from "../game/runState";
import { useGameStore } from "../game/store";
import { meadow } from "../records/meadow";
import { applyStemUnlocks, swellAliveMix } from "../music/meadow";
import { CameraRig } from "./CameraRig";
import { Disc } from "./Disc";
import { launchFlight } from "./flights";
import { Runner } from "./Runner";
import { Tonearm } from "./Tonearm";

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
        launchFlight(e.item);
        const count = useGameStore.getState().piecesCollected.length;
        applyStemUnlocks(count, activeRun.record.stemUnlockAtPieces);
        if (count === activeRun.record.worldPieces.length) swellAliveMix();
      } else if (e.item.status === "lost") {
        store.losePiece();
      }
      // a recurring piece (still pending) needs no store change — its beat
      // moved one revolution ahead and it will come around again
    }
  });
  return null;
}

// Warm key (desk-lamp amber) + cool fill, per the art direction. When the
// world comes alive the key and ambient ease up — the "warm the lighting"
// half of spec §8.4's completion moment.
function Lights() {
  const key = useRef<DirectionalLight>(null);
  const ambient = useRef<AmbientLight>(null);

  useFrame((_, delta) => {
    const alive =
      useGameStore.getState().piecesCollected.length ===
      activeRun.record.worldPieces.length;
    const k = 1 - Math.exp(-1.5 * delta);
    if (key.current)
      key.current.intensity +=
        ((alive ? 2.3 : 1.6) - key.current.intensity) * k;
    if (ambient.current)
      ambient.current.intensity +=
        ((alive ? 0.45 : 0.25) - ambient.current.intensity) * k;
  });

  return (
    <>
      <ambientLight ref={ambient} intensity={0.25} />
      <directionalLight
        ref={key}
        position={[6, 8, 4]}
        intensity={1.6}
        color="#ffc98a"
      />
      <directionalLight
        position={[-7, 5, -6]}
        intensity={0.5}
        color="#6a83c9"
      />
    </>
  );
}

export function Scene() {
  return (
    <Canvas dpr={[1, 2]} camera={{ position: [-3.9, 3.1, 6.6], fov: 42 }}>
      <color attach="background" args={["#0a0c14"]} />

      <ClockDriver />
      <CameraRig />
      <Lights />

      <Disc />
      <Tonearm />
      <Suspense fallback={null}>
        <Runner />
      </Suspense>
    </Canvas>
  );
}
