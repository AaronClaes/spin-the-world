import { Canvas, useFrame } from "@react-three/fiber";
import {
  Bloom,
  EffectComposer,
  ToneMapping,
  Vignette,
} from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { Suspense, useMemo, useRef } from "react";
import type { AmbientLight, DirectionalLight, Points } from "three";
import {
  sfxNoteMiss,
  sfxNotePickup,
  sfxPiecePickup,
  sfxRecordSkip,
} from "../audio/sfx";
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
        if (e.collected) {
          store.collectNote();
          sfxNotePickup(useGameStore.getState().combo);
        } else {
          store.missNote();
          sfxNoteMiss();
        }
      } else if (e.collected) {
        store.collectPiece(e.item.prop as string);
        sfxPiecePickup();
        launchFlight(e.item);
        const count = useGameStore.getState().piecesCollected.length;
        applyStemUnlocks(count, activeRun.record.stemUnlockAtPieces);
        if (count === activeRun.record.worldPieces.length) swellAliveMix();
      } else {
        // piece missed — recurring or lost, both get the record-skip glitch
        // and the one allowed camera impulse (spec §8.1, §8.6)
        sfxRecordSkip();
        clockState.skipImpulse = 1;
        if (e.item.status === "lost") store.losePiece();
        // a recurring piece (still pending) needs no store change — its beat
        // moved one revolution ahead and it will come around again
      }
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
        ((alive ? 3.8 : 2.7) - key.current.intensity) * k;
    if (ambient.current)
      ambient.current.intensity +=
        ((alive ? 0.75 : 0.45) - ambient.current.intensity) * k;
  });

  return (
    <>
      <ambientLight ref={ambient} intensity={0.45} />
      <directionalLight
        ref={key}
        position={[6, 8, 4]}
        intensity={2.7}
        color="#ffc98a"
      />
      <directionalLight
        position={[-7, 5, -6]}
        intensity={0.9}
        color="#6a83c9"
      />
    </>
  );
}

// The record floats in a near-black void with a scatter of dust motes —
// free atmosphere (spec §9), and the slow counter-drift makes the disc's
// spin read even at the rim.
const MOTE_COUNT = 160;

function DustMotes() {
  const points = useRef<Points>(null);

  const positions = useMemo(() => {
    const p = new Float32Array(MOTE_COUNT * 3);
    const r = (i: number, salt: number) => {
      const x = Math.sin(i * 91.7 + salt * 47.9) * 24634.6345;
      return x - Math.floor(x);
    };
    for (let i = 0; i < MOTE_COUNT; i++) {
      p[i * 3] = (r(i, 1) - 0.5) * 16;
      p[i * 3 + 1] = r(i, 2) * 6 - 0.5;
      p[i * 3 + 2] = (r(i, 3) - 0.5) * 16;
    }
    return p;
  }, []);

  useFrame(({ clock }, delta) => {
    if (!points.current) return;
    points.current.rotation.y -= delta * 0.012;
    points.current.position.y = Math.sin(clock.elapsedTime * 0.13) * 0.15;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#9aa6c8"
        size={0.022}
        sizeAttenuation
        transparent
        opacity={0.45}
        depthWrite={false}
      />
    </points>
  );
}

// Touch devices get a lower DPR cap — post passes scale with pixels, and the
// budget says playable on a mid-range phone, not pretty on one (spec §9).
const MAX_DPR =
  typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches
    ? 1.5
    : 2;

export function Scene() {
  return (
    <Canvas dpr={[1, MAX_DPR]} camera={{ position: [-3.9, 3.1, 6.6], fov: 42 }}>
      <color attach="background" args={["#0a0c14"]} />

      <ClockDriver />
      <CameraRig />
      <Lights />
      <DustMotes />

      <Tonearm />
      <Suspense fallback={null}>
        <Disc />
        <Runner />
      </Suspense>

      {/* subtle post stack (spec §9): bloom for the emissive accents,
          vignette for the miniature-under-a-lamp feel, ACES tone mapping */}
      <EffectComposer>
        <Bloom
          intensity={0.5}
          luminanceThreshold={0.75}
          luminanceSmoothing={0.2}
          mipmapBlur
        />
        <Vignette offset={0.2} darkness={0.55} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </Canvas>
  );
}
