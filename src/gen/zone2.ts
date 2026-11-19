// Zone-2, faction territory, in blocks (docs/PHASE6.md): the old highway north from the hunting camp, the
// border's barriers, the strip mall and the telephone exchange with their salvage, the radiation rings and
// their signs, the hot-spring cave, and Las Cruces, the faction's walled compound. Pure, like the rest of the
// generator. Every position comes from ZONE2 in layout.ts.

import { CS, WORLD_Y } from '../world/constants.ts';
import { blockId, AIR } from '../world/blocks.ts';
import { rand3 } from '../core/noise.ts';
import { SEED, ZONE2, ZONE1FAR, highwayX, highwayHeight, onHighway, onCaveTrail, outsideHeight, zone2Floor } from './layout.ts';
import { CAMP_MARKER } from './zone1far.ts';

const ci = (x: number, y: number, z: number) => (y << 10) | (z << 5) | x;
const Z = ZONE2;
const C = Z.compound;

/** The compound's gate: its middle column, at the highway's end, in the south wall. */
export const GATE_X = Math.floor(highwayX(C.z1 - 1));
export const COMPOUND_FLOOR = zone2Floor.compound;
/** The two gate towers' platforms (a guard stands on each, watching the highway south): feet, and facing. */
export const TOWER_POSTS = [-1, 1].map((side) => ({
  x: GATE_X + side * (C.gateHalf + 3) + 0.5, y: COMPOUND_FLOOR + C.wall + 1, z: C.z1 - 1 + 0.5, yaw: Math.PI,
}));

const MF = zone2Floor.mall, EF = zone2Floor.exchange, KF = zone2Floor.cave;
const shop = (name: string) => Z.shops.find((s) => s.name === name)!;
const doorZ = (name: string) => Math.floor((shop(name).z0 + shop(name).z1) / 2);
/** Where the game's things stand (their contents are in src/gen/inheritance.ts). */
export const PHARMACY_COUNTER: [number, number, number] = [Z.mall.x0 + 5, MF, doorZ('farmacia') + 2];
export const PHARMACY_SHELF: [number, number, number] = [Z.mall.x1 - 2, MF, doorZ('farmacia') - 3];
export const HARDWARE_CRATE: [number, number, number] = [Z.mall.x1 - 2, MF, shop('ferreteria').z0 + 2];
export const DISPLAY_FRIDGES: [number, number, number][] = [0, 4, 8].map((k) => [Z.mall.x1 - 2, MF, shop('supermercado').z0 + 3 + k]);
export const CAR_BATTERIES: [number, number, number][] = [0, 1, 2, 3].map((k) => [Z.mall.x0 + 8, MF, shop('ferreteria').z0 + 5 + k]);
export const SERVER_RACKS: [number, number, number][] = [Z.exchange.x0 + 4, Z.exchange.x0 + 8].flatMap((x) => [0, 2, 4].map((k) => [x, EF, Z.exchange.z0 + 2 + k] as [number, number, number]));
export const UPS_CABINETS: [number, number, number][] = [0, 2, 4].map((k) => [Z.exchange.x0 + 2, EF, Z.exchange.split + 2 + k]);
export const LEAD_CASKET: [number, number, number] = [Z.hotspots[0].x, MF, Z.hotspots[0].z];
export const CAVE_FLOOR = KF - Z.cave.depth;
export const HOT_POOL: [number, number, number] = [Math.floor((Z.cave.cavern.x0 + Z.cave.cavern.x1) / 2), CAVE_FLOOR, Math.floor((Z.cave.cavern.z0 + Z.cave.cavern.z1) / 2)];
/** Where the vent's steam rises from the ground (for the steam plume). */
export const STEAM_AT: [number, number, number] = [HOT_POOL[0] + 0.5, 0, HOT_POOL[2] + 0.5];

