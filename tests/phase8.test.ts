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
    // No tablets this side of the gate (the fresh review, 7): one let a runner reach the refuge alive, at the limit.
    expect(has(Z4.BOOTH_SHELF, 'rad_tablets')).toBe(false);
    expect(has(Z4.BOOTH_SHELF, 'bandage')).toBe(true);
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
      for (let y = g; y < g + 14; y++) { const n = name(x, y, z); expect(['leaves', 'fern_fronds', 'fern', 'tall_grass', 'bromeliad', 'orchid', 'log', 'bamboo', 'leaves_pale', 'banana_leaves', 'banana_trunk'], `${x},${y},${z}`).not.toContain(n); if (n === 'dead_trunk') snags++; }
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

// ---- Radiation, the suit and the tablets (docs/PHASE8.md, 2) ---------------------------------------------
import {
  stepDose, healthCap, clickRate, nearHotspot, doseRate, absorb, takeTablet, secondsToLimit, secondsToLive, meterLine, roadDose,
  DOSE_MAX, SUIT_LETS, TABLET_DOSE, FADE_PER_DAY, EDGE_HEARD,
} from '../src/sim/radiation.ts';

describe('the dose, the suit and the tablets', () => {
  const WALK = 4, SPRINT = 5.6;
  const gateS = ridgeRoadAt(Z.gate.x, Z.gate.z).s, passS = ridgeRoadMark(Z.road.pass), endS = ridgeRoadLength();
  /** Walks the road from s0 to s1 at `speed`, a tick at a time, as the game will: the dose and the health left. */
  const walk = (s0: number, s1: number, speed: number, suited: boolean, dose = 0, hp = 100) => {
    const dt = 1 / 20, dir = Math.sign(s1 - s0);
    for (let s = s0; dir * (s1 - s) > 0 && hp > 0; s += dir * speed * dt) {
      const r = absorb(dose, ...ridgeRoadPoint(s), dt, suited);
      dose = r.dose; hp = Math.min(hp - r.harm, healthCap(dose));
    }
    return { dose, hp };
  };

  it('lets a fortieth through the suit, everywhere: on the ridge and in Zone-2’s rings', () => {
    expect(SUIT_LETS).toBe(0.025);
    const [x, z] = ridgeRoadPoint(passS + 60);
    expect(doseRate(x, z, false)).toBeCloseTo(Z.rates.road);
    expect(doseRate(x, z, true)).toBeCloseTo(Z.rates.road / 40);
    const h = ZONE2.hotspots[0];
    expect(doseRate(h.x, h.z, true)).toBeCloseTo(doseRate(h.x, h.z, false) / 40);
    expect(doseRate(Z.clean.x, Z.clean.z, false)).toBe(0);
  });

  it('stops the dose at 100 and takes the rest from health, one for one', () => {
    const [x, z] = ridgeRoadPoint(passS + 60);
    expect(absorb(20, x, z, 5, false)).toEqual({ dose: 80, harm: 0 });
    const over = absorb(90, x, z, 5, false);
    expect(over.dose).toBe(DOSE_MAX);
    expect(over.harm).toBeCloseTo(50);
    expect(absorb(100, x, z, 2, false).harm).toBeCloseTo(24);
    // Out of the ground's reach nothing more is taken, at the limit or under it.
    expect(absorb(100, Z.clean.x, Z.clean.z, 60, false)).toEqual({ dose: 100, harm: 0 });
    expect(absorb(100, 1700, 1024, 60, false).harm).toBe(0);
    // It fades on the game's clock as before, and the old step agrees with the new one under the limit.
    expect(absorb(40, 1700, 1024, 0, false, 24).dose).toBeCloseTo(40 - FADE_PER_DAY);
    expect(absorb(10, x, z, 3, false).dose).toBeCloseTo(stepDose(10, x, z, 3, 0));
  });

  it('holds in Zone-2’s rings too: thirty-odd seconds in the van’s heart, then it hurts; one step out and it stops', () => {
    const h = ZONE2.hotspots[0];
    let dose = 0, harm = 0, t = 0;
    while (harm === 0 && t < 120) { const r = absorb(dose, h.x, h.z, 0.5, false); dose = r.dose; harm = r.harm; t += 0.5; }
    expect(t).toBeGreaterThan(28);
    expect(t).toBeLessThan(40);
    expect(absorb(100, h.x + h.r + 1, h.z, 10, false).harm).toBe(0);
  });

  it('makes the gate a wall without a suit: nobody reaches the hut’s clean ground alive, walking or running, fed and whole', () => {
    // (At half the strength a runner reached the hut with 30 health and a dose of 100: alive, and stranded.)
    expect(walk(gateS, passS - Z.clean.r, WALK, false).hp).toBeLessThanOrEqual(0);
    expect(walk(gateS, passS - Z.clean.r, SPRINT, false).hp).toBeLessThanOrEqual(0);
    // But the first steps past the signs can be taken back: ten metres in and out again leaves a walker alive.
    const edge = (() => { for (let s = 0; s < endS; s++) if (inFallout(...ridgeRoadPoint(s))) return s; return 0; })();
    const inAndOut = walk(edge + 10, edge, WALK, false, walk(edge, edge + 10, WALK, false).dose, 100);
    expect(inAndOut.hp).toBeGreaterThan(60);
    expect(inAndOut.dose).toBeLessThan(40);
  });

  it('lets a suited walker reach the tower and come home with a dose under 45 by the road alone', () => {
    const up = walk(gateS, endS, WALK, true);
    expect(up.hp).toBe(healthCap(up.dose));
    expect(up.dose).toBeGreaterThan(15);
    expect(up.dose).toBeLessThan(22);
    const home = walk(endS, gateS, WALK, true, up.dose, up.hp);
    expect(home.dose).toBeLessThan(45);
    expect(home.hp).toBeGreaterThan(70);
    // The plan's numbers: the gate to the hut about 8, the hut to the tower about 11.
    expect(roadDose(gateS, passS, true)).toBeGreaterThan(6);
    expect(roadDose(gateS, passS, true)).toBeLessThan(9);
    expect(roadDose(passS, endS, true)).toBeGreaterThan(9);
    expect(roadDose(passS, endS, true)).toBeLessThan(13);
    expect(roadDose(endS, passS, true)).toBeCloseTo(roadDose(passS, endS, true));
    expect(roadDose(0, gateS, false)).toBe(0);
  });

  it('binds thirty with a tablet, never under nothing; the cap on health follows the dose', () => {
    expect(TABLET_DOSE).toBe(30);
    expect(takeTablet(80)).toBe(50);
    expect(takeTablet(12)).toBe(0);
    expect(healthCap(takeTablet(100))).toBeGreaterThan(healthCap(100));
    expect(healthCap(100)).toBe(40);
  });

  it('says how long there is: to the limit, and to live', () => {
    expect(secondsToLimit(0, Z.rates.road)).toBeCloseTo(100 / 12);
    expect(secondsToLimit(100, 6)).toBe(0);
    expect(secondsToLimit(50, 0)).toBe(Infinity);
    // Without a suit on the road: the limit in about 8 s, and the 40 health the limit leaves gone 3 s later.
    expect(secondsToLive(0, 100, Z.rates.road)).toBeCloseTo(100 / 12 + 40 / 12);
    expect(secondsToLive(100, 12, 6)).toBeCloseTo(2);
    expect(secondsToLive(10, 100, 0)).toBe(Infinity);
  });

  it('writes the meter’s line: the rate, the suit, the time to the limit; an alarm without a suit or under a minute', () => {
    expect(meterLine(20, 0, true)).toEqual({ text: '', alarm: false });
    expect(meterLine(0, 6, false)).toEqual({ text: '+6/s · NO SUIT · limit in 0:16', alarm: true });
    expect(meterLine(10, 0.3, true)).toEqual({ text: '+0.3/s · suit · limit in 5:00', alarm: false });
    expect(meterLine(90, 0.3, true).alarm).toBe(true);
    expect(meterLine(100, 3, true).text).toContain('at the limit');
    expect(meterLine(100, 3, true).alarm).toBe(true);
  });

  it('ticks the counter by the ground’s rate, from ten metres outside the signs, and leaves Zone-2’s rings as they clicked', () => {
    const edge = (() => { for (let s = 0; s < endS; s++) if (inFallout(...ridgeRoadPoint(s))) return s; return 0; })();
    expect(clickRate(...ridgeRoadPoint(edge - EDGE_HEARD - 3))).toBe(0);
    expect(clickRate(...ridgeRoadPoint(edge - 4))).toBeGreaterThan(0);
    expect(clickRate(...ridgeRoadPoint(edge - 4))).toBeLessThan(0.2);
    const road = clickRate(...ridgeRoadPoint(passS + 60));
    expect(road).toBeGreaterThan(0.3);
    expect(clickRate(300, 300)).toBeGreaterThan(road);
    expect(road).toBeLessThan(0.7);
    expect(clickRate(Z.sump.x, Z.sump.z)).toBe(1);
    expect(clickRate(Z.clean.x, Z.clean.z)).toBe(0); // the hut is quiet
    expect(nearHotspot(...ridgeRoadPoint(edge - 4))).toBe(true);
    const h = ZONE2.hotspots[0];
    expect(clickRate(h.x, h.z)).toBeCloseTo(0.4 + h.rate / 5 > 1 ? 1 : 0.4 + h.rate / 5);
    expect(clickRate(1700, 1024)).toBe(0);
  });
});

