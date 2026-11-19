// M1, the first outside run (docs/PHASE4.md, step 7). DESIGN.md's four M1 unlocks are narrative, with no
// new recipes; here each is a flag the game sets when the player has done it. Pure.

import { inSanctuary, zoneAt, GATE, ZONE2 } from '../gen/layout.ts';

export interface Step { flag: string; label: string }

export const M1_STEPS: Step[] = [
  { flag: 'gate_both', label: 'Swim out through the gate, and back home' },
  { flag: 'marco_trust1', label: 'Meet Marco and trade with him' },
  { flag: 'extracted', label: 'Reach Zone 1, and come home alive' },
  { flag: 'pistol_taken', label: 'Take the dead scout’s pistol' },
];

/**
 * Notes where the player is and what they carry (once a second), and sets the flags it earns.
 * Returns the flags newly set, in order, ending with 'm1_done' when the last step ticks.
 */
export function trackM1(flags: Set<string>, x: number, z: number, carriesPistol: boolean): string[] {
  const added: string[] = [];
  const set = (f: string) => { if (!flags.has(f)) { flags.add(f); added.push(f); } };
  const home = inSanctuary(x, z);
  // Out means through the gate to its canyon side: turning back in the tunnel doesn't count.
  if (!home && x < GATE.x0) set('been_out');
  else if (flags.has('been_out')) set('gate_both');
  const zone = zoneAt(x, z);
  if (zone === 'near' || zone === 'mid' || zone === 'deep') set('reached_near');
  if (home && flags.has('reached_near')) set('extracted');
  if (carriesPistol) set('pistol_taken');
  if (M1_STEPS.every((s) => flags.has(s.flag))) set('m1_done');
  return added;
}

/** A death outside is not a safe way home: the run to Zone-1 has to be walked back. */
export function diedOutside(flags: Set<string>): void {
  if (!flags.has('extracted')) flags.delete('reached_near');
  if (!flags.has('gate_both')) flags.delete('been_out'); // waking at the bed is not swimming home
}

// ---- M2, the homestead expansion (docs/PHASE5.md, step 7) -------------------------------------------
// DESIGN.md's M2 bundles seven unlocks; here each is a thing the player has done, ticked on the computer.
// Clearing the outpost (the run M2 hangs on) is its own line.

export const M2_STEPS: Step[] = [
  { flag: 'outpost_cleared', label: 'Clear the raiders’ outpost' },
  { flag: 'coop_laid', label: 'A coop that lays (chickens from the farm)' },
  { flag: 'hutch_bred', label: 'A hutch that breeds (rabbits from the buffer)' },
  { flag: 'forge_made', label: 'Workshop extension: the forge (the outpost’s parts)' },
  { flag: 'preserved', label: 'Preserve meat: a smoker or a jerky rack' },
  { flag: 'bow_made', label: 'Make a bow (the outpost’s bowstring)' },
  { flag: 'leghold_learned', label: 'Learn the leghold trap (the hunters’ camp)' },
  { flag: 'garden_expanded', label: 'A new crop: Marco’s quinoa or the farm’s apple' },
];

/**
 * Sets the M2 flags earned by what the player carries (a bow made, preserved meat taken from a rack or
 * smoker). The rest are set where they happen. Returns flags newly set, ending with 'm2_done' when the last ticks.
 */
export function trackM2(flags: Set<string>, count: (item: string) => number): string[] {
  const added: string[] = [];
  const set = (f: string) => { if (!flags.has(f)) { flags.add(f); added.push(f); } };
  if (count('hunting_bow') > 0) set('bow_made');
  if (count('jerky') + count('smoked_meat') > 0) set('preserved');
  if (M2_STEPS.every((s) => flags.has(s.flag))) set('m2_done');
  return added;
}

// ---- M3, power up (docs/PHASE6.md, 8) -------------------------------------------------------------------
// DESIGN.md's M3 bundles eight unlocks; here each is a thing the player has done, ticked on the computer.
// The run to Zone-2's ruins, and home alive, is its own line, as clearing the outpost is M2's.

export const M3_STEPS: Step[] = [
  { flag: 'zone2_home', label: 'Reach the ruins at Las Cruces (Zone 2), and come home alive' },
  { flag: 'array_built', label: 'A solar array at home (the ruins’ roof panels)' },
  { flag: 'bank_built', label: 'A battery bank: power day and night' },
  { flag: 'rig_earned', label: 'A mining rig that has earned its first sats' },
  { flag: 'doc_called', label: 'Call Doc (his card is in the pharmacy)' },
  { flag: 'fridge_pump', label: 'A fridge and a water pump at home' },
  { flag: 'ammo_made', label: 'Make rounds (gunpowder from the cave’s saltpeter and sulfur)' },
  { flag: 'marco_guns', label: 'Buy a gun or rounds from Marco' },
];

/** Near the ruins at Las Cruces: within this of the strip mall or the exchange. */
export function atRuins(x: number, z: number): boolean {
  const m = ZONE2.mall, e = ZONE2.exchange;
  const box = (x0: number, x1: number, z0: number, z1: number) => Math.hypot(Math.max(x0 - x, x - x1, 0), Math.max(z0 - z, z - z1, 0)) < 25;
  return box(m.x0, m.x1, m.z0, m.z1) || box(e.x0, e.x1, e.z0, e.z1);
}

/**
 * Notes where the player is and what stands at home (once a second), and sets the M3 flags it earns. The rest
 * (Doc, rounds, Marco's guns) are set where they happen. Returns flags newly set, ending with 'm3_done'.
 */
export function trackM3(flags: Set<string>, x: number, z: number, home: { arrays: number; banks: number; fridges: number; pumps: number; rigSats: number }): string[] {
  const added: string[] = [];
  const set = (f: string) => { if (!flags.has(f)) { flags.add(f); added.push(f); } };
  if (atRuins(x, z)) set('ruins_reached');
  if (inSanctuary(x, z) && flags.has('ruins_reached')) set('zone2_home');
  if (home.arrays > 0) set('array_built');
  if (home.banks > 0 && flags.has('array_built')) set('bank_built');
  if (home.rigSats > 0) set('rig_earned');
  if (home.fridges > 0 && home.pumps > 0) set('fridge_pump');
  if (M3_STEPS.every((s) => flags.has(s.flag))) set('m3_done');
  return added;
}

/** A death outside before reaching home from the ruins: the run has to be walked again. */
export function diedOutsideM3(flags: Set<string>): void {
  if (!flags.has('zone2_home')) flags.delete('ruins_reached');
}
