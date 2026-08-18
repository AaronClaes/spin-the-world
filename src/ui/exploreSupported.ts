// Explore mode is walked with WASD and nothing else. Ecctrl ships a touch
// joystick (ecctrl/input) and we don't wire it, so a phone that gets inside an
// island can look around and never move — the worst version of a reward, which
// is one you can see and not use.
//
// So the door is only offered where there's a keyboard behind it. Same shape as
// fullscreenSupported() in useFullscreen.ts: ask the question rather than
// assume it, and render nothing when the answer is no rather than a button that
// strands you. The wall's hint line stays as it is either way — it teaches the
// run, not the walk.
//
// (hover: none) rather than (pointer: coarse), matching the CSS that picks
// between the keys/touch copy: a laptop with a touchscreen answers coarse and
// still has the keys, so it should get the button.
export function exploreSupported(): boolean {
  if (typeof matchMedia === "undefined") return true;
  return !matchMedia("(hover: none)").matches;
}
