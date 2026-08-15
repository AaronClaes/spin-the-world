import { harbourSong } from "./harbour";
import { meadowSong } from "./meadow";
import type { SongDef } from "./types";

// One arrangement per record, keyed by record id. Kept separate from the
// record registry so the chart and the music can be edited without touching
// each other.
const SONGS: Record<string, SongDef> = {
  [meadowSong.id]: meadowSong,
  [harbourSong.id]: harbourSong,
};

export function songFor(recordId: string): SongDef {
  const song = SONGS[recordId];
  if (!song) throw new Error(`no arrangement for record "${recordId}"`);
  return song;
}
