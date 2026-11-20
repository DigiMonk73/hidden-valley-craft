// Zone-4, the radiation edge, in blocks (docs/PHASE8.md): the sign at the avenue's bend, the ridge road along
// the reservoir's shore and up the dead slope, the gate, the line of warning signs round the fallout, the pass
// with its clean ground and the refuge hut, the sump, the observatory, and the tower's yard with the relay
// tower and the relay station. Pure, like the rest of the generator. Every position comes from ZONE4 in
// layout.ts.

import { CS, WORLD_Y } from '../world/constants.ts';
import { blockId, AIR, WATER } from '../world/blocks.ts';
import { rand3 } from '../core/noise.ts';
import {
  SEED, ZONE4, ZONE3, PLACES, outsideHeight, ravineX, onRidgeRoad, ridgeRoadAt, ridgeRoadLength, ridgeRoadPoint, ridgeRoadMark,
  ridgeRoadHeight, zone4Floor, falloutDepth,
} from './layout.ts';
import { towerCells, towerTip } from './towerFrame.ts';

const ci = (x: number, y: number, z: number) => (y << 10) | (z << 5) | x;
const Z = ZONE4, H = Z.hut, O = Z.observatory, Y = Z.yard, R = Z.relay, T = PLACES.ridgeTower, G = Z.gate, S = Z.sump;
const HW = Z.road.halfWidth;
const GF = zone4Floor.gate, PF = zone4Floor.pass, OF = zone4Floor.observatory, TF = zone4Floor.tower;
/** The road's lamps stand this far apart, either side in turn (their pools of light just meet). */
const LAMP_EVERY = 8;
const FACE = ['', '@east', '@south', '@west'];

/** Where the game's things stand (their contents are in src/gen/inheritance.ts). */
export const BOOTH_SHELF: [number, number, number] = [G.x - 5, GF, G.z - 1];
export const HUT_CRATE: [number, number, number] = [H.x1 - 2, PF, H.z1 - 2];
export const HUT_STOVE: [number, number, number] = [H.x1 - 2, PF, H.z0 + 1];
/** The wardens' log, on the hut's table. */
export const HUT_LOG: [number, number, number] = [H.x0 + 2, PF, H.z1 - 2];
/** The observatory's telescope on its pier (the block that gives the optics), the observers' last page, the crate. */
export const DOME_SCOPE: [number, number, number] = [O.x, OF + 1, O.z];
export const DOME_PAGE: [number, number, number] = [O.x + 1, OF, O.z + 3];
export const DOME_CRATE: [number, number, number] = [O.x - 2, OF, O.z + 3];
/** The relay station's lit half: six racks along the south wall, the spares crate, the manual on its shelf, the operator's page. */
export const RELAY_RACKS: [number, number, number][] = [0, 1, 2, 3, 4, 5].map((k) => [R.split + 2 + k, TF, R.z1 - 2]);
export const RELAY_CRATE: [number, number, number] = [R.x1 - 2, TF, R.z1 - 3];
export const PHARMA_MANUAL: [number, number, number] = [R.x1 - 2, TF + 1, R.z0 + 2];
export const RELAY_PAGE: [number, number, number] = [R.split + 2, TF, R.z0 + 2];
/** The fallen dish in the yard: three panels. */
export const DISH_PANELS: [number, number, number][] = [[T.x + 10, TF, T.z - 3], [T.x + 11, TF, T.z - 3], [T.x + 11, TF, T.z - 2]];
/** The tower's beacons: at its top and halfway up (for the eye, and for sound). */
const tip = towerTip(T.height);
const frame = towerCells(T.height), inFrame = new Set(frame.map((c) => c.join()));
/** A beacon halfway up stands on the north face's girt there: the first free cell over a block of the frame. */
const mid = frame.filter(([x, y, z]) => x === 0 && z < 0 && y >= T.height / 2 && !inFrame.has([x, y + 1, z].join())).sort((a, b) => a[1] - b[1])[0];
export const TOWER_BEACONS: [number, number, number][] = [
  [T.x + Math.floor(tip[0] + 0.5), TF + T.height + 3, T.z + Math.floor(tip[2] + 0.5)],
  [T.x + mid[0], TF + mid[1] + 1, T.z + mid[2]],
];
/** The yard's lamps: a pool of light every eight metres over the open ground east of the tower, two at its west feet, two by the station's end. */
export const YARD_LAMPS: [number, number][] = ([[T.x + 8, T.z - 9], [T.x + 16, T.z - 9], [T.x + 24, T.z - 8], [T.x + 7, T.z + 1], [T.x + 13, T.z - 1], [T.x + 22, T.z + 3], [T.x + 8, T.z + 9], [T.x + 16, T.z + 9],
  [T.x - 8, T.z - 8], [T.x - 8, T.z + 7], [R.x1 + 3, R.z0 + 3], [R.x1 + 8, R.z1 - 2]] as [number, number][]).filter(([x, z]) => !onRidgeRoad(x, z) && !DISH_PANELS.some((p) => p[0] === x && p[2] === z));
