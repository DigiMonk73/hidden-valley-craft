// Hunting's rules, apart from input and drawing: what each weapon does, and what a kill gives.
// The pace is slow and deliberate (DESIGN.md): blows have a cooldown, the bow must be drawn and the
// rifle's bolt worked between shots.

import { KINDS, type Kind } from '../entity/creatures.ts';
import { itemId, itemName } from '../world/items.ts';
import type { Inventory } from './inventory.ts';

/** Damage of a blow with what is in hand (fist 2). */
const MELEE: Record<string, number> = { hunting_knife: 5, spear: 8, steel_axe: 7, machete: 9 };

export function meleeDamage(held: number | undefined): number {
  return held ? MELEE[itemName(held)] ?? 2 : 2;
}

/** Seconds between blows, between rifle shots, and the longest useful bow draw. */
export const MELEE_COOLDOWN = 0.6;
export const RIFLE_COOLDOWN = 1.4;
export const BOW_FULL_DRAW = 1;
/** A draw shorter than this lets the string down without loosing. */
export const BOW_MIN_DRAW = 0.15;

export const RIFLE_DAMAGE = 45;
export const RIFLE_RANGE = 150;
/** Creatures within this distance hear a shot. */
export const RIFLE_HEARD = 60;
export const MELEE_REACH = 3;

/** Puts a kill's drops in the pack. Returns what did not fit (empty if all did). */
export function takeDrops(inv: Inventory, kind: Kind): [number, number][] {
  const left: [number, number][] = [];
  for (const [name, n] of KINDS[kind].drops) {
    const over = inv.add(itemId(name), n);
    if (over > 0) left.push([itemId(name), over]);
  }
  return left;
}

/** How far the bow is drawn (0–1) after holding for `seconds`. */
export function drawOf(seconds: number): number {
  return Math.max(0, Math.min(1, seconds / BOW_FULL_DRAW));
}
