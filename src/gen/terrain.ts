// Generates one column (32 × 192 × 32 blocks) of the designed world. Pure and deterministic:
// the same column always comes out the same, so the world is rebuilt from the layout and only
// the player's edits are saved. Runs in workers, in Node (tests, map tool) and on the main thread.

import { CS, WORLD_Y, WORLD_Z } from '../world/constants.ts';
import { blockId, AIR, BEDROCK, WATER, FALLING_WATER as FALLING } from '../world/blocks.ts';
import { Simplex, hash3, rand3 } from '../core/noise.ts';
import {
  SEED, VALLEY, HOME, PATH_HALF_WIDTH, POOL, CANYON_POOL, TUNNEL, MOUTH_BASINS, GARDEN, SPRINGS, SPRING_OPENING, type Falls,
  GATE, TUNNEL_LAMPS, MOUTH_LAMPS, ROAD, PLACES, RAMP_HALF_WIDTH,
  distToValley, valleyFloorHeight, outsideHeight, creekDistance, pathAt, inValleyBowl, landZoneAt, canyonCenterX,
  roadZ, rampAt, onRoad, canyonStreamAt, inCanyonStream, ZONE1, inFarmyard, onFarmTrack, basinFloor,
  ZONE1FAR, onCampTrail, brushTrailDist, ravineX, RAVINE_HALF, ZONE4,
} from './layout.ts';
import { HOME_CHESTS } from './inheritance.ts';
import { fitOutHome } from './home.ts';
import { buildZone1 } from './zone1.ts';
import { buildZone1Far } from './zone1far.ts';
import { buildZone2, zone2Place } from './zone2.ts';
import { buildZone3, zone3Place } from './zone3.ts';
import { buildZone4, zone4Place } from './zone4.ts';
import { PATH, inSanctuary, rimMendHeight } from './layout.ts';

export const COLUMN_VOLUME = CS * CS * WORLD_Y;
const ci = (x: number, y: number, z: number) => (y << 10) | (z << 5) | x;

const LIMESTONE = blockId('limestone');
const MOSSY = blockId('limestone_mossy');
const DIRT = blockId('dirt');
const GRASS = blockId('grass');
const FOREST = blockId('forest_floor');
const CLAY = blockId('clay');
const SAND = blockId('sand');
const GRAVEL = blockId('gravel');
const MUD = blockId('mud');
const IRON = blockId('iron_ore');
const FLINT = blockId('flint_ore');
const COAL = blockId('coal_ore');
const COPPER = blockId('copper_ore');
const LOG = blockId('log');
const LEAVES = blockId('leaves');
const FERN_TRUNK = blockId('tree_fern_trunk');
const FRONDS = blockId('fern_fronds');
const PLANKS = blockId('planks');
const COBBLE = blockId('cobble');
const BRICKS = blockId('stone_bricks');
const FERN = blockId('fern');
const TALL_GRASS = blockId('tall_grass');
const BROMELIAD = blockId('bromeliad');
const ORCHID = blockId('orchid');
const BAMBOO = blockId('bamboo');
const MOSS = blockId('moss');
const CHEST = blockId('chest');
const ROAD_BLOCK = blockId('road');
const GATE_STONE = blockId('gate_stone');
const SEALED_LAMP = blockId('sealed_lamp');
const DEAD_SOIL = blockId('dead_soil');
const DEAD_TRUNK = blockId('dead_trunk');

const wallNoise = new Simplex(SEED + 7);
const caveA = new Simplex(SEED + 21);
const caveB = new Simplex(SEED + 22);
const detail = new Simplex(SEED + 31);

const R_IN = VALLEY.radius - 14;
/** The far bank of the ravine is as wet and dark as the deep band. */
const ZONES_RAVINE_FAR = 640;
const R_OUT = VALLEY.radius + 18;

/** Radius of the valley's cliff face at a point and height: the sinkhole's 3D shape. */
function wallRadius(x: number, y: number, z: number, floorH: number, topH: number): number {
  const dx = x - VALLEY.cx, dz = z - VALLEY.cz;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len, uz = dz / len;
  let r = VALLEY.radius;
  // Large bays and buttresses around the rim, then ledges and overhangs that vary with height.
  r += 5 * wallNoise.noise2(ux * 2.2, uz * 2.2);
  let rough = 2.6 * wallNoise.noise3(x / 11, y / 7, z / 11) + 1.2 * wallNoise.noise3(x / 4, y / 3, z / 4);
  // In a mended band (layout.ts, RIM_MENDS) the face never comes forward on the way down: at each height it stands
  // at least as far back as everywhere above it in the band. The rock keeps its roughness as roofs and hollows,
  // an overhang; what it loses is every ledge, so there is nowhere in the band to stand.
  const top = rimMendHeight(x, y, z);
  for (let yy = y + 1; yy <= top; yy++) rough = Math.max(rough, 2.6 * wallNoise.noise3(x / 11, yy / 7, z / 11) + 1.2 * wallNoise.noise3(x / 4, yy / 3, z / 4));
  r += rough;
  // Scree at the foot: the cliff meets the floor in a short slope.
  if (y < floorH + 5) r -= (floorH + 5 - y) * 1.1;
  // The rim's edge is worn back.
  if (y > topH - 4) r += (y - (topH - 4)) * 1.4;
  // Keep the cliff clean behind the waterfall and at the builder's cave.
  const nearHome = ux > 0.9 && Math.abs(dz) < 26 && y > HOME.floor - 8 && y < HOME.floor + 14;
  const nearFall = ux < -0.95 && Math.abs(dz) < 9;
  if (nearHome) r = Math.max(r, VALLEY.radius - 1);
  if (nearFall) r = Math.max(r, VALLEY.radius);
  return r;
}

function inBox(x: number, y: number, z: number, b: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }): boolean {
  return x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1 && z >= b.z0 && z < b.z1;
}

const HOME_BOUNDS = { x0: 1786, x1: 1842, y0: 70, y1: 100, z0: 998, z1: 1050 };

/** Places where caves and ore must not cut: the home, the water passages, the path. */
function caveExcluded(x: number, y: number, z: number): boolean {
  if (inBox(x, y, z, HOME_BOUNDS)) return true;
  // The ridge with the tunnel and both springs, the canyon's sheer headwall and its pool: no cave may
  // open a second dark hole in the cliff beside the falls.
  if (y > 50 && x > CANYON_POOL.cx - 16 && x < TUNNEL.x1 + 14 && z > 966 && z < 1084) return true;
  // Nor drain the canyon stream.
  if (y > 55 && inCanyonStream(x, z, 4)) return true;
  // Nor open under Zone-1's mid and deep places: the outpost, the mine, the camp, the bridge's ends.
  if (y > 60 && farPlace(x, z)) return true;
  // Nor open under Zone-2's places: the highway, the ruins, the compound, the hot-spring cave (docs/PHASE6.md).
  if (y > 55 && zone2Place(x, z)) return true;
  // Nor under Zone-3's places, into the reservoir or the river's bed (docs/PHASE7.md).
  if (y > 30 && zone3Place(x, z)) return true;
  // Nor under Zone-4's road and places (docs/PHASE8.md).
  if (y > 60 && zone4Place(x, z)) return true;
  return false;
}

/** The pass's clean ground: the one place in Zone-4 where things still grow. */
function cleanGround(x: number, z: number): boolean {
  return Math.hypot(x - ZONE4.clean.x, z - ZONE4.clean.z) < ZONE4.clean.r;
}

