import { activeRun } from "../game/runState";
import { useGameStore } from "../game/store";

// One dot per world piece — the HUD's goal readout, shared with the pause
// card so a paused player sees exactly the row they were watching. Dots fill
// in collect order; lost pieces show as holes at the tail.
export function PieceDots({ inline = false }: { inline?: boolean }) {
  const collected = useGameStore((s) => s.piecesCollected);
  const lost = useGameStore((s) => s.piecesLost);

  const total = activeRun.record.worldPieces.length;
  const dots = Array.from({ length: total }, (_, i) => {
    if (i < collected.length) return "got";
    if (i >= total - lost) return "lost";
    return "pending";
  });

  return (
    <div
      className={`piece-dots${inline ? " inline" : ""}`}
      aria-label={`${collected.length} of ${total} world pieces`}
    >
      {dots.map((state, i) => (
        <span key={i} className={`dot ${state}`} />
      ))}
    </div>
  );
}
