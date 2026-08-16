// One icon family, drawn as SVG, for every glyph the UI used to set in type.
//
// ⏸ ★ × ‹ › are characters, and characters are the platform's to draw: iOS
// resolves ⏸ to a colour emoji out of Apple Color Emoji and ★ to a flat-sided
// star, so the same markup shipped a visibly different UI on a phone than it
// did on the desktop it was designed on. Phosphor's shapes are rounded, which
// is the voice Baloo 2 already speaks in, and its icons default to size="1em"
// and fill="currentColor" — so every font-size and color rule that used to
// style the glyph keeps styling the icon, unchanged.
//
// Imported through here rather than from the package directly so the set the
// game actually uses is one short list rather than a grep. The package is
// sideEffects-free, so this re-export tree-shakes down to the icons named.
export {
  CaretLeft,
  CaretRight,
  CornersIn,
  CornersOut,
  Pause,
  SpeakerSimpleHigh,
  SpeakerSimpleSlash,
  Star,
  X,
} from "@phosphor-icons/react";