/** The living tree on the pass's clean ground. */
export const CLEAN_TREE: [number, number] = [Z.clean.x + 7, Z.clean.z + 7];

/** The road's lamp posts: [x, z, the lamp's height]. Either side in turn, two above the road beside them. */
let lamps: [number, number, number][] | null = null;
export function ridgeLamps(): [number, number, number][] {
  if (lamps) return lamps;
  lamps = [];
  const L = ridgeRoadLength();
  for (let s = 6, k = 0; s < L - 6; s += LAMP_EVERY, k++) {
    const [px, pz] = ridgeRoadPoint(s), [qx, qz] = ridgeRoadPoint(s + 0.5);
    const tx = (qx - px) * 2, tz = (qz - pz) * 2, side = k % 2 ? 1 : -1;
    // The normal to the road's line; the lamp stands just off the asphalt on that side.
    let x = Math.floor(px + -tz * side * (HW + 1.3)), z = Math.floor(pz + tx * side * (HW + 1.3));
    for (let step = 0; step < 3 && onRidgeRoad(x, z); step++) { x = Math.floor(px + -tz * side * (HW + 2.3 + step)); z = Math.floor(pz + tx * side * (HW + 2.3 + step)); }
    if (inBox(x, z, H, 1) || inBox(x, z, Y, 0) || (Math.abs(x - G.x) < 8 && Math.abs(z - G.z) < 7) || Math.hypot(x - O.x, z - O.z) < O.r + 2) continue;
    if (z >= ZONE3.dam.z - 3) continue;
    lamps.push([x, z, ridgeRoadHeight(s) + 2]);
  }
  return lamps;
}

function inBox(x: number, z: number, b: { x0: number; x1: number; z0: number; z1: number }, m: number): boolean {
  return x >= b.x0 - m && x < b.x1 + m && z >= b.z0 - m && z < b.z1 + m;
}

/** The warning signs along the fallout's edge, one every 16 m, just outside it and facing out: [x, z, facing]. */
let signs: [number, number, number][] | null = null;
export function edgeSigns(): [number, number, number][] {
  if (signs) return signs;
  signs = [];
  const c = Z.centre, EVERY = 16;
  const ok = (x: number, z: number) => x > 6 && z > 6 && falloutDepth(x, z) <= 0 && falloutDepth(x, z) > -4 && ridgeRoadAt(x + 0.5, z + 0.5).dist > 5;
  // Along the reservoir's side the edge is a line 60 m from the gorge's centre; the signs face east, to the water.
  for (let z = 8; z < c.z + Z.reach; z += EVERY) { const x = Math.floor(ravineX(z) - Z.shoreKeep) + 1; if (ok(x, z)) signs.push([x, z, 1]); }
  // Round the massif it is an arc; the signs face away from its centre.
  for (let a = -0.5; a < Math.PI; a += EVERY / Z.reach) {
    const x = Math.floor(c.x + (Z.reach + 1.5) * Math.cos(a)), z = Math.floor(c.z + (Z.reach + 1.5) * Math.sin(a));
    if (!ok(x, z)) continue;
    const f = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? (Math.cos(a) > 0 ? 1 : 3) : Math.sin(a) > 0 ? 2 : 0;
    signs.push([x, z, f]);
  }
  return signs;
}

