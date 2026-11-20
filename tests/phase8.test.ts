// Phase 8 (docs/PHASE8.md): Zone-4 and the uplink (M5). This file grows with each step.

import { describe, it, expect } from 'vitest';
import {
  ZONE4, ZONE3, ZONE2, PLACES, zoneAt, landZoneAt, inSanctuary, outsideHeight, ravineX, inFallout, falloutDepth, falloutAt, radiationAt,
  onRidgeRoad, ridgeRoadAt, ridgeRoadLength, ridgeRoadPoint, ridgeRoadMark, ridgeRoadHeight, zone4Floor, onAvenue, inReservoir,
} from '../src/gen/layout.ts';
import { WORLD_Y } from '../src/world/constants.ts';

const Z = ZONE4, T = PLACES.ridgeTower;
const HW = Z.road.halfWidth;
/** Every cell of the ridge road. */
const roadCells = (() => { const out: [number, number][] = []; for (let z = 360; z < 752; z++) for (let x = 340; x < 632; x++) if (onRidgeRoad(x, z)) out.push([x, z]); return out; })();

// ---- Zone-4's layout (docs/PHASE8.md, 1) ---------------------------------------------------------------

describe('Zone-4’s layout', () => {
  it('starts the ridge road at the avenue’s bend, level with the dam’s crest, and ends it in the tower’s yard', () => {
    const [x0, z0] = Z.road.pts[0];
    expect(onAvenue(x0, z0)).toBe(true); // the bend itself is the avenue's
    expect(onRidgeRoad(x0, z0 - 1)).toBe(true);
    expect(outsideHeight(x0, z0 - 1)).toBe(ZONE3.dam.crest);
    const [xe, ze] = ridgeRoadPoint(ridgeRoadLength());
    expect(xe >= Z.yard.x0 && xe < Z.yard.x1 && ze >= Z.yard.z0 && ze < Z.yard.z1).toBe(true);
    expect(Math.hypot(xe - T.x, ze - T.z)).toBeLessThan(30);
  });

  it('never steps more than one block, anywhere on its width or along its length', () => {
    expect(roadCells.length).toBeGreaterThan(1800);
    const on = new Set(roadCells.map(([x, z]) => `${x},${z}`));
    for (const [x, z] of roadCells) for (const [dx, dz] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      if (!on.has(`${x + dx},${z + dz}`)) continue;
      expect(Math.abs(outsideHeight(x, z) - outsideHeight(x + dx, z + dz)), `step at ${x},${z}`).toBeLessThanOrEqual(1);
    }
    // Along its centre line: never more than one block in two metres.
    for (let s = 2; s <= ridgeRoadLength(); s++) expect(Math.abs(ridgeRoadHeight(s) - ridgeRoadHeight(s - 2)), `s ${s}`).toBeLessThanOrEqual(1);
  });

  it('is four wide the whole way: every metre of its line has two cells either side', () => {
    for (let s = 1; s < ridgeRoadLength() - 1; s++) {
      const [px, pz] = ridgeRoadPoint(s), [qx, qz] = ridgeRoadPoint(s + 0.5);
      const nx = -(qz - pz) * 2, nz = (qx - px) * 2;
      for (const off of [-1.2, 1.2]) expect(onRidgeRoad(Math.floor(px + nx * off), Math.floor(pz + nz * off)), `s ${s} off ${off}`).toBe(true);
    }
  });

  it('keeps the walk as planned: the gate 260 m from the dam’s west end, the hut 365, the tower’s yard 520', () => {
    const dam = ZONE3.dam.x0 - ZONE3.avenue.x;
    expect(Math.round(dam + ridgeRoadAt(Z.gate.x, Z.gate.z).s)).toBeGreaterThan(240);
    expect(Math.round(dam + ridgeRoadAt(Z.gate.x, Z.gate.z).s)).toBeLessThan(275);
    expect(dam + ridgeRoadMark(Z.road.pass)).toBeLessThan(375);
    expect(dam + ridgeRoadLength()).toBeLessThan(525);
  });

  it('runs along the water’s edge for fifty metres, never in the reservoir, the water within eight metres', () => {
    const [a, b] = Z.road.shore.map((k) => ridgeRoadMark(k));
    expect(b - a).toBeGreaterThan(45);
    for (let s = a; s <= b; s += 2) {
      const [x, z] = ridgeRoadPoint(s);
      let water = false;
      for (let dx = 0; dx <= 10; dx++) if (inReservoir(Math.floor(x) + dx, Math.floor(z))) water = true;
      expect(water, `water beside s ${s}`).toBe(true);
    }
    for (const [x, z] of roadCells) expect(inReservoir(x, z), `${x},${z}`).toBe(false);
  });

  it('stands each place on level ground beside the road', () => {
    const flat = (cells: [number, number][], h: number, what: string) => { for (const [x, z] of cells) expect(outsideHeight(x, z), `${what} at ${x},${z}`).toBe(h); };
    const box = (b: { x0: number; x1: number; z0: number; z1: number }) => { const c: [number, number][] = []; for (let z = b.z0; z < b.z1; z++) for (let x = b.x0; x < b.x1; x++) c.push([x, z]); return c; };
    flat(box(Z.hut), zone4Floor.pass, 'the hut');
    flat(box(Z.yard), zone4Floor.tower, 'the yard');
    flat(box({ x0: Z.observatory.x - 5, x1: Z.observatory.x + 6, z0: Z.observatory.z - 5, z1: Z.observatory.z + 6 }), zone4Floor.observatory, 'the observatory');
    // And each is within a few steps of the asphalt.
    expect(ridgeRoadAt(Z.hut.x0, Z.hut.door + 0.5).dist).toBeLessThan(8);
    expect(ridgeRoadAt(Z.observatory.x - Z.observatory.r, Z.observatory.z + 0.5).dist).toBeLessThan(12);
    expect(ridgeRoadAt(Z.gate.x, Z.gate.z).dist).toBeLessThan(1);
  });

  it('puts the tower’s foot low enough for sixty metres of steel under the sky', () => {
    expect(outsideHeight(T.x, T.z)).toBe(zone4Floor.tower);
    expect(zone4Floor.tower + T.height + 4).toBeLessThan(WORLD_Y);
  });

  it('makes a pass of the pass: two knolls stand ten metres and more over the road between them', () => {
    for (const [kx, kz] of Z.pass.knolls) expect(outsideHeight(kx, kz) - zone4Floor.pass).toBeGreaterThanOrEqual(10);
  });

  it('lets the pond be seen from the road: the hollow falls evenly from the road’s edge to the sump', () => {
    const S = Z.sump;
    // From an eye on the road's nearest point, nothing between stands above the line to the pond's near edge.
    let best = { d: Infinity, s: 0 };
    for (let s = ridgeRoadMark(Z.road.pass); s < ridgeRoadMark(Z.road.dome); s++) { const [x, z] = ridgeRoadPoint(s), d = Math.hypot(x - S.x, z - S.z); if (d < best.d) best = { d, s }; }
    const [ex, ez] = ridgeRoadPoint(best.s), eye = ridgeRoadHeight(best.s) + 1.6, floor = zone4Floor.sump;
    expect(best.d).toBeGreaterThan(S.r + 2); // the road is outside the ring
    for (let k = 1; k < best.d - S.pond; k++) {
      const t = k / (best.d - S.pond + 3), x = ex + (S.x - ex) * (k / best.d), z = ez + (S.z - ez) * (k / best.d);
      expect(outsideHeight(Math.floor(x), Math.floor(z)), `${k} m toward the pond`).toBeLessThanOrEqual(Math.ceil(eye + (floor - eye) * t));
    }
  });
});

