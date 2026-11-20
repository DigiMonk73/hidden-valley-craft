// What the builder's computer shows: the wallets, the home's power, the uplink, and each milestone with its
// steps. Rows of [label, value, style]. (Split out of src/game.ts: docs/FIXES.md, 8.)

import type { Inventory } from '../sim/inventory.ts';
import { btc } from '../sim/trade.ts';
import { M1_STEPS, M2_STEPS, M3_STEPS, M4_STEPS, type Step } from '../sim/milestones.ts';
import { RIG_THS, RIG_SATS_PER_DAY, BANK_KWH, HYDRO_KW, type Devices, type PowerState } from '../sim/power.ts';
import { itemId } from '../world/items.ts';

export type Row = [string, string, string];

/** What the computer reads. */
export interface Desk {
  flags: ReadonlySet<string>;
  hotbar: Inventory;
  wallet: number;
  power: PowerState;
  devices: Devices;
}

/** The computer's power lines (docs/PHASE6.md, 6; docs/PHASE7.md, 5). */
export function powerRows(P: PowerState, d: Devices): Row[] {
  const n = d.mining_rig.length;
  if (!d.solar_array.length && !n && !d.hydro_generator.length) return [['Mining', 'no rig: needs a solar array and a battery bank', 'dim']];
  const hydro = d.hydro_generator.length;
  return [
    ...(hydro ? [['Hydro', `${hydro} generator${hydro === 1 ? '' : 's'} in the creek · ${(hydro * HYDRO_KW).toFixed(2)} kW, day and night`, 'btc'] as Row] : []),
    ['Solar', `${d.solar_array.length} array${d.solar_array.length === 1 ? '' : 's'} · ${P.solar.toFixed(2)} kW now`, d.solar_array.length ? '' : 'dim'],
    ['Battery bank', d.battery_bank.length ? `${P.charge.toFixed(1)} of ${d.battery_bank.length * BANK_KWH} kWh` : 'none', d.battery_bank.length ? '' : 'dim'],
    n > 1
      ? ['Mining farm', P.rigs ? `${P.rigs} of ${n} rigs running · ${(RIG_THS * P.rigs).toFixed(2)} TH/s${P.rigs < n ? (hydro ? ' · short of power' : ' · more than one rig needs hydro') : ''}` : 'stopped: no power', P.rigs ? 'btc' : 'dim']
      : ['Mining rig', n ? (P.on.mining_rig ? `${(RIG_THS * n).toFixed(2)} TH/s · running` : 'stopped: no power') : 'none', n && P.on.mining_rig ? 'btc' : 'dim'],
    ['Mined today', btc(P.satsToday), 'btc'],
    ['Mined in all', `${btc(P.satsTotal)} (about ${btc(RIG_SATS_PER_DAY * Math.max(1, hydro ? n : Math.min(n, 1)))} a day, powered)`, 'btc'],
    ['Fridge', d.fridge.length ? (P.on.fridge ? 'cold' : 'off: no power') : 'none', d.fridge.length ? '' : 'dim'],
    ['Water pump', d.water_pump.length ? (P.on.water_pump ? 'ready' : 'off: no power') : 'none', d.water_pump.length ? '' : 'dim'],
  ];
}

const MILESTONES: [string, string, Step[], string | null][] = [
  ['m1_done', 'M1 · the first outside run', M1_STEPS, null],
  ['m2_done', 'M2 · the homestead expansion', M2_STEPS, 'm1_done'],
  ['m3_done', 'M3 · power up', M3_STEPS, 'm2_done'],
  ['m4_done', 'M4 · hydro', M4_STEPS, 'm3_done'],
];

/** A milestone's heading (done, or how many steps, and which milestone it waits for) and its steps, ticked or not. */
export function milestoneRows(flags: ReadonlySet<string>): Row[] {
  return MILESTONES.flatMap(([done, title, steps, before]) => {
    const isDone = flags.has(done);
    const waits = before && !flags.has(before) ? ` · after ${before.slice(0, 2).toUpperCase()}` : '';
    return [
      [title, isDone ? 'done ✓' : `${steps.filter((st) => flags.has(st.flag)).length} of ${steps.length}${waits}`, isDone ? 'btc' : ''] as Row,
      ...steps.map((st) => [`   ${flags.has(st.flag) ? '✓' : '·'} ${st.label}`, '', flags.has(st.flag) ? '' : 'dim'] as Row),
    ];
  });
}

/** Everything on the builder's terminal, top to bottom. */
export function computerRows(g: Desk): Row[] {
  const cold = g.hotbar.count(itemId('hardware_wallet')) > 0;
  return [
    ['Hot wallet (phone)', btc(g.wallet), 'btc'],
    ['Cold wallet', cold ? '2.50000000 BTC (connected, kept cold)' : 'not connected', cold ? 'btc' : 'dim'],
    ...powerRows(g.power, g.devices),
    ['Satellite uplink', g.flags.has('uplink_plans') ? 'Ray’s plans in hand · no antenna' : 'no antenna', 'dim'],
    ...milestoneRows(g.flags),
    ['Last note', '“Back before the rains.”', ''],
  ];
}
