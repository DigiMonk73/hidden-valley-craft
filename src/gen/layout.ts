// The designed world: every named place and the large shapes of the land, as plain numbers
// and pure functions. Positions follow DESIGN.md's script (docs/PLAN.md, "The zones").
// The generator (terrain.ts) turns this into blocks; noise only adds surface detail.

import { Simplex } from '../core/noise.ts';
import { WORLD_X, WORLD_Z } from '../world/constants.ts';

export const SEED = 73;

/** The valley: a karst sinkhole on the east side of the world. */
export const VALLEY = {
  cx: 1700,
  cz: 1024,
  radius: 100, // rim radius at the cliff face
  floor: 70, // walking height on the valley floor (top solid block is y = 69)
  water: 69, // water surface block of the pool and creek
  rim: 118, // typical plateau height around the valley
};

/** The builder's cave, cut into the east wall and facing west across the valley. */
export const HOME = {
  floor: 82, // walking height in the cave and on the balcony
  wallX: 1800, // the cliff face at the cave
  // Rooms are boxes of air [x0, x1) × [y0, y1) × [z0, z1).
  rooms: [
    { name: 'mouth', x0: 1798, x1: 1802, y0: 82, y1: 89, z0: 1017, z1: 1031 },
    { name: 'living', x0: 1801, x1: 1815, y0: 82, y1: 88, z0: 1015, z1: 1033 },
    { name: 'hall', x0: 1815, x1: 1825, y0: 82, y1: 86, z0: 1022, z1: 1026 },
    { name: 'workshopDoor', x0: 1818, x1: 1821, y0: 82, y1: 85, z0: 1020, z1: 1022 },
    { name: 'workshop', x0: 1817, x1: 1832, y0: 82, y1: 88, z0: 1006, z1: 1020 },
    { name: 'pantryDoor', x0: 1818, x1: 1821, y0: 82, y1: 85, z0: 1026, z1: 1028 },
    { name: 'pantry', x0: 1817, x1: 1830, y0: 82, y1: 87, z0: 1028, z1: 1040 },
    { name: 'vaultDoor', x0: 1825, x1: 1827, y0: 82, y1: 85, z0: 1023, z1: 1025 },
    { name: 'vault', x0: 1827, x1: 1833, y0: 82, y1: 86, z0: 1021, z1: 1027 },
  ],
  /** The pantry's back wall is the builder's rich iron vein. */
  ironVein: { x0: 1830, x1: 1834, y0: 81, y1: 88, z0: 1027, z1: 1041 },
  /** The balcony: a natural ledge in front of the mouth, paved by the builder. */
  balcony: { x0: 1792, x1: 1801, z0: 1013, z1: 1035 },
  lanterns: [
    [1801, 87, 1016], [1801, 87, 1031], [1808, 87, 1024], [1813, 87, 1016], [1813, 87, 1032],
    [1820, 85, 1024], [1824, 87, 1013], [1824, 86, 1034], [1830, 85, 1024],
  ] as [number, number, number][],
};

/** The path from the balcony's north end down to the valley floor: one gentle S-curve. */
export const PATH: [number, number, number][] = [
  // x, z, walking height
  [1796, 1012, 82],
  [1796, 1003, 79.5],
  [1791, 995, 77],
  [1782, 997, 75],
  [1776, 1006, 72.5],
  [1768, 1011, 70],
];
export const PATH_HALF_WIDTH = 1.6;

/** The pool under the waterfall on the west wall, and the creek that leaves it. */
export const POOL = { cx: 1615, cz: 1024, radius: 14, depth: 5 };
export const WATERFALL = { x: 1601, z0: 1021, z1: 1028, top: 113 };
export const CREEK: [number, number][] = [
  [1628, 1033], [1646, 1046], [1668, 1051], [1692, 1060], [1714, 1071], [1734, 1084], [1752, 1094], [1766, 1098],
];

/** Outside the west wall: the canyon and its pool, joined to the valley pool by the drowned tunnel. */
export const CANYON = { x: 1560, halfFloor: 14, wallRun: 16, z0: 620, z1: 1460 };
export const CANYON_POOL = { cx: 1564, cz: 1024, radius: 9, depth: 5 };
export const TUNNEL = { x0: 1566, x1: 1607, z: 1024, y0: 62, y1: 65, halfWidth: 1 };

/** The garden ground at the foot of the path, kept clear of trees for Phase 2's planting. */
export const GARDEN = { x0: 1728, x1: 1770, z0: 1012, z1: 1050 };

/** Danger zones, west of the valley along the old road (docs/PLAN.md, "The map"). */
export const ZONES = {
  saddleX: 1150,
  nearX: 950, // near band runs saddle → nearX
  midX: 760, // mid band runs nearX → midX
  ravineX: 640, // deep band runs midX → ravine
  zone2Z: 650, // north of this, beyond Zone-1: faction territory
};

export type ZoneId = 'valley' | 'canyon' | 'buffer' | 'near' | 'mid' | 'deep' | 'zone2' | 'zone3' | 'zone4';

export const ZONE_DANGER: Record<ZoneId, number> = {
  valley: 0, canyon: 1, buffer: 1, near: 2, mid: 3, deep: 4, zone2: 5, zone3: 6, zone4: 7,
};

export function distToValley(x: number, z: number): number {
  return Math.hypot(x - VALLEY.cx, z - VALLEY.cz);
}

/** The sanctuary covers the valley inside its rim plus a margin, at every height. */
export function inSanctuary(x: number, z: number): boolean {
  return distToValley(x, z) < VALLEY.radius + 8;
}

