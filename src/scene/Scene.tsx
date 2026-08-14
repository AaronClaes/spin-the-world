import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Bloom,
  EffectComposer,
  ToneMapping,
  Vignette,
} from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { Suspense, useMemo, useRef } from "react";
import type {
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
  Points,
} from "three";
import { Color } from "three";
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
import { LaneGuides } from "./LaneGuides";
import { NeedleNotes } from "./NeedleNotes";
import { NotePop, launchNotePop } from "./NotePop";
import { launchFlight } from "./flights";
import { Runner } from "./Runner";
import { Tonearm } from "./Tonearm";
import { Turntable } from "./Turntable";
import { WALL_CAM_POS, WallScene } from "./WallScene";

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
          const combo = useGameStore.getState().combo;
          sfxNotePickup(combo);
          launchNotePop(e.item, combo);
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

// Two lighting worlds: the studio wall stays a lamp-lit room (amber key,
// low ambient — the look is locked), while the game plays in cartoon
// daylight — bright sky background, sunlight key, hemisphere fill — so the
// near-black vinyl pops against the environment instead of dissolving into
// a void. Both the sky and the lights crossfade on the needle-drop dive.

const WALL_BG = new Color("#0a0c14");
const DAY_BG = new Color("#a5d9f5");
const LAMP_KEY = new Color("#ffc98a");
const SUN_KEY = new Color("#fff2d0");
const keyColorTarget = new Color();

// The Canvas scene background, lerped between night void and day sky as the
// camera flies between the wall and the record.
function Sky() {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);

  useMemo(() => {
    scene.background = WALL_BG.clone();
    // dev-only handles for headless scene inspection
    if (import.meta.env.DEV) {
      const w = window as unknown as { __scene: unknown; __cam: unknown };
      w.__scene = scene;
      w.__cam = camera;
    }
  }, [scene, camera]);

  useFrame((_, delta) => {
    (scene.background as Color).lerp(
      clockState.wall ? WALL_BG : DAY_BG,
      1 - Math.exp(-3.5 * delta),
    );
  });

  return null;
}

// When the world comes alive the key and ambient ease up — the "warm the
// lighting" half of spec §8.4's completion moment.
function Lights() {
  const key = useRef<DirectionalLight>(null);
  const ambient = useRef<AmbientLight>(null);
  const hemi = useRef<HemisphereLight>(null);

  useFrame((_, delta) => {
    const alive =
      useGameStore.getState().piecesCollected.length ===
      activeRun.record.worldPieces.length;
    const day = !clockState.wall;
    const k = 1 - Math.exp(-1.5 * delta);
    if (key.current) {
      const target = day ? (alive ? 3.2 : 2.5) : 2.7;
      key.current.intensity += (target - key.current.intensity) * k;
      key.current.color.lerp(keyColorTarget.copy(day ? SUN_KEY : LAMP_KEY), k);
    }
    if (ambient.current)
      ambient.current.intensity +=
        ((day ? (alive ? 1.0 : 0.8) : 0.45) - ambient.current.intensity) * k;
    if (hemi.current)
      hemi.current.intensity += ((day ? 0.65 : 0) - hemi.current.intensity) * k;
  });

  return (
    <>
      <ambientLight ref={ambient} intensity={0.45} />
      <hemisphereLight
        ref={hemi}
        intensity={0}
        color="#cde6f7"
        groundColor="#d9c49a"
      />
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

// The record floats in open sky with a scatter of dust motes — free
// atmosphere (spec §9), and the slow counter-drift makes the disc's spin
// read even at the rim. Tinted just below the sky so they read as specks
// drifting in the sunlight.
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
        color="#8ba6bd"
        size={0.022}
        sizeAttenuation
        transparent
        opacity={0.5}
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

export function Scene({
  wall,
  onStart,
}: {
  wall: boolean;
  onStart: () => void;
}) {
  return (
    <Canvas dpr={[1, MAX_DPR]} camera={{ position: WALL_CAM_POS, fov: 42 }}>
      <Sky />

      <ClockDriver />
      <CameraRig />
      <Lights />
      <DustMotes />

      <Turntable />
      <Tonearm />
      <NeedleNotes />
      <NotePop />
      <LaneGuides />
      <Suspense fallback={null}>
        <Disc />
        <Runner />
        {wall && <WallScene onStart={onStart} />}
      </Suspense>

      {/* subtle post stack (spec §9): bloom for the emissive accents, ACES
          tone mapping. On the wall the vignette keeps the lamp-lit room
          feel; in daylight it eases way off and the bloom threshold rises
          above the bright sky so the sky itself never glows */}
      <EffectComposer>
        <Bloom
          intensity={wall ? 0.5 : 0.35}
          luminanceThreshold={wall ? 0.75 : 0.92}
          luminanceSmoothing={0.2}
          mipmapBlur
        />
        <Vignette offset={wall ? 0.2 : 0.12} darkness={wall ? 0.55 : 0.22} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </Canvas>
  );
}
