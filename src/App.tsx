import { useCallback, useEffect, useRef, useState } from "react";
import { initSfx, sfxNeedleDrop, sfxNeedleLift, sfxSpinUp } from "./audio/sfx";
import {
  pausePlayback,
  resumePlayback,
  startPlayback,
} from "./audio/transport";
import { clockState } from "./game/clockState";
import { saveRunResult } from "./game/persistence";
import { resetActiveRun } from "./game/runState";
import { computeMaxScore, starsForRun } from "./game/score";
import { useGameStore } from "./game/store";
import { useLaneInput } from "./game/useLaneInput";
import { applyStemUnlocks, resetAliveMix } from "./music/meadow";
import { meadow } from "./records/meadow";
import { clearFlights } from "./scene/flights";
import { clearNotePops } from "./scene/NotePop";
import { resetLastCatchColor } from "./scene/notePalette";
import { Scene } from "./scene/Scene";
import { DebugHud } from "./ui/DebugHud";
import { Hud } from "./ui/Hud";
import { PauseOverlay } from "./ui/PauseOverlay";
import { ReadyOverlay } from "./ui/ReadyOverlay";
import type { RunSummary } from "./ui/ResultsOverlay";
import { ResultsOverlay } from "./ui/ResultsOverlay";
import { StudioWall } from "./ui/StudioWall";
import { TouchControls } from "./ui/TouchControls";

const MAX_SCORE = computeMaxScore(meadow);
const NEEDLE_LIFT_MS = 1800; // let the tonearm lift before the results show
const SHOW_DEBUG_HUD =
  typeof location !== "undefined" && location.search.includes("debug");

type Phase = "wall" | "ready" | "playing" | "results";

export default function App() {
  const [phase, setPhase] = useState<Phase>("wall");
  const [paused, setPaused] = useState(false);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const resultsTimer = useRef<number | null>(null);
  useLaneInput();

  // Runs exactly once per track end (Tone scheduleOnce), so the persistence
  // write lives here rather than in an overlay effect (StrictMode re-mounts).
  const handleEnded = () => {
    clockState.ended = true;
    sfxNeedleLift();
    const s = useGameStore.getState();
    const piecesTotal = meadow.worldPieces.length;
    const completed = s.piecesCollected.length === piecesTotal;
    const stars = starsForRun(
      completed,
      s.score,
      MAX_SCORE,
      meadow.starThresholds,
    );
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
      starThresholds: meadow.starThresholds,
    });
    resultsTimer.current = window.setTimeout(
      () => setPhase("results"),
      NEEDLE_LIFT_MS,
    );
  };

  // Picking a record off the wall dives the camera to the turntable but
  // doesn't drop the needle yet — the ready card (score to beat, how-to)
  // floats over the parked disc until the player starts.
  const enterReady = useCallback(() => {
    clockState.wall = false;
    setPhase("ready");
  }, []);

  const start = async () => {
    setPhase("playing");
    setPaused(false);
    clockState.paused = false;
    clockState.wall = false; // no-op from ready; the replay path needs it
    // Fresh run state — a no-op on the first play, the actual reset on replay.
    resetActiveRun();
    clearFlights();
    clearNotePops();
    resetLastCatchColor();
    useGameStore.getState().resetRun();
    applyStemUnlocks(0, meadow.stemUnlockAtPieces, true);
    resetAliveMix();
    clockState.ended = false;
    clockState.beatPos = 0;
    await startPlayback(meadow, handleEnded);
    // Tone.start() has resolved inside startPlayback — safe to build SFX.
    initSfx();
    sfxNeedleDrop();
    sfxSpinUp();
    clockState.playing = true;
  };

  // Pause is Transport.pause() (spec §8.8): beatPos derives from the
  // Transport, so disc, items, and music freeze together with zero state.
  const pause = useCallback(() => {
    if (clockState.paused || clockState.ended || !clockState.playing) return;
    clockState.paused = true;
    pausePlayback();
    setPaused(true);
  }, []);

  const resume = useCallback(() => {
    if (!clockState.paused) return;
    clockState.paused = false;
    resumePlayback();
    setPaused(false);
  }, []);

  const backToWall = useCallback(() => {
    if (resultsTimer.current !== null) {
      clearTimeout(resultsTimer.current);
      resultsTimer.current = null;
    }
    // Transport stays paused/parked; start() rewinds it on the next needle
    // drop. The frozen scene sits behind the wall overlay.
    if (clockState.playing && !clockState.paused && !clockState.ended)
      pausePlayback();
    clockState.paused = false;
    clockState.playing = false;
    clockState.wall = true;
    setPaused(false);
    setSummary(null);
    setPhase("wall");
  }, []);

  // Esc toggles pause; auto-pause on tab switch — a backgrounded tab suspends
  // the AudioContext and judges WILL alt-tab mid-run (spec §8.8).
  useEffect(() => {
    if (phase !== "playing") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (clockState.paused) resume();
      else pause();
    };
    const onVisibility = () => {
      if (document.hidden) pause();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [phase, pause, resume]);

  return (
    <>
      <Scene
        wall={phase === "wall"}
        // stays mounted through "ready" so the dive pulls away from a real
        // wall instead of a void
        wallMounted={phase === "wall" || phase === "ready"}
        onStart={enterReady}
      />
      {/* CSS shows this only on portrait touch devices (spec §9: landscape) */}
      <div className="rotate-hint">
        <p>
          this world spins in landscape —<br />
          rotate your phone
        </p>
      </div>
      {SHOW_DEBUG_HUD && <DebugHud />}
      {phase === "playing" && !paused && !clockState.ended && (
        <>
          <TouchControls />
          <Hud onPause={pause} />
        </>
      )}
      {phase === "wall" && <StudioWall />}
      {phase === "ready" && (
        <ReadyOverlay onStart={start} onBack={backToWall} />
      )}
      {phase === "playing" && paused && (
        <PauseOverlay onResume={resume} onRestart={start} onWall={backToWall} />
      )}
      {phase === "results" && summary && (
        <ResultsOverlay
          summary={summary}
          onReplay={start}
          onWall={backToWall}
        />
      )}
    </>
  );
}