/** Round Zone-1's mid and deep places (with a margin), where caves don't cut and trees don't grow. */
function farPlace(x: number, z: number): boolean {
  const F = ZONE1FAR, o = F.outpost, m = F.mine, c = F.camp, b = F.bridge;
  if (x > o.x0 - 14 && x < o.x1 + 14 && z > o.z0 - 12 && z < o.z1 + 8) return true;
  if (x > m.chamber.x0 - 6 && x < m.chamber.x1 + 6 && z > m.z - 8 && z < m.chamber.z1 + 6) return true;
  if (x > c.x0 - 4 && x < c.x1 + 4 && z > c.z0 - 4 && z < c.z1 + 2) return true;
  if (x > b.far - 22 && x < b.near + 10 && Math.abs(z - b.z) < 12) return true;
  return false;
}

export function generateColumn(cx: number, cz: number): Uint16Array {
  const steps = generateColumnSteps(cx, cz);
  for (;;) { const r = steps.next(); if (r.done) return r.value; }
}

/**
 * The same column, built a part at a time: each `next()` does one part and the last returns the column. Where
 * workers are blocked the page's own thread builds the land, and a whole column in one go holds a frame for
 * 25–75 ms; a part at a time holds it for a few (docs/PHASE9B.md, 1).
 */
export function* generateColumnSteps(cx: number, cz: number): Generator<void, Uint16Array, void> {
  const col = new Uint16Array(COLUMN_VOLUME);
  const x0 = cx * CS, z0 = cz * CS;
  const tops = new Int16Array(CS * CS); // walking height after shaping, per (x, z)

  // 1. Rock: the valley floor, the cliff and the land beyond.
  for (let lz = 0; lz < CS; lz++) {
    for (let lx = 0; lx < CS; lx++) {
      const x = x0 + lx, z = z0 + lz;
      const d = distToValley(x, z);
      const floorH = valleyFloorHeight(x, z);
      const outH = outsideHeight(x, z);
      let top = 0;
      if (d < R_IN) {
        for (let y = 0; y < floorH; y++) col[ci(lx, y, lz)] = LIMESTONE;
        top = floorH;
      } else if (d > R_OUT) {
        for (let y = 0; y < outH; y++) col[ci(lx, y, lz)] = LIMESTONE;
        top = outH;
      } else {
        const maxH = Math.max(floorH, outH);
        for (let y = 0; y < maxH; y++) {
          const solid = y < floorH || (y < outH && d > wallRadius(x, y, z, floorH, outH));
          if (solid) { col[ci(lx, y, lz)] = LIMESTONE; top = y + 1; }
        }
        top = tidyCliff(col, lx, lz, x, z, floorH, outH, top);
      }
      tops[lz * CS + lx] = top;
      // Basalt bedrock at the bottom.
      col[ci(lx, 0, lz)] = BEDROCK;
      if (rand3(x, 1, z, SEED) < 0.6) col[ci(lx, 1, lz)] = BEDROCK;
      if (rand3(x, 2, z, SEED) < 0.25) col[ci(lx, 2, lz)] = BEDROCK;
    }
  }

  yield;
  // 2. Karst caves: two noise fields, carved where both are near zero (long tubes).
  carveCaves(col, x0, z0, tops);

  yield;
  // 3. Ore, in pockets, by zone: tier-1 (iron, flint) inside the valley, more outside.
  placeOre(col, x0, z0, tops);

  yield;
  // 4. Surface: soil, grass, forest floor, moss on wet cliffs.
  dressSurface(col, x0, z0, tops);

  yield;
  // 5. Water: the pool, the creek, the waterfall, the canyon pool and the drowned tunnel.
  placeWater(col, x0, z0, tops);
  buildGate(col, x0, z0);

  // 5b. The way out: the switchback up the canyon wall and the old road, and the places beside it.
  paveRoad(col, x0, z0, tops);
  placeBufferPlaces(col, x0, z0);
  buildZone1(col, x0, z0);
  buildZone1Far(col, x0, z0);
  buildZone2(col, x0, z0);
  buildZone3(col, x0, z0);
  buildZone4(col, x0, z0);

  yield;
  // 6. The builder's home: balcony, path, rooms, lanterns, the iron vein.
  buildHome(col, x0, z0);
  plantGarden(col, x0, z0);

  yield;
  // 7. Trees and ground plants.
  placeTrees(col, x0, z0);
  placeGroundPlants(col, x0, z0);

  return col;
}

/** Is the valley's rock solid at (x, y, z), as step 1 shapes it (before caves)? */
function cliffRock(x: number, y: number, z: number): boolean {
  const floorH = valleyFloorHeight(x, z);
  if (y < floorH) return true;
  const d = distToValley(x, z);
  if (d < R_IN) return false;
  const outH = outsideHeight(x, z);
  return y < outH && (d > R_OUT || d > wallRadius(x, y, z, floorH, outH));
}

/** The lowest open place in a column of the valley's rock: the walking height at the foot of whatever stands there. */
function cliffFoot(x: number, z: number): number {
  const d = distToValley(x, z), floorH = valleyFloorHeight(x, z);
  if (d < R_IN) return floorH;
  const outH = outsideHeight(x, z);
  if (d > R_OUT) return outH;
  let y = floorH;
  while (y < outH && d > wallRadius(x, y, z, floorH, outH)) y++;
  return y;
}

const SIDES: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * Tidies one column of the valley's cliff once it is shaped (docs/REVIEW.md, N3c and N3g). A single rock left
 * hanging in the air is taken away. A one-block pit at the cliff's foot, walled two deep or more on all four
 * sides, is filled until there is a way out of it. Only inside the sinkhole: the plateau above is left alone.
 * Returns the column's top.
 */
function tidyCliff(col: Uint16Array, lx: number, lz: number, x: number, z: number, floorH: number, outH: number, top: number): number {
  const at = (y: number) => col[ci(lx, y, lz)];
  for (let y = floorH + 1; y < top; y++) {
    if (at(y) !== LIMESTONE || at(y - 1) !== AIR || at(y + 1) !== AIR) continue;
    if (!SIDES.some(([dx, dz]) => cliffRock(x + dx, y, z + dz))) col[ci(lx, y, lz)] = AIR;
  }
  while (top > floorH && at(top - 1) === AIR) top--;
  let foot = floorH;
  while (foot < top && at(foot) !== AIR) foot++;
  while (foot < outH && at(foot) === AIR && SIDES.every(([dx, dz]) => cliffRock(x + dx, foot, z + dz) && cliffRock(x + dx, foot + 1, z + dz))) {
    col[ci(lx, foot, lz)] = LIMESTONE;
    foot++;
    top = Math.max(top, foot);
  }
  return top;
}

