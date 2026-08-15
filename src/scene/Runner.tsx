import { useAnimations, useGLTF } from "@react-three/drei";
import { createPortal, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { Group, Object3D } from "three";
import { LoopOnce } from "three";
import { songProgress } from "../game/clock";
import { DISC_THICKNESS, RAD_PER_BEAT } from "../game/constants";
import { clockState } from "../game/clockState";
import { bandCenter, laneRadius } from "../game/geometry";
import { activeRun } from "../game/runState";
import { useGameStore } from "../game/store";

// The listener (spec §8.2): KayKit's Rogue wearing the Ranger's head (CC0,
// Kay Lousberg), assembled by scripts/build-runner.mjs — cape dropped, three
// clips kept. A tunic, a belt and boots read as ordinary clothes from behind,
// which is the only angle this game ever sees, and the Ranger's short hair
// leaves the ear cups somewhere to sit. The oversized headphones are built
// here from primitives and portalled onto the head bone so they follow the
// animation. At ~130px tall the silhouette and the accent colour do all the
// work.

// Character is ~2.28 units tall in the GLB; scale to sit small on a radius-5 disc.
const RUNNER_SCALE = 0.2;

// Surface speed (ω·r, game units/s) at which the run clip plays at
// timeScale 1. Tuned by eye in the middle lane (spec §8.2); after that the
// cadence is automatically correct in every lane because both sides of the
// ratio are physical.
const STRIDE_SPEED = 5.0;

// Lean into a lane change. The camera already banks toward the target lane
// (CameraRig LEAN_FRACTION) but the runner didn't, so a lane change was the
// figure sliding sideways bolt upright — the one input the game has, and the
// character didn't acknowledge it.
//
// The tilt is driven by the gap between the committed lane and the visual one,
// which is proportional to lateral velocity (the lane lerp is exponential, so
// v = 14·gap) and self-zeroing once the runner settles. Smoothing it at 20/s
// against a gap decaying at 14/s costs the peak: it lands at 0.435 of the
// nominal, i.e. ~11° for a single-lane move, which is a lean rather than a
// stunt. The clamp only bites on a double-tap, where two moves stack.
const BANK_PER_LANE = 0.44;
const BANK_SMOOTH = 20;
const BANK_MAX = 0.3;

// Coming off the last beat, the run doesn't stop so much as finish. Cheer is
// one-shot rather than looped, and the crossfades are the only blends in the
// game (spec §8.2): a hard cut works going INTO a run, because the count-in
// covers it, but there's nothing to cover a hard cut out of one.
const CHEER_FADE = 0.25;
const CHEER_TO_IDLE = 0.4;

const DISC_TOP = DISC_THICKNESS / 2;

// Sized in head-bone space — the KayKit head is chibi-huge, which is exactly
// what makes oversized headphones read at gameplay distance.
// The head bone sits at the head's base; the chibi head spans y 0→1.08 and
// x ±0.54 in bone space. Band arc lies in the XY plane (ear to ear over the
// crown); cups press onto the sides just proud of the head.
//
// The cups used to carry an emissive ring in the record's accent colour, and
// it had to go: it sits on the OUTER face of each cup, and the camera is
// parked off to one side, so you only ever saw one of the pair. A symmetric
// object lit asymmetrically reads as a modelling mistake, not as an accent.
// The accent still runs the lane guides and the piece rings (§9); it just
// doesn't ride on the character any more.
function Headphones({ head }: { head: Object3D }) {
  return createPortal(
    <group position={[0, 0.5, 0.02]}>
      {/* band arcs over the crown */}
      <mesh>
        <torusGeometry args={[0.64, 0.09, 10, 24, Math.PI]} />
        <meshStandardMaterial color="#23263a" roughness={0.6} />
      </mesh>
      {/* ear cups */}
      {[-1, 1].map((side) => (
        <group
          key={side}
          position={[side * 0.62, -0.08, 0]}
          rotation-z={(side * Math.PI) / 2}
        >
          <mesh>
            <cylinderGeometry args={[0.26, 0.3, 0.16, 18]} />
            <meshStandardMaterial color="#23263a" roughness={0.6} />
          </mesh>
        </group>
      ))}
    </group>,
    head,
  );
}

export function Runner() {
  const group = useRef<Group>(null);
  const body = useRef<Group>(null);
  const { scene, animations } = useGLTF("/models/runner.glb");
  const { actions, mixer } = useAnimations(animations, group);
  const pose = useRef<"idle" | "run" | "cheer">("idle");
  const bank = useRef(0);

  const head = useMemo(() => scene.getObjectByName("head") ?? null, [scene]);

  useEffect(() => {
    actions.Idle?.reset().play();
  }, [actions]);

  // Cheer is clamped at its last frame, so settling back to Idle needs the
  // mixer to say when — polling the action's time would race the loop count.
  useEffect(() => {
    const settle = (e: { action: unknown }) => {
      if (e.action !== actions.Cheer) return;
      actions.Cheer?.fadeOut(CHEER_TO_IDLE);
      actions.Idle?.reset().fadeIn(CHEER_TO_IDLE).play();
    };
    mixer.addEventListener("finished", settle);
    return () => mixer.removeEventListener("finished", settle);
  }, [mixer, actions]);

  useFrame((_, delta) => {
    if (!group.current) return;

    const { band, totalBeats, bpm } = activeRun.record;
    const progress = songProgress(clockState.beatPos, totalBeats);
    const center = bandCenter(progress, band.startRadius, band.endRadius);
    const radius = laneRadius(clockState.laneVisual, center, band.laneGap);
    group.current.position.set(0, DISC_TOP, radius);

    // Lean toward the lane being moved to. The tilt sits on an inner group so
    // the contact shadow stays flat on the vinyl — the runner leans, the
    // shadow doesn't.
    const gap = useGameStore.getState().lane - clockState.laneVisual;
    bank.current +=
      (gap * BANK_PER_LANE - bank.current) *
      (1 - Math.exp(-BANK_SMOOTH * delta));
    if (body.current) {
      body.current.rotation.z = Math.max(
        -BANK_MAX,
        Math.min(BANK_MAX, bank.current),
      );
    }

    const running = clockState.playing && !clockState.ended;
    const want = clockState.ended ? "cheer" : running ? "run" : "idle";
    if (want !== pose.current) {
      pose.current = want;
      if (want === "run") {
        actions.Idle?.stop();
        actions.Cheer?.stop();
        actions.Running_A?.reset().play();
      } else if (want === "cheer") {
        actions.Running_A?.fadeOut(CHEER_FADE);
        actions.Cheer?.reset().setLoop(LoopOnce, 1).fadeIn(CHEER_FADE).play();
        if (actions.Cheer) actions.Cheer.clampWhenFinished = true;
      } else {
        actions.Running_A?.stop();
        actions.Cheer?.stop();
        actions.Idle?.reset().play();
      }
    }

    if (running && actions.Running_A) {
      // Feet track the vinyl passing underneath (ω·r over stride speed),
      // but square-rooted around the track-start radius: fully physical
      // cadence halves the stride by the label, which reads as wading, not
      // running. Softened, the spiral-in still slows the runner — gently.
      // Paused, the clip freezes mid-stride (spec §8.8) — the disc is frozen
      // too, so switching to Idle would read as the runner giving up.
      const omega = RAD_PER_BEAT * (bpm / 60); // rad/s
      const ref = band.startRadius;
      const soft = ref * Math.sqrt(Math.max(0, radius) / ref);
      actions.Running_A.timeScale = clockState.paused
        ? 0
        : (omega * soft) / STRIDE_SPEED;
    }
  });

  return (
    <group ref={group} rotation-y={Math.PI / 2} scale={RUNNER_SCALE}>
      {/* the bank pivots at the feet, on the running axis */}
      <group ref={body}>
        <primitive object={scene} />
        {head && <Headphones head={head} />}
      </group>
      {/* contact shadow — a dark disc sprite, not a shadow map (spec §9) */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.015}>
        <circleGeometry args={[0.9, 24]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.35} />
      </mesh>
    </group>
  );
}

useGLTF.preload("/models/runner.glb");
