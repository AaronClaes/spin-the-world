import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Bloom,
  EffectComposer,
  ToneMapping,
  Vignette,
} from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { getTransport } from "tone";
import { lazy, Suspense, useMemo, useRef } from "react";
import type { AmbientLight, DirectionalLight, HemisphereLight } from "three";
import { Color, Vector3 } from "three";
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
import { DAYLIGHT, skyFor } from "../records/sky";
import type { RecordDef } from "../records/types";
import {
  applyStemUnlocks,
  masterVolumeDb,
  swellAliveMix,
} from "../music/rig";
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

const ExploreWorld = lazy(() =>
  import("./explore/ExploreWorld").then((m) => ({ default: m.ExploreWorld })),
);

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

//
// The daylight half is now the record's own (records/sky.ts) — the meadow and
// the harbour still get exactly these colours, and the city plays at dusk.
const WALL_BG = new Color("#171019");
const LAMP_KEY = new Color("#ffc98a");
// The studio is lit with the same three-light rig as the game — ambient,
// hemisphere, key — rather than its own. That's the whole reason the wall can
// be matte: one shared directional shades three identical frames identically,
// with no specular for them to disagree about, which is what the per-frame area
// lights used to be buying (scene/WallScene.tsx).
const LAMP_HEMI_SKY = new Color("#ffd7a2");
const LAMP_HEMI_GROUND = new Color("#4a3423");
const DAY_KEY_POS = new Vector3(6, 8, 4);
// Dead centre in x, and that is the whole reason it's here. Even a matte
// surface keeps a broad view-dependent lobe, so an off-centre key hands the
// three frames three different amounts of it — measured at 36 / 50 / 60 across
// the row before this, left to right, which is a milder version of the very
// complaint the wall was rebuilt to answer. Straight on, the row is symmetric.
const WALL_KEY_POS = new Vector3(0, 5.5, 9);
const colorTarget = new Color();

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
        __transport: unknown;
        __mix: unknown;
      };
      w.__scene = scene;
      w.__cam = camera;
      w.__store = useGameStore;
      // The clock, for the same reason: whether the wall preview is actually
      // running is otherwise unobservable from outside the audio graph.
      w.__transport = getTransport();
      w.__mix = masterVolumeDb;
      // the namespace object, not activeRun itself — it's reassigned on every
      // record pick and replay, and a live binding only survives on the module
      w.__run = runState;
    }
  }, [scene, camera]);

  useFrame((_, delta) => {
    (scene.background as Color).lerp(
      clockState.wall ? WALL_BG : colorTarget.set(skyFor(activeRun.record).bg),
      1 - Math.exp(-3.5 * delta),
    );
  });

  return null;
}

