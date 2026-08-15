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
// The row hangs in ascending difficulty — 33, 45, 78, which is also ascending
// tempo — so scanning it left to right is the same gesture as picking how hard
// a run you want. The badges under the plaques say so out loud, and
// records.test.ts keeps the two from drifting apart.
export const RECORDS: readonly RecordDef[] = [harbour, meadow, neon];

// The record the app holds before anything has been picked off the wall, and
// the landing spot for an id that no longer exists (a save from an older
// build). Deliberately not RECORDS[0]: that's a wall-order question, and
// re-hanging the wall shouldn't change what an unknown id resolves to.
export const DEFAULT_RECORD = meadow;

export const recordById = (id: string): RecordDef =>
  RECORDS.find((r) => r.id === id) ?? DEFAULT_RECORD;
