// A walk of the generated world (docs/REVIEW.md, N3: "the real fix is a test"). Nothing else in the repo
// walks the land the generator makes: the other tests check heights along a centre line. Here the step rules
// are measured on the real Player, and with them:
//   - every named route is walked on its own cells with no jump, and then by the real Player, out and back;
//   - the ground beside each route, and the whole valley, is searched for places a walker can get into alive
//     and never out of;
//   - the valley's flood must stay inside the sanctuary;
//   - the gorge's far bank must not be reached without the dam, and nobody who gets down into the gorge may
//     be left there;
//   - the land N3 did not mean to mend must hash as it did before.
// It reads the land straight from the generator (tests/walk.ts) and takes about 50 s. On the land as it was
// before the fixes, 12 of these tests fail: each of the review's cases a to d, f and g.

import { describe, it, expect, vi } from 'vitest';
import { Land, Flood, measureRules, footing, standing, clusters, show, showPit, walkOn, beside, cellsOf, follow, type Route, type Spot } from './walk.ts';
import {
  VALLEY, HOME, PATH, PATH_HALF_WIDTH, pathAt, POOL, CREEK, GARDEN, TUNNEL, MOUTH_BASINS, CANYON_POOL, RAMP, RAMP_HALF_WIDTH, rampAt, ROAD, roadZ, roadHeight,
  ZONE1, ZONE1FAR, ZONE2, ZONE3, onFarmTrack, onCampTrail, brushTrailDist, onHighway, highwayX, highwayHeight, onCaveTrail, zone2Floor,
  onDamRoad, damRoadHeight, onDamCrest, onAvenue, avenueHeight, onMineTrail, zone3Floor, onFarRoad, farRoadZ, farRoadHeight,
  inSanctuary, distToValley, valleyFloorHeight, ravineX, RAVINE_HALF, riverCurrent,
} from '../src/gen/layout.ts';
import { B_SOLID, isWaterId, blockName, WATER } from '../src/world/blocks.ts';
import { WORLD_Z } from '../src/world/constants.ts';
import { GATE_STONE } from '../src/sim/gate.ts';
import { BREATH_MAX } from '../src/sim/player.ts';
import { hashColumn } from '../tools/worldhash.ts';
import before from './fixtures/before-n3.json' with { type: 'json' };

// Floods of a few hundred thousand places: seconds each on a quiet machine, more on a busy one.
vi.setConfig({ testTimeout: 120_000 });

const land = new Land();
const at = land.blockAt;
const R = measureRules();

// ---- The rules ------------------------------------------------------------------------------------------

describe('the step rules, measured on the real Player', () => {
  it('walks up one block without a jump, jumps no higher than that, and cannot take two', () => {
    expect(R.step).toBe(1);
    expect(R.climb).toBeGreaterThanOrEqual(1);
    expect(R.climb).toBeLessThan(2);
  });

  it('leaps a gap of a few blocks, floats with the feet under the water’s top, and is hurt by a long fall', () => {
    expect(R.gap).toBeGreaterThanOrEqual(2);
    expect(R.gap).toBeLessThanOrEqual(5);
    // Afloat, the feet stay under the water's top: with the step, enough to leave over a bank level with the
    // water, not over one a block above it.
    expect(R.swimLift).toBeLessThan(0);
    expect(R.swimLift + R.step).toBeGreaterThan(0);
    expect(R.swimLift + R.step).toBeLessThan(1);
    expect(R.safeFall).toBeGreaterThanOrEqual(3);
    expect(R.deadlyFall).toBeGreaterThan(R.safeFall + 5);
  });
});

// ---- The valley -----------------------------------------------------------------------------------------

