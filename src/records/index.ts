import { harbour } from "./harbour";
import { meadow } from "./meadow";
import { neon } from "./neon";
import type { RecordDef } from "./types";

export type { RecordDef } from "./types";

// The shelf, in wall order. Every record on it is playable from the start:
// gating the second record behind finishing the first would cost a two-minute
// jam visitor the second world entirely, and the first record's payoff is
// already its own alive diorama hanging in the frame (spec §8.7).
//
// Wall order is also the tempo order — 45, 33, 78 — so the row reads left to
// right as easy, calm, fast. StudioWall has exactly three plaques.
export const RECORDS: readonly RecordDef[] = [meadow, harbour, neon];

export const recordById = (id: string): RecordDef =>
  RECORDS.find((r) => r.id === id) ?? RECORDS[0];