function carveCaves(col: Uint16Array, x0: number, z0: number, tops: Int16Array): void {
  // Sample the two noise fields on a coarse 4-block grid and interpolate: same shapes, 1/64 the cost.
  const G = 4, NX = CS / G + 1, NY = WORLD_Y / G + 1;
  const a = new Float32Array(NX * NX * NY), b = new Float32Array(NX * NX * NY);
  for (let gy = 0; gy < NY; gy++)
    for (let gz = 0; gz < NX; gz++)
      for (let gx = 0; gx < NX; gx++) {
        const x = x0 + gx * G, y = gy * G, z = z0 + gz * G;
        const i = (gy * NX + gz) * NX + gx;
        a[i] = caveA.noise3(x / 46, y / 22, z / 46);
        b[i] = caveB.noise3(x / 46, y / 22, z / 46);
      }
  const sample = (f: Float32Array, lx: number, y: number, lz: number) => {
    const fx = lx / G, fy = y / G, fz = lz / G;
    const ix = Math.min(NX - 2, fx | 0), iy = Math.min(NY - 2, fy | 0), iz = Math.min(NX - 2, fz | 0);
    const tx = fx - ix, ty = fy - iy, tz = fz - iz;
    const at = (dx: number, dy: number, dz: number) => f[((iy + dy) * NX + (iz + dz)) * NX + ix + dx];
    const c00 = at(0, 0, 0) * (1 - tx) + at(1, 0, 0) * tx;
    const c10 = at(0, 0, 1) * (1 - tx) + at(1, 0, 1) * tx;
    const c01 = at(0, 1, 0) * (1 - tx) + at(1, 1, 0) * tx;
    const c11 = at(0, 1, 1) * (1 - tx) + at(1, 1, 1) * tx;
    return (c00 * (1 - tz) + c10 * tz) * (1 - ty) + (c01 * (1 - tz) + c11 * tz) * ty;
  };
  // The cliff's foot in each column, and two columns beyond this one's edges, where the valley's cliff is near:
  // read off the rock before any cave is cut (worked out afresh only for the columns beyond the edges).
  const FW = CS + 4, feet = new Int16Array(FW * FW);
  const centre = distToValley(x0 + CS / 2, z0 + CS / 2);
  if (centre > R_IN - 26 && centre < R_OUT + 26) {
    for (let lz = -2; lz < CS + 2; lz++)
      for (let lx = -2; lx < CS + 2; lx++) {
        let f: number;
        if (lx < 0 || lz < 0 || lx >= CS || lz >= CS) f = cliffFoot(x0 + lx, z0 + lz);
        else {
          const d = distToValley(x0 + lx, z0 + lz), top = tops[lz * CS + lx];
          f = top;
          if (d >= R_IN && d <= R_OUT) { f = valleyFloorHeight(x0 + lx, z0 + lz); while (f < top && col[ci(lx, f, lz)] !== AIR) f++; }
        }
        feet[(lz + 2) * FW + lx + 2] = f;
      }
  }
  const foot = (lx: number, lz: number) => feet[(lz + 2) * FW + lx + 2];
  for (let lz = 0; lz < CS; lz++)
    for (let lx = 0; lx < CS; lx++) {
      const x = x0 + lx, z = z0 + lz;
      const top = tops[lz * CS + lx];
      const roofKeep = inValleyBowl(x, z) ? 9 : 6; // caves under the valley floor stay well below it
      // No cave runs through the gorge's west wall, at any depth: one that opened in the wall and came up on
      // the far bank would be a way round the dam (docs/REVIEW.md, N3b).
      if (Math.abs(x - (ravineX(z) - RAVINE_HALF)) < 4) continue;
      // In the valley's cliff the roof is kept under the lowest open place in the column and in those round
      // it, not under the column's highest rock. Under an overhang that rock is the rim, forty blocks above
      // the floor: a cave was cut right up to the floor at the cliff's foot, a shaft to fall into that ran on
      // under the rock past the sanctuary's line (docs/REVIEW.md, N3c and N3d).
      let roof = top;
      const d = distToValley(x, z);
      if (d >= R_IN && d <= R_OUT) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) roof = Math.min(roof, foot(lx + dx, lz + dz));
      for (let y = 8; y < roof - roofKeep; y++) {
        const va = sample(a, lx, y, lz), vb = sample(b, lx, y, lz);
        if (va * va + vb * vb < 0.0065 && !caveExcluded(x, y, z)) col[ci(lx, y, lz)] = AIR;
      }
    }
}

function placeOre(col: Uint16Array, x0: number, z0: number, tops: Int16Array): void {
  // One candidate pocket per 4×4×4 cell; a block becomes ore if it is near its cell's pocket centre.
  for (let lz = 0; lz < CS; lz++)
    for (let lx = 0; lx < CS; lx++) {
      const x = x0 + lx, z = z0 + lz;
      const top = tops[lz * CS + lx];
      const valley = inValleyBowl(x, z);
      const zone = landZoneAt(x, z);
      const near = zone === 'near';
      // The mid band's deeper rock holds twice the coal and iron (docs/PHASE5.md).
      const rich = zone === 'mid' ? 2 : 1;
      // Under Zone-3 the deep rock is richer still: three times the coal and iron below y 60 (docs/PHASE7.md).
      const deep3 = zone === 'zone3';
      for (let y = 3; y < top - 2; y++) {
        const i = ci(lx, y, lz);
        if (col[i] !== LIMESTONE || caveExcluded(x, y, z)) continue;
        const gx = x >> 2, gy = y >> 2, gz = z >> 2;
        const h = hash3(gx, gy, gz, SEED + 5);
        const roll = (h & 1023) / 1024;
        let ore = 0;
        // The whole sanctuary, the home's rock as well as the bowl, holds the valley's ores only: "coal and better
        // ores are outside" (it was the bowl alone, and the home's own rock held 1,309 coal and 396 copper ore).
        if (valley || inSanctuary(x, z)) {
          if (roll < 0.035) ore = IRON;
          else if (roll < 0.06) ore = FLINT;
          else if (roll < 0.075 && y < 66) ore = CLAY;
        } else {
          // Zone-1's near band shows its iron and copper closer to the surface (docs/PHASE4.md).
          const lift = near ? 12 : 0;
          const k = deep3 ? (y < 60 ? 3 : 1) : y < 72 ? rich : 1;
          if (roll < 0.05 * k && y < 112) ore = COAL;
          else if (roll < 0.08 * k && y < 92 + lift) ore = IRON;
          else if (roll < 0.08 * k + 0.025 && y < 84 + lift) ore = COPPER;
          else if (roll < 0.08 * k + 0.04) ore = FLINT;
          else if (roll < 0.08 * k + 0.06) ore = GRAVEL;
        }
        if (!ore) continue;
        const ox = (gx << 2) + ((h >>> 10) & 3), oy = (gy << 2) + ((h >>> 12) & 3), oz = (gz << 2) + ((h >>> 14) & 3);
        const dd = (x - ox) ** 2 + (y - oy) ** 2 + (z - oz) ** 2;
        if (dd <= 1.6 + ((h >>> 16) & 3) * 0.6) col[i] = ore;
      }
    }
}

/** Near the tunnel's mouths, under and just above the water: no moss, only plain rock. */
function nearMouth(x: number, y: number, z: number): boolean {
  return y < VALLEY.water + 6 && Math.abs(z - TUNNEL.z) < 9 && x > TUNNEL.x0 - 9 && x < TUNNEL.x1 + 8;
}

