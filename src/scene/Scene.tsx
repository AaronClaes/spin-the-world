import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Bloom,
  EffectComposer,
  ToneMapping,
  Vignette,
} from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { Suspense, useMemo, useRef } from "react";
import type { AmbientLight, DirectionalLight, HemisphereLight } from "three";
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
import * as runState from "../game/runState";
import { activeRun } from "../game/runState";
import { useGameStore } from "../game/store";
import type { RecordDef } from "../records/types";
import { applyStemUnlocks, swellAliveMix } from "../music/rig";
import { CameraRig } from "./CameraRig";
import { Disc } from "./Disc";
import { LaneGuides } from "./LaneGuides";
import { NeedleNotes } from "./NeedleNotes";
import { NotePop, launchNotePop } from "./NotePop";
import { setLastCatchColor } from "./notePalette";
import { launchFlight } from "./flights";
import { Runner } from "./Runner";
import { SkyWorld } from "./SkyWorld";
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
    const { bpm, totalBeats } = activeRun.record;
    // Clamp: the end-of-track pause lands a few ms after totalBeats.
    clockState.beatPos = Math.min(getBeatPos(bpm), totalBeats);

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
          setLastCatchColor(e.item.beat, e.item.lane);
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

// Two lighting worlds: the studio wall is a lamp-lit room — warm and lit
// enough to feel like somewhere you'd hang out, not a basement — while the
// game plays in cartoon daylight (bright sky background, sunlight key,
// hemisphere fill) so the near-black vinyl pops against the environment
// instead of dissolving into a void. Sky and lights crossfade on the dive.

const WALL_BG = new Color("#171019");
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
    // Dev-only handles for headless scene inspection. These exist because a
    // dynamic import() from the console can resolve to a SECOND copy of a
    // module — Vite serves HMR-invalidated modules from `?t=` URLs, so
    // `import("/src/game/runState.ts")` hands back a fresh one whose
    // activeRun is still the default record. Reading state through these
    // handles is the only way to be sure you're looking at the running app.
    if (import.meta.env.DEV) {
      const w = window as unknown as {
        __scene: unknown;
        __cam: unknown;
        __store: unknown;
        __run: unknown;
      };
      w.__scene = scene;
      w.__cam = camera;
      w.__store = useGameStore;
      // the namespace object, not activeRun itself — it's reassigned on every
      // record pick and replay, and a live binding only survives on the module
      w.__run = runState;
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
      const target = day ? (alive ? 3.2 : 2.5) : 3.1;
      key.current.intensity += (target - key.current.intensity) * k;
      key.current.color.lerp(keyColorTarget.copy(day ? SUN_KEY : LAMP_KEY), k);
    }
    if (ambient.current)
      ambient.current.intensity +=
        ((day ? (alive ? 1.0 : 0.8) : 0.68) - ambient.current.intensity) * k;
    if (hemi.current)
      hemi.current.intensity += ((day ? 0.65 : 0) - hemi.current.intensity) * k;
  });

  return (
    <>
      <ambientLight ref={ambient} intensity={0.68} />
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

// Touch devices get a lower DPR cap — post passes scale with pixels, and the
// budget says playable on a mid-range phone, not pretty on one (spec §9).
const MAX_DPR =
  typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches
    ? 1.5
    : 2;

export function Scene({
  record,
  wall,
  wallMounted,
  onStart,
}: {
  record: RecordDef; // the pick — only used to key the gameplay subtree
  wall: boolean; // wall look (post stack) — true only on the title screen
  wallMounted: boolean; // wall geometry in the tree — also true mid-dive
  onStart: (record: RecordDef) => void;
}) {
  return (
    <Canvas dpr={[1, MAX_DPR]} camera={{ position: WALL_CAM_POS, fov: 42 }}>
      <Sky />
      <SkyWorld />

      <ClockDriver />
      <CameraRig />
      <Lights />

      <Turntable />
      <Tonearm />
      {/* Everything that bakes record data in at construction rather than
          reading it per frame — instance counts, accent colours, the island
          layout — is keyed on the record so switching records rebuilds it.
          The wall is outside: it shows the whole shelf. */}
      <group key={record.id}>
        <NeedleNotes />
        <NotePop />
        <LaneGuides />
        <Suspense fallback={null}>
          <Disc />
          <Runner />
        </Suspense>
      </group>
      <Suspense fallback={null}>
        {wallMounted && <WallScene onStart={onStart} />}
      </Suspense>

      {/* subtle post stack (spec §9): bloom for the emissive accents, ACES
          tone mapping. On the wall the vignette keeps the lamp-lit room
          feel; in daylight it eases way off and the bloom threshold rises
          above the bright sky so the sky itself never glows */}
      <EffectComposer>
        <Bloom
          intensity={wall ? 0.45 : 0.35}
          luminanceThreshold={wall ? 0.82 : 0.92}
          luminanceSmoothing={0.2}
          mipmapBlur
        />
        <Vignette offset={wall ? 0.24 : 0.12} darkness={wall ? 0.42 : 0.22} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </Canvas>
  );
}
