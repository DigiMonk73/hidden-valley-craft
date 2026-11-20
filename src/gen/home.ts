// The builder's home, fitted out (docs/HOME.md): the hearth and its chimney, the bedroom and its window, the
// living room's furniture, the kitchen and the patio on the balcony. terrain.ts cuts the rooms (HOME.rooms);
// this places everything in them. Pure, like the rest of the generator: the same layout gives the same home.

import { CS, WORLD_Y } from '../world/constants.ts';
import { blockId, blockName, AIR, B_SOLID } from '../world/blocks.ts';
import { HOME } from './layout.ts';

const ci = (x: number, y: number, z: number) => (y << 10) | (z << 5) | x;

const F = HOME.floor;

/** Where things stand, for the game and the tests (block positions; the floor is y 82). */
export const HOME_FIT = {
  /** The hearth: the fire sits one block back into the living room's north wall. */
  hearth: { x: 1807, z: 1014 },
  /** The chimney comes out on the plateau: stone from the ground up, and a clay pot at `top`. */
  chimney: { x: 1807, z: 1014, top: 125 },
  /** The range's firebox on the balcony, and the cap of its flue up the cliff (under the rock that overhangs the balcony). */
  range: { x: 1800, z: 1032 },
  flueCap: { x: 1800, y: 91, z: 1032 },
  /** The double bed's four blocks, and the wardrobe that holds what the linen chest held. */
  bed: [[1811, F, 1037], [1811, F, 1038], [1810, F, 1037], [1810, F, 1038]] as [number, number, number][],
  wardrobe: [1806, F, 1041] as [number, number, number],
  /** The bedroom's window: glass in the cliff face at `x`. */
  window: { x: 1801, z0: 1036, z1: 1040, y0: F + 1, y1: F + 3 },
  /** The bedroom door's two leaves (each two blocks high). */
  door: [[1806, F, 1033], [1807, F, 1033]] as [number, number, number][],
  /** The study, in the library corner: the desk stands against the bookshelves, its screen facing the room. */
  desk: { computer: [1813, F + 1, 1028], phone: [1813, F + 1, 1029], chair: [1812, F, 1028] } as Record<string, [number, number, number]>,
  /** The journal: any of the bookshelves in the living room's south-east corner. */
  bookshelf: [1814, F + 1, 1031] as [number, number, number],
  mapTable: [1812, F, 1020] as [number, number, number],
  /** The builder's hoist on the balcony, in the north corner by the rock: where the satellite antenna is sent up from (docs/PHASE8.md). */
  hoist: [1800, F, 1014] as [number, number, number],
  /** Where the antenna's mast goes: the cliff's edge above the cave's mouth is searched along this row, from the valley side in. */
  mast: { z: 1024, x0: 1797, x1: 1804, above: 104 },
  /** Left empty for what the milestones bring: the rain awning (M3), the planter boxes (M4), the telescope (M5). */
  reserved: {
    awning: { x0: 1796, x1: 1800, z0: 1030, z1: 1034 },
    planters: { x0: 1793, x1: 1794, z0: 1014, z1: 1020 },
    telescope: { x0: 1793, x1: 1795, z0: 1028, z1: 1032 },
  },
};

/** A fitted rug over a rectangle of floor: its nine pieces, borders outward. */
function rugPiece(colour: string, x: number, z: number, x0: number, x1: number, z0: number, z1: number): string {
  const k = (z === z0 ? 'n' : z === z1 ? 's' : '') + (x === x0 ? 'w' : x === x1 ? 'e' : '');
  return `rug_${colour}_${k || 'c'}`;
}

