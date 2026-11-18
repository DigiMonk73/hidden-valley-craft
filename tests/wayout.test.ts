import { describe, it, expect } from 'vitest';
import { World } from '../src/world/world.ts';
import { runJob, type GenResult } from '../src/jobs/tasks.ts';
import { blockId, AIR, WATER, B_SOLID, isWaterId, blockName } from '../src/world/blocks.ts';
import { Gate, GATE_STONE, GATE_LEVER, APPROACH } from '../src/sim/gate.ts';
import {
  GATE, TUNNEL, POOL, CANYON_POOL, RAMP, ROAD, roadZ, roadHeight, outsideHeight, rampAt, PLACES, VALLEY,
} from '../src/gen/layout.ts';
import { CS } from '../src/world/constants.ts';

function load(x0: number, z0: number, x1: number, z1: number): World {
  const w = new World();
  for (let cz = Math.floor(z0 / CS); cz <= Math.floor(z1 / CS); cz++)
    for (let cx = Math.floor(x0 / CS); cx <= Math.floor(x1 / CS); cx++)
      w.addColumn(cx, cz, (runJob({ kind: 'gen', cx, cz, edits: [] }).result as GenResult).chunks);
  return w;
}

const swimmer = (x: number, y = GATE.y0, z = TUNNEL.z + 0.5) => ({
  x, y, z, intersectsBlock: (bx: number, by: number, bz: number) => bx + 1 > x - 0.3 && bx < x + 0.3 && by + 1 > y && by < y + 1.8 && bz + 1 > z - 0.3 && bz < z + 0.3,
});

