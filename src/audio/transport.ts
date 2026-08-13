import * as Tone from "tone";
import { beatsToSeconds, secondsToBeats } from "../game/clock";
import type { RecordDef } from "../records/meadow";
import { scheduleDrumStem } from "../music/meadow";
import { syncProbe } from "./syncProbe";

// The Transport IS the game clock (spec §6.2). beatPos is derived, never
// integrated — the disc and the music are the same number.
export const getBeatPos = (bpm: number) =>
  secondsToBeats(Tone.getTransport().seconds, bpm);

let scheduled = false;

export async function startPlayback(record: RecordDef, onEnded: () => void) {
  await Tone.start();
  const transport = Tone.getTransport();
  transport.bpm.value = record.bpm;

  if (!scheduled) {
    scheduled = true;
    scheduleDrumStem();

    let probeBeat = 0;
    transport.scheduleRepeat(
      (time) => syncProbe.sample(time, probeBeat++, record.bpm),
      "4n",
      0,
    );

    // Track end: pause (not stop — stop resets position) so beatPos freezes
    // at totalBeats and the needle-lift moment stays inspectable.
    transport.scheduleOnce(
      () => {
        transport.pause();
        onEnded();
      },
      beatsToSeconds(record.totalBeats, record.bpm),
    );
  }

  syncProbe.reset();
  transport.start();
}

export function pausePlayback() {
  Tone.getTransport().pause();
}

export function resumePlayback() {
  Tone.getTransport().start();
}
