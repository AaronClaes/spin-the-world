export interface RunSummary {
  completed: boolean;
  score: number;
  maxScore: number;
  stars: number;
  bestCombo: number;
  notesHit: number;
  notesMissed: number;
  piecesCollected: number;
  piecesTotal: number;
  newHighScore: boolean;
  highScore: number;
}

interface Props {
  summary: RunSummary;
  onReplay: () => void;
  onWall: () => void;
}

// Shown after the needle lifts. Deliberately translucent — the (alive or
// partial) world keeps spinning behind it, because the diorama is the
// result (spec §8.7).
export function ResultsOverlay({ summary, onReplay, onWall }: Props) {
  return (
    <div className="overlay results">
      <h1>
        {summary.completed ? "The world came alive" : "A world, half-made"}
      </h1>
      <div className="stars" aria-label={`${summary.stars} of 3 stars`}>
        {[0, 1, 2].map((i) => (
          <span key={i} className={i < summary.stars ? "" : "off"}>
            ★
          </span>
        ))}
      </div>
      <div className="stats">
        <div>
          world pieces {summary.piecesCollected}/{summary.piecesTotal}
        </div>
        <div>
          score {summary.score.toLocaleString()} /{" "}
          {summary.maxScore.toLocaleString()}
        </div>
        <div>
          best combo ×{summary.bestCombo} · notes {summary.notesHit}✓{" "}
          {summary.notesMissed}✗
        </div>
        {summary.newHighScore ? (
          <div className="high">new high score!</div>
        ) : (
          <div>best {summary.highScore.toLocaleString()}</div>
        )}
      </div>
      <div className="menu">
        <button onClick={onReplay}>Spin it again</button>
        <button className="secondary" onClick={onWall}>
          Back to the wall
        </button>
      </div>
    </div>
  );
}
