import { useCallback, useEffect, useRef, useState } from "react";
import {
  initSfx,
  sfxFinishFail,
  sfxFinishWin,
  sfxNeedleDrop,
  sfxNeedleLift,
  sfxSpinUp,
} from "./audio/sfx";
import {
  pausePlayback,
  resumePlayback,
  startPlayback,
  startPreview,
} from "./audio/transport";
import { clockState } from "./game/clockState";
import { saveRunResult } from "./game/persistence";
import { activeRun, selectRecord } from "./game/runState";
import { computeMaxScore, starsForRun } from "./game/score";
import { useGameStore } from "./game/store";
import { useLaneInput } from "./game/useLaneInput";
import { applyStemUnlocks, resetAliveMix } from "./music/rig";
import { DEFAULT_RECORD } from "./records";
import type { RecordDef } from "./records/types";
import { clearFlights } from "./scene/flights";
import { clearNotePops } from "./scene/NotePop";
import { resetLastCatchColor } from "./scene/notePalette";
import { Scene } from "./scene/Scene";
import { Countdown } from "./ui/Countdown";
import { DebugHud } from "./ui/DebugHud";
import { FullscreenButton } from "./ui/FullscreenButton";
import { Hud } from "./ui/Hud";
import { MuteButton } from "./ui/MuteButton";
import { PauseOverlay } from "./ui/PauseOverlay";
import type { RunSummary } from "./ui/ResultsOverlay";
import { ResultsOverlay } from "./ui/ResultsOverlay";
import { StudioWall } from "./ui/StudioWall";
import { TouchControls } from "./ui/TouchControls";

const NEEDLE_LIFT_MS = 1800; // let the tonearm lift before the results show
const SHOW_DEBUG_HUD =
  typeof location !== "undefined" && location.search.includes("debug");

type Phase = "wall" | "countdown" | "playing" | "results";

