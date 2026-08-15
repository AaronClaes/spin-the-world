import * as Tone from "tone";
import { beatsToSeconds, secondsToBeats } from "../game/clock";
import { songFor } from "../music";
import {
  applyStemUnlocks,
  fadeMasterIn,
  fadeMasterOut,
  mountSong,
  mountedSongId,
  resetAliveMix,
} from "../music/rig";
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

// Rising into a loop reads as a record being cued rather than switched on, so
// the fade in is generous; the fade out only has to outrun a click, and every
// millisecond of it is a millisecond the wall answers your click in silence.
const PREVIEW_FADE_S = 0.7;
const SWAP_FADE_S = 0.14;
// Bumped by anything that takes ownership of the desk, so an in-flight swap
// can tell it has been overtaken.
let previewSwap = 0;

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

  // Clicking the record that's already playing is not a request to hear it
  // again from the top. Without this, re-selecting restarts the loop — a
  // rewind to a downbeat, which is the one edit that always sounds like a
  // mistake.
  if (mountedSongId() === record.id && transport.state === "started") return;

  // A swap fades the old bed down before tearing it off the desk. mountSong
  // disposes the synths outright, so a Part mid-note is cut where it stands —
  // and a waveform truncated mid-cycle is a click. Short enough that the
  // frame lifting on screen still reads as the same gesture as the sound.
  const token = ++previewSwap;
  if (transport.state === "started") {
    fadeMasterOut(SWAP_FADE_S);
    await new Promise((r) => setTimeout(r, SWAP_FADE_S * 1000 + 20));
    // Two records clicked in quick succession, or play pressed mid-fade: the
    // later intent owns the desk and this continuation must not stomp it.
    if (token !== previewSwap) return;
  }

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
  fadeMasterIn(PREVIEW_FADE_S);
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
  // The run owns the desk from here — a preview swap still waiting out its
  // fade must not mount a record over the top of the one being played.
  previewSwap++;
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
