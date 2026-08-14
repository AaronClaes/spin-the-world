// The studio wall IS the title screen (spec §8.7). The wall, frames, and
// records are real 3D now (scene/WallScene.tsx) — a completed record hangs
// as the actual vinyl with its tiny world alive on the label. This overlay
// only carries the type: title, input hints, credits. It must not eat
// pointer events; the record on the wall is the button, and clicking it is
// the user gesture that unlocks the AudioContext.
export function StudioWall() {
  return (
    <div className="overlay wall">
      <header className="wall-head">
        <h1>Locked Groove</h1>
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

        <footer className="credits">
          <p>
            a Three.js Game Jam entry · theme: tiny worlds · music sequenced
            with{" "}
            <a
              href="https://tonejs.github.io/"
              target="_blank"
              rel="noreferrer"
            >
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
    </div>
  );
}
