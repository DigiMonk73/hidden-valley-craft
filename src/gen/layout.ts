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
/**
 * The water in front of each mouth: x range [x0, x1). Under the two curtain columns it is deep, down to
 * the tunnel's floor; beyond them its gravel floor climbs one block at a time to a ledge just under the
 * surface, so a swimmer holding forward out of the mouth is carried up step by step until their head
 * is out (`basinFloor`), with no wall to stop at and no need to swim up.
 */
export const MOUTH_BASINS = {
  canyon: { x0: TUNNEL.x0 - 5, x1: TUNNEL.x0, z0: CANYON_FALLS.z0, z1: CANYON_FALLS.z1 },
  valley: { x0: TUNNEL.x1, x1: TUNNEL.x1 + 5, z0: WATERFALL.z0, z1: WATERFALL.z1 },
};

/** The walking height of a mouth basin's floor at (x, z) (the tunnel's floor, then a block higher per block out), or null outside the basins. */
export function basinFloor(x: number, z: number): number | null {
  const c = MOUTH_BASINS.canyon, v = MOUTH_BASINS.valley;
  let k = -1;
  if (x >= c.x0 && x < c.x1 && z >= c.z0 && z < c.z1) k = c.x1 - 1 - x;
  else if (x >= v.x0 && x < v.x1 && z >= v.z0 && z < v.z1) k = x - v.x0;
  if (k < 0) return null;
  return TUNNEL.y0 + Math.max(0, k - 1); // two deep columns under the curtain, then one up per block
}
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
  return belowAll || oldPocket ? [MOUTH_BASINS.valley.x0 + 3.5, 69 - 0.4, TUNNEL.z + 0.5] : null;
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

/**
 * The old road: cracked asphalt, four wide, from the top of the ramp west through the buffer, over the
 * saddle and through Zone-1, to the broken bridge at the ravine, where it dies (docs/PHASE5.md).
 */
export const ROAD = { east: 1534, west: 659, halfWidth: 2 };

/** The buffer's places, off the road (DESIGN.md: wilderness buffer). */
export const PLACES = {
  rangerSign: { x: 1497, z: 0 }, // z beside the road, filled in below
  morphoTree: { x: 1322, z: 0, clearing: 9 },
  warren: { x: 1418, z: 0, radius: 7 },
  /** The relay tower on Zone-4's ridge: seen from afar since the buffer, reached in Phase 8 (docs/PHASE8.md). */
  ridgeTower: { x: 360, z: 380, height: 60 },
};

/** The garden ground at the foot of the path, kept clear of trees for Phase 2's planting. */
export const GARDEN = { x0: 1728, x1: 1770, z0: 1012, z1: 1050 };

/** Danger zones, west of the valley along the old road (docs/PLAN.md, "The map"). */
export const ZONES = {
  saddleX: 1150,
  nearX: 950, // near band runs saddle → nearX
  midX: 760, // mid band runs nearX → midX
  ravineX: 640, // deep band runs midX → ravine
  zone2Z: 650, // the land: north of this the ground rolls (terrain only; kept so no land changes)
  /** Faction territory begins north of this, west of the saddle (docs/PHASE6.md: moved south from 650 so the walk is short). */
  zone2Play: 760,
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
  /** The mid band's outpost: the smoke of its oil-drum cookfire, seen from the saddle. */
  smoke: { x: 860, z: 0 },
};

/** The ravine's centre line (north–south, wavering). */
export function ravineX(z: number): number {
  return ZONES.ravineX + 6 * Math.sin(z / 45);
}
/** Half the ravine's width where it is sheer, round the road: 42 m from rim to rim. */
export const RAVINE_HALF = 20.5;

/**
 * Zone-4, the radiation edge (docs/PHASE8.md): the mountains of the north-west corner, dead under the fallout
 * of the exchange. One road, the ridge road, leaves the avenue's bend by the dam, runs north along the
 * reservoir's west shore, climbs past the warning gate to the pass, and follows the ridge round the sump to
 * the relay tower. Its lamps are the dam's own line to the tower. Boxes are [x0, x1) × [z0, z1).
 */
export const ZONE4 = {
  /** The massif is measured from this point: `reach` from it, the fallout ends (the line of warning signs). */
  centre: { x: 200, z: 200 },
  reach: 484,
  /** The fallout comes no nearer the gorge's centre line than this: the reservoir's west shore is clean. */
  shoreKeep: 60,
  /** The ridge road's centre line, point to point, four wide. */
  road: {
    halfWidth: 2,
    pts: [[580, 750], [584, 730], [612, 704], [618, 655], [531, 562], [462, 490], [456, 440], [430, 397], [396, 378], [385, 386]] as [number, number][],
    /** Which of its points is which place; `shore`: the two between which it runs along the water's edge. */
    shore: [2, 3], gate: 4, pass: 5, dome: 7,
  },
  /** The sign at the bend, facing those who come off the dam. */
  sign: { x: 576, z: 750 },
  /** The pass: the road tops out between two knolls (+knoll m). The hut's yard here is clean ground. */
  pass: { knolls: [[436, 484], [492, 470]] as [number, number][], knoll: 14, knollRadius: 22 },
  clean: { x: 464, z: 480, r: 13 },
  /** The refuge hut on the pass, its door (west wall) on the road: the stove, and where Ray is met. */
  hut: { x0: 466, x1: 473, z0: 474, z1: 481, door: 477 },
  /** Where Ray stands, by the hut's door, the once he comes. */
  ray: { x: 464.5, z: 479.5 },
  /** The sump: the hollow the wash water was dumped in, the hottest ground on the ridge. The straight line from the pass to the tower crosses it; the road goes round. */
  sump: { x: 411, z: 435, r: 30, pond: 7, depth: 7, rate: 60 },
  /** The observatory: a small dome on a knoll beside the road, its door (west) toward it. */
  observatory: { x: 440, z: 388, r: 5, knoll: 5 },
  /** The tower's yard: level ground round the tower's feet and the relay station. */
  yard: { x0: 348, x1: 386, z0: 368, z1: 404 },
  /**
   * The relay station on the yard's south side. East of `split` it is lit, its door (two columns from `door`)
   * on the yard; west of it, walled off and dark, with its own open bay (rows from `bay`) in the west wall.
   */
  relay: { x0: 352, x1: 374, z0: 392, z1: 402, split: 362, door: 367, bay: 395 },
  /** The one dark place: two Ashen in the station's battery hall, by Zone-3's rules (ZONE3.nests). */
  nest: { name: 'relay', x: 356.5, z: 397, n: 2, under: false, path: [[348.5, 397], [348.5, 389.5]] as [number, number][] },
  /**
   * The dose a second without a suit: off the road, on it (asphalt sheds what soil and dead wood hold),
   * and indoors. The suit lets `suit` of it through.
   */
  rates: { off: 20, road: 6, indoors: 2 },
  suit: 0.05,
};

