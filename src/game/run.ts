import type { RecordDef } from "../records/types";
import { BEATS_PER_REV } from "./constants";
import type { Lane } from "./geometry";
import type { RunItem } from "./items";
import { buildRunItems, validateRecord } from "./items";

// Collection is arithmetic — no collision detection (spec §6.4). Items sit in
// a list sorted by beat with a pointer to the next unresolved one; each frame
// we resolve everything whose beat the transport has crossed.

export interface ResolveEvent {
  item: RunItem;
  collected: boolean;
}

export interface RunState {
  record: RecordDef;
  items: RunItem[]; // sorted by beat; pieces are re-inserted on recurrence
  notes: RunItem[]; // same objects, stable order — for the instanced renderer
  pieces: RunItem[];
  next: number;
}

export function createRun(record: RecordDef): RunState {
  validateRecord(record);
  const items = buildRunItems(record);
  return {
    record,
    items,
    notes: items.filter((i) => i.kind === "note"),
    pieces: items.filter((i) => i.kind === "piece"),
    next: 0,
  };
}

// Resolve every item whose beat beatPos has crossed, against the *committed*
// integer lane (never the interpolated visual radius — spec §6.4). Missed
// pieces recur next revolution (spec §8.1) unless that lands past the end of
// the track, in which case they are lost for good.
export function resolveCrossings(
  run: RunState,
  beatPos: number,
  playerLane: Lane,
  out: ResolveEvent[],
): void {
  while (run.next < run.items.length && run.items[run.next].beat <= beatPos) {
    const item = run.items[run.next];
    run.next++;

    if (item.lane === playerLane) {
      item.status = "collected";
      out.push({ item, collected: true });
      continue;
    }

    if (item.kind === "note") {
      item.status = "missed";
      out.push({ item, collected: false });
      continue;
    }

    const retry = item.beat + BEATS_PER_REV;
    if (retry > run.record.totalBeats) {
      item.status = "lost";
      out.push({ item, collected: false });
      continue;
    }

    // Re-insert at its next arrival, keeping the list sorted. Radius is a
    // function of beat, so the piece visibly migrates inward with the groove.
    item.beat = retry;
    run.items.splice(run.next - 1, 1);
    run.next--;
    let at = run.next;
    while (at < run.items.length && run.items[at].beat <= retry) at++;
    run.items.splice(at, 0, item);
    out.push({ item, collected: false });
  }
}
