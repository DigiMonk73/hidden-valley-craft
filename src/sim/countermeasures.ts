// The two things the uplink's drawings teach you to set down against the Ashen (docs/PHASE8.md, 4): a sonic
// lure that wails and draws them to it, as a shot draws them to where it was fired; and a smoke pot they will
// not step into, and walk out of. Each is a block set down and started with a right-click; it runs its time
// and is spent. Pure: the game turns the blocks on and off and passes the calls and the smoke to the Ashen.

import type { Smoke } from '../entity/ashen.ts';

/** How long a lure wails, how far it is heard, and how often it calls them again while it does. */
export const LURE_SECONDS = 40, LURE_HEARD = 40, LURE_EVERY = 2;
/** How long a pot burns, and how far its smoke keeps them off. */
export const POT_SECONDS = 60, POT_RADIUS = 8;

/** `left`: seconds still to run. `call`: how many times a lure has called so far. */
export interface Device { kind: 'lure' | 'pot'; x: number; y: number; z: number; left: number; call: number }

export function startDevice(kind: Device['kind'], x: number, y: number, z: number): Device {
  return { kind, x, y, z, left: kind === 'lure' ? LURE_SECONDS : POT_SECONDS, call: 0 };
}

/**
 * `dt` seconds of every running device. Returns the lures that call the Ashen now (each every LURE_EVERY
 * seconds, the first at once) and the devices that have run out; `devices` keeps only those still running.
 */
export function stepDevices(devices: Device[], dt: number): { calls: Device[]; spent: Device[] } {
  const calls: Device[] = [], spent: Device[] = [];
  for (let i = devices.length - 1; i >= 0; i--) {
    const d = devices[i];
    // A lure's k-th call is due k × LURE_EVERY seconds after it started (counted, so no call is lost or doubled to rounding).
    const run = (d.kind === 'lure' ? LURE_SECONDS : POT_SECONDS) - d.left;
    if (d.kind === 'lure' && d.call < LURE_SECONDS / LURE_EVERY && run + 1e-6 >= d.call * LURE_EVERY) { calls.push(d); d.call++; }
    d.left -= dt;
    if (d.left <= 1e-9) { spent.push(d); devices.splice(i, 1); }
  }
  return { calls, spent };
}

/** The smoke of every pot still burning, for the Ashen's senses. */
export function smokeOf(devices: Device[]): Smoke[] {
  return devices.filter((d) => d.kind === 'pot').map((d) => ({ x: d.x + 0.5, z: d.z + 0.5, r: POT_RADIUS }));
}

/** Devices from a save: anything malformed is dropped (an older save has none). */
export function devicesFromSave(v: unknown): Device[] {
  if (!Array.isArray(v)) return [];
  return v.filter((d): d is Device => !!d && (d.kind === 'lure' || d.kind === 'pot') && [d.x, d.y, d.z, d.left, d.call].every(Number.isFinite) && d.left > 0)
    .map((d) => ({ kind: d.kind, x: d.x, y: d.y, z: d.z, left: Math.min(d.left, d.kind === 'lure' ? LURE_SECONDS : POT_SECONDS), call: Math.max(0, Math.min(LURE_SECONDS / LURE_EVERY, Math.floor(d.call))) }));
}
