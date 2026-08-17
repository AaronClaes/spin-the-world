// Frame-rate state lives OUTSIDE the React render path (spec §16). One
// driver component writes it in useFrame; everything else reads it there.
export const clockState = {
  beatPos: 0,
  playing: false,
  ended: false,
  // Pause is free (spec §8.8): the Transport pauses, so beatPos — and with it
  // the disc, items, and music — freezes with zero extra state. This flag
  // only gates input and the run clip's timeScale.
  paused: false,
  // On the studio wall (title screen). The camera rig flies between the wall
  // pose and the game pose; dropping the needle is a camera dive.
  wall: true,
  // Walking around a finished record. A third camera state, and the only one
  // the rig doesn't drive: Ecctrl's controls own the camera outright while
  // this is set, so CameraRig has to stand down rather than fight it.
  explore: false,
  // Interpolated lane for visuals (runner radius, camera lean). The committed
  // integer lane lives in the store; collection never reads this.
  laneVisual: 1,
  // One small camera impulse on a record-skip (spec §8.6) — set to 1 by the
  // resolve loop, decayed by the camera rig.
  skipImpulse: 0,
};