export default function App() {
  const [phase, setPhase] = useState<Phase>("wall");
  // The record being played. activeRun.record is the same value and is what
  // frame-rate code reads; this copy exists so React re-renders on a swap.
  const [record, setRecord] = useState<RecordDef>(DEFAULT_RECORD);
  // The record picked off the wall but not yet committed to. Null until the
  // first click of the session, which is what makes the preview legal to
  // start (ui/StudioWall.tsx).
  const [selected, setSelected] = useState<RecordDef | null>(null);
  const [paused, setPaused] = useState(false);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const resultsTimer = useRef<number | null>(null);
  // Whether this countdown is being counted over a camera dive or from a deck
  // the camera is already parked at — a restart shouldn't drag the whole wall
  // back into the scene graph behind it.
  const diving = useRef(false);
  useLaneInput();

  // Runs exactly once per track end (Tone scheduleOnce), so the persistence
  // write lives here rather than in an overlay effect (StrictMode re-mounts).
  const handleEnded = () => {
    clockState.ended = true;
    sfxNeedleLift();
    const s = useGameStore.getState();
    // read the record off the run rather than the closure — this fires from a
    // Transport event scheduled a whole track ago
    const played = activeRun.record;
    const maxScore = computeMaxScore(played);
    const piecesTotal = played.worldPieces.length;
    const completed = s.piecesCollected.length === piecesTotal;
    // The verdict is audible before it's readable: the sting plays into the
    // needle-lift gap, so the panel arrives confirming something already heard.
    if (completed) sfxFinishWin();
    else sfxFinishFail();
    const stars = starsForRun(
      completed,
      s.score,
      maxScore,
      played.starThresholds,
    );
    const { progress, newHighScore } = saveRunResult(played.id, {
      score: s.score,
      stars,
      completed,
    });
    setSummary({
      completed,
      score: s.score,
      maxScore,
      stars,
      bestCombo: s.bestCombo,
      notesHit: s.notesHit,
      notesMissed: s.notesMissed,
      piecesCollected: s.piecesCollected.length,
      piecesTotal,
      newHighScore,
      highScore: progress.highScore,
      starThresholds: played.starThresholds,
    });
    resultsTimer.current = window.setTimeout(
      () => setPhase("results"),
      NEEDLE_LIFT_MS,
    );
  };

  // Clicking a record on the wall only selects it. The click is the session's
  // first user gesture, so it's also where the AudioContext unlocks and the
  // record's own bed starts looping under the wall — selecting and hearing
  // are the same action (audio/transport.ts startPreview).
  const handleSelect = useCallback((picked: RecordDef) => {
    setSelected(picked);
    void startPreview(picked)
      // Tone.start() has resolved — the countdown's SFX need the synths built
      // before the first count, not at the needle drop.
      .then(initSfx)
      .catch(() => {
        // an autoplay policy we didn't anticipate, or a dead AudioContext:
        // the wall is still playable in silence, so don't take the app down
      });
  }, []);

  // Everything a run needs reset, done when the count starts rather than when
  // it ends — the deck is on screen for the whole 3-2-1 and has to be showing
  // this record's empty island, not the last one's leftovers. The music is
  // deliberately NOT started here; that's the GO.
  const armRun = useCallback((picked: RecordDef, dive: boolean) => {
    if (resultsTimer.current !== null) {
      clearTimeout(resultsTimer.current);
      resultsTimer.current = null;
    }
    useGameStore.getState().resetRun();
    clearFlights();
    clearNotePops();
    resetLastCatchColor();
    selectRecord(picked);
    setRecord(picked);
    applyStemUnlocks(0, picked.stemUnlockAtPieces, true);
    resetAliveMix();
    clockState.ended = false;
    clockState.playing = false;
    clockState.paused = false;
    clockState.beatPos = 0;
    diving.current = dive;
    if (dive) clockState.wall = false;
    setPaused(false);
    setSummary(null);
    setPhase("countdown");
  }, []);

  const play = useCallback(() => {
    if (selected) armRun(selected, true);
  }, [armRun, selected]);

  // Replay and restart-from-pause both count in too. The camera is already at
  // the deck so there's no dive to count over, but a retry is the moment you
  // most want the beat of warning — dropping straight back onto a moving
  // record is how you lose the first four notes.
  const restart = useCallback(() => armRun(activeRun.record, false), [armRun]);

  // GO. The needle lands, the Transport rewinds out from under the preview
  // loop that's been playing since the wall, and sfxNeedleDrop covers the seam
  // — the jump is a needle drop, so it gets to sound like one.
  const dropNeedle = useCallback(async () => {
    await startPlayback(activeRun.record, handleEnded);
    initSfx();
    sfxNeedleDrop();
    sfxSpinUp();
    clockState.playing = true;
    // handleEnded is deliberately captured once: it fires from a Transport
    // event scheduled a whole track earlier and already reads everything it
    // needs off activeRun and the store rather than a closure.
  }, []);

  const countedIn = useCallback(() => setPhase("playing"), []);

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
    clockState.paused = false;
    clockState.playing = false;
    clockState.wall = true;
    setPaused(false);
    setSummary(null);
    setPhase("wall");
    // The record you were playing is the record still selected on the wall,
    // so its bed picks straight back up — which also rewinds the Transport off
    // whatever beat the abandoned run left it parked on.
    const back = activeRun.record;
    setSelected(back);
    void startPreview(back).catch(() => {});
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

  // Same condition the HUD renders on — the pause button comes and goes with
  // it, and the always-on controls have to know whether that corner is taken.
  const hudUp = phase === "playing" && !paused && !clockState.ended;

  return (
    <>
      <Scene
        record={record}
        wall={phase === "wall"}
        // stays mounted while the count is being flown so the dive pulls away
        // from a real wall instead of a void — but not for a restart, where
        // the camera never left the deck
        wallMounted={
          phase === "wall" || (phase === "countdown" && diving.current)
        }
        selectedId={selected?.id ?? null}
        onSelect={handleSelect}
      />
      {/* CSS shows this only on portrait touch devices (spec §9: landscape) */}
      <div className="rotate-hint">
        <p>
          this world spins in landscape —<br />
          rotate your phone
        </p>
      </div>
      {SHOW_DEBUG_HUD && <DebugHud />}
      {hudUp && (
        <>
          <TouchControls />
          <Hud onPause={pause} />
        </>
      )}
      {phase === "wall" && <StudioWall selected={selected} onPlay={play} />}
      {phase === "countdown" && (
        <Countdown record={record} onGo={dropNeedle} onDone={countedIn} />
      )}
      {phase === "playing" && paused && (
        <PauseOverlay
          onResume={resume}
          onRestart={restart}
          onWall={backToWall}
        />
      )}
      {phase === "results" && summary && (
        <ResultsOverlay
          summary={summary}
          onReplay={restart}
          onWall={backToWall}
        />
      )}
      {/* The controls that are about the room rather than the run, so they
          outlive every phase. Last in the tree, so they paint over the overlay
          scrims they share the corner with; shifted one slot left while the
          HUD's pause button owns the corner. */}
      <div className={`corner-controls${hudUp ? " beside-pause" : ""}`}>
        <FullscreenButton />
        <MuteButton />
      </div>
    </>
  );
}
