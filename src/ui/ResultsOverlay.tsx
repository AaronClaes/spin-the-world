import { Star } from "./icons";

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
  starThresholds: [number, number]; // score fractions for the 2nd/3rd star
}

interface Props {
  summary: RunSummary;
  onReplay: () => void;
  onWall: () => void;
}

// Shown after the needle lifts. Deliberately translucent — the (alive or
// partial) world keeps spinning behind it, because the diorama is the
// result (spec §8.7). The verdict reads instantly: won runs land their
// stars one by one with captions that teach the star rules; failed runs say
// so. Everything staggers in — title, stars, score bar, stats, buttons.

const wonSubtitle = (stars: number, t2: number) => {
  if (stars >= 3) return "a flawless spin — every note, every point";
  if (stars === 2) return "now chase the perfect score for the third star";
  return `reach ${Math.round(t2 * 100)}% of the max score for a second star`;
};

export function ResultsOverlay({ summary, onReplay, onWall }: Props) {
  const { completed, stars, maxScore } = summary;
  const frac = maxScore > 0 ? summary.score / maxScore : 0;
  const [t2] = summary.starThresholds;

  const captions = [
    "build the world",
    `${Math.round(t2 * 100)}% score`,
    "perfect score",
  ];

  return (
    <div className={`overlay results ${completed ? "won" : "lost"}`}>
      <h1 className="pop-in">
        {completed ? "The world came alive" : "A world, half-made"}
      </h1>
      <p className="verdict pop-in d1">
        {completed
          ? wonSubtitle(stars, t2)
          : `${summary.piecesCollected} of ${summary.piecesTotal} pieces found — the world needs them all`}
      </p>

      <div className="star-row" aria-label={`${stars} of 3 stars`}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="star-slot">
            <Star
              weight="fill"
              className={`star ${i < stars ? "lit" : "off"}`}
              style={{ animationDelay: `${0.4 + i * 0.22}s` }}
            />
            <span className="star-cap">{captions[i]}</span>
          </div>
        ))}
      </div>

      <div className="score-panel pop-in d2">
        <div className="final-score">{summary.score.toLocaleString()}</div>
        <div className="score-bar">
          <div
            className="score-bar-fill"
            style={{ "--fill": Math.min(1, frac) } as React.CSSProperties}
          />
          {/* the 2nd/3rd star thresholds, visible on the bar itself */}
          <Star
            weight="fill"
            className="score-bar-star"
            style={{ left: `${t2 * 100}%` }}
          />
          <Star
            weight="fill"
            className="score-bar-star"
            style={{ left: "100%" }}
          />
        </div>
        {summary.newHighScore ? (
          <div className="high-chip">new high score!</div>
        ) : (
          <div className="score-sub">
            of {maxScore.toLocaleString()} · best{" "}
            {summary.highScore.toLocaleString()}
          </div>
        )}
      </div>

      <div className="stat-grid pop-in d3">
        <div className="stat-cell">
          <span className="stat-value">
            {summary.piecesCollected}/{summary.piecesTotal}
          </span>
          <span className="stat-label">pieces</span>
        </div>
        <div className="stat-cell">
          <span className="stat-value">{summary.notesHit}</span>
          <span className="stat-label">notes caught</span>
        </div>
        <div className="stat-cell">
          <span className="stat-value">{summary.notesMissed}</span>
          <span className="stat-label">missed</span>
        </div>
        <div className="stat-cell">
          <span className="stat-value">×{summary.bestCombo}</span>
          <span className="stat-label">best combo</span>
        </div>
      </div>

      <div className="menu pop-in d4">
        <button onClick={onReplay}>Spin it again</button>
        <button className="secondary" onClick={onWall}>
          Back to the wall
        </button>
      </div>
    </div>
  );
}
