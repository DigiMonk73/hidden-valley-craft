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
export const CREEK: [number, number][] = [
  [1628, 1033], [1646, 1046], [1668, 1051], [1692, 1060], [1714, 1071], [1734, 1084], [1752, 1094], [1766, 1098],
];

/**
 * The hidden river: rain on the higher mountains soaks into the limestone, runs underground and
 * bursts out of both faces of the ridge between the canyon and the valley, a few blocks below its top.
 * Each spring pours from a dark opening as a curtain two blocks thick. `x` is the curtain's column
 * against the rock, `dir` the way the face looks (+1 east into the valley, −1 west into the canyon),
 * `top` the opening's floor, where the river runs out. The rock above each opening stays dry.
 */
export interface Falls { x: number; z0: number; z1: number; top: number; dir: 1 | -1 }
export const WATERFALL: Falls = { x: 1601, z0: 1021, z1: 1028, top: 105, dir: 1 };
/** The canyon spring is the stronger: a wider curtain, from the same river at the same height. */
export const CANYON_FALLS: Falls = { x: 1581, z0: 1020, z1: 1029, top: 105, dir: -1 };
export const SPRINGS: Falls[] = [WATERFALL, CANYON_FALLS];
/** How deep each opening runs back into the rock, and how tall it is above the water. */
export const SPRING_OPENING = { depth: 5, height: 4 };

/**
 * How loud a waterfall's roar is at (x, z): full on its own side of the ridge, muffled by the rock when
 * heard from the other side, and blending from one to the other along the tunnel through the ridge.
 */
export function fallsLoudness(f: Falls, x: number, z: number, inValley: boolean): number {
  const full = f.dir === 1 ? 0.9 : 1, muffled = 0.3;
  let valleySide = inValley ? 1 : 0;
  if (Math.abs(z - 1024) < 30 && x > CANYON_FALLS.x - 1 && x < WATERFALL.x + 1)
    valleySide = Math.min(1, Math.max(0, (x - (CANYON_FALLS.x - 1)) / (WATERFALL.x - CANYON_FALLS.x + 2)));
  const own = f.dir === 1 ? valleySide : 1 - valleySide;
  return muffled + (full - muffled) * own;
}

/** Outside the west wall: the canyon and its pool, joined to the valley pool by the drowned tunnel. */
export const CANYON = { x: 1560, halfFloor: 14, wallRun: 16, z0: 620, z1: 1460 };
/** The canyon pool lies at the foot of the ridge, so the canyon falls land in it. */
export const CANYON_POOL = { cx: 1573, cz: 1024, radius: 9, depth: 5 };
/**
 * The drowned tunnel: straight through the ridge from the foot of one face to the foot of the other,
 * just under the pools' surface. Each mouth is a dark opening in the cliff right under its curtain,
 * with a warm lamp set in its frame, so whoever dives through the white water sees the way at once.
 * `x0` is the canyon face's column, `x1 − 1` the valley face's. Rows y0 … y1 − 1 are water.
 */
export const TUNNEL = { x0: CANYON_FALLS.x + 1, x1: WATERFALL.x, z: 1024, y0: 66, y1: 69, halfWidth: 1 };
/** The deep water under each curtain, in front of its mouth: x range [x0, x1), down to the tunnel's floor. */
export const MOUTH_BASINS = {
  canyon: { x0: TUNNEL.x0 - 4, x1: TUNNEL.x0, z0: CANYON_FALLS.z0, z1: CANYON_FALLS.z1 },
  valley: { x0: TUNNEL.x1, x1: TUNNEL.x1 + 4, z0: WATERFALL.z0, z1: WATERFALL.z1 },
};
/** The current in the tunnel: the canyon spring pushes harder, so the water runs toward the valley (m/s, +x). */
export const RIVER_CURRENT = 0.5;

/**
 * A saved position inside the version-4 tunnel, air pocket or shafts, which are solid rock now: where to
 * put the player instead (afloat by the valley mouth), or null if the position is fine.
 */
export function rescueFromOldTunnel(x: number, y: number, z: number): [number, number, number] | null {
  if (x < 1560 || x >= 1616 || z < 1018 || z >= 1031 || y < 58) return null;
  const inTunnel = x >= TUNNEL.x0 - 4 && x < TUNNEL.x1 + 4 && y >= TUNNEL.y0 - 0.05 && y < TUNNEL.y1 && Math.abs(z - (TUNNEL.z + 0.5)) <= TUNNEL.halfWidth + 0.2;
  // The old tunnel and its shafts ran below anything open today (the pools' deepest water is at y 65).
  const belowAll = y < 64.6;
  // The old air pocket, x 1583–1590, z 1022–1026, up to y 68: rock now, but for the new tunnel through it.
  const oldPocket = x >= 1583 && x < 1591 && z >= 1022 && z < 1027 && y < 68 && !inTunnel;
  return belowAll || oldPocket ? [MOUTH_BASINS.valley.x1 - 0.5, 69 - 0.4, TUNNEL.z + 0.5] : null;
}

