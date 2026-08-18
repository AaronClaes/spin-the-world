import { useState } from "react";
import { loadProgress } from "../game/persistence";
import type { RecordDef } from "../records/types";
import { exploreSupported } from "./exploreSupported";
import { GithubLogo } from "./icons";
import { InfoPanel } from "./InfoPanel";

const REPO_URL = "https://github.com/AaronClaes/spin-the-world";

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
  onExplore,
}: {
  selected: RecordDef | null;
  onPlay: () => void;
  onExplore: () => void;
}) {
  const [info, setInfo] = useState(false);
  // One star means the world was finished (game/score.ts: completion gates the
  // first star), so the gate and the reward are the same fact — there is no
  // such thing as a half-built island to walk around in. Read here rather than
  // held in state because the wall remounts on the way back from a run, which
  // is the only moment this can change.
  //
  // Earned it and can actually walk it: explore is keyboard-only, so a phone
  // never sees this button (ui/exploreSupported.ts).
  const walkable =
    selected !== null &&
    loadProgress(selected.id).stars >= 1 &&
    exploreSupported();

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
            {/* Side by side, not stacked. The foot grows upward from the
                bottom edge and the record plaques hang just above it, so a
                second row of buttons puts the play button through the middle
                record's stars — which reads fine and is unclickable, because
                an SVG star ends up on top of it. One row, same height as
                before, and the two doors out of the wall get equal billing. */}
            <div className="wall-actions">
              <button className="play-button" onClick={onPlay}>
                Play {selected.title}
              </button>
              {/* Only once it's been earned. A locked button here would teach
                  the goal, but the hint line below already does, and a reward
                  you didn't know existed is worth more than one you've been
                  looking at greyed out since the title screen. */}
              {walkable && (
                <button className="secondary walk-button" onClick={onExplore}>
                  Step inside
                </button>
              )}
            </div>
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

      {/* Absolute, so the head/foot keep their space-between split. Source
          before credits: the repo is the one of the two that's about the game
          rather than about the assets in it. */}
      <div className="wall-links">
        <a
          className="info-button"
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          // the label is hidden on small screens, and display:none takes it out
          // of the accessibility tree with it — so the name lives here instead
          aria-label="source on GitHub"
        >
          <GithubLogo weight="fill" aria-hidden />
          <span className="link-label">source</span>
        </a>
        <button className="info-button" onClick={() => setInfo(true)}>
          credits
        </button>
      </div>

      {info && <InfoPanel onClose={() => setInfo(false)} />}
    </div>
  );
}
