import * as Tone from "tone";
import type { SongDef, Voicing } from "./types";

// The mixing desk every record plugs into. A song module writes parts and
// voices; the master channel, the four stem channels, the shared reverb return
// and every game-driven volume move (stem unlocks, the record-skip duck, the
// alive swell) live here. That way a second record is a second arrangement,
// not a second copy of the mixer.

// Locked stems sit at -60dB instead of -Infinity so rampTo interpolates
// cleanly in dB. -60 under a playing mix is silence.
const LOCKED_DB = -60;
const MASTER_DB = -2;
const ALIVE_SWELL_DB = 0; // master ramps here when the world comes alive

let master: Tone.Channel | null = null;
let masterTarget = MASTER_DB; // where the duck recovers to (alive swell moves it)
let stems: Tone.Channel[] = [];
let song: SongDef | null = null;
let owned: { dispose(): unknown }[] = [];

const FALLBACK_VOICING: Voicing = {
  pickupRun: ["G4", "A4", "B4", "D5", "E5", "G5", "A5", "B5", "D6", "E6"],
  pieceChime: ["G5", "B5", "D6"],
  pieceThump: "G1",
  skipThud: "G0",
};

// Disposing a Part that is still scheduled is the only way to get it off the
// Transport; a synth outlives its Part, so order matters and anything that
// throws mid-teardown must not strand the rest.
function teardown() {
  for (const node of owned.reverse()) {
    try {
      node.dispose();
    } catch {
      // already disposed by an owner further down the chain
    }
  }
  owned = [];
  stems = [];
  master = null;
  song = null;
}

// Build the desk and the arrangement for a record. Idempotent for the song
// already mounted; switching songs tears the previous one off the Transport
// first. Call with the Transport parked — every Part starts at 0.
export function mountSong(next: SongDef): void {
  if (song?.id === next.id) return;
  teardown();
  song = next;

  const keep = <T extends { dispose(): unknown }>(node: T): T => {
    owned.push(node);
    return node;
  };

  master = keep(new Tone.Channel({ volume: MASTER_DB }).toDestination());
  masterTarget = MASTER_DB;

  // Shared reverb return bus — most of the distance between "programmer
  // music" and "music" (spec §10).
  const reverb = keep(new Tone.Reverb({ ...next.reverb, wet: 1 }));
  const verbReturn = keep(new Tone.Channel());
  verbReturn.receive("verb");
  verbReturn.chain(reverb, master);

  stems = next.mixDb.map((db, i) => {
    const ch = keep(
      new Tone.Channel({ volume: i === 0 ? db : LOCKED_DB }).connect(
        master as Tone.Channel,
      ),
    );
    ch.send("verb", next.verbSendDb[i]);
    return ch;
  });

  next.schedule(stems, keep);
}

export const songVoicing = (): Voicing => song?.voicing ?? FALLBACK_VOICING;

// Volume-ramp every stem to match the collected-piece count (spec §8.5).
// Idempotent — ramping to the level a stem is already at is a no-op sound-
// wise, so callers can invoke this on every collect.
export function applyStemUnlocks(
  piecesCollected: number,
  unlockAt: readonly number[],
  immediate = false,
): void {
  if (!song) return;
  stems.forEach((ch, i) => {
    const target =
      piecesCollected >= unlockAt[i] ? (song as SongDef).mixDb[i] : LOCKED_DB;
    if (immediate) ch.volume.value = target;
    else ch.volume.rampTo(target, 0.5);
  });
}

// Debug/HUD: current stem channel volumes in dB.
export function stemVolumes(): number[] {
  return stems.map((ch) => ch.volume.value);
}

// Full completion: the mix swells with the world (spec §8.4).
export function swellAliveMix(): void {
  masterTarget = ALIVE_SWELL_DB;
  master?.volume.rampTo(ALIVE_SWELL_DB, 1.5);
}

export function resetAliveMix(): void {
  masterTarget = MASTER_DB;
  if (master) master.volume.value = MASTER_DB;
}

// Record-skip (spec §8.1): the music itself drops out for a beat, like the
// needle actually left the groove, then recovers.
export function duckForSkip(): void {
  if (!master) return;
  try {
    const now = Tone.now();
    master.volume.cancelScheduledValues(now);
    master.volume.rampTo(masterTarget - 10, 0.03, now);
    master.volume.rampTo(masterTarget, 0.3, now + 0.16);
  } catch {
    // scheduling edge case (e.g. two skips in one frame) — skip the duck
  }
}

// After a long main-thread stall the Transport catches up by firing the
// missed events in one burst with clamped times — a mono synth started twice
// at the same clamped time throws. Dropping that hit is inaudible; letting
// the throw escape a clock callback is not. Every song's parts route through
// this.
export const safeHit = (fn: () => void): void => {
  try {
    fn();
  } catch {
    // catch-up burst after a stall — skip this hit
  }
};