/** The stream the canyon pool spills into: south along the canyon floor until it sinks into the gravel. */
export const CANYON_STREAM: [number, number][] = [
  [1575, 1030], [1572, 1042], [1569, 1060], [1567, 1080], [1565, 1100], [1563, 1118],
];

/**
 * The builder's gate, halfway along the tunnel. It knows you: it opens by itself as a swimmer comes
 * within a couple of blocks of it, from either side, and closes behind them (src/sim/gate.ts).
 */
const GATE_X = Math.floor((TUNNEL.x0 + TUNNEL.x1) / 2);
export const GATE = { x0: GATE_X, x1: GATE_X + 2, z0: TUNNEL.z - TUNNEL.halfWidth, z1: TUNNEL.z + TUNNEL.halfWidth + 1, y0: TUNNEL.y0, y1: TUNNEL.y1 };

/** The lamps in each mouth's frame: one over the opening at the waterline, one either side. */
export const MOUTH_LAMPS: [number, number, number][] = [TUNNEL.x0, TUNNEL.x1 - 1].flatMap((x) => [
  [x, TUNNEL.y1, TUNNEL.z], [x, TUNNEL.y0 + 1, TUNNEL.z - TUNNEL.halfWidth - 1], [x, TUNNEL.y0 + 1, TUNNEL.z + TUNNEL.halfWidth + 1],
] as [number, number, number][]);
/** The tunnel is lit all the way: a lamp in the roof or a wall beside every block of it. */
export const TUNNEL_LAMPS: [number, number, number][] = [];
for (let x = TUNNEL.x0 + 1; x < TUNNEL.x1 - 1; x++) {
  if (x % 2 === 0) TUNNEL_LAMPS.push([x, TUNNEL.y1, TUNNEL.z]);
  else TUNNEL_LAMPS.push([x, TUNNEL.y0 + 1, (x >> 1) % 2 ? TUNNEL.z - TUNNEL.halfWidth - 1 : TUNNEL.z + TUNNEL.halfWidth + 1]);
}

/**
 * The switchback up the canyon's west wall, from the canyon floor beside the pool to the rim where
 * the old road begins: x, z, walking height (one block up for every two along).
 */
export const RAMP: [number, number, number][] = [
  [1562, 1030, 71], // beside the canyon pool
  [1556, 1031, 71],
  [1552, 1057, 84],
  [1546, 1061, 86],
  [1543, 1035, 99],
  [1538, 1031, 101],
  [1534, 1052, 0], // the road's height here, filled in below
];
export const RAMP_HALF_WIDTH = 1.9;

/** The old road: cracked asphalt, four wide, from the top of the ramp west through the buffer to the saddle and on. */
export const ROAD = { east: 1534, west: 940, halfWidth: 2 };

/** The buffer's places, off the road (DESIGN.md: wilderness buffer). */
export const PLACES = {
  rangerSign: { x: 1497, z: 0 }, // z beside the road, filled in below
  morphoTree: { x: 1322, z: 0, clearing: 9 },
  warren: { x: 1418, z: 0, radius: 7 },
  /** The ruined radio tower on Zone-4's ridge: seen from afar, not reachable yet. */
  ridgeTower: { x: 360, z: 380, height: 64 },
};

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

/** The saddle: the road tops out between two knolls (+knoll m, `knollOffset` m either side of the road). */
export const SADDLE = { x: 1150, crest: 7, knoll: 16, knollOffset: 34, knollRadius: 24 };

/**
 * Zone-1's near band (docs/PHASE4.md), along the road west of the saddle. Boxes are [x0, x1) × [z0, z1);
 * z values and floor heights are filled in at the end of this file, from the road.
 */
