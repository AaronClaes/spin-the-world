import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Ecctrl, type EcctrlHandle } from "ecctrl";
import {
  EcctrlAnimationStateController,
  useEcctrlAnimationStore,
} from "ecctrl/animation";
import { EcctrlCameraControls } from "ecctrl/camera";
import type { EcctrlCameraControlsHandle } from "ecctrl/camera";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { Group } from "three";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { arrivalPose, type CamPose, RUNNER_H, RUNNER_SCALE } from "./scale";
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

// The arrival. Long enough to be a shot rather than a transition — you get to
// look at the record with a world on it, and then the world is what you're
// standing in, which is the whole promise of the mode and the one moment it can
// be made in one move.
const DIVE_SECS = 2.6;
const SKIP_SECS = 0.35;
// How far out the player can orbit once they've landed. About two and a half
// island radii at SCALE 16 — the whole plate in frame, and no further, because
// past that you're looking at the empty vinyl the island sits on.
const ORBIT_MAX = 40;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const distanceOf = (p: CamPose) =>
  Math.hypot(
    p.position[0] - p.target[0],
    p.position[1] - p.target[1],
    p.position[2] - p.target[2],
  );

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
  from,
}: {
  spawn: [number, number, number];
  from: CamPose; // the establishing shot the camera is already sitting on
}) {
  const ecctrl = useRef<EcctrlHandle>(null);
  const camera = useRef<EcctrlCameraControlsHandle>(null);
  useExploreInput(ecctrl);

  // Elapsed seconds of the arrival flight; null once it has landed and the
  // camera is following him instead.
  const dive = useRef<number | null>(null);

  // Layout, not passive: this hands the controls their target inside the same
  // commit that mounts them, so no frame is drawn in between. They arrive
  // pointed at the establishing shot the camera is already on (ExploreWorld's
  // Arrival), and this only has to agree with it.
  useLayoutEffect(() => {
    const c = camera.current;
    if (!c) return;
    c.minDistance = 2;
    // Raised for the length of the flight only: the establishing pose is
    // further out than anything the player should be able to orbit to once
    // they're standing on the island, and CameraControls clamps setLookAt.
    c.maxDistance = Math.max(ORBIT_MAX, distanceOf(from) * 1.05);
    // Stops the orbit dropping under the plate, which from below is a view of
    // the back of the label.
    c.maxPolarAngle = Math.PI * 0.49;
    c.setLookAt(...from.position, ...from.target, false);
    dive.current = 0;
  }, [from]);

  // Any input during the flight is a request to be down there now, so it
  // collapses the rest of the descent into a third of a second rather than
  // cutting — a snap from halfway through a dive is worse than the dive.
  useEffect(() => {
    const skip = () => {
      if (dive.current !== null)
        dive.current = Math.max(dive.current, DIVE_SECS - SKIP_SECS);
    };
    window.addEventListener("keydown", skip);
    window.addEventListener("pointerdown", skip);
    return () => {
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
    };
  }, []);

  useFrame((_, delta) => {
    const handle = ecctrl.current;
    const c = camera.current;
    if (!handle || !c) return;
    const at = handle.currPos;

    if (dive.current !== null) {
      dive.current += Math.min(delta, 1 / 30); // a hitch shouldn't skip it
      const u = Math.min(1, dive.current / DIVE_SECS);
      // The same take-off-and-landing curve as the needle-drop dive
      // (scene/CameraRig.tsx): an exponential chase is at full speed on frame
      // one, which over a drop this long reads as a jolt.
      const e = u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
      // Aimed at where he actually is rather than at the spawn, so walking off
      // mid-flight is followed down instead of fought.
      const to = arrivalPose([at.x, at.y, at.z]);
      c.setLookAt(
        lerp(from.position[0], to.position[0], e),
        lerp(from.position[1], to.position[1], e),
        lerp(from.position[2], to.position[2], e),
        lerp(from.target[0], to.target[0], e),
        lerp(from.target[1], to.target[1], e),
        lerp(from.target[2], to.target[2], e),
        false,
      );
      if (u >= 1) {
        dive.current = null;
        c.maxDistance = ORBIT_MAX;
      }
      return;
    }

    // EcctrlCameraControls is Drei's CameraControls with a settable up axis; it
    // does not follow anything by itself.
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
