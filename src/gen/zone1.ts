// Zone-1's near band, in blocks (docs/PHASE4.md): the saddle's farm sign and cattle grid, Marco's bus
// shelter with its lantern, the dead raider scout and his still-burning lamp, the farmstead (the
// collapsed house, the barn, the ruined coop, the laundry line, the fences), and the rusted truck.
// Pure, like the rest of the generator.

import { CS, WORLD_Y } from '../world/constants.ts';
import { blockId, AIR } from '../world/blocks.ts';
import { rand3 } from '../core/noise.ts';
import { SEED, ZONE1, roadZ, roadHeight, outsideHeight, onFarmTrack, ROAD } from './layout.ts';

const ci = (x: number, y: number, z: number) => (y << 10) | (z << 5) | x;

/** The barn's two crates and the scout's pockets: where they are (their contents are in src/gen/inheritance.ts). */
export const BARN_CRATES: [number, number, number][] = [
  [ZONE1.barn.x1 - 2, ZONE1.farm.floor, ZONE1.barn.z0 + 1],
  [ZONE1.barn.x1 - 2, ZONE1.farm.floor, ZONE1.barn.z1 - 2],
];
export const SCOUT_AT: [number, number, number] = [ZONE1.scout.x, ZONE1.scout.y, ZONE1.scout.z];
/** The shelter's lantern, under the middle of its roof, and where Marco stands (feet), facing the road. */
export const SHELTER_LANTERN: [number, number, number] = [ZONE1.shelter.x0 + 3, ZONE1.shelter.floor + 2, ZONE1.shelter.z0 + 1];
export const MARCO_SPOT: [number, number, number] = [ZONE1.shelter.x0 + 2.5, ZONE1.shelter.floor, ZONE1.shelter.z1 - 0.5];
/** The dogs' den: the middle of the collapsed house. */
export const DEN: [number, number, number] = [(ZONE1.house.x0 + ZONE1.house.x1) / 2, ZONE1.farm.floor, (ZONE1.house.z0 + ZONE1.house.z1) / 2];
/** The middle of the farmyard, where the chickens scratch. */
export const YARD: [number, number] = [(ZONE1.farm.x0 + ZONE1.farm.x1) / 2, (ZONE1.farm.z0 + ZONE1.farm.z1) / 2 + 2];

