// Zone-1's mid and deep bands, in blocks (docs/PHASE5.md): the raiders' outpost with its sandbags,
// cookfire, flag and lookout platform, the brush and its game trail round to the back, the old mine,
// the hunting camp off its marked trail, and the broken bridge over the ravine with the body on the far
// bank and the strange tracks on the near one. Pure, like the rest of the generator.

import { CS, WORLD_Y } from '../world/constants.ts';
import { blockId, AIR } from '../world/blocks.ts';
import { rand3 } from '../core/noise.ts';
import { SEED, ZONE1FAR, ROAD, roadZ, roadHeight, outsideHeight, onCampTrail, inBrush, brushTrailDist, onRoad } from './layout.ts';

const ci = (x: number, y: number, z: number) => (y << 10) | (z << 5) | x;
const F = ZONE1FAR;

/** Where things stand that the game uses (their contents are in src/gen/inheritance.ts). */
export const RAIDER_CRATE: [number, number, number] = [F.outpost.x0 + 1, F.outpost.floor, F.outpost.z1 - 2];
export const RAIDER_FORGE: [number, number, number] = [F.outpost.x1 - 3, F.outpost.floor, F.outpost.z1 - 2];
export const LODGE_CHEST: [number, number, number] = [F.lodge.x0 + 1, F.camp.floor, F.lodge.z0 + 1];
export const PHOTO: [number, number, number] = [F.lodge.x0 + 2, F.camp.floor + 1, F.lodge.z0 + 1];
export const RUSTED_TRAP: [number, number, number] = [F.shed.x0 - 1, F.camp.floor, F.shed.z1 + 2];
export const CAMP_MARKER: [number, number, number] = [F.campHead.x + 2, 0, F.campHead.z - 1];
/** Where each raider takes his post (feet), and the way he faces: the lookout on the roof watching the road east. */
export const POSTS = {
  lookout: { x: F.outpost.x1 - 2.5, y: F.outpost.floor + 4, z: (F.outpost.z0 + F.outpost.z1) / 2, yaw: -Math.PI / 2 },
  pistol: { x: F.outpost.x0 + 3.5, y: F.outpost.floor, z: F.outpost.z0 - 2.5, yaw: 0 },
  machete: { x: F.outpost.x0 + 7.5, y: F.outpost.floor, z: F.outpost.z0 + 1.5, yaw: 0 },
};
/** The middle of the outpost, for distances. */
export const OUTPOST_AT: [number, number] = [(F.outpost.x0 + F.outpost.x1) / 2, (F.outpost.z0 + F.outpost.z1) / 2];
export const CAMP_AT: [number, number] = [(F.camp.x0 + F.camp.x1) / 2, (F.camp.z0 + F.camp.z1) / 2];
/** The broken deck's end, where a player stands to look across. */
export const DECK_END: [number, number, number] = [F.bridge.deckEnd + 0.5, F.bridge.y, F.bridge.z + 0.5];

