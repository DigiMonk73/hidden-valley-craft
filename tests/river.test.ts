// The hidden river (docs/STATUS.md, "Next" 2): one river under the ridge bursts out of both its faces,
// as the valley falls and the canyon falls; the drowned tunnel's mouths hide under the two curtains;
// a current runs toward the valley; the canyon pool spills into a stream that sinks into the gravel.

import { describe, it, expect } from 'vitest';
import { World } from '../src/world/world.ts';
import { runJob, type GenResult } from '../src/jobs/tasks.ts';
import { AIR, WATER, FALLING_WATER, B_SOLID, isWaterId, blockId } from '../src/world/blocks.ts';
import { Gate, GATE_LEVER } from '../src/sim/gate.ts';
import { Player, BREATH_MAX, EYE, type Input } from '../src/sim/player.ts';
import {
  WATERFALL, CANYON_FALLS, SPRINGS, SPRING_OPENING, CANYON_POOL, TUNNEL, TUNNEL_MOUTHS, GATE, GATE_LEVERS, POCKET, LEVER_LAMP,
  RIVER_CURRENT, CANYON_STREAM, RAMP, VALLEY, riverCurrent, outsideHeight, inSanctuary, canyonStreamAt, rampAt, RAMP_HALF_WIDTH,
} from '../src/gen/layout.ts';
import { CS } from '../src/world/constants.ts';

function load(x0: number, z0: number, x1: number, z1: number): World {
  const w = new World();
  for (let cz = Math.floor(z0 / CS); cz <= Math.floor(z1 / CS); cz++)
    for (let cx = Math.floor(x0 / CS); cx <= Math.floor(x1 / CS); cx++)
      w.addColumn(cx, cz, (runJob({ kind: 'gen', cx, cz, edits: [] }).result as GenResult).chunks);
  return w;
}

const W = VALLEY.water;
const world = load(CANYON_POOL.cx - 12, TUNNEL.z - 12, WATERFALL.x + 8, TUNNEL.z + 12);

describe('the hidden river: two falls from the two faces of one ridge', () => {
  it('pours each curtain from a dark opening in the rock, a few blocks below the top', () => {
    for (const f of SPRINGS) {
      const face = f.x - f.dir;
      for (let z = f.z0; z < f.z1; z++) {
        // The curtain: falling water from the pool up to the opening's floor.
        for (let y = W + 1; y <= f.top; y++) expect(world.blockAt(f.x, y, z), `curtain ${f.x},${y},${z}`).toBe(FALLING_WATER);
        expect(world.blockAt(f.x, f.top + 1, z)).toBe(AIR);
        // The opening runs back into the rock: the river on its floor, air above it.
        for (let k = 0; k < SPRING_OPENING.depth; k++) {
          const x = face - f.dir * k;
          expect(world.blockAt(x, f.top, z), `river ${x},${z}`).toBe(WATER);
          expect(world.blockAt(x, f.top + 1, z), `opening ${x},${z}`).toBe(AIR);
          expect(B_SOLID[world.blockAt(x, f.top - 1, z)], `lip ${x},${z}`).toBe(1);
        }
        // Behind it, solid rock: the opening is a hole, not a notch through the ridge.
        expect(B_SOLID[world.blockAt(face - f.dir * SPRING_OPENING.depth, f.top + 1, z)]).toBe(1);
        // Rock over the opening: the face above it is dry stone.
        for (let y = f.top + SPRING_OPENING.height + 1; y <= f.top + SPRING_OPENING.height + 3; y++)
          expect(B_SOLID[world.blockAt(face, y, z)], `roof ${face},${y},${z}`).toBe(1);
      }
      // A few blocks below the ridge's top.
      const rim = outsideHeight(face - f.dir * 2, (f.z0 + f.z1) >> 1);
      expect(rim - f.top).toBeGreaterThanOrEqual(SPRING_OPENING.height + 3);
      expect(rim - f.top).toBeLessThan(16);
    }
  });

  it('keeps the ridge above both openings dry: no spring pool or notch on top', () => {
    for (let x = CANYON_FALLS.x + 1; x < WATERFALL.x; x++)
      for (let z = CANYON_FALLS.z0 - 6; z < CANYON_FALLS.z1 + 6; z++)
        for (let y = WATERFALL.top + 1; y < 140; y++) expect(isWaterId(world.blockAt(x, y, z)), `${x},${y},${z}`).toBe(false);
  });

  it('drops the canyon falls into the canyon pool, at the foot of a sheer headwall', () => {
    const f = CANYON_FALLS;
    for (let z = f.z0; z < f.z1; z++) for (const x of [f.x, f.x + f.dir]) expect(world.blockAt(x, W, z)).toBe(WATER);
    expect(Math.hypot(f.x - CANYON_POOL.cx, (f.z0 + f.z1) / 2 - CANYON_POOL.cz)).toBeLessThan(CANYON_POOL.radius);
    // The wall behind the curtain stands straight up to the opening.
    for (let z = f.z0; z < f.z1; z++) for (let y = W + 1; y < f.top - 1; y++) expect(B_SOLID[world.blockAt(f.x - f.dir, y, z)], `${y},${z}`).toBe(1);
    expect(outsideHeight(f.x - f.dir, TUNNEL.z) - outsideHeight(f.x, TUNNEL.z)).toBeGreaterThan(35);
    // A wider curtain than the valley's: the canyon spring is the stronger.
    expect(f.z1 - f.z0).toBeGreaterThan(WATERFALL.z1 - WATERFALL.z0);
  });
});

