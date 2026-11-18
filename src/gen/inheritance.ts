// What the builder left: the chests of his home and what is in each (docs/PLAN.md, "The billionaire's
// inheritance"). A chest's contents are made from this the first time it is opened; after that they
// are saved like any other change.

import { itemId } from '../world/items.ts';
import type { Stack } from '../sim/inventory.ts';

export const CHEST_SLOTS = 27;

export interface HomeChest { x: number; y: number; z: number; title: string; items: [string, number][]; safe?: boolean }

export const HOME_CHESTS: HomeChest[] = [
  { x: 1813, y: 82, z: 1016, title: 'Linen chest', items: [
    ['builders_journal', 1], ['bandage', 8], ['poultice', 6], ['lantern', 8], ['glass', 16],
  ] },
  { x: 1830, y: 82, z: 1007, title: 'Tool wall', items: [
    ['steel_hoe', 1], ['hunting_knife', 1], ['hammer', 1], ['handsaw', 1], ['shears', 1], ['fishing_rod', 1],
    ['nails', 64], ['cordage', 24], ['stick', 48], ['charcoal', 48], ['iron_ingot', 16], ['flint', 12],
  ] },
  { x: 1830, y: 82, z: 1009, title: 'Builder’s stores', items: [
    ['planks', 64], ['planks', 64], ['stone_bricks', 64], ['stone_bricks', 64], ['cobble', 64], ['glass', 32],
    ['lantern', 16], ['log', 32], ['chest', 6],
  ] },
  { x: 1818, y: 82, z: 1038, title: 'Pantry: tins and dry goods', items: [
    ['canned_food', 16], ['canned_food', 16], ['rice', 16], ['beans_cooked', 16], ['honey', 8], ['salt', 16],
  ] },
  { x: 1820, y: 82, z: 1038, title: 'Pantry: water and coffee', items: [
    ['water_jug', 8], ['water_jug', 8], ['empty_jug', 4], ['coffee', 16], ['coffee_beans', 32],
  ] },
  { x: 1822, y: 82, z: 1038, title: 'Seed chest', items: [
    ['seeds_corn', 16], ['seeds_beans', 16], ['seeds_squash', 8], ['seeds_tomato', 12], ['seeds_pepper', 12],
    ['seeds_herbs', 12], ['potato', 12],
  ] },
  { x: 1832, y: 82, z: 1022, title: 'Armory', items: [
    ['hunting_rifle', 1], ['rifle_rounds', 40], ['compound_bow', 1], ['arrow', 30], ['machete', 1], ['armor_vest', 1],
  ] },
  // The wall safe in the vault (its code is in the journal): the cold wallet.
  { x: 1829, y: 83, z: 1027, title: 'Wall safe', items: [['hardware_wallet', 1]], safe: true },
  { x: 1832, y: 82, z: 1025, title: 'Expedition kit', items: [
    ['first_aid_kit', 6], ['water_filter', 1], ['binoculars', 1], ['headlamp', 1], ['backpack_upgrade', 1],
  ] },
];

const byPos = new Map(HOME_CHESTS.map((c) => [`${c.x},${c.y},${c.z}`, c]));

export function homeChestAt(x: number, y: number, z: number): HomeChest | undefined {
  return byPos.get(`${x},${y},${z}`);
}

/** The starting contents of a chest at a position: the builder's things, or nothing. */
export function initialContents(x: number, y: number, z: number, size = CHEST_SLOTS): (Stack | null)[] {
  const slots: (Stack | null)[] = new Array(size).fill(null);
  homeChestAt(x, y, z)?.items.forEach(([name, count], i) => (slots[i] = { id: itemId(name), count }));
  return slots;
}