// ---- The data: blocks, items, recipes, trade (docs/PHASE8.md, 4) -----------------------------------------
import { RECIPES, recipesAt, make, stationOf, STATION_LABEL } from '../src/sim/crafting.ts';
import { Inventory } from '../src/sim/inventory.ts';
import { hasItem, dropOf, itemLabel } from '../src/world/items.ts';
import { hasIcon } from '../src/render/itemIcons.ts';
import { hasTexture } from '../src/render/textures.ts';
import { BLOCK_DEFS, blockId, TEXTURE_NAMES } from '../src/world/blocks.ts';
import items from '../data/items.json' with { type: 'json' };
import { CATALOG_RAY, CATALOG_RAY_M5, sellPrice, tradeNamesValid, UNIT } from '../src/sim/trade.ts';

describe('M5’s data', () => {
  const bag = (...things: [string, number][]) => { const inv = new Inventory(36); for (const [n, c] of things) inv.add(itemId(n), c); return inv; };
  const recipe = (station: string, out: string, known: string[] = []) => recipesAt(station as never, new Set(known)).find((r) => r.out[0] === itemId(out));
  const M5_ITEMS = ['hazard_suit', 'rad_tablets', 'antenna_section', 'rare_components', 'telescope_optics', 'sat_modem', 'sat_antenna', 'uplink_terminal', 'spirit', 'antibiotics', 'adrenaline', 'thermal_optic', 'engineer_armor'];

  it('draws every new block’s texture and every new item’s icon', () => {
    for (const n of TEXTURE_NAMES) expect(hasTexture(n), `texture ${n}`).toBe(true);
    for (const it of items.items as { name: string; icon: string }[]) expect(hasIcon(it.icon), `icon ${it.icon}`).toBe(true);
    for (const n of M5_ITEMS) expect(hasItem(n), n).toBe(true);
  });

  it('gives what the plan says for what is mined on the ridge, and nothing for the tower', () => {
    expect(dropOf(blockId('dish_panel'))).toBe(itemId('antenna_section'));
    expect(dropOf(blockId('relay_rack'))).toBe(itemId('rare_components'));
    expect(dropOf(blockId('dome_scope'))).toBe(itemId('telescope_optics'));
    for (const n of ['tower_steel', 'sat_dish', 'antenna_hoist']) { expect(BLOCK_DEFS[blockId(n)].hardness).toBeLessThan(0); expect(dropOf(blockId(n))).toBe(0); }
    for (const n of ['telescope', 'med_bench', 'distiller', 'sonic_lure', 'smoke_pot']) expect(dropOf(blockId(n)), n).toBe(blockId(n)); // set down, taken up again
    for (const n of ['sonic_lure_on', 'smoke_pot_lit']) expect(dropOf(blockId(n))).toBe(0); // a running one is spent
  });

  it('keeps every recipe to four kinds of input, each a thing that exists', () => {
    for (const r of RECIPES) expect(r.in.length).toBeLessThanOrEqual(4);
  });

  it('shows the suit only on Ray’s word, and makes it from what Zones 1–3 and the kiln give', () => {
    expect(recipe('workbench', 'hazard_suit')).toBeUndefined();
    const r = recipe('workbench', 'hazard_suit', ['suit_word', 'm4_done'])!; // (his word itself waits for M4: src/sim/ridge.ts)
    expect(r.in.map(([id]) => id).sort()).toEqual(['canvas', 'scrap_lead', 'glass', 'charcoal'].map(itemId).sort());
    const inv = bag(['canvas', 4], ['scrap_lead', 4], ['glass', 1], ['charcoal', 2]);
    expect(make(inv, r)).toBe('made');
    expect(inv.count(itemId('hazard_suit'))).toBe(1);
  });

  it('chains the uplink: the dish’s sections → the antenna; the optics → the telescope; Ray’s modem and the racks → the terminal, the plans kept', () => {
    expect(recipe('workbench', 'sat_antenna')).toBeUndefined();
    const ant = bag(['antenna_section', 3], ['steel_ingot', 4], ['wiring', 2], ['pipe_fittings', 2]);
    expect(make(ant, recipe('workbench', 'sat_antenna', ['uplink_plans', 'm4_done'])!)).toBe('made');
    const tel = bag(['telescope_optics', 1], ['steel_ingot', 2], ['glass', 1], ['planks', 2]);
    expect(recipe('lathe', 'telescope')).toBeUndefined(); // each milestone's recipes wait for the one before
    expect(make(tel, recipe('lathe', 'telescope', ['m4_done'])!)).toBe('made');
    expect(tel.count(blockId('telescope'))).toBe(1);
    const term = bag(['sat_modem', 1], ['rare_components', 2], ['wiring', 4], ['uplink_plans', 1]);
    expect(make(term, recipe('workbench', 'uplink_terminal', ['uplink_plans', 'm4_done'])!)).toBe('made');
    expect(term.count(itemId('uplink_plans'))).toBe(1);
    expect(term.count(itemId('sat_modem'))).toBe(0);
    // Without the plans in the pack it cannot be made.
    expect(make(bag(['sat_modem', 1], ['rare_components', 2], ['wiring', 4]), recipe('workbench', 'uplink_terminal', ['uplink_plans', 'm4_done'])!)).toBe('short');
  });

  it('makes the medical bench and the distiller stations, shown by the manual; three medicines from the valley’s own crops', () => {
    expect(stationOf(blockId('med_bench'))).toBe('med_bench');
    expect(stationOf(blockId('distiller'))).toBe('distiller');
    expect(STATION_LABEL.med_bench).toBe('Medical bench');
    expect(recipe('workbench', 'med_bench')).toBeUndefined();
    expect(recipe('workbench', 'med_bench', ['pharma_learned', 'm4_done'])).toBeDefined();
    expect(recipe('workbench', 'distiller', ['pharma_learned', 'm4_done'])).toBeDefined();
    const still = bag(['corn', 4], ['water_jug', 1], ['charcoal', 1]);
    expect(recipesAt('distiller')).toEqual([]);
    const M4 = new Set(['m4_done']);
    expect(make(still, recipesAt('distiller', M4)[0])).toBe('made');
    expect(still.count(itemId('spirit'))).toBe(2);
    expect(still.count(itemId('empty_jug'))).toBe(1);
    expect(recipesAt('distiller', M4).length).toBe(2);
    expect(recipesAt('med_bench', M4).map((r) => itemLabel(r.out[0]).split(' ')[0]).sort()).toEqual(['Adrenaline', 'Antibiotics', 'Blue']);
    const meds = bag(['spirit', 1], ['iron_ingot', 1], ['herbs', 2], ['charcoal', 1]);
    expect(make(meds, recipe('med_bench', 'rad_tablets', ['m4_done'])!)).toBe('made');
    expect(meds.count(itemId('rad_tablets'))).toBe(2);
  });

  it('hides each drawing’s recipe until its drawing is pulled', () => {
    for (const [station, out, flag] of [['lathe', 'thermal_optic', 'sch_thermal'], ['workbench', 'sonic_lure', 'sch_sonic'], ['powder_mill', 'smoke_pot', 'sch_smoke'], ['lathe', 'engineer_armor', 'sch_armor']]) {
      expect(recipe(station, out), out).toBeUndefined();
      expect(recipe(station, out, [flag]), out).toBeUndefined(); // and each waits for M4 besides
      expect(recipe(station, out, [flag, 'm4_done']), out).toBeDefined();
    }
    expect(recipe('lathe', 'engineer_armor', ['sch_armor', 'm4_done'])!.in.map(([id]) => id)).toContain(itemId('plate_armor'));
  });

  it('needs seven rare components for everything; six are in the racks and Ray sells more', () => {
    const need = RECIPES.filter((r) => r.in.some(([id]) => id === itemId('rare_components'))).reduce((s, r) => s + r.in.find(([id]) => id === itemId('rare_components'))![1], 0);
    expect(need).toBe(6); // terminal 2, bench 1, optic 1, lures 1, armour 1
    expect(Z4.RELAY_RACKS.length).toBeGreaterThanOrEqual(need);
    expect(CATALOG_RAY_M5.map((l) => l.id)).toEqual(expect.arrayContaining([itemId('rare_components'), itemId('rad_tablets'), itemId('antenna_section')]));
    for (const l of CATALOG_RAY_M5) expect(l.sats).toBeGreaterThanOrEqual(6 * UNIT); // premium, as his other things are
    expect(CATALOG_RAY.some((l) => l.id === itemId('rare_components'))).toBe(false); // only after the meeting
    expect(tradeNamesValid()).toBe(true);
  });

  it('gives none of M5’s parts a price Marco will pay: nothing the uplink hangs on can be sold away', () => {
    for (const n of M5_ITEMS) expect(sellPrice(itemId(n)), n).toBe(0);
    for (const n of ['telescope', 'med_bench', 'distiller', 'sonic_lure', 'smoke_pot']) expect(sellPrice(blockId(n)), n).toBe(0);
  });
});

