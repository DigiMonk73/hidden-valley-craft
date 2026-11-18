// Zone-1's near band (docs/PHASE4.md, step 1): the road runs on past the saddle to the near band's west
// edge, and every place on it is there, easy to find and lit where it must be.

import { describe, it, expect } from 'vitest';
import { World } from '../src/world/world.ts';
import { runJob, type GenResult } from '../src/jobs/tasks.ts';
import { blockId, blockName, B_SOLID, AIR } from '../src/world/blocks.ts';
import { itemId } from '../src/world/items.ts';
import { CS } from '../src/world/constants.ts';
import { ROAD, ZONES, ZONE1, SADDLE, roadZ, roadHeight, onRoad, zoneAt } from '../src/gen/layout.ts';
import { SCOUT_AT, SHELTER_LANTERN, BARN_CRATES, DEN } from '../src/gen/zone1.ts';

function load(x0: number, z0: number, x1: number, z1: number): World {
  const w = new World();
  for (let cz = Math.floor(z0 / CS); cz <= Math.floor(z1 / CS); cz++)
    for (let cx = Math.floor(x0 / CS); cx <= Math.floor(x1 / CS); cx++)
      w.addColumn(cx, cz, (runJob({ kind: 'gen', cx, cz, edits: [] }).result as GenResult).chunks);
  return w;
}

const world = load(1030, 1000, 1160, 1090);
const name = (x: number, y: number, z: number) => blockName(world.blockAt(x, y, z)).replace(/@\w+$/, '');

describe('the old road through Zone-1', () => {
  it('runs on past the saddle to the near band’s west edge', () => {
    expect(ROAD.west).toBeLessThanOrEqual(ZONES.nearX);
    for (let x = ROAD.west; x <= ZONES.saddleX; x += 7) expect(onRoad(x, Math.floor(roadZ(x))), `x ${x}`).toBe(true);
    expect(zoneAt(ROAD.west, roadZ(ROAD.west))).not.toBe('near'); // it reaches the mid band's edge
  });

  it('tops out at the saddle: the road climbs to it and falls away west of it', () => {
    expect(roadHeight(SADDLE.x)).toBeGreaterThan(roadHeight(SADDLE.x + 60));
    expect(roadHeight(SADDLE.x)).toBeGreaterThan(roadHeight(1040));
  });

  it('is paved and clear along the near band', () => {
    for (let x = 1040; x < 1150; x += 5) {
      const z = Math.floor(roadZ(x)), h = roadHeight(x);
      expect(B_SOLID[world.blockAt(x, h - 1, z)], `ground ${x}`).toBe(1);
      expect(world.blockAt(x, h + 1, z), `air over ${x}`).toBe(AIR);
    }
  });
});

