import { RAD_PER_BEAT } from "./constants";

export type Lane = 0 | 1 | 2;

// The disc counter-rotates so that an item authored at beat N reaches the
// player (world angle 0) at exactly beatPos === N.
export const discRotation = (beatPos: number) => -beatPos * RAD_PER_BEAT;

// World angle of an item; 0 means "at the player". Positive = still ahead.
export const worldAngle = (beat: number, beatPos: number) =>
  (beat - beatPos) * RAD_PER_BEAT;

// Centre radius of the three-lane band, migrating rim → label over the track.
export const bandCenter = (progress: number, r0: number, r1: number) =>
  r0 + (r1 - r0) * progress;

// Lane 0 is innermost (toward the world), lane 2 outermost (toward the rim).
// Accepts fractional lanes: the runner's *visual* radius interpolates between
// lanes while the committed integer lane switches instantly (spec §6.4).
export const laneRadius = (lane: number, center: number, gap: number) =>
  center + (lane - 1) * gap;

// Items are pressed into the groove where the needle will be when they
// arrive: radius is fixed in disc space, evaluated at the item's own beat.
export const itemRadius = (
  lane: Lane,
  beat: number,
  totalBeats: number,
  r0: number,
  r1: number,
  gap: number,
) => laneRadius(lane, bandCenter(beat / totalBeats, r0, r1), gap);

// Disc-local position of an item (angle is fixed at authoring time; the
// disc's own rotation carries it to the player).
export const itemLocalAngle = (beat: number) =>
  (beat * RAD_PER_BEAT) % (Math.PI * 2);