describe('the valley, walked from the foot of the home path', () => {
  const foot: [number, number] = [PATH[PATH.length - 1][0], PATH[PATH.length - 1][1]];
  const start = footing(at, foot[0], foot[1], VALLEY.floor + 4);
  // Wide enough to see anything that leaves: the sanctuary and sixty blocks round it.
  const inside = (x: number, z: number) => distToValley(x, z) < VALLEY.radius + 68;
  // The tunnel's gate is shut, as it stands when nobody is by it: the way out is its own test below.
  const flood = new Flood(at, [start], { inside });
  // The same again with running jumps: for "can it be reached at all".
  const leaping = new Flood(at, [start], { inside, jumps: true });

  it('reaches all of the floor: every column of it is stood on or swum in, but where a tree’s trunk stands', () => {
    const missed: string[] = [];
    let floor = 0;
    for (let z = VALLEY.cz - VALLEY.radius; z <= VALLEY.cz + VALLEY.radius; z++)
      for (let x = VALLEY.cx - VALLEY.radius; x <= VALLEY.cx + VALLEY.radius; x++) {
        if (distToValley(x, z) > VALLEY.radius - 18) continue; // inside the cliff's foot, all round
        floor++;
        if (flood.at(x, z, VALLEY.floor, 6)) continue;
        // What stands on the ground here?
        const what = blockName(at(x, valleyFloorHeight(x, z), z));
        if (!['log', 'tree_fern_trunk'].includes(what)) missed.push(`(${x}, ${z}): ${what}`);
      }
    expect(floor).toBeGreaterThan(20000);
    expect(missed, `floor columns never reached: ${missed.slice(0, 10).join('; ')}`).toEqual([]);
  });

  it('reaches the garden, the creek’s end, the pool, the tunnel’s mouth and, up the path, the balcony', () => {
    expect(flood.at((GARDEN.x0 + GARDEN.x1) >> 1, GARDEN.z0 + 1, VALLEY.floor), 'the garden').not.toBeNull();
    const [cx, cz] = CREEK[CREEK.length - 1];
    expect(flood.at(cx, cz, VALLEY.floor, 3), 'the creek’s end').not.toBeNull();
    expect(flood.has(POOL.cx, VALLEY.water, POOL.cz, true), 'the pool').toBe(true);
    expect(flood.has(MOUTH_BASINS.valley.x0 + 3, VALLEY.water, TUNNEL.z, true), 'the water before the tunnel’s mouth').toBe(true);
    expect(flood.at(HOME.balcony.x0 + 3, VALLEY.cz, HOME.floor), 'the balcony').not.toBeNull();
  });

  it('never leaves the sanctuary, on foot, by a jump or by water (N3d: a cave under the cliff ran past its line)', () => {
    for (const f of [flood, leaping]) {
      const out = f.spots.filter((s) => !inSanctuary(s.x, s.z));
      const far = out.length ? out.reduce((a, b) => (distToValley(b.x, b.z) > distToValley(a.x, a.z) ? b : a)) : null;
      expect(out.length, `${out.length} places outside the sanctuary, the furthest ${show(far)}, ${far ? distToValley(far.x, far.z).toFixed(1) : 0} from the valley's middle; the way there: ${far ? f.wayTo(far).filter((_s, i, a) => i % Math.ceil(a.length / 10) === 0 || i === a.length - 1).map(show).join(' → ') : ''}`).toBe(0);
    }
  });

  it('has no place a walker can get into alive and not out of (N3a: the slot by the path; N3c: the cave shaft, the pits at the cliff’s foot)', () => {
    const lost = clusters(flood.stuck((s) => s === flood.spots[0]));
    expect(lost.length, `${lost.length} such places: ${lost.slice(0, 8).map((p) => showPit(at, p)).join('; ')}`).toBe(0);
  });

  it('holds its water level with its banks: no still water with open air beside it (N3f: the pool stood a block proud of its east bank)', () => {
    const proud: string[] = [];
    const reach = VALLEY.radius + 22;
    for (let z = VALLEY.cz - reach; z <= VALLEY.cz + reach; z++)
      for (let x = VALLEY.cx - reach; x <= VALLEY.cx + reach; x++) {
        if (distToValley(x, z) > reach) continue;
        for (let y = VALLEY.water - 6; y <= VALLEY.water + 2; y++) {
          if (at(x, y, z) !== WATER) continue;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const id = at(x + dx, y, z + dz); if (!B_SOLID[id] && !isWaterId(id)) { proud.push(`(${x}, ${y}, ${z})`); break; } }
        }
      }
    expect(proud, `${proud.length} water cells standing proud of their bank: ${proud.slice(0, 8).join(' ')}`).toEqual([]);
  });

  it('leaves no single rock hanging in the air off its cliffs (N3g)', () => {
    const hanging: string[] = [];
    const reach = VALLEY.radius + 22;
    for (let z = VALLEY.cz - reach; z <= VALLEY.cz + reach; z++)
      for (let x = VALLEY.cx - reach; x <= VALLEY.cx + reach; x++) {
        const d = distToValley(x, z);
        if (d > reach || d < VALLEY.radius - 20) continue;
        // A rock with nothing solid on any of its six sides.
        for (let y = VALLEY.floor - 2; y <= VALLEY.rim + 20; y++) {
          if (!blockName(at(x, y, z)).startsWith('limestone')) continue;
          if (![[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].some(([dx, dy, dz]) => B_SOLID[at(x + dx, y + dy, z + dz)])) hanging.push(`(${x}, ${y}, ${z})`);
        }
      }
    expect(hanging, `${hanging.length} rocks hanging in the air: ${hanging.slice(0, 8).join(' ')}`).toEqual([]);
  });
});

