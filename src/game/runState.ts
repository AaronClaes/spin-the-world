import { DEFAULT_RECORD } from "../records";
import type { RecordDef } from "../records/types";
import { createRun } from "./run";
import type { RunState } from "./run";

// The active run, created (and the chart validated) at load. Module-level so
// useFrame code reads it without touching the React render path — every scene
// component reads activeRun.record rather than importing a record directly,
// which is what makes the shelf swappable.
//
// The render path can't see a mutation here, so Scene keys its gameplay
// subtree on the record id: picking a different record remounts the parts that
// bake record data in at construction (instance counts, accent colours, the
// island layout).
export let activeRun: RunState = createRun(DEFAULT_RECORD);

// Picking a record off the wall. Also where a record that wasn't loaded at
// startup gets its chart validated — a broken chart throws here, loudly.
export function selectRecord(record: RecordDef): void {
  activeRun = createRun(record);
}

// Replay: same record, fresh items.
export function resetActiveRun(): void {
  activeRun = createRun(activeRun.record);
}
