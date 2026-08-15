import { useState } from "react";
import { InfoPanel } from "./InfoPanel";

// The studio wall IS the title screen (spec §8.7). The wall, frames, and
// records are real 3D now (scene/WallScene.tsx) — a completed record hangs
// as the actual vinyl with its tiny world alive on the label. This overlay
// only carries the type: title, input hints, and the ⓘ that opens the
// credits. It must not eat pointer events; the record on the wall is the
// button, and clicking it is the user gesture that unlocks the AudioContext.
export function StudioWall() {
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
        <p className="wall-hint keys">
          click the record to drop the needle · ← → or A/D to switch grooves ·
          Esc pauses
        </p>
        <p className="wall-hint touch">
          tap the record to drop the needle · tap the left / right half of the
          screen to switch grooves
        </p>
      </div>

      {/* absolute, so the head/foot keep their space-between split */}
      <button className="info-button" onClick={() => setInfo(true)}>
        credits
      </button>

      {info && <InfoPanel onClose={() => setInfo(false)} />}
    </div>
  );
}
