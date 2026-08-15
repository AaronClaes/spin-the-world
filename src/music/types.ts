import type * as Tone from "tone";

// Register a node for disposal when the song is unmounted. Everything a
// schedule() creates must go through this — a Part left on the Transport
// keeps firing into a disposed synth when you switch records.
export type Keep = <T extends { dispose(): unknown }>(node: T) => T;

// How the record's key colours the SFX. The note-pickup ladder and the piece
// chime are pitched into the song so pickups sit inside the music rather than
// on top of it (spec §8.5) — which means they move with the record.
export interface Voicing {
  pickupRun: string[]; // climbs as the combo grows, resets on a break
  pieceChime: [string, string, string]; // world-piece arpeggio
  pieceThump: string; // low body under the chime
  skipThud: string; // the record-skip's body hit
}

export interface SongDef {
  id: string; // matches the RecordDef id it plays under
  mixDb: [number, number, number, number]; // per-stem level, in unlock order
  verbSendDb: [number, number, number, number]; // send into the shared return
  reverb: { decay: number; preDelay: number };
  voicing: Voicing;
  // Build the arrangement into the four stem channels. Called once per mount,
  // with the Transport parked at 0; every Part should start(0) and loop, so
  // unlocking a stem is a volume ramp and phase lock is structural (spec §8.5).
  schedule(stems: Tone.Channel[], keep: Keep): void;
}
