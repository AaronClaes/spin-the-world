import { useGameStore } from "../game/store";
import { activeRun } from "../game/runState";

interface Props {
  onPause: () => void;
}

// The shipping HUD: score + combo, one dot per world piece, pause. Everything
// else the scene already says — the tonearm is the progress bar and the
// diorama is the goal display.
export function Hud({ onPause }: Props) {
  const score = useGameStore((s) => s.score);
  const combo = useGameStore((s) => s.combo);
  const collected = useGameStore((s) => s.piecesCollected);
  const lost = useGameStore((s) => s.piecesLost);

  const pieces = activeRun.record.worldPieces;
  const total = pieces.length;
  // dots fill in collect order; lost pieces show as holes at the tail
  const dots = Array.from({ length: total }, (_, i) => {
    if (i < collected.length) return "got";
    if (i >= total - lost) return "lost";
    return "pending";
  });

  return (
    <>
      <div className="game-hud">
        <div className="score">{score.toLocaleString()}</div>
        <div className={combo >= 4 ? "combo hot" : "combo"}>
          {combo >= 2 ? `combo ×${combo}` : " "}
        </div>
      </div>
      <div
        className="piece-dots"
        aria-label={`${collected.length} of ${total} world pieces`}
      >
        {dots.map((state, i) => (
          <span key={i} className={`dot ${state}`} />
        ))}
      </div>
      <button className="pause-button" onClick={onPause} aria-label="Pause">
        ⏸
      </button>
    </>
  );
}
