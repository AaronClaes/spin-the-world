import { useEffect, useState } from "react";
import * as Tone from "tone";
import { syncProbe } from "../audio/syncProbe";
import { barBeat, songProgress } from "../game/clock";
import { BEATS_PER_REV } from "../game/constants";
import { clockState } from "../game/clockState";
import { useGameStore } from "../game/store";
import { meadow } from "../records/meadow";

const fmt = (n: number, d = 2) => n.toFixed(d);

export function DebugHud() {
  const [, tick] = useState(0);
  const score = useGameStore((s) => s.score);
  const combo = useGameStore((s) => s.combo);
  const lane = useGameStore((s) => s.lane);
  const piecesCollected = useGameStore((s) => s.piecesCollected);
  const piecesLost = useGameStore((s) => s.piecesLost);
  const notesHit = useGameStore((s) => s.notesHit);
  const notesMissed = useGameStore((s) => s.notesMissed);

  useEffect(() => {
    const id = setInterval(() => tick((t) => t + 1), 100);
    return () => clearInterval(id);
  }, []);

  if (!clockState.playing) return null;

  const { bar, beat } = barBeat(clockState.beatPos);
  const progress = songProgress(clockState.beatPos, meadow.totalBeats);
  const totalPieces = meadow.worldPieces.length;

  return (
    <div className="hud">
      <div className="score">
        score {score} · combo ×{combo}
      </div>
      <div>
        world {piecesCollected.length}/{totalPieces}
        {piecesLost > 0 && ` · lost ${piecesLost}`}
      </div>
      <div>
        lane {lane} · notes {notesHit}✓ {notesMissed}✗
      </div>
      <div>
        beatPos {fmt(clockState.beatPos)} / {meadow.totalBeats} · bar {bar + 1}:
        {beat + 1} · rev {fmt(clockState.beatPos / BEATS_PER_REV, 1)}
      </div>
      <div>
        transport {fmt(Tone.getTransport().seconds)}s · {fmt(progress * 100, 1)}
        % · drift {fmt(syncProbe.lastDriftMs, 3)}/{fmt(syncProbe.maxDriftMs, 3)}
        ms
      </div>
      {clockState.ended && (
        <div className="done">track complete — needle up</div>
      )}
    </div>
  );
}
