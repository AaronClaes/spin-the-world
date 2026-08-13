// One revolution = 2 bars of 4/4. At 120bpm this spins the disc at 15 RPM;
// BPM sets RPM, so each record turns at its own genre-appropriate speed.
export const BEATS_PER_REV = 8;
export const RAD_PER_BEAT = (Math.PI * 2) / BEATS_PER_REV;

export const DISC_RADIUS = 5;
export const LABEL_RADIUS = 1.2;
export const DISC_THICKNESS = 0.08;

// The needle rides 2 beats (90°) ahead of the player. Items rise out of the
// vinyl further ahead than that — the two are deliberately decoupled (spec §6.5).
// RISE_LEAD_BEATS must stay < BEATS_PER_REV or risen items collide with the
// previous lap's items at the same angle.
export const NEEDLE_LEAD_BEATS = 2;
export const RISE_LEAD_BEATS = 4;
