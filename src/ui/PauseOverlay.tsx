interface Props {
  onResume: () => void;
  onRestart: () => void;
  onWall: () => void;
}

// Pause is Transport.pause() (spec §8.8) — the world behind this overlay is
// genuinely frozen, music and all, so the overlay stays translucent to show
// it off.
export function PauseOverlay({ onResume, onRestart, onWall }: Props) {
  return (
    <div className="overlay results">
      <h1>Paused</h1>
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
