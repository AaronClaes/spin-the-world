import { useEffect } from "react";
import { loadProgress } from "../game/persistence";
import { meadow } from "../records/meadow";

interface Props {
  onStart: () => void;
  onBack: () => void;
}

// The breath between picking a record and playing it: the camera has
// already dived from the wall to the turntable, and this card floats over
// the parked disc with the score to beat, the how-to, and the needle drop.
// The Start click is the user gesture that unlocks the AudioContext.
export function ReadyOverlay({ onStart, onBack }: Props) {
  const progress = loadProgress(meadow.id);
  const pieces = meadow.worldPieces.length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  return (
    <div className="overlay ready">
      <h1 className="pop-in">{meadow.title}</h1>
      <p className="verdict pop-in d1">
        {progress.highScore > 0 ? (
          <>
            score to beat ·{" "}
            <strong>{progress.highScore.toLocaleString()}</strong>
          </>
        ) : (
          "a fresh groove — no score on this record yet"
        )}
      </p>

      <ul className="howto pop-in d2">
        <li>
          <span className="howto-glyph">♪</span>
          <span>
            run the spinning groove and catch the notes as they reach you —
            misses break your combo
          </span>
        </li>
        <li className="keys">
          <span className="howto-glyph">⇄</span>
          <span>← → or A / D switch lanes · Esc pauses</span>
        </li>
        <li className="touch">
          <span className="howto-glyph">⇄</span>
          <span>tap the left / right half of the screen to switch lanes</span>
        </li>
        <li>
          <span className="howto-glyph">★</span>
          <span>
            catch all {pieces} glowing pieces to bring the tiny world alive
          </span>
        </li>
      </ul>

      <div className="menu pop-in d3">
        <button onClick={onStart}>Drop the needle</button>
        <button className="secondary" onClick={onBack}>
          Back to the wall
        </button>
      </div>
    </div>
  );
}
