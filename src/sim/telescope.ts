// The telescope (docs/PHASE8.md, 5): a true look from where it stands, twelve times nearer, with a label when
// a known thing is in the cross-hairs. This is the aiming: where each thing lies from an eye, whether the land
// stands in the way, and what the cross-hairs are on. Pure. Yaw is the game's: 0 north, a quarter turn west.

import { PLACES, ZONE3, WATERFALL, VALLEY, surfaceHeight, zone4Floor } from '../gen/layout.ts';

export const SCOPE_ZOOM = 12;
/** How near the cross-hairs must be to a thing for its label to show (degrees). */
export const SCOPE_NEAR = 1.6;

export type V3 = [number, number, number];
export interface ScopeTarget { id: 'falls' | 'tower' | 'dam' | 'moon' | 'sats'; label: string; yaw: number; pitch: number; dist: number; hidden: boolean }

const DEG = Math.PI / 180;
/** The yaw and pitch (radians) of a direction. */
export function aimOf(dx: number, dy: number, dz: number): { yaw: number; pitch: number } {
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}

/** Is the straight line from the eye to a point clear of the land (its lie, not its trees)? */
export function sightClear(eye: V3, to: V3, heightAt: (x: number, z: number) => number = surfaceHeight): boolean {
  const d = Math.hypot(to[0] - eye[0], to[2] - eye[2]), n = Math.ceil(d / 4);
  for (let k = 2; k < n - 1; k++) {
    const t = k / n, x = eye[0] + (to[0] - eye[0]) * t, z = eye[2] + (to[2] - eye[2]) * t;
    if (heightAt(Math.floor(x), Math.floor(z)) > eye[1] + (to[1] - eye[1]) * t) return false;
  }
  return true;
}

/** The moon's direction at `hour` (it stands opposite the sun), or null while it is under the horizon. */
export function moonDir(hour: number): V3 | null {
  const a = ((hour - 6) / 24) * Math.PI * 2, len = Math.hypot(1, 0.22);
  const d: V3 = [-Math.cos(a) / len, -Math.sin(a) / len, -0.22 / len];
  return d[1] > 0.03 ? d : null;
}

/** The satellites' train comes over every this many seconds, and takes this long to cross. */
export const TRAIN_EVERY = 240, TRAIN_CROSSES = 100;
/**
 * The train of four satellites at `seconds` on the clock: their directions, south-west to north-east through
 * the high sky, or none while no pass is on or it is day.
 */
export function satTrain(seconds: number, hour: number): V3[] {
  if (hour > 5.2 && hour < 18.8) return [];
  const u = (((seconds % TRAIN_EVERY) + TRAIN_EVERY) % TRAIN_EVERY) / TRAIN_CROSSES;
  const out: V3[] = [];
  for (let k = 0; k < 4; k++) {
    const t = u - k * 0.035; // each a little behind the one ahead
    if (t <= 0.04 || t >= 0.96) continue;
    const a = t * Math.PI, h = Math.sin(a), g = Math.cos(a); // g: +1 at the south-west horizon, −1 at the north-east
    const d: V3 = [-g * 0.6 + 0.25 * h, h * 0.9, g * 0.8 + 0.2 * h];
    const len = Math.hypot(...d);
    out.push([d[0] / len, d[1] / len, d[2] / len]);
  }
  return out;
}

/** Everything the telescope knows by name, as seen from `eye` at `hour` (and `seconds` on the clock, for the satellites). */
export function scopeTargets(eye: V3, hour: number, seconds: number): ScopeTarget[] {
  const out: ScopeTarget[] = [];
  const land = (id: ScopeTarget['id'], label: string, p: V3) => {
    const dx = p[0] - eye[0], dy = p[1] - eye[1], dz = p[2] - eye[2], dist = Math.hypot(dx, dy, dz);
    if (dist < 6) return;
    out.push({ id, label: `${label} · ${dist < 1000 ? Math.round(dist) + ' m' : (dist / 1000).toFixed(2) + ' km'}`, ...aimOf(dx, dy, dz), dist, hidden: !sightClear(eye, p) });
  };
  const t = PLACES.ridgeTower, d = ZONE3.dam;
  land('falls', 'The falls', [WATERFALL.x + 1, (WATERFALL.top + VALLEY.water) / 2 + 6, (WATERFALL.z0 + WATERFALL.z1) / 2]);
  land('tower', 'The relay tower', [t.x + 0.5, zone4Floor.tower + t.height * 0.8, t.z + 0.5]);
  land('dam', 'Presa Río Seco', [(d.x0 + d.x1) / 2, d.crest + 2, d.z]);
  const m = moonDir(hour);
  if (m && (hour >= 18.5 || hour <= 5.5)) out.push({ id: 'moon', label: 'The moon', ...aimOf(...m), dist: Infinity, hidden: false });
  const train = satTrain(seconds, hour);
  if (train.length) out.push({ id: 'sats', label: 'Satellites, in a train · still kept', ...aimOf(...train[0]), dist: Infinity, hidden: false });
  return out;
}

/** What the cross-hairs are on, if anything: the nearest named thing within SCOPE_NEAR degrees. */
export function aimedAt(yaw: number, pitch: number, targets: ScopeTarget[]): ScopeTarget | null {
  let best: ScopeTarget | null = null, bestA = SCOPE_NEAR * DEG;
  for (const t of targets) {
    const dy = Math.atan2(Math.sin(yaw - t.yaw), Math.cos(yaw - t.yaw)) * Math.cos(pitch), a = Math.hypot(dy, pitch - t.pitch);
    if (a < bestA) { bestA = a; best = t; }
  }
  return best;
}

/** The label for the cross-hairs: the thing's name and range, and a word when the land hides it. */
export function scopeLabel(t: ScopeTarget | null): string {
  return t ? (t.hidden ? `${t.label} · behind the land from here` : t.label) : '';
}
