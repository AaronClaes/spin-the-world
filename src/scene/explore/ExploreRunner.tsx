import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Ecctrl, type EcctrlHandle } from "ecctrl";
import {
  EcctrlAnimationStateController,
  useEcctrlAnimationStore,
} from "ecctrl/animation";
import { EcctrlCameraControls } from "ecctrl/camera";
import type { EcctrlCameraControlsHandle } from "ecctrl/camera";
import { useEffect, useMemo, useRef } from "react";
import type { Group } from "three";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { RUNNER_H, RUNNER_SCALE } from "./scale";
import { useExploreInput } from "./useExploreInput";

// The listener, off the record and onto the island. Same GLB the groove uses
// (scene/Runner.tsx) — the walk and the three jump clips are in it for this
// and nothing else, which is why they're built into the same file rather than
// a second character that would have to be repainted in step with the first.

// Ecctrl reports a movement state; the clips are ours. JUMP_FALL reuses the
// airborne loop: the pack has no dedicated fall and Jump_Idle already reads as
// hanging in the air rather than as rising.
const CLIP_FOR = {
  IDLE: "Idle",
  WALK: "Walking_A",
  RUN: "Running_A",
  JUMP_START: "Jump_Start",
  JUMP_IDLE: "Jump_Idle",
  JUMP_FALL: "Jump_Idle",
  JUMP_LAND: "Jump_Land",
} as const;

const FADE = 0.15;

// A capsule the height of the character, rather than Ecctrl's default 1.3m:
// the whole point of the scale work is that the player is a fixed 1.8m ruler,
// and a collider that disagrees with the model is what makes a character look
// like it's floating or sunk into the floor.
const CAPSULE_R = 0.35;
const CAPSULE_HALF = RUNNER_H / 2 - CAPSULE_R;
// Feet at the bottom of the capsule.
const MODEL_Y = -(CAPSULE_HALF + CAPSULE_R);

function RunnerModel() {
  const group = useRef<Group>(null);
  const { scene, animations } = useGLTF("/models/runner.glb");
  // The groove's Runner mounts this same GLB, and an Object3D has one parent —
  // so this has to be a skeleton-aware clone, not the loaded scene.
  const model = useMemo(() => cloneSkinned(scene), [scene]);
  const { actions } = useAnimations(animations, group);
  const state = useEcctrlAnimationStore((s) => s.animationState);

  useEffect(() => {
    model.traverse((o) => {
      o.castShadow = true;
    });
  }, [model]);

  useEffect(() => {
    const action = actions[CLIP_FOR[state]];
    if (!action) return;
    action.reset().fadeIn(FADE).play();
    return () => {
      action.fadeOut(FADE);
    };
  }, [actions, state]);

  return (
    <group ref={group} position-y={MODEL_Y} scale={RUNNER_SCALE}>
      <primitive object={model} />
    </group>
  );
}

export function ExploreRunner({
  spawn,
}: {
  spawn: [number, number, number];
}) {
  const ecctrl = useRef<EcctrlHandle>(null);
  const camera = useRef<EcctrlCameraControlsHandle>(null);
  useExploreInput(ecctrl);

  useEffect(() => {
    const c = camera.current;
    if (!c) return;
    c.minDistance = 2;
    c.maxDistance = 40;
    // Stops the orbit dropping under the plate, which from below is a view of
    // the back of the label.
    c.maxPolarAngle = Math.PI * 0.49;
    // Arrive looking INWARD, from just off the coast. The spawn is the tile
    // furthest from the middle, so the camera goes further out along the same
    // radius — anywhere else and the first thing you see is the runner against
    // the sky with the whole island behind the camera.
    const out = Math.hypot(spawn[0], spawn[2]);
    const rx = out > 0.001 ? spawn[0] / out : 0;
    const rz = out > 0.001 ? spawn[2] / out : 1;
    c.setLookAt(
      spawn[0] + rx * 7,
      spawn[1] + 4,
      spawn[2] + rz * 7,
      spawn[0],
      spawn[1] + 1,
      spawn[2],
      false,
    );
  }, [spawn]);

  useFrame(() => {
    const handle = ecctrl.current;
    const c = camera.current;
    if (!handle || !c) return;
    // EcctrlCameraControls is Drei's CameraControls with a settable up axis; it
    // does not follow anything by itself.
    const at = handle.currPos;
    c.moveTo(at.x, at.y, at.z, true);
  });

  return (
    <>
      <EcctrlAnimationStateController ecctrl={ecctrl} />
      <Ecctrl
        ref={ecctrl}
        position={spawn}
        capsuleRadius={CAPSULE_R}
        capsuleHalfHeight={CAPSULE_HALF}
        maxWalkVel={2.4}
        maxRunVel={5}
        jumpVel={5}
        slopeMaxAngle={1}
      >
        <RunnerModel />
      </Ecctrl>
      <EcctrlCameraControls ref={camera} makeDefault smoothTime={0.12} />
    </>
  );
}

useGLTF.preload("/models/runner.glb");