describe('the tunnel and the builder’s gate', () => {
  const w = load(TUNNEL.x0 - 4, TUNNEL.z - 4, POOL.cx, TUNNEL.z + 4);

  it('is shut at the start, looks like rock, and has no levers', () => {
    for (let y = GATE.y0; y < GATE.y1; y++) for (let z = GATE.z0; z < GATE.z1; z++) for (let x = GATE.x0; x < GATE.x1; x++) expect(w.blockAt(x, y, z)).toBe(GATE_STONE);
    expect(blockName(GATE_STONE)).toBe('gate_stone');
    for (let x = TUNNEL.x0 - 4; x < TUNNEL.x1 + 4; x++)
      for (let z = TUNNEL.z - 4; z <= TUNNEL.z + 4; z++) for (let y = TUNNEL.y0 - 3; y < TUNNEL.y1 + 3; y++) expect(w.blockAt(x, y, z)).not.toBe(GATE_LEVER);
    // Halfway along the tunnel.
    expect(Math.abs((GATE.x0 + GATE.x1) / 2 - (TUNNEL.x0 + TUNNEL.x1) / 2)).toBeLessThanOrEqual(1);
  });

  it('runs under water from mouth to mouth, but for the gate', () => {
    for (let x = TUNNEL.x0; x < TUNNEL.x1; x++) {
      if (x >= GATE.x0 && x < GATE.x1) continue;
      for (let y = TUNNEL.y0; y < TUNNEL.y1; y++) expect(isWaterId(w.blockAt(x, y, TUNNEL.z)), `x ${x}, y ${y}`).toBe(true);
    }
  });

  it('opens by itself as a swimmer comes near, from either side, and stays shut otherwise', () => {
    const mid = (GATE.x0 + GATE.x1) / 2;
    const run = (who: ReturnType<typeof swimmer>, secs = 3) => { const g = new Gate(); for (let t = 0; t < secs; t += 0.05) g.update(0.05, w, who); return g; };
    // Shut for anyone further off, or not in the tunnel.
    expect(run(swimmer(mid + 1 + APPROACH + 0.5)).state).toBe('shut');
    expect(run(swimmer(mid - 1 - APPROACH - 0.5)).state).toBe('shut');
    expect(run(swimmer(mid, VALLEY.rim)).state).toBe('shut'); // walking over the ridge above it
    expect(run(swimmer(mid + 1.5, GATE.y0, TUNNEL.z + 6)).state).toBe('shut');
    // Opening for a swimmer just short of it, from the valley side and from the canyon side.
    for (const x of [mid + 1 + APPROACH - 0.3, mid - 1 - APPROACH + 0.3]) {
      const g = run(swimmer(x));
      expect(g.state).toBe('open');
      for (let y = GATE.y0; y < GATE.y1; y++) expect(w.blockAt(GATE.x0, y, TUNNEL.z)).toBe(WATER);
      // Then it closes again once nobody is near (and the world is shut for the next case).
      for (let t = 0; t < 12; t += 0.05) g.update(0.05, w, swimmer(TUNNEL.x0 + 0.5));
      expect(g.state).toBe('shut');
    }
  });

  it('opens row by row from the bottom, then closes behind the swimmer', () => {
    const g = new Gate();
    expect(g.pull()).toBe('grind');
    let opened = false;
    for (let t = 0; t < 3; t += 0.05) if (g.update(0.05, w, swimmer(GATE.x1 + 1)) === 'open') opened = true;
    expect(opened).toBe(true);
    for (let y = GATE.y0; y < GATE.y1; y++) expect(w.blockAt(GATE.x0, y, TUNNEL.z)).toBe(WATER);
    // Still open while the swimmer is passing through it.
    for (let t = 0; t < 20; t += 0.05) g.update(0.05, w, swimmer(GATE.x0 + 0.5));
    expect(g.state).toBe('open');
    // Once they are through and clear, it lowers itself.
    let shut = false;
    for (let t = 0; t < 10; t += 0.05) if (g.update(0.05, w, swimmer(TUNNEL.x0 + 1)) === 'shut') shut = true;
    expect(shut).toBe(true);
    for (let y = GATE.y0; y < GATE.y1; y++) expect(w.blockAt(GATE.x0, y, TUNNEL.z)).toBe(GATE_STONE);
  });

  it('never closes on a swimmer in the doorway', () => {
    const g = new Gate();
    g.pull();
    for (let t = 0; t < 10 && g.state !== 'closing'; t += 0.05) g.update(0.05, w, swimmer(TUNNEL.x0 + 0.5));
    expect(g.state).toBe('closing');
    // The swimmer drifts back into the gate as it starts down: it waits for them.
    for (let t = 0; t < 10; t += 0.05) g.update(0.05, w, swimmer(GATE.x0 + 1, GATE.y0));
    expect(B_SOLID[w.blockAt(GATE.x0 + 1, GATE.y0, TUNNEL.z)]).toBe(0);
    expect(B_SOLID[w.blockAt(GATE.x0 + 1, GATE.y0 + 1, TUNNEL.z)]).toBe(0);
    for (let t = 0; t < 10; t += 0.05) g.update(0.05, w, swimmer(TUNNEL.x0 + 0.5));
    expect(g.state).toBe('shut');
  });

  it('a gate saved open is found open, and closes once nobody is near', () => {
    const g0 = new Gate();
    g0.pull();
    for (let t = 0; t < 3; t += 0.05) g0.update(0.05, w, swimmer(GATE.x1 + 1));
    const g = new Gate(); // a new session: the world's edits say open
    let shut = false;
    for (let t = 0; t < 12; t += 0.05) if (g.update(0.05, w, swimmer(POOL.cx)) === 'shut') shut = true;
    expect(shut).toBe(true);
  });
});