// ---- The named routes -----------------------------------------------------------------------------------

const F = ZONE1FAR, b = F.bridge, D = ZONE3.dam, A = ZONE3.avenue, H = ZONE2.highway, M = ZONE3.mine;
const rz = (x: number) => Math.floor(roadZ(x));
const hx = (z: number) => Math.floor(highwayX(z));
const last = PATH[PATH.length - 1], top = RAMP[RAMP.length - 1];

const ROUTES: Route[] = [
  {
    name: 'the home path, from the balcony down to the valley floor',
    on: (x, z) => pathAt(x, z).dist < PATH_HALF_WIDTH,
    box: [1760, 990, 1800, 1016],
    from: [PATH[0][0], HOME.floor, PATH[0][1] + 1], to: [last[0], last[2], last[1]],
  },
  {
    name: 'the canyon ramp, from the pool’s side up to the old road',
    on: (x, z) => rampAt(x, z).dist < RAMP_HALF_WIDTH,
    box: [1526, 1022, 1564, 1068],
    from: [RAMP[0][0] - 1, RAMP[0][2], RAMP[0][1]], to: [top[0], top[2], top[1] - 1],
  },
  {
    name: 'the old road, from the ramp’s top through the buffer and Zone-1 to the broken bridge',
    on: (x, z) => x <= ROAD.east + 1 && x >= b.near - 1 && Math.abs(z + 0.5 - roadZ(x)) < ROAD.halfWidth,
    box: [b.near - 1, 1010, ROAD.east + 1, 1060],
    from: [ROAD.east, roadHeight(ROAD.east), rz(ROAD.east)], to: [b.near, b.y, b.z],
  },
  {
    name: 'the broken bridge’s deck, out to its end',
    on: (x, z) => x >= b.deckEnd && x < b.near + 3 && Math.abs(z - b.z) < 3,
    box: [b.deckEnd, b.z - 3, b.near + 3, b.z + 3],
    from: [b.near + 2, b.y, b.z], to: [b.deckEnd, b.y, b.z],
  },
  {
    name: 'the farm track, from the gate on the road to the yard',
    on: (x, z) => onFarmTrack(x, z),
    box: [1070, 1010, 1085, 1060],
    from: [ZONE1.farmGate.x, roadHeight(ZONE1.farmGate.x), ZONE1.farmGate.z], to: [ZONE1.farmGate.x, ZONE1.farm.floor, ZONE1.farm.z0],
  },
  {
    name: 'the brush trail, from the road round to the outpost’s back',
    on: (x, z) => brushTrailDist(x, z) <= 1.4,
    box: [850, 1015, 910, 1060],
    from: [F.brushTrail[0][0], roadHeight(F.brushTrail[0][0]), F.brushTrail[0][1]], to: [F.brushTrail[3][0], F.outpost.floor, F.brushTrail[3][1]],
  },
  {
    name: 'the camp trail, from the road north to the clearing',
    on: (x, z) => onCampTrail(x, z),
    box: [795, 980, 805, 1030],
    from: [F.campHead.x, roadHeight(F.campHead.x), F.campHead.z], to: [F.campHead.x, F.camp.floor, F.camp.z1 - 1],
  },
  {
    name: 'the highway, from the camp north past the ruins to Las Cruces’ gate',
    on: (x, z) => onHighway(x, z),
    box: [780, H.z1, 815, H.z0],
    from: [hx(H.z0), highwayHeight(H.z0), H.z0], to: [hx(H.z1), highwayHeight(H.z1), H.z1],
  },
  {
    name: 'the hot-spring cave’s trail, east off the highway',
    on: (x, z) => onCaveTrail(x, z) && !onHighway(x, z),
    box: [790, 655, 850, 667],
    from: [hx(ZONE2.caveTrail.z) + 4, zone2Floor.cave, ZONE2.caveTrail.z], to: [ZONE2.caveTrail.x1, zone2Floor.cave, ZONE2.caveTrail.z],
  },
  {
    name: 'the dam road, from the highway west to the dam',
    on: (x, z) => onDamRoad(x, z) && !onHighway(x, z),
    box: [D.x1, D.z - 3, 810, D.z + 3],
    from: [hx(D.z) - H.halfWidth - 1, damRoadHeight(hx(D.z) - H.halfWidth - 1), D.z], to: [D.x1, D.crest, D.z],
  },
  {
    name: 'the dam’s crest',
    on: (x, z) => onDamCrest(x, z),
    box: [D.x0, D.z - 3, D.x1, D.z + 3],
    from: [D.x1 - 1, D.crest, D.z], to: [D.x0, D.crest, D.z],
  },
  {
    name: 'the avenue, from the dam’s west end south to the old road',
    on: (x, z) => onAvenue(x, z),
    box: [A.x - 3, D.z - 3, D.x0, A.z1],
    from: [D.x0 - 1, D.crest, D.z], to: [A.x, avenueHeight(A.z1 - 1), A.z1 - 1],
  },
  {
    name: 'the mine’s trail, west across the yard to the mine’s head',
    on: (x, z) => onMineTrail(x, z),
    box: [M.headX, M.z - 1, A.x, M.z + 1],
    from: [A.x - A.halfWidth - 1, zone3Floor.yard, M.z], to: [M.headX, zone3Floor.yard, M.z],
  },
  {
    name: 'the far road, from the avenue’s end to the body by the broken bridge',
    on: (x, z) => onFarRoad(x, z),
    box: [ZONE3.farRoad.west, 1010, b.far, 1040],
    from: [A.x, farRoadHeight(A.x), Math.floor(farRoadZ(A.x))], to: [b.far - 4, farRoadHeight(b.far - 4), Math.floor(farRoadZ(b.far - 4))],
  },
];

