import * as Tone from "tone";
import { beatsToSeconds, secondsToBeats } from "../game/clock";
import { songFor } from "../music";
import { mountSong } from "../music/rig";
import type { RecordDef } from "../records/types";
import { syncProbe } from "./syncProbe";

// The Transport IS the game clock (spec §6.2). beatPos is derived, never
// integrated — the disc and the music are the same number.
export const getBeatPos = (bpm: number) =>
  secondsToBeats(Tone.getTransport().seconds, bpm);

let scheduled = false;
let probeBeat = 0;
let endEventId: number | null = null;
// The drift probe is scheduled once and outlives any single run, so it can't
// close over a record — records differ in bpm.
let currentBpm = 120;

// Starts a run from beat 0 — both the first play and every restart. Music
// parts are scheduled once per record and live on the Transport until another
// record is mounted; stopping the Transport rewinds them along with
// everything else.
export async function startPlayback(record: RecordDef, onEnded: () => void) {
  await Tone.start();
  const transport = Tone.getTransport();
  currentBpm = record.bpm;
  transport.bpm.value = record.bpm;

  // Swapping records tears the previous arrangement off the Transport and
  // builds the new one; replaying the same record is a no-op. Must happen
  // before the rewind below so every Part starts from a parked transport.
  mountSong(songFor(record.id));

  if (!scheduled) {
    scheduled = true;
    transport.scheduleRepeat(
      (time) => syncProbe.sample(time, probeBeat++, currentBpm),
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
