import { useEffect } from "react";
import { clockState } from "./clockState";
import { useGameStore } from "./store";

// One input: change lane (spec §3). Left = inward (lane 0 is nearest the
// label), right = outward. The lane commits instantly on keydown; only the
// visual radius is interpolated (spec §6.4).
export function useLaneInput(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!clockState.playing || clockState.ended || clockState.paused) return;
      if (e.repeat) return;

      const key = e.key.toLowerCase();
      if (key === "arrowleft" || key === "a") {
        e.preventDefault();
        useGameStore.getState().moveLane(-1);
      } else if (key === "arrowright" || key === "d") {
        e.preventDefault();
        useGameStore.getState().moveLane(1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
