import type { Lane } from "../game/geometry";
import type { RunItem } from "../game/items";

// Pieces in flight from their groove position to their diorama slot. Pushed
// by the collection loop (ClockDriver), animated and retired by the Diorama.
// Module-level like clockState — flights are frame-rate visual state.

export const FLIGHT_DURATION = 0.6; // seconds (spec §8.4)

export interface Flight {
  prop: string;
  beat: number; // catch beat — fixes the disc-space start position
  lane: Lane;
  startedAt: number | null; // clock.elapsedTime, stamped on first frame
}

export const activeFlights: Flight[] = [];

export function launchFlight(item: RunItem) {
  activeFlights.push({
    prop: item.prop as string,
    beat: item.beat,
    lane: item.lane,
    startedAt: null,
  });
}

export function clearFlights() {
  activeFlights.length = 0;
}
