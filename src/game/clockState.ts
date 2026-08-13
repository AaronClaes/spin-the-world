// Frame-rate state lives OUTSIDE the React render path (spec §16). One
// driver component writes it in useFrame; everything else reads it there.
export const clockState = {
  beatPos: 0,
  playing: false,
  ended: false,
  // Interpolated lane for visuals (runner radius, camera lean). The committed
  // integer lane lives in the store; collection never reads this.
  laneVisual: 1,
};
