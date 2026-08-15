import * as Tone from "tone";
import { beatsToSeconds, secondsToBeats } from "../game/clock";
import { songFor } from "../music";
import { applyStemUnlocks, mountSong, resetAliveMix } from "../music/rig";
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

// The wall preview: the record you just selected, playing while you decide.
//
// It isn't a separate lobby track, and it isn't a clip — it's the record with
// nothing unlocked yet, which is a mix that already exists. Every stem's Part
// is scheduled at 0 and loops, and stems 1–3 sit at LOCKED_DB until pieces
// unlock them (music/rig.ts), so running the Transport on the wall gives you
// that record's bed and nothing else. The wall plays the skeleton; running the
// record is what fills it in, which is the premise of the whole game said out
// loud before anyone presses anything.
//
// Tone.start() lives here rather than only in startPlayback because selecting
// a record is now the first click of the session — and that is precisely why
// nothing is selected when the page loads. There is no state where the app
// wants sound and the browser hasn't allowed it yet.
export async function startPreview(record: RecordDef): Promise<void> {
  await Tone.start();
  const transport = Tone.getTransport();

  // Park it before mounting: mountSong's contract is that every Part starts
  // from a stopped Transport, and unlike startPlayback this can be called
  // while a previous record's preview is mid-loop.
  transport.stop();
  // A run abandoned partway leaves its end-of-track event armed, and the
  // preview runs that same Transport past that same beat — without this the
  // results screen fires at you while you're browsing the wall.
  if (endEventId !== null) {
    transport.clear(endEventId);
    endEventId = null;
  }

  currentBpm = record.bpm;
  transport.bpm.value = record.bpm;
  mountSong(songFor(record.id));
  // Explicit rather than trusting the fresh-mount defaults: re-selecting the
  // record you just finished finds mountSong idempotent, its stems still
  // unlocked and its master still swelled from the alive mix.
  applyStemUnlocks(0, record.stemUnlockAtPieces, true);
  resetAliveMix();

  transport.start();
}

export function stopPreview(): void {
  Tone.getTransport().stop();
}

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
