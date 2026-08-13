import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { Vector3 } from "three";
import { songProgress } from "../game/clock";
import { clockState } from "../game/clockState";
import { bandCenter } from "../game/geometry";
import { meadow } from "../records/meadow";

// Two movements, both subtle (spec §8.6): a slow dolly tracking the band as
// it spirals inward (same framing at beat 0 and beat 176), and a small
// lateral lean toward the target lane so the world responds to input.
// Base placement: behind the runner along the running direction (+X), up and
// back, biased toward the disc centre so the label diorama stays in frame.

const LEAN_FRACTION = 0.18;

const camTarget = new Vector3();
const lookTarget = new Vector3();

export function CameraRig() {
  const look = useRef(new Vector3(2.0, 0.1, 3.2));

  useFrame(({ camera }, delta) => {
    const progress = songProgress(clockState.beatPos, meadow.totalBeats);
    const center = bandCenter(
      progress,
      meadow.band.startRadius,
      meadow.band.endRadius,
    );
    const lean =
      (clockState.laneVisual - 1) * meadow.band.laneGap * LEAN_FRACTION;

    camTarget.set(-3.9, 3.1, center + 2.1 + lean);
    lookTarget.set(2.0, 0.1, center * 0.72 + lean);

    const k = 1 - Math.exp(-3.5 * delta);
    camera.position.lerp(camTarget, k);
    look.current.lerp(lookTarget, k);
    camera.lookAt(look.current);
  });

  return null;
}
