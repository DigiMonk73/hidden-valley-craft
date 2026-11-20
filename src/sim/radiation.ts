// Radiation (docs/PHASE6.md, 3; docs/PHASE8.md, 2): a dose from 0 to 100 that climbs while you stand in a
// hotspot's ring or on Zone-4's poisoned ground, fades slowly, and caps your health until it fades, a tablet
// binds it or Doc treats it. 100 is the limit: dose past it comes off health, one for one. A hazard suit
// lets a fortieth through. Pure.

import { radiationAt, ZONE2, ZONE4, falloutAt, falloutDepth, ridgeRoadPoint } from '../gen/layout.ts';

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

/** How fast the counter clicks at (x, z): 0 out of earshot, rising from the edge of hearing to the heart. It hears the ground, not what the suit lets through. */
export function clickRate(x: number, z: number): number {
  // Zone-4: a slow tick from ten metres outside the signs, quickening with the ground's rate.
  const f = falloutAt(x, z), depth = falloutDepth(x, z);
  let best = f > 0 ? Math.min(1, 0.3 + f / 100) : depth > -EDGE_HEARD && depth <= 0 ? 0.12 * (1 + depth / EDGE_HEARD) + 0.03 : 0;
  for (const h of ZONE2.hotspots) {
    const d = Math.hypot(x - h.x, z - h.z);
    if (d < h.r + HEAR_MARGIN) best = Math.max(best, Math.min(1, (h.r + HEAR_MARGIN - d) / (h.r + HEAR_MARGIN)) * (0.4 + h.rate / 5));
  }
  return best;
}

/** Is (x, z) within earshot of a hotspot (the first warning)? */
export function nearHotspot(x: number, z: number): boolean { return clickRate(x, z) > 0; }

// ---- Zone-4: the suit, the limit, the tablets (docs/PHASE8.md, 2) ---------------------------------------

/** How far outside Zone-4's line of signs the counter starts to tick (m). */
export const EDGE_HEARD = 10;
/** What a hazard suit lets through. */
export const SUIT_LETS: number = ZONE4.suit;
/** What one blue tablet binds. */
export const TABLET_DOSE = 30;

/** The dose a second that reaches the body at (x, z): the ground's rate, cut by the suit. */
export function doseRate(x: number, z: number, suited: boolean): number {
  return radiationAt(x, z) * (suited ? SUIT_LETS : 1);
}

/**
 * `seconds` at (x, z): the dose climbs to the limit, and whatever would take it past the limit comes off
 * health instead (`harm`). `gameHours` of game time fade it meanwhile, as before.
 */
export function absorb(dose: number, x: number, z: number, seconds: number, suited: boolean, gameHours = 0): { dose: number; harm: number } {
  const faded = Math.max(0, dose - (FADE_PER_DAY * gameHours) / 24);
  const taken = faded + doseRate(x, z, suited) * seconds;
  return { dose: Math.min(DOSE_MAX, taken), harm: Math.max(0, taken - DOSE_MAX) };
}

/** The dose after one blue tablet. */
export function takeTablet(dose: number): number { return Math.max(0, dose - TABLET_DOSE); }

/** Seconds to the limit at this rate (Infinity with none). */
export function secondsToLimit(dose: number, rate: number): number {
  return rate > 0 ? Math.max(0, DOSE_MAX - dose) / rate : Infinity;
}

/** Seconds a body with `hp` health lasts at this rate: to the limit, then until the health the dose leaves is gone. */
export function secondsToLive(dose: number, hp: number, rate: number): number {
  return rate > 0 ? secondsToLimit(dose, rate) + Math.min(hp, healthCap(DOSE_MAX)) / rate : Infinity;
}

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

/**
 * The meter's second line while the dose is climbing: the rate, the suit, and how long to the limit at this
 * rate (or, at the limit, that it is coming off health). Empty when nothing is being taken.
 */
export function meterLine(dose: number, rate: number, suited: boolean): { text: string; alarm: boolean } {
  if (rate <= 0) return { text: '', alarm: false };
  const r = `+${rate < 1 ? rate.toFixed(1) : Math.round(rate)}/s`, wear = suited ? 'suit' : 'NO SUIT';
  if (dose >= DOSE_MAX) return { text: `${r} · ${wear} · at the limit: it is taking your health`, alarm: true };
  const t = secondsToLimit(dose, rate);
  return { text: `${r} · ${wear} · limit in ${clock(t)}`, alarm: !suited || t < 60 };
}

/** The dose a walk along the ridge road costs from s0 to s1 metres along it, at `speed` m/s. */
export function roadDose(s0: number, s1: number, suited: boolean, speed = 4): number {
  let total = 0;
  const a = Math.min(s0, s1), b = Math.max(s0, s1);
  for (let s = a; s < b; s += 0.5) { const [x, z] = ridgeRoadPoint(s + 0.25); total += doseRate(x, z, suited) * (Math.min(0.5, b - s) / speed); }
  return total;
}
