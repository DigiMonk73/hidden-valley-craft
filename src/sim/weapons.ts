// What is fought with: the guns (found, never made: ADR-019), the bows, the blades that take a man silently.
// (Split out of src/game.ts: docs/FIXES.md, 8.)

import { itemName } from '../world/items.ts';

/** Firearms: damage, seconds between shots, range, and what each fires. */
export interface Gun { damage: number; cooldown: number; range: number; ammo: string; sound: 'rifle' | 'pistol'; quiet?: boolean }

export const GUNS: Record<string, Gun> = {
  hunting_rifle: { damage: 45, cooldown: 1.4, range: 150, ammo: 'rifle_rounds', sound: 'rifle' },
  raider_rifle: { damage: 40, cooldown: 1.6, range: 120, ammo: 'rifle_rounds', sound: 'rifle' },
  pistol: { damage: 30, cooldown: 0.5, range: 60, ammo: 'pistol_rounds', sound: 'pistol' },
  // M4's mods, made at the lathe from found guns (docs/PHASE7.md): the suppressed pistol is heard only close by.
  pistol_suppressed: { damage: 30, cooldown: 0.5, range: 60, ammo: 'pistol_rounds', sound: 'pistol', quiet: true },
  rifle_rebuilt: { damage: 48, cooldown: 1.4, range: 150, ammo: 'rifle_rounds', sound: 'rifle' },
};
export const BOWS: ReadonlySet<string> = new Set(['compound_bow', 'hunting_bow']);
export const BLADES: ReadonlySet<string> = new Set(['hunting_knife', 'machete', 'spear']);

export const isBow = (id: number | undefined): boolean => id !== undefined && BOWS.has(itemName(id));
export const isBlade = (id: number | undefined): boolean => id !== undefined && BLADES.has(itemName(id));
export const gunOf = (id: number | undefined): Gun | undefined => (id === undefined ? undefined : GUNS[itemName(id)]);
/** Something focus mode works with: a gun or a bow. */
export const isWeapon = (id: number | undefined): boolean => isBow(id) || gunOf(id) !== undefined;
