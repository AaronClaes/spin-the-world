import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { Vector3 } from "three";
import { songProgress } from "../game/clock";
import { clockState } from "../game/clockState";
import { bandCenter } from "../game/geometry";
import { activeRun } from "../game/runState";
import { WALL_CAM_POS, WALL_LOOK_AT } from "./WallScene";

// Two movements, both subtle (spec §8.6): a slow dolly tracking the band as
// it spirals inward (same framing at beat 0 and beat 176), and a small
// lateral lean toward the target lane so the world responds to input.
// Base placement: behind the runner along the running direction (+X), up and
// back, biased toward the disc centre so the label diorama stays in frame.

const LEAN_FRACTION = 0.22;

// The wall ⇄ record dive is a timed, eased flight rather than the
// exponential chase used during play: an exp lerp is at full speed on frame
// one and crawls at the end, which reads as a jolt over a 60-unit drop.
// Ease-in-out gives it a take-off and a landing.
const FLIGHT_SECS = 2.0;

const camTarget = new Vector3();
const lookTarget = new Vector3();
const WALL_POS = new Vector3(...WALL_CAM_POS);
const WALL_LOOK = new Vector3(...WALL_LOOK_AT);

export function CameraRig() {
  const look = useRef(WALL_LOOK.clone());
  const prevWall = useRef(clockState.wall);
  const flight = useRef<{
    t: number;
    fromPos: Vector3;
    fromLook: Vector3;
  } | null>(null);

  useFrame(({ camera, clock }, delta) => {
    // a wall flip (needle-drop dive or back-to-wall) starts a flight from
    // wherever the camera is right now
    if (clockState.wall !== prevWall.current) {
      prevWall.current = clockState.wall;
      flight.current = {
        t: 0,
        fromPos: camera.position.clone(),
        fromLook: look.current.clone(),
      };
    }

    if (clockState.wall) {
      // hanging on the studio wall — dropping the needle dives from here
      // down onto the record
      camTarget.copy(WALL_POS);
      lookTarget.copy(WALL_LOOK);
    } else {
      const { band, totalBeats } = activeRun.record;
      const progress = songProgress(clockState.beatPos, totalBeats);
      const center = bandCenter(progress, band.startRadius, band.endRadius);
      const lean = (clockState.laneVisual - 1) * band.laneGap * LEAN_FRACTION;

      camTarget.set(-3.9, 3.1, center + 2.1 + lean);
      lookTarget.set(2.0, 0.1, center * 0.72 + lean);
    }

    if (flight.current) {
      const f = flight.current;
      f.t += Math.min(delta, 1 / 30); // a tab-switch spike shouldn't skip it
      const u = Math.min(1, f.t / FLIGHT_SECS);
      const e = u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
      camera.position.lerpVectors(f.fromPos, camTarget, e);
      look.current.lerpVectors(f.fromLook, lookTarget, e);
      if (u >= 1) flight.current = null;
    } else {
      const k = 1 - Math.exp(-3.5 * delta);
      camera.position.lerp(camTarget, k);
      look.current.lerp(lookTarget, k);
    }
    camera.lookAt(look.current);

    // The one allowed shake (spec §8.6): a small impulse on a record-skip.
    if (clockState.skipImpulse > 0.001) {
      camera.position.y +=
        Math.sin(clock.elapsedTime * 55) * 0.045 * clockState.skipImpulse;
      clockState.skipImpulse *= Math.exp(-7 * delta);
    } else {
      clockState.skipImpulse = 0;
    }
  });

  return null;
}
