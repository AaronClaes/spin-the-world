import * as Tone from "tone";

// One switch for the whole game.
//
// It goes on Tone's Destination, which sits downstream of both the music
// master and the SFX channel, so nothing has to be muted twice. Crucially it
// uses `mute` rather than a volume move: master volume is already driven by
// the preview fades, the alive swell and the record-skip duck (music/rig.ts),
// and a mute that wrote volume would fight all three — unmuting mid-duck
// would restore the wrong level.
//
// Nothing here starts or stops the Transport. Muted, the record keeps
// turning and the run keeps scoring; you just can't hear it, so unmuting
// drops you back into the music where it actually is rather than where you
// left it.
export function applyMute(muted: boolean): void {
  try {
    Tone.getDestination().mute = muted;
  } catch {
    // no usable AudioContext yet — the preference is stored either way and
    // gets re-applied the next time it's toggled
  }
}