describe('the drowned tunnel’s mouths, hidden under the curtains', () => {
  it('drops straight down from under each curtain to the tunnel', () => {
    const mouths: [readonly [number, number], typeof WATERFALL][] = [[TUNNEL_MOUTHS.canyon, CANYON_FALLS], [TUNNEL_MOUTHS.valley, WATERFALL]];
    for (const [[m0, m1], f] of mouths) {
      for (let x = m0; x < m1; x++)
        for (let z = TUNNEL.z - TUNNEL.halfWidth; z <= TUNNEL.z + TUNNEL.halfWidth; z++) {
          for (let y = TUNNEL.y0; y <= W; y++) expect(isWaterId(world.blockAt(x, y, z)), `${x},${y},${z}`).toBe(true);
          // White water right over every cell of the mouth: you dive through the curtain to find it.
          expect(world.blockAt(x, W + 1, z), `${x},${z}`).toBe(FALLING_WATER);
          expect(z >= f.z0 && z < f.z1).toBe(true);
        }
    }
  });

  it('runs under water from mouth to mouth, but for the gate', () => {
    for (let x = TUNNEL.x0; x < TUNNEL.x1; x++) {
      if (x >= GATE.x0 && x < GATE.x1) continue;
      expect(isWaterId(world.blockAt(x, TUNNEL.y0, TUNNEL.z)), `x ${x}`).toBe(true);
    }
    // The air pocket keeps a wall of rock between it and the canyon mouth's shaft.
    for (let y = POCKET.water + 1; y < POCKET.y1; y++) expect(B_SOLID[world.blockAt(POCKET.x0 - 1, y, TUNNEL.z)]).toBe(1);
  });
});

describe('the current in the tunnel', () => {
  it('runs toward the valley, gently', () => {
    const c = riverCurrent(GATE.x1 + 3, TUNNEL.y0 + 0.5, TUNNEL.z + 0.5);
    expect(c).toBeGreaterThanOrEqual(0.5);
    expect(c).toBeLessThanOrEqual(0.8);
    expect(c).toBe(RIVER_CURRENT);
    expect(riverCurrent(TUNNEL.x0 + 0.5, TUNNEL.y0 + 0.5, TUNNEL.z + 0.5)).toBe(RIVER_CURRENT);
    // None out in the pools, above the tunnel, or in the air pocket where the water rests.
    expect(riverCurrent(POCKET.x0 + 2, TUNNEL.y0 + 1, TUNNEL.z + 0.5)).toBe(0);
    expect(riverCurrent(CANYON_POOL.cx, W, CANYON_POOL.cz)).toBe(0);
    expect(riverCurrent(GATE.x1 + 3, W, TUNNEL.z + 0.5)).toBe(0);
    expect(riverCurrent(TUNNEL.x1 + 2, TUNNEL.y0 + 0.5, TUNNEL.z + 0.5)).toBe(0);
  });

  it('carries a swimmer who lets go toward the valley', () => {
    const p = new Player();
    p.flow = riverCurrent;
    p.setPosition(GATE.x1 + 1.5, TUNNEL.y0, TUNNEL.z + 0.5);
    for (let i = 0; i < 120; i++) p.step(1 / 60, still, (x, y, z) => world.blockAt(x, y, z));
    expect(p.x - (GATE.x1 + 1.5)).toBeGreaterThan(0.4);
  });
});

