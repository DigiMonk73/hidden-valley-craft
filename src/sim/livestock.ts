// Chickens (docs/PHASE4.md, step 6): caught by hand at the farmstead, taken home to a coop. A coop with
// two or more hens lays one egg per hen each morning, up to eight waiting, and drops a feather.
// Like the hutch, it works while its chunk is loaded.

import { blockId } from '../world/blocks.ts';
import { itemId, maxStack } from '../world/items.ts';
import type { World } from '../world/world.ts';
import type { Creature } from '../entity/creatures.ts';
import type { Inventory, Stack } from './inventory.ts';

export const COOP = blockId('coop');
export const EGGS_MAX = 8;
/** How close a chicken must be to be caught by hand. */
export const CATCH_REACH = 2.5;

/** Catches a chicken into the pack. 'full' if there is no room for it. */
export function catchChicken(inv: Inventory, c: Creature): 'caught' | 'full' | null {
  if (c.kind !== 'chicken') return null;
  if (inv.add(itemId('live_chicken'), 1) > 0) return 'full';
  return 'caught';
}

const count = (slots: (Stack | null)[], id: number) => slots.reduce((n, s) => n + (s && s.id === id ? s.count : 0), 0);

function addTo(slots: (Stack | null)[], id: number, n: number): number {
  let left = n;
  for (const s of slots) if (left && s && s.id === id && s.count < maxStack(id)) { const k = Math.min(left, maxStack(id) - s.count); s.count += k; left -= k; }
  for (let i = 0; left && i < slots.length; i++) if (!slots[i]) { const k = Math.min(left, maxStack(id)); slots[i] = { id, count: k }; left -= k; }
  return n - left;
}

/** Each loaded coop with two or more chickens lays one egg per chicken (up to eight waiting) and a feather. Returns eggs laid. */
export function layEggs(world: World): number {
  const hen = itemId('live_chicken'), egg = itemId('egg'), feather = itemId('feather');
  let laid = 0;
  for (const [key, slots] of world.containers) {
    const x = key & 2047, z = (key >> 11) & 2047, y = key >>> 22;
    if (world.blockAt(x, y, z) !== COOP) continue;
    const hens = count(slots, hen);
    if (hens < 2) continue;
    const want = Math.min(hens, EGGS_MAX - count(slots, egg));
    if (want > 0) laid += addTo(slots, egg, want);
    addTo(slots, feather, 1);
  }
  return laid;
}