/** What stands on a route on purpose, for a walker to go round: the lamp posts at a road's edge. */
const ON_PURPOSE = ['fence_post'];
/** How near a route a pit counts as beside it, and how far the search for a way back out of one goes. */
const NEAR = 16, FAR = 48;
/**
 * The gorge is not searched here. Its walls can be got down alive in places, and its floor is no part of any
 * route's ground: whether it can be crossed, and whether it can be left again, are its own tests below, which
 * search the whole of it rather than a strip beside a road.
 */
const inGorge = (s: Spot) => Math.abs(s.x - ravineX(s.z)) < RAVINE_HALF + 6;

describe.each(ROUTES)('$name', (r) => {
  const w = walkOn(at, r);

  it('is whole: every one of its cells is walked with no jump and no step over a block', () => {
    expect(w.cells).toBeGreaterThan(20);
    expect(w.end, `no way on the route’s own cells from ${show(w.start)} to its end at (${r.to[0]}, ${r.to[1]}, ${r.to[2]})`).not.toBeNull();
    const gaps = w.missed.filter((m) => !ON_PURPOSE.includes(m.what));
    expect(gaps.length, `${gaps.length} of its ${w.cells} cells never walked: ${gaps.slice(0, 6).map((m) => `(${m.x}, ${m.z}): ${m.what}`).join('; ')}`).toBe(0);
    expect(w.missed.length).toBeLessThanOrEqual(2);
  });

  it('is walked by the real Player, out and back, with no jump and no fall that hurts', () => {
    const way = w.end ? w.flood.wayTo(w.end) : [w.start];
    for (const [name, steps] of [['out', way], ['back', [...way].reverse()]] as const) {
      const walked = follow(at, steps);
      expect(walked.arrived, `${name}: the Player stopped at (${walked.at.map((v) => v.toFixed(1)).join(', ')}) after ${walked.seconds.toFixed(0)} s`).toBe(true);
      expect(walked.fall, `${name}: a fall of ${walked.fall.toFixed(1)} blocks`).toBeLessThanOrEqual(R.safeFall);
      const end = steps[steps.length - 1];
      expect(Math.abs(walked.at[1] - end.y), `${name}: ended at height ${walked.at[1].toFixed(2)}, not ${end.y}`).toBeLessThan(0.6);
    }
  });

  it('has no pit beside it: nowhere within 16 blocks that a walker gets into alive and not out of', () => {
    const found = beside(at, cellsOf(r), w.start, NEAR, FAR, inGorge);
    expect(found.flood.spots.length).toBeGreaterThan(w.cells);
    expect(found.pits.length, `${found.pits.length} pits: ${found.pits.slice(0, 8).map((p) => showPit(at, p)).join('; ')}`).toBe(0);
  });
});

