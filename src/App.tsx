import { useState } from "react";
import { startPlayback } from "./audio/transport";
import { clockState } from "./game/clockState";
import { saveRunResult } from "./game/persistence";
import { resetActiveRun } from "./game/runState";
import { computeMaxScore, starsForScore } from "./game/score";
import { useGameStore } from "./game/store";
import { useLaneInput } from "./game/useLaneInput";
import { applyStemUnlocks, resetAliveMix } from "./music/meadow";
import { meadow } from "./records/meadow";
import { clearFlights } from "./scene/flights";
import { Scene } from "./scene/Scene";
import { DebugHud } from "./ui/DebugHud";
import type { RunSummary } from "./ui/ResultsOverlay";
import { ResultsOverlay } from "./ui/ResultsOverlay";
import { StartOverlay } from "./ui/StartOverlay";

const MAX_SCORE = computeMaxScore(meadow);
const NEEDLE_LIFT_MS = 1800; // let the tonearm lift before the results show

type Phase = "title" | "playing" | "results";

export default function App() {
  const [phase, setPhase] = useState<Phase>("title");
  const [summary, setSummary] = useState<RunSummary | null>(null);
  useLaneInput();

  // Runs exactly once per track end (Tone scheduleOnce), so the persistence
  // write lives here rather than in an overlay effect (StrictMode re-mounts).
  const handleEnded = () => {
    clockState.ended = true;
    const s = useGameStore.getState();
    const piecesTotal = meadow.worldPieces.length;
    const completed = s.piecesCollected.length === piecesTotal;
    const stars = starsForScore(s.score, MAX_SCORE, meadow.starThresholds);
    const { progress, newHighScore } = saveRunResult(meadow.id, {
      score: s.score,
      stars,
      completed,
    });
    setSummary({
      completed,
      score: s.score,
      maxScore: MAX_SCORE,
      stars,
      bestCombo: s.bestCombo,
      notesHit: s.notesHit,
      notesMissed: s.notesMissed,
      piecesCollected: s.piecesCollected.length,
      piecesTotal,
      newHighScore,
      highScore: progress.highScore,
    });
    setTimeout(() => setPhase("results"), NEEDLE_LIFT_MS);
  };

  const start = async () => {
    setPhase("playing");
    // Fresh run state — a no-op on the first play, the actual reset on replay.
    resetActiveRun();
    clearFlights();
    useGameStore.getState().resetRun();
    applyStemUnlocks(0, meadow.stemUnlockAtPieces, true);
    resetAliveMix();
    clockState.ended = false;
    clockState.beatPos = 0;
    await startPlayback(meadow, handleEnded);
    clockState.playing = true;
  };

  return (
    <>
      <Scene />
      <DebugHud />
      {phase === "title" && <StartOverlay onStart={start} />}
      {phase === "results" && summary && (
        <ResultsOverlay summary={summary} onReplay={start} />
      )}
    </>
  );
}