/** The sump's ring: a sign or a taped post every 8 m, [x, z, facing or −1 for a post]. */
export const SUMP_RING: [number, number, number][] = [];
for (let k = 0; k < 24; k++) {
  const a = (k / 24) * Math.PI * 2, x = Math.floor(S.x + (S.r + 0.5) * Math.cos(a)), z = Math.floor(S.z + (S.r + 0.5) * Math.sin(a));
  const f = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? (Math.cos(a) > 0 ? 1 : 3) : Math.sin(a) > 0 ? 2 : 0;
  SUMP_RING.push([x, z, k % 2 ? -1 : f]);
}
/** The waste drums round the pond. */
export const SUMP_DRUMS: [number, number][] = [0.3, 1.5, 2.4, 3.6, 4.4, 5.5].map((a, k) => [Math.floor(S.x + (S.pond + 1.5 + (k % 2)) * Math.cos(a)), Math.floor(S.z + (S.pond + 1.5 + (k % 2)) * Math.sin(a))]);

/** The green boards round the pass's clean ground: [x, z, facing]. */
export const CLEAN_BOARDS: [number, number, number][] = [];
for (const deg of [10, 55, 135, 180, 215, 325]) {
  const a = (deg * Math.PI) / 180, x = Math.floor(Z.clean.x + (Z.clean.r + 0.5) * Math.cos(a)), z = Math.floor(Z.clean.z + (Z.clean.r + 0.5) * Math.sin(a));
  if (ridgeRoadAt(x + 0.5, z + 0.5).dist < HW + 2) continue;
  CLEAN_BOARDS.push([x, z, Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? (Math.cos(a) > 0 ? 1 : 3) : Math.sin(a) > 0 ? 2 : 0]);
}

/** Is (x, z) on the shore stretch: between the road and the water, along the reservoir's rim? */
function onShore(x: number, z: number): boolean {
  const [a, b] = Z.road.shore.map((k) => Z.road.pts[k]);
  if (z < b[1] - 8 || z > a[1] + 14) return false;
  return x < ravineX(z) - 18 && x > ridgeRoadPoint(ridgeRoadAt(x + 0.5, z + 0.5).s)[0] - 1 && ridgeRoadAt(x + 0.5, z + 0.5).dist < 14;
}

/** Round Zone-4's road and places (with a margin), where caves don't cut and trees don't grow. */
export function zone4Place(x: number, z: number): boolean {
  if (x < 330 || x > 640 || z < 350 || z > 752) return false;
  if (onRidgeRoad(x, z, 6) || onShore(x, z)) return true;
  if (inBox(x, z, Y, 6) || Math.hypot(x - O.x, z - O.z) < O.r + 9 || Math.hypot(x - Z.clean.x, z - Z.clean.z) < Z.clean.r + 2) return true;
  if (Math.hypot(x - S.x, z - S.z) < S.r + 3) return true;
  return Math.abs(x - (G.x - 2)) < 10 && Math.abs(z - G.z) < 9;
}