export function buildZone1Far(col: Uint16Array, x0: number, z0: number): void {
  if (x0 > 915 || x0 + CS < 585 || z0 > 1075 || z0 + CS < 940) return;
  const put = (x: number, y: number, z: number, name: string | number) => {
    const lx = x - x0, lz = z - z0;
    if (lx >= 0 && lz >= 0 && lx < CS && lz < CS && y > 0 && y < WORLD_Y) col[ci(lx, y, lz)] = typeof name === 'number' ? name : blockId(name);
  };
  const get = (x: number, y: number, z: number) => {
    const lx = x - x0, lz = z - z0;
    return lx >= 0 && lz >= 0 && lx < CS && lz < CS && y >= 0 && y < WORLD_Y ? col[ci(lx, y, lz)] : -1;
  };
  const inCol = (x: number, z: number) => x >= x0 && x < x0 + CS && z >= z0 && z < z0 + CS;
  const clear = (x: number, y0: number, y1: number, z: number) => { for (let y = y0; y < y1; y++) put(x, y, z, AIR); };
  const r = (x: number, y: number, z: number, k = 0) => rand3(x, y + k * 31, z, SEED + 70);
  const lampPost = (x: number, z: number, h = 1) => {
    const g = outsideHeight(x, z);
    for (let y = g; y < g + h; y++) put(x, y, z, 'fence_post');
    put(x, g + h, z, 'lantern');
  };

  // ---- The brush: thick low bushes either side of a game trail, from the road round to the outpost's back.
  const o = F.outpost, OF = o.floor;
  /** The trail's centre line, a point a metre. */
  const trailPoints: [number, number][] = [];
  for (let i = 0; i < F.brushTrail.length - 1; i++) {
    const [ax, az] = F.brushTrail[i], [bx, bz] = F.brushTrail[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az)));
    for (let k = 0; k <= n; k++) trailPoints.push([ax + ((bx - ax) * k) / n + 0.5, az + ((bz - az) * k) / n + 0.5]);
  }
  /** Is (x, z) ground the brush grows on (a bush, or a gap between bushes)? */
  const brushGround = (x: number, z: number) => {
    if (z < 1018 || z >= 1056 || x < 850 || x >= 912) return false;
    const nearHouse = x >= o.x0 - 1 && x <= o.x1 + 1 && z >= o.z0 - 6 && z <= o.z1 + 1;
    return !onRoad(x, z, 1) && !nearHouse && inBrush(x, z);
  };
  /** The height a walker stands at on the brush's own bush at (x, z): the ground, in a gap. */
  const ownTop = (x: number, z: number) => {
    const g = outsideHeight(x, z);
    return r(x, 2, z) < 0.08 ? g : r(x, 4, z) < 0.25 ? g + 3 : r(x, 3, z) < 0.85 ? g + 2 : g + 1;
  };
  /**
   * The same, with the bushes on ground lower than the trail near them grown taller by what the ground falls. The
   * trail climbs as it leaves the outpost, and the ground north of it falls toward the yard: a walker up the trail
   * stood head and shoulders over the bushes lower down, and the lookout on his roof saw them along the slope
   * (docs/PHASE9B.md, 3). Each bush now stands as tall over the highest ground of the trail within six metres as
   * it did over its own. A gap between bushes stays a gap.
   */
  const bushTop = (x: number, z: number) => {
    const g = outsideHeight(x, z), own = ownTop(x, z);
    if (own === g) return g;
    let high = g;
    for (const [tx, tz] of trailPoints) if (Math.hypot(tx - x - 0.5, tz - z - 0.5) <= 6) high = Math.max(high, outsideHeight(Math.floor(tx), Math.floor(tz)));
    return own + (high - g);
  };
  /**
   * The height the brush stands to at (x, z). No bush, and no gap, stands two blocks or more below its
   * neighbour on the trail's side: so from anywhere in the brush there is a way down to the trail a step at a
   * time. (Gaps and low bushes walled in by taller ones were pits: thirteen of them, docs/REVIEW.md, N3c.)
   */
  const brushTop = (x: number, z: number): number => {
    if (!brushGround(x, z)) return outsideHeight(x, z);
    let near = brushTrailDist(x, z), toward: [number, number] | null = null;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const d = brushTrailDist(x + dx, z + dz); if (d < near) { near = d; toward = [x + dx, z + dz]; } }
    return toward ? Math.max(bushTop(x, z), brushTop(toward[0], toward[1]) - 1) : bushTop(x, z);
  };
  for (let z = Math.max(z0, 1018); z < Math.min(z0 + CS, 1056); z++)
    for (let x = Math.max(x0, 850); x < Math.min(x0 + CS, 912); x++) {
      const nearHouse = x >= o.x0 - 1 && x <= o.x1 + 1 && z >= o.z0 - 6 && z <= o.z1 + 1;
      if (onRoad(x, z, 1) || nearHouse) continue;
      const g = outsideHeight(x, z);
      if (brushTrailDist(x, z) <= 1.4) { clear(x, g, g + 4, z); put(x, g - 1, z, r(x, 1, z) < 0.3 ? 'dirt' : 'forest_floor'); continue; }
      if (!inBrush(x, z)) continue;
      if (r(x, 2, z) >= 0.08) {
        put(x, g, z, 'leaves');
        if (r(x, 3, z) < 0.85) put(x, g + 1, z, 'leaves');
        if (r(x, 4, z) < 0.25) put(x, g + 2, z, 'leaves');
      }
      const top = brushTop(x, z);
      if (top > ownTop(x, z)) for (let y = g; y < top; y++) put(x, y, z, 'leaves');
    }

  // ---- The outpost: a cinder-block tienda, two rooms, a flat roof with a lookout platform.
  if (inCol(o.x0, o.z0) || inCol(o.x1 - 1, o.z1 - 1) || inCol(o.x0, o.z1) || inCol(o.x1, o.z0) || (x0 < o.x1 + 12 && x0 + CS > o.x0 - 12 && z0 < o.z1 + 4 && z0 + CS > o.z0 - 10)) {
    // The yard: packed dirt and gravel, swept clear.
    for (let z = o.z0 - 6; z < o.z1 + 1; z++) for (let x = o.x0 - 3; x < o.x1 + 3; x++) {
      if (onRoad(x, z)) continue;
      clear(x, OF, OF + 9, z);
      put(x, OF - 1, z, r(x, 5, z) < 0.4 ? 'gravel' : 'dirt');
    }
    const doorX = [o.x0 + 7, o.x0 + 8], innerDoor = o.x0 + 3;
    for (let z = o.z0; z < o.z1; z++) for (let x = o.x0; x < o.x1; x++) {
      const wall = x === o.x0 || x === o.x1 - 1 || z === o.z0 || z === o.z1 - 1;
      const split = z === o.split && !wall;
      put(x, OF - 1, z, 'cobble');
      for (let y = OF; y < OF + 3; y++) {
        if (wall) {
          const door = z === o.z0 && doorX.includes(x) && y < OF + 2;
          const window = y === OF + 1 && ((z === o.z0 && (x === o.x0 + 3 || x === o.x1 - 4)) || (z === o.z1 - 1 && x === o.x0 + 8) || ((x === o.x0 || x === o.x1 - 1) && z === o.z0 + 3));
          put(x, y, z, door ? AIR : window ? 'tin_sheet' : 'cinder_block');
        } else if (split) put(x, y, z, x === innerDoor && y < OF + 2 ? AIR : 'cinder_block');
      }
      put(x, OF + 3, z, 'cinder_block'); // the flat roof
    }
    // The faded shop sign over the door, and lanterns either side of it.
    put(doorX[0], OF + 2, o.z0 - 1, 'tienda_sign');
    put(doorX[1], OF + 2, o.z0 - 1, 'tienda_sign');
    put(o.x0 + 5, OF, o.z0 - 1, 'fence_post'); put(o.x0 + 5, OF + 1, o.z0 - 1, 'lantern');
    put(o.x0 + 10, OF, o.z0 - 1, 'fence_post'); put(o.x0 + 10, OF + 1, o.z0 - 1, 'lantern');
    // Inside: bedrolls in the front room; the workshop in the back room with its forge, a bench, the crate.
    for (const x of [o.x0 + 1, o.x0 + 2, o.x1 - 3]) put(x, OF, o.z0 + 2 + (x & 1), 'bedroll@east');
    put(o.x1 - 2, OF, o.z0 + 1, 'lantern');
    put(RAIDER_FORGE[0], RAIDER_FORGE[1], RAIDER_FORGE[2], 'raider_forge');
    put(RAIDER_FORGE[0] - 2, OF, RAIDER_FORGE[2], 'workbench');
    put(RAIDER_CRATE[0], RAIDER_CRATE[1], RAIDER_CRATE[2], 'raiders_crate');
    put(o.x0 + 1, OF, o.split + 1, 'supply_crate');
    put(o.x0 + 6, OF, o.z1 - 2, 'lantern');
    // The lookout platform: sandbags along the roof's east edge and round its corners.
    for (let z = o.z0; z < o.z1; z++) put(o.x1 - 1, OF + 4, z, 'sandbags');
    for (let x = o.x1 - 4; x < o.x1 - 1; x++) { put(x, OF + 4, o.z0, 'sandbags'); put(x, OF + 4, o.z1 - 1, 'sandbags'); }
    // Supply crates stacked against the back wall: steps up to the roof, one block at a time.
    for (let k = 0; k < 3; k++) for (let y = OF; y <= OF + k; y++) put(o.x0 + 1 + k, y, o.z1, 'supply_crate');
    // Out front: sandbag cover for the pistol, the oil-drum cookfire under the smoke, the flag.
    for (let x = o.x0 + 1; x < o.x0 + 6; x++) put(x, OF, o.z0 - 4, 'sandbags');
    put(o.x0 + 1, OF, o.z0 - 3, 'sandbags');
    for (let x = o.x1 - 4; x < o.x1; x++) put(x, OF, o.z0 - 4, 'sandbags');
    put(F.fire.x, OF, F.fire.z, 'oil_drum_fire');
    put(F.fire.x + 2, OF, F.fire.z + 1, 'oil_drum');
    for (let y = OF; y < OF + 5; y++) put(o.x0 - 2, y, o.z0 - 2, 'fence_post');
    put(o.x0 - 2, OF + 3, o.z0 - 3, 'faction_flag@east');
    put(o.x0 - 2, OF + 4, o.z0 - 3, 'faction_flag@east');
    // Lit at night from every side (docs/PHASE6.md, 10): lamp posts at the yard's corners, a lantern on
    // the lookout's platform and one on the back wall's crates.
    for (const [x, z] of [[o.x0 - 3, o.z0 - 6], [o.x1 + 2, o.z0 - 6], [o.x0 - 3, o.z1], [o.x1 + 2, o.z1]]) {
      for (let y = OF; y < OF + 3; y++) put(x, y, z, 'fence_post');
      put(x, OF + 3, z, 'lantern');
    }
    put(o.x1 - 2, OF + 4, o.z0 + 1, 'lantern');
    put(o.x1 - 2, OF + 4, o.z1 - 2, 'lantern');
    put(o.x0 + 8, OF + 2, o.z1, 'lantern');
    put(o.x0 - 1, OF + 2, (o.z0 + o.z1) >> 1, 'lantern'); // on the west wall
    put(o.x1, OF + 2, (o.z0 + o.z1) >> 1, 'lantern'); // and the east
  }
  // The stripped pickup on the road's north shoulder: cover by the road.
  const hk = F.hulk, hh = roadHeight((hk.x0 + hk.x1) >> 1);
  for (let x = hk.x0; x < hk.x1; x++) for (let z = hk.z0; z < hk.z0 + 2; z++) {
    if (!inCol(x, z)) continue;
    for (let y = outsideHeight(x, z); y < hh; y++) put(x, y, z, 'gravel');
    clear(x, hh, hh + 5, z);
    put(x, hh, z, (x - hk.x0) % 4 === 0 ? 'scrap_heap' : 'truck_body');
    if (x - hk.x0 <= 1 || z === hk.z0) put(x, hh + 1, z, 'truck_body');
    if (x === hk.x0 + 2 && z === hk.z0) put(x, hh + 2, z, 'lantern'); // a lamp left on the pickup's roof
  }

  // ---- The old mine: a timbered decline south from the road, lit all the way, to a chamber of iron and coal.
  const m = F.mine, MF = m.floor, ch = m.chamber;
  if (x0 < ch.x1 + 4 && x0 + CS > ch.x0 - 4 && z0 < ch.z1 + 3 && z0 + CS > m.z - 8) {
    for (let z = m.z - 4; z < m.z; z++) for (let x = m.x - 3; x <= m.x + 3; x++) { clear(x, MF, MF + 6, z); put(x, MF - 1, z, 'gravel'); }
    for (let k = 0; k < m.depth; k++) {
      const z = m.z + k, fy = MF - k;
      for (let x = m.x - 2; x <= m.x + 2; x++) {
        const side = x === m.x - 2 || x === m.x + 2;
        for (let y = fy - 1; y < fy + 5; y++) {
          if (side || y === fy - 1 || y === fy + 4) { if (get(x, y, z) === AIR || y === fy - 1) put(x, y, z, y === fy - 1 ? 'gravel' : 'limestone'); }
          else put(x, y, z, AIR);
        }
        // Above the roof, an open cut where the decline starts near the surface.
        if (fy + 4 >= outsideHeight(x, z) - 1 && !side) clear(x, fy + 4, outsideHeight(x, z) + 2, z);
      }
      // A timber set every four blocks, and a lamp hung from every other one.
      // (Posts in the walls and a cap in the roof, so the way stays three wide and four high.)
      if (k % 4 === 0) {
        for (let y = fy; y < fy + 4; y++) { put(m.x - 2, y, z, 'log'); put(m.x + 2, y, z, 'log'); }
        for (let x = m.x - 2; x <= m.x + 2; x++) put(x, fy + 4, z, 'log');
        put(m.x - 1, fy + 3, z, 'lantern');
      }
    }
    // The chamber: rough walls thick with iron and coal, lit by the miners' lamps.
    for (let z = ch.z0 - 1; z <= ch.z1; z++) for (let x = ch.x0 - 1; x <= ch.x1; x++) for (let y = ch.y0 - 1; y <= ch.y1; y++) {
      const inside = x >= ch.x0 && x < ch.x1 && z >= ch.z0 && z < ch.z1 && y >= ch.y0 && y < ch.y1;
      if (inside) { put(x, y, z, AIR); continue; }
      if (z === ch.z0 - 1 && Math.abs(x - m.x) <= 1 && y >= ch.y0) continue; // the decline's last step
      if (y === ch.y0 - 1) { put(x, y, z, r(x, y, z) < 0.5 ? 'gravel' : 'cobble'); continue; }
      const roll = r(x, y, z, 3);
      put(x, y, z, roll < 0.32 ? 'iron_ore' : roll < 0.6 ? 'coal_ore' : 'limestone');
    }
    for (let x = m.x - 1; x <= m.x + 1; x++) for (let y = ch.y0; y < ch.y0 + 4; y++) put(x, y, ch.z0, AIR); // the decline's mouth
    for (const [x, z] of [[ch.x0, ch.z0 + 3], [ch.x1 - 1, ch.z0 + 3], [ch.x0, ch.z1 - 3], [ch.x1 - 1, ch.z1 - 3], [m.x, ch.z1 - 1]]) put(x, ch.y0, z, 'lantern');
    // The head: a timber frame over the decline, the board, a lamp on a post either side.
    for (let y = MF; y < MF + 4; y++) { put(m.x - 2, y, m.z, 'log'); put(m.x + 2, y, m.z, 'log'); }
    for (let x = m.x - 2; x <= m.x + 2; x++) put(x, MF + 4, m.z, 'log');
    put(m.x, MF + 5, m.z, 'mina_sign');
    lampPost(m.x - 3, m.z - 2);
    lampPost(m.x + 3, m.z - 2);
  }

  // ---- The hunting camp's trail head: a tall post with antlers, a board and a lamp, on the road's north side.
  const hd = F.campHead;
  {
    const [mx, , mz] = CAMP_MARKER, g = outsideHeight(mx, mz);
    for (let y = g; y < g + 4; y++) put(mx, y, mz, 'fence_post');
    put(mx, g + 1, mz - 1, 'camp_sign@south');
    put(mx, g + 4, mz, 'antlers');
    put(mx - 1, g + 3, mz, 'lantern');
    put(mx - 1, g + 2, mz, 'fence_post');
  }
  // The trail: packed dirt, two wide, cleared, from the road north to the clearing.
  for (let z = F.camp.z1 - 1; z <= hd.z; z++) for (let x = hd.x - 1; x <= hd.x; x++) {
    if (!onCampTrail(x, z)) continue;
    const g = outsideHeight(x, z);
    clear(x, g, g + 5, z);
    put(x, g - 1, z, r(x, 6, z) < 0.3 ? 'gravel' : 'dirt');
    if ((z - F.camp.z1) % 14 === 7 && x === hd.x) lampPost(hd.x + 2, z);
  }

  // ---- The hunting camp: the clearing, the lodge, the drying shed, the racks, the trap line, the tracks.
  const c = F.camp, CF = c.floor;
  if (x0 < c.x1 + 2 && x0 + CS > c.x0 - 2 && z0 < c.z1 + 2 && z0 + CS > c.z0 - 2) {
    for (let z = c.z0; z < c.z1; z++) for (let x = c.x0; x < c.x1; x++) {
      clear(x, CF, CF + 10, z);
      put(x, CF - 1, z, r(x, 7, z) < 0.2 ? 'dirt' : 'grass');
      if (r(x, 8, z) < 0.12) put(x, CF, z, 'tall_grass');
    }
    // The lodge: log walls, two rooms, a plank floor and roof, a door to the clearing, a lit window.
    const l = F.lodge;
    for (let z = l.z0; z < l.z1; z++) for (let x = l.x0; x < l.x1; x++) {
      const wall = x === l.x0 || x === l.x1 - 1 || z === l.z0 || z === l.z1 - 1;
      put(x, CF - 1, z, 'planks');
      put(x, CF, z, AIR);
      for (let y = CF; y < CF + 3; y++) {
        if (wall) {
          const door = x === l.x1 - 1 && z === l.z0 + 3 && y < CF + 2;
          const window = y === CF + 1 && z === l.z1 - 1 && (x === l.x0 + 2 || x === l.x1 - 3);
          put(x, y, z, door ? AIR : window ? 'glass' : 'log');
        } else if (x === l.x0 + 4) put(x, y, z, z === l.z0 + 3 && y < CF + 2 ? AIR : 'planks');
        else put(x, y, z, AIR);
      }
      put(x, CF + 3, z, 'slab_planks');
    }
    put(LODGE_CHEST[0], LODGE_CHEST[1], LODGE_CHEST[2], 'chest');
    put(PHOTO[0], PHOTO[1], PHOTO[2], 'photo_frame@south');
    put(l.x0 + 2, CF, l.z1 - 2, 'lantern');
    put(l.x1 - 3, CF, l.z1 - 2, 'lantern');
    put(l.x0 + 6, CF, l.z0 + 1, 'bed@west');
    // The drying shed: posts and a roof, open sides; cured hides still hanging, the meat frames empty.
    const s = F.shed;
    for (let z = s.z0; z < s.z1; z++) for (let x = s.x0; x < s.x1; x++) {
      const corner = (x === s.x0 || x === s.x1 - 1) && (z === s.z0 || z === s.z1 - 1);
      if (corner) for (let y = CF; y < CF + 3; y++) put(x, y, z, 'log');
      put(x, CF + 3, z, 'slab_planks');
      if (!corner && z === s.z0 + 1 && x > s.x0 && x < s.x1 - 1) put(x, CF, z, r(x, 9, z) < 0.6 ? 'hide_rack' : 'meat_frame');
      if (!corner && z === s.z0 + 3 && x > s.x0 && x < s.x1 - 1 && r(x, 10, z) < 0.5) put(x, CF, z, 'meat_frame');
    }
    put(s.x1 + 2, CF, s.z1 + 2, 'skinning_rack');
    put(c.x1 - 3, CF, c.z1 - 8, 'archery_butt');
    // Mud in front of the shed, the jaguar's prints in it, and the rusted leghold trap.
    for (let z = s.z1; z < s.z1 + 5; z++) for (let x = s.x0 - 3; x < s.x1; x++) if (r(x, 11, z) < 0.8) put(x, CF - 1, z, 'mud');
    for (const [dx, dz] of [[0, 1], [2, 2], [3, 4], [5, 3], [6, 1]]) { put(s.x0 + dx, CF - 1, s.z1 + dz, 'mud'); put(s.x0 + dx, CF, s.z1 + dz, 'jaguar_tracks'); }
    put(RUSTED_TRAP[0], RUSTED_TRAP[1], RUSTED_TRAP[2], 'leghold_trap');
    // The trap line: snares along the clearing's edges.
    for (const [x, z] of [[c.x0 + 1, c.z1 - 4], [c.x0 + 2, c.z0 + 14], [c.x1 - 2, c.z1 - 3], [c.x1 - 2, c.z0 + 12]]) put(x, CF, z, 'snare');
    lampPost(F.campHead.x + 2, c.z1 - 1);
  }

  // ---- The broken bridge: the near abutment and two deck sections over the drop, ending in rebar; the far
  // abutment and a stub of deck; the debris of the fallen span below.
  const b = F.bridge, rz = b.z;
  if (x0 < b.near + 6 && x0 + CS > b.far - 30 && z0 < rz + 40 && z0 + CS > rz - 40) {
    const deckY = b.y - 1;
    for (let z = rz - 3; z <= rz + 3; z++) {
      const edge = Math.abs(z - rz) === 3;
      // The near abutment: a block of concrete down into the gorge's wall.
      for (let x = b.near - 1; x <= b.near + 2; x++) for (let y = deckY - 14; y <= deckY; y++) put(x, y, z, 'concrete');
      // The deck sections, the parapet along their edges, broken off at the end.
      for (let x = b.deckEnd; x < b.near - 1; x++) {
        // Broken only at the very end: a hole one block back, with sound deck beyond it, lay on the road's
        // centre line (docs/REVIEW.md, N3g). A missing block is now always one the end itself has lost too.
        const gone = (xx: number) => xx - b.deckEnd < 2 && r(xx, 12, z) < 0.45;
        const broken = gone(x) && (x === b.deckEnd || gone(b.deckEnd));
        if (!broken) put(x, deckY, z, 'concrete');
        if (edge && !broken && r(x, 13, z) < 0.8) put(x, deckY + 1, z, 'concrete');
        if (!edge) clear(x, deckY + 1, deckY + 5, z);
      }
      // Rebar hanging from the break.
      for (const x of [b.deckEnd, b.deckEnd + 1]) if (r(x, 14, z) < 0.6) for (let y = deckY - 1 - Math.floor(r(x, 15, z) * 3); y < deckY; y++) put(x, y, z, 'rebar');
      // The far abutment and its stub of deck, with rebar reaching out.
      const fy = outsideHeight(b.far - 3, rz) - 1;
      for (let x = b.far - 3; x <= b.far; x++) for (let y = fy - 12; y <= fy; y++) put(x, y, z, 'concrete');
      for (let x = b.far + 1; x <= b.farDeck; x++) { put(x, fy, z, 'concrete'); if (edge) put(x, fy + 1, z, 'concrete'); }
      if (r(b.farDeck, 16, z) < 0.6) put(b.farDeck, fy - 1, z, 'rebar');
      // The road's stub on the far side, gone to weeds.
      for (let x = b.far - 18; x < b.far - 3; x++) if (Math.abs(z - rz) < 2) {
        const g = outsideHeight(x, z);
        if (r(x, 17, z) < 0.55) put(x, g - 1, z, 'road');
        clear(x, g, g + 3, z);
      }
    }
    // The fallen span: broken concrete on the gorge floor.
    for (let k = 0; k < 26; k++) {
      const x = b.far + 3 + Math.floor(r(k, 18, 0) * (b.deckEnd - b.far - 4)), z = rz - 4 + Math.floor(r(k, 19, 0) * 9);
      let y = 60;
      while (y > 30 && get(x, y - 1, z) === AIR) y--;
      if (get(x, y - 1, z) > 0) { put(x, y, z, 'concrete'); if (r(k, 20, 0) < 0.4) put(x, y + 1, z, 'rebar'); }
    }
    // Standing water by the road near the bridge.
    for (const [px, pz] of [[b.near + 8, rz + 6], [b.near + 15, rz - 7], [b.near + 22, rz + 5]])
      for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 3; dx++) {
        const x = px + dx, z = pz + dz, g = outsideHeight(x, z);
        if (onRoad(x, z) || g !== outsideHeight(px, pz)) continue;
        put(x, g - 1, z, 'water'); put(x, g - 2, z, 'mud');
        clear(x, g, g + 2, z);
      }
    // The two-legged tracks: in soft mud on the near bank, half under leaf litter, passing along the lip.
    const [[ax, az], [bx, bz]] = F.tracks;
    const n = Math.ceil(Math.hypot(bx - ax, bz - az));
    const along = (k: number) => [Math.round(ax + ((bx - ax) * k) / n), Math.round(az + ((bz - az) * k) / n)];
    for (let k = 0; k <= n; k++) {
      const [x, z] = along(k);
      for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [-1, 0]]) {
        const gx = x + dx, gz = z + dz, g = outsideHeight(gx, gz);
        if (r(gx, 21, gz) < 0.7) put(gx, g - 1, gz, 'mud');
        clear(gx, g, g + 2, gz);
      }
    }
    // The prints, every other step, alternating feet; a fern grown over the odd one.
    for (let k = 0; k <= n; k += 2) {
      const [x, z] = along(k), px = x + (k % 4 === 0 ? 1 : 0), g = outsideHeight(px, z);
      put(px, g - 1, z, 'mud');
      put(px, g, z, r(x, 22, z) < 0.2 ? 'fern' : 'odd_tracks');
    }
    // The body on the far bank: pale, twisted, and a wide patchy pale stain round it. No wound.
    // It lies on a low rise, level, so it shows over the ground between it and the bridge.
    const bd = F.body;
    for (let dz = -4; dz <= 4; dz++) for (let dx = -6; dx <= 6; dx++) {
      const x = bd.x + dx, z = bd.z + dz, e = (dx * dx) / 26 + (dz * dz) / 10 + (r(x, 24, z) - 0.5) * 0.3;
      if (e > 1.7) continue;
      // An oval rise, stepping down a block at its rim into the land round it.
      const top = e < 1 ? bd.y : Math.max(outsideHeight(x, z), bd.y - 1);
      for (let y = Math.min(outsideHeight(x, z), top) - 2; y < top; y++) put(x, y, z, y === top - 1 ? 'forest_floor' : 'dirt');
      clear(x, top, top + 3, z);
      if (e < 0.9 && r(x, 23, z) < 0.7) put(x, top, z, 'pale_stain');
    }
    put(bd.x, bd.y, bd.z, 'pale_body');
    put(bd.x + 1, bd.y, bd.z, 'pale_legs');
  }
  void ROAD; void roadZ;
}
