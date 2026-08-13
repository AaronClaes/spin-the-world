export interface RecordDef {
  id: string;
  title: string;
  genre: string;
  bpm: number;
  totalBeats: number;
  band: { startRadius: number; endRadius: number; laneGap: number };
}

// M1: only the fields the clock needs. Pieces/notes/stems arrive in M2.
export const meadow: RecordDef = {
  id: "meadow",
  title: "Meadow 45",
  genre: "folk",
  bpm: 120,
  totalBeats: 176, // 22 revolutions, 88s at 120bpm
  band: { startRadius: 4.5, endRadius: 2.0, laneGap: 0.45 },
};
