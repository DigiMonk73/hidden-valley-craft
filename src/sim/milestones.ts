// M1, the first outside run (docs/PHASE4.md, step 7). DESIGN.md's four M1 unlocks are narrative, with no
// new recipes; here each is a flag the game sets when the player has done it. Pure.

import { inSanctuary, zoneAt, GATE } from '../gen/layout.ts';

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
