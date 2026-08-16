import { useEffect, useState } from "react";
import { applyMute } from "../audio/mute";
import { loadMuted, saveMuted } from "../game/persistence";
import { SpeakerSimpleHigh, SpeakerSimpleSlash } from "./icons";

// The only control that exists on every screen. Rendered from App rather than
// from any one overlay, because "I need this quiet NOW" is not a request that
// waits for you to get back to the wall — and because the wall itself starts
// playing the moment you select a record.
export function MuteButton() {
  const [muted, setMuted] = useState(loadMuted);

  // Runs on mount as well as on every toggle, which is what carries a muted
  // preference across a reload — the AudioContext may not exist yet, and
  // applyMute is a no-op until it does.
  useEffect(() => {
    applyMute(muted);
    saveMuted(muted);
  }, [muted]);

  const label = muted ? "Unmute" : "Mute";
  const Icon = muted ? SpeakerSimpleSlash : SpeakerSimpleHigh;
  return (
    <button
      className="corner-button mute-button"
      onClick={() => setMuted((m) => !m)}
      aria-label={label}
      aria-pressed={muted}
      title={label}
    >
      <Icon weight="fill" />
    </button>
  );
}