function dressSurface(col: Uint16Array, x0: number, z0: number, tops: Int16Array): void {
  for (let lz = 0; lz < CS; lz++)
    for (let lx = 0; lx < CS; lx++) {
      const x = x0 + lx, z = z0 + lz;
      const d = distToValley(x, z);
      // Slope from neighbouring heights (outside the column, use the layout's height).
      const h = (dx: number, dz: number) => {
        const nx = lx + dx, nz = lz + dz;
        if (nx >= 0 && nz >= 0 && nx < CS && nz < CS) return tops[nz * CS + nx];
        return d < R_IN ? valleyFloorHeight(x + dx, z + dz) : outsideHeight(x + dx, z + dz);
      };
      const top = tops[lz * CS + lx];
      const slope = Math.max(Math.abs(h(1, 0) - top), Math.abs(h(-1, 0) - top), Math.abs(h(0, 1) - top), Math.abs(h(0, -1) - top));
      const wet = detail.noise2(x / 14, z / 14);

      // Every exposed rock face: moss where it is damp (more of it near the waterfall).
      const nearFall = SPRINGS.some((f) => Math.hypot(x - f.x, z - (f.z0 + f.z1) / 2) < 30);
      // Zone-4 is dead under the fallout (docs/PHASE8.md): no moss on its rock, grey ground, but for the pass's clean pocket.
      const dead = landZoneAt(x, z) === 'zone4' && !cleanGround(x, z);
      for (let y = dead ? top : 3; y < top; y++) {
        const i = ci(lx, y, lz);
        if (col[i] !== LIMESTONE) continue;
        const open = y + 1 >= WORLD_Y || col[ci(lx, y + 1, lz)] === AIR || (lx > 0 && col[ci(lx - 1, y, lz)] === AIR) ||
          (lx < CS - 1 && col[ci(lx + 1, y, lz)] === AIR) || (lz > 0 && col[ci(lx, y, lz - 1)] === AIR) || (lz < CS - 1 && col[ci(lx, y, lz + 1)] === AIR);
        if (open && !nearMouth(x, y, z) && (wet + detail.noise3(x / 6, y / 6, z / 6) * 0.6 > (nearFall ? -0.4 : 0.35))) col[i] = MOSSY;
      }

      if (top < 4) continue;
      const ti = ci(lx, top - 1, lz);
      if (col[ti] !== LIMESTONE && col[ti] !== MOSSY) continue;
      if (slope >= 3) continue; // steep ground stays bare rock
      const valley = d < VALLEY.radius - 4;
      const canyonFloor = !valley && Math.abs(x - canyonCenterX(z)) < 20 && top <= VALLEY.floor + 3;
      // Zone-1's near band is old farmland gone semi-feral: grass, not forest floor.
      let topBlock = valley || landZoneAt(x, z) === 'near' ? GRASS : FOREST;
      let fill = DIRT;
      let depth = valley ? 4 : 3;
      if (dead) topBlock = rand3(x, top, z, SEED + 4) < 0.14 ? GRAVEL : DEAD_SOIL;
      else if (landZoneAt(x, z) === 'zone4') topBlock = GRASS;
      else if (canyonFloor) { topBlock = rand3(x, top, z, SEED) < 0.5 ? GRAVEL : SAND; fill = GRAVEL; depth = 2; }
      else if (landZoneAt(x, z) === 'deep' || (x < ZONES_RAVINE_FAR && x > 560)) {
        // The deep band: the wettest ground, moss and mud under the dense canopy.
        const r = rand3(x, top, z, SEED + 3);
        topBlock = wet > 0.1 ? (r < 0.25 ? MUD : MOSS) : r < 0.12 ? MUD : FOREST;
      }
      else if (!valley && !dead && slope >= 2 && wet > 0.2) topBlock = MOSS;
      col[ti] = topBlock;
      for (let k = 2; k <= depth; k++) {
        const j = ci(lx, top - k, lz);
        if (col[j] === LIMESTONE) col[j] = fill;
      }
    }
}

function placeWater(col: Uint16Array, x0: number, z0: number, tops: Int16Array): void {
  const W = VALLEY.water;
  for (let lz = 0; lz < CS; lz++)
    for (let lx = 0; lx < CS; lx++) {
      const x = x0 + lx, z = z0 + lz;
      const top = tops[lz * CS + lx];

      // A round pool with a sloping bed, fringed with sand.
      const pool = (p: { cx: number; cz: number; radius: number; depth: number }, floorTop: number) => {
        const dp = Math.hypot(x - p.cx, z - p.cz) + 1.2 * detail.noise2(x / 6, z / 6);
        if (dp < p.radius) {
          const depth = Math.max(1, Math.round(p.depth * (1 - (dp / p.radius) ** 2)));
          const bed = W - depth;
          for (let y = bed - 1; y <= bed; y++) col[ci(lx, y, lz)] = dp < p.radius * 0.6 ? GRAVEL : SAND;
          for (let y = bed + 1; y <= W; y++) col[ci(lx, y, lz)] = WATER;
          for (let y = W + 1; y < floorTop + 2; y++) col[ci(lx, y, lz)] = AIR;
          return true;
        }
        if (dp < p.radius + 2.5 && top <= floorTop + 1) col[ci(lx, top - 1, lz)] = SAND;
        return false;
      };

      if (inValleyBowl(x, z)) {
        pool(POOL, VALLEY.floor);
        // The creek: a narrow channel of water, with mud and clay banks.
        const cd = creekDistance(x, z) + 0.6 * detail.noise2(x / 5, z / 5);
        if (cd < 1.9 && Math.hypot(x - POOL.cx, z - POOL.cz) > POOL.radius - 2) {
          col[ci(lx, W - 2, lz)] = cd < 1 ? GRAVEL : MUD;
          col[ci(lx, W - 1, lz)] = cd < 1.2 ? WATER : MUD;
          col[ci(lx, W, lz)] = WATER;
          for (let y = W + 1; y < top + 2; y++) col[ci(lx, y, lz)] = AIR;
        } else if (cd < 3.6 && top <= VALLEY.floor + 1) {
          col[ci(lx, top - 1, lz)] = cd < 2.7 ? MUD : (rand3(x, 9, z, SEED) < 0.5 ? CLAY : SAND);
        }
      } else if (Math.abs(x - CANYON_POOL.cx) < 20 && Math.abs(z - CANYON_POOL.cz) < 20 && top <= VALLEY.floor + 3) {
        // (Only on the canyon floor: never cut into the headwall behind it.)
        pool(CANYON_POOL, Math.max(top, VALLEY.floor));
      }

      // The canyon pool's overflow: a shallow stream along the floor that thins and sinks into the gravel.
      if (!inValleyBowl(x, z) && top <= VALLEY.floor + 3 && Math.hypot(x - CANYON_POOL.cx, z - CANYON_POOL.cz) > CANYON_POOL.radius - 2) {
        const st = canyonStreamAt(x, z);
        const sd = st.dist + 0.5 * detail.noise2(x / 5, z / 5);
        const half = 1.9 - 1.2 * st.t;
        if (st.t < 0.93 && sd < half) {
          col[ci(lx, W - 1, lz)] = GRAVEL;
          col[ci(lx, W, lz)] = WATER;
          for (let y = W + 1; y < top + 2; y++) col[ci(lx, y, lz)] = AIR;
        } else if (sd < half + 0.6) {
          // Its last stretch is a dry bed of wet gravel and mud: the water has gone down into the rock.
          col[ci(lx, Math.min(top, W + 1) - 1, lz)] = rand3(x, 5, z, SEED) < 0.6 ? GRAVEL : MUD;
          for (let y = Math.min(top, W + 1); y < top + 2; y++) col[ci(lx, y, lz)] = AIR;
        }
      }

      // The falls: a curtain two blocks thick down each face of the ridge, the front one a little
      // shorter so the lip reads, with falling water all the way down to the pool.
      for (const f of SPRINGS) {
        if (z < f.z0 || z >= f.z1) continue;
        if (x === f.x || x === f.x + f.dir) {
          const top = x === f.x ? f.top : f.top - 1;
          for (let y = W + 1; y <= top; y++) col[ci(lx, y, lz)] = FALLING;
          col[ci(lx, W, lz)] = WATER;
        }
      }

      // The deep water under each curtain, down to the tunnel's floor, then a gravel floor stepping up
      // a block at a time to a ledge just under the surface (basinFloor).
      const bf = basinFloor(x, z);
      if (bf !== null) {
        for (let y = TUNNEL.y0 - 1; y < bf; y++) col[ci(lx, y, lz)] = GRAVEL;
        for (let y = bf; y <= W; y++) col[ci(lx, y, lz)] = WATER;
      }

      // The drowned tunnel, straight through the ridge from one mouth to the other.
      if (x >= TUNNEL.x0 && x < TUNNEL.x1 && Math.abs(z - TUNNEL.z) <= TUNNEL.halfWidth) {
        for (let y = TUNNEL.y0; y < TUNNEL.y1; y++) col[ci(lx, y, lz)] = WATER;
      }
      // Plain rock round the tunnel and its mouths, so nothing there looks like something to use.
      if (x >= TUNNEL.x0 && x < TUNNEL.x1 && Math.abs(z - TUNNEL.z) <= TUNNEL.halfWidth + 1) {
        const face = x === TUNNEL.x0 || x === TUNNEL.x1 - 1;
        for (let y = TUNNEL.y0 - 1; y <= TUNNEL.y1; y++) {
          const i = ci(lx, y, lz);
          const inside = y >= TUNNEL.y0 && y < TUNNEL.y1 && Math.abs(z - TUNNEL.z) <= TUNNEL.halfWidth;
          if (!inside && (face || col[i] !== WATER)) col[i] = LIMESTONE;
        }
      }
    }
  for (const f of SPRINGS) carveSpring(col, x0, z0, f);
}

