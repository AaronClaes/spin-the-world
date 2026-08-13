import type { WorldPieceDef } from "../records/types";
import { BEATS_PER_REV } from "./constants";

// Proves a chart is completable (spec §7): a perfect player must be able to
// collect every world piece before the track ends. A missed piece recurs at
// +BEATS_PER_REV until its recurrence would land past totalBeats — then it is
// gone forever. Clusters (two pieces on the same beat in different lanes)
// force misses, so completability is not obvious by inspection.
//
// The player can switch lanes freely between arrivals; the only hard
// constraint is that two pieces cannot be caught at the same instant. We
// conservatively also require a small gap between catches in different lanes.
const MIN_SWITCH_GAP_BEATS = 0.5;

interface Occurrence {
  beat: number;
  lane: number;
}

// Returns one valid catch plan (piece index → catch beat, in worldPieces
// order), or null if no assignment lets every piece be caught. Exhaustive
// backtracking — the choice space is tiny (≤12 pieces × a handful of laps).
export function solveChart(
  pieces: WorldPieceDef[],
  totalBeats: number,
): number[] | null {
  const options: Occurrence[][] = pieces.map((p) => {
    const occ: Occurrence[] = [];
    for (let beat = p.beat; beat <= totalBeats; beat += BEATS_PER_REV) {
      occ.push({ beat, lane: p.lane });
    }
    return occ;
  });

  // Assign pieces with the fewest options first — standard fail-fast ordering.
  const order = options
    .map((occ, index) => ({ occ, index }))
    .sort((a, b) => a.occ.length - b.occ.length);

  const chosen: (Occurrence | null)[] = pieces.map(() => null);

  const conflicts = (a: Occurrence, b: Occurrence) => {
    if (a.beat === b.beat) return true; // one player, one lane
    return (
      a.lane !== b.lane && Math.abs(a.beat - b.beat) < MIN_SWITCH_GAP_BEATS
    );
  };

  const assign = (slot: number): boolean => {
    if (slot === order.length) return true;
    const { occ, index } = order[slot];
    for (const candidate of occ) {
      if (chosen.some((c) => c !== null && conflicts(c, candidate))) continue;
      chosen[index] = candidate;
      if (assign(slot + 1)) return true;
      chosen[index] = null;
    }
    return false;
  };

  if (!assign(0)) return null;
  return chosen.map((c) => (c as Occurrence).beat);
}