export function buildZone4(col: Uint16Array, x0: number, z0: number): void {
  if (x0 > 640 || z0 > 760) return;
  const put = (x: number, y: number, z: number, name: string | number) => {
    const lx = x - x0, lz = z - z0;
    if (lx >= 0 && lz >= 0 && lx < CS && lz < CS && y > 0 && y < WORLD_Y) col[ci(lx, y, lz)] = typeof name === 'number' ? name : blockId(name);
  };
  const get = (x: number, y: number, z: number) => {
    const lx = x - x0, lz = z - z0;
    return lx >= 0 && lz >= 0 && lx < CS && lz < CS && y >= 0 && y < WORLD_Y ? col[ci(lx, y, lz)] : -1;
  };
  const near = (bx0: number, bx1: number, bz0: number, bz1: number, m = 2) => x0 < bx1 + m && x0 + CS > bx0 - m && z0 < bz1 + m && z0 + CS > bz0 - m;
  const clear = (x: number, y0: number, y1: number, z: number) => { for (let y = y0; y < y1; y++) put(x, y, z, AIR); };
  const r = (x: number, y: number, z: number, k = 0) => rand3(x, y + k * 41, z, SEED + 140);
  /** A lamp at `top`, on a post from the ground. */
  const lampAt = (x: number, z: number, top: number, lamp = 'arc_lamp') => {
    const g = outsideHeight(x, z);
    for (let y = Math.min(g, top - 1); y < top; y++) put(x, y, z, 'fence_post');
    put(x, top, z, lamp);
  };
  /** A lantern at y, hung from a roof block at `roof` by a rod. */
  const hang = (x: number, y: number, z: number, roof: number) => { put(x, y, z, 'lantern'); for (let yy = y + 1; yy < roof; yy++) put(x, yy, z, 'fence_post'); };
  /** Solid footing under a floor, down to the land. */
  const footing = (x: number, floor: number, z: number, name: string) => { for (let y = Math.min(outsideHeight(x, z), floor) - 1; y < floor; y++) put(x, y, z, name); };

  // ---- The warning signs along the fallout's edge.
  for (const [x, z, f] of edgeSigns()) if (x >= x0 && x < x0 + CS && z >= z0 && z < z0 + CS) put(x, outsideHeight(x, z), z, 'rad_sign' + FACE[f]);

  if (x0 + CS < 330 || z0 + CS < 350) return;

  // ---- The ridge road: cracked asphalt four wide. On the mountain it is rougher.
  for (let z = Math.max(z0, 360); z < Math.min(z0 + CS, ZONE3.dam.z - 2); z++) for (let x = Math.max(x0, 340); x < Math.min(x0 + CS, 632); x++) {
    if (!onRidgeRoad(x, z)) continue;
    const y = outsideHeight(x, z), roll = r(x, 1, z), high = falloutDepth(x, z) > 0;
    put(x, y - 1, z, roll < (high ? 0.22 : 0.1) ? 'gravel' : roll < (high ? 0.27 : 0.14) ? (high ? 'dead_soil' : 'dirt') : 'road');
    put(x, y - 2, z, 'gravel');
    clear(x, y, y + 6, z);
  }

  // ---- The shore: a parapet on the water's side, and the landing's steps down the bank to the water.
  {
    const [ia, ib] = Z.road.shore, sa = ridgeRoadMark(ia) - 10, sb = ridgeRoadMark(ib) + 6, L = Z.landing;
    for (let s = sa; s <= sb; s += 0.5) {
      const [px, pz] = ridgeRoadPoint(s), [qx, qz] = ridgeRoadPoint(s + 0.5);
      const tx = (qx - px) * 2, tz = (qz - pz) * 2;
      const x = Math.floor(px - tz * (HW + 0.6)), z = Math.floor(pz + tx * (HW + 0.6));
      if (onRidgeRoad(x, z) || (z <= L.z + 1 && z >= L.z - 1)) continue; // the gap at the head of the steps
      const g = outsideHeight(x, z);
      if (get(x, g, z) === AIR || get(x, g, z) === -1) put(x, g, z, Math.abs(tz) > Math.abs(tx) ? 'dam_parapet@east' : 'dam_parapet');
    }
    // The steps: two wide, from the road's edge down northward along the bank, the last ones under the water.
    const top = ridgeRoadHeight(ridgeRoadAt(Z.road.pts[ib][0], L.z).s), water = ZONE3.dam.water;
    for (let k = 0; k <= L.steps; k++) {
      // (The first column east of the asphalt on this row.)
      const z = L.z - k, h = top - k;
      let ex = Z.road.pts[ib][0] - 12; for (let x = ex; x < ex + 24; x++) if (onRidgeRoad(x, z)) ex = x + 1;
      for (const x of [ex, ex + 1]) {
        for (let y = Math.min(outsideHeight(x, z), h) - 2; y < h; y++) put(x, y, z, 'concrete');
        for (let y = h; y < top + 4; y++) put(x, y, z, y < water ? WATER : AIR);
      }
      // A wall on the water's side of the steps, so the bank does not fall in on them.
      if (h >= water) put(ex + 2, h, z, 'dam_parapet@east');
    }
  }

  // ---- The sign at the bend, facing those who come off the dam, lit.
  {
    const sx = Z.sign.x, sz = Z.sign.z, g = outsideHeight(sx, sz);
    for (const pz of [sz - 1, sz + 2]) { for (let y = outsideHeight(sx, pz); y < g + 4; y++) put(sx, y, pz, 'fence_post'); put(sx, g + 4, pz, 'lantern'); }
    for (const dz of [0, 1]) for (const dy of [2, 3]) put(sx, g + dy, sz + dz, 'ridge_sign@east');
  }

  // ---- The gate: the board over the road, barriers to walk round, the booth.
  if (near(G.x - 8, G.x + 4, G.z - 6, G.z + 5, 2)) {
    for (const px of [G.x - 3, G.x + 2]) { for (let y = outsideHeight(px, G.z - 5); y < GF + 5; y++) put(px, y, G.z - 5, 'fence_post'); put(px, GF + 5, G.z - 5, 'lantern'); }
    for (let x = G.x - 2; x <= G.x + 1; x++) for (const dy of [3, 4]) put(x, GF + dy, G.z - 5, 'hot_board@south');
    put(G.x - 2, outsideHeight(G.x - 2, G.z + 3), G.z + 3, 'concrete_barrier'); put(G.x - 1, outsideHeight(G.x - 1, G.z + 3), G.z + 3, 'concrete_barrier');
    put(G.x, outsideHeight(G.x, G.z - 2), G.z - 2, 'concrete_barrier'); put(G.x + 1, outsideHeight(G.x + 1, G.z - 2), G.z - 2, 'concrete_barrier');
    // The booth: three walls and a roof, open to the road, a shelf inside.
    const bx = G.x - 6, bz = G.z - 2;
    for (let z = bz; z < bz + 3; z++) for (let x = bx; x < bx + 3; x++) {
      footing(x, GF, z, 'concrete');
      const open = x === bx + 2 && z === bz + 1;
      for (let y = GF; y < GF + 3; y++) put(x, y, z, x === bx + 1 && z === bz + 1 ? AIR : open ? AIR : y === GF + 1 && x === bx + 2 ? 'glass' : 'cinder_block');
    }
    for (let z = bz; z < bz + 3; z++) for (let x = bx; x < bx + 4; x++) put(x, GF + 3, z, 'shed_roof');
    put(...BOOTH_SHELF, 'stock_crate');
    put(bx + 3, GF + 2, bz + 1, 'lantern');
  }

  // ---- The pass: the refuge hut, the green boards round the clean ground, one living tree.
  if (near(Z.clean.x - Z.clean.r - 2, Z.clean.x + Z.clean.r + 2, Z.clean.z - Z.clean.r - 2, Z.clean.z + Z.clean.r + 2, 2)) {
    for (const [x, z, f] of CLEAN_BOARDS) put(x, outsideHeight(x, z), z, 'clean_sign' + FACE[f]);
    for (let z = H.z0; z < H.z1; z++) for (let x = H.x0; x < H.x1; x++) {
      const edge = x === H.x0 || x === H.x1 - 1 || z === H.z0 || z === H.z1 - 1;
      footing(x, PF - 1, z, 'cobble');
      put(x, PF - 1, z, 'planks');
      for (let y = PF; y < PF + 3; y++) {
        const door = x === H.x0 && z === H.door && y < PF + 2;
        const window = y === PF + 1 && (z === H.z0 || z === H.z1 - 1) && x > H.x0 + 1 && x < H.x1 - 2;
        put(x, y, z, !edge || door ? AIR : window ? 'glass' : 'cobble');
      }
      for (let y = PF + 3; y < PF + 8; y++) put(x, y, z, AIR);
    }
    // The roof, with an eave over the door on the road's side.
    for (let z = H.z0 - 1; z <= H.z1; z++) for (let x = H.x0 - 2; x <= H.x1; x++) { put(x, PF + 3, z, 'planks'); if (x < H.x0) clear(x, PF, PF + 3, z); }
    put(...HUT_STOVE, 'stove@west');
    for (let y = PF + 1; y <= PF + 5; y++) put(HUT_STOVE[0], y, HUT_STOVE[2], 'stove_pipe');
    put(...HUT_CRATE, 'stock_crate');
    put(...HUT_LOG, 'note_desk');
    put(HUT_LOG[0] + 1, PF, HUT_LOG[2], 'bench');
    put(H.x0 + 2, PF, H.z0 + 1, 'bedroll@east');
    put(H.x0 + 3, PF + 2, H.z0 + 3, 'lantern');
    put(H.x0 - 1, PF + 2, H.door, 'refugio_sign@west');
    put(H.x0 - 1, PF + 2, H.door - 2, 'lantern'); put(H.x0 - 1, PF + 2, H.door + 2, 'lantern');
    // The tree: the one green thing on the mountain.
    const [tx, tz] = CLEAN_TREE, g = outsideHeight(tx, tz);
    for (let y = g; y < g + 6; y++) put(tx, y, tz, 'log');
    for (let dy = -1; dy <= 2; dy++) for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      if (dx * dx + dz * dz + dy * dy * 3 > 10 || r(tx + dx, dy, tz + dz) < 0.08) continue;
      if (get(tx + dx, g + 6 + dy, tz + dz) === AIR) put(tx + dx, g + 6 + dy, tz + dz, 'leaves');
    }
  }

  // ---- The sump: black sludge in the hollow's floor, drums round it, a ring of signs and tape.
  if (near(S.x - S.r - 2, S.x + S.r + 2, S.z - S.r - 2, S.z + S.r + 2, 1)) {
    // (The hollow's floor is level round the pond, so the black of it shows from the road above.)
    const level = outsideHeight(S.x, S.z);
    for (let z = S.z - S.pond; z <= S.z + S.pond; z++) for (let x = S.x - S.pond; x <= S.x + S.pond; x++) {
      if (Math.hypot(x - S.x, z - S.z) + 1.4 * (r(x, 3, z) - 0.5) > S.pond) continue;
      for (let y = level - 3; y < level; y++) put(x, y, z, 'sludge');
      clear(x, level, level + 3, z);
    }
    for (const [x, z] of SUMP_DRUMS) { const g = outsideHeight(x, z); put(x, g, z, 'waste_drum'); if (r(x, 4, z) < 0.5) put(x, g + 1, z, 'waste_drum'); }
    for (const [x, z, f] of SUMP_RING) {
      const g = outsideHeight(x, z);
      if (f >= 0) put(x, g, z, 'rad_sign' + FACE[f]);
      else { put(x, g, z, 'fence_post'); put(x, g + 1, z, 'hazard_tape'); }
    }
  }

  // ---- The observatory: a concrete drum, a white dome with an open slit, the telescope on its pier.
  if (near(O.x - O.r - 3, O.x + O.r + 3, O.z - O.r - 3, O.z + O.r + 3, 2)) {
    const WALL = 4; // the drum's height
    for (let z = O.z - O.r - 1; z <= O.z + O.r + 1; z++) for (let x = O.x - O.r - 1; x <= O.x + O.r + 1; x++) {
      const d = Math.hypot(x - O.x, z - O.z);
      if (d > O.r + 0.3) continue;
      const wall = d > O.r - 0.7;
      footing(x, OF, z, 'concrete');
      const door = x === O.x - O.r && Math.abs(z - O.z) <= 0; // one door, west, toward the road
      for (let y = OF; y < OF + WALL; y++) put(x, y, z, wall && !(door && y < OF + 2) ? 'concrete' : AIR);
      // The dome: a shell over the drum, open along a slit from the top down its west side.
      for (let y = OF + WALL; y <= OF + WALL + O.r + 1; y++) {
        const d3 = Math.hypot(d, y - (OF + WALL));
        const slit = z === O.z && x <= O.x && y > OF + WALL; // toward the road, so it reads as what it is
        put(x, y, z, d3 > O.r - 0.7 && d3 <= O.r + 0.3 && !slit ? 'dome_shell' : AIR);
      }
    }
    put(DOME_SCOPE[0], OF, DOME_SCOPE[2], 'concrete');
    put(...DOME_SCOPE, 'dome_scope');
    // Its tube, up from the pier and out through the slit toward the western sky: what says "observatory" from the road.
    for (let k = 1; k <= 5; k++) put(O.x - k, OF + 2 + k, O.z, 'scope_tube');
    put(O.x, OF + 2, O.z, 'scope_tube');
    put(...DOME_PAGE, 'note_desk');
    put(...DOME_CRATE, 'stock_crate');
    // Red lamps, as observers keep them, on the crate and by the pier; and three working lamps hung from the dome.
    put(DOME_CRATE[0], OF + 1, DOME_CRATE[2], 'red_beacon'); put(O.x + 1, OF, O.z - 1, 'concrete'); put(O.x + 1, OF + 1, O.z - 1, 'red_beacon');
    for (const [dx, dz] of [[2, 2], [-2, -2], [2, -3], [-2, 2]]) {
      put(O.x + dx, OF + 3, O.z + dz, 'lantern');
      for (let y = OF + 4; y < OF + 12 && get(O.x + dx, y, O.z + dz) === AIR; y++) put(O.x + dx, y, O.z + dz, 'fence_post');
    }
    put(O.x - O.r - 1, OF + 2, O.z, 'observatorio_sign@west');
    put(O.x - O.r - 1, OF + 2, O.z - 1, 'lantern'); put(O.x - O.r - 1, OF + 2, O.z + 1, 'lantern');
    put(O.x - O.r - 1, OF + 3, O.z, 'concrete'); put(O.x - O.r - 1, OF + 3, O.z - 1, 'concrete'); put(O.x - O.r - 1, OF + 3, O.z + 1, 'concrete');
    // A gravel path from the door to the road.
    for (let k = 1; k < 12; k++) {
      const x = O.x - O.r - 1 - Math.floor(k * 0.55), z = O.z + Math.floor(k * 0.8);
      for (const dz of [0, 1]) if (!onRidgeRoad(x, z + dz)) { const g = outsideHeight(x, z + dz); if (get(x, g - 1, z + dz) !== -1) put(x, g - 1, z + dz, 'gravel'); }
    }
  }

  // ---- The tower's yard: gravel, lamps, the tower, the fallen dish, the relay station.
  if (near(Y.x0, Y.x1, Y.z0, Y.z1, 6)) {
    for (let z = Math.max(z0, Y.z0); z < Math.min(z0 + CS, Y.z1); z++) for (let x = Math.max(x0, Y.x0); x < Math.min(x0 + CS, Y.x1); x++) {
      if (onRidgeRoad(x, z)) continue;
      const roll = r(x, 5, z);
      put(x, TF - 1, z, roll < 0.65 ? 'gravel' : roll < 0.85 ? 'concrete' : 'dead_soil');
      clear(x, TF, TF + 4, z);
    }
    // The tower: concrete footings under its four feet, the frame, the beacons.
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) for (const dx of [0, sx]) for (const dz of [0, sz]) put(T.x + sx * 5 + dx, TF - 1, T.z + sz * 5 + dz, 'concrete');
    for (const [dx, dy, dz] of frame) put(T.x + dx, TF + dy, T.z + dz, 'tower_steel');
    for (const b of TOWER_BEACONS) put(...b, 'red_beacon');
    for (const p of DISH_PANELS) put(...p, 'dish_panel');
    put(DISH_PANELS[0][0] - 1, TF, DISH_PANELS[0][2] + 1, 'mast'); put(DISH_PANELS[0][0] - 2, TF, DISH_PANELS[0][2] + 2, 'scrap_heap');

    // The relay station: lit half east of the wall (the door on the yard), battery hall west of it (its own bay).
    const HIGH = 5;
    for (let z = R.z0; z < R.z1; z++) for (let x = R.x0; x < R.x1; x++) {
      // (The baffle: a wall inside the battery hall, between its bay and the far end, open for two rows at the south.)
      const edge = x === R.x0 || x === R.x1 - 1 || z === R.z0 || z === R.z1 - 1 || x === R.split || (x === R.baffle && z < R.z1 - 3);
      put(x, TF - 1, z, 'concrete');
      for (let y = TF; y < TF + HIGH; y++) {
        const door = z === R.z0 && (x === R.door || x === R.door + 1) && y < TF + 3;
        const bay = x === R.x0 && z >= R.bay && z < R.bay + 4 && y < TF + 4;
        const window = z === R.z0 && y === TF + 3 && x > R.split + 1 && x < R.x1 - 1 && x !== R.door && x !== R.door + 1;
        put(x, y, z, !edge || door || bay ? AIR : window ? 'glass' : 'concrete');
      }
      put(x, TF + HIGH, z, 'shed_roof');
      if (x > R.split + 1 && x < R.x1 - 1 && z > R.z0 && z < R.z1 - 1 && (x + z) % 2 === 0) put(x, TF + HIGH + 1, z, 'roof_solar');
    }
    for (const k of RELAY_RACKS) put(...k, 'relay_rack');
    put(...RELAY_CRATE, 'stock_crate');
    put(PHARMA_MANUAL[0], TF, PHARMA_MANUAL[2], 'counter_block');
    put(...PHARMA_MANUAL, 'manual_shelf@west');
    put(...RELAY_PAGE, 'note_desk');
    put(RELAY_PAGE[0], TF, RELAY_PAGE[2] + 1, 'chair');
    // Six lamps for a room of ten by eight: no corner of the lit half is dim.
    for (const dz of [2, 6]) for (const dx of [2, 5, 9]) hang(R.split + dx, TF + 3, R.z0 + dz, TF + HIGH);
    put(R.door, TF + 4, R.z0 - 1, 'relay_sign'); put(R.door + 1, TF + 4, R.z0 - 1, 'relay_sign');
    put(R.door - 1, TF + 4, R.z0 - 1, 'lantern'); put(R.door + 2, TF + 4, R.z0 - 1, 'lantern');
    for (let x = R.door - 1; x <= R.door + 2; x++) put(x, TF + 5, R.z0 - 1, 'shed_roof');
    // The battery hall: dead cabinets, old cells, ash where they stand.
    for (const [dx, dz] of [[2, 1], [3, 1], [6, 1], [8, 1], [9, 8], [1, 8]]) put(R.x0 + dx, TF, R.z0 + dz, dz === 1 ? 'ups_cabinet@south' : 'car_battery');
    for (const [dx, dz] of [[0, 0], [1, -1], [0, 1], [-1, 0]]) put(Math.floor(Z.nest.x) + dx, TF, Math.floor(Z.nest.z) + dz, 'pale_stain');
    // The yard's lamps: by the road's end, by the dish, by the door, at the tower's foot.
    for (const [x, z] of YARD_LAMPS) lampAt(x, z, TF + 2);
  }

  // ---- Last, so nothing built above clears them away: the road's lamps.
  for (const [x, z, top] of ridgeLamps()) if (x >= x0 && x < x0 + CS && z >= z0 && z < z0 + CS) {
    // On the shore's water side the lamp stands on the parapet's line.
    lampAt(x, z, top);
  }
}
