import type { PointerEvent } from "react";
import { clockState } from "../game/clockState";
import { useGameStore } from "../game/store";

// Touch input (spec §13): the screen is split in two — left half steps
// inward (toward the label), right half steps outward, mirroring ←/→. The
// zones are real buttons, so they also give trackpad users a click target;
// the chevron hints only show on touch devices (CSS).
export function TouchControls() {
  const move = (dir: -1 | 1) => (e: PointerEvent) => {
    e.preventDefault();
    if (!clockState.playing || clockState.ended || clockState.paused) return;
    useGameStore.getState().moveLane(dir);
  };

  return (
    <div className="touch-zones">
      <button
        className="zone left"
        onPointerDown={move(-1)}
        aria-label="Move to inner lane"
      >
        ‹
      </button>
      <button
        className="zone right"
        onPointerDown={move(1)}
        aria-label="Move to outer lane"
      >
        ›
      </button>
    </div>
  );
}
