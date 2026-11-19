// Radiation (docs/PHASE6.md, 3): a dose from 0 to 100 that climbs while you stand in a hotspot's ring,
// fades slowly, and caps your health until it fades or Doc treats it. It never kills by itself. Pure.

import { radiationAt, ZONE2 } from '../gen/layout.ts';

export const DOSE_MAX = 100;
/** The dose fades by this much a game day. */
export const FADE_PER_DAY = 4;
/** How far outside a ring the Geiger counter starts to click (m). */
export const HEAR_MARGIN = 4;

/** The highest health the dose allows: 100 − 0.6 × dose, never below 40. */
export function healthCap(dose: number): number {
  return Math.max(40, Math.round(100 - 0.6 * Math.max(0, dose)));
}

/** The dose after `seconds` at (x, z), `gameHours` of game time having passed meanwhile (for fading). */
export function stepDose(dose: number, x: number, z: number, seconds: number, gameHours: number): number {
  const rate = radiationAt(x, z);
  const faded = dose - (FADE_PER_DAY * gameHours) / 24;
  return Math.max(0, Math.min(DOSE_MAX, faded + rate * seconds));
}

/** How fast the counter clicks at (x, z): 0 out of earshot, rising from the edge of hearing to the heart. */
export function clickRate(x: number, z: number): number {
  let best = 0;
  for (const h of ZONE2.hotspots) {
    const d = Math.hypot(x - h.x, z - h.z);
    if (d < h.r + HEAR_MARGIN) best = Math.max(best, Math.min(1, (h.r + HEAR_MARGIN - d) / (h.r + HEAR_MARGIN)) * (0.4 + h.rate / 5));
  }
  return best;
}

/** Is (x, z) within earshot of a hotspot (the first warning)? */
export function nearHotspot(x: number, z: number): boolean { return clickRate(x, z) > 0; }
