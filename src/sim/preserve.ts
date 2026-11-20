// Food preservation and the leghold trap (docs/PHASE5.md, step 7). DESIGN.md's timed processes, done the
// way the coop and the hutch work here: containers that change what they hold as game time passes, while
// their chunk is loaded.
// - The smoker: every four game hours, each piece of wood in it smokes up to four pieces of raw meat.
// - The jerky rack: at dawn, all the raw meat on it has dried to jerky. No fuel; slower.

import { blockId } from '../world/blocks.ts';
import { itemId, maxStack } from '../world/items.ts';
import type { World } from '../world/world.ts';
import type { Stack } from './inventory.ts';

export const SMOKER = blockId('smoker');
export const JERKY_RACK = blockId('jerky_rack');
export const LEGHOLD = blockId('leghold_trap');
/** Pieces of meat one piece of wood smokes. */
export const PER_FUEL = 4;
/** Seconds a deer or boar caught in a leghold is held. */
export const HOLD_SECONDS = 60;

const RAW = ['venison_raw', 'pork_raw', 'rabbit_raw', 'chicken_raw', 'trout_raw'];
const FUEL = ['log', 'planks', 'charcoal', 'stick'];
const rawIds = () => new Set(RAW.map(itemId));
const fuelIds = () => new Set(FUEL.map(itemId));

function each(world: World, block: number, fn: (slots: (Stack | null)[]) => number): number {
  let n = 0;
  for (const [key, slots] of world.containers) {
    const x = key & 2047, z = (key >> 11) & 2047, y = key >>> 22;
    if (world.blockKnown(x, y, z) === block) n += fn(slots); // loaded or not: the hours away count
  }
  return n;
}

/** Turns up to `n` raw meat in `slots` into `out`, slot by slot. Returns how many turned. */
function convert(slots: (Stack | null)[], n: number, out: number): number {
  const raw = rawIds();
  let done = 0;
  for (let i = 0; i < slots.length && done < n; i++) {
    const s = slots[i];
    if (!s || !raw.has(s.id)) continue;
    // Room for what it turns into: a stack of `out` with space, or this slot once it is used up.
    const k = Math.min(s.count, n - done);
    const existing = slots.find((o) => o && o.id === out && o.count < maxStack(out));
    if (existing) {
      const m = Math.min(k, maxStack(out) - existing.count);
      existing.count += m; s.count -= m; done += m;
    } else if (k === s.count) {
      slots[i] = { id: out, count: k }; done += k; continue;
    } else {
      const free = slots.findIndex((o) => !o);
      if (free < 0) continue;
      slots[free] = { id: out, count: k }; s.count -= k; done += k;
    }
    if (s.count <= 0) slots[i] = null;
  }
  return done;
}

/** Four game hours have passed: each loaded smoker burns its wood and smokes its meat. Returns pieces smoked. */
export function smokeMeat(world: World): number {
  const fuel = fuelIds(), out = itemId('smoked_meat');
  return each(world, SMOKER, (slots) => {
    let smoked = 0;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (!s || !fuel.has(s.id)) continue;
      while (s.count > 0) {
        const n = convert(slots, PER_FUEL, out);
        if (!n) break;
        smoked += n;
        s.count--;
      }
      if (s.count <= 0) slots[i] = null;
    }
    return smoked;
  });
}

/** Dawn: the raw meat on every loaded jerky rack has dried to jerky. Returns pieces cured. */
export function cureJerky(world: World): number {
  const out = itemId('jerky');
  return each(world, JERKY_RACK, (slots) => convert(slots, Infinity, out));
}

/** Has the hour crossed into a new four-hour watch (00, 04, 08 …) between `before` and `now`? */
export function newWatch(before: number, now: number): boolean {
  return Math.floor(before / 4) !== Math.floor(now / 4);
}

/**
 * Learning the leghold from the hunters' rusted trap: by right-clicking it, or by taking it up (mining it),
 * whichever comes first (review: mining it first used to skip the lesson). True the first time.
 */
export function learnLeghold(flags: Set<string>): boolean {
  if (flags.has('leghold_learned')) return false;
  flags.add('leghold_learned');
  return true;
}
export const LEGHOLD_LESSON = 'You turn the rusted trap over: jaws, a spring, a pan, a chain. You could make one at the workbench now (iron, nails, cordage). It holds a deer or a boar. Outside the valley only.';