// ---- Swimming the whole way, both directions, on one breath per leg ----------------------------

const still: Input = { forward: 0, strafe: 0, jump: false, sprint: false, descend: false };

/** A swimmer in the real world, with the gate and the current, recording the breath each leg costs. */
class Swim {
  p = new Player();
  w: World;
  g = new Gate();
  t = 0;
  low = BREATH_MAX;
  constructor(x: number, z: number) {
    this.w = load(CANYON_POOL.cx - 12, TUNNEL.z - 12, WATERFALL.x + 8, TUNNEL.z + 12); // its own: the gate edits it
    this.p.flow = riverCurrent;
    this.p.setPosition(x, W - 0.4, z); // afloat, head just out of the water
  }
  private blockAt = (x: number, y: number, z: number) => this.w.blockAt(x, y, z);
  /** Steps until `done` (or the time limit), with the given input. */
  until(input: Input, yaw: number, done: (p: Player) => boolean, limit = 30): void {
    this.p.yaw = yaw;
    for (let i = 0; i < limit * 60 && !done(this.p); i++) {
      this.p.step(1 / 60, input, this.blockAt);
      this.g.update(1 / 60, this.w, this.p);
      this.t += 1 / 60;
      this.low = Math.min(this.low, this.p.breath);
    }
    if (process.env.DBG) console.log("stage", this.p.x.toFixed(2), this.p.y.toFixed(2), this.p.breath.toFixed(1), this.t.toFixed(1));
    expect(done(this.p), `stuck at ${this.p.x.toFixed(2)}, ${this.p.y.toFixed(2)}`).toBe(true);
  }
  /** Starts a leg with a full breath; returns the breath it used and how long it took. */
  leg(run: () => void): { used: number; time: number } {
    this.p.breath = BREATH_MAX;
    this.low = BREATH_MAX;
    const t0 = this.t;
    run();
    return { used: BREATH_MAX - this.low, time: this.t - t0 };
  }
  get headOut(): boolean { return !isWaterId(this.w.blockAt(Math.floor(this.p.x), Math.floor(this.p.y + EYE), Math.floor(this.p.z))); }
}

const WEST = Math.PI / 2, EAST = -Math.PI / 2;
const swimW: Input = { ...still, forward: 1 };
const up: Input = { ...still, jump: true };
const z = TUNNEL.z + 0.5;
const [valley0, valley1] = TUNNEL_MOUTHS.valley, [canyon0, canyon1] = TUNNEL_MOUTHS.canyon;

function wayOut() {
  const s = new Swim((valley0 + valley1) / 2, z);
  // Leg 1: through the falls and down the shaft, west to the gate, pull the stone, through to the pocket.
  const leg1 = s.leg(() => {
    s.until(still, WEST, (p) => p.y < TUNNEL.y0 + 0.2);
    s.until(swimW, WEST, (p) => p.x < GATE_LEVERS[0][0] + 1);
    s.g.pull();
    s.until(swimW, WEST, (p) => p.x < POCKET.x1 - 1.5);
    s.until(up, WEST, () => s.headOut);
  });
  // Leg 2: breathe, then dive and swim west to the canyon mouth, and up through its curtain into the pool.
  s.until(up, WEST, (p) => p.breath >= BREATH_MAX); // treading water in the pocket
  const leg2 = s.leg(() => {
    s.until(still, WEST, (p) => p.y < TUNNEL.y0 + 0.2);
    s.until(swimW, WEST, (p) => p.x < canyon1 - 0.6);
    s.until(up, WEST, (p) => p.y > W - 1.5);
    s.until({ ...swimW, jump: true }, WEST, () => s.headOut && s.p.x < CANYON_FALLS.x - 1.5);
  });
  return [leg1, leg2];
}