/** Fits out the home in one generated column (32 × 32 blocks from x0, z0). Runs after the rooms are cut. */
export function fitOutHome(col: Uint16Array, x0: number, z0: number): void {
  const inside = (x: number, y: number, z: number) => x >= x0 && x < x0 + CS && z >= z0 && z < z0 + CS && y >= 0 && y < WORLD_Y;
  const put = (x: number, y: number, z: number, name: string) => { if (inside(x, y, z)) col[ci(x - x0, y, z - z0)] = blockId(name); };
  const get = (x: number, y: number, z: number) => (inside(x, y, z) ? col[ci(x - x0, y, z - z0)] : AIR);
  const isRock = (x: number, y: number, z: number) => /^limestone|^iron_ore|^flint_ore|^coal_ore|^copper_ore|^dirt$|^forest_floor$|^grass$/.test(blockName(get(x, y, z)));
  /** Fills a box (inclusive); `where` picks the cells that change. */
  const fill = (xa: number, xb: number, ya: number, yb: number, za: number, zb: number, name: string, where?: (x: number, y: number, z: number) => boolean) => {
    for (let y = ya; y <= yb; y++) for (let z = za; z <= zb; z++) for (let x = xa; x <= xb; x++) if (!where || where(x, y, z)) put(x, y, z, name);
  };
  const air = (x: number, y: number, z: number) => get(x, y, z) === AIR;
  const rug = (colour: string, xa: number, xb: number, za: number, zb: number) => {
    for (let z = za; z <= zb; z++) for (let x = xa; x <= xb; x++) put(x, F - 1, z, rugPiece(colour, x, z, xa, xb, za, zb));
  };
  /** A lantern hung from whatever is overhead, on a chain where the ceiling is high, so its light reaches the floor. */
  const hang = (x: number, z: number) => {
    if (!inside(x, F, z)) return;
    let top = F;
    while (top < F + 9 && !B_SOLID[get(x, top + 1, z)]) top++;
    const y = Math.min(top, F + 3);
    put(x, y, z, 'lantern');
    for (let c = y + 1; c <= top; c++) put(x, c, z, 'lamp_chain');
  };
  const b = HOME.balcony;

  // ---- The mouth: a dressed-stone pier either side, so the opening is the mouth itself (14 wide, 7 high) and the
  // kitchen has a wall at its back.
  fill(1801, 1801, F, F + 7, 1015, 1016, 'stone_bricks', air);
  fill(1801, 1801, F, F + 7, 1031, 1032, 'stone_bricks', air);

  // ---- The balcony --------------------------------------------------------------------------------------
  // A solid stone railing all round, with one opening on the north side where the path leaves (DESIGN.md: no
  // broken stretches). A lantern on a post stands either side of the opening, to find it by at night.
  for (let z = b.z0; z < b.z1; z++) put(b.x0, F, z, 'stone_railing@east');
  for (let x = b.x0 + 1; x < b.x1; x++) {
    put(x, F, b.z1 - 1, 'stone_railing');
    if (x < 1795 || x > 1797) put(x, F, b.z0, 'stone_railing');
  }
  // Each lantern on a post two high: on a post of one, the lantern was a step from the bench onto the railing.
  for (const x of [1794, 1798]) { put(x, F, b.z0, 'fence_post'); put(x, F + 1, b.z0, 'fence_post'); put(x, F + 2, b.z0, 'lantern'); }
  // A potted fern either side of the mouth, at the foot of each pier.
  put(1800, F, 1017, 'potted_fern');
  put(1800, F, 1030, 'potted_fern');
  // A bench against the rock, north of the mouth.
  put(1800, F, 1015, 'bench@west');
  put(1800, F, 1016, 'bench@west');
  // The builder's hoist, in the corner by the rock: a winch he never got to use, for the satellite antenna
  // (docs/PHASE8.md, 5). Not solid, like the storm lanterns: a solid one beside the bench was two steps onto the
  // railing (the balcony's own flood test found it), and nothing may stand above the railing on this side.
  put(...HOME_FIT.hoist, 'antenna_hoist');

  // The kitchen, at the south end with its back to the rock: a cast-iron range three wide (oven, firebox, warming
  // oven), a copper hood over it, and the flue up the cliff to a cap high overhead, where the smoke drifts out over the valley.
  const R = HOME_FIT.range;
  fill(1801, 1801, F, F + 3, R.z - 1, R.z + 1, 'stone_bricks'); // the wall behind it, dressed
  put(R.x, F, R.z - 1, 'range_oven@west');
  put(R.x, F, R.z, 'range_firebox@west');
  put(R.x, F, R.z + 1, 'range_tank@west');
  put(R.x, F + 1, R.z, 'cook_pot');
  put(R.x, F + 1, R.z + 1, 'kettle');
  put(R.x, F + 2, R.z - 1, 'range_hood@west');
  put(R.x, F + 2, R.z, 'range_hood_mid@west');
  put(R.x, F + 2, R.z + 1, 'range_hood@west');
  const cap = HOME_FIT.flueCap;
  for (let y = F + 3; y < cap.y; y++) put(cap.x, y, cap.z, 'stove_pipe');
  put(cap.x, cap.y, cap.z, 'flue_cap');
  // The prep counter along the south railing, a basin in it, and the firewood.
  put(1799, F, 1033, 'counter');
  put(1798, F, 1033, 'counter_basin');
  put(1797, F, 1033, 'counter');
  put(1796, F, 1033, 'log_pile');
  // The patio table and its four chairs, near the range.
  put(1795, F, 1029, 'patio_table');
  put(1796, F, 1029, 'patio_table@south');
  for (const x of [1795, 1796]) { put(x, F, 1028, 'patio_chair@south'); put(x, F, 1030, 'patio_chair'); }
  // Two deck loungers at the railing, facing the falls, and a small table between them.
  for (const z of [1022, 1026]) { put(1794, F, z, 'lounger_head@west'); put(1793, F, z, 'lounger_foot@west'); }
  put(1794, F, 1024, 'patio_side_table');
  // Light for the evening: a lantern on the patio table and one on the counter (the posts are at the far end).
  // (Storm lanterns are not solid: a solid lantern on the counter was a step over the railing.)
  put(1796, F + 1, 1029, 'storm_lantern');
  put(1797, F + 1, 1033, 'storm_lantern');
  // The solar panel, on a post in the south-west corner, out of the way.
  // The post is two high: a panel one block up was a step from the firewood onto the railing.
  put(1793, F, 1033, 'fence_post');
  put(1793, F + 1, 1033, 'fence_post');
  put(1793, F + 2, 1033, 'solar_panel');

  // ---- The living room ----------------------------------------------------------------------------------
  // The hearth, on the north wall: a firebox three wide set back into the rock and lined with firebrick, stone
  // jambs, a timber mantel with its shelf, a stone chimney breast to the ceiling, and a raised hearthstone.
  const H = HOME_FIT.hearth;
  fill(H.x - 2, H.x + 2, F, F + 2, H.z - 1, H.z, 'hearth_brick'); // the lining: back, sides and top
  fill(H.x - 1, H.x + 1, F, F + 1, H.z, H.z, 'air');
  fill(H.x - 2, H.x + 2, F - 1, F - 1, H.z, H.z + 2, 'stone_bricks'); // the hearthstone, under it all
  put(H.x - 1, F, H.z, 'ember_bed');
  put(H.x, F, H.z, 'hearth_fire');
  put(H.x + 1, F, H.z, 'ember_bed');
  put(H.x, F + 1, H.z, 'hearth_flames');
  fill(H.x - 2, H.x - 2, F, F + 1, H.z + 1, H.z + 1, 'stone_bricks'); // the jambs
  fill(H.x + 2, H.x + 2, F, F + 1, H.z + 1, H.z + 1, 'stone_bricks');
  fill(H.x - 2, H.x + 2, F + 2, F + 2, H.z + 1, H.z + 1, 'beam'); // the mantel
  fill(H.x - 2, H.x + 2, F + 3, F + 6, H.z + 1, H.z + 1, 'stone_bricks', air); // the chimney breast
  fill(H.x - 1, H.x + 1, F, F, H.z + 1, H.z + 1, 'slab_stone_bricks'); // the raised hearth, in the opening…
  fill(H.x - 2, H.x + 2, F, F, H.z + 2, H.z + 2, 'slab_stone_bricks'); // …and out into the room
  fill(H.x - 2, H.x + 2, F + 2, F + 2, H.z + 2, H.z + 2, 'mantel_shelf@south');
  put(H.x - 2, F + 3, H.z + 2, 'candlestick@south');
  put(H.x, F + 3, H.z + 2, 'mantel_clock@south');
  put(H.x + 2, F + 3, H.z + 2, 'candlestick@south');
  put(H.x, F + 4, H.z + 2, 'wall_picture@south');
  // The chimney: brick through the rock, dressed stone above the ground, a clay pot on top.
  const C = HOME_FIT.chimney;
  for (let y = F + 3; y < C.top; y++) put(C.x, y, C.z, isRock(C.x, y, C.z) ? 'hearth_brick' : 'stone_bricks');
  put(C.x, C.top, C.z, 'chimney_pot');
  // Firewood either side, and a lamp over each stack.
  put(H.x - 3, F, H.z + 1, 'log_pile@south');
  put(H.x + 3, F, H.z + 1, 'log_pile@south');
  put(H.x - 3, F + 2, H.z + 1, 'wall_lamp@south');
  put(H.x + 3, F + 2, H.z + 1, 'wall_lamp@south');

  // Ceiling beams across the room, and two lanterns hung from each.
  for (const z of [1017, 1021, 1026, 1030]) fill(1801, 1814, F + 5, F + 5, z, z, 'beam');
  for (const [x, z] of [[1803, 1017], [1812, 1017], [1805, 1021], [1810, 1021], [1805, 1026], [1810, 1026], [1807, 1030], [1812, 1030], [1802, 1021], [1802, 1026]]) put(x, F + 4, z, 'lantern');

  // By the fire: a sofa facing it, an armchair either side, a low table, all on a fitted rug.
  rug('red', 1803, 1811, 1017, 1021);
  put(1806, F, 1020, 'sofa_end');
  put(1807, F, 1020, 'sofa_mid');
  put(1808, F, 1020, 'sofa_end_r');
  put(1804, F, 1018, 'armchair@east');
  put(1810, F, 1018, 'armchair@west');
  put(1807, F, 1018, 'low_table');
  // The map table, by the hall.
  const [mx, my, mz] = HOME_FIT.mapTable;
  put(mx, my, mz, 'map_table');
  // The dining table and four chairs by the mouth, and a sideboard along the south wall behind it.
  put(1803, F, 1026, 'dining_table');
  put(1804, F, 1026, 'dining_table@south');
  for (const x of [1803, 1804]) { put(x, F, 1025, 'dining_chair@south'); put(x, F, 1027, 'dining_chair'); }
  for (const x of [1802, 1803, 1804]) put(x, F, 1032, 'counter');
  put(1802, F + 1, 1032, 'table_lamp');
  put(1804, F + 1, 1032, 'kettle');
  // The study, in the library corner. Bookshelves from floor to beam along the east and south walls (the journal).
  // Against them a desk three wide: a green-shaded lamp, the monitor and keyboard with the tower under them, the
  // satellite phone on its cradle, and a desk chair. The screen faces the room, so it is seen, lit, from the mouth.
  fill(1814, 1814, F, F + 3, 1027, 1032, 'bookshelf');
  fill(1809, 1813, F, F + 3, 1032, 1032, 'bookshelf');
  const [cx, cy, cz] = HOME_FIT.desk.computer;
  put(cx, F, cz - 1, 'desk_drawers@west');
  put(cx, F, cz, 'desk@west');
  put(cx, F, cz + 1, 'desk_drawers@west');
  put(cx, cy, cz - 1, 'desk_lamp@west');
  put(cx, cy, cz, 'computer@west');
  put(...HOME_FIT.desk.phone, 'phone');
  put(...HOME_FIT.desk.chair, 'desk_chair@east');
  rug('blue', 1809, 1813, 1027, 1031);
  // A corner to read in, by the fire: an armchair, a small table and its lamp.
  put(1814, F, 1017, 'armchair@west');
  put(1814, F, 1016, 'nightstand@west');
  put(1814, F + 1, 1016, 'table_lamp');
  put(1814, F, 1015, 'potted_fern');
  // Lamps on the walls.
  put(1814, F + 2, 1018, 'wall_lamp@west');
  put(1814, F + 2, 1021, 'wall_lamp@west');
  put(1814, F + 2, 1026, 'wall_lamp@west');
  put(1802, F + 2, 1016, 'wall_lamp@east');
  put(1802, F + 2, 1031, 'wall_lamp@east');
  put(1805, F + 2, 1032, 'wall_lamp');

  // ---- The hall: a runner and two lamps -----------------------------------------------------------------
  rug('red', 1816, 1823, 1023, 1024);
  put(1816, F + 2, 1022, 'wall_lamp@south');
  put(1824, F + 2, 1022, 'wall_lamp@south');
  put(1823, F + 2, 1025, 'wall_lamp');
  hang(1820, 1024);

  // ---- The bedroom --------------------------------------------------------------------------------------
  // A timber-lined room cut south of the living room: board walls, beams, a double door, and a window through
  // the cliff so you wake to the valley.
  const bed = HOME.rooms.find((r) => r.name === 'bedroom')!;
  const wall = (x: number, y: number, z: number) => B_SOLID[get(x, y, z)] === 1;
  // Walls: a board skirting, lime plaster above; the ceiling plastered between the beams.
  const lining = (_x: number, y: number, _z: number) => (y === F ? 'planks' : 'plaster');
  for (let y = F; y <= F + 3; y++) {
    fill(bed.x0 - 1, bed.x0 - 1, y, y, bed.z0, bed.z1 - 1, lining(0, y, 0), wall);
    fill(bed.x1, bed.x1, y, y, bed.z0, bed.z1 - 1, lining(0, y, 0), wall);
    fill(bed.x0, bed.x1 - 1, y, y, bed.z0 - 1, bed.z0 - 1, lining(0, y, 0), wall);
    fill(bed.x0, bed.x1 - 1, y, y, bed.z1, bed.z1, lining(0, y, 0), wall);
  }
  fill(bed.x0, bed.x1 - 1, F + 4, F + 4, bed.z0, bed.z1 - 1, 'plaster', wall);
  for (const z of [bed.z0 + 1, bed.z1 - 2]) fill(bed.x0, bed.x1 - 1, F + 3, F + 3, z, z, 'beam');
  put(1806, F + 3, 1037, 'lantern'); // one light, up against the ceiling between the beams: nothing hangs at head height
  // The door, standing open, under a timber lintel.
  const [dl, dr] = HOME_FIT.door;
  for (const y of [F, F + 1]) { put(dl[0], y, dl[2], 'door_wood_open'); put(dr[0], y, dr[2], 'door_wood_r_open'); }
  fill(dl[0] - 1, dr[0] + 1, F + 2, F + 2, dl[2], dl[2], 'beam');
  // The window: four wide and two high, glazed at the cliff face in a dressed-stone surround, with a cushioned
  // seat in its recess. Whatever rock stands out in front of the glass is cut away.
  const W = HOME_FIT.window;
  fill(W.x, W.x, W.y0 - 1, W.y1, W.z0 - 1, W.z1, 'stone_bricks');
  fill(W.x, W.x, W.y0, W.y1 - 1, W.z0, W.z1 - 1, 'glass');
  fill(W.x + 1, W.x + 1, W.y0, W.y1 - 1, W.z0, W.z1 - 1, 'air');
  fill(W.x + 1, W.x + 1, W.y0 - 1, W.y0 - 1, W.z0, W.z1 - 1, 'window_seat');
  fill(W.x - 4, W.x - 1, W.y0, W.y1 - 1, W.z0, W.z1 - 1, 'air');
  // The same dressed stone frames the opening on the cliff's face, so from the garden it reads as a window.
  fill(W.x - 1, W.x - 1, W.y0 - 1, W.y1, W.z0 - 1, W.z1, 'stone_bricks', (x, y, z) => isRock(x, y, z));
  put(W.x + 1, W.y0, W.z0, 'potted_orchid'); // an orchid on the window seat
  // The bed, head to the east wall, a nightstand and lamp either side.
  for (const [x, y, z] of HOME_FIT.bed) put(x, y, z, x === 1811 ? 'bed_head@west' : 'bed_foot@west');
  for (const z of [1036, 1039]) { put(1811, F, z, 'nightstand@west'); put(1811, F + 1, z, 'table_lamp'); }
  rug('blue', 1804, 1808, 1036, 1039);
  // The wardrobes on the south wall (the first holds what the linen chest held), and a blanket chest beside them.
  for (const x of [1806, 1807]) { put(x, F, 1041, 'wardrobe_lower'); put(x, F + 1, 1041, 'wardrobe_upper'); }
  put(1809, F, 1041, 'chest');
  // A washstand and mirror by the door; a chair to read in by the window, with a lamp.
  put(1803, F, 1034, 'washstand@south');
  put(1803, F + 1, 1034, 'wall_mirror@south');
  put(1803, F, 1040, 'armchair');
  put(1803, F, 1041, 'nightstand@east');
  put(1803, F + 1, 1041, 'table_lamp');
  put(1809, F + 2, 1034, 'wall_lamp@south');
  put(1804, F + 2, 1034, 'wall_lamp@south');
  put(1805, F + 2, 1041, 'wall_lamp');
  put(1810, F + 2, 1041, 'wall_lamp');

  // ---- Workshop, pantry, vault: lit and dressed, and the vault lined with dressed stone ----------------------
  // The workshop: tools on the wall behind the workbench, firewood between the smelter and the kiln, a quenching
  // barrel by the anvil, a long bench under more tools on the east wall, crates and barrels in the corners.
  for (const x of [1819, 1820, 1821]) put(x, F + 1, 1006, 'tool_board@south');
  for (const x of [1824, 1825]) put(x, F, 1006, 'log_pile@south');
  put(1821, F, 1012, 'barrel');
  for (const z of [1012, 1013, 1014]) { put(1831, F, z, 'table'); put(1831, F + 1, z, 'tool_board@west'); }
  for (const [x, y, z] of [[1831, F, 1018], [1831, F, 1019], [1830, F, 1019], [1831, F + 1, 1019]]) put(x, y, z, 'supply_crate');
  // A big bench in the middle of the floor, a storm lantern on it.
  fill(1824, 1826, F, F, 1015, 1016, 'table');
  put(1825, F + 1, 1015, 'storm_lantern');
  put(1817, F, 1019, 'barrel');
  put(1817, F, 1018, 'barrel');
  // The pantry: shelves of jars and tins along the north and west walls, barrels and sacks in the corners, herbs
  // drying on the south wall over the chests, a table in the middle. The iron vein in the east wall stays bare.
  fill(1822, 1828, F, F + 2, 1028, 1028, 'pantry_shelf');
  fill(1817, 1817, F, F + 2, 1031, 1035, 'pantry_shelf');
  for (const [x, z] of [[1829, 1028], [1829, 1029], [1829, 1039], [1828, 1039], [1829, 1038]]) put(x, F, z, 'barrel');
  for (const [x, z] of [[1829, 1030], [1827, 1039], [1826, 1039], [1817, 1036]]) put(x, F, z, 'grain_sack');
  for (const x of [1819, 1820, 1821, 1825, 1826]) put(x, F + 2, 1039, 'herb_rack');
  put(1823, F, 1033, 'table');
  put(1824, F, 1033, 'table');
  put(1824, F + 1, 1033, 'table_lamp');
  for (const x of [1820, 1828]) for (const z of [1008, 1013, 1018]) hang(x, z);
  for (const z of [1008, 1013, 1018]) hang(1824, z);
  for (const z of [1009, 1015, 1018]) put(1817, F + 2, z, 'wall_lamp@east');
  for (const z of [1010, 1016]) put(1831, F + 2, z, 'wall_lamp@west');
  for (const x of [1821, 1829]) put(x, F + 2, 1006, 'wall_lamp@south');
  put(1824, F + 2, 1019, 'wall_lamp');
  for (const x of [1820, 1826]) for (const z of [1031, 1036]) hang(x, z);
  for (const [x, z] of [[1823, 1034], [1827, 1030], [1818, 1039], [1828, 1039]]) hang(x, z);
  for (const z of [1030, 1036]) { put(1817, F + 2, z, 'wall_lamp@east'); put(1829, F + 2, z + 1, 'wall_lamp@west'); }
  put(1823, F + 2, 1039, 'wall_lamp');
  const v = HOME.rooms.find((r) => r.name === 'vault')!;
  const lined = (x: number, y: number, z: number) => isRock(x, y, z);
  fill(v.x0 - 1, v.x1, F, F + 4, v.z0 - 1, v.z1, 'stone_bricks', (x, y, z) => (x === v.x0 - 1 || x === v.x1 || z === v.z0 - 1 || z === v.z1 || y === F + 4) && lined(x, y, z));
  hang(1828, 1022);
  hang(1831, 1025);
}
