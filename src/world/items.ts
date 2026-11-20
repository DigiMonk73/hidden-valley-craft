// Everything that can be carried: every block (same id as the block) and the items in
// data/items.json (ids after the blocks). Saves store names, never ids.

import data from '../../data/items.json' with { type: 'json' };
import { BLOCK_COUNT, BLOCK_DEFS, blockId, B_RENDER, RENDER } from './blocks.ts';

export interface ToolDef { kind: 'pickaxe' | 'axe' | 'shovel' | 'hoe' | 'shears'; uses: number; speed?: number }
export interface FoodDef { hunger?: number; thirst?: number }
export interface ItemDef { name: string; label: string; icon: string; stack: number; tool?: ToolDef; food?: FoodDef }

const items = data.items as ItemDef[];

export const ITEM_COUNT = BLOCK_COUNT + items.length;
export const BLOCK_STACK = 64;

const byName = new Map<string, number>();
BLOCK_DEFS.forEach((d, id) => byName.set(d.name, id));
items.forEach((d, i) => {
  if (byName.has(d.name)) throw new Error(`item "${d.name}" has the same name as a block`);
  byName.set(d.name, BLOCK_COUNT + i);
});

export function itemId(name: string): number {
  const id = byName.get(name);
  if (id === undefined) throw new Error(`unknown item "${name}"`);
  return id;
}

export function hasItem(name: string): boolean { return byName.has(name); }

export function isBlockItem(id: number): boolean { return id > 0 && id < BLOCK_COUNT; }

/** The item's definition; undefined for blocks. */
export function itemDef(id: number): ItemDef | undefined { return id >= BLOCK_COUNT ? items[id - BLOCK_COUNT] : undefined; }

export function itemName(id: number): string { return id < BLOCK_COUNT ? BLOCK_DEFS[id]?.name ?? 'air' : items[id - BLOCK_COUNT]?.name ?? 'air'; }

export function itemLabel(id: number): string { return id < BLOCK_COUNT ? BLOCK_DEFS[id]?.label ?? '' : items[id - BLOCK_COUNT]?.label ?? ''; }

export function maxStack(id: number): number { return id < BLOCK_COUNT ? BLOCK_STACK : items[id - BLOCK_COUNT]?.stack ?? 1; }

export function toolOf(id: number): ToolDef | undefined { return itemDef(id)?.tool; }

export function foodOf(id: number): FoodDef | undefined { return itemDef(id)?.food; }

export { blockId };

/** What mining a block gives: its "drop" (a block or an item, or "none"), else the block itself; nothing for unbreakables. */
export function dropOf(block: number): number {
  const d = BLOCK_DEFS[block];
  if (!d || d.hardness < 0 || d.render === 'none') return 0;
  if (d.drop === 'none') return 0; // gives nothing (an emptied lost pack)
  return d.drop ? itemId(d.drop) : block;
}

const SHOVEL = new Set(['dirt', 'grass', 'forest_floor', 'clay', 'sand', 'gravel', 'mud', 'moss']);
const AXE = new Set(['log', 'planks', 'tree_fern_trunk', 'bamboo', 'leaves', 'fern_fronds', 'leaves_pale', 'banana_trunk', 'banana_leaves']);

/** Which tool mines a block at full speed (null: anything, e.g. plants). */
export function toolFor(block: number): ToolDef['kind'] | null {
  if (B_RENDER[block] === RENDER.cross) return null;
  const n = BLOCK_DEFS[block]?.name ?? '';
  if (SHOVEL.has(n)) return 'shovel';
  if (AXE.has(n)) return 'axe';
  return 'pickaxe';
}

/** Seconds to mine a block with what is in hand: the right tool at its speed, else much slower. */
export function mineSeconds(block: number, held: number): number {
  const hardness = BLOCK_DEFS[block]?.hardness ?? 0;
  if (hardness <= 0) return hardness;
  const want = toolFor(block);
  const tool = toolOf(held);
  if (!want) return hardness;
  if (tool && tool.kind === want) return hardness / (tool.speed ?? 1);
  return hardness * (want === 'pickaxe' ? 6 : 3.5); // bare hands, or the wrong tool
}