// ---- Zone-4 is the ground under the fallout (docs/PHASE8.md, "Design calls") ----------------------------

describe('Zone-4’s bounds', () => {
  it('is the massif west of the reservoir: the old box is inside it, the gate and the shore road outside', () => {
    for (const [x, z] of [[100, 100], [449, 449], [300, 449], [449, 20], [T.x, T.z], [Z.hut.x0, Z.hut.z0], [Z.sump.x, Z.sump.z]]) expect(zoneAt(x, z), `${x},${z}`).toBe('zone4');
    expect(zoneAt(Z.gate.x, Z.gate.z)).toBe('zone3');
    for (const k of Z.road.shore) expect(zoneAt(...Z.road.pts[k])).toBe('zone3');
    expect(landZoneAt(T.x, T.z)).toBe('zone4');
  });

  it('never reaches the gorge, the reservoir’s shores, Zone-3’s works or anything east', () => {
    for (let z = 4; z < 1100; z += 7) for (let x = Math.ceil(ravineX(z) - Z.shoreKeep); x < 2040; x += 9) expect(inFallout(x, z), `${x},${z}`).toBe(false);
    for (const n of ZONE3.nests) expect(zoneAt(n.x, n.z)).toBe('zone3');
    for (const b of [ZONE3.control, ZONE3.powerhouse, ZONE3.shop, ZONE3.foundry, ZONE3.yard, ZONE2.exchange]) expect(inFallout(b.x0, b.z0)).toBe(false);
    expect(inSanctuary(T.x, T.z)).toBe(false);
  });

  it('begins a few metres past the gate’s board, on the road', () => {
    let edge = 0;
    for (let s = 0; s < ridgeRoadLength(); s++) { const [x, z] = ridgeRoadPoint(s); if (inFallout(x, z)) { edge = s; break; } }
    const gate = ridgeRoadAt(Z.gate.x, Z.gate.z).s;
    expect(edge - gate).toBeGreaterThan(5);
    expect(edge - gate).toBeLessThan(20);
  });
});

// ---- The fallout (docs/PHASE8.md, 2) -------------------------------------------------------------------

