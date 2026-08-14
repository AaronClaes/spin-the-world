import { loadProgress } from "../game/persistence";
import { meadow } from "../records/meadow";

interface Props {
  onStart: () => void;
}

// The studio wall IS the title screen (spec §8.7): records hang framed like
// plaques. An uncompleted record hangs as its sleeve; a completed one hangs
// gold with its stars beneath it. Clicking one drops the needle — that click
// is also the user gesture that unlocks the AudioContext. The empty frames
// are the wall being honest about scope: one world shipped, room for more.
export function StudioWall({ onStart }: Props) {
  const progress = loadProgress(meadow.id);

  return (
    <div className="overlay wall">
      <header className="wall-head">
        <h1>Locked Groove</h1>
        <p>
          Every record holds a tiny world. Run the groove, play it into
          existence.
        </p>
      </header>

      <div className="frames">
        <div className="frame">
          <button
            className={progress.completed ? "record gold" : "record"}
            onClick={onStart}
            aria-label={`Play ${meadow.title}`}
          >
            <span className="record-disc">
              <span className="record-label" />
            </span>
          </button>
          <div className="plaque">
            <div className="plaque-title">{meadow.title}</div>
            <div
              className="plaque-stars"
              aria-label={`${progress.stars} of 3 stars`}
            >
              {[0, 1, 2].map((i) => (
                <span key={i} className={i < progress.stars ? "" : "off"}>
                  ★
                </span>
              ))}
            </div>
            {progress.highScore > 0 && (
              <div className="plaque-score">
                best {progress.highScore.toLocaleString()}
              </div>
            )}
          </div>
        </div>

        {["II", "III"].map((n) => (
          <div key={n} className="frame empty" aria-hidden="true">
            <div className="record vacant" />
            <div className="plaque">
              <div className="plaque-title dim">
                vol. {n} — still being pressed
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="wall-hint keys">
        click the record to drop the needle · ← → or A/D to switch grooves · Esc
        pauses
      </p>
      <p className="wall-hint touch">
        tap the record to drop the needle · tap the left / right half of the
        screen to switch grooves
      </p>

      <footer className="credits">
        <p>
          a Three.js Game Jam entry · theme: tiny worlds · music sequenced with{" "}
          <a href="https://tonejs.github.io/" target="_blank" rel="noreferrer">
            Tone.js
          </a>
        </p>
        <p>
          runner and props from the CC0 packs of{" "}
          <a
            href="https://kaylousberg.itch.io/"
            target="_blank"
            rel="noreferrer"
          >
            Kay Lousberg (KayKit)
          </a>{" "}
          and{" "}
          <a href="https://quaternius.com/" target="_blank" rel="noreferrer">
            Quaternius
          </a>{" "}
          (via poly.pizza) · built with React Three Fiber
        </p>
      </footer>
    </div>
  );
}
