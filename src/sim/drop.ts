// Setting things down (docs/PHASE9B.md, 3; docs/REVIEW.md, N6: "nothing can be dropped on the ground"). There are
// no loose items in this world: what is set down goes into a small sack at your feet, which opens like a chest. A
// sack near by with room takes the next thing too, and a sack emptied is taken away.

import { AIR, BLOCK_DEFS, blockId } from '../world/blocks.ts';
import { packPos } from '../world/light.ts';
import { packSpot } from './death.ts';
import { maxStack } from '../world/items.ts';
import type { World } from '../world/world.ts';
import type { Stack } from './inventory.ts';

export const SACK = blockId('sack');
const SIZE = BLOCK_DEFS[SACK].container ?? 9;
/** How far from the feet a sack already standing still takes what is set down. */
const NEAR = 2;

/** Puts as much of `s` as fits into `slots` (topping up like stacks first); returns how many did not fit. */
function into(slots: (Stack | null)[], s: Stack): number {
  let left = s.count;
  const cap = maxStack(s.id);
  if (!s.wear) for (const t of slots) {
    if (left <= 0) break;
    if (t && t.id === s.id && !t.wear && t.count < cap) { const n = Math.min(left, cap - t.count); t.count += n; left -= n; }
  }
  for (let i = 0; i < slots.length && left > 0; i++) {
    if (slots[i]) continue;
    const n = Math.min(left, cap);
    slots[i] = { id: s.id, count: n, ...(s.wear ? { wear: s.wear } : {}) };
    left -= n;
  }
  return left;
}

/**
 * Sets a stack down by the feet at (x, y, z): into a sack already within reach that has room for all of it, or
 * into a new one. Returns where the sack stands, or null if nothing could be set down (nothing is changed then).
 */
export function setDown(world: World, s: Stack, x: number, y: number, z: number): [number, number, number] | null {
  if (!s || s.count < 1) return null;
  const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
  for (let dy = -1; dy <= 1; dy++) for (let dz = -NEAR; dz <= NEAR; dz++) for (let dx = -NEAR; dx <= NEAR; dx++) {
    if (world.blockAt(fx + dx, fy + dy, fz + dz) !== SACK) continue;
    const slots = world.containerAt(fx + dx, fy + dy, fz + dz);
    if (!slots) continue;
    const trial = slots.map((t) => (t ? { ...t } : null));
    if (into(trial, s) > 0) continue;
    into(slots, s);
    return [fx + dx, fy + dy, fz + dz];
  }
  const at = packSpot(world, x, y, z);
  if (!at || !world.setBlock(at[0], at[1], at[2], SACK)) return null;
  const slots = new Array<Stack | null>(SIZE).fill(null);
  into(slots, s);
  world.containers.set(packPos(at[0], at[1], at[2]), slots);
  return at;
}

/** Takes away the sack at (x, y, z) if it holds nothing. True if it was taken away. */
export function clearEmptySack(world: World, x: number, y: number, z: number): boolean {
  if (world.blockAt(x, y, z) !== SACK) return false;
  const slots = world.containers.get(packPos(x, y, z));
  if (slots && slots.some((t) => t)) return false;
  world.setBlock(x, y, z, AIR);
  world.containers.delete(packPos(x, y, z));
  return true;
}
