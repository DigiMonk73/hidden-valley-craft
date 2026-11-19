// The garden: tilling with a hoe, sowing seeds, crops growing on random ticks, harvests, and the
// coffee bushes that ripen and can be picked again.

import { BLOCK_DEFS, blockId, blockName, AIR } from '../world/blocks.ts';
import { itemId } from '../world/items.ts';
import type { World } from '../world/world.ts';
import type { Inventory } from './inventory.ts';

/** What each crop gives when ripe, and what it is sown from. */
const CROPS: Record<string, { produce: string; seed: string; ripe: number; seeds: number }> = {
  corn: { produce: 'corn', seed: 'seeds_corn', ripe: 3, seeds: 2 },
  beans: { produce: 'bean_pod', seed: 'seeds_beans', ripe: 3, seeds: 2 },
  squash: { produce: 'squash', seed: 'seeds_squash', ripe: 2, seeds: 2 },
  tomato: { produce: 'tomato', seed: 'seeds_tomato', ripe: 3, seeds: 2 },
  pepper: { produce: 'pepper', seed: 'seeds_pepper', ripe: 3, seeds: 2 },
  potato: { produce: 'potato', seed: 'potato', ripe: 4, seeds: 0 }, // potatoes grow from cut tubers
  herbs: { produce: 'herbs', seed: 'seeds_herbs', ripe: 3, seeds: 1 },
  // M2's expanded garden (docs/PHASE5.md): Marco's quinoa, and the farm's apple, grown from a slip.
  quinoa: { produce: 'quinoa', seed: 'seeds_quinoa', ripe: 4, seeds: 2 },
  apple: { produce: 'apple', seed: 'apple_slip', ripe: 3, seeds: 1 },
};
/** Crops of the expanded garden: planting one ticks M2's garden step. */
export const NEW_CROPS = new Set(['quinoa', 'apple']);
const LAST_STAGE = 3;

export const FARMLAND = blockId('farmland');
/** A raised bed is farmland you can place (M2's expanded garden). */
export const RAISED_BED = blockId('raised_bed');
/** M4's balcony drip (docs/PHASE7.md): farmland in a box, to set on stone. */
export const PLANTER_BOX = blockId('planter_box');
export const isFarmland = (id: number): boolean => id === FARMLAND || id === RAISED_BED || id === PLANTER_BOX;
const TILLABLE = new Set([blockId('grass'), blockId('dirt'), blockId('forest_floor')]);

export function cropOf(block: number): { kind: string; stage: number } | undefined { return BLOCK_DEFS[block]?.crop; }

/** What breaking a crop gives: produce and seed when ripe, the seed back when not. Undefined for non-crops. */
export function cropDrops(block: number): [number, number][] | undefined {
  const c = cropOf(block);
  if (!c) return undefined;
  if (c.kind === 'coffee') return [[itemId('coffee_beans'), c.stage === 2 ? 3 : 1]]; // a bean to plant again
  const info = CROPS[c.kind];
  if (c.stage < LAST_STAGE) return [[itemId(info.seed), 1]];
  const out: [number, number][] = [[itemId(info.produce), info.ripe]];
  if (info.seeds) out.push([itemId(info.seed), info.seeds]);
  return out;
}

/** Which crop a held item sows, if it is a seed (or a potato). */
export function sows(item: number): string | undefined {
  if (item === itemId('coffee_beans')) return 'coffee';
  for (const [kind, info] of Object.entries(CROPS)) if (itemId(info.seed) === item) return kind;
  return undefined;
}

/** A hoe turns grass or soil into farmland, if nothing stands on it. */
export function till(world: World, x: number, y: number, z: number): boolean {
  if (!TILLABLE.has(world.blockAt(x, y, z)) || world.blockAt(x, y + 1, z) !== AIR) return false;
  return world.setBlock(x, y, z, FARMLAND);
}

/** Sows the held seed on farmland at (x, y, z). The seed is used only if it was sown. */
export function sow(world: World, inv: Inventory, x: number, y: number, z: number): boolean {
  const held = inv.current;
  const kind = held && sows(held.id);
  if (!kind || !isFarmland(world.blockAt(x, y, z)) || world.blockAt(x, y + 1, z) !== AIR) return false;
  if (!world.setBlock(x, y + 1, z, blockId(kind === 'coffee' ? 'coffee_bush_0' : `crop_${kind}_0`))) return false;
  inv.take();
  return true;
}

