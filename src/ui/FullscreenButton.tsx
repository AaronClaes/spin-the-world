import { CornersIn, CornersOut } from "./icons";
import { fullscreenSupported, useFullscreen } from "./useFullscreen";

// Asked once, at module load: the answer can't change during a session, and a
// button that flickers into existence is worse than one that never appears.
const SUPPORTED = fullscreenSupported();

// Mute's neighbour, and there for the same reason: on a phone the browser's
// address bar eats a strip of a game that's already asking you to hold the
// thing sideways. Nothing about the run changes — this is the window, not the
// game — so it lives outside every phase, exactly like mute.
export function FullscreenButton() {
  const { full, toggle } = useFullscreen();

  if (!SUPPORTED) return null;

  const Icon = full ? CornersIn : CornersOut;
  const label = full ? "Exit fullscreen" : "Fullscreen";
  return (
    <button
      className="corner-button"
      onClick={() => void toggle()}
      aria-label={label}
      aria-pressed={full}
      title={label}
    >
      <Icon weight="bold" />
    </button>
  );
}