// ---- M5 on the computer (docs/PHASE8.md, 8) --------------------------------------------------------------
import { M5_STEPS, trackM5, diedOutsideM5, atTowerYard, craftedFlag } from '../src/sim/m5.ts';
import { VALLEY, HOME } from '../src/gen/layout.ts';

describe('M5’s steps', () => {
  const HX = VALLEY.cx, HZ = VALLEY.cz;

  it('lists nine steps, one for each thing the plan names', () => {
    expect(M5_STEPS.map((s) => s.flag)).toEqual(['ridge_home', 'ray_met', 'antenna_up', 'telescope_set', 'uplink_live', 'agi_asked', 'med_made', 'schematic_built', 'armor3_made']);
    expect(new Set(M5_STEPS.map((s) => s.label)).size).toBe(9);
  });

  it('ticks the run only for the tower’s yard and home alive; a death on the way home unticks the yard', () => {
    const flags = new Set<string>();
    expect(trackM5(flags, Z.hut.x0, Z.hut.z0, { telescope: false })).toEqual([]); // the hut is not the tower
    expect(atTowerYard(Z.gate.x, Z.gate.z)).toBe(false);
    expect(trackM5(flags, T.x + 10, T.z, { telescope: false })).toEqual(['yard_reached']);
    expect(trackM5(flags, 900, 1024, { telescope: false })).toEqual([]);
    diedOutsideM5(flags);
    expect(flags.has('yard_reached')).toBe(false);
    trackM5(flags, Z.relay.door, Z.relay.z0 + 3, { telescope: false }); // inside the station counts
    expect(trackM5(flags, HX, HZ, { telescope: false })).toEqual(['ridge_home']);
    diedOutsideM5(flags);
    expect(flags.has('ridge_home')).toBe(true); // once home it is kept
    expect(inSanctuary(HOME.balcony.x0 + 1, HOME.balcony.z0 + 1)).toBe(true);
  });

  it('ticks the telescope when one stands under the sky at home, and M5 when all nine are done', () => {
    const flags = new Set<string>();
    expect(trackM5(flags, HX, HZ, { telescope: true })).toEqual(['telescope_set']);
    for (const s of M5_STEPS.slice(0, -1)) flags.add(s.flag);
    expect(trackM5(flags, HX, HZ, { telescope: true })).toEqual([]);
    flags.add('armor3_made');
    expect(trackM5(flags, HX, HZ, { telescope: true })).toEqual(['m5_done']);
    expect(trackM5(flags, HX, HZ, { telescope: true })).toEqual([]);
  });

  it('knows what each thing made earns', () => {
    for (const n of ['rad_tablets', 'antibiotics', 'adrenaline']) expect(craftedFlag(n)).toBe('med_made');
    for (const n of ['thermal_optic', 'sonic_lure', 'smoke_pot']) expect(craftedFlag(n)).toBe('schematic_built');
    expect(craftedFlag('engineer_armor')).toBe('armor3_made');
    expect(craftedFlag('spirit')).toBe(null);
    expect(craftedFlag('hazard_suit')).toBe(null);
  });
});

// ---- The uplink: it never speaks (docs/PHASE8.md, 6) -----------------------------------------------------
import {
  linkStatus, linkReady, endpoints, endpointList, radMap, bioMap, ephemeris, schematicIndex, pullSchematic, ask, spoken, hoursToDusk, linkHours, nextWindow, bearingTo,
  HANDSHAKE, SCHEMATICS, QUERIES, WINDOW_HOURS, MIRA, type Answer,
} from '../src/sim/uplink.ts';
import { NESTS } from '../src/entity/ashen.ts';

