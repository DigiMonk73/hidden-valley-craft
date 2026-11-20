// Zone-3, the industrial river, in blocks (docs/PHASE7.md): the dam road west off Zone-2's highway, the
// faction's barricade, the dam across the river's gorge with its reservoir, spillway and the river that sinks
// below it; on the far bank the control house, the avenue south past the powerhouse, the machine shop and the
// foundry, the rail yard with its engine shed and signal box, the mine, and the old road's far side from the
// broken bridge to the level crossing. Pure, like the rest of the generator. Every position comes from ZONE3
// in layout.ts.

import { CS, WORLD_Y } from '../world/constants.ts';
import { blockId, AIR, WATER, FALLING_WATER } from '../world/blocks.ts';
import { rand3 } from '../core/noise.ts';
import {
  SEED, ZONE3, ZONE2, ZONE1FAR, ROLLING, ROAD, highwayX, outsideHeight, ravineX, westRimX, onDamRoad, damRoadHeight, onAvenue, onFarRoad, farRoadZ, onMineTrail,
  inReservoir, riverBelowDam, zone3Floor,
} from './layout.ts';

const ci = (x: number, y: number, z: number) => (y << 10) | (z << 5) | x;
const Z = ZONE3, D = Z.dam, A = Z.avenue;
const HALF = Z.damRoad.halfWidth;
/** The deck's rows (between the parapets), and the parapets' own rows. */
const DECK_Z0 = D.z - HALF, DECK_Z1 = D.z + HALF - 1, PAR_N = DECK_Z0 - 1, PAR_S = DECK_Z1 + 1;
/** The avenue's lamp posts stand this far apart (their pools of light just meet). */
const LAMP_EVERY = 8;
/** How far the dam's stepped downstream face reaches at its foot. */
const STEP_RISE = 4;

const CF = zone3Floor.control, PF = zone3Floor.powerhouse, SF = zone3Floor.shop, FF = zone3Floor.foundry, YF = zone3Floor.yard;
const P = Z.powerhouse, S = Z.shop, F = Z.foundry, Y = Z.yard, E = Z.engineShed, M = Z.mine, G = M.gallery;
/** The mine's gallery floor, 18 m under the yard. */
export const GALLERY_FLOOR = YF - M.depth;

/** The wall across each building between its lit half (the door) and its dark half (the roller door): the z of the wall's row. */
export const POWER_SPLIT = P.bay - 5, SHOP_SPLIT = S.bay - 3, FOUNDRY_SPLIT = F.bay - 3;

/** Where the game's things stand (their contents are in src/gen/inheritance.ts). */
export const LOGBOOK_DESK: [number, number, number] = [Z.control.x1 - 3, CF, Z.control.z0 + 2];
export const PARTS_CRATE: [number, number, number] = [P.x0 + 4, PF, P.z0 + 2];
export const TOOL_LOCKER: [number, number, number] = [P.x0 + 7, PF, P.z0 + 1];
export const CONTROL_CABINETS: [number, number, number][] = [[P.x0 + 9, PF, P.z0 + 1], [P.x0 + 10, PF, P.z0 + 1]];
/** The one turbine still turning, by the door: a block of 3 × 3 × 3 from this corner. */
export const LIVE_TURBINE: [number, number, number] = [P.x1 - 5, PF, P.z0 + 3];
export const OLD_LATHES: [number, number, number][] = [0, 4, 8].map((k) => [S.x0 + 4 + k, SF, S.z0 + 2]);
export const STEEL_RACKS: [number, number, number][] = [0, 1, 2, 3].flatMap((k) => [[S.x1 - 2, SF, S.z0 + 3 + k], [S.x1 - 2, SF + 1, S.z0 + 3 + k]] as [number, number, number][]);
export const SHOP_CRATE: [number, number, number] = [S.x0 + 2, SF, S.z0 + 6];
export const FOUNDRY_CRUCIBLE: [number, number, number] = [F.x1 - 6, FF, F.z0 + 3];
const [TB, TA] = Y.tracks; // the west track (through the engine shed) and the east
const stock = (kind: string, n = 0) => ROLLING.filter((r) => r.kind === kind)[n];
/** The first boxcar's crate, in its open door on the platform side. */
export const BOXCAR_CRATE: [number, number, number] = [TB + 1, YF + 1, (stock('boxcar').z0 + stock('boxcar').z1) >> 1];
/** The lamps by the boxcar's crate and by the coal wagon. */
export const YARD_LAMPS: [number, number][] = [[TB + 3, BOXCAR_CRATE[2] + 2], [TA + 3, (stock('hopper').z0 + stock('hopper').z1) >> 1]];
/** The spillway's foot, for its roar and spray. */
export const SPILLWAY_AT: [number, number, number] = [D.spill + 0.5, 43, PAR_S + 1.5];
/** The level crossing's two red lights (the mark seen from the broken bridge). */
export const CROSSING_LIGHTS: [number, number][] = [[TA + 4, Math.round(farRoadZ(TA + 4)) - ROAD.halfWidth - 1], [TB - 3, Math.round(farRoadZ(TB - 3)) + ROAD.halfWidth]];