describe('the routes, end to end', () => {
  it('join up with no jump: ramp, road, farm track, brush trail, camp, highway, dam road, dam, avenue, mine, far road', () => {
    // The routes' own cells, and the open ground that links two of them: the hunting camp's clearing between
    // its trail and the highway's start.
    const c = F.camp;
    const link = (x: number, z: number) => x >= c.x0 && x < c.x1 && z >= c.z0 - 1 && z < c.z1;
    const on = (x: number, z: number) => link(x, z) || ROUTES.some((r) => r !== ROUTES[0] && x >= r.box[0] - 1 && x <= r.box[2] + 1 && z >= r.box[1] - 1 && z <= r.box[3] + 1 && r.on(x, z));
    const ramp = ROUTES[1];
    const flood = new Flood(at, [footing(at, ramp.from[0], ramp.from[2], ramp.from[1] + 2)], { inside: on, climb: R.step, drop: R.step });
    for (const r of ROUTES.slice(1)) {
      expect(flood.at(r.from[0], r.from[2], r.from[1], 2.5), `${r.name}: its start`).not.toBeNull();
      expect(flood.at(r.to[0], r.to[2], r.to[1], 2.5), `${r.name}: its end`).not.toBeNull();
    }
  });
});

// ---- The swim -------------------------------------------------------------------------------------------

describe('the tunnel swim, from the valley’s pool to the canyon and back', () => {
  // The gate knows the swimmer and opens: here it stands open.
  const open = land.seenAs((id) => (id === GATE_STONE ? WATER : id));
  const inside = (x: number, z: number) => x > CANYON_POOL.cx - 24 && x < POOL.cx + 24 && Math.abs(z - TUNNEL.z) < 30;
  const bank = footing(at, POOL.cx + POOL.radius + 3, POOL.cz, VALLEY.floor + 4);
  const rampFoot = footing(at, RAMP[0][0] - 1, RAMP[0][1], RAMP[0][2] + 2);

  it('is shut to a walker while the gate is: no way from the pool’s bank to the canyon', () => {
    const shut = new Flood(at, [bank], { inside, jumps: true });
    expect(shut.spots.some((s) => s.x < TUNNEL.x0), 'reached the canyon with the gate shut').toBe(false);
  });

  for (const [name, a, z] of [['out', bank, rampFoot], ['home', rampFoot, bank]] as const) {
    it(`${name}: the real Player swims it on one breath and walks on to the ${name === 'out' ? 'ramp’s foot' : 'pool’s bank'}`, () => {
      const flood = new Flood(open, [a], { inside });
      const end = flood.at(z.x, z.z, z.y, 1);
      expect(end, `no way ${name} from ${show(a)} to ${show(z)}`).not.toBeNull();
      const way = flood.wayTo(end!);
      expect(way.some((s) => s.swim && s.x >= TUNNEL.x0 && s.x < TUNNEL.x1), 'the way goes through the tunnel').toBe(true);
      const swum = follow(open, way, { flow: riverCurrent });
      expect(swum.arrived, `the Player stopped at (${swum.at.map((v) => v.toFixed(1)).join(', ')}) after ${swum.seconds.toFixed(0)} s`).toBe(true);
      expect(swum.breath, `breath left: ${swum.breath.toFixed(1)} of ${BREATH_MAX} s`).toBeGreaterThan(2);
      expect(swum.fall).toBeLessThanOrEqual(R.safeFall);
    });
  }
});

