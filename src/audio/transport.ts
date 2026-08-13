import * as Tone from "tone";
import { beatsToSeconds, secondsToBeats } from "../game/clock";
import type { RecordDef } from "../records/meadow";
import { scheduleMeadowMusic } from "../music/meadow";
import { syncProbe } from "./syncProbe";

// The Transport IS the game clock (spec §6.2). beatPos is derived, never
// integrated — the disc and the music are the same number.
export const getBeatPos = (bpm: number) =>
  secondsToBeats(Tone.getTransport().seconds, bpm);

let scheduled = false;
let probeBeat = 0;
let endEventId: number | null = null;

// Starts a run from beat 0 — both the first play and every restart. Music
// parts are scheduled once and live on the Transport forever; stopping the
// Transport rewinds them along with everything else.
export async function startPlayback(record: RecordDef, onEnded: () => void) {
  await Tone.start();
  const transport = Tone.getTransport();
  transport.bpm.value = record.bpm;

  if (!scheduled) {
    scheduled = true;
    scheduleMeadowMusic();
    transport.scheduleRepeat(
      (time) => syncProbe.sample(time, probeBeat++, record.bpm),
      "4n",
      0,
    );
  }

  // Rewind (a no-op before the first play). The end-of-track event must be
  // re-armed per run — scheduleOnce events are consumed when they fire.
  transport.stop();
  if (endEventId !== null) transport.clear(endEventId);
  endEventId = transport.scheduleOnce(
    (time) => {
      endEventId = null;
      // Pause, not stop — stop resets position; paused, beatPos freezes at
      // totalBeats and the needle-lift moment stays inspectable.
      transport.pause(time);
      onEnded();
    },
    beatsToSeconds(record.totalBeats, record.bpm),
  );

  probeBeat = 0;
  syncProbe.reset();
  transport.start();
}

export function pausePlayback() {
  Tone.getTransport().pause();
}

export function resumePlayback() {
  Tone.getTransport().start();
}
