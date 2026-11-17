// Making things: the recipes in data/recipes.json, each made at a station from what the player
// carries. An input asked for with a count of 0 must be held but is not used up (the journal for a
// bookshelf).

import data from '../../data/recipes.json' with { type: 'json' };
import { itemId } from '../world/items.ts';
import { blockName, BLOCK_DEFS } from '../world/blocks.ts';
import type { Inventory } from './inventory.ts';

export type Station = 'hand' | 'workbench' | 'kiln' | 'smelter' | 'anvil' | 'stove' | 'tannery';

export interface Recipe { station: Station; out: [number, number]; in: [number, number][]; returns: [number, number][] }

interface RecipeSource { station: Station; out: [string, number]; in: [string, number][]; returns?: [string, number][] }

export const RECIPES: Recipe[] = (data.recipes as RecipeSource[]).map((r) => ({
  station: r.station,
  out: [itemId(r.out[0]), r.out[1]],
  in: r.in.map(([n, c]) => [itemId(n), c] as [number, number]),
  returns: (r.returns ?? []).map(([n, c]) => [itemId(n), c] as [number, number]),
}));

export const STATION_LABEL: Record<Station, string> = {
  hand: 'By hand', workbench: 'Workbench', kiln: 'Kiln', smelter: 'Smelter', anvil: 'Anvil', stove: 'Stove', tannery: 'Tannery rack',
};

/** Which station a block is, if any. The fireplace cooks like the stove. */
export function stationOf(block: number): Station | null {
  const base = BLOCK_DEFS[block]?.base ?? blockName(block);
  switch (base) {
    case 'workbench': return 'workbench';
    case 'kiln': return 'kiln';
    case 'smelter': return 'smelter';
    case 'anvil': return 'anvil';
    case 'stove': case 'fireplace': return 'stove';
    case 'tannery_rack': return 'tannery';
    default: return null;
  }
}

export function recipesAt(station: Station): Recipe[] { return RECIPES.filter((r) => r.station === station); }

export function canMake(inv: Inventory, r: Recipe): boolean {
  return r.in.every(([id, n]) => inv.count(id) >= Math.max(1, n));
}

/** Makes one batch: takes the inputs, gives the output (and anything returned). Nothing happens if short of an
 * input or if the result would not fit in the pack (so nothing is ever lost). */
export function make(inv: Inventory, r: Recipe): 'made' | 'short' | 'full' {
  if (!canMake(inv, r)) return 'short';
  // Try it on a copy first: the inputs freed may make room, or the pack may be too full.
  const trial = inv.clone();
  for (const [id, n] of r.in) if (n > 0) trial.remove(id, n);
  if (trial.add(r.out[0], r.out[1]) > 0 || r.returns.some(([id, n]) => trial.add(id, n) > 0)) return 'full';
  inv.slots = trial.slots;
  return 'made';
}