function wayIn() {
  const s = new Swim((canyon0 + canyon1) / 2, z);
  // Leg 1: down through the canyon curtain, east into the pocket, up to breathe.
  const leg1 = s.leg(() => {
    s.until(still, EAST, (p) => p.y < TUNNEL.y0 + 0.2);
    s.until(swimW, EAST, (p) => p.x > POCKET.x0 + 1.5);
    s.until(up, EAST, () => s.headOut);
  });
  s.until(up, EAST, (p) => p.breath >= BREATH_MAX);
  // Leg 2: pull the pocket's stone, dive, through the gate and on east, up through the valley curtain.
  const leg2 = s.leg(() => {
    s.g.pull();
    s.until(still, EAST, (p) => p.y < TUNNEL.y0 + 0.2);
    s.until(swimW, EAST, (p) => p.x > valley0 + 0.6);
    s.until(up, EAST, (p) => p.y > W - 1.5);
    s.until({ ...swimW, jump: true }, EAST, () => s.headOut && s.p.x > WATERFALL.x + 2.5);
  });
  return [leg1, leg2];
}

describe('swimming the river both ways', () => {
  const out = wayOut(), into = wayIn();

  it('takes each leg of the way out well inside one breath, against the current', () => {
    for (const leg of out) expect(leg.used).toBeLessThan(BREATH_MAX * 0.75);
  });

  it('takes each leg of the way in well inside one breath, with the current', () => {
    for (const leg of into) expect(leg.used).toBeLessThan(BREATH_MAX * 0.6);
  });

  it('is easier coming in than going out', () => {
    // The long legs, between the pocket and the valley: the current helps one way and holds back the other.
    expect(into[1].time).toBeLessThan(out[0].time);
  });
});

describe('the lamp by the valley-side lever', () => {
  it('lights the marked stone’s tunnel-facing side under water', () => {
    const [x, y, zl] = GATE_LEVERS[0];
    expect(world.blockAt(x, y, zl)).toBe(GATE_LEVER);
    expect(world.blockAt(...LEVER_LAMP)).toBe(blockId('sealed_lamp'));
    expect(Math.abs(LEVER_LAMP[0] - x) + Math.abs(LEVER_LAMP[1] - y) + Math.abs(LEVER_LAMP[2] - zl)).toBe(1);
    // The water in front of the stone, which lights its face.
    expect(isWaterId(world.blockAt(x, y, zl + 1))).toBe(true);
    expect(world.lightAt(x, y, zl + 1) & 15).toBeGreaterThanOrEqual(7);
  });
});

describe('the canyon stream', () => {
  const s0 = CANYON_STREAM[0], s1 = CANYON_STREAM[CANYON_STREAM.length - 1];
  const sw = load(s1[0] - 12, s0[1], s0[0] + 12, s1[1] + 8);
  /** Water at the stream's surface somewhere across the line at z. */
  const wetAcross = (zz: number) => {
    for (let x = s1[0] - 10; x < s0[0] + 10; x++) {
      const st = canyonStreamAt(x, zz);
      if (st.dist < 3 && isWaterId(sw.blockAt(x, W, zz))) return true;
    }
    return false;
  };

  it('flows from the canyon pool down the canyon floor, shallow', () => {
    for (let zz = s0[1] + 2; zz < s0[1] + (s1[1] - s0[1]) * 0.8; zz += 3) expect(wetAcross(zz), `z ${zz}`).toBe(true);
    // One block deep: gravel under the water.
    let x = s0[0];
    for (let k = -3; k <= 3; k++) if (isWaterId(sw.blockAt(CANYON_STREAM[2][0] + k, W, CANYON_STREAM[2][1]))) x = CANYON_STREAM[2][0] + k;
    expect(B_SOLID[sw.blockAt(x, W - 1, CANYON_STREAM[2][1])]).toBe(1);
  });

  it('sinks into the gravel before its end', () => {
    for (let zz = s1[1] - 3; zz <= s1[1] + 4; zz++) expect(wetAcross(zz), `z ${zz}`).toBe(false);
  });

  it('stays in the canyon, out of the sanctuary and off the ramp', () => {
    for (const [x, zz] of CANYON_STREAM) {
      expect(inSanctuary(x, zz)).toBe(false);
      expect(rampAt(x, zz).dist).toBeGreaterThan(RAMP_HALF_WIDTH + 2);
    }
    expect(Math.hypot(RAMP[0][0] - CANYON_POOL.cx, RAMP[0][1] - CANYON_POOL.cz)).toBeLessThan(CANYON_POOL.radius + 6);
  });
});