// ---- The gorge ------------------------------------------------------------------------------------------

describe('the gorge, from one end of the world to the other', () => {
  // A strip along the whole gorge, 34 blocks either side of its centre line. Whoever crosses the gorge crosses
  // this strip, whichever way they came: outside the world is solid rock.
  const HALF = 34;
  const inside = (x: number, z: number) => Math.abs(x - ravineX(z)) <= HALF;
  const eastEdge = (z: number) => Math.floor(ravineX(z) + HALF);
  const westEdge = (z: number) => Math.ceil(ravineX(z) - HALF);
  /** The first column west of the west rim's line: the far bank begins here. */
  const farBank = (z: number) => Math.floor(ravineX(z) - RAVINE_HALF);
  /** The dam's top, deck and parapets, taken out: the question is what can be done without it. */
  const noDam = (x: number, y: number, z: number) => x >= D.x0 && x < D.x1 && Math.abs(z + 0.5 - D.z) < ZONE3.damRoad.halfWidth + 1 && y >= D.crest - 0.5;

  it('cannot be crossed without the dam: no walk, jump, swim or cave leads from its east side to the far bank (N3b)', () => {
    // From everywhere a body can be on the strip's east edge, at any height, caves and treetops too. (The edge
    // moves a column at most from one row to the next, so nothing comes into the strip from the east but through it.)
    for (let z = 1; z < WORLD_Z; z++) expect(Math.abs(eastEdge(z) - eastEdge(z - 1))).toBeLessThanOrEqual(1);
    const starts: Spot[] = [];
    for (let z = 0; z < WORLD_Z; z++) starts.push(...standing(at, eastEdge(z), z));
    const flood = new Flood(at, starts, { inside, jumps: true, barred: noDam });
    expect(flood.spots.length).toBeGreaterThan(200_000);
    const across = flood.spots.filter((s) => s.x <= farBank(s.z));
    // Say where, row by row, and one way over.
    const bands = [...new Set(across.map((s) => s.z >> 6))].sort((p, q) => p - q);
    const rows = bands.filter((k, i) => bands[i - 1] !== k - 1).map((k) => { let e = k; while (bands.includes(e + 1)) e++; return `z ${k * 64}–${e * 64 + 63}`; });
    const one = across.length ? across.reduce((p, q) => (q.y > p.y ? q : p)) : null;
    const way = one ? flood.wayTo(one) : [];
    expect(across.length, `the far bank is reached at ${across.length} places (${rows.slice(0, 12).join(', ')}${rows.length > 12 ? ', …' : ''}); one way, in ${way.length} steps: ${way.filter((_s, i) => i % Math.ceil(way.length / 14) === 0 || i === way.length - 1).map(show).join(' → ')}`).toBe(0);
  });

  it('is crossed by the dam: with its crest left in, the same walk reaches the far bank', () => {
    const start = footing(at, D.x1 + 2, D.z, D.crest + 3);
    const near = (x: number, z: number) => inside(x, z) && Math.abs(z - D.z) < 40;
    const flood = new Flood(at, [start], { inside: near });
    expect(flood.at(D.x0 - 1, D.z, D.crest), 'the dam’s west end').not.toBeNull();
    // And without it, from the same place, not.
    const without = new Flood(at, [start], { inside: near, jumps: true, barred: noDam });
    expect(without.spots.some((s) => s.x <= farBank(s.z))).toBe(false);
  });

  it('leaves nobody in it: whoever gets down alive from either rim, on the ground or in the water, can get back up to a rim', () => {
    // From the top of both edges of the strip. (Whoever came from the east gets back up the east side: the far
    // bank is not reached from there, by the test above.)
    const rims: Spot[] = [];
    for (let z = 0; z < WORLD_Z; z++) for (const x of [eastEdge(z), westEdge(z)]) { const all = standing(at, x, z); if (all.length) rims.push(all[all.length - 1]); }
    const flood = new Flood(at, rims, { inside, barred: noDam });
    const home = new Set(rims);
    // (A hole in a tree's crown, down to the leaves or the trunk's top, is not the gorge's doing: those are left out.)
    const crown = (s: Spot) => !s.swim && ['leaves', 'fern_fronds', 'log', 'tree_fern_trunk'].includes(blockName(at(s.x, Math.ceil(s.y) - 1, s.z)));
    const lost = clusters(flood.stuck((s) => home.has(s)).filter((s) => !crown(s)));
    expect(lost.length, `${lost.length} places with no way back: ${lost.slice(0, 8).map((p) => showPit(at, p)).join('; ')}`).toBe(0);
  });
});