// When the world comes alive the key and ambient ease up — the "warm the
// lighting" half of spec §8.4's completion moment.
function Lights() {
  const key = useRef<DirectionalLight>(null);
  const fill = useRef<DirectionalLight>(null);
  const ambient = useRef<AmbientLight>(null);
  const hemi = useRef<HemisphereLight>(null);

  useFrame((_, delta) => {
    const alive =
      useGameStore.getState().piecesCollected.length ===
      activeRun.record.worldPieces.length;
    const day = !clockState.wall;
    const sky = skyFor(activeRun.record);
    // A night record wants less of every light, not a different rig — the
    // shapes and the completion swell stay the same, they're just quieter.
    const dim = day ? sky.dim : 1;
    const k = 1 - Math.exp(-1.5 * delta);
    if (key.current) {
      const target = (day ? (alive ? 3.2 : 2.5) : 2.2) * dim;
      key.current.intensity += (target - key.current.intensity) * k;
      key.current.color.lerp(
        day ? colorTarget.set(sky.key) : colorTarget.copy(LAMP_KEY),
        k,
      );
      // The key swings round to the front for the wall. Everything in the
      // studio is a surface facing the camera, and the play key comes from
      // over the player's right shoulder — at that angle a frame's face
      // catches 0.37 of it and the whole room renders like it's switched off.
      key.current.position.lerp(day ? DAY_KEY_POS : WALL_KEY_POS, k);
    }
    if (fill.current) {
      fill.current.intensity += (0.9 * dim - fill.current.intensity) * k;
      if (day) fill.current.color.lerp(colorTarget.set(sky.fill), k);
    }
    if (ambient.current)
      ambient.current.intensity +=
        ((day ? (alive ? 1.0 : 0.8) * dim : 0.5) - ambient.current.intensity) *
        k;
    if (hemi.current) {
      hemi.current.intensity +=
        ((day ? 0.65 : 0.55) * (day ? dim : 1) - hemi.current.intensity) * k;
      hemi.current.color.lerp(
        day ? colorTarget.set(sky.hemiSky) : colorTarget.copy(LAMP_HEMI_SKY),
        k,
      );
      hemi.current.groundColor.lerp(
        day
          ? colorTarget.set(sky.hemiGround)
          : colorTarget.copy(LAMP_HEMI_GROUND),
        k,
      );
    }
  });

  return (
    <>
      <ambientLight ref={ambient} intensity={0.68} />
      <hemisphereLight
        ref={hemi}
        intensity={0}
        color={DAYLIGHT.hemiSky}
        groundColor={DAYLIGHT.hemiGround}
      />
      <directionalLight
        ref={key}
        position={[6, 8, 4]}
        intensity={2.7}
        color="#ffc98a"
      />
      <directionalLight
        ref={fill}
        position={[-7, 5, -6]}
        intensity={0.9}
        color={DAYLIGHT.fill}
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
  explore,
  selectedId,
  onSelect,
}: {
  record: RecordDef; // the pick — only used to key the gameplay subtree
  wall: boolean; // wall look (post stack) — true only on the title screen
  wallMounted: boolean; // wall geometry in the tree — also true mid-dive
  explore: boolean; // walking the island instead of playing the groove
  selectedId: string | null; // the frame that's lifted, spinning and audible
  onSelect: (record: RecordDef) => void;
}) {
  return (
    <Canvas
      dpr={[1, MAX_DPR]}
      camera={{ position: WALL_CAM_POS, fov: 42 }}
      // Enabled for the whole app but paid for by nobody except explore mode:
      // three skips the shadow pass entirely while no light in the scene casts,
      // and the only caster lives inside ExploreWorld.
      shadows
    >
      <Sky />
      <SkyWorld />

      <ClockDriver />
      <CameraRig />
      <Lights />

      {!explore && (
        <>
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
        </>
      )}
      {/* Lazy, because Rapier's WASM is half a megabyte the groove never
          touches — and unmounted alongside the deck, because explore mode
          mounts its own copy of the runner GLB and an Object3D has one parent. */}
      <Suspense fallback={null}>
        {explore && <ExploreWorld record={record} />}
      </Suspense>
      <Suspense fallback={null}>
        {wallMounted && (
          <WallScene selectedId={selectedId} onSelect={onSelect} />
        )}
      </Suspense>

      {/* subtle post stack (spec §9): bloom for the emissive accents, ACES
          tone mapping. On the wall the vignette keeps the lamp-lit room
          feel; in daylight it eases way off and the bloom threshold rises
          above the bright sky so the sky itself never glows.
          The two halves are graded much closer than they were — a heavy
          vignette is a lens artefact, and it was one of the things making the
          studio look like a photograph of somewhere the game isn't. */}
      <EffectComposer>
        <Bloom
          intensity={wall ? 0.4 : 0.35}
          luminanceThreshold={wall ? 0.88 : 0.92}
          luminanceSmoothing={0.2}
          mipmapBlur
        />
        <Vignette offset={wall ? 0.14 : 0.12} darkness={wall ? 0.2 : 0.22} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </Canvas>
  );
}