export const ZONE1 = {
  /** The farm sign and the cattle grid, at the saddle's crest. */
  saddleSign: { x: 1146, z: 0 },
  cattleGrid: { x0: 1148, x1: 1150 },
  /** Marco's bus shelter: a roof on posts on the road's north side, open to the road. */
  shelter: { x0: 1109, x1: 1115, z0: 0, z1: 0, floor: 0 },
  /** The raider scout, lying on the road, and his dropped lamp. */
  scout: { x: 1090, z: 0, y: 0 },
  /** The farmstead's broken gate on the road's south side, the track south, and the yard. */
  farmGate: { x: 1078, z: 0 },
  farm: { x0: 1052, x1: 1093, z0: 1054, z1: 1083, floor: 0 },
  house: { x0: 1055, x1: 1063, z0: 1059, z1: 1066 },
  barn: { x0: 1078, x1: 1087, z0: 1057, z1: 1065 },
  coop: { x0: 1064, x1: 1069, z0: 1072, z1: 1076 },
  /** The rusted pickup on the road's north shoulder. */
  truck: { x0: 1034, x1: 1039, z0: 0 },
  /** The mid band's outpost (Phase 5): only its smoke, seen from the saddle. */
  smoke: { x: 860, z: 0 },
};

/** Is (x, z) on the dirt track from the farm's gate straight south to the yard (two blocks wide)? */
export function onFarmTrack(x: number, z: number): boolean {
  const g = ZONE1.farmGate;
  return x >= g.x - 1 && x <= g.x && z >= g.z && z < ZONE1.farm.z0 + 1;
}

/** Is (x, z) in the farmyard? */
export function inFarmyard(x: number, z: number, margin = 0): boolean {
  const f = ZONE1.farm;
  return x >= f.x0 - margin && x < f.x1 + margin && z >= f.z0 - margin && z < f.z1 + margin;
}

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

