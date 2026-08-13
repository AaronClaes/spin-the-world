import { meadow } from "../records/meadow";
import { createRun } from "./run";
import type { RunState } from "./run";

// The active run, created (and the chart validated) at load. Module-level so
// useFrame code reads it without touching the React render path. Restart
// (M3) swaps it via resetActiveRun().
export let activeRun: RunState = createRun(meadow);

export function resetActiveRun(): void {
  activeRun = createRun(meadow);
}