export function buildZone1(col: Uint16Array, x0: number, z0: number): void {
  if (x0 > 1160 || x0 + CS < 1030 || z0 > 1090 || z0 + CS < 1010) return;
  const put = (x: number, y: number, z: number, name: string | number) => {
    const lx = x - x0, lz = z - z0;
    if (lx >= 0 && lz >= 0 && lx < CS && lz < CS && y > 0 && y < WORLD_Y) col[ci(lx, y, lz)] = typeof name === 'number' ? name : blockId(name);
  };
  const clear = (x: number, y0: number, y1: number, z: number) => { for (let y = y0; y < y1; y++) put(x, y, z, AIR); };
  const r = (x: number, y: number, z: number, k = 0) => rand3(x, y + k * 31, z, SEED + 60);
  const fenceLine = (xs: number[], zs: number[], h: (x: number, z: number) => number, gaps: number) => {
    xs.forEach((x, i) => {
      const z = zs[i], y = h(x, z);
      if (r(x, 3, z) < gaps) return; // a broken stretch
      if (i % 3 === 0) { put(x, y, z, 'fence_post'); put(x, y + 1, z, 'fence_post'); } else put(x, y, z, 'fence_wire');
    });
  };

  // ---- The saddle: a faded farm sign on a post, and a cattle grid across the road. ----
  const sg = ZONE1.saddleSign, sh0 = outsideHeight(sg.x, sg.z);
  put(sg.x, sh0, sg.z, 'fence_post');
  put(sg.x, sh0 + 1, sg.z, 'farm_sign@east');
  for (let x = ZONE1.cattleGrid.x0; x < ZONE1.cattleGrid.x1; x++) {
    const rz = roadZ(x), h = roadHeight(x);
    for (let z = Math.floor(rz - ROAD.halfWidth); z < rz + ROAD.halfWidth; z++) put(x, h - 1, z, 'cattle_grid');
    // A broken fence runs off either side of the grid.
    const side = (dir: number) => { const zs = [1, 2, 3, 4, 5, 6, 7].map((k) => Math.floor(rz + dir * (ROAD.halfWidth + k))); fenceLine(zs.map(() => x), zs, (a, b) => outsideHeight(a, b), 0.2); };
    if (x === ZONE1.cattleGrid.x0) { side(-1); side(1); }
  }

  // ---- Marco's bus shelter: four posts, a tin roof, a bench at the back, the lantern, the stop sign. ----
  const s = ZONE1.shelter, F = s.floor;
  for (let z = s.z0; z < s.z1; z++) for (let x = s.x0; x < s.x1; x++) {
    clear(x, F, F + 4, z);
    put(x, F - 1, z, r(x, 1, z) < 0.5 ? 'cobble' : 'gravel');
    put(x, F + 3, z, 'tin_roof');
  }
  for (const [x, z] of [[s.x0, s.z0], [s.x1 - 1, s.z0], [s.x0, s.z1 - 1], [s.x1 - 1, s.z1 - 1]]) for (let y = F; y < F + 3; y++) put(x, y, z, 'fence_post');
  for (let x = s.x0 + 1; x < s.x1 - 1; x++) put(x, F, s.z0, 'bench@south');
  put(SHELTER_LANTERN[0], SHELTER_LANTERN[1], SHELTER_LANTERN[2], 'lantern');
  put(s.x1, F, s.z1 - 1, 'fence_post');
  put(s.x1, F + 1, s.z1 - 1, 'bus_sign@east');

  // ---- The raider scout, face up on the road, and his lamp still burning beside him. ----
  const [sx, sy, sz] = SCOUT_AT;
  put(sx, sy, sz, 'scout_body');
  put(sx + 1, sy, sz, 'scout_legs');
  put(sx, sy, sz - 1, 'dropped_lamp');

  // ---- The farmstead. ----
  const f = ZONE1.farm, FF = f.floor, g = ZONE1.farmGate;
  // The track: packed dirt and gravel from the road down to the yard.
  for (let z = g.z; z < f.z0 + 1; z++) for (let x = g.x - 1; x <= g.x; x++) {
    if (!onFarmTrack(x, z)) continue;
    const h = outsideHeight(x, z);
    clear(x, h, h + 4, z);
    put(x, h - 1, z, r(x, 2, z) < 0.35 ? 'gravel' : 'dirt');
  }
  // The broken cattle gate at the junction: two posts, the family's name-board, a gate lying in the grass.
  const gh = outsideHeight(g.x - 2, g.z + 1);
  for (const x of [g.x - 2, g.x + 1]) { put(x, outsideHeight(x, g.z + 1), g.z + 1, 'fence_post'); put(x, outsideHeight(x, g.z + 1) + 1, g.z + 1, 'fence_post'); }
  put(g.x + 2, outsideHeight(g.x + 2, g.z + 1), g.z + 1, 'fence_post');
  put(g.x + 2, outsideHeight(g.x + 2, g.z + 1) + 1, g.z + 1, 'family_sign');
  for (const x of [g.x + 3, g.x + 4]) put(x, outsideHeight(x, g.z + 2), g.z + 2, 'slab_planks');
  void gh;
  // Fences along the track, and along the yard's north edge either side of it.
  const trackZs: number[] = [];
  for (let z = g.z + 3; z < f.z0; z++) trackZs.push(z);
  fenceLine(trackZs.map(() => g.x - 2), trackZs, (a, b) => outsideHeight(a, b), 0.15);
  fenceLine(trackZs.map(() => g.x + 1), trackZs, (a, b) => outsideHeight(a, b), 0.15);
  const north: number[] = [];
  for (let x = f.x0; x < f.x1; x++) if (x < g.x - 2 || x > g.x + 1) north.push(x);
  fenceLine(north, north.map(() => f.z0), () => FF, 0.25);

  // The yard: grass gone to seed, with bare patches.
  for (let z = f.z0 + 1; z < f.z1; z++) for (let x = f.x0; x < f.x1; x++) {
    clear(x, FF, FF + 8, z);
    if (r(x, 4, z) < 0.25) put(x, FF - 1, z, 'dirt');
    else if (r(x, 5, z) < 0.3) put(x, FF, z, 'tall_grass');
  }

  // The house: a collapsed frame of rubble and planks, the roof half fallen in. The dogs' den.
  const h = ZONE1.house;
  for (let z = h.z0; z < h.z1; z++) for (let x = h.x0; x < h.x1; x++) {
    const wall = x === h.x0 || x === h.x1 - 1 || z === h.z0 || z === h.z1 - 1;
    put(x, FF - 1, z, 'dirt');
    if (!wall) {
      if (r(x, 6, z) < 0.18) put(x, FF, z, 'cobble'); // fallen rubble
      else if (r(x, 7, z) < 0.22) put(x, FF, z, 'tin_roof'); // roof sheets on the floor
      continue;
    }
    const door = x === h.x1 - 1 && (z === h.z0 + 2 || z === h.z0 + 3);
    const height = 2 + Math.floor(r(x, 8, z) * 3); // broken off at different heights
    for (let y = FF; y < FF + height; y++) {
      if (door && y < FF + 3) continue;
      if (y === FF + 1 && !door && r(x, y, z, 2) < 0.15) continue; // a gap where a window was
      put(x, y, z, y < FF + 2 ? 'cobble' : 'planks');
    }
  }
  // What is left of the roof, over the west half.
  for (let z = h.z0; z < h.z1; z++) for (let x = h.x0; x < h.x0 + 3; x++) if (r(x, 9, z) < 0.8) put(x, FF + 4, z, 'tin_roof');
  for (let z = h.z0; z < h.z1; z++) put(h.x0, FF + 3, z, 'planks');

  // The barn: the most whole of the buildings. Plank walls on log corners, a door to the yard, a tin roof.
  const b = ZONE1.barn, BH = 5;
  for (let z = b.z0; z < b.z1; z++) for (let x = b.x0; x < b.x1; x++) {
    const wall = x === b.x0 || x === b.x1 - 1 || z === b.z0 || z === b.z1 - 1;
    const corner = (x === b.x0 || x === b.x1 - 1) && (z === b.z0 || z === b.z1 - 1);
    put(x, FF - 1, z, 'planks');
    clear(x, FF, FF + BH + 3, z);
    const door = x === b.x0 && z >= b.z0 + 2 && z <= b.z0 + 4;
    if (wall) for (let y = FF; y < FF + BH; y++) if (!(door && y < FF + 3)) put(x, y, z, corner ? 'log' : 'planks');
    const ridge = z >= b.z0 + 2 && z < b.z1 - 2;
    put(x, FF + BH, z, ridge ? 'planks' : 'tin_roof');
    if (ridge) put(x, FF + BH + 1, z, 'tin_roof');
  }
  for (const [x, y, z] of BARN_CRATES) put(x, y, z, 'chest');
  // A scrap heap against the barn's south-east corner.
  for (const [dx, dy, dz] of [[0, 0, 0], [1, 0, 0], [0, 0, 1], [1, 0, 1], [0, 1, 0]]) put(b.x1 + 1 + dx, FF + dy, b.z1 + dz, 'scrap_heap');

  // The coop, collapsed: a low broken frame, wire and a fallen roof sheet. The chickens scratch round it.
  const c = ZONE1.coop;
  for (let z = c.z0; z < c.z1; z++) for (let x = c.x0; x < c.x1; x++) {
    const wall = x === c.x0 || x === c.x1 - 1 || z === c.z0 || z === c.z1 - 1;
    if (wall && r(x, 10, z) < 0.6) put(x, FF, z, r(x, 11, z) < 0.5 ? 'slab_planks' : 'fence_wire');
    else if (!wall && r(x, 12, z) < 0.3) put(x, FF, z, 'tin_roof');
  }
  // The laundry line, sagging between two posts.
  const lz = h.z0 + 1;
  for (const x of [h.x1 + 3, h.x1 + 9]) { put(x, FF, lz, 'fence_post'); put(x, FF + 1, lz, 'fence_post'); }
  for (let x = h.x1 + 4; x < h.x1 + 9; x++) put(x, FF + 1, lz, 'laundry_line');

  // ---- The rusted pickup on the road's north shoulder: cab to the west, wheels at the corners. ----
  const t = ZONE1.truck, th = roadHeight((t.x0 + t.x1) >> 1);
  for (let x = t.x0; x < t.x1; x++) for (let z = t.z0; z < t.z0 + 2; z++) {
    for (let y = outsideHeight(x, z); y < th; y++) put(x, y, z, 'gravel');
    clear(x, th, th + 5, z);
    const k = x - t.x0;
    put(x, th, z, k === 0 || k === 3 ? 'truck_wheel' : 'truck_body');
    if (k <= 1) put(x, th + 1, z, 'truck_cab');
    else if (z === t.z0 || k === 4) put(x, th + 1, z, 'truck_body'); // the bed's sides, one fallen in
  }
}
