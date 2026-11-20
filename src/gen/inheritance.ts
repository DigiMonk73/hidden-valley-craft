// What the builder left: the chests of his home and what is in each (docs/PLAN.md, "The billionaire's
// inheritance"). A chest's contents are made from this the first time it is opened; after that they
// are saved like any other change.

import { itemId } from '../world/items.ts';
import type { Stack } from '../sim/inventory.ts';
import { BARN_CRATES, SCOUT_AT } from './zone1.ts';
import { RAIDER_CRATE, LODGE_CHEST } from './zone1far.ts';
import { PHARMACY_SHELF, HARDWARE_CRATE, SERVER_RACKS, UPS_CABINETS, LEAD_CASKET } from './zone2.ts';
import { PARTS_CRATE, TOOL_LOCKER, CONTROL_CABINETS, SHOP_CRATE, BOXCAR_CRATE } from './zone3.ts';

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
    // About ten days' food, as docs/PLAN.md has it (it was forty: nothing grown or hunted was ever needed).
    ['canned_food', 8], ['rice', 6], ['beans_cooked', 6], ['honey', 8], ['salt', 16],
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

// Zone-1's near band (docs/PHASE4.md): the barn's crates, with what a coop needs and a few tools, and
// the dead scout's pockets.
export const ZONE1_CHESTS: HomeChest[] = [
  { x: BARN_CRATES[0][0], y: BARN_CRATES[0][1], z: BARN_CRATES[0][2], title: 'Barn crate', items: [
    ['wire_mesh', 4], ['nails', 24], ['planks', 16], ['canvas', 4],
  ] },
  { x: BARN_CRATES[1][0], y: BARN_CRATES[1][1], z: BARN_CRATES[1][2], title: 'Barn crate: tools', items: [
    ['steel_shovel', 1], ['hammer', 1], ['cordage', 6], ['wire', 8],
  ] },
  { x: SCOUT_AT[0], y: SCOUT_AT[1], z: SCOUT_AT[2], title: 'The scout’s pockets', items: [
    ['pistol', 1], ['pistol_rounds', 6], ['map_scrap', 1], ['armband', 1],
  ] },
];

// Zone-1's mid band (docs/PHASE5.md): the raiders' stores in the outpost's back room, and what the raiders
// left in the hunting lodge (they took the easy gear and left the rest).
export const ZONE1_MID_CHESTS: HomeChest[] = [
  { x: RAIDER_CRATE[0], y: RAIDER_CRATE[1], z: RAIDER_CRATE[2], title: 'The raiders’ crate', items: [
    ['rifle_rounds', 20], ['pistol_rounds', 16], ['bowstring', 3], ['arrowhead', 24], ['nails', 24], ['cordage', 6],
  ] },
  { x: LODGE_CHEST[0], y: LODGE_CHEST[1], z: LODGE_CHEST[2], title: 'The lodge’s chest', items: [
    ['arrow', 12], ['snare', 2], ['cordage', 6], ['hunting_knife', 1], ['salt', 4],
  ] },
];

// Zone-2's ruins (docs/PHASE6.md): the hardware store's stock, the pharmacy's shelf, the exchange's racks and
// battery cabinets, and the cracked lead casket in the clinic van (scrap lead, in the radiation's heart).
// Six racks hold six GPUs, three PSUs and two mining boards: a rig's worth and a spare (a second rig is M4's).
const rack = (k: number): [string, number][] => [['gpu', 1], ...(k % 2 === 0 ? [['psu', 1] as [string, number]] : []), ...(k === 1 || k === 4 ? [['mining_board', 1] as [string, number]] : []), ['wiring', 2]];
export const ZONE2_CHESTS: HomeChest[] = [
  { x: HARDWARE_CRATE[0], y: HARDWARE_CRATE[1], z: HARDWARE_CRATE[2], title: 'Hardware store: the stock', items: [
    ['pump_unit', 1], ['wiring', 8], ['pipe_fittings', 6], ['nails', 32], ['brass_casing', 40], ['primer', 40],
  ] },
  { x: PHARMACY_SHELF[0], y: PHARMACY_SHELF[1], z: PHARMACY_SHELF[2], title: 'Pharmacy shelf', items: [['bandage', 6], ['first_aid_kit', 1]] },
  ...SERVER_RACKS.map(([x, y, z], k) => ({ x, y, z, title: 'Server rack', items: rack(k) })),
  ...UPS_CABINETS.map(([x, y, z]) => ({ x, y, z, title: 'UPS battery cabinet', items: [['battery_cell', 4]] as [string, number][] })),
  { x: LEAD_CASKET[0], y: LEAD_CASKET[1], z: LEAD_CASKET[2] + 1, title: 'A cracked lead casket', items: [['scrap_lead', 8]] },
];

// Zone-3 (docs/PHASE7.md): the powerhouse's parts crate, tool locker and control cabinets (the script's turbine
// parts, river-engineering tools and advanced electronics: two more rigs' worth, with the exchange's spares),
// the machine shop's crate, and the crate in the first boxcar.
export const ZONE3_CHESTS: HomeChest[] = [
  { x: PARTS_CRATE[0], y: PARTS_CRATE[1], z: PARTS_CRATE[2], title: 'Powerhouse: spare parts', items: [['turbine_parts', 1], ['wiring', 6], ['pipe_fittings', 4]] },
  { x: TOOL_LOCKER[0], y: TOOL_LOCKER[1], z: TOOL_LOCKER[2], title: 'Tool locker', items: [['sluice_tools', 1], ['hammer', 1], ['nails', 16]] },
  { x: CONTROL_CABINETS[0][0], y: CONTROL_CABINETS[0][1], z: CONTROL_CABINETS[0][2], title: 'Control cabinet', items: [['gpu', 1], ['mining_board', 1], ['psu', 1], ['wiring', 2]] },
  { x: CONTROL_CABINETS[1][0], y: CONTROL_CABINETS[1][1], z: CONTROL_CABINETS[1][2], title: 'Control cabinet', items: [['gpu', 1], ['mining_board', 1], ['wiring', 2]] },
  { x: SHOP_CRATE[0], y: SHOP_CRATE[1], z: SHOP_CRATE[2], title: 'Machine shop: the stores', items: [['steel_stock', 4], ['nails', 32], ['wiring', 6], ['pipe_fittings', 6], ['glass', 2]] },
  { x: BOXCAR_CRATE[0], y: BOXCAR_CRATE[1], z: BOXCAR_CRATE[2], title: 'Boxcar: a crate', items: [['canvas', 6], ['wire_mesh', 4], ['nails', 32], ['cordage', 8], ['pipe_fittings', 4]] },
];

const byPos = new Map([...HOME_CHESTS, ...ZONE1_CHESTS, ...ZONE1_MID_CHESTS, ...ZONE2_CHESTS, ...ZONE3_CHESTS].map((c) => [`${c.x},${c.y},${c.z}`, c]));

export function homeChestAt(x: number, y: number, z: number): HomeChest | undefined {
  return byPos.get(`${x},${y},${z}`);
}

/** The starting contents of a chest at a position: the builder's things, or nothing. */
export function initialContents(x: number, y: number, z: number, size = CHEST_SLOTS): (Stack | null)[] {
  const slots: (Stack | null)[] = new Array(size).fill(null);
  homeChestAt(x, y, z)?.items.forEach(([name, count], i) => (slots[i] = { id: itemId(name), count }));
  return slots;
}