describe('the fallout', () => {
  const R = Z.rates;
  const edgeS = (() => { for (let s = 0; s < ridgeRoadLength(); s++) { const [x, z] = ridgeRoadPoint(s); if (inFallout(x, z)) return s; } return 0; })();

  it('is nothing outside the line of signs, on the pass’s clean ground, and at Zone-2’s rings it leaves the rings as they were', () => {
    for (let s = 0; s < edgeS; s++) expect(falloutAt(...ridgeRoadPoint(s))).toBe(0);
    expect(falloutAt(Z.clean.x, Z.clean.z)).toBe(0);
    expect(falloutAt(Z.ray.x, Z.ray.z)).toBe(0);
    expect(falloutAt(Z.hut.x0 + 3, Z.hut.z0 + 3)).toBe(0);
    for (const h of ZONE2.hotspots) { expect(falloutAt(h.x, h.z)).toBe(0); expect(radiationAt(h.x, h.z)).toBeCloseTo(h.rate + 0.15); }
    expect(radiationAt(T.x + 12, T.z)).toBe(falloutAt(T.x + 12, T.z));
  });

  it('is weakest on the road: the plan’s table, metre by metre', () => {
    for (let s = edgeS + 25; s <= ridgeRoadLength(); s++) {
      const [x, z] = ridgeRoadPoint(s);
      if (Math.hypot(x - Z.clean.x, z - Z.clean.z) < Z.clean.r) { expect(falloutAt(x, z)).toBe(0); continue; }
      expect(falloutAt(x, z), `s ${s}`).toBeCloseTo(R.road);
    }
    // It climbs over the first twenty metres inside the signs.
    expect(falloutAt(...ridgeRoadPoint(edgeS + 1))).toBeLessThan(R.road * 0.5);
    expect(falloutAt(...ridgeRoadPoint(edgeS + 10))).toBeLessThan(R.road);
    expect(falloutAt(...ridgeRoadPoint(edgeS + 10))).toBeGreaterThan(falloutAt(...ridgeRoadPoint(edgeS + 1)));
  });

  it('is full off the road, least indoors, worst in the sump', () => {
    expect(falloutAt(300, 300)).toBe(R.off);
    expect(falloutAt(T.x - 40, T.z + 60)).toBe(R.off);
    // Twelve metres off the asphalt on the climb.
    const [px, pz] = ridgeRoadPoint(edgeS + 60), [qx, qz] = ridgeRoadPoint(edgeS + 61);
    expect(falloutAt(px - (qz - pz) * 12, pz + (qx - px) * 12)).toBe(R.off);
    expect(falloutAt(Z.relay.split + 4, Z.relay.z0 + 4)).toBe(R.indoors);
    expect(falloutAt(Z.observatory.x + 1, Z.observatory.z + 1)).toBe(R.indoors);
    expect(falloutAt(T.x + 9, T.z)).toBe(R.road); // the yard
    expect(falloutAt(Z.sump.x, Z.sump.z)).toBe(Z.sump.rate);
    expect(falloutAt(Z.sump.x + Z.sump.r - 1, Z.sump.z)).toBeGreaterThanOrEqual(R.off);
    expect(falloutAt(Z.sump.x + 10, Z.sump.z)).toBeGreaterThan(R.off * 1.5);
  });

  it('makes the road the cheapest way from the pass to the tower: the straight line across the sump costs three times as much', () => {
    const WALK = 4; // m/s
    let road = 0;
    for (let s = ridgeRoadMark(Z.road.pass); s < ridgeRoadLength(); s += 0.5) road += falloutAt(...ridgeRoadPoint(s)) * (0.5 / WALK);
    const [ax, az] = Z.road.pts[Z.road.pass], [bx, bz] = ridgeRoadPoint(ridgeRoadLength()), len = Math.hypot(bx - ax, bz - az);
    let straight = 0;
    for (let k = 0; k < len; k += 0.5) straight += falloutAt(ax + ((bx - ax) * k) / len, az + ((bz - az) * k) / len) * (0.5 / WALK);
    expect(len).toBeLessThan(ridgeRoadLength() - ridgeRoadMark(Z.road.pass)); // the straight line is shorter
    expect(straight).toBeGreaterThan(road * 3);
    // In the suit: the road from the pass to the yard costs about twelve.
    expect(road * Z.suit).toBeGreaterThan(8);
    expect(road * Z.suit).toBeLessThan(14);
  });

  it('is zero or more everywhere, and never more than the sump’s heart', () => {
    for (let z = 3; z < 760; z += 11) for (let x = 3; x < 700; x += 11) { const r = falloutAt(x, z); expect(r >= 0 && r <= Z.sump.rate, `${x},${z}: ${r}`).toBe(true); expect(r > 0).toBe(falloutDepth(x, z) > 0 && Math.hypot(x - Z.clean.x, z - Z.clean.z) >= Z.clean.r); }
  });
});

// ---- The tower's frame (docs/PHASE8.md, "Design calls") --------------------------------------------------
import { towerBeams, towerCells, towerTip, towerCorner, TOWER_FRAME } from '../src/gen/towerFrame.ts';