/**
 * The dark opening a spring pours from, a few blocks below the top of the ridge: the river runs out
 * along its floor, under a low arched roof, framed by solid rock so the face above it stays dry.
 */
function carveSpring(col: Uint16Array, x0: number, z0: number, f: Falls): void {
  const face = f.x - f.dir; // the rock column the curtain falls against
  const back = face - f.dir * (SPRING_OPENING.depth - 1);
  const xa = Math.min(face, back), xb = Math.max(face, back);
  if (x0 + CS <= xa || x0 > xb || z0 + CS <= f.z0 - 1 || z0 > f.z1) return;
  const put = (x: number, y: number, z: number, id: number) => {
    const lx = x - x0, lz = z - z0;
    if (lx >= 0 && lz >= 0 && lx < CS && lz < CS) col[ci(lx, y, lz)] = id;
  };
  const H = SPRING_OPENING.height;
  for (let z = f.z0 - 1; z <= f.z1; z++)
    for (let x = xa; x <= xb; x++) {
      const lx = x - x0, lz = z - z0;
      if (lx < 0 || lz < 0 || lx >= CS || lz >= CS) continue;
      const side = z < f.z0 || z >= f.z1;
      const rim = outsideHeight(x, z);
      // Rock all round, up to the ridge's top (or a few blocks over the roof, whichever is lower).
      for (let y = f.top - 2; y <= Math.min(rim - 1, f.top + H + 4); y++) {
        const i = ci(lx, y, lz);
        if (col[i] === AIR || col[i] === WATER) col[i] = y === f.top - 1 || y > f.top + H ? MOSSY : LIMESTONE;
      }
      // Behind the curtain the cliff is whole down to the pool: the water falls against rock, with no
      // gap between them to dive into.
      if (Math.abs(x - face) <= 2) for (let y = VALLEY.water + 1; y < f.top - 1; y++) {
        const i = ci(lx, y, lz);
        if (col[i] === AIR) col[i] = y < VALLEY.water + 6 ? LIMESTONE : MOSSY;
      }
      if (side) continue;
      // The opening: the river's water on its floor, dark air above, the top row narrower (an arch).
      const edge = z === f.z0 || z === f.z1 - 1;
      put(x, f.top, z, WATER);
      for (let y = f.top + 1; y <= f.top + H; y++) put(x, y, z, edge && y === f.top + H ? MOSSY : AIR);
    }
}

/** The builder's gate halfway along the tunnel, and the lamps that line it and frame its mouths. */
function buildGate(col: Uint16Array, x0: number, z0: number): void {
  if (x0 + CS <= TUNNEL.x0 - 1 || x0 > TUNNEL.x1 || z0 + CS <= TUNNEL.z - 3 || z0 > TUNNEL.z + 3) return;
  const put = (x: number, y: number, z: number, id: number) => {
    const lx = x - x0, lz = z - z0;
    if (lx >= 0 && lz >= 0 && lx < CS && lz < CS) col[ci(lx, y, lz)] = id;
  };
  for (let z = GATE.z0; z < GATE.z1; z++)
    for (let x = GATE.x0; x < GATE.x1; x++)
      for (let y = GATE.y0; y < GATE.y1; y++) put(x, y, z, GATE_STONE);
  for (const [x, y, z] of TUNNEL_LAMPS) put(x, y, z, SEALED_LAMP);
  for (const [x, y, z] of MOUTH_LAMPS) put(x, y, z, SEALED_LAMP);
}

/** The road's broken asphalt, weeds in its cracks, and the gravel and old stone of the ramp. */
function paveRoad(col: Uint16Array, x0: number, z0: number, tops: Int16Array): void {
  if (x0 > ROAD.east + 40 || x0 + CS < ROAD.west - 8) return;
  for (let lz = 0; lz < CS; lz++)
    for (let lx = 0; lx < CS; lx++) {
      const x = x0 + lx, z = z0 + lz;
      const top = tops[lz * CS + lx];
      const roll = rand3(x, 5, z, SEED + 40);
      if (rampAt(x, z).dist < RAMP_HALF_WIDTH) {
        col[ci(lx, top - 1, lz)] = roll < 0.3 ? COBBLE : GRAVEL;
        col[ci(lx, top - 2, lz)] = GRAVEL;
        continue;
      }
      if (!onRoad(x, z)) continue;
      const edge = Math.abs(z + 0.5 - roadZ(x)) > ROAD.halfWidth - 0.8;
      col[ci(lx, top - 1, lz)] = roll < 0.07 || (edge && roll < 0.22) ? FOREST : roll < 0.14 || (edge && roll < 0.32) ? GRAVEL : ROAD_BLOCK;
      col[ci(lx, top - 2, lz)] = GRAVEL;
      for (let y = top; y < top + 4; y++) if (col[ci(lx, y, lz)] !== AIR && col[ci(lx, y, lz)] !== WATER) col[ci(lx, y, lz)] = AIR;
    }
}

/** The toppled ranger sign and its broken post, and the burrows in the warren's bank. */
function placeBufferPlaces(col: Uint16Array, x0: number, z0: number): void {
  const put = (x: number, y: number, z: number, id: number) => {
    const lx = x - x0, lz = z - z0;
    if (lx >= 0 && lz >= 0 && lx < CS && lz < CS && y > 0 && y < WORLD_Y) col[ci(lx, y, lz)] = id;
  };
  const s = PLACES.rangerSign;
  put(s.x, outsideHeight(s.x, s.z), s.z, blockId('ranger_sign@east'));
  put(s.x + 1, outsideHeight(s.x + 1, s.z), s.z, blockId('ranger_sign@east'));
  put(s.x - 1, outsideHeight(s.x - 1, s.z - 1), s.z - 1, blockId('sign_post'));
  const w = PLACES.warren;
  if (Math.abs(x0 + CS / 2 - w.x) < CS && Math.abs(z0 + CS / 2 - w.z) < CS) {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.4;
      const outside = outsideHeight(Math.round(w.x + Math.cos(a) * (w.radius + 2)), Math.round(w.z + Math.sin(a) * (w.radius + 2)));
      for (let r = w.radius; r >= w.radius - 4; r--) {
        const x = Math.round(w.x + Math.cos(a) * r), z = Math.round(w.z + Math.sin(a) * r);
        if (outsideHeight(x, z) > outside) put(x, outside, z, AIR);
      }
    }
  }
}

