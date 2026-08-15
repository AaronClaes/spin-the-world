import { useState } from "react";
import type { RecordDef } from "../records/types";
import { InfoPanel } from "./InfoPanel";

// The studio wall IS the title screen (spec §8.7). The wall, frames, and
// records are real 3D (scene/WallScene.tsx) — a completed record hangs as the
// actual vinyl with its tiny world alive on the label. This overlay only
// carries the type: title, the prompt or the play button, and the ⓘ that
// opens the credits. It must not eat pointer events; the records themselves
// are what you click.
//
// Nothing is selected when the page loads, and that's load-bearing rather
// than a default: the click that selects a record is the user gesture that
// unlocks the AudioContext, so the preview can start the instant there is
// something to preview and there is never a moment where the app wants sound
// it isn't allowed to make (audio/transport.ts startPreview).
export function StudioWall({
  selected,
  onPlay,
}: {
  selected: RecordDef | null;
  onPlay: () => void;
}) {
  const [info, setInfo] = useState(false);

  return (
    <div className="overlay wall">
      <header className="wall-head">
        <h1>Spin the World</h1>
        <p>
          Every record holds a tiny world. Run the groove, play it into
          existence.
        </p>
      </header>

      <div className="wall-foot">
        {selected ? (
          <>
            <button className="play-button" onClick={onPlay}>
              Play {selected.title}
            </button>
            {/* the how-to the ready card used to carry, now that pressing
                play goes straight to the count */}
            <p className="wall-hint keys">
              catch all {selected.worldPieces.length} glowing pieces to bring
              the world alive · ← → or A/D switch grooves · Esc pauses
            </p>
            <p className="wall-hint touch">
              catch all {selected.worldPieces.length} glowing pieces to bring
              the world alive · tap the left / right half to switch grooves
            </p>
          </>
        ) : (
          <p className="wall-prompt">Select a record</p>
        )}
      </div>

      {/* absolute, so the head/foot keep their space-between split */}
      <button className="info-button" onClick={() => setInfo(true)}>
        credits
      </button>

      {info && <InfoPanel onClose={() => setInfo(false)} />}
    </div>
  );
}
