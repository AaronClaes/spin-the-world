import { useEffect, useState } from "react";
import { applyMute } from "../audio/mute";
import { loadMuted, saveMuted } from "../game/persistence";

interface Props {
  // The HUD's pause button owns the top-right corner while a run is on, so
  // mute steps one slot to its left rather than stacking on top of it.
  besidePause: boolean;
}

// The only control that exists on every screen. Rendered from App rather than
// from any one overlay, because "I need this quiet NOW" is not a request that
// waits for you to get back to the wall — and because the wall itself starts
// playing the moment you select a record.
export function MuteButton({ besidePause }: Props) {
  const [muted, setMuted] = useState(loadMuted);

  // Runs on mount as well as on every toggle, which is what carries a muted
  // preference across a reload — the AudioContext may not exist yet, and
  // applyMute is a no-op until it does.
  useEffect(() => {
    applyMute(muted);
    saveMuted(muted);
  }, [muted]);

  return (
    <button
      className={`mute-button${besidePause ? " beside-pause" : ""}`}
      onClick={() => setMuted((m) => !m)}
      aria-label={muted ? "Unmute" : "Mute"}
      aria-pressed={muted}
      title={muted ? "Unmute" : "Mute"}
    >
      {/* Drawn rather than set in type: the speaker emoji renders in colour on
          some platforms and monochrome on others, and this sits next to a
          plain ⏸ glyph that is monochrome everywhere. */}
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M3 9v6h4l5 4V5L7 9H3z" />
        {muted ? (
          <path className="stroke" d="M16 9.5l5 5M21 9.5l-5 5" />
        ) : (
          <path
            className="stroke"
            d="M15.4 8.6a4.8 4.8 0 0 1 0 6.8M18.3 5.7a8.9 8.9 0 0 1 0 12.6"
          />
        )}
      </svg>
    </button>
  );
}
