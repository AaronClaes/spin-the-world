import { useAnimations, useGLTF } from "@react-three/drei";
import { createPortal, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { Group, Object3D } from "three";
import { songProgress } from "../game/clock";
import { DISC_THICKNESS, RAD_PER_BEAT } from "../game/constants";
import { clockState } from "../game/clockState";
import { bandCenter, laneRadius } from "../game/geometry";
import { meadow } from "../records/meadow";

// The listener (spec §8.2): KayKit's rig and run clip (CC0, Kay Lousberg),
// reworked by scripts/build-runner.mjs — armor accessories and helmet gone,
// flat repaint, only Running_A + Idle kept. The oversized headphones are
// built here from primitives and portalled onto the head bone so they follow
// the animation. At ~130px tall the silhouette and the accent colour do all
// the work.

// Character is ~2.47 units tall in the GLB; scale to sit small on a radius-5 disc.
const RUNNER_SCALE = 0.2;

// Surface speed (ω·r, game units/s) at which the run clip plays at
// timeScale 1. Tuned by eye in the middle lane (spec §8.2); after that the
// cadence is automatically correct in every lane because both sides of the
// ratio are physical.
const STRIDE_SPEED = 5.0;

const DISC_TOP = DISC_THICKNESS / 2;

// Sized in head-bone space — the KayKit head is chibi-huge, which is exactly
// what makes oversized headphones read at gameplay distance.
// The head bone sits at the head's base; the chibi head spans y 0→1.08 and
// x ±0.54 in bone space. Band arc lies in the XY plane (ear to ear over the
// crown); cups press onto the sides just proud of the head.
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
          {/* accent ring on the outer face — the one colour that carries it */}
          <mesh position-y={0.09}>
            <cylinderGeometry args={[0.2, 0.2, 0.02, 18]} />
            <meshStandardMaterial
              color={meadow.accentColor}
              emissive={meadow.accentColor}
              emissiveIntensity={0.6}
              roughness={0.4}
            />
          </mesh>
        </group>
      ))}
    </group>,
    head,
  );
}

export function Runner() {
  const group = useRef<Group>(null);
  const { scene, animations } = useGLTF("/models/runner.glb");
  const { actions } = useAnimations(animations, group);
  const wasPlaying = useRef(false);

  const head = useMemo(() => scene.getObjectByName("head") ?? null, [scene]);

  useEffect(() => {
    actions.Idle?.reset().play();
  }, [actions]);

  useFrame(() => {
    if (!group.current) return;

    const progress = songProgress(clockState.beatPos, meadow.totalBeats);
    const center = bandCenter(
      progress,
      meadow.band.startRadius,
      meadow.band.endRadius,
    );
    const radius = laneRadius(
      clockState.laneVisual,
      center,
      meadow.band.laneGap,
    );
    group.current.position.set(0, DISC_TOP, radius);

    const running = clockState.playing && !clockState.ended;
    if (running !== wasPlaying.current) {
      wasPlaying.current = running;
      if (running) {
        actions.Idle?.stop();
        actions.Running_A?.reset().play();
      } else {
        actions.Running_A?.stop();
        actions.Idle?.reset().play();
      }
    }

    if (running && actions.Running_A) {
      // Feet must match the vinyl passing underneath: ω·r over stride speed.
      // Paused, the clip freezes mid-stride (spec §8.8) — the disc is frozen
      // too, so switching to Idle would read as the runner giving up.
      const omega = RAD_PER_BEAT * (meadow.bpm / 60); // rad/s
      actions.Running_A.timeScale = clockState.paused
        ? 0
        : (omega * radius) / STRIDE_SPEED;
    }
  });

  return (
    <group ref={group} rotation-y={Math.PI / 2} scale={RUNNER_SCALE}>
      <primitive object={scene} />
      {head && <Headphones head={head} />}
      {/* contact shadow — a dark disc sprite, not a shadow map (spec §9) */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.015}>
        <circleGeometry args={[0.9, 24]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.35} />
      </mesh>
    </group>
  );
}

useGLTF.preload("/models/runner.glb");