describe('the tower’s frame', () => {
  const cells = towerCells(T.height);

  it('stands on four feet eleven metres apart and tapers to its top', () => {
    for (let k = 0; k < 4; k++) { const [x, , z] = towerCorner(k, 0, T.height); expect(Math.abs(x)).toBe(TOWER_FRAME.base); expect(Math.abs(z)).toBe(TOWER_FRAME.base); }
    const foot = cells.filter(([, y]) => y === 0), top = cells.filter(([, y]) => y === T.height - 1);
    expect(foot.length).toBeGreaterThanOrEqual(4);
    expect(Math.max(...foot.map(([x]) => x)) - Math.min(...foot.map(([x]) => x))).toBe(10);
    expect(Math.max(...top.map(([x]) => x)) - Math.min(...top.map(([x]) => x))).toBeLessThanOrEqual(4);
  });

  it('is one piece of steel from its feet to its mast: every level has blocks, and each touches the level under it', () => {
    const at = new Set(cells.map(([x, y, z]) => `${x},${y},${z}`));
    for (let y = 0; y < T.height + TOWER_FRAME.mast; y++) {
      const level = cells.filter((c) => c[1] === y);
      expect(level.length, `level ${y}`).toBeGreaterThan(0);
      if (y === 0) continue;
      const held = level.some(([x, , z]) => { for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (at.has(`${x + dx},${y - 1},${z + dz}`)) return true; return false; });
      expect(held, `level ${y} stands on the one below`).toBe(true);
    }
    expect(new Set(cells.map((c) => c.join())).size).toBe(cells.length); // no cell twice
    expect(Math.max(...cells.map((c) => c[1]))).toBe(T.height + TOWER_FRAME.mast - 1);
  });

  it('is the same frame drawn from afar and built of blocks: every beam runs through cells, every cell lies on a beam', () => {
    const beams = towerBeams(T.height), at = new Set(cells.map(([x, y, z]) => `${x},${y},${z}`));
    const cap = T.height + TOWER_FRAME.mast - 1;
    for (const { a, b } of beams) for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const p = [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t);
      // (A point on the line between two cells may fall in either.)
      let hit = false;
      for (const ex of [-0.01, 0.01]) for (const ey of [-0.01, 0.01]) for (const ez of [-0.01, 0.01]) if (at.has(`${Math.floor(p[0] + 0.5 + ex)},${Math.max(0, Math.min(cap, Math.floor(p[1] + ey)))},${Math.floor(p[2] + 0.5 + ez)}`)) hit = true;
      expect(hit, `beam point ${p.map((v) => v.toFixed(1))}`).toBe(true);
    }
    const near = (c: number[]) => beams.some(({ a, b }) => {
      const d = [0, 1, 2].map((i) => b[i] - a[i]), len2 = d[0] ** 2 + d[1] ** 2 + d[2] ** 2;
      const t = Math.max(0, Math.min(1, ((c[0] - a[0]) * d[0] + (c[1] + 0.5 - a[1]) * d[1] + (c[2] - a[2]) * d[2]) / len2));
      return Math.hypot(c[0] - a[0] - d[0] * t, c[1] + 0.5 - a[1] - d[1] * t, c[2] - a[2] - d[2] * t) < 1.3;
    });
    for (const c of cells) expect(near(c), `cell ${c}`).toBe(true);
    expect(towerTip(T.height)[1]).toBe(T.height);
  });
});

// ---- The land of earlier phases (docs/PHASE8.md, 1, "Fixtures") ------------------------------------------
import zone3Was from './fixtures/zone3-places.json' with { type: 'json' };
import westWas from './fixtures/west-outside-massif.json' with { type: 'json' };
import eastWas from './fixtures/east-of-ravine.json' with { type: 'json' };
import { hashColumn } from '../tools/worldhash.ts';

describe('the land of earlier phases, with Zone-4 in', () => {
  /** A column the ridge road, its verges, lamps or cleared trees may touch: within 16 m of its line. */
  const nearRoad = (cx: number, cz: number) => { for (let z = cz * 32 - 16; z < cz * 32 + 48; z += 4) for (let x = cx * 32 - 16; x < cx * 32 + 48; x += 4) if (ridgeRoadAt(x, z).dist < 16) return true; return false; };

  it('leaves Zone-3’s built places as they were, but for the columns the ridge road leaves the bend through', () => {
    const was = zone3Was as Record<string, number>;
    const changed = Object.keys(was).filter((k) => { const [cx, cz] = k.split(',').map(Number); return hashColumn(cx, cz) !== was[k]; });
    for (const k of changed) { const [cx, cz] = k.split(',').map(Number); expect(nearRoad(cx, cz), `column ${k} changed, and the road is nowhere near it`).toBe(true); }
    expect(changed.length).toBeGreaterThan(0); // the junction is there
    expect(changed.length).toBeLessThanOrEqual(5); // the bend's two, and three more whose trees stood in the road's way
    // South of the dam's line nothing at all: the avenue, the works, the yard, the mine.
    for (const k of changed) expect(Number(k.split(',')[1])).toBeLessThanOrEqual(23);
  }, 120_000);

  it('leaves the land west of the gorge outside the massif as it was, but for the shore road’s columns', () => {
    const was = westWas as Record<string, number>, keys = Object.keys(was);
    expect(keys.length).toBeGreaterThan(800);
    // Every column within reach of the road, and a spread over the rest.
    const sample = keys.filter((k, i) => { const [cx, cz] = k.split(',').map(Number); return (cx >= 14 && cz >= 12 && cz <= 24) || i % 9 === 0; });
    let same = 0;
    for (const k of sample) {
      const [cx, cz] = k.split(',').map(Number);
      if (hashColumn(cx, cz) === was[k]) { same++; continue; }
      expect(nearRoad(cx, cz), `column ${k} changed, and the road is nowhere near it`).toBe(true);
    }
    expect(same).toBeGreaterThan(sample.length - 12);
  }, 240_000);

  it('leaves every column east of the gorge that lies near Zone-4 as Phase 7 left it', () => {
    const was = eastWas as Record<string, number>;
    // (Phase 7's own test samples the rest of the east; these are the columns the old dome reached.)
    for (let cz = 0; cz <= 22; cz++) for (let cx = 21; cx <= 23; cx++) expect(hashColumn(cx, cz), `column ${cx},${cz}`).toBe(was[`${cx},${cz}`]);
  }, 120_000);
});