/** Round Zone-3's places (with a margin), where caves don't cut and trees don't grow. */
export function zone3Place(x: number, z: number): boolean {
  if (x > 830 || x < 470 || z > 1050 || z < 140) return false;
  // The gorge that holds the reservoir, the dam and the river below it. East of its centre line only what
  // the water needs: the reservoir and its shore where the land was raised to hold it, the dam's abutment,
  // and below the dam the river's own bed. The gorge's east wall above the water, and all the land east of
  // it, stay as earlier phases made them (tests/fixtures/east-rim.json).
  const rd = x - ravineX(z);
  if (z < Z.river.sink + 14 && rd > -32) {
    if (z >= D.z + 26) { if (rd < 6) return true; }
    else if (rd < 6) return true;
    else if (rd < 28 && z > 150 && (z > D.z - 8 || outsideHeight(x, z) <= D.water + 2)) return true;
  }
  if (onDamRoad(x, z, 6)) return true;
  if (x >= D.x1) return false;
  if (onAvenue(x, z, 7) || onFarRoad(x, z, 5) || onMineTrail(x, z - 3) || onMineTrail(x, z + 3) || onMineTrail(x, z)) return true;
  const box = (b: { x0: number; x1: number; z0: number; z1: number }, m: number) => x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m;
  return box(Z.control, 5) || box({ x0: A.x, x1: P.x1, z0: D.z, z1: P.z1 }, 6) || box(S, 7) || box(F, 7) || box(Y, 5)
    || box({ x0: G.x0, x1: M.headX + 4, z0: Math.min(G.z0, M.drift.z0), z1: G.z1 }, 6)
    || box({ x0: Y.tracks[0] - 3, x1: Y.tracks[1] + 4, z0: Y.z1, z1: 1036 }, 1);
}