describe('the canyon ramp and the old road', () => {
  it('climbs from the canyon floor to the road in steps a walker can take', () => {
    expect(RAMP[0][2]).toBeLessThanOrEqual(VALLEY.floor + 2);
    expect(RAMP[RAMP.length - 1][2]).toBe(roadHeight(ROAD.east));
    // Walk the ramp's centre line: no step more than one block.
    let last = outsideHeight(RAMP[0][0], RAMP[0][1]);
    for (let i = 0; i < RAMP.length - 1; i++) {
      const [ax, az] = RAMP[i], [bx, bz] = RAMP[i + 1];
      const n = Math.ceil(Math.hypot(bx - ax, bz - az) * 3);
      for (let k = 1; k <= n; k++) {
        const x = Math.floor(ax + ((bx - ax) * k) / n), z = Math.floor(az + ((bz - az) * k) / n);
        const h = outsideHeight(x, z);
        expect(Math.abs(h - last), `at ${x},${z}`).toBeLessThanOrEqual(1);
        last = h;
      }
    }
  });

  it('is a ledge cut into the wall, with no gully between the ramp and the rock', () => {
    // Leg 1 (after the short walk from the pool) climbs along the west wall: just inside it (west),
    // the ground is never below the ramp.
    expect(RAMP[1][2]).toBe(RAMP[0][2]);
    const [ax, az] = RAMP[1], [bx, bz] = RAMP[2];
    for (let k = 2; k < 18; k++) {
      const x = Math.round(ax + ((bx - ax) * k) / 20), z = Math.round(az + ((bz - az) * k) / 20);
      const h = outsideHeight(x, z);
      for (let d = 3; d <= 4; d++) expect(outsideHeight(x - d, z), `west of ${x},${z}`).toBeGreaterThanOrEqual(h - 1);
    }
  });

  it('runs west to the saddle with no step over one block', () => {
    let last = roadHeight(ROAD.east);
    for (let x = ROAD.east; x >= ROAD.west; x--) {
      const h = outsideHeight(x, Math.floor(roadZ(x)));
      expect(Math.abs(h - last), `at ${x}`).toBeLessThanOrEqual(1);
      last = h;
    }
    expect(ROAD.west).toBeLessThanOrEqual(1150);
  });

  it('is paved, clear of trees, and the ramp starts by the canyon pool', () => {
    const w = load(1480, 1020, 1540, 1060);
    let road = 0, n = 0;
    for (let x = 1482; x < 1530; x++) {
      const z = Math.floor(roadZ(x)), h = outsideHeight(x, z);
      n++;
      if (w.blockAt(x, h - 1, z) === blockId('road')) road++;
      for (let y = h; y < h + 4; y++) expect(B_SOLID[w.blockAt(x, y, z)], `${x},${y},${z}`).toBe(0);
    }
    expect(road / n).toBeGreaterThan(0.7);
    expect(Math.hypot(RAMP[0][0] - CANYON_POOL.cx, RAMP[0][1] - CANYON_POOL.cz)).toBeLessThan(CANYON_POOL.radius + 6);
    expect(rampAt(RAMP[3][0], RAMP[3][1]).dist).toBeLessThan(1);
  });

  it('has the ranger sign beside the road and burrows in the warren', () => {
    const s = PLACES.rangerSign;
    const w = load(s.x - 4, s.z - 4, s.x + 4, s.z + 4);
    expect(blockName(w.blockAt(s.x, outsideHeight(s.x, s.z), s.z))).toMatch(/^ranger_sign/);
    const wr = PLACES.warren;
    const w2 = load(wr.x - 10, wr.z - 10, wr.x + 10, wr.z + 10);
    let holes = 0;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.4;
      const x = Math.round(wr.x + Math.cos(a) * (wr.radius - 2)), z = Math.round(wr.z + Math.sin(a) * (wr.radius - 2));
      if (w2.blockAt(x, outsideHeight(x, z) - 1, z) === AIR || w2.blockAt(x, outsideHeight(x, z) - 2, z) === AIR) holes++;
    }
    expect(holes).toBeGreaterThanOrEqual(3);
  });
});

describe('the ridge tower', () => {
  it('is a tall, thin frame standing on Zone-4’s ridge', async () => {
    const { towerGeometry } = await import('../src/render/tower.ts');
    const { zoneAt } = await import('../src/gen/layout.ts');
    const g = towerGeometry(PLACES.ridgeTower.height);
    g.computeBoundingBox();
    const b = g.boundingBox!;
    expect(b.max.y - b.min.y).toBeGreaterThan(PLACES.ridgeTower.height);
    expect(b.max.x - b.min.x).toBeLessThan(20);
    expect(zoneAt(PLACES.ridgeTower.x, PLACES.ridgeTower.z)).toBe('zone4');
  });
});