function buildHome(col: Uint16Array, x0: number, z0: number): void {
  if (x0 + CS <= HOME_BOUNDS.x0 - 20 || x0 >= HOME_BOUNDS.x1 || z0 + CS <= HOME_BOUNDS.z0 - 20 || z0 >= HOME_BOUNDS.z1) return;
  const F = HOME.floor;
  for (let lz = 0; lz < CS; lz++)
    for (let lx = 0; lx < CS; lx++) {
      const x = x0 + lx, z = z0 + lz;

      // The path: one gentle S-curve of steps, dressed stone near the top and packed dirt below.
      const p = pathAt(x, z);
      if (p.dist < PATH_HALF_WIDTH) {
        const h = Math.round(p.height);
        const ground = valleyFloorHeight(x, z);
        for (let y = ground - 1; y < h; y++) col[ci(lx, y, lz)] = y === h - 1 ? (h > 76 ? BRICKS : DIRT) : COBBLE;
        for (let y = h; y < h + 4; y++) col[ci(lx, y, lz)] = AIR;
      } else if (x > PATH[0][0] && z >= PATH[1][1] && z <= PATH[0][1] && p.dist < PATH_HALF_WIDTH + 2.5) {
        // Between the first leg and the cliff the rock comes up level with the paving. A slot was left there,
        // one block wide and seven deep: a step off the path's top, and no way out (docs/REVIEW.md, N3a).
        for (let y = valleyFloorHeight(x, z) - 1; y < Math.round(p.height); y++) if (col[ci(lx, y, lz)] === AIR) col[ci(lx, y, lz)] = LIMESTONE;
      }

      // The balcony: a ledge of rock, thicker where it meets the cliff, paved on top.
      const b = HOME.balcony;
      if (x >= b.x0 && x < b.x1 && z >= b.z0 && z < b.z1) {
        {
          const thick = 2 + Math.round((x - b.x0) * 0.7) + (rand3(x, 4, z, SEED) < 0.3 ? 1 : 0);
          for (let y = F - 1 - thick; y < F - 1; y++) col[ci(lx, y, lz)] = LIMESTONE;
          col[ci(lx, F - 1, lz)] = BRICKS;
        }
        for (let y = F; y < F + 12; y++) col[ci(lx, y, lz)] = AIR;
      }

      // The rooms, with the builder's floors.
      for (const r of HOME.rooms) {
        if (x < r.x0 || x >= r.x1 || z < r.z0 || z >= r.z1) continue;
        const inner = Math.min(x - r.x0, r.x1 - 1 - x, z - r.z0, r.z1 - 1 - z);
        const ceil = r.built ? r.y1 : r.y1 + (inner >= 3 && detail.noise2(x / 4, z / 4) > 0 ? 1 : 0) - (inner === 0 && r.name !== 'mouth' ? 1 : 0);
        for (let y = r.y0; y < ceil; y++) col[ci(lx, y, lz)] = AIR;
        const floor = r.name === 'living' || r.name === 'vault' || r.name === 'hall' || r.built ? PLANKS
          : r.name === 'workshop' ? COBBLE : r.name === 'mouth' ? BRICKS : LIMESTONE;
        col[ci(lx, r.y0 - 1, lz)] = floor;
      }

      const v = HOME.ironVein;
      for (let y = v.y0; y < v.y1; y++)
        if (inBox(x, y, z, v) && col[ci(lx, y, lz)] !== AIR && rand3(x, y, z, SEED + 2) < 0.7) col[ci(lx, y, lz)] = IRON;
    }
  // The builder's chests: what he left (src/gen/inheritance.ts).
  for (const c of HOME_CHESTS) {
    if (c.safe) continue; // the safe is set into the wall below
    if (c.x >= x0 && c.x < x0 + CS && c.z >= z0 && c.z < z0 + CS) col[ci(c.x - x0, c.y, c.z - z0)] = CHEST;
  }
  furnish(col, x0, z0);
  // The living rooms, the balcony and the bedroom (src/gen/home.ts). It places the wardrobe that holds the linen.
  fitOutHome(col, x0, z0);
}

// ---- The builder's workshop and vault ---------------------------------------------------------

/** The workshop's stations and the vault's door and safe (docs/PHASE2.md, step 3). Facing names say which way a front looks. */
function furnish(col: Uint16Array, x0: number, z0: number): void {
  const put = (x: number, y: number, z: number, name: string) => {
    if (x >= x0 && x < x0 + CS && z >= z0 && z < z0 + CS && y >= 0 && y < WORLD_Y) col[ci(x - x0, y, z - z0)] = blockId(name);
  };
  const F = HOME.floor;

  // Workshop.
  put(1820, F, 1007, 'workbench');
  put(1823, F, 1006, 'smelter@south');
  put(1826, F, 1006, 'kiln@south');
  for (let y = F + 1; y <= outsideHeight(1826, 1006) + 1; y++) put(1826, y, 1006, 'stove_pipe'); // the kiln's flue
  put(1820, F, 1012, 'anvil');
  put(1817, F, 1012, 'tannery_rack@east');

  // Vault: a steel door across the passage, and the wall safe.
  for (const z of [1023, 1024]) for (const y of [F, F + 1]) put(1826, y, z, 'steel_door@east');
  for (const z of [1023, 1024]) put(1826, F + 2, z, 'stone_bricks');
  put(1829, F + 1, 1027, 'wall_safe');
}

/** The builder's garden at the foot of the path: rows of crops at mixed stages, and the coffee grove. */
function plantGarden(col: Uint16Array, x0: number, z0: number): void {
  const G = GARDEN;
  if (x0 + CS <= G.x0 || x0 >= G.x1 || z0 + CS <= G.z0 || z0 >= G.z1) return;
  const kinds = ['corn', 'beans', 'squash', 'tomato', 'pepper', 'potato', 'herbs'];
  const ground = VALLEY.floor; // the garden is levelled to the floor height
  for (let z = Math.max(G.z0, z0); z < Math.min(G.z1, z0 + CS); z++)
    for (let x = Math.max(G.x0 + 2, x0); x < Math.min(G.x1 - 2, x0 + CS); x++) {
      const lx = x - x0, lz = z - z0;
      const r = rand3(x, 7, z, SEED + 41);
      if (z >= G.z1 - 7) {
        // The coffee grove along the garden's south side: bushes in a loose row.
        if ((x + z) % 3 === 0 && r < 0.8) col[ci(lx, ground, lz)] = blockId(`coffee_bush_${r < 0.45 ? 2 : 1}`);
        continue;
      }
      const row = Math.floor((z - G.z0) / 3), inRow = (z - G.z0) % 3;
      if (inRow === 2 || z < G.z0 + 2) continue; // a path between each pair of rows
      col[ci(lx, ground - 1, lz)] = blockId('farmland');
      const kind = kinds[row % kinds.length];
      const stage = r < 0.4 ? 3 : r < 0.7 ? 2 : 1;
      col[ci(lx, ground, lz)] = blockId(`crop_${kind}_${stage}`);
    }
}

// ---- Trees -----------------------------------------------------------------------------

const TREE_CELL = 9;

interface TreeSpot { x: number; z: number; ground: number; kind: 'broadleaf' | 'fern' | 'bamboo' | 'snag'; seed: number }

