import { harbour } from "./harbour";
import { meadow } from "./meadow";
import type { RecordDef } from "./types";

export type { RecordDef } from "./types";

// The shelf, in wall order. Every record on it is playable from the start:
// gating the second record behind finishing the first would cost a two-minute
// jam visitor the second world entirely, and the first record's payoff is
// already its own alive diorama hanging in the frame (spec §8.7).
export const RECORDS: readonly RecordDef[] = [meadow, harbour];

export const recordById = (id: string): RecordDef =>
  RECORDS.find((r) => r.id === id) ?? RECORDS[0];