/** Distance to the canyon stream's centre line, and how far along it (0 at the pool … 1 where it sinks). */
export function canyonStreamAt(x: number, z: number): { dist: number; t: number } {
  let best = Infinity, along = 0, total = 0, at = 0;
  for (let i = 0; i < CANYON_STREAM.length - 1; i++) {
    const [ax, az] = CANYON_STREAM[i], [bx, bz] = CANYON_STREAM[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const [d, t] = distToSegment(x, z, ax, az, bx, bz);
    if (d < best) { best = d; at = along + t * len; }
    along += len;
  }
  total = along;
  return { dist: best, t: at / total };
}

/** Is (x, z) on the canyon stream's water (widened by `extra`)? It thins along the way and is gone by its end. */
export function inCanyonStream(x: number, z: number, extra = 0): boolean {
  if (Math.abs(x - CANYON.x) > 30 || z < CANYON_STREAM[0][1] - 3 || z > CANYON_STREAM[CANYON_STREAM.length - 1][1] + 3) return false;
  const st = canyonStreamAt(x, z);
  return st.t < 0.93 && st.dist < 1.9 - 1.2 * st.t + extra;
}

/**
 * The tunnel's current at a point (m/s along +x, toward the valley), or 0 outside it.
 */
export function riverCurrent(x: number, y: number, z: number): number {
  if (y < TUNNEL.y0 || y >= TUNNEL.y1 || x < TUNNEL.x0 || x >= TUNNEL.x1) return 0;
  return Math.abs(Math.floor(z) - TUNNEL.z) <= TUNNEL.halfWidth ? RIVER_CURRENT : 0;
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

/** Walking height of the land outside the valley's cliff: the land itself, with the ramp and the road cut into it. */
export function outsideHeight(x: number, z: number): number {
  const onRoadX = x <= ROAD.east + 1 && x >= ROAD.west - 6;
  const roadD = onRoadX ? Math.abs(z + 0.5 - roadZ(x)) : Infinity;
  if (roadD < ROAD.halfWidth) return roadHeight(x);
  const ramp = rampAt(x, z);
  if (ramp.dist < RAMP_HALF_WIDTH) return Math.round(ramp.height);
  const natural = naturalHeight(x, z, true);
  // The ramp is a ledge cut into the west wall: between it and the rising rock behind, the ground is
  // filled up to the ramp, so no gully opens on its inner side.
  if (ramp.dist < RAMP_HALF_WIDTH + 5 && natural < ramp.height && naturalHeight(x - 5, z, false) >= ramp.height) return Math.round(ramp.height);
  // Zone-1's places stand on level ground: the bus shelter's floor, the farm track and the farmyard.
  if (x > 1040 && x < 1125 && z > 1010 && z < 1095) {
    const sh = ZONE1.shelter, f = ZONE1.farm, g = ZONE1.farmGate;
    if (x >= sh.x0 - 2 && x < sh.x1 + 2 && z >= sh.z0 - 2 && z < sh.z1 + 1) return sh.floor;
    if (onFarmTrack(x, z)) return Math.round(mix(roadHeight(g.x), f.floor, smoothstep(g.z, f.z0, z)));
    const dx = Math.max(f.x0 - x, x - (f.x1 - 1), 0), dz = Math.max(f.z0 - z, z - (f.z1 - 1), 0), d = Math.hypot(dx, dz);
    if (d < 7) return Math.round(mix(f.floor, natural, smoothstep(0, 7, d)));
  }
  if (onRoadX) {
    const d = roadD;
    // Shoulders: the land eases down (or up) to the road over a few blocks.
    if (d < ROAD.halfWidth + 3.5) return Math.round(mix(roadHeight(x), natural, smoothstep(ROAD.halfWidth, ROAD.halfWidth + 3.5, d)));
  }
  // The rabbit warren: a low grassy bank beside the road.
  const w = PLACES.warren;
  const wd = Math.hypot(x - w.x, z - w.z);
  if (wd < w.radius + 3) return Math.round(natural + 3 * (1 - smoothstep(w.radius - 3, w.radius + 3, wd)));
  return Math.round(natural);
}

/**
 * How sheer the canyon's east wall is at z: a long cliff band with the canyon falls in its middle
 * (1), easing back into the canyon's sloping wall well to either side (0), so the falls sit in the
 * face rather than on a spur standing out of it.
 */
function canyonHeadwall(z: number): number {
  const mid = (CANYON_FALLS.z0 + CANYON_FALLS.z1) / 2, half = (CANYON_FALLS.z1 - CANYON_FALLS.z0) / 2;
  return 1 - smoothstep(half + 20, half + 44, Math.abs(z + 0.5 - mid));
}

/** Where the headwall's foot stands: straight behind the falls, a little ragged either side. */
function headwallX(z: number): number {
  const mid = (CANYON_FALLS.z0 + CANYON_FALLS.z1) / 2, half = (CANYON_FALLS.z1 - CANYON_FALLS.z0) / 2;
  const away = smoothstep(half + 2, half + 6, Math.abs(z + 0.5 - mid));
  return CANYON_FALLS.x + 0.5 + away * Math.round(1.6 * noiseB.noise2(z / 6, 3.7) + 0.6);
}

/** The land outside the valley before anything is built on it. `fine` adds the small bumps (not under the road). */
function naturalHeight(x: number, z: number, fine: boolean): number {
  // Large regions, west of the valley along the road.
  let base: number;
  if (x >= ZONES.saddleX) {
    // Wilderness buffer: cloud-forest upland climbing toward the saddle.
    base = 96 + 14 * smoothstep(1460, ZONES.saddleX, x);
  } else if (x >= ZONES.ravineX + 40) {
    // Zone-1 basin: sloping gently down from the saddle toward the ravine.
    base = mix(84, 110, smoothstep(ZONES.midX - 40, ZONES.saddleX, x)); // meets the buffer's 110 at the saddle
  } else {
    // West of the ravine: Zone-3's river plain.
    base = 76;
  }
  // Two ridges frame the saddle and the road through the buffer and Zone-1.
  for (const rz of [876, 1176]) {
    const along = smoothstep(820, 980, x) * (1 - smoothstep(1420, 1520, x));
    base = Math.max(base, mix(base, 146 - Math.abs(z - rz) * 1.1, along));
  }
  // The saddle: the road tops out on a low crest between two knolls, the gateway into Zone-1.
  const sx = Math.abs(x - SADDLE.x);
  if (sx < 90) {
    const rz = roadZ(x), across = Math.abs(z + 0.5 - rz);
    const crest = SADDLE.crest * Math.exp(-(((x - SADDLE.x) / 34) ** 2)) * (1 - smoothstep(40, 80, across));
    const knoll = SADDLE.knoll * (1 - smoothstep(6, SADDLE.knollRadius, Math.hypot(x - SADDLE.x, across - SADDLE.knollOffset)));
    base += Math.max(crest, knoll);
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
  base += 5 * noiseB.fbm2(x / 70, z / 70, 4) + (fine ? 1.5 * noise.noise2(x / 9, z / 9) : 0);

  // The canyon west of the valley: steep walls, flat floor.
  if (z > CANYON.z0 - 40 && z < CANYON.z1 + 40) {
    const cc = canyonCenterX(z), cd = Math.abs(x - cc);
    const endFade = smoothstep(CANYON.z0 - 40, CANYON.z0 + 40, z) * (1 - smoothstep(CANYON.z1 - 40, CANYON.z1 + 40, z));
    // Where the canyon spring bursts out, its east wall is a sheer headwall the falls pour down,
    // easing back into the canyon's sloping wall either side.
    let lo = CANYON.halfFloor, run = CANYON.wallRun;
    const s = x > cc ? canyonHeadwall(z) : 0;
    if (s > 0) { lo = mix(lo, headwallX(z) - cc, s); run = mix(run, 0.5, s); }
    const wall = smoothstep(lo, lo + run, cd);
    const canyon = mix(VALLEY.floor + 1 + noise.noise2(x / 12, z / 12), base, Math.pow(wall, 0.6));
    base = mix(base, Math.min(base, canyon), endFade);
  }

  // The ravine at the end of Zone-1's road: a deep north-south cut.
  const rd = Math.abs(x - (ZONES.ravineX + 6 * Math.sin(z / 45)));
  if (rd < 26) base = mix(42, base, smoothstep(10, 26, rd));

  // The world's edge rises into a range of forested mountains, so no edge is ever seen.
  const edge = Math.min(x, z, WORLD_X - 1 - x, WORLD_Z - 1 - z);
  const peaks = 150 + 28 * (1 - Math.abs(noiseB.noise2(x / 140, z / 140))) + 10 * noise.noise2(x / 45, z / 45);
  base = mix(base, Math.max(base, peaks), smoothstep(280, 30, edge));

  return Math.max(30, Math.min(182, base));
}

/** Walking height anywhere, ignoring the cliff's 3D shape (used for trees and the map). */
export function surfaceHeight(x: number, z: number): number {
  const d = distToValley(x, z);
  if (d < VALLEY.radius - 6) return valleyFloorHeight(x, z);
  return outsideHeight(x, z);
}

// ---------------------------------------------------------------------------------------
// The way out: the ramp and the old road.
// ---------------------------------------------------------------------------------------

/** The road's centre line: straight west along the buffer, bending north-east up to the ramp's top. */
export function roadZ(x: number): number {
  const bend = smoothstep(1380, ROAD.east, x);
  return VALLEY.cz + 28 * bend + 4 * Math.sin(x / 53) * (1 - bend);
}

const roadHeights = new Float32Array(WORLD_X).fill(NaN);

/** The road's walking height at x: the lie of the land along it, without the small bumps. */
export function roadHeight(x: number): number {
  const i = Math.max(0, Math.min(WORLD_X - 1, Math.floor(x)));
  if (Number.isNaN(roadHeights[i])) roadHeights[i] = Math.round(naturalHeight(i, Math.floor(roadZ(i)), false));
  return roadHeights[i];
}

/** Distance to the ramp's centre line and its walking height there. */
export function rampAt(x: number, z: number): { dist: number; height: number } {
  let best = Infinity, height = 0;
  if (x < 1526 || x > 1564 || z < 1022 || z > 1068) return { dist: best, height };
  for (let i = 0; i < RAMP.length - 1; i++) {
    const a = RAMP[i], b = RAMP[i + 1];
    const [d, t] = distToSegment(x + 0.5, z + 0.5, a[0], a[1], b[0], b[1]);
    if (d < best) { best = d; height = mix(a[2], b[2], t); }
  }
  return { dist: best, height };
}

/** Is (x, z) on the road or ramp (with a margin), where nothing grows? */
export function onRoad(x: number, z: number, margin = 0): boolean {
  if (rampAt(x, z).dist < RAMP_HALF_WIDTH + margin) return true;
  return x <= ROAD.east + 1 && x >= ROAD.west && Math.abs(z + 0.5 - roadZ(x)) < ROAD.halfWidth + margin;
}

// The ramp ends at the road's height; the places sit beside the road.
RAMP[RAMP.length - 1][2] = roadHeight(ROAD.east);
PLACES.rangerSign.z = Math.round(roadZ(PLACES.rangerSign.x)) + 4;
PLACES.morphoTree.z = Math.round(roadZ(PLACES.morphoTree.x)) - 17;
PLACES.warren.z = Math.round(roadZ(PLACES.warren.x)) + 15;
{
  const rz = (x: number) => Math.round(roadZ(x));
  const Z = ZONE1;
  Z.saddleSign.z = rz(Z.saddleSign.x) - 4;
  Z.shelter.z1 = rz((Z.shelter.x0 + Z.shelter.x1) >> 1) - 3;
  Z.shelter.z0 = Z.shelter.z1 - 3;
  Z.shelter.floor = roadHeight((Z.shelter.x0 + Z.shelter.x1) >> 1);
  Z.scout.z = rz(Z.scout.x);
  Z.scout.y = roadHeight(Z.scout.x);
  Z.farmGate.z = rz(Z.farmGate.x) + ROAD.halfWidth;
  Z.farm.floor = roadHeight(Z.farmGate.x) - 1;
  Z.truck.z0 = rz(Z.truck.x0) - ROAD.halfWidth - 3;
  Z.smoke.z = rz(Z.smoke.x) + 6;
}
