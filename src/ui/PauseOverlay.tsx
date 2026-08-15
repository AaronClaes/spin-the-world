import { activeRun } from "../game/runState";
import { useGameStore } from "../game/store";
import { PieceDots } from "./PieceDots";

interface Props {
  onResume: () => void;
  onRestart: () => void;
  onWall: () => void;
}

// Pause is Transport.pause() (spec §8.8) — the world behind this overlay is
// genuinely frozen, music and all, so the overlay stays translucent to show
// it off. The card carries the two numbers the HUD was showing, because
// pausing is when you actually want to read them.
export function PauseOverlay({ onResume, onRestart, onWall }: Props) {
  const score = useGameStore((s) => s.score);
  const collected = useGameStore((s) => s.piecesCollected);
  const total = activeRun.record.worldPieces.length;

  return (
    <div className="overlay results paused">
      <h1>Paused</h1>

      <div className="stat-grid pause-stats">
        <div className="stat-cell">
          <span className="stat-value big">{score.toLocaleString()}</span>
          <span className="stat-label">score</span>
        </div>
        <div className="stat-cell">
          <PieceDots inline />
          <span className="stat-label">
            {collected.length} of {total} pieces
          </span>
        </div>
      </div>

      <div className="menu">
        <button onClick={onResume} autoFocus>
          Resume
        </button>
        <button className="secondary" onClick={onRestart}>
          Restart record
        </button>
        <button className="secondary" onClick={onWall}>
          Back to the wall
        </button>
      </div>
    </div>
  );
}