function treeSpot(gx: number, gz: number): TreeSpot | null {
  const h = hash3(gx, 7, gz, SEED + 9);
  const x = gx * TREE_CELL + (h & 7);
  const z = gz * TREE_CELL + ((h >>> 3) & 7);
  const roll = ((h >>> 6) & 1023) / 1024;
  const d = distToValley(x, z);
  const zone = landZoneAt(x, z);
  if (d > VALLEY.radius - 12 && d < VALLEY.radius + 22) return null; // the cliff band
  if (x > HOME_BOUNDS.x0 - 50 && Math.abs(z - VALLEY.cz) < 40 && d < VALLEY.radius) return null; // the view from the balcony
  if (x >= GARDEN.x0 - 3 && x < GARDEN.x1 + 3 && z >= GARDEN.z0 - 3 && z < GARDEN.z1 + 3) return null;
  if (Math.hypot(x - POOL.cx, z - POOL.cz) < POOL.radius + 4) return null;
  if (Math.hypot(x - CANYON_POOL.cx, z - CANYON_POOL.cz) < CANYON_POOL.radius + 4) return null;
  if (canyonStreamAt(x, z).dist < 4) return null;
  if (pathAt(x, z).dist < 4) return null;
  if (onRoad(x, z, 4)) return null;
  const m = PLACES.morphoTree, w = PLACES.warren, sign = PLACES.rangerSign;
  if (Math.hypot(x - m.x, z - m.z) < m.clearing + 4 || Math.hypot(x - w.x, z - w.z) < w.radius + 4 || Math.hypot(x - sign.x, z - sign.z) < 5) return null;
  // Zone-1's places stand in the open, and the saddle's view down to the farm stays clear.
  if (inFarmyard(x, z, 6) || onFarmTrack(x, z) || onFarmTrack(x - 2, z) || onFarmTrack(x + 2, z)) return null;
  const sh = ZONE1.shelter, tk = ZONE1.truck;
  if (x > sh.x0 - 6 && x < sh.x1 + 6 && z > sh.z0 - 6 && z < sh.z1 + 3) return null;
  if (x > tk.x0 - 5 && x < tk.x1 + 5 && Math.abs(z - tk.z0) < 6) return null;
  if (Math.abs(x - ZONE1.saddleSign.x) < 6 && Math.abs(z - ZONE1.saddleSign.z) < 6) return null;
  // Zone-1's mid places: the outpost's cleared ground (the raiders cut back the trees), the brush trail,
  // the mine's head, the camp's trail and clearing. The deep band's bridge, and the line of sight across
  // the ravine to the body on the far bank.
  const F = ZONE1FAR, o = F.outpost;
  if (Math.hypot(x - (o.x0 + o.x1) / 2, z - (o.z0 + o.z1) / 2) < 32) return null;
  if (brushTrailDist(x, z) < 8 || farPlace(x, z)) return null;
  // Zone-2's highway, its places and the clearing round them.
  if (zone2Place(x, z)) return null;
  // Zone-3's roads and places, and the avenue's verges: open ground by day.
  if (zone3Place(x, z)) return null;
  // Zone-4's road and places; and the pass's clean ground has its one tree, set by hand.
  if (zone4Place(x, z)) return null;
  // Where the gorge runs shallow through the mountains at the world's ends, its west wall and the ground either
  // side of it stand bare: a crown is something to walk on, and that wall is not to be crossed (docs/REVIEW.md, N3b).
  if (Math.min(z, WORLD_Z - 1 - z) < 290 && x - ravineX(z) > -28 && x - ravineX(z) < -8) return null;
  if (onCampTrail(x, z) || onCampTrail(x - 3, z) || onCampTrail(x + 3, z)) return null;
  if (Math.abs(x - ravineX(z)) < RAVINE_HALF + 2 && Math.abs(z - F.bridge.z) < 70) return null;
  // A break in the canopy over the body, so it lies in daylight (DESIGN.md: the one high-contrast thing).
  if (Math.hypot(x - F.body.x, z - F.body.z) < 11) return null;
  if (x > F.body.x - 6 && x < F.bridge.far + 2 && Math.abs(z - (F.bridge.z + (F.body.z - F.bridge.z) * (F.bridge.far - x) / (F.bridge.far - F.body.x))) < 5) return null;
  let kind: TreeSpot['kind'] | null = null;
  if (zone === 'valley') {
    const cd = creekDistance(x, z);
    if (cd < 3.5) return null;
    if (cd < 9 && roll < 0.55) kind = 'bamboo';
    else if (roll < 0.1) kind = 'broadleaf';
    else if (roll < 0.17) kind = 'fern';
  } else if (zone === 'canyon') {
    if (roll < 0.12) kind = 'fern';
    else if (roll < 0.2) kind = 'bamboo';
  } else if (zone === 'near') {
    // Open, semi-feral farmland: a third of the buffer's trees, and fewer still between the saddle and the farm.
    const open = x > 1040 && x < 1160 && z > 1000 && z < 1095;
    if (roll < (open ? 0.05 : 0.17)) kind = 'broadleaf';
    else if (roll < (open ? 0.08 : 0.24)) kind = 'fern';
  } else if (zone === 'deep' || (zone === 'zone3' && x > 560 && x < 640)) {
    // The deep band and the ravine's far bank: the densest, darkest forest (DESIGN.md).
    if (roll < 0.72) kind = 'broadleaf';
    else if (roll < 0.9) kind = 'fern';
  } else if (zone === 'zone4') {
    // Under the fallout nothing lives: bare grey trunks, far apart, so the tower shows between them.
    if (roll < 0.24) kind = 'snag';
  } else if (zone === 'mid') {
    // Shadowed, asymmetrically cleared round the outpost.
    if (roll < 0.42) kind = 'broadleaf';
    else if (roll < 0.62) kind = 'fern';
  } else {
    if (roll < 0.5) kind = 'broadleaf';
    else if (roll < 0.72) kind = 'fern';
  }
  if (!kind) return null;
  const ground = d < VALLEY.radius ? valleyFloorHeight(x, z) : outsideHeight(x, z);
  // No trees on steep ground.
  const slope = Math.max(Math.abs(outsideHeight(x + 2, z) - outsideHeight(x - 2, z)), Math.abs(outsideHeight(x, z + 2) - outsideHeight(x, z - 2)));
  if (d >= VALLEY.radius && slope > 4) return null;
  return { x, z, ground, kind, seed: h };
}