/** Round Zone-2's places (with a margin), where caves don't cut and trees don't grow. */
export function zone2Place(x: number, z: number): boolean {
  if (onHighway(x, z, 5) || onCaveTrail(x, z) || onCaveTrail(x, z - 2) || onCaveTrail(x, z + 2)) return true;
  const box = (x0: number, x1: number, z0: number, z1: number, m: number) => x > x0 - m && x < x1 + m && z > z0 - m && z < z1 + m;
  const cv = Z.cave.cavern;
  return box(Z.lot.x0, Z.mall.x1, Z.mall.z0, Z.mall.z1, 6) || box(Z.exchange.x0 - 14, Z.exchange.x1, Z.exchange.z0, Z.exchange.z1, 6)
    || box(C.x0, C.x1, C.z0, C.z1, 8) || box(Z.cave.mouthX - 4, cv.x1, cv.z0, cv.z1, 5) || box(Z.cave.mouthX - 4, cv.x0, Z.cave.z - 4, Z.cave.z + 4, 3);
}

export function buildZone2(col: Uint16Array, x0: number, z0: number): void {
  if (x0 > 900 || x0 + CS < 740 || z0 > 965 || z0 + CS < 530) return;
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
  const r = (x: number, y: number, z: number, k = 0) => rand3(x, y + k * 37, z, SEED + 90);
  const lampPost = (x: number, z: number, h = 3, lamp = 'street_light') => {
    const g = outsideHeight(x, z);
    for (let y = g; y < g + h; y++) put(x, y, z, 'fence_post');
    put(x, g + h, z, lamp);
  };
  const H = Z.highway;

  // ---- The highway: old asphalt six wide, a dashed yellow centre line, lit every 32 m, a guard rail here and there.
  for (let z = Math.max(z0, H.z1); z < Math.min(z0 + CS, H.z0 + 1); z++) {
    const hx = highwayX(z), y = highwayHeight(z);
    for (let x = Math.max(x0, Math.floor(hx) - 5); x < Math.min(x0 + CS, Math.ceil(hx) + 5); x++) {
      if (!onHighway(x, z)) continue;
      const roll = r(x, 1, z), edge = Math.abs(x + 0.5 - hx) > H.halfWidth - 0.8;
      const centre = Math.abs(x + 0.5 - hx) < 0.5 && ((z % 8) + 8) % 8 < 4;
      put(x, y - 1, z, centre ? 'road_line' : roll < 0.05 || (edge && roll < 0.2) ? 'gravel' : roll < 0.08 ? 'forest_floor' : 'road');
      put(x, y - 2, z, 'gravel');
      clear(x, y, y + 5, z);
    }
    if (((z % 32) + 32) % 32 === 0 && z < H.z0 - 4) lampPost(Math.floor(hx + ((z >> 5) & 1 ? 1 : -1) * (H.halfWidth + 1.5)), z);
    // Guard-rail stubs on the shoulders, five long, every so often.
    if (r(0, 2, z >> 4) < 0.35 && (((z % 16) + 16) % 16) < 5 && z < 940) {
      const side = r(0, 3, z >> 4) < 0.5 ? -1 : 1, gx = Math.floor(hx + side * (H.halfWidth + 0.5));
      put(gx, outsideHeight(gx, z), z, 'guard_rail');
    }
  }
  // The sign at the camp's north edge, lit: CARRETERA 4 · LAS CRUCES. And a board under the camp's marker on the road.
  {
    const z = H.z0 - 2, sx = Math.floor(highwayX(z)) - H.halfWidth - 3, g = outsideHeight(sx, z);
    if (near(sx - 2, sx + 3, z - 2, z + 2)) {
      for (const x of [sx, sx + 1]) { for (let y = g; y < g + 3; y++) put(x - 1 + (x - sx) * 3, y, z, 'fence_post'); }
      put(sx, g + 3, z, 'highway_sign@south'); put(sx + 1, g + 3, z, 'highway_sign@south');
      put(sx - 1, g + 3, z, 'fence_post'); put(sx + 2, g + 3, z, 'fence_post');
      put(sx - 1, g + 4, z, 'lantern'); put(sx + 2, g + 4, z, 'lantern');
    }
    const [mx, , mz] = CAMP_MARKER, mg = outsideHeight(mx, mz);
    put(mx + 1, mg, mz - 1, 'fence_post');
    put(mx + 1, mg + 1, mz - 1, 'cruces_board@south');
  }

  // ---- The border: a chicane of barriers painted with the broken circle, two flags.
  {
    const bz = Z.border.z, hx = Math.floor(highwayX(bz)), y = highwayHeight(bz);
    if (near(hx - 8, hx + 8, bz - 4, bz + 4)) {
      for (let x = hx - H.halfWidth; x <= hx; x++) put(x, y, bz + 2, 'concrete_barrier@south');
      for (let x = hx + 1; x < hx + H.halfWidth; x++) put(x, y, bz - 2, 'concrete_barrier@south');
      for (const fx of [hx - H.halfWidth - 2, hx + H.halfWidth + 2]) {
        const g = outsideHeight(fx, bz);
        for (let yy = g; yy < g + 5; yy++) put(fx, yy, bz, 'fence_post');
        put(fx, g + 3, bz + 1, 'faction_flag@south'); put(fx, g + 4, bz + 1, 'faction_flag@south');
        put(fx, g + 5, bz, 'lantern');
      }
    }
  }

  // ---- The strip mall: three shops behind a parking lot, panels on the roof, a lamp over each door.
  const m = Z.mall, l = Z.lot;
  if (near(l.x0, m.x1, Math.min(l.z0, m.z0), Math.max(l.z1, m.z1), 3)) {
    // The lot: asphalt, painted bays, a light pole at each end.
    for (let z = l.z0; z < l.z1; z++) for (let x = l.x0; x < l.x1; x++) {
      clear(x, MF, MF + 8, z);
      put(x, MF - 1, z, x >= l.x1 - 5 && ((z % 3) + 3) % 3 === 0 ? 'road_line' : r(x, 4, z) < 0.07 ? 'gravel' : 'road');
    }
    for (const z of [l.z0 + 6, l.z1 - 6]) { for (let y = MF; y < MF + 4; y++) put(l.x0 + 1, y, z, 'fence_post'); put(l.x0 + 1, MF + 4, z, 'street_light'); }
    // Two wrecked cars in the bays.
    for (const [cx, cz] of [[l.x1 - 4, (m.z0 + m.z1) >> 1], [l.x1 - 4, shop('farmacia').z1 - 3]])
      for (let x = cx; x < cx + 3; x++) for (let z = cz; z < cz + 2; z++) { put(x, MF, z, (x - cx) % 2 ? 'truck_body' : 'truck_wheel'); if (x === cx + 1) put(x, MF + 1, z, 'truck_cab'); }
    // The building: concrete walls 5 high, a flat roof with a parapet, shop walls between.
    for (let z = m.z0; z < m.z1; z++) for (let x = m.x0; x < m.x1; x++) {
      const wall = x === m.x0 || x === m.x1 - 1 || z === m.z0 || z === m.z1 - 1;
      const party = Z.shops.some((s) => z === s.z0 && s.z0 !== m.z0);
      put(x, MF - 1, z, 'concrete');
      for (let y = MF; y < MF + 5; y++) {
        if (wall || party) {
          const front = x === m.x0 && !party;
          const dz = Z.shops.find((s) => z >= s.z0 && z < s.z1);
          const door = front && dz && Math.abs(z + 0.5 - (dz.z0 + dz.z1) / 2) < 1.1 && y < MF + 3;
          const window = front && !door && (y === MF + 1 || y === MF + 2) && z > m.z0 + 1 && z < m.z1 - 2 && !Z.shops.some((s) => z === s.z0 + 1 || z === s.z1 - 1);
          put(x, y, z, door ? AIR : window ? 'glass' : 'concrete');
        } else put(x, y, z, AIR);
      }
      put(x, MF + 5, z, 'concrete');
      if (wall) put(x, MF + 6, z, 'concrete');
      else if (x > m.x0 + 1 && x < m.x1 - 2 && ((z - m.z0) % 3) !== 0) put(x, MF + 6, z, 'roof_solar');
    }
    for (const s of Z.shops) {
      const dz = Math.floor((s.z0 + s.z1) / 2);
      const sign = s.name === 'farmacia' ? 'pharmacy_sign@west' : s.name === 'ferreteria' ? 'hardware_sign@west' : 'market_sign@west';
      for (const z of [dz - 1, dz, dz + 1]) put(m.x0 - 1, MF + 3, z, sign);
      put(m.x0 - 1, MF + 3, dz - 3, 'lantern'); put(m.x0 - 1, MF + 3, dz + 3, 'lantern');
      put(m.x0 + 6, MF + 4, dz, 'lantern'); // a lamp hung inside
      for (let z = s.z0 + 2; z < s.z1 - 2; z += 3) if (s.name !== 'farmacia' || z < PHARMACY_COUNTER[2] - 1) put(m.x0 + 10, MF, z, 'shop_shelf');
    }
    // The pharmacy: the counter with Doc's card, a shelf crate.
    for (let z = PHARMACY_COUNTER[2] - 1; z <= PHARMACY_COUNTER[2] + 2; z++) put(PHARMACY_COUNTER[0], MF, z, 'counter_block');
    put(...PHARMACY_COUNTER, 'pharmacy_counter');
    put(...PHARMACY_SHELF, 'stock_crate');
    // The hardware store: cable trays on the back wall, copper pipes, old car batteries, the stock crate.
    const fe = shop('ferreteria');
    for (let z = fe.z0 + 1; z < fe.z1 - 1; z++) put(m.x1 - 2, MF + 4, z, 'cable_tray');
    for (let z = fe.z0 + 1; z < fe.z1 - 1; z++) put(m.x0 + 1, MF + 4, z, 'cable_tray');
    for (const z of [fe.z1 - 3, fe.z1 - 4, fe.z1 - 5]) for (let y = MF; y < MF + 3; y++) put(m.x1 - 2, y, z, 'copper_pipe');
    for (const b of CAR_BATTERIES) put(...b, 'car_battery');
    put(...HARDWARE_CRATE, 'stock_crate');
    // The supermarket: dead display fridges along the back wall, a cable tray over them.
    for (const f of DISPLAY_FRIDGES) put(...f, 'display_fridge@west');
    const su = shop('supermercado');
    for (let z = su.z0 + 1; z < su.z1 - 1; z++) put(m.x1 - 2, MF + 4, z, 'cable_tray');
  }

  // ---- The telephone exchange: the server room and the battery room, panels on the roof, the mast and its red light.
  const e = Z.exchange;
  if (near(e.x0 - 14, e.x1 + 4, e.z0, e.z1, 4)) {
    for (let z = e.z0 - 3; z < e.z1 + 3; z++) for (let x = e.x0 - 3; x < e.x1 + 2; x++) { clear(x, EF, EF + 8, z); put(x, EF - 1, z, r(x, 5, z) < 0.5 ? 'gravel' : 'dirt'); }
    const doors = [e.z0 + 4, e.split + 3];
    for (let z = e.z0; z < e.z1; z++) for (let x = e.x0; x < e.x1; x++) {
      const wall = x === e.x0 || x === e.x1 - 1 || z === e.z0 || z === e.z1 - 1, split = z === e.split;
      put(x, EF - 1, z, 'concrete');
      for (let y = EF; y < EF + 5; y++) {
        const door = x === e.x1 - 1 && doors.some((d) => z === d || z === d + 1) && y < EF + 3;
        put(x, y, z, (wall || split) && !door ? 'concrete' : AIR);
      }
      put(x, EF + 5, z, 'concrete');
      if (wall) put(x, EF + 6, z, 'concrete');
      else if (x > e.x0 + 3 && ((z - e.z0) % 3) !== 0 && z !== e.split) put(x, EF + 6, z, 'roof_solar');
    }
    for (const d of doors) { put(e.x1, EF + 3, d, 'exchange_sign@east'); put(e.x1, EF + 3, d + 1, 'exchange_sign@east'); put(e.x1, EF + 3, d - 1, 'lantern'); put(e.x1, EF + 3, d + 2, 'lantern'); }
    for (const s of SERVER_RACKS) { put(...s, 'server_rack@east'); put(s[0], EF + 1, s[2], 'server_rack@east'); }
    for (const u of UPS_CABINETS) put(...u, 'ups_cabinet@east');
    for (let z = e.z0 + 1; z < e.z1 - 1; z++) if (z !== e.split) put(e.x0 + 1, EF + 4, z, 'cable_tray');
    put(e.x1 - 4, EF + 4, (e.z0 + e.split) >> 1, 'lantern');
    put(e.x1 - 4, EF + 4, (e.split + e.z1) >> 1, 'lantern');
    // The mast, from the roof, its red light on top: seen from the camp.
    for (let y = EF + 6; y < EF + 6 + e.mastHeight; y++) put(e.mastX, y, e.mastZ, 'mast');
    put(e.mastX, EF + 6 + e.mastHeight, e.mastZ, 'red_beacon');
  }

  // ---- The radiation rings: grey dead ground, warning signs and tape round each; the van and its casket.
  for (const h of Z.hotspots) {
    if (!near(h.x - h.r - 2, h.x + h.r + 2, h.z - h.r - 2, h.z + h.r + 2)) continue;
    for (let z = Math.floor(h.z - h.r - 1); z <= h.z + h.r + 1; z++) for (let x = Math.floor(h.x - h.r - 1); x <= h.x + h.r + 1; x++) {
      const d = Math.hypot(x + 0.5 - h.x, z + 0.5 - h.z), g = outsideHeight(x, z);
      if (d < h.r && get(x, g - 1, z) !== blockId('road') && get(x, g - 1, z) !== blockId('road_line')) { put(x, g - 1, z, 'dead_soil'); if (get(x, g, z) !== AIR) clear(x, g, g + 3, z); }
      if (Math.abs(d - (h.r + 0.6)) < 0.5 && get(x, g, z) === AIR) put(x, g, z, 'hazard_tape');
    }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, sx = Math.floor(h.x + Math.cos(a) * (h.r + 0.7)), sz = Math.floor(h.z + Math.sin(a) * (h.r + 0.7));
      const face = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? (Math.cos(a) > 0 ? '@east' : '@west') : (Math.sin(a) > 0 ? '@south' : '');
      put(sx, outsideHeight(sx, sz), sz, 'rad_sign' + face);
    }
    if (h.name === 'van') {
      for (let x = h.x - 2; x <= h.x + 2; x++) for (let z = h.z - 1; z <= h.z; z++) { put(x, MF, z, 'van_body'); if (x < h.x + 2) put(x, MF + 1, z, 'van_body'); }
      put(LEAD_CASKET[0], LEAD_CASKET[1], LEAD_CASKET[2] + 1, 'lead_casket');
    } else {
      // The pond: shallow standing water where the roofs drained.
      for (let z = h.z - 3; z <= h.z + 3; z++) for (let x = h.x - 3; x <= h.x + 3; x++) if (Math.hypot(x - h.x, z - h.z) < 2.6) { const g = outsideHeight(x, z); put(x, g - 1, z, 'water'); put(x, g - 2, z, 'mud'); }
    }
  }

  // ---- The hot-spring cave: a lit trail east, a timbered mouth in a low bank, a decline crusted with saltpeter,
  // and the cavern with its steaming pool rimmed with sulfur, a vent to the sky above it.
  const cv = Z.cave, cav = cv.cavern, t = Z.caveTrail;
  if (near(highwayX(t.z) - 2, cav.x1 + 2, cav.z0 - 2, cav.z1 + 2, 4)) {
    for (let x = Math.floor(highwayX(t.z)) + H.halfWidth; x <= cv.mouthX; x++) for (let z = t.z - 1; z <= t.z + 1; z++) {
      clear(x, KF, KF + 5, z);
      put(x, KF - 1, z, r(x, 6, z) < 0.35 ? 'gravel' : 'dirt');
      if (z === t.z + 1 && (x - cv.mouthX) % 12 === -6) lampPost(x, z + 1, 2, 'lantern');
    }
    // The bank the mouth is cut into: rock heaped up over the decline's first blocks.
    for (let x = cv.mouthX; x < cav.x0; x++) for (let z = cv.z - 4; z <= cv.z + 4; z++) {
      const top = Math.max(outsideHeight(x, z), KF + 5 - Math.max(0, Math.abs(z - cv.z) - 2));
      for (let y = outsideHeight(x, z); y < top; y++) put(x, y, z, 'limestone');
      if (top > outsideHeight(x, z)) put(x, top, z, r(x, 9, z) < 0.5 ? 'grass' : 'forest_floor');
    }
    // The decline: three wide, four high, down one a block east to the cavern; timber every four, a lamp on each.
    for (let k = 0; k < cv.depth; k++) {
      const x = cv.mouthX + k, fy = KF - k;
      for (let z = cv.z - 2; z <= cv.z + 2; z++) {
        const side = Math.abs(z - cv.z) === 2;
        for (let y = fy - 1; y < fy + 5; y++) {
          if (side || y === fy - 1 || y === fy + 4) {
            if (y === fy - 1) put(x, y, z, 'gravel');
            else put(x, y, z, side && y < fy + 4 && r(x, y, z) < 0.45 ? 'saltpeter_crust' : 'limestone');
          } else put(x, y, z, AIR);
        }
      }
      if (k % 4 === 0) {
        for (let y = fy; y < fy + 4; y++) { put(x, y, cv.z - 2, 'log'); put(x, y, cv.z + 2, 'log'); }
        for (let z = cv.z - 2; z <= cv.z + 2; z++) put(x, fy + 4, z, 'log');
        put(x, fy + 3, cv.z - 1, 'lantern');
      }
    }
    for (let y = KF; y < KF + 4; y++) { put(cv.mouthX, y, cv.z - 2, 'log'); put(cv.mouthX, y, cv.z + 2, 'log'); }
    for (let z = cv.z - 2; z <= cv.z + 2; z++) put(cv.mouthX, KF + 4, z, 'log');
    put(cv.mouthX - 1, KF + 2, cv.z - 3, 'lantern'); put(cv.mouthX - 1, KF + 2, cv.z + 3, 'lantern');
    // The cavern.
    const F0 = CAVE_FLOOR, top = F0 + 7, [px, , pz] = HOT_POOL;
    for (let z = cav.z0 - 1; z <= cav.z1; z++) for (let x = cav.x0 - 1; x <= cav.x1; x++) for (let y = F0 - 3; y <= top; y++) {
      const inside = x >= cav.x0 && x < cav.x1 && z >= cav.z0 && z < cav.z1 && y >= F0 && y < top;
      const d = Math.hypot(x + 0.5 - px - 0.5, z + 0.5 - pz - 0.5);
      if (inside) { put(x, y, z, AIR); continue; }
      if (y < F0) {
        // The floor: the hot pool in the middle, two deep, its rim crusted with sulfur.
        if (d < 3.6 && y >= F0 - 2) put(x, y, z, 'water');
        else if (d < 6 && y === F0 - 1) put(x, y, z, r(x, y, z) < 0.75 ? 'sulfur_crust' : 'gravel');
        else put(x, y, z, y === F0 - 1 ? (r(x, y, z) < 0.5 ? 'gravel' : 'limestone') : 'limestone');
        continue;
      }
      if (x === cav.x0 - 1 && Math.abs(z - cv.z) <= 1 && y < F0 + 4) continue; // the decline comes in here
      const roll = r(x, y, z, 2);
      put(x, y, z, y < F0 + 2 && roll < 0.3 ? 'sulfur_crust' : roll < 0.4 ? 'saltpeter_crust' : 'limestone');
    }
    for (let x = cav.x0 - 1; x < cav.x0 + 1; x++) for (let z = cv.z - 1; z <= cv.z + 1; z++) for (let y = F0; y < F0 + 4; y++) put(x, y, z, AIR);
    // The raiders' plank walk from the decline to the pool, and their lamps.
    for (let x = cav.x0; x < px - 3; x++) put(x, F0 - 1, cv.z, 'planks');
    for (const [lx, lz] of [[cav.x0, cav.z0], [cav.x1 - 1, cav.z0], [cav.x0, cav.z1 - 1], [cav.x1 - 1, cav.z1 - 1]]) put(lx, F0, lz, 'lantern');
    // The vent: a shaft over the pool to the sky, fenced round at the top.
    const g = outsideHeight(px, pz);
    for (let y = top; y < g + 4; y++) for (let z = pz - 1; z <= pz + 1; z++) for (let x = px - 1; x <= px + 1; x++) put(x, y, z, AIR);
    for (let z = pz - 2; z <= pz + 2; z++) for (let x = px - 2; x <= px + 2; x++) {
      if (Math.abs(x - px) < 2 && Math.abs(z - pz) < 2) continue;
      const gy = outsideHeight(x, z);
      put(x, gy - 1, z, 'cobble'); put(x, gy, z, 'fence_post');
      if ((x + z) % 2 === 0) put(x, gy + 1, z, 'fence_post');
    }
    put(px - 2, outsideHeight(px - 2, pz - 2) + 2, pz - 2, 'lantern');
  }

  // ---- Las Cruces: walls of reinforced concrete, a steel gate at the highway's end, two towers with guards and
  // searchlights, the broken circle painted over the gate. Behind the walls, a warehouse, a water tower, a fire.
  if (near(C.x0, C.x1, C.z0, C.z1, 6)) {
    const F = COMPOUND_FLOOR, top = F + C.wall;
    for (let z = C.z0 - 5; z < C.z1 + 5; z++) for (let x = C.x0 - 5; x < C.x1 + 5; x++) { clear(x, F, F + 12, z); put(x, F - 1, z, r(x, 7, z) < 0.4 ? 'gravel' : 'dirt'); }
    for (let z = C.z0; z < C.z1; z++) for (let x = C.x0; x < C.x1; x++) {
      const wall = x === C.x0 || x === C.x1 - 1 || z === C.z0 || z === C.z1 - 1;
      if (!wall) continue;
      for (let y = F - 3; y < top; y++) put(x, y, z, 'compound_wall');
      const gate = z === C.z1 - 1 && Math.abs(x - GATE_X) <= C.gateHalf;
      if (gate) for (let y = F; y < top - 1; y++) put(x, y, z, 'steel_gate');
      if (z === C.z1 - 1 && (Math.abs(x - GATE_X) <= 1 || Math.abs(x - GATE_X) === C.gateHalf + 7)) put(x, top - 1 - (Math.abs(x - GATE_X) <= 1 ? 0 : 3), z, 'compound_mark@south');
    }
    // The gate towers: stacked concrete beside the gate, a plank platform, sandbags, a searchlight, a flag.
    for (const p of TOWER_POSTS) {
      const tx = Math.floor(p.x);
      for (let z = C.z1 - 2; z <= C.z1; z++) for (let x = tx - 1; x <= tx + 1; x++) {
        for (let y = F - 3; y < top; y++) put(x, y, z, 'compound_wall');
        put(x, top, z, 'planks');
        if (z === C.z1 && x !== tx) put(x, top + 1, z, 'sandbags');
      }
      put(tx + (tx < GATE_X ? -1 : 1), top + 1, C.z1 - 2, 'searchlight');
      for (let y = top + 1; y < top + 5; y++) put(tx + (tx < GATE_X ? 1 : -1), y, C.z1 - 2, 'fence_post');
      put(tx + (tx < GATE_X ? 1 : -1), top + 3, C.z1 - 1, 'faction_flag@south');
      put(tx + (tx < GATE_X ? 1 : -1), top + 4, C.z1 - 1, 'faction_flag@south');
    }
    // Lamps on the wall's face either side of the gate.
    for (const s of [-1, 1]) put(GATE_X + s * (C.gateHalf + 2), F + 4, C.z1, 'lantern');
    // Inside: a warehouse (its walls too are the faction's concrete), a water tower, the yard's fire and lamps.
    const w = { x0: C.x0 + 8, x1: C.x1 - 8, z0: C.z0 + 6, z1: C.z0 + 26 };
    for (let z = w.z0; z < w.z1; z++) for (let x = w.x0; x < w.x1; x++) {
      const wall = x === w.x0 || x === w.x1 - 1 || z === w.z0 || z === w.z1 - 1;
      for (let y = F; y < F + 8; y++) put(x, y, z, wall ? 'compound_wall' : AIR);
      put(x, F + 8, z, 'tin_roof');
    }
    const wt = [C.x1 - 6, C.z1 - 10];
    for (const [dx, dz] of [[0, 0], [2, 0], [0, 2], [2, 2]]) for (let y = F; y < F + 9; y++) put(wt[0] + dx, y, wt[1] + dz, 'log');
    for (let dx = -1; dx <= 3; dx++) for (let dz = -1; dz <= 3; dz++) { put(wt[0] + dx, F + 9, wt[1] + dz, 'planks'); for (let y = F + 10; y < F + 13; y++) if (dx === -1 || dx === 3 || dz === -1 || dz === 3) put(wt[0] + dx, y, wt[1] + dz, 'oil_drum'); }
    put(GATE_X, F, C.z1 - 10, 'oil_drum_fire');
    for (const [lx, lz] of [[C.x0 + 3, C.z1 - 3], [C.x1 - 4, C.z1 - 3], [C.x0 + 3, C.z0 + 30], [C.x1 - 4, C.z0 + 30]]) { put(lx, F, lz, 'fence_post'); put(lx, F + 1, lz, 'lantern'); }
  }
}