// ---- Zone-4, built (docs/PHASE8.md, 1) -----------------------------------------------------------------
import { load } from './load.ts';
import type { World } from '../src/world/world.ts';
import { blockName, B_SOLID, isWaterId } from '../src/world/blocks.ts';
import { blockOf, skyOf } from '../src/world/light.ts';
import * as Z4 from '../src/gen/zone4.ts';
import { initialContents } from '../src/gen/inheritance.ts';
import { itemId } from '../src/world/items.ts';
import { LIGHT_KEEN } from '../src/entity/ashen.ts';

let ridgeWorld: World | null = null;
const ridge = (): World => (ridgeWorld ??= load(344, 364, 636, 752));

describe('Zone-4’s places, built and lit', () => {
  const w = ridge();
  const name = (x: number, y: number, z: number) => blockName(w.blockAt(x, y, z));
  const base = (x: number, y: number, z: number) => name(x, y, z).split('@')[0];
  const lamp = (x: number, y: number, z: number) => blockOf(w.lightAt(x, y, z));
  const sky = (x: number, y: number, z: number) => skyOf(w.lightAt(x, y, z));
  const open = (x: number, y: number, z: number) => !B_SOLID[w.blockAt(x, y, z)] && !B_SOLID[w.blockAt(x, y + 1, z)];
  const count = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, n: string) => { let k = 0; for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) if (base(x, y, z) === n) k++; return k; };
  const has = (p: [number, number, number], item: string) => initialContents(...p, 27).some((s) => s?.id === itemId(item));
  const GF = zone4Floor.gate, PF = zone4Floor.pass, OF = zone4Floor.observatory, TF = zone4Floor.tower;
  const H = Z.hut, O = Z.observatory, R = Z.relay, G = Z.gate, S = Z.sump;

  it('paves the ridge road and keeps it clear: asphalt, six blocks of air over it, solid rock under it, no tree on it', () => {
    for (const [x, z] of roadCells) {
      const y = outsideHeight(x, z);
      expect(['road', 'gravel', 'dirt', 'dead_soil'], `${x},${z}: ${name(x, y - 1, z)}`).toContain(name(x, y - 1, z));
      // (Six blocks of air, but under the gate's board, which hangs three above the road, and at its barriers, which are walked round.)
      for (let k = 0; k < 6; k++) if (!(k >= 3 && base(x, y + k, z) === 'hot_board') && base(x, y + k, z) !== 'concrete_barrier') expect(B_SOLID[w.blockAt(x, y + k, z)], `clear ${k} over ${x},${z}: ${name(x, y + k, z)}`).toBe(0);
      for (let k = 2; k <= 7; k++) expect(B_SOLID[w.blockAt(x, y - k, z)], `rock ${k} under ${x},${z}`).toBe(1);
    }
  });

  it('lights it from the bend to the yard: the centre line is never darker than 7 of 15 by lamplight', () => {
    let darkest = 15;
    for (let s = 1; s <= ridgeRoadLength(); s++) {
      const [px, pz] = ridgeRoadPoint(s), x = Math.floor(px), z = Math.floor(pz);
      const l = lamp(x, outsideHeight(x, z) + 1, z);
      darkest = Math.min(darkest, l);
      expect(l, `s ${s} at ${x},${z}`).toBeGreaterThanOrEqual(7);
    }
    expect(Z4.ridgeLamps().length).toBeGreaterThan(50);
    for (const [x, z, top] of Z4.ridgeLamps()) { expect(name(x, top, z), `lamp at ${x},${z}`).toBe('arc_lamp'); expect(onRidgeRoad(x, z)).toBe(false); }
  });

  it('signs it at the bend: a board two wide, lit, facing those who come off the dam', () => {
    const g = outsideHeight(Z.sign.x, Z.sign.z);
    for (const dz of [0, 1]) for (const dy of [2, 3]) expect(name(Z.sign.x, g + dy, Z.sign.z + dz)).toBe('ridge_sign@east');
    expect(count(Z.sign.x, Z.sign.x + 1, g, g + 6, Z.sign.z - 1, Z.sign.z + 3, 'lantern')).toBe(2);
    // Nothing stands between the board and the crest road's walkers.
    for (let x = Z.sign.x + 1; x < Z.sign.x + 12; x++) for (const dy of [2, 3]) expect(B_SOLID[w.blockAt(x, g + dy, Z.sign.z)], `in front of the sign at x ${x}`).toBe(0);
  });

  it('guards the shore with a parapet, and steps the landing down the bank into the water', () => {
    const [a, b] = Z.road.shore.map((k) => ridgeRoadMark(k));
    let rail = 0;
    // (A lamp post stands in its line every sixteen metres; the landing's head is open.)
    const guard = (x: number, y: number, z: number) => ['dam_parapet', 'fence_post'].includes(base(x, y, z));
    for (let s = a; s <= b; s++) { const [px, pz] = ridgeRoadPoint(s), h = ridgeRoadHeight(s); let ok = false; for (let dx = 2; dx <= 6; dx++) for (const dy of [-3, -2, -1, 0, 1]) if (guard(Math.floor(px) + dx, h + dy, Math.floor(pz))) ok = true; if (ok) rail++; }
    expect(rail).toBeGreaterThan((b - a) * 0.8);
    // The steps: one block down a row, the last ones under the water, with air to stand in.
    const L = Z.landing, water = ZONE3.dam.water;
    let prev: number | null = null, wet = 0;
    for (let k = 0; k <= L.steps; k++) {
      const z = L.z - k;
      let x = 0; for (let xx = 615; xx < 630; xx++) if (onRidgeRoad(xx, z)) x = xx; // the road's last column here
      let h = 0; for (let y = 95; y > 60; y--) if (B_SOLID[w.blockAt(x + 1, y - 1, z)]) { h = y; break; }
      if (prev !== null) expect(prev - h, `step at z ${z}`).toBe(1);
      prev = h;
      if (h < water) { wet++; expect(isWaterId(w.blockAt(x + 1, h, z))).toBe(true); }
      else expect(open(x + 1, h, z), `room on the step at z ${z}`).toBe(true);
    }
    expect(wet).toBeGreaterThanOrEqual(2);
  });

  it('builds the gate: the board over the road, barriers to walk round, a booth with a shelf, all lit', () => {
    expect(count(G.x - 3, G.x + 3, GF + 3, GF + 5, G.z - 5, G.z - 4, 'hot_board')).toBe(8);
    expect(name(G.x - 2, GF + 3, G.z - 5)).toBe('hot_board@south');
    for (let x = G.x - 2; x <= G.x + 1; x++) for (let y = GF; y < GF + 3; y++) expect(B_SOLID[w.blockAt(x, y, G.z - 5)], `room under the board at x ${x}`).toBe(0);
    expect(count(G.x - 3, G.x + 3, GF, GF + 1, G.z - 3, G.z + 5, 'concrete_barrier')).toBe(4);
    expect(name(...Z4.BOOTH_SHELF)).toBe('stock_crate');
    expect(has(Z4.BOOTH_SHELF, 'rad_tablets')).toBe(true);
    expect(open(Z4.BOOTH_SHELF[0] + 1, GF, Z4.BOOTH_SHELF[2])).toBe(true); // reached from the road's side
    expect(lamp(G.x, GF + 1, G.z)).toBeGreaterThanOrEqual(9);
    expect(falloutAt(G.x, G.z)).toBe(0);
  });

  it('marks the fallout’s edge with a warning sign every sixteen metres, each just outside it and facing out', () => {
    const signs = Z4.edgeSigns();
    expect(signs.length).toBeGreaterThan(55);
    let seen = 0;
    for (const [x, z] of signs) {
      expect(falloutDepth(x, z)).toBeLessThanOrEqual(0);
      expect(falloutDepth(x, z)).toBeGreaterThan(-4);
      if (x < 346 || x > 634 || z < 366 || z > 750) continue;
      expect(base(x, outsideHeight(x, z), z), `sign at ${x},${z}`).toBe('rad_sign');
      seen++;
    }
    expect(seen).toBeGreaterThan(15);
    // Either side of the gate there is one within twenty metres of the road.
    const nearRoad = signs.filter(([x, z]) => ridgeRoadAt(x, z).dist < 22);
    expect(nearRoad.length).toBeGreaterThanOrEqual(2);
  });

  it('is dead under the fallout: grey ground, bare trunks, no leaf and no moss; green only on the pass', () => {
    let dead = 0, green = 0, snags = 0;
    for (let z = 370; z < 600; z += 3) for (let x = 350; x < 560; x += 3) {
      // (Within a crown's reach of the edge a living tree outside may hang over.)
      if (falloutDepth(x, z) < 10 || onRidgeRoad(x, z, 4) || Z4.zone4Place(x, z)) continue;
      const g = outsideHeight(x, z), top = name(x, g - 1, z);
      expect(['grass', 'forest_floor', 'moss', 'mud', 'limestone_mossy'], `${x},${z}: ${top}`).not.toContain(top);
      if (top === 'dead_soil') dead++;
      for (let y = g; y < g + 14; y++) { const n = name(x, y, z); expect(['leaves', 'fern_fronds', 'fern', 'tall_grass', 'bromeliad', 'orchid', 'log', 'bamboo'], `${x},${y},${z}`).not.toContain(n); if (n === 'dead_trunk') snags++; }
    }
    expect(dead).toBeGreaterThan(1500);
    expect(snags).toBeGreaterThan(30);
    for (let z = Z.clean.z - 9; z <= Z.clean.z + 9; z += 2) for (let x = Z.clean.x - 9; x <= Z.clean.x + 9; x += 2) if (name(x, outsideHeight(x, z) - 1, z) === 'grass') green++;
    expect(green).toBeGreaterThan(30);
    const [tx, tz] = Z4.CLEAN_TREE;
    expect(count(tx - 3, tx + 4, PF, PF + 12, tz - 3, tz + 4, 'leaves')).toBeGreaterThan(40);
    expect(Z4.CLEAN_BOARDS.length).toBeGreaterThanOrEqual(5);
    for (const [x, z] of Z4.CLEAN_BOARDS) expect(base(x, outsideHeight(x, z), z)).toBe('clean_sign');
  });

  it('builds the refuge hut on the pass: a door on the road, the stove, the stores, the wardens’ log, lit inside and out', () => {
    for (const y of [PF, PF + 1]) expect(name(H.x0, y, H.door)).toBe('air');
    expect(name(...Z4.HUT_STOVE)).toBe('stove@west');
    expect(name(...Z4.HUT_CRATE)).toBe('stock_crate');
    for (const item of ['rad_tablets', 'canned_food', 'water_jug']) expect(has(Z4.HUT_CRATE, item), item).toBe(true);
    expect(name(...Z4.HUT_LOG)).toBe('note_desk');
    expect(name(H.x0 - 1, PF + 2, H.door)).toBe('refugio_sign@west');
    // A roof over every cell, and lamplight on every open one.
    for (let z = H.z0 + 1; z < H.z1 - 1; z++) for (let x = H.x0 + 1; x < H.x1 - 1; x++) {
      expect(B_SOLID[w.blockAt(x, PF + 3, z)] || name(x, PF + 3, z) === 'stove_pipe', `roof at ${x},${z}`).toBeTruthy();
      if (open(x, PF, z)) expect(lamp(x, PF + 1, z), `light at ${x},${z}`).toBeGreaterThanOrEqual(10);
    }
    // From the door a walker reaches the stove, the crate and the log.
    for (const p of [Z4.HUT_STOVE, Z4.HUT_CRATE, Z4.HUT_LOG]) { let beside = false; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (open(p[0] + dx, PF, p[2] + dz)) beside = true; expect(beside).toBe(true); }
    // Ray's spot is open ground under the eave, off the asphalt, and lit.
    const rx = Math.floor(Z.ray.x), rz = Math.floor(Z.ray.z);
    expect(open(rx, PF, rz)).toBe(true);
    expect(onRidgeRoad(rx, rz)).toBe(false);
    expect(lamp(rx, PF + 1, rz)).toBeGreaterThanOrEqual(9);
  });

  it('sinks the sump: black sludge level with the hollow’s floor, drums round it, a ring of signs and tape', () => {
    const f = zone4Floor.sump;
    expect(count(S.x - S.pond, S.x + S.pond + 1, f - 1, f, S.z - S.pond, S.z + S.pond + 1, 'sludge')).toBeGreaterThan(110);
    expect(count(S.x - S.pond - 1, S.x + S.pond + 2, f, f + 4, S.z - S.pond - 1, S.z + S.pond + 2, 'sludge')).toBe(0);
    expect(count(S.x - 12, S.x + 13, f - 1, f + 6, S.z - 12, S.z + 13, 'waste_drum')).toBeGreaterThanOrEqual(6);
    let signs = 0, posts = 0;
    for (const [x, z, face] of Z4.SUMP_RING) { const g = outsideHeight(x, z); if (face >= 0) { expect(base(x, g, z)).toBe('rad_sign'); signs++; } else { expect(name(x, g, z)).toBe('fence_post'); expect(name(x, g + 1, z)).toBe('hazard_tape'); posts++; } expect(onRidgeRoad(x, z)).toBe(false); }
    expect(signs).toBe(12); expect(posts).toBe(12);
  });

  it('builds the observatory: a drum and a dome, the tube out through the slit, the telescope on its pier, a door toward the road', () => {
    expect(name(...Z4.DOME_SCOPE)).toBe('dome_scope');
    expect(count(O.x - 6, O.x + 7, OF + 4, OF + 12, O.z - 6, O.z + 7, 'dome_shell')).toBeGreaterThan(90);
    expect(count(O.x - 6, O.x + 1, OF + 2, OF + 9, O.z, O.z + 1, 'scope_tube')).toBe(6);
    for (const y of [OF, OF + 1]) expect(name(O.x - O.r, y, O.z)).toBe('air');
    expect(name(O.x - O.r - 1, OF + 2, O.z)).toBe('observatorio_sign@west');
    expect(name(...Z4.DOME_PAGE)).toBe('note_desk');
    expect(has(Z4.DOME_CRATE, 'glass')).toBe(true);
    // Lit inside: every open cell of the floor.
    let cells = 0;
    for (let z = O.z - 4; z <= O.z + 4; z++) for (let x = O.x - 4; x <= O.x + 4; x++) if (Math.hypot(x - O.x, z - O.z) < 3.9 && open(x, OF, z)) { cells++; expect(lamp(x, OF + 1, z), `light at ${x},${z}`).toBeGreaterThanOrEqual(8); }
    expect(cells).toBeGreaterThan(30);
    // From the door a walker reaches the telescope's pier.
    for (let x = O.x - O.r; x < O.x - 1; x++) expect(open(x, OF, O.z), `the way in at x ${x}`).toBe(true);
  });

  it('raises the tower in the yard: every block of its frame, footings under its feet, a beacon at the top and one halfway', () => {
    for (const [dx, dy, dz] of towerCells(T.height)) expect(name(T.x + dx, TF + dy, T.z + dz), `frame at ${dx},${dy},${dz}`).toBe('tower_steel');
    for (const [sx, sz] of [[-5, -5], [5, -5], [5, 5], [-5, 5]]) expect(name(T.x + sx, TF - 1, T.z + sz)).toBe('concrete');
    for (const b of Z4.TOWER_BEACONS) { expect(name(...b)).toBe('red_beacon'); expect(b[1]).toBeLessThan(WORLD_Y); }
    expect(Z4.TOWER_BEACONS[0][1]).toBe(TF + T.height + 3);
    // Sixty metres of open sky over the yard beside it: nothing else stands that high.
    expect(sky(T.x + 9, TF + 1, T.z)).toBe(15);
  });

  it('lays the fallen dish in the yard under a lamp, and lights the yard', () => {
    for (const p of Z4.DISH_PANELS) { expect(name(...p)).toBe('dish_panel'); expect(lamp(p[0], p[1] + 1, p[2])).toBeGreaterThanOrEqual(8); }
    expect(lamp(R.door, TF + 1, R.z0 - 2)).toBeGreaterThanOrEqual(10);
    let dim = 0, n = 0;
    for (let z = Z.yard.z0 + 2; z < R.z0 - 1; z += 2) for (let x = T.x + 7; x < Z.yard.x1 - 1; x += 2) { n++; if (lamp(x, TF + 1, z) < 7) dim++; }
    expect(dim / n).toBeLessThan(0.15);
  });

  it('builds the relay station: the lit half with its racks, spares and manual; a wall with no way through; the dark hall behind its baffle', () => {
    for (const k of Z4.RELAY_RACKS) expect(base(...k)).toBe('relay_rack');
    expect(Z4.RELAY_RACKS.length).toBe(6);
    expect(has(Z4.RELAY_CRATE, 'antenna_section')).toBe(true);
    expect(has(Z4.RELAY_CRATE, 'rad_tablets')).toBe(true);
    expect(base(...Z4.PHARMA_MANUAL)).toBe('manual_shelf');
    expect(name(...Z4.RELAY_PAGE)).toBe('note_desk');
    for (const x of [R.door, R.door + 1]) for (let y = TF; y < TF + 3; y++) expect(name(x, y, R.z0)).toBe('air');
    expect(base(R.door, TF + 4, R.z0 - 1)).toBe('relay_sign');
    // The wall between the halves is whole, floor to roof.
    for (let z = R.z0; z < R.z1; z++) for (let y = TF; y < TF + 5; y++) expect(name(R.split, y, z), `wall at z ${z} y ${y}`).toBe('concrete');
    // Every open cell of the lit half is in lamplight; each rack, the crate and the manual can be stood beside.
    let lit = 0;
    for (let z = R.z0 + 1; z < R.z1 - 1; z++) for (let x = R.split + 1; x < R.x1 - 1; x++) if (open(x, TF, z)) { lit++; expect(lamp(x, TF + 1, z), `light at ${x},${z}`).toBeGreaterThanOrEqual(9); }
    expect(lit).toBeGreaterThan(50);
    for (const p of [...Z4.RELAY_RACKS, Z4.RELAY_CRATE, Z4.RELAY_PAGE]) { let beside = false; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (open(p[0] + dx, TF, p[2] + dz)) beside = true; expect(beside, `beside ${p}`).toBe(true); }
    // The battery hall: its bay open to the west, and where they keep, neither lamp nor daylight.
    for (let z = R.bay; z < R.bay + 4; z++) expect(open(R.x0, TF, z)).toBe(true);
    const nx = Math.floor(Z.nest.x), nz = Math.floor(Z.nest.z);
    expect(open(nx, TF, nz)).toBe(true);
    expect(lamp(nx, TF + 1, nz)).toBeLessThan(LIGHT_KEEN);
    expect(sky(nx, TF + 1, nz)).toBeLessThan(LIGHT_KEEN);
    expect(count(R.x0, R.split, TF, TF + 5, R.z0, R.z1, 'lantern')).toBe(0);
    // Their way out: each leg of it is open floor.
    let [ax, az] = [Z.nest.x, Z.nest.z];
    for (const [bx, bz] of Z.nest.path) {
      const len = Math.hypot(bx - ax, bz - az);
      for (let k = 0; k <= len; k += 0.5) { const x = Math.floor(ax + ((bx - ax) * k) / len), z = Math.floor(az + ((bz - az) * k) / len); expect(open(x, TF, z), `their way at ${x},${z}`).toBe(true); }
      [ax, az] = [bx, bz];
    }
  });

  it('opens no cave under any place', () => {
    const under = (x: number, z: number, floor: number) => { for (let k = 2; k <= 8; k++) expect(B_SOLID[w.blockAt(x, floor - k, z)], `hollow ${k} under ${x},${z}`).toBe(1); };
    for (let z = Z.yard.z0; z < Z.yard.z1; z += 2) for (let x = Z.yard.x0; x < Z.yard.x1; x += 2) under(x, z, TF);
    for (let z = H.z0; z < H.z1; z++) for (let x = H.x0; x < H.x1; x++) under(x, z, PF);
    for (let z = O.z - 5; z <= O.z + 5; z += 2) for (let x = O.x - 5; x <= O.x + 5; x += 2) under(x, z, OF);
  });
});