function placeTrees(col: Uint16Array, x0: number, z0: number): void {
  const M = 8; // the widest canopy reach
  const set = (x: number, y: number, z: number, id: number, replaceSoft: boolean) => {
    const lx = x - x0, lz = z - z0;
    if (lx < 0 || lz < 0 || lx >= CS || lz >= CS || y < 0 || y >= WORLD_Y) return;
    const i = ci(lx, y, lz);
    const cur = col[i];
    if (cur === AIR || (replaceSoft && (cur === FERN || cur === TALL_GRASS || cur === LEAVES || cur === FRONDS))) col[i] = id;
  };
  const gx0 = Math.floor((x0 - M) / TREE_CELL), gx1 = Math.floor((x0 + CS + M) / TREE_CELL);
  const gz0 = Math.floor((z0 - M) / TREE_CELL), gz1 = Math.floor((z0 + CS + M) / TREE_CELL);
  for (let gz = gz0; gz <= gz1; gz++)
    for (let gx = gx0; gx <= gx1; gx++) {
      const t = treeSpot(gx, gz);
      if (!t) continue;
      const r = (k: number) => ((t.seed >>> k) & 255) / 256;
      const g = t.ground;
      if (t.kind === 'broadleaf') {
        // A cloud-forest canopy tree: tall trunk, broad flat crown, epiphytes on top.
        const valley = landZoneAt(t.x, t.z) === 'valley';
        const height = (valley ? 7 : 9) + Math.floor(r(8) * (valley ? 5 : 7));
        const crown = 3.2 + r(16) * 2.6;
        const thick = crown > 5;
        for (let y = g; y < g + height; y++) {
          set(t.x, y, t.z, LOG, true);
          if (thick) { set(t.x + 1, y, t.z, LOG, true); set(t.x, y, t.z + 1, LOG, true); set(t.x + 1, y, t.z + 1, LOG, true); }
        }
        const blobs: [number, number, number, number][] = [[0, 0, 0, crown]];
        for (let k = 0; k < 3; k++) {
          const a = r(k * 5 + 1) * Math.PI * 2;
          blobs.push([Math.cos(a) * crown * 0.7, -1 - r(k + 20) * 2, Math.sin(a) * crown * 0.7, crown * 0.6]);
        }
        const cy = g + height;
        for (const [bx, by, bz, br] of blobs) {
          const R = Math.ceil(br);
          for (let dy = -2; dy <= 2; dy++)
            for (let dz = -R; dz <= R; dz++)
              for (let dx = -R; dx <= R; dx++) {
                const e = (dx - bx) ** 2 / (br * br) + (dz - bz) ** 2 / (br * br) + ((dy - by) / 1.6) ** 2 / 1.4;
                if (e > 1) continue;
                const x = t.x + dx, y = Math.round(cy + dy), z = t.z + dz;
                if (rand3(x, y, z, SEED + 13) < 0.06) continue;
                set(x, y, z, LEAVES, false);
                // Bromeliads and orchids perched along the top of the crown.
                if (dy >= 1 && rand3(x, y, z, SEED + 14) < 0.05) set(x, y + 1, z, rand3(x, y, z, SEED + 15) < 0.6 ? BROMELIAD : ORCHID, false);
              }
        }
      } else if (t.kind === 'snag') {
        // A dead tree: a bare trunk, a broken top, a stub of a limb or two.
        const height = 4 + Math.floor(r(8) * 7);
        for (let y = g; y < g + height; y++) set(t.x, y, t.z, DEAD_TRUNK, true);
        for (let k = 0; k < 2; k++) {
          if (r(k * 7 + 3) < 0.45) continue;
          const [dx, dz] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(r(k * 5 + 12) * 4)];
          const y = g + 2 + Math.floor(r(k * 3 + 16) * Math.max(1, height - 3));
          set(t.x + dx, y, t.z + dz, blockId(dx ? 'dead_branch@east' : 'dead_branch'), false);
        }
      } else if (t.kind === 'fern') {
        // A tree fern: a fibrous trunk and a spray of fronds that droop at the tips.
        const height = 4 + Math.floor(r(8) * 4);
        for (let y = g; y < g + height; y++) set(t.x, y, t.z, FERN_TRUNK, true);
        const top = g + height;
        set(t.x, top, t.z, FRONDS, false);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
          const diag = dx !== 0 && dz !== 0;
          const len = diag ? 2 : 3;
          for (let k = 1; k <= len; k++) set(t.x + dx * k, top - (k === len ? 1 : 0), t.z + dz * k, FRONDS, false);
        }
      } else {
        // A bamboo clump.
        const stalks = 3 + Math.floor(r(8) * 5);
        for (let s = 0; s < stalks; s++) {
          const sx = t.x + Math.floor(r(s * 3 + 4) * 4) - 1, sz = t.z + Math.floor(r(s * 3 + 5) * 4) - 1;
          const ground = landZoneAt(sx, sz) === 'valley' ? valleyFloorHeight(sx, sz) : outsideHeight(sx, sz);
          const h = 4 + Math.floor(r(s * 3 + 6) * 6);
          for (let y = ground; y < ground + h; y++) set(sx, y, sz, BAMBOO, false);
        }
      }
    }
  // The morpho tree: one great broadleaf in its own clearing, where the blue butterflies gather.
  const m = PLACES.morphoTree;
  if (x0 + CS + 12 > m.x && x0 - 12 < m.x && z0 + CS + 12 > m.z && z0 - 12 < m.z) {
    const g = outsideHeight(m.x, m.z) - 1; // sunk a block, so the buttress roots grip the slope
    const height = 17;
    for (let y = g; y < g + height; y++)
      for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) set(m.x + dx, y, m.z + dz, LOG, true);
    // Buttress roots flaring out at the foot.
    for (const [dx, dz] of [[-1, 0], [2, 1], [0, -1], [1, 2], [-1, 1], [2, 0], [1, -1], [0, 2]])
      for (let y = g; y < g + 3 - (Math.abs(dx - 0.5) + Math.abs(dz - 0.5) > 2 ? 1 : 0); y++) set(m.x + dx, y, m.z + dz, LOG, true);
    // Two great limbs, and a wide, layered crown.
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let k = 1; k <= 4; k++) set(m.x + (dx > 0 ? 1 : 0) + dx * k, g + height - 3 + Math.floor(k / 2), m.z + (dz > 0 ? 1 : 0) + dz * k, LOG, true);
    const cy = g + height;
    for (let dy = -3; dy <= 3; dy++)
      for (let dz = -9; dz <= 10; dz++)
        for (let dx = -9; dx <= 10; dx++) {
          const e = ((dx - 0.5) ** 2 + (dz - 0.5) ** 2) / 81 + (dy * dy) / 9;
          if (e > 1 || rand3(m.x + dx, cy + dy, m.z + dz, SEED + 13) < 0.08) continue;
          set(m.x + dx, cy + dy, m.z + dz, LEAVES, false);
          if (dy >= 2 && rand3(m.x + dx, cy + dy, m.z + dz, SEED + 14) < 0.07) set(m.x + dx, cy + dy + 1, m.z + dz, rand3(dx, dy, dz, SEED + 15) < 0.5 ? BROMELIAD : ORCHID, false);
        }
  }
}

function placeGroundPlants(col: Uint16Array, x0: number, z0: number): void {
  for (let lz = 0; lz < CS; lz++)
    for (let lx = 0; lx < CS; lx++) {
      const x = x0 + lx, z = z0 + lz;
      if (x >= GARDEN.x0 && x < GARDEN.x1 && z >= GARDEN.z0 && z < GARDEN.z1) continue;
      for (let y = WORLD_Y - 2; y > 2; y--) {
        const below = col[ci(lx, y, lz)];
        if (below === AIR) continue;
        if (below !== GRASS && below !== FOREST && below !== MOSS) break;
        if (col[ci(lx, y + 1, lz)] !== AIR) break;
        if (pathAt(x, z).dist < 2.2) break;
        const roll = rand3(x, y, z, SEED + 17);
        const forest = below !== GRASS;
        let plant = 0;
        if (roll < (forest ? 0.16 : 0.07)) plant = FERN;
        else if (roll < (forest ? 0.2 : 0.2)) plant = TALL_GRASS;
        else if (roll < (forest ? 0.205 : 0.212)) plant = BROMELIAD;
        else if (roll < 0.218) plant = ORCHID;
        if (plant) col[ci(lx, y + 1, lz)] = plant;
        break;
      }
    }
}

/** Splits a column into its six chunks; a chunk that is one block throughout becomes that number. */
export function splitColumn(col: Uint16Array): (Uint16Array | number)[] {
  const out: (Uint16Array | number)[] = [];
  const V = CS * CS * CS;
  for (let cy = 0; cy < WORLD_Y / CS; cy++) {
    const view = col.subarray(cy * V, (cy + 1) * V);
    const first = view[0];
    let uniform = true;
    for (let i = 1; i < V; i++) if (view[i] !== first) { uniform = false; break; }
    out.push(uniform ? first : view.slice());
  }
  return out;
}