/**
 * Zone-1's mid and deep bands (docs/PHASE5.md). Boxes are [x0, x1) × [z0, z1); z values and floors are
 * filled in at the end of this file from the road.
 */
export const ZONE1FAR = {
  /** The raiders' outpost: a cinder-block tienda south of the road, its front (north) to the road. */
  outpost: { x0: 852, x1: 868, z0: 0, z1: 0, floor: 0, split: 0 },
  /** The yard in front, the sandbags, the cookfire under the smoke, and the stripped pickup across the road. */
  fire: { x: 860, z: 0 },
  hulk: { x0: 870, x1: 875, z0: 0 },
  /** The game trail through the brush: off the road at x 905, south, then west to the outpost's back. */
  brushTrail: [[905, 0], [905, 0], [868, 0], [858, 0]] as [number, number][],
  /** The old mine: a timbered decline south of the road, down to a chamber lined with iron and coal. */
  mine: { x: 830, z: 0, floor: 0, depth: 16, chamber: { x0: 822, x1: 839, z0: 0, z1: 0, y0: 0, y1: 0 } },
  /** The hunting camp: the trail head's marker on the road's north side, the trail north, the clearing. */
  campHead: { x: 800, z: 0 },
  camp: { x0: 780, x1: 817, z0: 958, z1: 988, floor: 0 },
  lodge: { x0: 783, x1: 792, z0: 961, z1: 968 },
  shed: { x0: 803, x1: 811, z0: 963, z1: 968 },
  /**
   * Where the jaguar crosses: in from the clearing's west edge in front of the lodge, a stop to look at you
   * well west of the trail (so walking to the lodge or the shed doesn't brush it), then out past the shed.
   */
  jaguarPath: [[778, 973], [786, 973], [818, 971]] as [number, number][],
  /** The broken bridge: the road's end (near abutment) and the far abutment across the ravine. */
  bridge: { near: 0, deckEnd: 0, far: 0, farDeck: 0, z: 0, y: 0 },
  /** The body on the far bank, in the line of sight from the deck's end. */
  body: { x: 0, z: 0, y: 0 },
  /** The two-legged tracks on the near bank, north of the road's end, never near the body. */
  tracks: [[0, 0], [0, 0]] as [number, number][],
};

/** Is (x, z) on the camp's trail, from the road north to the clearing (two wide)? */
export function onCampTrail(x: number, z: number): boolean {
  const h = ZONE1FAR.campHead;
  return x >= h.x - 1 && x <= h.x && z <= h.z && z >= ZONE1FAR.camp.z1 - 1;
}

/** Distance from (x, z) to the brush trail's centre line. */
export function brushTrailDist(x: number, z: number): number {
  const t = ZONE1FAR.brushTrail;
  let best = Infinity;
  for (let i = 0; i < t.length - 1; i++) best = Math.min(best, distToSegment(x + 0.5, z + 0.5, t[i][0], t[i][1], t[i + 1][0], t[i + 1][1])[0]);
  return best;
}

/** The brush: a band of thick bushes either side of the trail, from the road round to the outpost's back. */
export function inBrush(x: number, z: number): boolean {
  const d = brushTrailDist(x, z);
  return d > 1.4 && d < 5.5;
}

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

/** The valley's bowl: inside its rim plus a margin. The land and its water are shaped by this. */
export function inValleyBowl(x: number, z: number): boolean {
  return distToValley(x, z) < VALLEY.radius + 8;
}

/** The builder's home: its rooms run from the cliff face deep into the east rock, past the bowl's edge. */
export const HOME_GROUNDS = { x0: 1786, x1: 1842, z0: 998, z1: 1050 };

/**
 * The sanctuary: the valley's bowl and the builder's home, at every height (on, in and under the rock).
 * Nothing hostile spawns, walks, targets or is knocked into it, and a death here costs nothing.
 */
export function inSanctuary(x: number, z: number): boolean {
  return inValleyBowl(x, z) || (x >= HOME_GROUNDS.x0 && x < HOME_GROUNDS.x1 && z >= HOME_GROUNDS.z0 && z < HOME_GROUNDS.z1);
}

/** The zone for play (danger, spawning, toasts): the sanctuary is the valley. */
export function zoneAt(x: number, z: number): ZoneId {
  return inSanctuary(x, z) ? 'valley' : zoneOutside(x, z);
}

/** The zone the land was shaped as: only the bowl is valley. The world generator uses this, so widening the sanctuary changes no terrain. */
export function landZoneAt(x: number, z: number): ZoneId {
  return inValleyBowl(x, z) ? 'valley' : zoneOutside(x, z, false);
}

