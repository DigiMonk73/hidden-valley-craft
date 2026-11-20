// M5, the uplink (docs/PHASE8.md, 8). DESIGN.md's M5 bundles nine unlocks; here each is a thing the player has
// done, ticked on the computer. The run to the tower's yard, and home alive, is its own line, as in M3 and M4;
// meeting Ray at the refuge is the script's "Ray meetup". Pure.

import { inSanctuary, ZONE4 } from '../gen/layout.ts';
import type { Step } from './milestones.ts';

export const M5_STEPS: Step[] = [
  { flag: 'ridge_home', label: 'Reach the relay tower on the ridge (Zone 4), and come home alive' },
  { flag: 'ray_met', label: 'Meet Ray at the refuge on the pass (call him once you carry a hazard suit)' },
  { flag: 'antenna_up', label: 'The satellite antenna on the cliff above the cave (the tower’s dish; the balcony’s hoist)' },
  { flag: 'telescope_set', label: 'A telescope under the sky at home (the observatory’s optics)' },
  { flag: 'uplink_live', label: 'Open the link: the uplink terminal on the computer (Ray’s modem; hydro turning)' },
  { flag: 'agi_asked', label: 'Ask it something, and read the answer' },
  { flag: 'med_made', label: 'A medical bench and a distiller: make a medicine' },
  { flag: 'schematic_built', label: 'Build from one of its drawings (the thermal optic, the sonic lure or the smoke pot)' },
  { flag: 'armor3_made', label: 'Engineer’s armour (its drawing)' },
];

/** In the tower's yard: on its level ground, or within a few steps of it. */
export function atTowerYard(x: number, z: number): boolean {
  const y = ZONE4.yard;
  return Math.hypot(Math.max(y.x0 - x, x - y.x1, 0), Math.max(y.z0 - z, z - y.z1, 0)) < 6;
}

/** What crafting a thing earns toward M5, if anything: the flag to set. */
export function craftedFlag(item: string): string | null {
  if (item === 'rad_tablets' || item === 'antibiotics' || item === 'adrenaline') return 'med_made';
  if (item === 'thermal_optic' || item === 'sonic_lure' || item === 'smoke_pot') return 'schematic_built';
  if (item === 'engineer_armor') return 'armor3_made';
  return null;
}

/**
 * Notes where the player is and what stands at home (once a second), and sets the M5 flags it earns. The rest
 * (Ray, the antenna, the link, the first question, what is made) are set where they happen. Returns flags
 * newly set, ending with 'm5_done'.
 */
export function trackM5(flags: Set<string>, x: number, z: number, home: { telescope: boolean }): string[] {
  const added: string[] = [];
  const set = (f: string) => { if (!flags.has(f)) { flags.add(f); added.push(f); } };
  if (atTowerYard(x, z)) set('yard_reached');
  if (inSanctuary(x, z) && flags.has('yard_reached')) set('ridge_home');
  if (home.telescope) set('telescope_set');
  if (M5_STEPS.every((s) => flags.has(s.flag))) set('m5_done');
  return added;
}

/** A death outside before reaching home from the tower's yard: the run has to be walked again. */
export function diedOutsideM5(flags: Set<string>): void {
  if (!flags.has('ridge_home')) flags.delete('yard_reached');
}
