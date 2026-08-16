import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { clockState } from "../game/clockState";
import { loadProgress } from "../game/persistence";
import { activeRun } from "../game/runState";
import { useGameStore } from "../game/store";
import { lastCatchColor } from "../scene/notePalette";
import { Pause } from "./icons";
import { PieceDots } from "./PieceDots";

interface Props {
  onPause: () => void;
}

// The shipping HUD: score + combo, one dot per world piece, the score to
// beat, pause. Everything else the scene already says — the tonearm is the
// progress bar and the diorama is the goal display.
//
// The counters are alive (spec §8.1: feedback, not fireworks — but a HUD
// that never moves reads as a spreadsheet):
// - Score ticks up odometer-style and flashes in the colour of the note
//   just caught; small +delta floaters drift off it.
// - Combo grows with the chain, punches on every catch, pulses ON THE BEAT
//   once it's hot, and when the chain breaks the counter is knocked off the
//   screen — tips over and tumbles away.
// - Piece dots pop with an overshoot ring when filled; a lost dot shakes.

// ------------------------------------------------------------------ score --

function Score() {
  const score = useGameStore((s) => s.score);
  const [display, setDisplay] = useState(0);
  const displayRef = useRef(0);
  displayRef.current = display;
  const [floats, setFloats] = useState<{ id: number; delta: number }[]>([]);
  const prevScore = useRef(0);
  const nextId = useRef(0);

  useEffect(() => {
    const delta = score - prevScore.current;
    prevScore.current = score;
    if (delta > 0) {
      const id = ++nextId.current;
      setFloats((f) => [...f.slice(-3), { id, delta }]);
    }
    // odometer roll toward the new total
    const from = displayRef.current;
    if (from === score) return;
    const start = performance.now();
    const dur = 320;
    let raf = 0;
    const tick = (t: number) => {
      const u = Math.min(1, (t - start) / dur);
      const eased = 1 - (1 - u) ** 3;
      setDisplay(Math.round(from + (score - from) * eased));
      if (u < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score]);

  // the flash takes the colour of the note that was just caught
  const flash = `#${lastCatchColor.getHexString()}`;
  return (
    <div className="score-slot" style={{ "--flash": flash } as CSSProperties}>
      <div key={score} className="score">
        {display.toLocaleString()}
      </div>
      {floats.map((f) => (
        <span
          key={f.id}
          className="score-float"
          onAnimationEnd={() =>
            setFloats((fs) => fs.filter((x) => x.id !== f.id))
          }
        >
          +{f.delta}
        </span>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------- best --

// The score to beat, parked out of the eye-line in the top-left. Read once
// per run mount — the stored best can only change when a run ends, and this
// unmounts before then. Nothing to show on a record you've never finished.
function BestScore() {
  const score = useGameStore((s) => s.score);
  const [best] = useState(() => loadProgress(activeRun.record.id).highScore);

  if (best <= 0) return null;

  const beaten = score > best;
  return (
    <div className={`best-score${beaten ? " beaten" : ""}`}>
      <span className="best-label">{beaten ? "beaten" : "best"}</span>
      <span className="best-value">{best.toLocaleString()}</span>
    </div>
  );
}

// ------------------------------------------------------------------ combo --

function Combo() {
  const combo = useGameStore((s) => s.combo);
  const notesMissed = useGameStore((s) => s.notesMissed);
  const [dead, setDead] = useState<{ value: number; id: number } | null>(null);
  const prevCombo = useRef(0);
  const prevMissed = useRef(0);
  const pulse = useRef<HTMLDivElement>(null);
  const amp = useRef(0);

  // beat-pulse amplitude by heat tier
  amp.current = combo >= 12 ? 0.1 : combo >= 8 ? 0.055 : 0;

  // a miss killed a running chain → spawn the corpse. Keyed on notesMissed,
  // not combo, so a run restart (which also zeroes combo) can't trigger it.
  useEffect(() => {
    if (notesMissed > prevMissed.current && prevCombo.current >= 2) {
      setDead({ value: prevCombo.current, id: notesMissed });
    }
    prevMissed.current = notesMissed;
    prevCombo.current = combo;
  }, [combo, notesMissed]);

  // the hot-tier pulse rides the transport, not a CSS clock — it lands on
  // the actual beat and freezes when the game pauses
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const el = pulse.current;
      if (!el) return;
      if (!amp.current || clockState.paused) {
        el.style.transform = "";
        return;
      }
      const frac = clockState.beatPos - Math.floor(clockState.beatPos);
      const s = 1 + amp.current * Math.exp(-frac * 5);
      el.style.transform = `scale(${s.toFixed(4)})`;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const tier =
    combo >= 12 ? "rainbow" : combo >= 8 ? "blazing" : combo >= 4 ? "hot" : "";
  return (
    <div className="combo-slot">
      {combo >= 2 && (
        <div ref={pulse} className="combo-live">
          <div
            key={combo}
            className={`combo-chip ${tier}`}
            style={{
              fontSize: `${(1.5 + Math.min(combo, 16) * 0.12).toFixed(2)}rem`,
            }}
          >
            ×{combo} <span className="combo-word">combo</span>
          </div>
        </div>
      )}
      {dead && (
        <div
          key={dead.id}
          className="combo-dead"
          onAnimationEnd={() => setDead(null)}
        >
          ×{dead.value} <span className="combo-word">combo</span>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------------- hud --

export function Hud({ onPause }: Props) {
  return (
    <>
      <BestScore />
      <div className="game-hud">
        <Score />
        <Combo />
      </div>
      <PieceDots />
      <button
        className="corner-button pause-button"
        onClick={onPause}
        aria-label="Pause"
      >
        <Pause weight="fill" />
      </button>
    </>
  );
}
