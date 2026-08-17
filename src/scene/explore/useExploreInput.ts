import type { EcctrlHandle } from "ecctrl";
import { useEffect, type RefObject } from "react";
import type { MovementInput } from "ecctrl";

// Keyboard for explore mode: WASD or the arrows to walk, shift to run, space
// to jump.
//
// This has to exist. Ecctrl 2.x ships no keyboard handling at all — there is
// not a single keydown listener in the package — and its own Quick Start is
// stale on the point: it wraps the controller in Drei's KeyboardControls, which
// in 2.x nothing reads. Input arrives through setMovement() on the handle, or
// through the touch Joystick, and that is the whole list.
//
// Which is fine, because a flag per direction is all the controller wants, and
// driving it ourselves is what lets the mode share the game's habit of keeping
// input out of the React render path.

const MOVEMENT: Record<string, keyof MovementInput> = {
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "backward",
  ArrowDown: "backward",
  KeyA: "leftward",
  ArrowLeft: "leftward",
  KeyD: "rightward",
  ArrowRight: "rightward",
  Space: "jump",
  ShiftLeft: "run",
  ShiftRight: "run",
};

export function useExploreInput(
  ecctrl: RefObject<EcctrlHandle | null>,
): void {
  useEffect(() => {
    const set = (e: KeyboardEvent, down: boolean) => {
      const field = MOVEMENT[e.code];
      if (!field) return;
      // The arrows scroll the page and space scrolls it a screenful, and both
      // of those are the browser answering a movement key.
      e.preventDefault();
      ecctrl.current?.setMovement({ [field]: down });
    };

    const onDown = (e: KeyboardEvent) => {
      if (e.repeat) return; // held keys are already latched
      set(e, true);
    };
    const onUp = (e: KeyboardEvent) => set(e, false);
    // A key held while the tab loses focus never sends its keyup, and the
    // controller would walk into a wall forever.
    const release = () =>
      ecctrl.current?.setMovement({
        forward: false,
        backward: false,
        leftward: false,
        rightward: false,
        run: false,
        jump: false,
      });

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", release);
    };
  }, [ecctrl]);
}