/** Picks a ripe coffee bush: beans, and the bush goes back to green cherries. */
export function pickCoffee(world: World, inv: Inventory, x: number, y: number, z: number): boolean | 'full' {
  if (blockName(world.blockAt(x, y, z)) !== 'coffee_bush_2') return false;
  const trial = inv.clone();
  if (trial.add(itemId('coffee_beans'), 3) > 0) return 'full';
  world.setBlock(x, y, z, blockId('coffee_bush_1'));
  inv.add(itemId('coffee_beans'), 3);
  return true;
}

/** Picks a ripe apple tree: apples, and the young tree goes back a stage to fruit again (it is a perennial). */
export function pickApple(world: World, inv: Inventory, x: number, y: number, z: number): boolean | 'full' {
  if (blockName(world.blockAt(x, y, z)) !== 'crop_apple_3') return false;
  const trial = inv.clone();
  if (trial.add(itemId('apple'), 3) > 0) return 'full';
  world.setBlock(x, y, z, blockId('crop_apple_2'));
  inv.add(itemId('apple'), 3);
  return true;
}

/**
 * Hours passing at once (a night's sleep): every crop near the player grows as many stages as random
 * ticks would have given it in that time, on average about one stage every five game hours.
 */
export function growWhileAway(world: World, px: number, pz: number, hours: number, rand: () => number): number {
  const expected = hours / 5.4;
  let grown = 0;
  const pcx = Math.floor(px / 32), pcz = Math.floor(pz / 32);
  for (let dz = -3; dz <= 3; dz++)
    for (let dx = -3; dx <= 3; dx++) {
      const col = world.column(pcx + dx, pcz + dz);
      if (!col) continue;
      for (const ch of col.chunks) {
        if (!ch.blocks) continue;
        for (let i = 0; i < 32768; i++) {
          if (!cropOf(ch.blocks[i])) continue;
          // How many steps: a Poisson draw around the expected number.
          let steps = 0, p = Math.exp(-expected), acc = p;
          const r = rand();
          while (r > acc && steps < 4) { steps++; p *= expected / steps; acc += p; }
          const x = ch.cx * 32 + (i & 31), y = ch.cy * 32 + (i >> 10), z = ch.cz * 32 + ((i >> 5) & 31);
          for (let k = 0; k < steps; k++) if (grow(world, x, y, z)) grown++; else break;
        }
      }
    }
  return grown;
}

/** One growth step for the block at (x, y, z), if it is a crop that can grow there now. */
export function grow(world: World, x: number, y: number, z: number): boolean {
  const c = cropOf(world.blockAt(x, y, z));
  if (!c) return false;
  const last = c.kind === 'coffee' ? 2 : LAST_STAGE;
  if (c.stage >= last) return false;
  if (c.kind !== 'coffee' && !isFarmland(world.blockAt(x, y - 1, z))) return false;
  const lv = world.lightAt(x, y, z);
  if ((lv >> 4) < 9 && (lv & 15) < 9) return false; // crops need light
  const next = c.kind === 'coffee' ? `coffee_bush_${c.stage + 1}` : `crop_${c.kind}_${c.stage + 1}`;
  return world.setBlock(x, y, z, blockId(next));
}

/**
 * Random ticks: a few random blocks in each loaded chunk near the player get a chance to grow, as
 * in block games. About 14 minutes from seed to harvest while the player is near.
 */
export function randomTicks(world: World, px: number, pz: number, rand: () => number, perChunk = 6): number {
  let grown = 0;
  const pcx = Math.floor(px / 32), pcz = Math.floor(pz / 32);
  for (let dz = -3; dz <= 3; dz++)
    for (let dx = -3; dx <= 3; dx++) {
      const col = world.column(pcx + dx, pcz + dz);
      if (!col) continue;
      for (const ch of col.chunks) {
        if (ch.empty || !ch.blocks) continue;
        for (let k = 0; k < perChunk; k++) {
          const i = Math.floor(rand() * 32768);
          if (!cropOf(ch.blocks[i])) continue;
          const x = ch.cx * 32 + (i & 31), y = ch.cy * 32 + (i >> 10), z = ch.cz * 32 + ((i >> 5) & 31);
          if (grow(world, x, y, z)) grown++;
        }
      }
    }
  return grown;
}