describe('the places on it', () => {
  it('has a farm sign and a cattle grid at the saddle', () => {
    const s = ZONE1.saddleSign;
    let sign = false;
    for (let y = 100; y < 130; y++) if (name(s.x, y, s.z) === 'farm_sign') sign = true;
    expect(sign).toBe(true);
    const x = ZONE1.cattleGrid.x0;
    expect(name(x, roadHeight(x) - 1, Math.floor(roadZ(x)))).toBe('cattle_grid');
  });

  it('has the bus shelter on the road’s north side, roofed, with a bench and a lit lantern', () => {
    const s = ZONE1.shelter;
    expect(s.z1).toBeLessThan(roadZ(s.x0) - ROAD.halfWidth + 1);
    expect(name(s.x0 + 2, s.floor + 3, s.z0 + 1)).toBe('tin_roof');
    expect(name(s.x0 + 2, s.floor, s.z0)).toBe('bench');
    const [lx, ly, lz] = SHELTER_LANTERN;
    expect(world.blockAt(lx, ly, lz)).toBe(blockId('lantern'));
    // Well lit at night: block light on the shelter floor and out on the road in front of it.
    expect(world.lightAt(lx, s.floor, s.z1 - 1) & 15).toBeGreaterThanOrEqual(11);
    expect(world.lightAt(lx, roadHeight(lx), Math.floor(roadZ(lx))) & 15).toBeGreaterThanOrEqual(6);
    // A bus-stop sign beside it, on the road side.
    expect(name(s.x1, s.floor + 1, s.z1 - 1)).toBe('bus_sign');
  });

  it('lays the scout on the road, his lamp burning beside him, with his things in his pockets', () => {
    const [x, y, z] = SCOUT_AT;
    expect(onRoad(x, z)).toBe(true);
    expect(name(x, y, z)).toBe('scout_body');
    expect(name(x + 1, y, z)).toBe('scout_legs');
    expect(name(x, y, z - 1)).toBe('dropped_lamp');
    expect(world.lightAt(x, y, z) & 15).toBeGreaterThanOrEqual(10);
    const pockets = world.containerAt(x, y, z)!;
    const got = pockets.filter(Boolean).map((s) => [s!.id, s!.count]);
    expect(got).toEqual([[itemId('pistol'), 1], [itemId('pistol_rounds'), 6], [itemId('map_scrap'), 1], [itemId('armband'), 1]]);
  });

  it('builds the farmstead off a track south: gate and name-board, house, barn with its crates, coop, laundry', () => {
    const g = ZONE1.farmGate, f = ZONE1.farm;
    let board = false;
    for (let y = 100; y < 120; y++) if (name(g.x + 2, y, g.z + 1) === 'family_sign') board = true;
    expect(board).toBe(true);
    // The track: bare dirt or gravel from the road to the yard, nothing growing on it.
    for (let z = g.z + 1; z < f.z0; z += 2) {
      let top = 130;
      while (top > 90 && !B_SOLID[world.blockAt(g.x, top, z)]) top--;
      expect(['dirt', 'gravel'], `track ${z}`).toContain(name(g.x, top, z));
      expect(world.blockAt(g.x, top + 1, z), `clear ${z}`).toBe(AIR);
    }
    const b = ZONE1.barn;
    expect(name(b.x0, f.floor + 4, b.z0)).toBe('log');
    expect(world.blockAt(b.x0, f.floor, b.z0 + 3)).toBe(AIR); // its door to the yard
    for (const [x, y, z] of BARN_CRATES) expect(name(x, y, z)).toBe('chest');
    const crate = world.containerAt(...BARN_CRATES[0])!.filter(Boolean).map((s) => s!.id);
    expect(crate).toEqual(expect.arrayContaining([itemId('wire_mesh'), itemId('nails'), itemId('planks'), itemId('canvas')]));
    const tools = world.containerAt(...BARN_CRATES[1])!.filter(Boolean).map((s) => s!.id);
    expect(tools).toEqual(expect.arrayContaining([itemId('steel_shovel'), itemId('hammer')]));
    // The house is open to walk into: its door on the yard side, room inside for the den.
    const h = ZONE1.house;
    expect(world.blockAt(h.x1 - 1, f.floor, h.z0 + 2)).toBe(AIR);
    expect(B_SOLID[world.blockAt(Math.floor(DEN[0]), f.floor + 1, Math.floor(DEN[2]))]).toBe(0);
    let laundry = 0;
    for (let x = h.x1 + 4; x < h.x1 + 9; x++) if (name(x, f.floor + 1, h.z0 + 1) === 'laundry_line') laundry++;
    expect(laundry).toBe(5);
  });

  it('leaves a rusted truck on the shoulder, and scrap and wire to salvage', () => {
    const t = ZONE1.truck, th = roadHeight((t.x0 + t.x1) >> 1);
    const kinds = new Set<string>();
    for (let x = t.x0; x < t.x1; x++) for (let y = th; y < th + 2; y++) kinds.add(name(x, y, t.z0));
    expect([...kinds]).toEqual(expect.arrayContaining(['truck_wheel', 'truck_body', 'truck_cab']));
    let scrap = 0, wire = 0;
    for (let z = 1000; z < 1090; z++) for (let x = 1050; x < 1100; x++) for (let y = 104; y < 116; y++) {
      const n = name(x, y, z);
      if (n === 'scrap_heap') scrap++;
      if (n === 'fence_wire') wire++;
    }
    expect(scrap).toBeGreaterThanOrEqual(4);
    expect(wire).toBeGreaterThanOrEqual(10);
  });
});
