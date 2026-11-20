// Making things: the recipes in data/recipes.json, each made at a station from what the player
// carries. An input asked for with a count of 0 must be held but is not used up (the journal for a
// bookshelf).

import data from '../../data/recipes.json' with { type: 'json' };
import { itemId } from '../world/items.ts';
import { blockName, BLOCK_DEFS } from '../world/blocks.ts';
import type { Inventory, Stack } from './inventory.ts';

export type Station = 'hand' | 'workbench' | 'kiln' | 'smelter' | 'anvil' | 'stove' | 'tannery' | 'forge' | 'powder_mill' | 'crucible_furnace' | 'lathe' | 'med_bench' | 'distiller';

/**
 * `learn`: a flag that must be earned before the recipe shows (the leghold, learned at the camp).
 * `after`: the milestone that must be done before it can be made (each milestone's recipes need the one before).
 */
export interface Recipe { station: Station; out: [number, number]; in: [number, number][]; returns: [number, number][]; learn?: string; after?: string }

interface RecipeSource { station: Station; out: [string, number]; in: [string, number][]; returns?: [string, number][]; learn?: string; after?: string }

/** What a recipe waits for, in the player's words. */
export const AFTER_LABEL: Record<string, string> = {
  m1_done: 'after M1 · the first outside run',
  m2_done: 'after M2 · the homestead expansion',
  m3_done: 'after M3 · power up',
  m4_done: 'after M4 · hydro',
};

export const RECIPES: Recipe[] = (data.recipes as RecipeSource[]).map((r) => ({
  station: r.station,
  out: [itemId(r.out[0]), r.out[1]],
  in: r.in.map(([n, c]) => [itemId(n), c] as [number, number]),
  returns: (r.returns ?? []).map(([n, c]) => [itemId(n), c] as [number, number]),
  learn: r.learn,
  after: r.after,
}));

export const STATION_LABEL: Record<Station, string> = {
  hand: 'By hand', workbench: 'Workbench', kiln: 'Kiln', smelter: 'Smelter', anvil: 'Anvil', stove: 'Stove', tannery: 'Tannery rack', forge: 'Forge', powder_mill: 'Powder mill', crucible_furnace: 'Crucible furnace', lathe: 'Lathe', med_bench: 'Medical bench', distiller: 'Distiller',
};

/** Which station a block is, if any. The hearth cooks like the range, and so does any part of either. */
export function stationOf(block: number): Station | null {
  const base = BLOCK_DEFS[block]?.base ?? blockName(block);
  switch (base) {
    case 'workbench': return 'workbench';
    case 'kiln': return 'kiln';
    case 'smelter': return 'smelter';
    case 'anvil': return 'anvil';
    case 'stove': case 'fireplace': return 'stove';
    case 'range_firebox': case 'range_oven': case 'range_tank': return 'stove';
    case 'hearth_fire': case 'hearth_flames': case 'ember_bed': return 'stove';
    case 'tannery_rack': return 'tannery';
    case 'forge': return 'forge';
    case 'powder_mill': return 'powder_mill';
    case 'crucible_furnace': return 'crucible_furnace';
    case 'lathe': return 'lathe';
    case 'med_bench': return 'med_bench';
    case 'distiller': return 'distiller';
    default: return null;
  }
}

/**
 * The station at a place in the world. A pot or a kettle is part of the stove it stands on, and nothing by
 * itself: on a sideboard, or carried off and set down, it cooks nothing.
 */
export function stationAt(blockAt: (x: number, y: number, z: number) => number, x: number, y: number, z: number): Station | null {
  const id = blockAt(x, y, z);
  const base = BLOCK_DEFS[id]?.base ?? blockName(id);
  if (base === 'cook_pot' || base === 'kettle') return stationOf(blockAt(x, y - 1, z)) === 'stove' ? 'stove' : null;
  return stationOf(id);
}

/**
 * The recipes that can be made at a station now: those still to be learned are left out unless `known` has their
 * flag, and so are those whose milestone has not come (`waitingAt` lists them).
 */
export function recipesAt(station: Station, known: ReadonlySet<string> = new Set()): Recipe[] {
  return RECIPES.filter((r) => r.station === station && (!r.learn || known.has(r.learn)) && (!r.after || known.has(r.after)));
}

/** The recipes at a station that wait for an earlier milestone: shown greyed, with what they wait for. */
export function waitingAt(station: Station, known: ReadonlySet<string> = new Set()): Recipe[] {
  return RECIPES.filter((r) => r.station === station && !!r.after && !known.has(r.after));
}

/** May this recipe be made yet (learned, and its milestone come)? */
export function unlocked(r: Recipe, known: ReadonlySet<string>): boolean {
  return (!r.learn || known.has(r.learn)) && (!r.after || known.has(r.after));
}

export function canMake(inv: Inventory, r: Recipe): boolean {
  return r.in.every(([id, n]) => inv.count(id) >= Math.max(1, n));
}

/** Makes one batch: takes the inputs, gives the output (and anything returned). Nothing happens if short of an
 * input or if the result would not fit in the pack (so nothing is ever lost). */
export function make(inv: Inventory, r: Recipe, held: Stack | null = null): 'made' | 'short' | 'full' {
  if (!canMake(inv, r)) return 'short';
  // Try it on a copy first: the inputs freed may make room, or the pack may be too full. Anything held
  // on the screen's cursor must still fit afterwards, or the screen could never be closed.
  const trial = inv.clone();
  for (const [id, n] of r.in) if (n > 0) trial.remove(id, n);
  if (trial.add(r.out[0], r.out[1]) > 0 || r.returns.some(([id, n]) => trial.add(id, n) > 0)) return 'full';
  if (held && trial.clone().stow({ ...held })) return 'full';
  inv.slots = trial.slots;
  return 'made';
}
