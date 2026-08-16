import { useCallback, useEffect, useState } from "react";

// Element fullscreen, with the two caveats that matter on the devices this is
// for: Safari still only ships it webkit-prefixed, and iPhone Safari doesn't
// ship it at all (iPad does). So support is a question that has to be asked,
// not assumed — see ui/FullscreenButton.tsx, which renders nothing when the
// answer is no rather than offering a button that does nothing.

interface WebkitDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}

interface WebkitElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

const doc = () => document as WebkitDocument;
const root = () => document.documentElement as WebkitElement;

export function fullscreenSupported(): boolean {
  if (typeof document === "undefined") return false;
  const el = root();
  return !!(el.requestFullscreen || el.webkitRequestFullscreen);
}

const isFullscreen = () =>
  !!(document.fullscreenElement || doc().webkitFullscreenElement);

export function useFullscreen() {
  const [full, setFull] = useState(isFullscreen);

  // The browser owns this state, not us: Esc, the system back gesture and the
  // browser's own chrome all leave fullscreen without going through the
  // button, and the icon has to follow. Both event names, for the same reason
  // both request methods exist.
  useEffect(() => {
    const sync = () => setFull(isFullscreen());
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  const toggle = useCallback(async () => {
    try {
      if (isFullscreen()) {
        const d = doc();
        await (d.exitFullscreen?.() ?? d.webkitExitFullscreen?.());
      } else {
        const el = root();
        await (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.());
      }
    } catch {
      // a permissions policy on an embed, or a browser that advertises the
      // method and refuses the call — the game is entirely playable in a
      // window, so a refused request must never take the app down
    }
  }, []);

  return { full, toggle };
}