export function buildZone3(col: Uint16Array, x0: number, z0: number): void {
  if (x0 > 815 || x0 + CS < 480 || z0 > 1045 || z0 + CS < 150) return;
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
  const r = (x: number, y: number, z: number, k = 0) => rand3(x, y + k * 41, z, SEED + 110);
  const lampPost = (x: number, z: number, h = 4, lamp = 'arc_lamp') => {
    const g = outsideHeight(x, z);
    for (let y = g; y < g + h; y++) put(x, y, z, 'fence_post');
    put(x, g + h, z, lamp);
  };
  /** A ceiling lamp on its rod: the lantern at y, hung from the roof at `roof`. */
  const hang = (x: number, y: number, z: number, roof: number) => { put(x, y, z, 'lantern'); for (let yy = y + 1; yy < roof; yy++) put(x, yy, z, 'fence_post'); };
  const asphalt = (x: number, y: number, z: number, k: number) => { const roll = r(x, k, z); put(x, y, z, roll < 0.1 ? 'gravel' : roll < 0.14 ? 'dirt' : 'road'); };
  /** A shed: walls, a roof of tin, an earth floor of concrete, hollow. `open(x, y, z)` says where a wall is left out. */
  const shed = (b: { x0: number; x1: number; z0: number; z1: number }, floor: number, high: number, wall: string, open: (x: number, y: number, z: number) => boolean, split = -1) => {
    for (let z = b.z0; z < b.z1; z++) for (let x = b.x0; x < b.x1; x++) {
      // `split`: a wall right across at this z, parting the lit half from the dark one (no way through: each has its own door).
      const edge = x === b.x0 || x === b.x1 - 1 || z === b.z0 || z === b.z1 - 1 || z === split;
      for (let y = Math.min(outsideHeight(x, z), floor) - 1; y < floor; y++) put(x, y, z, 'concrete');
      for (let y = floor; y < floor + high; y++) put(x, y, z, edge && !open(x, y - floor, z) ? wall : AIR);
      put(x, floor + high, z, 'shed_roof'); // a roof that keeps the daylight out (the thin tin sheet lets it through)
    }
  };

  // ---- The reservoir, the river below the dam, and the dam itself.
  if (x0 + CS > 560 && x0 < 720 && z0 < Z.river.sink + 12) {
    for (let z = Math.max(z0, 150); z < Math.min(z0 + CS, Z.river.sink + 10); z++) for (let x = Math.max(x0, 560); x < Math.min(x0 + CS, 720); x++) {
      const g = outsideHeight(x, z);
      if (z < PAR_N) {
        if (inReservoir(x, z)) for (let y = g; y < D.water; y++) put(x, y, z, WATER);
        continue;
      }
      const river = riverBelowDam(x, z);
      if (river === 'pool') { put(x, g - 3, z, 'gravel'); put(x, g - 2, z, WATER); put(x, g - 1, z, WATER); }
      else if (river === 'stream') { put(x, g - 2, z, 'gravel'); put(x, g - 1, z, WATER); }
      else if (river === 'bed') put(x, g - 1, z, r(x, 1, z) < 0.6 ? 'gravel' : 'mud');
    }
  }
  if (near(D.x0, D.x1, PAR_N, PAR_S + 12, 2)) {
    const top = D.crest - 1; // the deck's own block
    for (let x = D.x0; x < D.x1; x++) {
      const chute = Math.abs(x - D.spill) <= 2;
      for (let z = PAR_N; z <= PAR_S + 11; z++) {
        // The body under the deck, then the downstream face stepping out as it goes down (not in the spillway's chute).
        const step = z - PAR_S;
        if (step > 0 && chute) continue;
        // West of the gorge's rim line the face does not step: it stands to the crest's height, a wing wall,
        // so the steps end against it and are no ledge to walk across to the far bank on (docs/REVIEW.md, N3b).
        const cap = step <= 0 || x <= westRimX(z) ? top : top - STEP_RISE * step;
        const g = outsideHeight(x, z);
        for (let y = g - 1; y <= cap; y++) put(x, y, z, 'concrete');
        if (step > 0) continue;
        const deck = z >= DECK_Z0 && z <= DECK_Z1;
        if (deck) { clear(x, D.crest, D.crest + 6, z); if (r(x, 2, z) < 0.08) put(x, top, z, 'gravel'); }
        else { put(x, D.crest, z, 'dam_parapet'); clear(x, D.crest + 1, D.crest + 6, z); }
      }
      // The spillway: the reservoir runs out through the dam under the deck and falls down its face.
      if (chute) {
        for (let z = PAR_N; z <= PAR_S; z++) { put(x, D.water - 2, z, WATER); put(x, D.water - 1, z, WATER); for (let y = D.water; y < top; y++) put(x, y, z, AIR); }
        const foot = outsideHeight(x, PAR_S + 1);
        for (let y = foot - 2; y < D.water; y++) put(x, y, PAR_S + 1, y < foot ? WATER : FALLING_WATER);
      }
      // A lamp every six metres, on the parapet, either side in turn: the deck is lit from end to end.
      if ((x - D.x0) % 6 === 3 || x === D.x1 - 1) {
        const pz = Math.floor((x - D.x0) / 6) % 2 === 0 ? PAR_N : PAR_S;
        put(x, D.crest, pz, 'concrete');
        put(x, D.crest + 1, pz, 'fence_post');
        put(x, D.crest + 2, pz, 'arc_lamp');
      }
    }
  }

  // ---- The dam road: cracked asphalt from the highway to the dam, lit, signed at the junction.
  const hxJ = highwayX(D.z), jx = Math.floor(hxJ) - ZONE2.highway.halfWidth;
  if (near(D.x1, jx + 8, D.z - 8, D.z + 10, 4)) {
    for (let x = Math.max(x0, D.x1); x < Math.min(x0 + CS, Math.ceil(hxJ)); x++) for (let z = DECK_Z0; z <= DECK_Z1; z++) {
      if (!onDamRoad(x, z) || get(x, outsideHeight(x, z) - 1, z) === blockId('road_line')) continue;
      if (Math.abs(x + 0.5 - highwayX(z)) < ZONE2.highway.halfWidth) continue; // the highway keeps its own asphalt
      const y = damRoadHeight(x);
      asphalt(x, y - 1, z, 3);
      put(x, y - 2, z, 'gravel');
      clear(x, y, y + 5, z);
    }
    for (let x = D.x1 + 10; x < jx - 6; x += 24) lampPost(x, ((x - D.x1) / 24) % 2 < 1 ? PAR_N : PAR_S, 4, 'street_light'); // the faction's side: their lamps
    // The sign on the highway's west shoulder, facing those who come up from the south, lit.
    {
      const sz = D.z + HALF + 2, sx = Math.floor(highwayX(sz)) - ZONE2.highway.halfWidth - 3, g = outsideHeight(sx, sz);
      for (const px of [sx - 1, sx + 2]) { for (let y = g; y < g + 4; y++) put(px, y, sz, 'fence_post'); put(px, g + 4, sz, 'lantern'); }
      put(sx, g + 3, sz, 'dam_sign@south'); put(sx + 1, g + 3, sz, 'dam_sign@south');
      put(sx, g + 2, sz, 'dam_sign@south'); put(sx + 1, g + 2, sz, 'dam_sign@south');
    }
    // The faction's barricade, short of the dam: a chicane to walk round, their flag, the warning.
    {
      const bx = Z.barricade.x, y = damRoadHeight(bx);
      put(bx, y, DECK_Z0, 'concrete_barrier@east'); put(bx, y, DECK_Z0 + 1, 'concrete_barrier@east');
      put(bx + 3, y, DECK_Z1, 'concrete_barrier@east'); put(bx + 3, y, DECK_Z1 - 1, 'concrete_barrier@east');
      for (const [sx, sz] of [[bx, PAR_N], [bx + 1, PAR_N], [bx + 3, PAR_S], [bx + 2, PAR_S]]) { const g = outsideHeight(sx, sz); put(sx, g, sz, 'sandbags'); }
      const fx = bx + 5, fz = PAR_N - 1, g = outsideHeight(fx, fz);
      for (let yy = g; yy < g + 5; yy++) put(fx, yy, fz, 'fence_post');
      put(fx, g + 1, fz + 1, 'cenizos_board@east'); put(fx, g + 2, fz + 1, 'cenizos_board@east');
      put(fx + 1, g + 3, fz, 'faction_flag@east'); put(fx + 1, g + 4, fz, 'faction_flag@east');
      put(fx, g + 5, fz, 'lantern');
    }
  }

  // ---- West of the gorge.
  if (x0 > D.x0 + 2) return;

  // The crest road and the avenue: asphalt four wide, lamp posts down it (the dam's own power, eight years on).
  if (near(A.x - 4, D.x0, D.z - 4, A.z1, 3)) {
    for (let z = Math.max(z0, D.z - 4); z < Math.min(z0 + CS, A.z1); z++) for (let x = Math.max(x0, A.x - 3); x < Math.min(x0 + CS, D.x0); x++) {
      if (!onAvenue(x, z)) continue;
      const y = outsideHeight(x, z);
      asphalt(x, y - 1, z, 4);
      put(x, y - 2, z, 'gravel');
      clear(x, y, y + 6, z);
    }
    // A pale stain in the road where the first of them has stood a long time.
    for (const [dx, dz] of [[0, 0], [-1, 0], [0, 1], [-1, -1]]) { const sx = Math.floor(Z.firstAshen.x) + dx, sz = Math.floor(Z.firstAshen.z) + dz; put(sx, outsideHeight(sx, sz), sz, 'pale_stain'); }
  }

  // The control house, on the crest road's north side at the dam's end: the engineer's desk and his logbook.
  const c = Z.control;
  if (near(c.x0, c.x1, c.z0, c.z1 + 2, 3)) {
    const door = c.x0 + 3;
    for (let z = c.z0 - 1; z < c.z1; z++) for (let x = c.x0 - 1; x <= c.x1; x++) clear(x, CF, CF + 7, z);
    for (let z = c.z0; z < c.z1; z++) for (let x = c.x0; x < c.x1; x++) {
      const edge = x === c.x0 || x === c.x1 - 1 || z === c.z0 || z === c.z1 - 1;
      put(x, CF - 1, z, 'concrete');
      for (let y = CF; y < CF + 4; y++) {
        const isDoor = z === c.z1 - 1 && (x === door || x === door + 1) && y < CF + 3;
        const window = (z === c.z0 || x === c.x1 - 1) && (y === CF + 1 || y === CF + 2) && x > c.x0 + 1 && x < c.x1 - 1 && z < c.z1 - 2;
        put(x, y, z, !edge || isDoor ? AIR : window ? 'glass' : 'concrete');
      }
      put(x, CF + 4, z, 'concrete');
    }
    put(...LOGBOOK_DESK, 'logbook_desk');
    put(LOGBOOK_DESK[0], CF, LOGBOOK_DESK[2] + 1, 'chair');
    for (let x = c.x0 + 1; x < c.x0 + 4; x++) { put(x, CF, c.z0 + 1, 'gauge_panel@south'); put(x, CF + 1, c.z0 + 1, 'gauge_panel@south'); }
    put(c.x0 + 4, CF + 3, c.z0 + 3, 'lantern');
    put(door - 1, CF + 3, c.z1, 'lantern'); put(door + 2, CF + 3, c.z1, 'lantern');
  }

  // The powerhouse: the turbine hall. North half lit (the door, one turbine still turning, what to take);
  // south half dark behind an open roller door.
  if (near(P.x0 - 4, P.x1 + 40, D.z, P.z1, 3)) {
    for (let z = P.z0 - 2; z < P.z1 + 2; z++) for (let x = A.x + HALF; x < P.x0; x++) { const g = outsideHeight(x, z); if (g === PF) { clear(x, PF, PF + 8, z); put(x, PF - 1, z, r(x, 5, z) < 0.5 ? 'gravel' : 'concrete'); } }
    shed(P, PF, 7, 'concrete', (x, y, z) => x === P.x0 && ((z >= P.door && z < P.door + 2 && y < 3) || (z >= P.bay && z < P.bay + 4 && y < 4)), POWER_SPLIT);
    // High windows on the avenue side of the lit half.
    for (let z = P.z0 + 2; z < POWER_SPLIT - 1; z += 2) if (z < P.door - 1 || z > P.door + 2) put(P.x0, PF + 4, z, 'glass');
    for (const z of [P.door - 1, P.door, P.door + 1, P.door + 2]) put(P.x0 - 1, PF + 4, z, z === P.door - 1 || z === P.door + 2 ? 'lantern' : 'powerhouse_sign@west');
    for (let z = P.z0 + 2; z < POWER_SPLIT - 1; z += 3) for (let x = P.x0 + 2; x < P.x1 - 1; x += 4) if (get(x, PF + 4, z) === AIR || get(x, PF + 4, z) === -1) hang(x, PF + 4, z, PF + 7);
    // The turbines along the gorge side: the first still turning, two seized, in the dark.
    for (const [tz, live] of [[LIVE_TURBINE[2], true], [P.z0 + 8, false], [POWER_SPLIT + 2, false]] as const)
      for (let dz = 0; dz < 3; dz++) for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) put(LIVE_TURBINE[0] + dx, PF + dy, tz + dz, live ? 'turbine' : 'turbine_dead');
    put(...PARTS_CRATE, 'stock_crate');
    put(...TOOL_LOCKER, 'steel_locker@south');
    for (const cab of CONTROL_CABINETS) { put(...cab, 'control_cabinet@south'); put(cab[0], PF + 1, cab[2], 'gauge_panel@south'); }
    put(TOOL_LOCKER[0], PF + 1, TOOL_LOCKER[2], 'gauge_panel@south');
    // Ash where they stand, at the dark end.
    for (const [dx, dz] of [[0, 0], [1, -1], [0, 1], [-1, 0]]) put(Math.floor(Z.nests[0].x) + dx, PF, Math.floor(Z.nests[0].z) + dz, 'pale_stain');
    // The penstocks: two great pipes down the bank from the dam into the hall's north wall.
    for (const px of [P.x1 - 6, P.x1 - 3]) for (let z = PAR_S + 1; z < P.z0; z++) { const g = outsideHeight(px, z); put(px, g, z, 'penstock'); put(px, g + 1, z, 'penstock'); clear(px, g + 2, g + 5, z); }
    // A thrust block between the pipes where they enter the hall. The strip between them was a dead end: the
    // pipes either side, the hall's wall ahead, the bank's last steps behind (found by the walk test, N3).
    for (let z = P.z0 - 3; z < P.z0; z++) for (let x = P.x1 - 5; x < P.x1 - 3; x++) put(x, outsideHeight(x, z), z, 'concrete');
    // The tailrace: out of the hall's gorge side and down the bank to the river.
    {
      // Water never runs uphill: where the bank stands above the channel, the channel is cut through it.
      const tz = LIVE_TURBINE[2] + 1, level = PF - 1, rim = westRimX(tz);
      let prev = PF;
      for (let x = P.x1; x < Math.round(ravineX(tz)) - 2; x++) {
        const g = outsideHeight(x, tz);
        if (x <= rim && (g - 1 < level || x >= rim - 1)) {
          // From where the bank falls below the channel out to the gorge's rim, the water runs in a concrete
          // culvert and pours from its mouth in the cliff. Open water down the bank was a ladder: whoever got
          // to the gorge's floor could swim up the fall onto the far bank (docs/REVIEW.md, N3b).
          for (const z of [tz - 1, tz, tz + 1]) for (let y = Math.min(outsideHeight(x, z), level) - 1; y <= level + 2; y++) put(x, y, z, z === tz && y === level ? WATER : 'concrete');
          prev = level + 1;
          continue;
        }
        if (g - 1 >= level) { put(x, level, tz, WATER); put(x, level - 1, tz, 'concrete'); clear(x, level + 1, g + 3, tz); }
        else if (g > 42) for (let y = g; y <= Math.min(prev - 1, level); y++) put(x, y, tz, FALLING_WATER);
        else put(x, g - 1, tz, WATER);
        prev = Math.min(g, level + 1);
      }
    }
  }

  // The machine shop: lathes and steel by the door, under the lamps; the back dark behind its roller door.
  if (near(S.x0 - 4, S.x1, S.z0, S.z1, 3)) {
    for (let z = S.z0 - 2; z < S.z1 + 2; z++) for (let x = A.x + HALF; x < S.x0; x++) if (outsideHeight(x, z) === SF) { clear(x, SF, SF + 8, z); put(x, SF - 1, z, r(x, 6, z) < 0.5 ? 'gravel' : 'concrete'); }
    shed(S, SF, 6, 'cinder_block', (x, y, z) => x === S.x0 && ((z >= S.door && z < S.door + 2 && y < 3) || (z >= S.bay && z < S.bay + 4 && y < 4)), SHOP_SPLIT);
    for (let z = S.z0 + 2; z < SHOP_SPLIT - 1; z += 2) if (z < S.door - 1 || z > S.door + 2) put(S.x0, SF + 4, z, 'glass');
    for (const z of [S.door - 1, S.door, S.door + 1, S.door + 2]) put(S.x0 - 1, SF + 4, z, z === S.door - 1 || z === S.door + 2 ? 'lantern' : 'taller_sign@west');
    for (let z = S.z0 + 2; z < SHOP_SPLIT - 1; z += 3) for (let x = S.x0 + 2; x < S.x1 - 1; x += 4) hang(x, SF + 4, z, SF + 6);
    for (const l of OLD_LATHES) put(...l, 'old_lathe');
    for (const k of STEEL_RACKS) put(...k, 'steel_rack');
    put(...SHOP_CRATE, 'stock_crate');
    for (const [dx, dz] of [[9, 14], [12, 17], [5, 17], [14, 12]]) put(S.x0 + dx, SF, S.z0 + dz, r(dx, 7, dz) < 0.5 ? 'oil_drum' : 'shop_shelf');
    for (const [dx, dz] of [[0, 0], [1, -1], [0, 1], [-1, 0]]) put(Math.floor(Z.nests[1].x) + dx, SF, Math.floor(Z.nests[1].z) + dz, 'pale_stain');
  }

  // The foundry: the crucible by the door, under the lamps; the back dark.
  if (near(F.x0, F.x1 + 4, F.z0, F.z1, 3)) {
    for (let z = F.z0 - 2; z < F.z1 + 2; z++) for (let x = F.x1; x < A.x - HALF; x++) if (outsideHeight(x, z) === FF) { clear(x, FF, FF + 8, z); put(x, FF - 1, z, r(x, 8, z) < 0.5 ? 'gravel' : 'concrete'); }
    shed(F, FF, 6, 'cinder_block', (x, y, z) => x === F.x1 - 1 && ((z >= F.door && z < F.door + 2 && y < 3) || (z >= F.bay && z < F.bay + 4 && y < 4)), FOUNDRY_SPLIT);
    for (let z = F.z0 + 2; z < FOUNDRY_SPLIT - 1; z += 2) if (z < F.door - 1 || z > F.door + 2) put(F.x1 - 1, FF + 4, z, 'glass');
    for (const z of [F.door - 1, F.door, F.door + 1, F.door + 2]) put(F.x1, FF + 4, z, z === F.door - 1 || z === F.door + 2 ? 'lantern' : 'fundicion_sign@east');
    for (let z = F.z0 + 2; z < FOUNDRY_SPLIT - 1; z += 3) for (let x = F.x0 + 2; x < F.x1 - 1; x += 4) hang(x, FF + 4, z, FF + 6);
    put(...FOUNDRY_CRUCIBLE, 'foundry_crucible');
    // The old furnace's shell and stacks of firebrick.
    for (let dz = 0; dz < 3; dz++) for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) if (!(dx === 1 && dz === 2 && dy < 2)) put(F.x0 + 2 + dx, FF + dy, F.z0 + 1 + dz, 'firebrick');
    for (const [dx, dz, h] of [[8, 1, 2], [9, 1, 1], [10, 1, 2]]) for (let dy = 0; dy < h; dy++) put(F.x0 + dx, FF + dy, F.z0 + dz, 'firebrick');
    for (const [dx, dz] of [[3, 12], [7, 17], [12, 18]]) put(F.x0 + dx, FF, F.z0 + dz, 'oil_drum');
    for (const [dx, dz] of [[0, 0], [1, 1], [0, -1]]) put(Math.floor(Z.nests[2].x) + dx, FF, Math.floor(Z.nests[2].z) + dz, 'pale_stain');
  }

  // The rail yard: two tracks on ballast, the engine shed over the west one, the signal box, the stock.
  if (near(Y.x0, Y.x1, Y.z0, 1036, 4)) {
    // The yard's ground: ballast and cinders, nothing growing on it.
    for (let z = Math.max(z0, Y.z0); z < Math.min(z0 + CS, Y.z1); z++) for (let x = Math.max(x0, Y.x0); x < Math.min(x0 + CS, Y.x1); x++) {
      if (onMineTrail(x, z)) continue;
      const g = outsideHeight(x, z), roll = r(x, 11, z);
      put(x, g - 1, z, roll < 0.7 ? 'gravel' : roll < 0.85 ? 'dirt' : 'dead_soil');
      clear(x, g, g + 3, z);
    }
    for (let z = Math.max(z0, Y.z0 + 2); z < Math.min(z0 + CS, 1034); z++) for (const t of Y.tracks) {
      for (let x = t - 1; x <= t + 1; x++) {
        const g = outsideHeight(x, z);
        if (onFarRoad(x, z)) { if (x === t) put(x, g, z, 'rail'); continue; }
        put(x, g - 1, z, 'gravel');
        clear(x, g, g + 5, z);
        if (x === t) put(x, g, z, 'rail');
      }
    }
    for (const t of Y.tracks) { put(t, YF, Y.z0 + 2, 'cinder_block'); put(t, YF + 1, Y.z0 + 2, 'cinder_block'); } // buffer stops
    // The engine shed: open at its south end, dark at the back.
    shed(E, YF, 6, 'cinder_block', (x, y, z) => z === E.z1 - 1 && Math.abs(x - TB) <= 2 && y < 5);
    for (let z = E.z0 + 1; z < E.z1; z++) { put(TB, YF - 1, z, 'gravel'); put(TB, YF, z, 'rail'); }
    put(TB, YF, E.z0 + 1, 'cinder_block'); // the buffer stop at the back of the shed
    for (const [dx, dz] of [[0, 0], [1, -1], [-1, 1], [0, 1]]) { const sx = Math.floor(Z.nests[3].x) + dx, sz = Math.floor(Z.nests[3].z) + dz; if (sx !== TB) put(sx, YF, sz, 'pale_stain'); }
    // The signal box: a brick base, a glazed cabin over it, a mast with a red light.
    const sb = Z.signalBox;
    for (let z = sb.z0; z < sb.z1; z++) for (let x = sb.x0; x < sb.x1; x++) {
      const edge = x === sb.x0 || x === sb.x1 - 1 || z === sb.z0 || z === sb.z1 - 1;
      put(x, YF - 1, z, 'concrete');
      for (let y = YF; y < YF + 4; y++) put(x, y, z, edge && !(x === sb.x1 - 1 && z === sb.z0 + 2 && y < YF + 2) ? 'stone_bricks' : AIR);
      put(x, YF + 4, z, 'planks');
      for (let y = YF + 5; y < YF + 7; y++) put(x, y, z, edge ? 'glass' : AIR);
      put(x, YF + 7, z, 'shed_roof');
    }
    // The way up: an outside stair along the south wall to a door in the cabin (a place to look the yard over from).
    for (let k = 0; k < 5; k++) { const sx = sb.x1 - k; for (let y = Math.min(outsideHeight(sx, sb.z1), YF) - 1; y <= YF + k; y++) put(sx, y, sb.z1, 'planks'); clear(sx, YF + k + 1, YF + k + 4, sb.z1); }
    put(sb.x0 + 1, YF + 5, sb.z1 - 1, AIR); put(sb.x0 + 1, YF + 6, sb.z1 - 1, AIR);
    put(sb.x0 + 2, YF + 5, sb.z0 + 2, 'lantern');
    for (let y = YF; y < YF + sb.height; y++) put(sb.x0 - 1, y, sb.z1, 'fence_post');
    put(sb.x0 - 1, YF + sb.height, sb.z1, 'red_beacon');
    put(sb.x1, YF + 3, sb.z0 + 1, 'lantern');
    // Lamp posts down the platform, between the tracks and the avenue.
    for (let z = Y.z0 + 16; z < Y.z1; z += 20) { for (let y = YF; y < YF + 4; y++) put(TA + 5, y, z, 'fence_post'); put(TA + 5, YF + 4, z, 'arc_lamp'); }
    // The stock.
    for (const s of ROLLING) {
      const t = Y.tracks[s.track];
      for (let z = s.z0; z < s.z1; z++) for (let x = t - 1; x <= t + 1; x++) {
        const end = z === s.z0 + 1 || z === s.z1 - 2, side = x !== t, mid = (s.z0 + s.z1) >> 1;
        if (side && end) put(x, YF, z, 'truck_wheel');
        if (s.kind === 'loco') {
          for (let y = YF + 1; y < YF + 4; y++) put(x, y, z, 'loco_body');
          if (z >= s.z1 - 4) put(x, YF + 4, z, z === s.z1 - 3 && side ? 'glass' : 'loco_body');
          else if (!side && z % 3 === 0) put(x, YF + 4, z, 'stove_pipe');
        } else if (s.kind === 'hopper') {
          put(x, YF + 1, z, 'wagon_body');
          put(x, YF + 2, z, side || z === s.z0 || z === s.z1 - 1 ? 'wagon_body' : 'coal_heap');
          if (z > s.z0 && z < s.z1 - 1) put(x, YF + 3, z, 'coal_heap');
        } else if (s.kind === 'flat') {
          put(x, YF + 1, z, 'wagon_body');
          if (Math.abs(z - mid) <= 2 && z !== mid + 2) put(x, YF + 2, z, 'plate_stack');
        } else {
          const doorway = x === t + 1 && Math.abs(z - mid) <= 1;
          for (let y = YF + 1; y < YF + 5; y++) put(x, y, z, y === YF + 1 || y === YF + 4 || (side && !doorway) || z === s.z0 || z === s.z1 - 1 ? 'wagon_body' : AIR);
        }
      }
    }
    put(...BOXCAR_CRATE, 'stock_crate');
    // A lamp by the boxcar's open door and one by the coal wagon: nothing to take stands in the dark at night.
    for (const [lx, lz] of YARD_LAMPS) { for (let y = YF; y < YF + 3; y++) put(lx, y, lz, 'fence_post'); put(lx, YF + 3, lz, 'arc_lamp'); }
    // The level crossing where the old road meets the tracks: a cross and a red light each side.
    for (const [lx, lz] of CROSSING_LIGHTS) { const g = outsideHeight(lx, lz); put(lx, g, lz, 'fence_post'); put(lx, g + 1, lz, 'fence_post'); put(lx, g + 2, lz, 'red_beacon'); put(lx, g + 3, lz, 'crossing_sign'); }
  }

  // The mine: a lit trail west across the yard, a timbered head, a lit decline to the gallery, a dark drift.
  if (near(G.x0 - 2, A.x, Math.min(M.drift.z0, G.z0) - 2, G.z1 + 2, 4)) {
    for (let x = M.headX; x < A.x - HALF; x++) for (let z = M.z - 1; z <= M.z + 1; z++) {
      if (!onMineTrail(x, z)) continue;
      const g = outsideHeight(x, z), rail = Y.tracks.includes(x);
      if (!rail) { clear(x, g, g + 5, z); put(x, g - 1, z, r(x, 9, z) < 0.4 ? 'gravel' : 'dirt'); }
      if (z === M.z + 1 && x % 12 === 6 && Math.abs(x - TA) > 2 && Math.abs(x - TB) > 2) lampPost(x, z + 1, 2, 'lantern');
    }
    // The decline: three wide, four high, down one a block west; a timber set and a lamp every four.
    for (let k = 0; k <= M.depth; k++) {
      const x = M.headX - k, fy = YF - Math.min(k + 1, M.depth);
      for (let z = M.z - 2; z <= M.z + 2; z++) {
        const side = Math.abs(z - M.z) === 2;
        for (let y = fy - 1; y < fy + 5; y++) {
          if (side || y === fy - 1 || y === fy + 4) put(x, y, z, y === fy - 1 ? 'gravel' : 'limestone');
          else put(x, y, z, AIR);
        }
        if (!side && fy + 4 >= outsideHeight(x, z) - 1) clear(x, fy + 4, outsideHeight(x, z) + 2, z); // an open cut where it starts
      }
      if (k % 4 === 0) {
        for (let y = fy; y < fy + 4; y++) { put(x, y, M.z - 2, 'log'); put(x, y, M.z + 2, 'log'); }
        for (let z = M.z - 2; z <= M.z + 2; z++) put(x, fy + 4, z, 'log');
        put(x, fy + 3, M.z - 1, 'lantern');
      }
    }
    for (let y = YF; y < YF + 4; y++) { put(M.headX + 1, y, M.z - 2, 'log'); put(M.headX + 1, y, M.z + 2, 'log'); }
    for (let z = M.z - 2; z <= M.z + 2; z++) put(M.headX + 1, YF + 4, z, 'log');
    put(M.headX + 1, YF + 5, M.z, 'mina_sign@east');
    lampPost(M.headX + 2, M.z - 3, 2, 'lantern'); lampPost(M.headX + 2, M.z + 3, 2, 'lantern');
    // The gallery: rough walls thick with iron and coal, lit by the miners' lamps.
    const gf = GALLERY_FLOOR;
    for (let z = G.z0 - 1; z <= G.z1; z++) for (let x = G.x0 - 1; x <= G.x1; x++) for (let y = gf - 1; y <= gf + 5; y++) {
      const inside = x >= G.x0 && x < G.x1 && z >= G.z0 && z < G.z1 && y >= gf && y < gf + 5;
      if (inside) { put(x, y, z, AIR); continue; }
      if (x === G.x1 && Math.abs(z - M.z) <= 1 && y >= gf && y < gf + 4) { put(x, y, z, AIR); continue; } // the decline comes in
      if (z === G.z0 - 1 && Math.abs(x - M.drift.x) <= 1 && y >= gf && y < gf + 3) { put(x, y, z, AIR); continue; } // the drift goes off
      if (y === gf - 1) { put(x, y, z, r(x, y, z) < 0.5 ? 'gravel' : 'cobble'); continue; }
      const roll = r(x, y, z, 3);
      put(x, y, z, roll < 0.34 ? 'iron_ore' : roll < 0.64 ? 'coal_ore' : 'limestone');
    }
    for (const [lx, lz] of [[G.x0, G.z0 + 2], [G.x1 - 1, G.z0 + 2], [G.x0, G.z1 - 3], [G.x1 - 1, G.z1 - 3], [(G.x0 + G.x1) >> 1, G.z1 - 1], [((G.x0 + G.x1) >> 1) + 3, G.z0]]) put(lx, gf, lz, 'lantern');
    put((G.x0 + G.x1) >> 1, gf + 4, M.z, 'lantern');
    // The drift: three wide, three high, unlit, north off the gallery's far end. Nothing in it but ash.
    const dr = M.drift;
    for (let z = dr.z0 - 1; z < dr.z1 - 1; z++) for (let x = dr.x - 2; x <= dr.x + 2; x++) for (let y = gf - 1; y <= gf + 3; y++) {
      const inside = Math.abs(x - dr.x) <= 1 && z >= dr.z0 && y >= gf && y < gf + 3;
      if (inside) put(x, y, z, AIR);
      else put(x, y, z, y === gf - 1 ? 'gravel' : r(x, y, z, 4) < 0.2 ? 'coal_ore' : 'limestone');
    }
    for (const [dx, dz] of [[0, 0], [1, -1], [0, 1], [-1, 0]]) put(Math.floor(Z.nests[4].x) + dx, gf, Math.floor(Z.nests[4].z) + dz, 'pale_stain');
  }

  // The old road's far side: asphalt again from the bridge's abutment past the body to the crossing, lit; then gone.
  const b = ZONE1FAR.bridge;
  if (near(Z.farRoad.west - 3, b.far, b.z - 10, b.z + 6, 3)) {
    for (let x = Math.max(x0, Z.farRoad.west); x < Math.min(x0 + CS, b.far - 3); x++) for (let z = Math.floor(farRoadZ(x)) - 3; z <= Math.floor(farRoadZ(x)) + 3; z++) {
      if (!onFarRoad(x, z) || onAvenue(x, z)) continue;
      const y = outsideHeight(x, z);
      asphalt(x, y - 1, z, 10);
      clear(x, y, y + 5, z);
      if (Y.tracks.includes(x)) put(x, y, z, 'rail');
    }
    for (let lx = Z.farRoad.west + 4; lx < b.far - 4; lx += LAMP_EVERY) { if (Y.tracks.some((t) => Math.abs(lx - t) < 2) || CROSSING_LIGHTS.some(([cx]) => Math.abs(cx - lx) < 2)) continue;
      // Each lamp two above the road beside it, whatever the verge does.
      const lz = Math.round(farRoadZ(lx)) + (Math.floor(lx / LAMP_EVERY) % 2 ? -ROAD.halfWidth - 1 : ROAD.halfWidth), g = outsideHeight(lx, lz), top = outsideHeight(lx, Math.floor(farRoadZ(lx))) + 2;
      for (let y = Math.min(g, top - 1); y < top; y++) put(lx, y, lz, 'fence_post');
      put(lx, top, lz, 'arc_lamp');
    }
    // Where it ends: a barrier, and the forest beyond.
    for (let z = Math.floor(farRoadZ(Z.farRoad.west)) - 2; z <= Math.floor(farRoadZ(Z.farRoad.west)) + 1; z++) put(Z.farRoad.west - 1, outsideHeight(Z.farRoad.west - 1, z), z, 'concrete_barrier@east');
  }

  // Last, so nothing built above clears them away: the avenue's and the crest road's lamps.
  if (near(A.x - 4, D.x0, D.z - 4, A.z1, 3)) {
    // Where the avenue comes down from the crest above the powerhouse's forecourt, the ground beside it lies
    // two blocks and more below: a retaining wall with a parapet on it, so there is no drop to walk off.
    for (let z = D.z + HALF; z < P.door; z++) for (const px of [A.x - HALF - 1, A.x + HALF]) {
      const road = outsideHeight(A.x, z), g = outsideHeight(px, z);
      if (g > road - 2) continue;
      for (let y = g; y < road; y++) put(px, y, z, 'concrete');
      put(px, road, z, 'dam_parapet');
    }
    // A lamp every eight metres, either side in turn, at head height: their pools meet, so the whole way is lit
    // (and anything that steps into it is in the light).
    for (let z = D.z + 6; z < A.z1 - 2; z += LAMP_EVERY) {
      // Each lamp two above the road beside it, whatever the verge does.
      const px = ((z - D.z - 6) / LAMP_EVERY) % 2 < 1 ? A.x - HALF - 1 : A.x + HALF, g = outsideHeight(px, z), top = outsideHeight(A.x, z) + 2;
      for (let y = Math.min(g, top - 1); y < top; y++) put(px, y, z, 'fence_post');
      put(px, top, z, 'arc_lamp');
    }
    lampPost(A.x - HALF - 1, D.z - HALF - 1, 2); // the bend
    // The crest road's lamps, either side in turn; never in the control house's front wall (one used to stand in it, beside the door).
    for (let x = A.x + 6; x < D.x0 - 2; x += LAMP_EVERY) {
      const north = ((x - A.x - 6) / LAMP_EVERY) % 2 < 1 && !(x >= Z.control.x0 - 1 && x <= Z.control.x1);
      lampPost(x, north ? PAR_N : PAR_S, 2);
    }
  }
}