// ---- Only what was mended changed -----------------------------------------------------------------------

describe('the land outside what N3 mended', () => {
  /**
   * tests/fixtures/before-n3.json holds a hash of every column of the world as it was before N3's fixes
   * (`tools/worldhash.ts out/now.json 0 63 0 63` on the commit before; `--diff` against it lists what differs).
   * These are the columns that differ now, each `cx:cz,cz-cz`, and no others:
   */
  const MENDED = {
    // The gorge's own columns, the whole length of the world: its west wall cut sheer and no cave through that
    // wall (column 19, and 18 and 20 where the centre line wavers into them), no trees by the wall at the
    // world's ends, the reservoir's west shore, the dam's west wing, the tailrace's culvert and the block
    // between the penstocks (18:24), the bridge's deck (20:31).
    gorge: '18:24,58-60 19:0-63 20:0,3,31,55,61-63',
    // The brush by the outpost: bushes raised so that none is a pit.
    brush: '26:32 27:32 28:31-32',
    // The valley's ring: no cave up to the cliff's foot, pits there filled, hanging rocks gone (all of it); the
    // pool's east bank (50:31-32); the creek's banks (52:32-33, 53:33, 54:33); the slot by the path's top (56:31).
    valley: '49:31 50:29-34 51:28-29,34-35 52:28-29,32-35 53:28-29,33-35 54:28-29,33-35 55:28-30,33-34 56:29-34',
    // The home's rock east of the bowl (N4, docs/FIXES.md 6): coal and copper ore out of it, as in the bowl. (It
    // changes 56:31-32 again as well, which are listed above.)
    home: '57:31-32',
  };
  const mended = new Set<string>();
  for (const list of Object.values(MENDED))
    for (const part of list.split(' ')) {
      const [cx, rows] = part.split(':');
      for (const r of rows.split(',')) { const [a, b = a] = r.split('-').map(Number); for (let cz = a; cz <= b; cz++) mended.add(`${cx},${cz}`); }
    }
  const was = before as Record<string, number>;
  const hashOf = (k: string) => { const [cx, cz] = k.split(',').map(Number); return hashColumn(cx, cz); };

  it('hashes as it did before, in every column next to a mended one and in a spread over the rest of the world', () => {
    expect(Object.keys(was).length).toBe(64 * 64);
    const sample: string[] = [];
    for (let cz = 0; cz < 64; cz++) for (let cx = 0; cx < 64; cx++) {
      if (mended.has(`${cx},${cz}`)) continue;
      let touches = false;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (mended.has(`${cx + dx},${cz + dz}`)) touches = true;
      if (touches || (cx % 6 === 3 && cz % 6 === 2)) sample.push(`${cx},${cz}`);
    }
    expect(sample.length).toBeGreaterThan(250);
    const changed = sample.filter((k) => hashOf(k) !== was[k]);
    expect(changed, `columns changed that N3 did not mean to touch: ${changed.join(' ')}`).toEqual([]);
  });

  it('lists no column that did not change: 75 of the gorge’s, 4 of the brush’s, 38 of the valley’s', () => {
    expect(mended.size).toBe(75 + 4 + 38 + 2);
    const same = [...mended].filter((k) => hashOf(k) === was[k]);
    expect(same, `listed as mended, yet as they were: ${same.join(' ')}`).toEqual([]);
  });
});
