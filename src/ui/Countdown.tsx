import { useEffect, useState } from "react";
import { sfxCount } from "../audio/sfx";
import type { RecordDef } from "../records/types";

// The 3-2-1 between pressing play and the needle landing.
//
// Metered to the record rather than to seconds: one count per half-note, so
// the three records count at three visibly different speeds and the needle
// drops on the downbeat you have just been counting to. In a game about
// running a groove that isn't decoration — the player is already inside the
// pulse when the first note arrives. It's also why the count doesn't sit
// after the camera dive but on top of it: the dive is a fixed 2s flight
// (scene/CameraRig.tsx), and stacking the two would put five seconds between
// wanting to play and playing, on a screen you'll pass through a dozen times.
// Counted over the dive, the camera lands somewhere around "1" and the
// leftover stillness at the deck is the breath the ready card used to be.

const GO_DWELL_MS = 480; // GO stays up a beat while the run is already moving

// One count per half-note. Exported because it's the one number that ties the
// count to the shelf: a record fast enough makes 3-2-1-GO a blur, and a record
// slow enough makes it a wait, so records.test.ts holds the whole shelf inside
// a window either side of the classic one-per-second.
export const countStepMs = (bpm: number) => (2 * 60 * 1000) / bpm;

export function Countdown({
  record,
  onGo,
  onDone,
}: {
  record: RecordDef;
  onGo: () => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState(3);

  useEffect(() => {
    const stepMs = countStepMs(record.bpm);
    const timers: number[] = [];

    setStep(3);
    sfxCount(3);
    for (const n of [2, 1, 0]) {
      timers.push(
        window.setTimeout(
          () => {
            setStep(n);
            sfxCount(n);
            // GO and the needle drop are the same instant — the music starts
            // here, not when this overlay finally leaves.
            if (n === 0) onGo();
          },
          (3 - n) * stepMs,
        ),
      );
    }
    timers.push(window.setTimeout(onDone, 3 * stepMs + GO_DWELL_MS));

    return () => timers.forEach(clearTimeout);
  }, [record.bpm, onGo, onDone]);

  return (
    <div className="countdown" aria-live="assertive">
      {/* keyed on the step so each number remounts and replays its pop */}
      <span key={step} className={`count${step === 0 ? " go" : ""}`}>
        {step === 0 ? "GO" : step}
      </span>
    </div>
  );
}