/** `play`: the game's zones, with faction ground starting at z 760 west of the saddle; else the land's (z 650), so no terrain changes. */
function zoneOutside(x: number, z: number, play = true): ZoneId {
  if (inFallout(x, z)) return 'zone4';
  if (x < ZONES.ravineX) return 'zone3';
  if (z < ZONES.zone2Z || (play && z < ZONES.zone2Play && x < ZONES.saddleX)) return 'zone2';
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
  // Zone-1's mid and deep places stand on level ground too: the outpost's yard, the mine's head, the
  // camp's trail and clearing, and the bridge's approach.
  if (x > 760 && x < 920 && z > 940 && z < 1070) {
    if (onHighway(x, z)) return highwayHeight(z);
    const flat = farPad(x, z, natural);
    if (flat !== null) return flat;
  }
  // The dam road (docs/PHASE7.md) leaves the highway's west side: it keeps its own level up to the asphalt.
  if (onDamRoad(x, z) && !onHighway(x, z)) return damRoadHeight(x);
  // Zone-2's places (docs/PHASE6.md): the old highway north from the camp, and the level pads it serves.
  if (x > 690 && x < 900 && z > 400 && z < 960) {
    const flat = zone2Pad(x, z, natural);
    if (flat !== null) return flat;
  }
  // Zone-4's ridge road and its places (docs/PHASE8.md). Before Zone-3's: the road leaves the avenue's bend.
  if (x > 330 && x < 632 && z > 350 && z < 750) {
    const flat = zone4Pad(x, z, natural);
    if (flat !== null) return flat;
  }
  // Zone-3's places (docs/PHASE7.md): the dam road's shoulders, the avenue, the far road and the pads.
  if (x > 480 && x < 815 && z > 150 && z < 1045) {
    const flat = zone3Pad(x, z, natural);
    if (flat !== null) return flat;
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

/** The level pads round Zone-1's mid-band places, blended into the land over a few blocks; null elsewhere. */
function farPad(x: number, z: number, natural: number): number | null {
  const F = ZONE1FAR, o = F.outpost, c = F.camp, m = F.mine;
  const box = (x0: number, x1: number, z0: number, z1: number, floor: number, blend: number) => {
    const dx = Math.max(x0 - x, x - (x1 - 1), 0), dz = Math.max(z0 - z, z - (z1 - 1), 0), d = Math.hypot(dx, dz);
    return d < blend ? Math.round(mix(floor, natural, smoothstep(0, blend, d))) : null;
  };
  if (onCampTrail(x, z)) return Math.round(mix(roadHeight(F.campHead.x), c.floor, smoothstep(F.campHead.z - 2, c.z1, z)));
  return box(o.x0 - 8, o.x1 + 9, roadZ(o.x0) + ROAD.halfWidth, o.z1 + 8, o.floor, 6)
    ?? box(m.x - 4, m.x + 5, roadZ(m.x) + ROAD.halfWidth, m.z + 4, m.floor, 5)
    ?? box(c.x0, c.x1, c.z0, c.z1, c.floor, 7);
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
/** Where the dam stands across the ravine (the centre line of its crest road), north of Zone-2's border. */
const DAM_Z = 752;

function naturalHeight(x: number, z: number, fine: boolean): number {
  // Large regions, west of the valley along the road.
  let base: number;
  if (x >= ZONES.saddleX) {
    // Wilderness buffer: cloud-forest upland climbing toward the saddle.
    base = 96 + 14 * smoothstep(1460, ZONES.saddleX, x);
  } else if (x >= ravineX(z)) {
    // Zone-1 basin: sloping gently down from the saddle toward the ravine.
    base = mix(84, 110, smoothstep(ZONES.midX - 40, ZONES.saddleX, x)); // meets the buffer's 110 at the saddle
  } else {
    // West of the ravine: Zone-3's river plain. North of the dam the land stands higher, so the reservoir
    // has a west shore (docs/PHASE7.md); below the dam it falls away to the plain.
    base = mix(76, 86, smoothstep(DAM_Z + 44, DAM_Z - 6, z));
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
  // North-west corner: Zone-4's mountains. East of the gorge, and on the reservoir's shores, the old dome
  // stands as earlier phases made it. West of them it is a ridge the tower stands on (docs/PHASE8.md).
  const nw = Math.hypot(x - ZONE4.centre.x, z - ZONE4.centre.z);
  if (nw < 520) {
    const dome = mix(base, 172, smoothstep(520, 180, nw));
    const w4 = smoothstep(ravineX(z) - 50, ravineX(z) - 110, x);
    base = w4 > 0 ? mix(dome, base + ridgeLift(x, z, nw), w4) : dome;
  }

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

  // The ravine at the end of Zone-1's road: a deep north-south cut. Round the road it is a sheer gorge
  // 42 m wide (docs/PHASE5.md: no climbable descent), easing back into a steep slope further off.
  const rd = Math.abs(x - ravineX(z));
  if (rd < 26) {
    const slope = mix(42, base, smoothstep(10, 26, rd));
    const gorge = rd < RAVINE_HALF ? 42 + 2 * noiseB.noise2(x / 7, z / 7) : base;
    base = mix(slope, gorge, 1 - smoothstep(50, 90, Math.abs(z - VALLEY.cz)));
  }

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
  const F = ZONE1FAR, o = F.outpost;
  o.z0 = rz((o.x0 + o.x1) >> 1) + 8;
  o.z1 = o.z0 + 11;
  o.split = o.z0 + 6; // the wall between the front room and the back room
  o.floor = roadHeight((o.x0 + o.x1) >> 1);
  F.fire.z = Z.smoke.z;
  F.fire.x = Z.smoke.x;
  F.hulk.z0 = rz(F.hulk.x0) - ROAD.halfWidth - 3;
  const back = o.z1 + 5; // the trail runs behind the outpost
  F.brushTrail = [[905, rz(905) + ROAD.halfWidth], [905, back], [o.x1 + 1, back], [o.x1 - 6, o.z1 + 1]];
  const m = F.mine;
  m.z = rz(m.x) + ROAD.halfWidth + 4; // the head of the decline
  m.floor = roadHeight(m.x);
  m.chamber.z0 = m.z + m.depth;
  m.chamber.z1 = m.chamber.z0 + 12;
  m.chamber.y0 = m.floor - m.depth;
  m.chamber.y1 = m.chamber.y0 + 5;
  F.campHead.z = rz(F.campHead.x) - ROAD.halfWidth - 1;
  F.camp.floor = Math.round(naturalHeight((F.camp.x0 + F.camp.x1) >> 1, (F.camp.z0 + F.camp.z1) >> 1, false));
  const b = F.bridge;
  b.z = rz(ROAD.west);
  b.near = Math.ceil(ravineX(b.z) + RAVINE_HALF); // the near rim, where the road ends
  b.deckEnd = b.near - 9; // two deck sections stick out over the drop
  b.far = Math.floor(ravineX(b.z) - RAVINE_HALF); // the far rim
  b.farDeck = b.far + 4;
  b.y = roadHeight(ROAD.west);
  F.body.x = b.far - 18;
  F.body.z = b.z + 3;
  F.body.y = Math.round(naturalHeight(F.body.x, F.body.z, false)) + 2; // on a low rise
  F.tracks = [[b.near + 14, b.z - 11], [b.near + 4, b.z - 22]];
}

// ---------------------------------------------------------------------------------------
// Zone-2, faction territory (docs/PHASE6.md). The old highway runs north from the hunting camp's
// clearing, past the commercial ruins, to the gate of the faction's compound, Las Cruces: the name on
// the dead scout's map scrap. Boxes are [x0, x1) × [z0, z1); floors are filled in lazily from the land.
// ---------------------------------------------------------------------------------------

export const ZONE2 = {
  /** The highway: from the camp clearing's north edge (z0) to the compound's gate (z1), six wide. */
  highway: { z0: 958, z1: 602, halfWidth: 3 },
  /** Where the highway crosses into Zone-2: a chicane of concrete barriers painted with the faction's mark. */
  border: { z: 762 },
  /** The strip mall on the highway's east side: three shops in a row, fronts facing the highway. */
  mall: { x0: 814, x1: 828, z0: 698, z1: 743 },
  /** Its shops, south to north as you walk up the highway: pharmacy, hardware store, supermarket. */
  shops: [
    { name: 'farmacia', z0: 728, z1: 743 },
    { name: 'ferreteria', z0: 713, z1: 728 },
    { name: 'supermercado', z0: 698, z1: 713 },
  ],
  /** The parking lot between the highway and the mall. */
  lot: { x0: 803, x1: 814, z0: 696, z1: 746 },
  /** The telephone exchange on the west side: server room and battery room, a mast with a red light on top. */
  exchange: { x0: 768, x1: 786, z0: 706, z1: 724, split: 716, mastX: 771, mastZ: 709, mastHeight: 26 },
  /** The faction's compound, Las Cruces: walled, two gate towers, its gate on the highway's end. */
  compound: { x0: 772, x1: 824, z0: 546, z1: 598, gateHalf: 3, wall: 7 },
  /** The hot-spring cave: a trail east off the highway, the mouth in a low bank, a lit decline to the cavern. */
  caveTrail: { z: 661, x1: 846 },
  cave: { mouthX: 848, z: 661, depth: 13, cavern: { x0: 862, x1: 880, z0: 652, z1: 672 } },
  /** Radiation hotspots: small, ringed by warning signs. r is the radius where the dose begins. */
  hotspots: [
    { name: 'van', x: 809, z: 698, r: 5, rate: 3 }, // a wrecked clinic van in the lot, its source cracked open
    { name: 'pond', x: 760, z: 719, r: 5, rate: 2 }, // the drainage pond behind the exchange, where fallout washed down
  ],
};

/** The highway's centre line x at z: north from the camp with a long, easy bend. */
export function highwayX(z: number): number {
  return 797 + 7 * Math.sin((ZONE2.highway.z0 - z) / 95);
}

/** Is (x, z) on the highway (plus a margin)? */
export function onHighway(x: number, z: number, margin = 0): boolean {
  const h = ZONE2.highway;
  return z <= h.z0 && z >= h.z1 && Math.abs(x + 0.5 - highwayX(z)) < h.halfWidth + margin;
}

let hwHeights: Map<number, number> | null = null;
/** The highway's walking height at z: the lie of the land smoothed, never more than one block per two along. */
export function highwayHeight(z: number): number {
  if (!hwHeights) {
    const h = ZONE2.highway, raw: number[] = [];
    for (let zz = h.z1 - 20; zz <= h.z0 + 20; zz++) raw.push(naturalHeight(Math.floor(highwayX(zz)), zz, false));
    const smooth = raw.map((_, i) => { let s = 0, n = 0; for (let k = -18; k <= 18; k++) { const v = raw[i + k]; if (v !== undefined) { s += v; n++; } } return s / n; });
    hwHeights = new Map();
    const campFloor = ZONE1FAR.camp.floor;
    for (let zz = h.z1 - 20; zz <= h.z0 + 20; zz++) {
      const t = smoothstep(h.z0 - 30, h.z0, zz);
      hwHeights.set(zz, mix(smooth[zz - (h.z1 - 20)], campFloor, t));
    }
    // Rounded, then eased so no step is more than one block.
    const zs = [...hwHeights.keys()].sort((a, b) => a - b);
    let prev = Math.round(hwHeights.get(zs[zs.length - 1])!);
    for (let i = zs.length - 1; i >= 0; i--) {
      const v = Math.max(prev - 1, Math.min(prev + 1, Math.round(hwHeights.get(zs[i])!)));
      hwHeights.set(zs[i], v); prev = v;
    }
    // Beside the strip mall's lot the highway is never below the lot: its south end used to sit a block
    // above the asphalt, a kerb with no reason (docs/PHASE7.md, 7). The road's own step moves just past the lot.
    const lot = ZONE2.lot, lotFloor = hwHeights.get(Math.round((ZONE2.mall.z0 + ZONE2.mall.z1) / 2))!;
    for (let zz = lot.z0 - 3; zz <= lot.z1 + 2; zz++) if (hwHeights.get(zz)! < lotFloor) hwHeights.set(zz, lotFloor);
  }
  const zz = Math.max(ZONE2.highway.z1 - 20, Math.min(ZONE2.highway.z0 + 20, Math.round(z)));
  return hwHeights.get(zz)!;
}

/** The floor of each Zone-2 place: the highway's height beside it. */
export const zone2Floor = {
  get mall() { return highwayHeight((ZONE2.mall.z0 + ZONE2.mall.z1) / 2); },
  get exchange() { return highwayHeight((ZONE2.exchange.z0 + ZONE2.exchange.z1) / 2); },
  get compound() { return highwayHeight(ZONE2.highway.z1); },
  get cave() { return highwayHeight(ZONE2.caveTrail.z); },
};

/** Is (x, z) on the cave's trail, from the highway east to the mouth (three wide)? */
export function onCaveTrail(x: number, z: number): boolean {
  const t = ZONE2.caveTrail;
  return Math.abs(z - t.z) <= 1 && x >= highwayX(t.z) && x <= ZONE2.cave.mouthX;
}

/** How hard the ground bites at (x, z), in dose a second without a suit: Zone-2's hotspots (0 outside every ring, up to the hotspot's rate at its heart) and Zone-4's fallout. */
export function radiationAt(x: number, z: number): number {
  let best = falloutAt(x, z);
  for (const h of ZONE2.hotspots) {
    const d = Math.hypot(x - h.x, z - h.z);
    if (d < h.r) best = Math.max(best, h.rate * (1 - d / h.r) ** 1.5 + 0.15);
  }
  return best;
}

/** The level ground round Zone-2's places, blended into the land; null elsewhere. */
function zone2Pad(x: number, z: number, natural: number): number | null {
  const Z = ZONE2;
  if (onHighway(x, z)) return highwayHeight(z);
  const box = (x0: number, x1: number, z0: number, z1: number, floor: number, blend: number) => {
    const dx = Math.max(x0 - x, x - (x1 - 1), 0), dz = Math.max(z0 - z, z - (z1 - 1), 0), d = Math.hypot(dx, dz);
    return d < blend ? Math.round(mix(floor, natural, smoothstep(0, blend, d))) : null;
  };
  const m = Z.mall, l = Z.lot, e = Z.exchange, c = Z.compound;
  const hx = (zz: number) => Math.floor(highwayX(zz));
  if (onCaveTrail(x, z)) return zone2Floor.cave;
  return box(hx(m.z0) + Z.highway.halfWidth, m.x1 + 4, Math.min(l.z0, m.z0) - 3, Math.max(l.z1, m.z1) + 3, zone2Floor.mall, 6)
    ?? box(e.x0 - 10, hx(e.z0) - Z.highway.halfWidth + 1, e.z0 - 4, e.z1 + 4, zone2Floor.exchange, 6)
    ?? box(c.x0 - 6, c.x1 + 6, c.z0 - 6, c.z1 + 12, zone2Floor.compound, 8)
    ?? (Math.abs(z - Z.caveTrail.z) < 4 && x > Z.cave.mouthX - 6 && x < Z.cave.mouthX + 2 ? zone2Floor.cave : null)
    // The road's shoulders ease into the land, as the old road's do.
    ?? (Math.abs(x + 0.5 - highwayX(z)) < Z.highway.halfWidth + 3.5 && z <= Z.highway.z0 && z >= Z.highway.z1
      ? Math.round(mix(highwayHeight(z), natural, smoothstep(Z.highway.halfWidth, Z.highway.halfWidth + 3.5, Math.abs(x + 0.5 - highwayX(z))))) : null);
}

// ---------------------------------------------------------------------------------------
// Zone-3, the industrial river (docs/PHASE7.md). The ravine at the end of Zone-1's road is the gorge of
// a river, the Río Seco. A dam stands across it just inside Zone-2; its crest is the way over. From its
// west end an avenue runs south along the river's west bank, past the powerhouse, the machine shops and
// the rail yard, to the old road's far end at the broken bridge. Boxes are [x0, x1) × [z0, z1).
// ---------------------------------------------------------------------------------------

export const ZONE3 = {
  /** The dam road: west off the highway, four wide, to the dam's east end. Its centre line is z. */
  damRoad: { z: DAM_Z, halfWidth: 2 },
  /**
   * The dam: `crest` is the walking height of its deck, `water` the reservoir's surface (the top water block
   * is water − 1). x0 … x1 − 1 is the concrete, from one rim of the gorge to the other (filled in below).
   */
  dam: { z: DAM_Z, crest: 83, water: 79, x0: 0, x1: 0, spill: 0 },
  /** The faction's barricade on the dam road, just short of the dam: they don't cross. */
  barricade: { x: 0 },
  /** The avenue: from the bend west of the dam, south to the old road. Its centre line is x. */
  avenue: { x: 580, halfWidth: 2, z0: DAM_Z, z1: 0 },
  /** The dam's control house, on the crest road's north side at the west end: the engineer's logbook. */
  control: { x0: 597, x1: 605, z0: 743, z1: 750 },
  /**
   * The powerhouse, between the avenue and the gorge: the turbine hall. `door`: the lit north half's door on
   * the avenue (z of its two columns' first); `bay`: the dark south half's open roller door (its four columns' first).
   */
  powerhouse: { x0: 586, x1: 604, z0: 772, z1: 797, door: 777, bay: 791 },
  /** The machine shop (east of the avenue) and the foundry (west of it), each with a lit door and a dark bay. */
  shop: { x0: 586, x1: 604, z0: 846, z1: 866, door: 850, bay: 860 },
  foundry: { x0: 556, x1: 574, z0: 852, z1: 872, door: 856, bay: 865 },
  /** The rail yard, west of the avenue: two tracks north–south (their centre columns), the signal box. */
  yard: { x0: 544, x1: 575, z0: 902, z1: 1012, tracks: [553, 562] },
  signalBox: { x0: 568, x1: 573, z0: 906, z1: 911, height: 9 },
  /** The engine shed over the west track's north end: open at its south end, dark at the back. */
  engineShed: { x0: 548, x1: 559, z0: 904, z1: 926 },
  /** The mine: a lit trail west across the yard at z, the adit's head, a decline west to the gallery, a dark drift north. */
  mine: { z: 972, headX: 530, depth: 18, gallery: { x0: 494, x1: 512, z0: 966, z1: 979 }, drift: { x: 498, z0: 952, z1: 966 } },
  /** The old road on the far side of the broken bridge: west from the abutment past the level crossing. */
  farRoad: { west: 538 },
  /** The river below the dam: a plunge pool, then a stream that thins and sinks into the limestone at `sink`. */
  river: { pool: 9, sink: DAM_Z + 112 },
  /** Where the first Ashen stands, in the road by day, seen from the bend above (docs/PHASE7.md). */
  firstAshen: { x: 580.5, z: 802.5 },
  /**
   * Where the Ashen keep by day: the dark ends of the buildings, the engine shed, the mine's unlit drift.
   * `n` of them at each (never more than two); `under`: below ground, where it is always dark and they never
   * roam out. `path`: the way out of the dark room, point by point in straight clear lines, ending outside
   * (they have no other pathfinding: they walk this out and back, and straight at what they hunt).
   */
  nests: [
    { name: 'powerhouse', x: 598.5, z: 793, n: 2, under: false, path: [[583.5, 793]] },
    { name: 'shop', x: 599.5, z: 862, n: 2, under: false, path: [[583.5, 862]] },
    { name: 'foundry', x: 560.5, z: 867, n: 1, under: false, path: [[576.5, 867]] },
    { name: 'shed', x: 553.5, z: 908.5, n: 2, under: false, path: [[553.5, 929.5]] },
    { name: 'drift', x: 498.5, z: 954.5, n: 2, under: true, path: [[498.5, 964.5], [498.5, 972.5], [511.5, 972.5], [532.5, 972.5]] },
  ] as { name: string; x: number; z: number; n: number; under: boolean; path: [number, number][] }[],
};

/** The yard's rolling stock: which track (0 west, 1 east), from z0 to z1, and what it is. */
export const ROLLING: { track: 0 | 1; z0: number; z1: number; kind: 'loco' | 'hopper' | 'flat' | 'boxcar' }[] = [
  { track: 1, z0: 928, z1: 939, kind: 'loco' },
  { track: 1, z0: 942, z1: 950, kind: 'hopper' },
  { track: 1, z0: 953, z1: 961, kind: 'flat' },
  { track: 0, z0: 934, z1: 943, kind: 'boxcar' },
  { track: 0, z0: 947, z1: 956, kind: 'boxcar' },
];

/** The far side's old road: the same line as Zone-1's road, eased onto the bridge's axis at the abutment. */
export function farRoadZ(x: number): number {
  return mix(roadZ(x), ZONE1FAR.bridge.z + 0.5, smoothstep(596, 612, x));
}

/** Is (x, z) on the old road's far side, from the broken bridge's far abutment west past the rail crossing? */
export function onFarRoad(x: number, z: number, margin = 0): boolean {
  return x >= ZONE3.farRoad.west && x < ZONE1FAR.bridge.far - 3 && Math.abs(z + 0.5 - farRoadZ(x)) < ROAD.halfWidth + margin;
}

/** Is (x, z) on the dam road, from the highway west to the dam's east end? */
export function onDamRoad(x: number, z: number, margin = 0): boolean {
  const r = ZONE3.damRoad;
  return x >= ZONE3.dam.x1 && x < highwayX(r.z) + ZONE2.highway.halfWidth && Math.abs(z + 0.5 - r.z) < r.halfWidth + margin;
}

/** Is (x, z) on the dam's deck (between the parapets)? */
export function onDamCrest(x: number, z: number): boolean {
  const d = ZONE3.dam;
  return x >= d.x0 && x < d.x1 && Math.abs(z + 0.5 - d.z) < ZONE3.damRoad.halfWidth;
}

/** Is (x, z) on the avenue: the crest road from the dam's west end to the bend, then south to the old road? */
export function onAvenue(x: number, z: number, margin = 0): boolean {
  const a = ZONE3.avenue, d = ZONE3.dam;
  const h = a.halfWidth + margin;
  if (x >= a.x - h && x < d.x0 && Math.abs(z + 0.5 - d.z) < h) return true; // the crest road, dam → bend
  return Math.abs(x + 0.5 - a.x) < h && z >= d.z - h && z < a.z1;
}

/** Eases a line of heights so no step is more than one block, and rounds them. */
function eased(raw: number[], pinFirst: boolean): number[] {
  const out = raw.map((v) => Math.round(v));
  if (pinFirst) for (let i = 1; i < out.length; i++) out[i] = Math.max(out[i - 1] - 1, Math.min(out[i - 1] + 1, out[i]));
  else for (let i = out.length - 2; i >= 0; i--) out[i] = Math.max(out[i + 1] - 1, Math.min(out[i + 1] + 1, out[i]));
  return out;
}
const smoothed = (raw: number[], w: number) => raw.map((_, i) => { let s = 0, n = 0; for (let k = -w; k <= w; k++) { const v = raw[i + k]; if (v !== undefined) { s += v; n++; } } return s / n; });

let damRoadHeights: number[] | null = null;
/** The dam road's walking height at x: the lie of the land smoothed, from the dam's crest up to the highway. */
export function damRoadHeight(x: number): number {
  const d = ZONE3.dam, z = ZONE3.damRoad.z, x1 = Math.ceil(highwayX(z)) + 4;
  if (!damRoadHeights) {
    const raw: number[] = [];
    for (let xx = d.x1; xx <= x1; xx++) raw.push(naturalHeight(xx, z, false));
    const hw = highwayHeight(z), edge = highwayX(z) - ZONE2.highway.halfWidth;
    const sm = smoothed(raw, 10).map((v, i) => {
      const xx = d.x1 + i;
      const v1 = mix(d.crest, v, smoothstep(d.x1 + 2, d.x1 + 22, xx)); // level with the crest at the dam
      return mix(v1, hw, smoothstep(edge - 22, edge - 2, xx)); // and with the highway at the junction
    });
    damRoadHeights = eased(sm, true);
  }
  return damRoadHeights[Math.max(0, Math.min(damRoadHeights.length - 1, Math.floor(x) - d.x1))];
}

let avenueHeights: number[] | null = null;
/** The avenue's walking height at z: level with the crest at the bend, then down the lie of the land to the old road. */
export function avenueHeight(z: number): number {
  const a = ZONE3.avenue, d = ZONE3.dam;
  if (!avenueHeights) {
    const raw: number[] = [];
    for (let zz = a.z0; zz <= a.z1 + 4; zz++) raw.push(naturalHeight(a.x, zz, false));
    const end = roadHeight(a.x);
    const sm = smoothed(raw, 10).map((v, i) => {
      const zz = a.z0 + i;
      const v1 = mix(d.crest, v, smoothstep(a.z0 + 4, a.z0 + 26, zz));
      return mix(v1, end, smoothstep(a.z1 - 20, a.z1 - 4, zz));
    });
    avenueHeights = eased(sm, true);
  }
  return avenueHeights[Math.max(0, Math.min(avenueHeights.length - 1, Math.floor(z) - a.z0))];
}

/** The far road's walking height at x: the land's lie along it, as Zone-1's road. */
export function farRoadHeight(x: number): number {
  return roadHeight(x);
}

/** The floor of each Zone-3 place: the avenue's height beside it. */
export const zone3Floor = {
  get control() { return ZONE3.dam.crest; },
  get powerhouse() { return avenueHeight((ZONE3.powerhouse.z0 + ZONE3.powerhouse.z1) / 2); },
  get shop() { return avenueHeight((ZONE3.shop.z0 + ZONE3.shop.z1) / 2); },
  get foundry() { return avenueHeight((ZONE3.foundry.z0 + ZONE3.foundry.z1) / 2); },
  get yard() { return avenueHeight((ZONE3.yard.z0 + ZONE3.yard.z1) / 2); },
};

/** Is (x, z) on the mine's trail, from the avenue west across the yard to the adit's head (three wide)? */
export function onMineTrail(x: number, z: number): boolean {
  const m = ZONE3.mine;
  return Math.abs(z - m.z) <= 1 && x >= m.headX && x < ZONE3.avenue.x - ZONE3.avenue.halfWidth;
}

/** Is (x, z) in the reservoir: the gorge north of the dam, where the land lies under the water's surface? */
export function inReservoir(x: number, z: number): boolean {
  const d = ZONE3.dam;
  if (z >= d.z - ZONE3.damRoad.halfWidth - 1 || z < 150 || Math.abs(x - ravineX(z)) >= 27) return false;
  return outsideHeight(x, z) < d.water;
}

/**
 * The river below the dam at (x, z): 'pool' in the plunge pool at the spillway's foot, 'stream' along the
 * gorge floor, 'bed' on its last dry stretch of gravel where the water has sunk into the limestone; else null.
 */
export function riverBelowDam(x: number, z: number): 'pool' | 'stream' | 'bed' | null {
  const d = ZONE3.dam, r = ZONE3.river, foot = d.z + ZONE3.damRoad.halfWidth + 1;
  if (z < foot || z > r.sink + 8) return null;
  const dx = Math.abs(x + 0.5 - ravineX(z));
  if (z < foot + r.pool * 2 && Math.hypot(dx, z + 0.5 - (foot + r.pool)) < r.pool) return 'pool';
  const t = (z - foot) / (r.sink - foot);
  const half = 2.6 - 1.6 * Math.min(1, t);
  if (t <= 1 && dx < half) return 'stream';
  if (t > 0.8 && dx < half + 1.2 && z <= r.sink + 6) return 'bed';
  return null;
}

/** The level ground round Zone-3's places, blended into the land; null elsewhere. */
function zone3Pad(x: number, z: number, natural: number): number | null {
  const Z = ZONE3, d = Z.dam, a = Z.avenue;
  const box = (x0: number, x1: number, z0: number, z1: number, floor: number, blend: number) => {
    const dx = Math.max(x0 - x, x - (x1 - 1), 0), dz = Math.max(z0 - z, z - (z1 - 1), 0), dd = Math.hypot(dx, dz);
    return dd < blend ? Math.round(mix(floor, natural, smoothstep(0, blend, dd))) : null;
  };
  // The reservoir's shores never dip under its surface.
  if (z < d.z - 3 && z > 150) {
    const rd = Math.abs(x - ravineX(z));
    if (rd >= 22 && rd < 44 && natural < d.water + 2) return d.water + 2;
  }
  if (z > 1045 || z < 730 || x < 480) return null;
  if (x >= d.x1) {
    // East of the gorge: only the dam road's shoulders.
    const r = Z.damRoad, across = Math.abs(z + 0.5 - r.z);
    if (x < highwayX(r.z) - ZONE2.highway.halfWidth && across < r.halfWidth + 3.5) return Math.round(mix(damRoadHeight(x), natural, smoothstep(r.halfWidth, r.halfWidth + 3.5, across)));
    return null;
  }
  if (onAvenue(x, z)) return x >= a.x + a.halfWidth ? d.crest : avenueHeight(z);
  if (onFarRoad(x, z)) return farRoadHeight(x);
  if (onMineTrail(x, z)) return zone3Floor.yard;
  const p = Z.powerhouse, s = Z.shop, f = Z.foundry, y = Z.yard, c = Z.control, m = Z.mine;
  const edge = a.x + a.halfWidth, wedge = a.x - a.halfWidth;
  return box(c.x0 - 2, c.x1 + 2, c.z0 - 2, d.z - a.halfWidth, zone3Floor.control, 5)
    ?? box(edge, p.x1 + 2, p.z0 - 3, p.z1 + 3, zone3Floor.powerhouse, 5)
    ?? box(edge, s.x1 + 2, s.z0 - 3, s.z1 + 3, zone3Floor.shop, 5)
    ?? box(f.x0 - 2, wedge, f.z0 - 3, f.z1 + 3, zone3Floor.foundry, 5)
    // The yard is level, but its last six metres beside the avenue grade to the avenue's own height, so no
    // bank stands between the two (the avenue dips a block or two along the yard's length).
    ?? (x >= wedge - 6 && x < wedge && z >= y.z0 - 6 && z < y.z1 + 6 ? Math.round(mix(avenueHeight(z), box(y.x0, wedge, y.z0, y.z1, zone3Floor.yard, 6) ?? natural, smoothstep(0, 6, wedge - 0.5 - x))) : null)
    ?? box(y.x0, wedge, y.z0, y.z1, zone3Floor.yard, 6)
    ?? box(m.headX - 3, m.headX + 3, m.z - 3, m.z + 4, zone3Floor.yard, 4)
    // The crest road and the avenue ease into the land, as the old road does.
    ?? (x >= a.x + a.halfWidth && x < d.x0 && Math.abs(z + 0.5 - d.z) < a.halfWidth + 3.5 ? Math.round(mix(d.crest, natural, smoothstep(a.halfWidth, a.halfWidth + 3.5, Math.abs(z + 0.5 - d.z)))) : null)
    ?? (z >= d.z - a.halfWidth && z < a.z1 && Math.abs(x + 0.5 - a.x) < a.halfWidth + 3.5 ? Math.round(mix(avenueHeight(z), natural, smoothstep(a.halfWidth, a.halfWidth + 3.5, Math.abs(x + 0.5 - a.x)))) : null)
    ?? (x >= Z.farRoad.west && x < ZONE1FAR.bridge.far - 3 && Math.abs(z + 0.5 - farRoadZ(x)) < ROAD.halfWidth + 3.5
      ? Math.round(mix(farRoadHeight(x), natural, smoothstep(ROAD.halfWidth, ROAD.halfWidth + 3.5, Math.abs(z + 0.5 - farRoadZ(x))))) : null);
}

// ---------------------------------------------------------------------------------------
// Zone-4, the radiation edge (docs/PHASE8.md): the ridge road, its places, and the fallout.
// ---------------------------------------------------------------------------------------

/** Is (x, z) under the fallout: on the massif, west of the reservoir's shore? This is Zone-4. */
export function inFallout(x: number, z: number): boolean {
  return falloutDepth(x, z) > 0;
}

/** How far inside the fallout's edge (x, z) lies, in metres; 0 or less outside it. */
export function falloutDepth(x: number, z: number): number {
  const c = ZONE4.centre;
  return Math.min(ZONE4.reach - Math.hypot(x - c.x, z - c.z), ravineX(z) - ZONE4.shoreKeep - x);
}

/** What the massif adds to the land west of the gorge: a slope up to the ridge's crest, a high dead valley behind it, the far peaks. */
function ridgeLift(x: number, z: number, nw: number): number {
  const Z = ZONE4;
  let h = 30 * smoothstep(500, 330, nw) - 10 * smoothstep(235, 180, nw) + 44 * smoothstep(170, 60, nw) + 12 * Math.exp(-(((nw - 242) / 45) ** 2));
  for (const [kx, kz] of Z.pass.knolls) h += Z.pass.knoll * (1 - smoothstep(6, Z.pass.knollRadius, Math.hypot(x - kx, z - kz)));
  h -= Z.sump.depth * (1 - smoothstep(8, Z.sump.r + 4, Math.hypot(x - Z.sump.x, z - Z.sump.z)));
  h += Z.observatory.knoll * (1 - smoothstep(6, 24, Math.hypot(x - Z.observatory.x, z - Z.observatory.z)));
  return h;
}

interface RoadSeg { ax: number; az: number; bx: number; bz: number; len: number; s0: number }
let ridgeSegs: RoadSeg[] | null = null;
function ridgeRoadSegs(): RoadSeg[] {
  if (!ridgeSegs) {
    const p = ZONE4.road.pts;
    let s0 = 0;
    ridgeSegs = p.slice(0, -1).map(([ax, az], i) => { const [bx, bz] = p[i + 1], len = Math.hypot(bx - ax, bz - az), seg = { ax, az, bx, bz, len, s0 }; s0 += len; return seg; });
  }
  return ridgeSegs;
}

/** The ridge road's length, from the avenue's bend to the tower's yard (m). */
export function ridgeRoadLength(): number {
  const g = ridgeRoadSegs(), last = g[g.length - 1];
  return last.s0 + last.len;
}

/** How far along the ridge road its k-th point lies (m from the bend). */
export function ridgeRoadMark(k: number): number {
  const g = ridgeRoadSegs();
  return k >= g.length ? ridgeRoadLength() : g[k].s0;
}

/** The point on the ridge road's centre line s metres from the bend. */
export function ridgeRoadPoint(s: number): [number, number] {
  const g = ridgeRoadSegs();
  for (const q of g) if (s <= q.s0 + q.len || q === g[g.length - 1]) {
    const t = Math.max(0, Math.min(1, (s - q.s0) / q.len));
    return [q.ax + (q.bx - q.ax) * t, q.az + (q.bz - q.az) * t];
  }
  return [g[0].ax, g[0].az];
}

/** Distance from the point (px, pz) to the ridge road's centre line, and how far along it the nearest point lies. */
export function ridgeRoadAt(px: number, pz: number): { dist: number; s: number } {
  let dist = Infinity, s = 0;
  if (px < 340 || px > 632 || pz < 360 || pz > 756) return { dist, s };
  for (const q of ridgeRoadSegs()) {
    const [d, t] = distToSegment(px, pz, q.ax, q.az, q.bx, q.bz);
    if (d < dist) { dist = d; s = q.s0 + t * q.len; }
  }
  return { dist, s };
}

/** Is the cell (x, z) on the ridge road (plus a margin)? It begins at the bend's north edge. */
export function onRidgeRoad(x: number, z: number, margin = 0): boolean {
  return z < DAM_Z - 2 && ridgeRoadAt(x + 0.5, z + 0.5).dist < ZONE4.road.halfWidth + margin;
}

let ridgeHeights: number[] | null = null;
/**
 * The ridge road's walking height s metres along: level with the dam's crest at the bend, then the lie of
 * the land smoothed, with a level landing at every bend, the gate, the pass and the yard, and never more
 * than one block up or down in two metres.
 */
export function ridgeRoadHeight(s: number): number {
  if (!ridgeHeights) {
    const L = Math.ceil(ridgeRoadLength()), raw: number[] = [];
    for (let i = 0; i <= L; i++) { const [px, pz] = ridgeRoadPoint(i); raw.push(naturalHeight(Math.floor(px), Math.floor(pz), false)); }
    const sm = smoothed(raw, 8).map((v, i) => mix(ZONE3.dam.crest, v, smoothstep(2, 22, i)));
    const R = ZONE4.road, n = R.pts.length;
    for (let k = 1; k < n; k++) {
      const at = Math.round(ridgeRoadMark(k)), half = k === R.pass ? 13 : k === n - 1 ? 10 : 5, v = sm[Math.min(L, at)];
      for (let i = Math.max(0, at - half); i <= Math.min(L, at + half); i++) sm[i] = v;
    }
    const out = sm.map((v) => Math.round(v));
    for (let i = 1; i < out.length; i++) {
      out[i] = Math.max(out[i - 1] - 1, Math.min(out[i - 1] + 1, out[i]));
      if (i >= 2 && out[i - 1] !== out[i - 2]) out[i] = out[i - 1];
    }
    ridgeHeights = out;
  }
  return ridgeHeights[Math.max(0, Math.min(ridgeHeights.length - 1, Math.round(s)))];
}

/** The floor of each Zone-4 place: the ridge road's height beside it. */
export const zone4Floor = {
  get gate() { return ridgeRoadHeight(ridgeRoadMark(ZONE4.road.gate)); },
  get pass() { return ridgeRoadHeight(ridgeRoadMark(ZONE4.road.pass)); },
  get observatory() { return ridgeRoadHeight(ridgeRoadMark(ZONE4.road.dome)); },
  get tower() { return ridgeRoadHeight(ridgeRoadLength()); },
};

/** The level ground of Zone-4's road and places, blended into the land; null elsewhere. */
function zone4Pad(x: number, z: number, natural: number): number | null {
  const Z = ZONE4, y = Z.yard, hw = Z.road.halfWidth;
  if (x >= y.x0 && x < y.x1 && z >= y.z0 && z < y.z1) return zone4Floor.tower;
  const r = z < DAM_Z - 2 ? ridgeRoadAt(x + 0.5, z + 0.5) : { dist: Infinity, s: 0 };
  if (r.dist < hw) return ridgeRoadHeight(r.s);
  const pad = (cx: number, cz: number, rad: number, floor: number, blend: number) => {
    const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz) - rad;
    return d < blend ? Math.round(mix(floor, natural, smoothstep(0, blend, d))) : null;
  };
  const dx = Math.max(y.x0 - x, x - (y.x1 - 1), 0), dz = Math.max(y.z0 - z, z - (y.z1 - 1), 0), dy = Math.hypot(dx, dz);
  const [gx, gz] = Z.road.pts[Z.road.gate];
  return (dy < 7 ? Math.round(mix(zone4Floor.tower, natural, smoothstep(0, 7, dy))) : null)
    ?? pad(Z.observatory.x, Z.observatory.z, 9, zone4Floor.observatory, 6)
    ?? pad(Z.clean.x, Z.clean.z, Z.clean.r, zone4Floor.pass, 6)
    ?? pad(gx, gz, 7, zone4Floor.gate, 5)
    // The road's shoulders ease into the land, as the old road's do (but the reservoir's bank is left as it is).
    ?? (r.dist < hw + 3.5 && natural > ZONE3.dam.water + 2 ? Math.round(mix(ridgeRoadHeight(r.s), natural, smoothstep(hw, hw + 3.5, r.dist))) : null);
}

/**
 * The fallout's bite at (x, z), in dose a second without a suit: nothing outside Zone-4 or on the pass's
 * clean ground; least indoors and on the road; most off it, and worst of all in the sump. Just inside the
 * line of signs it is weaker, and climbs over the first twenty metres.
 */
export function falloutAt(x: number, z: number): number {
  const depth = falloutDepth(x, z);
  if (depth <= 0) return 0;
  const Z = ZONE4, R = Z.rates;
  if (Math.hypot(x - Z.clean.x, z - Z.clean.z) < Z.clean.r) return 0;
  const inBox = (b: { x0: number; x1: number; z0: number; z1: number }) => x >= b.x0 && x < b.x1 && z >= b.z0 && z < b.z1;
  const od = Math.hypot(x - Z.observatory.x, z - Z.observatory.z);
  if (inBox(Z.relay) || od < Z.observatory.r) return R.indoors;
  const rd = ridgeRoadAt(x, z).dist, hw = Z.road.halfWidth;
  let rate = mix(R.road, R.off, smoothstep(hw + 1, hw + 9, rd)) * (0.3 + 0.7 * smoothstep(0, 20, depth));
  if (inBox(Z.yard) || od < 9) rate = Math.min(rate, R.road);
  const sd = Math.hypot(x - Z.sump.x, z - Z.sump.z);
  if (sd < Z.sump.r) rate = Math.max(rate, R.off + (Z.sump.rate - R.off) * (1 - sd / Z.sump.r) ** 1.5);
  return rate;
}

{
  // The dam spans the gorge from rim to rim at its line; the spillway is over the river's centre.
  const d = ZONE3.dam, c = ravineX(d.z);
  d.x0 = Math.floor(c - 28);
  d.x1 = Math.ceil(c + 28);
  d.spill = Math.round(c);
  ZONE3.barricade.x = d.x1 + 12;
  // The avenue ends at the old road's far side.
  ZONE3.avenue.z1 = Math.round(farRoadZ(ZONE3.avenue.x)) + ROAD.halfWidth;
}