describe('the uplink', () => {
  const NOW = { day: 12, hour: 14.5 };
  const none = new Set<string>();
  const every = (): Answer[] => [endpoints(NOW), radMap(), bioMap(), ephemeris(NOW), schematicIndex(none, NOW, null), ...SCHEMATICS.map((s) => pullSchematic(s.flag, none, NOW, null)!)];

  it('lists what the link needs, and is ready only with all four', () => {
    const all = { antenna: true, telescope: true, hydro: true, terminal: true };
    expect(linkReady(all)).toBe(true);
    for (const k of Object.keys(all) as (keyof typeof all)[]) {
      const n = { ...all, [k]: false };
      expect(linkReady(n)).toBe(false);
      expect(linkStatus(n).filter((r) => !r.ok).length).toBe(1);
    }
    expect(linkStatus(all).map((r) => r.label)).toEqual(['ANTENNA', 'OPTICS', 'POWER', 'TERMINAL']);
  });

  it('never speaks: every row of every answer is capitals, numbers and marks, with no word a speaker would use', () => {
    const answers = every();
    expect(answers.length).toBe(9);
    for (const a of answers) {
      expect(a.rows.length).toBeGreaterThan(3);
      for (const row of [a.head, ...a.rows]) expect(spoken(row), `"${row}"`).toBe(null);
      for (const row of a.rows) expect(row.length, `"${row}"`).toBeLessThanOrEqual(78);
    }
    for (const row of HANDSHAKE) expect(spoken(row)).toBe(null);
    // And the check itself knows speech when it sees it.
    for (const said of ['HELLO', 'I AM HERE', 'Coordinates follow', 'YOU ARE NOT ALONE', 'WHAT DO YOU NEED?', 'THE DOSE IS HIGH', 'PLEASE WAIT']) expect(spoken(said), said).not.toBe(null);
    for (const fine of ['GRID 25 M · ORIGIN 330E 350N', 'B03        560   867   1  STRUCTURE   18:00-06:00', 'MIRA-7                004    212.4           0  BEACON REPEATING']) expect(spoken(fine), fine).toBe(null);
  });

  it('has no name for itself and none for the player', () => {
    const text = every().flatMap((a) => [a.head, ...a.rows]).join('\n');
    for (const w of ['AGI', 'AI ', 'SYSTEM', 'USER', 'HUMAN', 'OPERATOR', 'WELCOME', 'QUERY ACCEPTED']) expect(text.includes(w), w).toBe(false);
  });

  it('answers first, unasked, with every handset it has heard: three that answer, the builder’s people silent since the Event, and Mira', () => {
    const list = endpointList(NOW), by = (id: string) => list.find((e) => e.id.includes(id))!;
    expect(list[0]).toMatchObject({ id: 'HV-01', state: 'LINK' });
    for (const id of ['MARCO', 'IBANEZ', 'QUISPE']) expect(by(id).state).toBe('ACTIVE');
    expect(by('MARCO').km).toBeLessThan(1); // at his shelter on the old road
    expect(by('MARCO').brg).toBeGreaterThan(260);
    const mira = by('MIRA');
    expect(mira).toMatchObject({ state: 'BEACON REPEATING', last: 0, brg: MIRA.brg, km: MIRA.km });
    expect(mira.km).toBeGreaterThan(200);
    // Eight years: the silent ones stopped within a week of each other.
    const silent = list.filter((e) => e.state === 'SILENT');
    expect(silent.length).toBe(5);
    for (const e of silent) { expect(e.last).toBeGreaterThan(2900); expect(e.last).toBeLessThan(2960); }
    expect(Math.max(...silent.map((e) => e.last)) - Math.min(...silent.map((e) => e.last))).toBeLessThanOrEqual(7);
    // Lucía's, and the builder's own second handset: one place, his fix two days after hers.
    const lucia = by('LUCIA'), his = by('HV-02');
    expect([his.brg, his.km]).toEqual([lucia.brg, lucia.km]);
    expect(lucia.last - his.last).toBe(2);
    // The days count on with the save.
    expect(endpointList({ day: 13, hour: 2 }).find((e) => e.id.includes('LUCIA'))!.last).toBe(lucia.last + 1);
    const a = endpoints(NOW);
    expect(a.rows.length).toBe(list.length + 1);
    expect(a.rows.some((r) => r.startsWith('MIRA-7') && r.includes('212.4') && r.endsWith('BEACON REPEATING'))).toBe(true);
    expect(a.sets).toEqual(['agi_end']);
  });

  it('takes bearings from the valley: north is 0, east 90', () => {
    expect(bearingTo(VALLEY.cx, VALLEY.cz - 1000)).toEqual({ brg: 0, km: 1 });
    expect(bearingTo(VALLEY.cx + 500, VALLEY.cz).brg).toBe(90);
    expect(bearingTo(T.x, T.z).brg).toBeGreaterThan(290);
    expect(bearingTo(T.x, T.z).km).toBeCloseTo(1.49, 1);
  });

  it('returns the dose as a grid that is the ground’s own numbers, with the road, the sump and the clean ground', () => {
    const a = radMap();
    expect(a.sets).toEqual(['agi_rad']);
    const grid = a.rows.slice(2, 12).map((r) => r.trim().split(/\s+/).map(Number));
    expect(grid.length).toBe(10);
    for (const [j, row] of grid.entries()) {
      expect(row.length).toBe(13);
      for (let i = 0; i < 12; i++) expect(row[i + 1]).toBe(Math.round(falloutAt(330 + i * 25 + 12.5, row[0] + 12.5)));
      expect(row[0]).toBe(350 + j * 25);
    }
    expect(Math.max(...grid.flatMap((r) => r.slice(1)))).toBeGreaterThan(Z.rates.off); // the sump shows
    expect(a.rows.some((r) => r.startsWith('MAX') && r.includes(`${Z.sump.x}E ${Z.sump.z}N`))).toBe(true);
    expect(a.rows.some((r) => r.startsWith('NIL') && r.includes(`${Z.clean.x}E`))).toBe(true);
    // The path's points are on the road, and the last is the yard.
    const pts = a.rows.filter((r) => r.startsWith('  ')).flatMap((r) => [...r.matchAll(/(\d+)E (\d+)N/g)].map((m) => [Number(m[1]), Number(m[2])]));
    expect(pts.length).toBeGreaterThan(6);
    for (const [x, z] of pts) expect(ridgeRoadAt(x, z).dist).toBeLessThan(1.5);
    expect(atTowerYard(...(pts[pts.length - 1] as [number, number]))).toBe(true);
  });

  it('returns every nest: eleven Ashen in six places, the relay’s among them, out from dusk to dawn', () => {
    const a = bioMap();
    expect(a.sets).toEqual(['agi_bio']);
    expect(a.rows.length).toBe(NESTS.length + 2);
    NESTS.forEach((n, i) => { expect(a.rows[i + 1]).toContain(String(Math.round(n.x))); expect(a.rows[i + 1]).toContain(String(Math.round(n.z))); });
    expect(a.rows[NESTS.length]).toContain(String(Math.round(Z.nest.x)));
    expect(a.rows.filter((r) => r.includes('SUBSURFACE')).length).toBe(1);
    expect(a.rows[1]).toContain('18:00-06:00');
    expect(a.rows[a.rows.length - 1]).toContain('TOTAL 11');
  });

  it('returns three days of sun, moon and mist, and the time left to dusk', () => {
    const a = ephemeris(NOW);
    expect(a.sets).toEqual(['agi_eph']);
    expect(a.rows.filter((r) => r.startsWith('D+')).length).toBe(3);
    expect(a.rows[1]).toContain('06:00');
    expect(a.rows[a.rows.length - 1]).toBe('NOW 14:30 · DUSK T-03:30');
    expect(hoursToDusk(14.5)).toBe(3.5);
    expect(hoursToDusk(20)).toBe(0);
    expect(hoursToDusk(3)).toBe(0);
    expect(ephemeris({ day: 0, hour: 22 }).rows.at(-1)).toBe('NOW 22:00 · DUSK T-00:00');
  });

  it('holds four drawings; each pull returns a diagram and the parts of the very recipe it unlocks, one a window', () => {
    expect(SCHEMATICS.map((s) => s.flag).sort()).toEqual(['sch_armor', 'sch_smoke', 'sch_sonic', 'sch_thermal']);
    const flags = new Set<string>();
    let last: number | null = null;
    const clock = { day: 3, hour: 9 };
    expect(schematicIndex(flags, clock, last).rows.at(-1)).toBe('WINDOW OPEN');
    for (const s of SCHEMATICS) {
      const a = pullSchematic(s.flag, flags, clock, last)!;
      expect(a, s.flag).not.toBe(null);
      expect(a.sets).toEqual([s.flag]);
      expect(a.head).toContain(s.code);
      const r = RECIPES.find((q) => q.learn === s.flag)!;
      expect(r.out[0]).toBe(itemId(s.item));
      for (const [id, n] of r.in) expect(a.rows.some((row) => row.startsWith(itemLabel(id).replace(/\s*\(.*$/, '').toUpperCase()) && row.trim().endsWith(String(n))), `${s.flag}: ${itemLabel(id)}`).toBe(true);
      expect(a.rows.at(-1)).toContain(`STATION ${STATION_LABEL[r.station].toUpperCase()}`);
      // Pulled: held now, and the window shuts for six hours.
      for (const f of a.sets) flags.add(f);
      last = linkHours(clock);
      expect(pullSchematic(s.flag, flags, clock, last)).toBe(null);
      const other = SCHEMATICS.find((q) => !flags.has(q.flag));
      if (other) {
        expect(pullSchematic(other.flag, flags, clock, last)).toBe(null);
        expect(schematicIndex(flags, clock, last).rows.at(-1)).toBe(`NEXT WINDOW ${String((clock.hour + WINDOW_HOURS) % 24).padStart(2, '0')}:00`);
        clock.hour += WINDOW_HOURS; if (clock.hour >= 24) { clock.hour -= 24; clock.day++; }
      }
    }
    expect(schematicIndex(flags, clock, last).rows.at(-1)).toBe('INDEX COMPLETE');
    expect(schematicIndex(flags, clock, last).rows.filter((r) => r.endsWith('HELD')).length).toBe(4);
    expect(nextWindow(null)).toBe(-Infinity);
    expect(pullSchematic('sch_nothing', none, NOW, null)).toBe(null);
  });

  it('offers five queries, and each of the four that change something sets its own flag', () => {
    expect(QUERIES.map((q) => q.id).sort()).toEqual(['BIO', 'END', 'EPH', 'RAD', 'SCH']);
    const sets = QUERIES.map((q) => ask(q.id, NOW, none, null).sets.join());
    expect(sets.sort()).toEqual(['', 'agi_bio', 'agi_end', 'agi_eph', 'agi_rad']);
  });
});

// ---- The lure and the smoke pot (docs/PHASE8.md, 4) ------------------------------------------------------
import { startDevice, stepDevices, smokeOf, devicesFromSave, LURE_SECONDS, LURE_HEARD, LURE_EVERY, POT_SECONDS, POT_RADIUS } from '../src/sim/countermeasures.ts';
import { makeCreature, type Creature } from '../src/entity/creatures.ts';
import {
  thinkAshen, ashenGround, ashenHear, manAshen, newAshen, nestFloor, isHunting, inSmoke, SLOTS, RELAY_GROUND, LUNGE_FROM, type AshenSenses,
} from '../src/entity/ashen.ts';
import { makeRng } from '../src/core/noise.ts';

describe('the sonic lure and the smoke pot', () => {
  it('runs each for its time and then it is spent; a lure calls at once and every two seconds', () => {
    const devs = [startDevice('lure', 10, 80, 10), startDevice('pot', 20, 80, 20)];
    let calls = 0, t = 0;
    const first = stepDevices(devs, 0.05);
    expect(first.calls.length).toBe(1);
    calls++;
    const spentAt: Record<string, number> = {};
    for (t = 0.05; t < 70; t += 0.05) { const r = stepDevices(devs, 0.05); calls += r.calls.length; for (const d of r.spent) spentAt[d.kind] = t; }
    expect(calls).toBe(LURE_SECONDS / LURE_EVERY);
    expect(spentAt.lure).toBeCloseTo(LURE_SECONDS, 0);
    expect(spentAt.pot).toBeCloseTo(POT_SECONDS, 0);
    expect(devs.length).toBe(0);
  });

  it('gives the Ashen the smoke of burning pots only', () => {
    const devs = [startDevice('lure', 10, 80, 10), startDevice('pot', 20, 80, 20)];
    expect(smokeOf(devs)).toEqual([{ x: 20.5, z: 20.5, r: POT_RADIUS }]);
    expect(inSmoke({ smoke: smokeOf(devs) }, 24, 22)).toBe(true);
    expect(inSmoke({ smoke: smokeOf(devs) }, 30, 20)).toBe(false);
    expect(inSmoke({}, 20, 20)).toBe(false);
  });

  it('loads from a save, and from an older one with none', () => {
    expect(devicesFromSave(undefined)).toEqual([]);
    expect(devicesFromSave('x')).toEqual([]);
    const d = startDevice('pot', 1, 2, 3); d.left = 12;
    expect(devicesFromSave([d, { kind: 'bomb', x: 1 }, null, { ...d, left: NaN }, { ...d, left: 9999 }])).toEqual([d, { ...d, left: POT_SECONDS }]);
  });
});

// ---- The relay's two (docs/PHASE8.md, "Design calls") ----------------------------------------------------

describe('the Ashen on the ridge', () => {
  const TF = zone4Floor.tower, RI = NESTS.indexOf(Z.nest);
  const STONE = blockId('limestone');
  const flat = (floor: number) => (_x: number, y: number, _z: number) => (y < floor ? STONE : 0);
  const senses = (px: number, pz: number, o: Partial<AshenSenses> = {}): AshenSenses => ({ px, py: TF, pz, pv: 0, sprint: false, playerInSanctuary: false, night: false, shot: false, lightAt: () => 15, ...o });
  /** One of them out on the yard's open ground east of the tower. */
  const out = (x: number, z: number): Creature => { const c = makeCreature('ashen', x, TF, z); c.nest = RI; c.squad = 1 << 9; c.leg = Z.nest.path.length; c.yaw = 0; return c; };
  const run = (c: Creature, s: () => AshenSenses, seconds: number) => { const rand = makeRng(7); for (let k = 0; k < seconds * 20; k++) thinkAshen(c, 1 / 20, s(), 0, flat(TF), rand); };
  const YX = T.x + 16, YZ = T.z - 2;

  it('adds one nest of two after Zone-3’s five: eleven in all, and the bits saved for the first nine are still theirs', () => {
    expect(RI).toBe(5);
    expect(SLOTS.length).toBe(11);
    expect(SLOTS.slice(0, 9).every((q) => q.nest < 5)).toBe(true);
    expect(SLOTS.slice(9).map((q) => [q.nest, q.bit])).toEqual([[5, 1 << 9], [5, 1 << 10]]);
    expect(nestFloor(RI)).toBe(TF);
    expect(Z.nest.n).toBe(2);
  });

  it('makes their ground the yard and the slope round the station, and nowhere else on the ridge: never the pass', () => {
    expect(ashenGround(Z.nest.x, Z.nest.z)).toBe(true);
    expect(ashenGround(YX, YZ)).toBe(true);
    for (const [x, z] of Z.nest.path) expect(ashenGround(x, z)).toBe(true);
    expect(ashenGround(Z.clean.x, Z.clean.z)).toBe(false);
    expect(ashenGround(Z.ray.x, Z.ray.z)).toBe(false);
    expect(ashenGround(Z.observatory.x, Z.observatory.z)).toBe(false);
    expect(ashenGround(Z.gate.x, Z.gate.z - 30)).toBe(false);
    const rand = makeRng(5);
    for (let k = 0; k < 20_000; k++) {
      const x = 200 + rand() * 440, z = 200 + rand() * 560;
      if (zoneAt(x, z) === 'zone4' && ashenGround(x, z)) expect(Math.hypot(x - Z.nest.x, z - Z.nest.z)).toBeLessThan(RELAY_GROUND);
    }
    // The pass is three times their reach from the nest.
    expect(Math.hypot(Z.clean.x - Z.nest.x, Z.clean.z - Z.nest.z)).toBeGreaterThan(RELAY_GROUND * 2.5);
  });

  it('puts both in the battery hall when the player comes near, and nowhere before', () => {
    const st = newAshen();
    const floorAt = (_x: number, y: number) => y;
    expect(manAshen([], st, Z.gate.x, Z.gate.z, false, () => true, floorAt).filter((c) => c.nest === RI).length).toBe(0);
    const made = manAshen([], st, T.x + 20, T.z, false, () => true, floorAt).filter((c) => c.nest === RI);
    expect(made.length).toBe(2);
    for (const c of made) {
      expect(c.x > Z.relay.baffle && c.x < Z.relay.split && c.z > Z.relay.z0 + 1 && c.z < Z.relay.z1 - 1, `in the hall's far end: ${c.x},${c.z}`).toBe(true);
      expect(c.y).toBe(TF);
    }
    // One down stays down until dawn.
    st.down = 1 << 9;
    expect(manAshen([], st, T.x + 20, T.z, false, () => true, floorAt).filter((c) => c.nest === RI).length).toBe(1);
  });

  it('answers a lure as it answers a shot: one that is not hunting goes to where it wails', () => {
    const c = out(YX, YZ);
    ashenHear([c], YX - 12, YZ + 6, LURE_HEARD);
    expect(c.mind).toBe('seek');
    const far = () => senses(YX + 200, YZ, { night: true, lightAt: () => 2 });
    run(c, far, 4);
    expect(Math.hypot(c.x - (YX - 12), c.z - (YZ + 6))).toBeLessThan(6);
    // Out of earshot it hears nothing.
    const d = out(YX, YZ);
    ashenHear([d], YX + LURE_HEARD + 5, YZ, LURE_HEARD);
    expect(d.mind).not.toBe('seek');
  });

  it('will not step into a burning pot’s smoke: it stops at the edge, out of its lunge’s reach of someone at the pot', () => {
    const c = out(YX, YZ);
    c.mind = 'charge';
    const px = YX - 14, pz = YZ;
    const smoke = [{ x: px, z: pz, r: POT_RADIUS }];
    run(c, () => senses(px, pz, { smoke, night: true, lightAt: () => 2 }), 8);
    const d = Math.hypot(c.x - px, c.z - pz);
    expect(d).toBeGreaterThanOrEqual(POT_RADIUS - 0.1);
    expect(d).toBeLessThan(POT_RADIUS + 1.5);
    expect(POT_RADIUS).toBeGreaterThan(LUNGE_FROM + 3);
    // Without the pot it would have been on the player in that time.
    const e = out(YX, YZ); e.mind = 'charge';
    run(e, () => senses(px, pz, { night: true, lightAt: () => 2 }), 8);
    expect(Math.hypot(e.x - px, e.z - pz)).toBeLessThan(LUNGE_FROM + 1);
  });

  it('walks out of smoke lit round it, and lands no blow on someone standing at the pot for as long as it burns', () => {
    const c = out(YX, YZ);
    c.mind = 'charge';
    const smoke = [{ x: YX + 2, z: YZ + 1, r: POT_RADIUS }];
    const rand = makeRng(9);
    let hits = 0, inside = 0;
    for (let k = 0; k < POT_SECONDS * 20; k++) {
      for (const e of thinkAshen(c, 1 / 20, senses(YX + 2, YZ + 1, { smoke, night: true, lightAt: () => 2 }), 0, flat(TF), rand)) if (e.kind === 'hit') hits++;
      if (k > 6 * 20 && Math.hypot(c.x - (YX + 2), c.z - (YZ + 1)) < POT_RADIUS - 0.3) inside++;
    }
    expect(hits).toBe(0);
    expect(inside).toBe(0); // out within six seconds, and never back in
    // When the pot is out it comes, as it would have.
    run(c, () => senses(YX + 2, YZ + 1, { night: true, lightAt: () => 2 }), 8);
    expect(Math.hypot(c.x - (YX + 2), c.z - (YZ + 1))).toBeLessThan(LUNGE_FROM + 1.5);
    expect(isHunting(c)).toBe(true);
  });
});

// ---- The telescope (docs/PHASE8.md, 5) -------------------------------------------------------------------
import { scopeTargets, aimedAt, scopeLabel, sightClear, moonDir, satTrain, aimOf, SCOPE_NEAR, TRAIN_EVERY, type V3 } from '../src/sim/telescope.ts';
import { surfaceHeight, WATERFALL, roadZ } from '../src/gen/layout.ts';

describe('the telescope', () => {
  const BALCONY: V3 = [HOME.balcony.x0 + 2.5, HOME.floor + 1.6, VALLEY.cz + 0.5];
  const by = (ts: ReturnType<typeof scopeTargets>, id: string) => ts.find((t) => t.id === id);

  it('aims by the game’s compass: north is yaw 0, west a quarter turn, up is positive pitch', () => {
    expect(aimOf(0, 0, -5).yaw).toBeCloseTo(0);
    expect(aimOf(-5, 0, 0).yaw).toBeCloseTo(Math.PI / 2);
    expect(aimOf(0, 5, -5).pitch).toBeCloseTo(Math.PI / 4);
  });

  it('shows the falls from the balcony, due west across the valley; the tower and the dam lie behind the rim from there', () => {
    const ts = scopeTargets(BALCONY, 12, 0);
    const falls = by(ts, 'falls')!;
    expect(falls.hidden).toBe(false);
    expect(Math.abs(falls.yaw - Math.PI / 2)).toBeLessThan(0.05);
    expect(falls.dist).toBeGreaterThan(180);
    expect(by(ts, 'tower')!.hidden).toBe(true);
    expect(by(ts, 'dam')!.hidden).toBe(true);
    expect(scopeLabel(by(ts, 'tower')!)).toContain('behind the land');
    expect(by(ts, 'moon')).toBeUndefined(); // noon
    expect(aimedAt(falls.yaw, falls.pitch, ts)).toBe(falls);
    expect(aimedAt(falls.yaw + (SCOPE_NEAR + 0.6) * Math.PI / 180, falls.pitch, ts)).toBe(null);
    expect(scopeLabel(falls)).toMatch(/^The falls · \d+ m$/);
    expect(scopeLabel(null)).toBe('');
  });

  it('shows the tower from the valley’s north and east rim, up on the plateau; the dam only from nearer', () => {
    let seen = 0;
    for (let a = -2.4; a <= 0.2; a += 0.1) {
      const x = Math.floor(VALLEY.cx + Math.cos(a) * (VALLEY.radius + 35)), z = Math.floor(VALLEY.cz + Math.sin(a) * (VALLEY.radius + 35));
      const ts = scopeTargets([x + 0.5, surfaceHeight(x, z) + 1.6, z + 0.5], 12, 0);
      if (!by(ts, 'tower')!.hidden) seen++;
      expect(by(ts, 'dam')!.hidden).toBe(true); // it lies in its gorge
    }
    expect(seen).toBeGreaterThan(15);
    const north: V3 = [VALLEY.cx + 0.5, surfaceHeight(VALLEY.cx, VALLEY.cz - VALLEY.radius - 35) + 1.6, VALLEY.cz - VALLEY.radius - 34.5];
    const tower = by(scopeTargets(north, 12, 0), 'tower')!;
    expect(tower.hidden).toBe(false);
    expect(tower.dist).toBeGreaterThan(1200);
    expect(tower.pitch).toBeGreaterThan(0); // its top stands above the eye
    expect(scopeLabel(tower)).toMatch(/^The relay tower · 1\.\d\d km$/);
    // From the dam's own road both stand in sight.
    const road: V3 = [ZONE3.dam.x1 + 2.5, ZONE3.dam.crest + 1.6, ZONE3.dam.z + 0.5];
    expect(by(scopeTargets(road, 12, 0), 'tower')!.hidden).toBe(false);
  });

  it('keeps the tower on the skyline from the old road, as before the ridge was lowered: nine tenths of it from Zone-1', () => {
    // (From the buffer's road the saddle's knolls hide it, as they hid the taller drawing: checked for both.)
    const tenths = (eye: V3, base: number, h: number) => { let n = 0; for (let k = 0; k <= 10; k++) if (sightClear(eye, [T.x + 0.5, base + (h * k) / 10, T.z + 0.5])) n++; return n; };
    for (const x of [1050, 990, 930, 870, 810, 750, 690]) {
      const z = Math.floor(roadZ(x)), eye: V3 = [x + 0.5, surfaceHeight(x, z) + 1.6, z + 0.5];
      expect(tenths(eye, zone4Floor.tower, T.height), `from the road at x ${x}`).toBeGreaterThanOrEqual(9);
    }
    const bufferEye: V3 = [1400.5, surfaceHeight(1400, Math.floor(roadZ(1400))) + 1.6, roadZ(1400)];
    expect(tenths(bufferEye, 166, 64)).toBe(0); // the old drawing's height: hidden from here too
  });

  it('shows the moon by night, opposite the sun, and never by day', () => {
    expect(moonDir(12)).toBe(null);
    const m = moonDir(0)!;
    expect(m[1]).toBeGreaterThan(0.9); // overhead at midnight
    expect(moonDir(20)![0]).toBeGreaterThan(0); // rising in the east after dusk
    expect(by(scopeTargets(BALCONY, 23, 0), 'moon')).toBeDefined();
    // From the balcony the cliff over the home stands east: the moon clears it after midnight, and is in the open
    // toward morning. (The telescope named it through the cave's roof before the land was asked.)
    expect(by(scopeTargets(BALCONY, 20, 0), 'moon')!.hidden).toBe(true);
    expect(by(scopeTargets(BALCONY, 3.5, 0), 'moon')!.hidden).toBe(false);
    // From the valley's floor it is in the open at midnight.
    expect(by(scopeTargets([1690, 74, 1040], 0, 0), 'moon')!.hidden).toBe(false);
  });

  it('names the satellites only while the land leaves them in the open: from the balcony, the first part of each pass', () => {
    const open = (sec: number) => scopeTargets(BALCONY, 4, sec).filter((t) => t.id === 'sats').some((t) => !t.hidden);
    expect(open(26)).toBe(true);
    expect(open(70)).toBe(false); // gone behind the cliff over the home
    expect(scopeTargets(BALCONY, 4, 26).filter((t) => t.id === 'sats').length).toBe(4); // any of the four names the train
  });

  it('brings a train of four satellites over every four minutes at night, low to high to low, and none by day', () => {
    expect(satTrain(50, 12)).toEqual([]);
    expect(satTrain(50, 23).length).toBe(4);
    expect(satTrain(TRAIN_EVERY - 20, 23)).toEqual([]); // between passes
    for (const d of satTrain(50, 23)) { expect(Math.hypot(...d)).toBeCloseTo(1); expect(d[1]).toBeGreaterThan(0.5); }
    expect(satTrain(8, 23)[0][1]).toBeLessThan(satTrain(50, 23)[0][1]);
    const ts = scopeTargets(BALCONY, 23, 50), sats = by(ts, 'sats')!;
    expect(aimedAt(sats.yaw, sats.pitch, ts)).toBe(sats);
    expect(sightClear(BALCONY, [WATERFALL.x + 1, 90, VALLEY.cz])).toBe(true);
  });
});

// ---- The relay's two on the real land (the review of Phases 0–6: creature faults show only on real blocks) --
import { floorNear } from '../src/entity/wild.ts';
import { fits } from '../src/entity/creatures.ts';
import { type AshenEvent } from '../src/entity/ashen.ts';

describe('the relay’s Ashen and a careful player, on the generated land', () => {
  const w = ridge();
  const TF = zone4Floor.tower, R = Z.relay, RI = NESTS.indexOf(Z.nest);
  const blockAt = (x: number, y: number, z: number) => w.blockAt(x, y, z);
  const noonLight = (x: number, y: number, z: number) => { const l = w.lightAt(x, y, z); return Math.max(skyOf(l), blockOf(l)); };
  const nightLight = (x: number, y: number, z: number) => Math.max(skyOf(w.lightAt(x, y, z)) * 0.3, blockOf(w.lightAt(x, y, z)));
  const two = () => manAshen([], newAshen(), T.x + 20, T.z, false, (x, z) => w.isLoaded(x, z), (x, y, z) => floorNear(x, y, z, blockAt)).filter((c) => c.nest === RI);
  const sense = (px: number, py: number, pz: number, o: Partial<AshenSenses> = {}): AshenSenses => ({ px, py, pz, pv: 0, sprint: false, playerInSanctuary: false, night: false, shot: false, lightAt: noonLight, ...o });
  const tick = (all: Creature[], s: AshenSenses, rand: () => number, into: AshenEvent[]) => {
    for (const c of all) into.push(...thinkAshen(c, 1 / 20, s, all.filter((o) => o !== c && isHunting(o)).length, blockAt, rand));
  };
  const WALK = 4;

  it('places both on the hall’s floor behind the baffle, in the dark: keen where they stand', () => {
    const both = two();
    expect(both.length).toBe(2);
    for (const c of both) {
      expect(fits(c, c.x, c.y, c.z, blockAt)).toBe(true);
      expect(c.y).toBe(TF);
      expect(noonLight(Math.floor(c.x), Math.floor(c.y + 1), Math.floor(c.z)), 'dark at noon').toBeLessThan(LIGHT_KEEN);
    }
  });

  it('by day, walking the road into the yard, round the tower’s feet, to the dish and in at the station’s door wakes neither', () => {
    const both = two(), rand = makeRng(31), ev: AshenEvent[] = [];
    const legs: [number, number][] = [[Z.yard.x1 - 1, T.z + 6], [T.x + 12, T.z - 2], [T.x + 8, T.z - 8], [T.x - 8, T.z - 8], [T.x - 8, T.z + 8], [T.x + 8, T.z + 8], [R.door + 1, R.z0 - 2], [R.door + 1, R.z0 + 3]];
    let [x, z] = legs[0];
    for (const [bx, bz] of legs.slice(1)) {
      const len = Math.hypot(bx - x, bz - z);
      for (let k = 0; k < len; k += WALK / 20) tick(both, sense(x + ((bx - x) * k) / len, TF, z + ((bz - z) * k) / len, { pv: WALK }), rand, ev);
      [x, z] = [bx, bz];
    }
    expect(ev.filter((e) => e.kind === 'notice').map((e) => `noticed at ${e.c.x.toFixed(0)},${e.c.z.toFixed(0)}`)).toEqual([]);
  });

  it('in the lit half, walking every open cell and working a pick at every rack wakes nothing behind the wall', () => {
    const both = two(), rand = makeRng(32), ev: AshenEvent[] = [];
    let cells = 0;
    for (let z = R.z0 + 1; z < R.z1 - 1; z++) for (let x = R.split + 1; x < R.x1 - 1; x++) {
      if (B_SOLID[w.blockAt(x, TF, z)] || B_SOLID[w.blockAt(x, TF + 1, z)]) continue;
      cells++;
      for (let k = 0; k < 20; k++) tick(both, sense(x + 0.5, TF, z + 0.5, { pv: WALK, mining: k >= 8 }), rand, ev);
    }
    expect(cells).toBeGreaterThan(50);
    expect(ev.filter((e) => e.kind === 'notice')).toEqual([]);
    // Mining the dish in the yard, the same.
    for (let k = 0; k < 20 * 20; k++) tick(both, sense(Z4.DISH_PANELS[0][0] - 0.5, TF, Z4.DISH_PANELS[0][2] + 0.5, { mining: true }), rand, ev);
    expect(ev.filter((e) => e.kind === 'notice')).toEqual([]);
  });

  it('a runner in the yard brings them out by their own bay, round the baffle, never through a block or off their ground', () => {
    const both = two(), rand = makeRng(33);
    const [ox, oz] = Z.nest.path[Z.nest.path.length - 1], px = ox + 1, pz = oz - 6;
    let shriek: Creature | null = null, worst = '';
    for (let k = 0; k < 90 * 20 && !shriek; k++) for (const c of both) {
      for (const e of thinkAshen(c, 1 / 20, sense(px, TF, pz, { pv: 5.6, sprint: true }), both.filter((o) => o !== c && isHunting(o)).length, blockAt, rand)) if (e.kind === 'shriek') shriek = e.c;
      if (!fits(c, c.x, c.y, c.z, blockAt)) worst = `inside a block at ${c.x.toFixed(1)},${c.y},${c.z.toFixed(1)}`;
      if (!ashenGround(c.x, c.z)) worst = `off its ground at ${c.x.toFixed(1)},${c.z.toFixed(1)}`;
    }
    expect(worst).toBe('');
    expect(shriek, 'one of them reached the runner and reared').not.toBeNull();
    expect(Math.hypot(shriek!.x - px, shriek!.z - pz)).toBeLessThan(LUNGE_FROM);
  });

  it('at night they come out and keep to the yard’s west end; none goes into the lit half or toward the road’s end', () => {
    const both = two(), rand = makeRng(34), ev: AshenEvent[] = [];
    let east = -Infinity;
    // The player waits on the pass, far out of sight and hearing, for five minutes of night.
    for (let k = 0; k < 300 * 20; k++) {
      tick(both, sense(Z.clean.x, zone4Floor.pass, Z.clean.z, { night: true, lightAt: nightLight }), rand, ev);
      for (const c of both) { east = Math.max(east, c.x); expect(fits(c, c.x, c.y, c.z, blockAt), `inside a block at ${c.x.toFixed(1)},${c.z.toFixed(1)}`).toBe(true); expect(c.x < R.split || c.z < R.z0 || c.z >= R.z1, 'never in the lit half').toBe(true); }
    }
    expect(both.some((c) => (c.leg ?? 0) >= Z.nest.path.length), 'one at least is out of the hall').toBe(true);
    expect(east).toBeLessThan(T.x + 12); // fourteen metres round their door, at most
    expect(ev.filter((e) => e.kind === 'notice')).toEqual([]);
  });
});

// ---- The ridge's places, Ray, the notes and the card (docs/PHASE8.md, 3 and 7) ----------------------------
import { ridgePlaceAt, ridgeToast, rayWaiting, rayCall, canAskMeeting, RAY_SPOT, RAY_FROM, RAY_UNTIL } from '../src/sim/ridge.ts';
import people from '../data/people.json' with { type: 'json' };
import journal from '../data/journal.json' with { type: 'json' };
import ending from '../data/ending.json' with { type: 'json' };

describe('the ridge’s places and Ray', () => {
  it('knows each place of the road, in the order walked, and says something the first time at each', () => {
    const seen: string[] = [];
    for (let s = 2; s <= ridgeRoadLength(); s++) { const p = ridgePlaceAt(...ridgeRoadPoint(s)); if (p && seen[seen.length - 1] !== p) seen.push(p); }
    expect(seen).toEqual(['bend', 'gate', 'edge', 'pass', 'edge', 'sump', 'edge', 'dome', 'edge', 'yard']);
    expect(ridgePlaceAt(Z.hut.x0 + 3, Z.hut.z0 + 3)).toBe('pass');
    expect(ridgePlaceAt(Z.relay.door, Z.relay.z0 + 4)).toBe('yard');
    expect(ridgePlaceAt(Z.sump.x, Z.sump.z)).toBe('sump');
    expect(ridgePlaceAt(300, 300)).toBe('edge');
    expect(ridgePlaceAt(ZONE3.avenue.x, ZONE3.dam.z + 30)).toBe(null); // the avenue is not the ridge road
    expect(ridgePlaceAt(1700, 1024)).toBe(null);
    for (const p of ['bend', 'gate', 'edge', 'pass', 'sump', 'dome', 'yard'] as const) for (const suited of [true, false]) expect(ridgeToast(p, suited).length).toBeGreaterThan(40);
    // Without a suit the gate sends you to Ray; with one it tells you how to walk it.
    expect(ridgeToast('gate', false)).toContain('Ray');
    expect(ridgeToast('gate', true)).toContain('road');
    expect(ridgeToast('edge', false)).toContain('go back');
  });

  it('has Ray give his word first, then agree to meet only someone who carries a suit, and wait by day until met', () => {
    const flags = new Set<string>();
    expect(rayCall(flags, true, false)).toEqual({ line: null, sets: [] }); // before the uplink plans: M4's business
    flags.add('uplink_plans');
    expect(canAskMeeting(flags)).toBe(false);
    // Each milestone waits for the one before: until the turbine turns he only says "not yet", and gives no word.
    expect(rayCall(flags, false, false)).toEqual({ line: 'ridgeNotYet', sets: [] });
    flags.add('m4_done');
    expect(rayCall(flags, false, false)).toEqual({ line: 'ridge', sets: ['suit_word'] });
    flags.add('suit_word');
    expect(canAskMeeting(flags)).toBe(true);
    expect(rayCall(flags, false, false).line).toBe(null);
    expect(rayCall(flags, false, true)).toEqual({ line: 'meetNoSuit', sets: [] });
    expect(rayWaiting(flags, 12)).toBe(false);
    expect(rayCall(flags, true, true)).toEqual({ line: 'meetDay', sets: ['ray_coming'] });
    flags.add('ray_coming');
    expect(rayCall(flags, true, true).line).toBe('meetWaiting');
    for (const [hour, there] of [[RAY_FROM - 0.5, false], [RAY_FROM, true], [12, true], [RAY_UNTIL - 0.1, true], [RAY_UNTIL, false], [23, false]] as [number, boolean][]) expect(rayWaiting(flags, hour), `at ${hour}`).toBe(there);
    flags.add('ray_met');
    expect(rayWaiting(flags, 12)).toBe(false); // once
    expect(canAskMeeting(flags)).toBe(false);
    expect(rayCall(flags, true, true).line).toBe(null);
    // When the link has answered he says his piece, once.
    flags.add('uplink_live');
    expect(rayCall(flags, true, false)).toEqual({ line: 'afterLink', sets: ['ray_told'] });
    flags.add('ray_told');
    expect(rayCall(flags, true, false).line).toBe(null);
  });

  it('stands Ray on the pass’s clean ground, by the hut’s door, where nothing hunts and no dose is taken', () => {
    expect(falloutAt(RAY_SPOT.x, RAY_SPOT.z)).toBe(0);
    expect(ashenGround(RAY_SPOT.x, RAY_SPOT.z)).toBe(false);
    expect(Math.hypot(RAY_SPOT.x - Z.hut.x0, RAY_SPOT.z - (Z.hut.door + 0.5))).toBeLessThan(4);
    expect(inSanctuary(RAY_SPOT.x, RAY_SPOT.z)).toBe(false);
  });

  it('has every line Ray needs, and a page in the notes for each beat', () => {
    const ray = people.ray as Record<string, unknown>;
    for (const k of ['ridge', 'meetButton', 'meetNoSuit', 'meetDay', 'meetWaiting', 'met', 'metFull', 'afterLink', 'look']) expect(typeof ray[k], k).toBe('string');
    expect(ray.ridge as string).toContain('suit');
    expect(ray.met as string).toContain('modem');
    const notes = (journal.notes as { flag: string; title: string; text: string }[]);
    for (const f of ['ridge_gate', 'hut_log', 'dome_page', 'relay_page', 'pharma_learned', 'ray_met', 'ending_seen', 'm5_done']) expect(notes.filter((n) => n.flag === f).length, f).toBe(1);
    expect(new Set(notes.map((n) => n.flag)).size).toBe(notes.length);
    // The manual says it: no medicine here is a cure for the Ashen.
    expect(notes.find((n) => n.flag === 'pharma_learned')!.text).toMatch(/none of this touches what the Ashen have/i);
  });

  it('closes on a short card: what was done, who is still out there (Mira, the people on the phone), and back to the valley', () => {
    const lines = (ending.card as string[][]).flat();
    expect(ending.card.length).toBe(5);
    expect(lines.length).toBeLessThanOrEqual(14);
    const text = lines.join(' ');
    for (const name of ['Marco', 'Doc', 'Ray', 'Mira']) expect(text).toContain(name);
    expect(text).toContain('valley');
    expect(text.length).toBeLessThan(700);
    expect(ending.button).toBe('Back to the valley');
    // It does not name the thing that answered, and gives it no voice.
    for (const w of ['AGI', 'AI', 'machine said', 'it said', '“']) expect(text.includes(w), w).toBe(false);
  });
});

// ---- The medicines, and the antenna's blocks (docs/PHASE8.md, 4 and 5) ------------------------------------
import { useMedicine, isMedicine, blowFelt, stepAdrenaline, medicineIdle, ADRENALINE_SECONDS } from '../src/sim/medicine.ts';
import { antennaBlocks, ANTENNA_HEIGHT } from '../src/gen/antenna.ts';

describe('the medicines', () => {
  it('binds thirty of a dose with the blue tablets, and is not used up with no dose to bind', () => {
    expect(useMedicine('rad_tablets', { hp: 50, dose: 80, adrenaline: 0 })).toMatchObject({ dose: 50, hp: 50 });
    expect(useMedicine('rad_tablets', { hp: 50, dose: 0.2, adrenaline: 0 })).toBe(null);
    expect(useMedicine('rad_tablets', { hp: 40, dose: 100, adrenaline: 0 })!.said).toContain('70');
  });

  it('brings health back with antibiotics to the most the dose allows, at once, and never past it', () => {
    expect(useMedicine('antibiotics', { hp: 12, dose: 0, adrenaline: 0 })).toMatchObject({ hp: 100 });
    expect(useMedicine('antibiotics', { hp: 12, dose: 50, adrenaline: 0 })).toMatchObject({ hp: healthCap(50), dose: 50 });
    expect(useMedicine('antibiotics', { hp: healthCap(50), dose: 50, adrenaline: 0 })).toBe(null);
    expect(useMedicine('antibiotics', { hp: 100, dose: 0, adrenaline: 0 })).toBe(null);
  });

  it('halves blows for a minute with adrenaline and gives focus back; a second shot waits for the first', () => {
    const b = useMedicine('adrenaline', { hp: 60, dose: 10, adrenaline: 0 })!;
    expect(b.adrenaline).toBe(ADRENALINE_SECONDS);
    expect(b.focus).toBe(true);
    expect(blowFelt(b.adrenaline)).toBe(0.5);
    expect(blowFelt(0)).toBe(1);
    expect(useMedicine('adrenaline', b)).toBe(null);
    expect(stepAdrenaline(b.adrenaline, 59)).toBeCloseTo(1);
    expect(stepAdrenaline(1, 5)).toBe(0);
  });

  it('knows its three, and says why one would do nothing', () => {
    for (const n of ['rad_tablets', 'antibiotics', 'adrenaline']) { expect(isMedicine(n)).toBe(true); expect(medicineIdle(n as never).length).toBeGreaterThan(10); }
    for (const n of ['first_aid_kit', 'bandage', 'spirit']) expect(isMedicine(n)).toBe(false);
  });
});

describe('the antenna, hoisted', () => {
  it('is a mast and a white dish seven across turned west, every block a real one, none of them minable', () => {
    const blocks = antennaBlocks(1801, 120, 1024);
    expect(blocks.length).toBeGreaterThan(24);
    for (const [, , , n] of blocks) { expect(() => blockId(n)).not.toThrow(); if (n !== 'red_beacon') expect(BLOCK_DEFS[blockId(n)].hardness).toBeLessThan(0); }
    const dish = blocks.filter((b) => b[3] === 'sat_dish');
    expect(dish.length).toBe(37);
    expect(Math.max(...dish.map((b) => b[2])) - Math.min(...dish.map((b) => b[2]))).toBe(6);
    expect(BLOCK_DEFS[blockId('sat_dish')].tex).toBe('sat_dish'); // its own white face, not the fallen dish's grey
    expect(Math.max(...blocks.map((b) => b[1]))).toBe(120 + ANTENNA_HEIGHT - 1);
    expect(Math.min(...blocks.map((b) => b[1]))).toBe(120);
    expect(Math.max(...blocks.map((b) => b[0]))).toBe(1801); // nothing behind the mast: it all leans to the valley
    expect(new Set(blocks.map((b) => b.slice(0, 3).join())).size).toBe(blocks.length);
    // One piece: every block touches another.
    const at = new Set(blocks.map((b) => b.slice(0, 3).join()));
    for (const [x, y, z] of blocks) { let held = false; for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) if (at.has([x + dx, y + dy, z + dz].join())) held = true; expect(held, `${x},${y},${z}`).toBe(true); }
  });
});

