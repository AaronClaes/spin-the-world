import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { PerspectiveCamera } from "three";
import { Vector3 } from "three";
import { songProgress } from "../game/clock";
import { clockState } from "../game/clockState";
import { bandCenter } from "../game/geometry";
import { activeRun } from "../game/runState";
import { WALL_CAM_POS, WALL_LOOK_AT } from "./WallScene";

// Two movements, both subtle (spec §8.6): a slow dolly tracking the band as
// it spirals inward, and a small lateral lean toward the target lane so the
// world responds to input. Base placement: behind the runner along the
// running direction (+X), up and back, biased toward the disc centre so the
// label diorama stays in frame.

const LEAN_FRACTION = 0.22;

// How far in front of the runner the camera aims, radially. The band migrates
// from radius 4.4 to 2.0 while the label stays at 0, so the gap the frame has
// to span between "the groove you're on" and "the world you're building" more
// than halves over the run — and a rig rigid to the runner can't hold both
// ends of that. The spec asks for both a pure dolly (§8.6: "the framing at
// beat 0 and beat 176 is the same framing") and for the world to be visible
// the entire run; those are mutually exclusive here, and a true pure dolly is
// the worse of the two — it aims further OUT at the start than this does.
//
// So the aim only mostly tracks the runner: most of it is anchored near the
// label. Measured at beat 0, this moves the island's left edge from -2.6% of
// screen width (i.e. clipped off frame) to +10.9%. AIM_TRACK*2 + AIM_ANCHOR
// is deliberately 1.44, which is exactly where the old aim landed at the end
// of the track — the ending framing is unchanged to the pixel, and the only
// thing this touches is the opening. The cost is the runner sitting ~9%
// further right at the start, and the yaw swinging 14° over the run rather
// than 5° — spread across 88 seconds, neither reads as camera movement.
const AIM_TRACK = 0.2;
const AIM_ANCHOR = 1.04;

// The framing above is horizontal — the island is already vertically centred
// at beat 0 — and fov is vertical, so a window narrower than 16:9 crops the
// label straight back off the side (at 4:3 it was landing at -20%). Hold the
// HORIZONTAL angle instead and let the vertical open up, which is the trade
// that keeps a composition rather than the one that destroys it. The clamp is
// for genuinely portrait windows, where the distortion of a 70°+ vertical fov
// is worse than the crop it's buying off.
const BASE_FOV = 42;
const REF_ASPECT = 16 / 9;
const MAX_FOV = 70;

export const fovForAspect = (aspect: number): number =>
  aspect >= REF_ASPECT
    ? BASE_FOV
    : Math.min(
        MAX_FOV,
        2 *
          Math.atan(
            Math.tan((BASE_FOV / 2) * (Math.PI / 180)) * (REF_ASPECT / aspect),
          ) *
          (180 / Math.PI),
      );

// The wall ⇄ record dive is a timed, eased flight rather than the
// exponential chase used during play: an exp lerp is at full speed on frame
// one and crawls at the end, which reads as a jolt over a 60-unit drop.
// Ease-in-out gives it a take-off and a landing.
const FLIGHT_SECS = 2.0;

// Coming back from the island is the one return trip that must NOT be flown.
// The room hangs 60 units under the deck and the wall itself is a plane, so a
// flight from wherever the explore camera happened to be orbiting can cross
// behind it — and from behind, a wall is a sheet of paper with a room painted
// on one side. Cut to the wall instead and play a short arrival there: the
// same information, none of the exposure. (See §8.7 — the room is a place, and
// the only thing that ever says otherwise is a camera that walks around it.)
const INTRO_SECS = 1.0;
// Where that arrival starts: the wall pose, pulled back and lifted a touch, so
// the room settles into frame rather than appearing in it.
const INTRO_BACK = 0.8;
const INTRO_UP = 0.1;

const camTarget = new Vector3();
const lookTarget = new Vector3();
const WALL_POS = new Vector3(...WALL_CAM_POS);
const WALL_LOOK = new Vector3(...WALL_LOOK_AT);
const INTRO_POS = new Vector3(
  WALL_CAM_POS[0],
  WALL_CAM_POS[1] + INTRO_UP,
  WALL_CAM_POS[2] + INTRO_BACK,
);

export function CameraRig() {
  const cam = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const look = useRef(WALL_LOOK.clone());
  const prevWall = useRef(clockState.wall);
  const prevExplore = useRef(clockState.explore);
  const flight = useRef<{
    t: number;
    secs: number;
    fromPos: Vector3;
    fromLook: Vector3;
  } | null>(null);

  // r3f owns aspect on resize and leaves fov alone, so this effect runs after
  // it and only has to put the vertical angle back.
  useEffect(() => {
    cam.fov = fovForAspect(size.width / size.height);
    cam.updateProjectionMatrix();
  }, [cam, size]);

  useFrame(({ camera, clock }, delta) => {
    // Explore mode's camera controls are makeDefault and call lookAt
    // themselves; two writers on one camera is a fight neither wins. Bailing
    // rather than unmounting keeps the rig's flight state intact, so coming
    // back to the wall from explore flies from wherever Ecctrl left the camera.
    if (clockState.explore) {
      prevWall.current = clockState.wall;
      prevExplore.current = true;
      return;
    }
    const leftTheIsland = prevExplore.current;
    prevExplore.current = false;

    // a wall flip (needle-drop dive or back-to-wall) starts a flight from
    // wherever the camera is right now — except off the island, which cuts to
    // the room and arrives there instead of travelling to it
    if (clockState.wall !== prevWall.current) {
      prevWall.current = clockState.wall;
      flight.current = leftTheIsland
        ? { t: 0, secs: INTRO_SECS, fromPos: INTRO_POS.clone(), fromLook: WALL_LOOK.clone() }
        : {
            t: 0,
            secs: FLIGHT_SECS,
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
      lookTarget.set(2.0, 0.1, center * AIM_TRACK + AIM_ANCHOR + lean);
    }

    if (flight.current) {
      const f = flight.current;
      f.t += Math.min(delta, 1 / 30); // a tab-switch spike shouldn't skip it
      const u = Math.min(1, f.t / f.secs);
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