export function zoneAt(x: number, z: number): ZoneId {
  if (inSanctuary(x, z)) return 'valley';
  if (x < 450 && z < 450) return 'zone4';
  if (x < ZONES.ravineX) return 'zone3';
  if (z < ZONES.zone2Z) return 'zone2';
  if (x >= ZONES.saddleX) {
    const inCanyon = Math.abs(x - canyonCenterX(z)) < 40 && z > CANYON.z0 && z < CANYON.z1;
    return inCanyon ? 'canyon' : 'buffer';
  }
  if (x >= ZONES.nearX) return 'near';
  if (x >= ZONES.midX) return 'mid';
  return 'deep';
}

export function canyonCenterX(z: number): number {
  return CANYON.x + 8 * Math.sin(z / 70);
}

// ---------------------------------------------------------------------------------------
// Height of the land (number of solid blocks in the column, so walking height), without
// the cliff overhangs, caves or water that terrain.ts adds. Pure and deterministic.
// ---------------------------------------------------------------------------------------

const noise = new Simplex(SEED);
const noiseB = new Simplex(SEED + 1);

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): [number, number] {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / len2)) : 0;
  return [Math.hypot(px - (ax + t * dx), pz - (az + t * dz)), t];
}

/** Distance to the creek's centre line. */
export function creekDistance(x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < CREEK.length - 1; i++) {
    const [d] = distToSegment(x, z, CREEK[i][0], CREEK[i][1], CREEK[i + 1][0], CREEK[i + 1][1]);
    if (d < best) best = d;
  }
  return best;
}

/** Distance to the path and the walking height there (Infinity when far from it). */
export function pathAt(x: number, z: number): { dist: number; height: number } {
  let best = Infinity, height = 0;
  for (let i = 0; i < PATH.length - 1; i++) {
    const a = PATH[i], b = PATH[i + 1];
    const [d, t] = distToSegment(x, z, a[0], a[1], b[0], b[1]);
    if (d < best) { best = d; height = mix(a[2], b[2], t); }
  }
  return { dist: best, height };
}

/** Walking height of the valley floor. */
export function valleyFloorHeight(x: number, z: number): number {
  const inGarden = x >= GARDEN.x0 && x < GARDEN.x1 && z >= GARDEN.z0 && z < GARDEN.z1;
  if (inGarden) return VALLEY.floor;
  const n = noise.fbm2(x / 38, z / 38, 3);
  return VALLEY.floor + Math.round(Math.max(-1, Math.min(1, n * 1.6)));
}

/** Walking height of the land outside the valley's cliff (the plateau and the zones). */
export function outsideHeight(x: number, z: number): number {
  // Large regions, west of the valley along the road.
  let base: number;
  if (x >= ZONES.saddleX) {
    // Wilderness buffer: cloud-forest upland climbing toward the saddle.
    base = 96 + 14 * smoothstep(1460, ZONES.saddleX, x);
  } else if (x >= ZONES.ravineX + 40) {
    // Zone-1 basin: sloping gently down from the saddle toward the ravine.
    base = mix(84, 108, smoothstep(ZONES.midX - 40, ZONES.saddleX, x));
  } else {
    // West of the ravine: Zone-3's river plain.
    base = 76;
  }
  // Two ridges frame the saddle and the road through the buffer and Zone-1.
  for (const rz of [876, 1176]) {
    const along = smoothstep(820, 980, x) * (1 - smoothstep(1420, 1520, x));
    base = Math.max(base, mix(base, 146 - Math.abs(z - rz) * 1.1, along));
  }
  // North: Zone-2's rolling ground.
  base = mix(base, 92, smoothstep(ZONES.zone2Z + 120, ZONES.zone2Z - 60, z) * smoothstep(ZONES.ravineX, ZONES.ravineX + 60, x));
  // North-west corner: Zone-4's mountains.
  const nw = Math.hypot(x - 200, z - 200);
  base = mix(base, 172, smoothstep(520, 180, nw));

  // The plateau the valley is sunk into.
  const d = distToValley(x, z);
  const plateau = VALLEY.rim + 5 * noise.fbm2(x / 55, z / 55, 3);
  base = mix(base, plateau, 1 - smoothstep(130, 200, d));

  // Surface detail.
  base += 5 * noiseB.fbm2(x / 70, z / 70, 4) + 1.5 * noise.noise2(x / 9, z / 9);

  // The canyon west of the valley: steep walls, flat floor.
  if (z > CANYON.z0 - 40 && z < CANYON.z1 + 40) {
    const cd = Math.abs(x - canyonCenterX(z));
    const endFade = smoothstep(CANYON.z0 - 40, CANYON.z0 + 40, z) * (1 - smoothstep(CANYON.z1 - 40, CANYON.z1 + 40, z));
    const wall = smoothstep(CANYON.halfFloor, CANYON.halfFloor + CANYON.wallRun, cd);
    const canyon = mix(VALLEY.floor + 1 + noise.noise2(x / 12, z / 12), base, Math.pow(wall, 0.6));
    base = mix(base, Math.min(base, canyon), endFade);
  }

  // The ravine at the end of Zone-1's road: a deep north-south cut.
  const rd = Math.abs(x - (ZONES.ravineX + 6 * Math.sin(z / 45)));
  if (rd < 26) base = mix(42, base, smoothstep(10, 26, rd));

  // The world's edge rises into mountains so no edge is ever seen.
  const edge = Math.min(x, z, WORLD_X - 1 - x, WORLD_Z - 1 - z);
  base = mix(base, 176, smoothstep(90, 10, edge));

  return Math.round(Math.max(30, Math.min(182, base)));
}

/** Walking height anywhere, ignoring the cliff's 3D shape (used for trees and the map). */
export function surfaceHeight(x: number, z: number): number {
  const d = distToValley(x, z);
  if (d < VALLEY.radius - 6) return valleyFloorHeight(x, z);
  return outsideHeight(x, z);
}
