import { useEffect, useState } from "react";
import * as Tone from "tone";
import { syncProbe } from "../audio/syncProbe";
import { barBeat, songProgress } from "../game/clock";
import { BEATS_PER_REV } from "../game/constants";
import { clockState } from "../game/clockState";
import { meadow } from "../records/meadow";

const fmt = (n: number, d = 2) => n.toFixed(d);

export function DebugHud() {
  const [, tick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick((t) => t + 1), 100);
    return () => clearInterval(id);
  }, []);

  if (!clockState.playing) return null;

  const { bar, beat } = barBeat(clockState.beatPos);
  const progress = songProgress(clockState.beatPos, meadow.totalBeats);

  return (
    <div className="hud">
      <div>
        beatPos {fmt(clockState.beatPos)} / {meadow.totalBeats}
      </div>
      <div>
        bar:beat {bar + 1}:{beat + 1}
      </div>
      <div>
        rev {fmt(clockState.beatPos / BEATS_PER_REV, 1)} /{" "}
        {meadow.totalBeats / BEATS_PER_REV}
      </div>
      <div>transport {fmt(Tone.getTransport().seconds)}s</div>
      <div>progress {fmt(progress * 100, 1)}%</div>
      <div>
        drift last {fmt(syncProbe.lastDriftMs, 3)}ms · max{" "}
        {fmt(syncProbe.maxDriftMs, 3)}ms
      </div>
      {clockState.ended && (
        <div className="done">track complete — needle up</div>
      )}
    </div>
  );
}