// ---- The hoist on the balcony, and where the antenna goes (docs/PHASE8.md, 5) -----------------------------
import { HOME_FIT } from '../src/gen/home.ts';
import { antennaSpot } from '../src/gen/antenna.ts';
import { GARDEN, POOL } from '../src/gen/layout.ts';

describe('the builder’s hoist and the antenna’s place', () => {
  const w = load(1728, 1000, 1823, 1055);
  const name = (x: number, y: number, z: number) => blockName(w.blockAt(x, y, z));
  const solidAt = (x: number, y: number, z: number) => (w.isLoaded(x, z) ? !!B_SOLID[w.blockAt(x, y, z)] : null);
  const F = HOME.floor;

  it('stands the hoist on the balcony in the corner by the rock; it is no step toward the railing, and cannot be mined', () => {
    const [x, y, z] = HOME_FIT.hoist;
    expect(name(x, y, z)).toBe('antenna_hoist');
    // Not solid (tests/home.test.ts floods the balcony for ways onto the railing: a solid one here was one).
    expect(B_SOLID[blockId('antenna_hoist')]).toBe(0);
    expect(BLOCK_DEFS[blockId('antenna_hoist')].hardness).toBeLessThan(0);
    expect(name(x, y + 1, z)).toBe('air');
    expect(x >= HOME.balcony.x0 && x < HOME.balcony.x1 && z >= HOME.balcony.z0 && z < HOME.balcony.z1).toBe(true);
    // It can be walked up to: the cell west of it is open paving.
    expect(B_SOLID[w.blockAt(x - 1, F, z)] + B_SOLID[w.blockAt(x - 1, F + 1, z)]).toBe(0);
    // And it is not in the way of anything the makeover reserved.
    for (const r of Object.values(HOME_FIT.reserved)) expect(x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1).toBe(false);
  });

  it('finds the mast’s foot on the cliff’s edge above the cave’s mouth: rock under it, open sky over it', () => {
    const spot = antennaSpot(HOME_FIT.mast, solidAt)!;
    expect(spot).not.toBe(null);
    const [x, y, z] = spot;
    expect(z).toBe(HOME_FIT.mast.z);
    expect(y).toBeGreaterThan(F + 22); // well above the balcony's overhang
    expect(B_SOLID[w.blockAt(x, y - 1, z)]).toBe(1);
    for (const [bx, by, bz] of antennaBlocks(x, y, z)) expect(name(bx, by, bz), `room for the antenna at ${bx},${by},${bz}`).toBe('air');
    expect(skyOf(w.lightAt(x, y + ANTENNA_HEIGHT, z))).toBe(15);
    expect(inSanctuary(x, z)).toBe(true);
    // Unloaded land gives no spot, rather than a wrong one.
    expect(antennaSpot(HOME_FIT.mast, () => null)).toBe(null);
  });

  it('shows the dish from the valley floor: from the garden and from the pool’s shore nothing stands between the eye and it', () => {
    const [x, y, z] = antennaSpot(HOME_FIT.mast, solidAt)!;
    const dish: [number, number, number] = [x - 1.5, y + 5.5, z + 0.5];
    const eyes: [number, number, number][] = [[GARDEN.x0 + 12.5, VALLEY.floor + 1.6, (GARDEN.z0 + GARDEN.z1) / 2], [1760.5, VALLEY.floor + 1.6, 1024.5]];
    for (const eye of eyes) {
      const len = Math.hypot(dish[0] - eye[0], dish[1] - eye[1], dish[2] - eye[2]);
      for (let k = 2; k < len - 2; k += 0.5) {
        const p = [0, 1, 2].map((i) => eye[i] + ((dish[i] - eye[i]) * k) / len);
        const id = w.blockAt(Math.floor(p[0]), Math.floor(p[1]), Math.floor(p[2]));
        expect(B_SOLID[id] && !/leaves|fronds/.test(blockName(id)), `from ${eye}: ${blockName(id)} at ${p.map((v) => v.toFixed(0))}`).toBeFalsy();
      }
    }
    expect(POOL.cx).toBeLessThan(x); // (the pool is across the valley, west of it)
  });
});
