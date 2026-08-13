// Frame-rate state lives OUTSIDE the React render path (spec §16). One
// driver component writes it in useFrame; everything else reads it there.
export const clockState = {
  beatPos: 0,
  playing: false,
  ended: false,
};
