// Power at home (docs/PHASE6.md, 6): the solar arrays, the battery banks, and what they run (the mining
// rigs, the fridge, the water pump). M4 (docs/PHASE7.md, 5) adds the hydro generator in the creek, steady day
// and night, and the farm: as many rigs run as there is power for, and rigs beyond the first only on hydro. The devices are found in the world's record of what the player placed,
// so nothing new is saved for them; only the banks' charge and the rig's earnings are. Pure.

import { BLOCK_DEFS, blockName } from '../world/blocks.ts';
import { CHUNKS_Y, COLS_X, CS } from '../world/constants.ts';
import { inSanctuary } from '../gen/layout.ts';
import trade from '../../data/trade.json' with { type: 'json' };

export const ARRAY_KW = 1; // one array in full sun
export const BANK_KWH = 12; // one bank, full
export const HYDRO_KW = 2; // one generator in the creek, day and night
/** What each load draws, in the order they are kept running when power runs short (the rig goes first). */
export const LOADS = [
  { kind: 'water_pump', kw: 0.05 },
  { kind: 'fridge', kw: 0.1 },
  { kind: 'mining_rig', kw: 0.45 },
] as const;
export type DeviceKind = 'solar_array' | 'battery_bank' | 'mining_rig' | 'fridge' | 'water_pump' | 'hydro_generator';
const KINDS: DeviceKind[] = ['solar_array', 'battery_bank', 'mining_rig', 'fridge', 'water_pump', 'hydro_generator'];
/** What a running rig earns in a whole game day (DESIGN.md A4: a wound care, P_wc, every T = 2 days). */
export const RIG_SATS_PER_DAY: number = trade.rigSatsPerDay;
/** The hashrate shown while a rig runs (a GPU rig's share of a pool, for the screen only). */
export const RIG_THS = 0.84;

export type Devices = Record<DeviceKind, [number, number, number][]>;

/** The power devices the player has placed at home (in the sanctuary), with where each stands. */
export function findDevices(edits: Map<number, Map<number, number>>): Devices {
  const out = Object.fromEntries(KINDS.map((k) => [k, []])) as unknown as Devices;
  for (const [key, e] of edits) {
    const cy = key % CHUNKS_Y, col = (key - cy) / CHUNKS_Y, cx = col % COLS_X, cz = Math.floor(col / COLS_X);
    for (const [i, id] of e) {
      if (!id) continue;
      const kind = (BLOCK_DEFS[id]?.base ?? blockName(id)) as DeviceKind;
      if (!KINDS.includes(kind)) continue;
      const x = cx * CS + (i & 31), y = cy * CS + ((i >> 10) & 31), z = cz * CS + ((i >> 5) & 31);
      if (inSanctuary(x, z)) out[kind].push([x, y, z]);
    }
  }
  return out;
}

export interface PowerState {
  charge: number; // kWh stored in the banks
  on: Record<'mining_rig' | 'fridge' | 'water_pump', boolean>; // each load, running in the last minute
  made: number; // kW made in the last minute, sun and water together
  rigs: number; // how many rigs ran in the last minute
  satsTotal: number; // what the rig has earned, all told
  satsToday: number; // since the last dawn
  frac: number; // part of a satoshi not yet paid
}

export function newPower(): PowerState {
  return { charge: 0, on: { mining_rig: false, fridge: false, water_pump: false }, made: 0, rigs: 0, satsTotal: 0, satsToday: 0, frac: 0 };
}

/** How high the sun stands, 0 at night to 1 at noon (the sun rises at 6 and sets at 18). */
export function sunAt(hour: number): number {
  return Math.max(0, Math.sin((Math.PI * (hour - 6)) / 12));
}

/**
 * Runs the home's power for `minutes` game minutes from `hour`. Each minute the arrays make power by the sun
 * and the generators by the creek, the loads take theirs in order (pump, fridge, then each rig there is power
 * for), a surplus charges the banks and a shortfall drains them. Without hydro only one rig runs: the farm is M4's.
 * Returns the satoshis the rig earned, to be paid into the hot wallet.
 */
export function stepPower(s: PowerState, d: Devices, hour: number, minutes: number): number {
  const arrays = d.solar_array.length, hydro = d.hydro_generator.length, cap = d.battery_bank.length * BANK_KWH;
  s.charge = Math.min(s.charge, cap);
  let paid = 0;
  for (let m = 0; m < minutes; m++) {
    const h = (hour + m / 60) % 24;
    if (h < 6 && (h + 1 / 60) >= 6) s.satsToday = 0; // a new day's tally at dawn
    const made = arrays * ARRAY_KW * sunAt(h) + hydro * HYDRO_KW;
    let avail = made / 60 + s.charge;
    let rigs = 0;
    for (const load of LOADS) {
      const n = d[load.kind].length, each = load.kw / 60;
      if (load.kind === 'mining_rig') {
        // As many rigs as there is power for; beyond the first, only with a generator in the creek.
        rigs = Math.min(hydro > 0 ? n : Math.min(n, 1), Math.floor((avail + 1e-9) / each));
        s.on.mining_rig = rigs > 0;
        avail -= rigs * each;
        continue;
      }
      const need = n * each;
      const on = n > 0 && avail >= need;
      s.on[load.kind] = on;
      if (on) avail -= need;
    }
    s.rigs = rigs;
    s.charge = Math.min(cap, avail);
    s.made = made;
    if (s.on.mining_rig) {
      s.frac += (rigs * RIG_SATS_PER_DAY) / (24 * 60);
      const whole = Math.floor(s.frac);
      s.frac -= whole; paid += whole;
      s.satsToday += whole; // minute by minute, so a night's sleep counts only the hours since dawn as today
    }
  }
  s.satsTotal += paid;
  return paid;
}

/** Only arrays under open sky make power: `skyAt` gives the sky light (0–15) over a block, or null if unknown (not loaded: as last seen). */
export function sunlit(arrays: [number, number, number][], skyAt: (x: number, y: number, z: number) => number | null, last: [number, number, number][]): [number, number, number][] {
  return arrays.filter(([x, y, z]) => { const s = skyAt(x, y + 1, z); return s === null ? last.some((a) => a[0] === x && a[1] === y && a[2] === z) : s >= 13; });
}

/**
 * Only generators set in the valley's water turn: `waterNear` says whether water lies within two blocks of a
 * block (beside it or a block below), or null if that land is not loaded (then: as last seen).
 */
export function turning(gens: [number, number, number][], waterNear: (x: number, y: number, z: number) => boolean | null, last: [number, number, number][]): [number, number, number][] {
  return gens.filter(([x, y, z]) => { const w = waterNear(x, y, z); return w === null ? last.some((a) => a[0] === x && a[1] === y && a[2] === z) : w; });
}

/** What a load needs to run: power now, from the sun or the banks. */
export function powered(s: PowerState, kind: 'mining_rig' | 'fridge' | 'water_pump'): boolean { return s.on[kind]; }

/** Restores the saved state; anything missing (an older save) starts empty. */
export function powerFromSave(v: unknown): PowerState {
  const p = newPower();
  if (!v || typeof v !== 'object') return p;
  const o = v as Partial<PowerState>;
  if (Number.isFinite(o.charge)) p.charge = Math.max(0, o.charge!);
  if (Number.isFinite(o.satsTotal)) p.satsTotal = o.satsTotal!;
  if (Number.isFinite(o.satsToday)) p.satsToday = o.satsToday!;
  if (Number.isFinite(o.frac)) p.frac = o.frac!;
  return p;
}
