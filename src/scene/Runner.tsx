import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { Group } from "three";
import { songProgress } from "../game/clock";
import { DISC_THICKNESS, RAD_PER_BEAT } from "../game/constants";
import { clockState } from "../game/clockState";
import { bandCenter, laneRadius } from "../game/geometry";
import { meadow } from "../records/meadow";

// KayKit Adventurers Knight (CC0, Kay Lousberg) — placeholder until the M4
// art pass swaps in the headphones runner. Weapon/shield accessory nodes are
// baked into the GLB; hide them.
const HIDDEN_NODES = new Set([
  "1H_Sword",
  "2H_Sword",
  "1H_Sword_Offhand",
  "Badge_Shield",
  "Rectangle_Shield",
  "Round_Shield",
  "Spike_Shield",
]);

// Character is ~2.47 units tall in the GLB; scale to sit small on a radius-5 disc.
const RUNNER_SCALE = 0.2;

// Surface speed (ω·r, game units/s) at which the run clip plays at
// timeScale 1. Tuned by eye in the middle lane (spec §8.2); after that the
// cadence is automatically correct in every lane because both sides of the
// ratio are physical.
const STRIDE_SPEED = 5.0;

const DISC_TOP = DISC_THICKNESS / 2;

export function Runner() {
  const group = useRef<Group>(null);
  const { scene, animations } = useGLTF("/models/runner.glb");
  const { actions } = useAnimations(animations, group);
  const wasPlaying = useRef(false);

  useEffect(() => {
    scene.traverse((node) => {
      if (HIDDEN_NODES.has(node.name)) node.visible = false;
    });
    actions.Idle?.reset().play();
  }, [scene, actions]);

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
      const omega = RAD_PER_BEAT * (meadow.bpm / 60); // rad/s
      actions.Running_A.timeScale = (omega * radius) / STRIDE_SPEED;
    }
  });

  return (
    <group ref={group} rotation-y={Math.PI / 2} scale={RUNNER_SCALE}>
      <primitive object={scene} />
      {/* contact shadow — a dark disc sprite, not a shadow map (spec §9) */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.015}>
        <circleGeometry args={[0.9, 24]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.35} />
      </mesh>
    </group>
  );
}

useGLTF.preload("/models/runner.glb");
