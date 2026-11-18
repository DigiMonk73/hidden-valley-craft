// Rabbits home: a snare set on open ground outside catches a rabbit that wanders into it, and a hutch
// with a pair or more in it gains a rabbit each new day, up to eight (docs/PHASE3.md, step 5).

import { blockId } from '../world/blocks.ts';
import { itemId, maxStack } from '../world/items.ts';
import type { World } from '../world/world.ts';
import type { Creature } from '../entity/creatures.ts';
import type { Inventory, Stack } from './inventory.ts';

export const SNARE = blockId('snare');
export const SNARE_CAUGHT = blockId('snare_caught');
export const HUTCH = blockId('hutch');
export const HUTCH_MAX = 8;

type BlockAt = (x: number, y: number, z: number) => number;

/** Rabbits standing in a set snare: each is caught there. */
export function snared(creatures: Creature[], blockAt: BlockAt): { c: Creature; at: [number, number, number] }[] {
  const out: { c: Creature; at: [number, number, number] }[] = [];
  for (const c of creatures) {
    if (c.kind !== 'rabbit') continue;
    const x = Math.floor(c.x), y = Math.floor(c.y + 0.05), z = Math.floor(c.z);
    if (blockAt(x, y, z) === SNARE) out.push({ c, at: [x, y, z] });
  }
  return out;
}

/** A set snare within `r` blocks of a rabbit (it smells the bait), or null. */
export function snareNear(c: Creature, blockAt: BlockAt, r = 6): [number, number, number] | null {
  const cx = Math.floor(c.x), cy = Math.floor(c.y), cz = Math.floor(c.z);
  for (let dy = -1; dy <= 1; dy++)
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) if (blockAt(cx + dx, cy + dy, cz + dz) === SNARE) return [cx + dx, cy + dy, cz + dz];
  return null;
}

/** Right-click on a full snare: the live rabbit into the pack and the snare set again. */
export function emptySnare(world: World, inv: Inventory, x: number, y: number, z: number): 'taken' | 'full' | null {
  if (world.blockAt(x, y, z) !== SNARE_CAUGHT) return null;
  if (inv.add(itemId('live_rabbit'), 1) > 0) return 'full';
  world.setBlock(x, y, z, SNARE);
  return 'taken';
}

/** Has a new day begun between two readings of the clock? (06:00 is morning.) */
export function newDay(before: number, after: number): boolean {
  if (before === after) return false;
  return before < after ? before < 6 && after >= 6 : before < 6 || after >= 6;
}

/** Each loaded hutch holding two or more rabbits gains one, up to eight. Returns how many were born. */
export function breedHutches(world: World): number {
  const rabbit = itemId('live_rabbit');
  let born = 0;
  for (const [key, slots] of world.containers) {
    const x = key & 2047, z = (key >> 11) & 2047, y = key >>> 22;
    if (world.blockAt(x, y, z) !== HUTCH) continue; // not loaded, or no longer a hutch
    const n = slots.reduce((s, st) => s + (st && st.id === rabbit ? st.count : 0), 0);
    if (n < 2 || n >= HUTCH_MAX) continue;
    if (addTo(slots, rabbit)) born++;
  }
  return born;
}

function addTo(slots: (Stack | null)[], id: number): boolean {
  const st = slots.find((s) => s && s.id === id && s.count < maxStack(id));
  if (st) { st.count++; return true; }
  const i = slots.findIndex((s) => !s);
  if (i < 0) return false;
  slots[i] = { id, count: 1 };
  return true;
}
