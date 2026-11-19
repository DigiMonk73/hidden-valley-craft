// Chickens (docs/PHASE4.md, step 6): caught by hand at the farmstead, taken home to a coop. A coop with
// two or more hens lays one egg per hen each morning, up to eight waiting, and drops a feather as it lays.
// Like the hutch, it works while its chunk is loaded.

import { blockId } from '../world/blocks.ts';
import { itemId, maxStack } from '../world/items.ts';
import type { World } from '../world/world.ts';
import { makeCreature, B_SOLID_OK, type Creature } from '../entity/creatures.ts';
import type { Inventory, Stack } from './inventory.ts';

export const COOP = blockId('coop');
export const EGGS_MAX = 8;
/** How close a chicken must be to be caught by hand. */
export const CATCH_REACH = 3;
/** A coop holds at most this many hens; hatching stops there. */
export const HENS_MAX = 8;

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
    if (want <= 0) continue;
    laid += addTo(slots, egg, want);
    addTo(slots, feather, 1);
  }
  return laid;
}

// ---- Raising chickens in the valley (the lead, for the owner, 2026-11-18) ------------------------------
// Each morning a coop with a pair and an egg left in it hatches one egg into a hen, up to eight. The coop's
// contents stay the truth; tame hens walking round it just mirror how many it holds.

const coopAt = (key: number): [number, number, number] => [key & 2047, key >>> 22, (key >> 11) & 2047];

/**
 * Morning: each loaded coop with two or more hens and an egg left in it from before hatches one egg into
 * a hen (eight at most). Call before this morning's laying, so only eggs the player chose to leave hatch.
 */
export function hatchEggs(world: World): number {
  const hen = itemId('live_chicken'), egg = itemId('egg');
  let hatched = 0;
  for (const [key, slots] of world.containers) {
    const [x, y, z] = coopAt(key);
    if (world.blockAt(x, y, z) !== COOP) continue;
    const hens = count(slots, hen);
    if (hens < 2 || hens >= HENS_MAX || count(slots, egg) < 1) continue;
    if (!addTo(slots, hen, 1)) continue; // no room for her
    const s = slots.find((t) => t && t.id === egg)!;
    s.count--;
    if (s.count <= 0) slots[slots.indexOf(s)] = null;
    hatched++;
  }
  return hatched;
}

/** How many hens are in the coop at (x, y, z) (0 if it isn't a coop). */
export function hensIn(world: World, x: number, y: number, z: number): number {
  if (world.blockAt(x, y, z) !== COOP) return 0;
  const slots = world.containerAt(x, y, z);
  return slots ? Math.min(HENS_MAX, count(slots, itemId('live_chicken'))) : 0;
}

/** Takes one hen out of a coop's slots (she was picked up, or killed). True if there was one. */
export function takeHen(world: World, coop: [number, number, number]): boolean {
  const slots = world.blockAt(...coop) === COOP ? world.containerAt(...coop) : undefined;
  const hen = itemId('live_chicken');
  const s = slots?.find((t) => t && t.id === hen);
  if (!slots || !s) return false;
  s.count--;
  if (s.count <= 0) slots[slots.indexOf(s)] = null;
  return true;
}

/**
 * Brings the tame hens walking round each loaded coop near (px, pz) in step with how many it holds: new
 * ones appear on open ground beside it, extra ones (picked out of its slots by hand) are taken away, and
 * those of a coop gone or far off are let go. Returns the creatures list to use.
 */
export function syncTameHens(world: World, creatures: Creature[], px: number, pz: number, range = 64): Creature[] {
  const want = new Map<string, { at: [number, number, number]; n: number }>();
  for (const [key] of world.containers) {
    const at = coopAt(key);
    if (Math.hypot(at[0] - px, at[2] - pz) > range) continue;
    const n = hensIn(world, ...at);
    if (n > 0) want.set(at.join(','), { at, n });
  }
  const out: Creature[] = [];
  const have = new Map<string, number>();
  for (const c of creatures) {
    if (!c.tame) { out.push(c); continue; }
    const k = c.tame.join(','), w = want.get(k), n = have.get(k) ?? 0;
    if (!w || n >= w.n) continue; // too many, or her coop is gone or far: let her go
    have.set(k, n + 1);
    out.push(c);
  }
  for (const [k, w] of want) {
    for (let i = have.get(k) ?? 0; i < w.n; i++) {
      const spot = tameSpot(world, w.at, i);
      if (!spot) break;
      const c = makeCreature('chicken', spot[0], spot[1], spot[2]);
      c.tame = w.at;
      out.push(c);
    }
  }
  return out;
}

/** Open ground beside a coop for its i-th hen: a free cell next to it at its height (or a step down). */
function tameSpot(world: World, [x, y, z]: [number, number, number], i: number): [number, number, number] | null {
  const ring = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1], [2, 0], [-2, 0], [0, 2], [0, -2]];
  for (let k = 0; k < ring.length; k++) {
    const [dx, dz] = ring[(i + k) % ring.length];
    for (const fy of [y, y - 1, y + 1]) {
      const free = (yy: number) => !B_SOLID_OK(world.blockAt(x + dx, yy, z + dz));
      if (!free(fy) || !free(fy + 1) || free(fy - 1)) continue;
      return [x + dx + 0.5, fy, z + dz + 0.5];
    }
  }
  return null;
}
