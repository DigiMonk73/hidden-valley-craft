// The hidden river (docs/STATUS.md, "Next" 2): one river under the ridge bursts out of both its faces,
// as the valley falls and the canyon falls; the drowned tunnel's mouths hide under the two curtains;
// a current runs toward the valley; the canyon pool spills into a stream that sinks into the gravel.

import { describe, it, expect } from 'vitest';
import { World } from '../src/world/world.ts';
import { runJob, type GenResult } from '../src/jobs/tasks.ts';
import { AIR, WATER, FALLING_WATER, B_SOLID, B_OPAQUE, isWaterId, blockId } from '../src/world/blocks.ts';
import { Gate } from '../src/sim/gate.ts';
import { Player, BREATH_MAX, EYE, type Input } from '../src/sim/player.ts';
import {
  WATERFALL, CANYON_FALLS, SPRINGS, SPRING_OPENING, CANYON_POOL, TUNNEL, MOUTH_BASINS, MOUTH_LAMPS, TUNNEL_LAMPS, GATE,
  RIVER_CURRENT, CANYON_STREAM, RAMP, VALLEY, riverCurrent, fallsLoudness, inCanyonStream, rescueFromOldTunnel, outsideHeight, inSanctuary, canyonStreamAt, rampAt, RAMP_HALF_WIDTH,
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

const LAMP = blockId('sealed_lamp');
const MOSSY = blockId('limestone_mossy');

describe('the review’s findings (river branch)', () => {
  it('has whole rock behind both curtains, with no gap to dive into', () => {
    for (const f of SPRINGS)
      for (let z = f.z0; z < f.z1; z++)
        for (let y = W + 1; y < f.top - 1; y++)
          for (let k = 1; k <= 3; k++) expect(B_SOLID[world.blockAt(f.x - f.dir * k, y, z)], `${f.x - f.dir * k},${y},${z}`).toBe(1);
  });

  it('opens no cave in the canyon’s sheer cliff beside the falls', () => {
    const w = load(CANYON_FALLS.x - 2, 976, CANYON_FALLS.x + 12, 1073);
    for (let z = 976; z < 1073; z++)
      for (let x = CANYON_FALLS.x + 1; x < CANYON_FALLS.x + 12; x++) {
        const top = outsideHeight(x, z);
        for (let y = W + 1; y < top - 1; y++) {
          const inOpening = z >= CANYON_FALLS.z0 && z < CANYON_FALLS.z1 && y > CANYON_FALLS.top && y <= CANYON_FALLS.top + SPRING_OPENING.height + 1;
          if (!inOpening) expect(w.blockAt(x, y, z), `${x},${y},${z}`).not.toBe(AIR);
        }
      }
  });

  it('muffles each waterfall’s roar heard from the other side of the ridge', () => {
    const vx = WATERFALL.x + 12, cx = CANYON_FALLS.x - 12, zz = TUNNEL.z;
    expect(fallsLoudness(WATERFALL, vx, zz, true)).toBeGreaterThan(fallsLoudness(CANYON_FALLS, vx, zz, true) * 2);
    expect(fallsLoudness(CANYON_FALLS, cx, zz, false)).toBeGreaterThan(fallsLoudness(WATERFALL, cx, zz, false) * 2);
  });

  it('blends the two roars smoothly along the tunnel, with no sudden flip at a mouth (second review)', () => {
    for (const f of SPRINGS) {
      let last = fallsLoudness(f, CANYON_FALLS.x - 6, TUNNEL.z, false);
      for (let x = CANYON_FALLS.x - 6; x <= WATERFALL.x + 6; x += 0.25) {
        const l = fallsLoudness(f, x, TUNNEL.z, x > (CANYON_FALLS.x + WATERFALL.x) / 2 && x > WATERFALL.x - 0.5 ? true : x > WATERFALL.x);
        expect(Math.abs(l - last), `${x}`).toBeLessThan(0.1);
        last = l;
      }
    }
  });

  it('wakes a player saved in the old tunnel or air pocket afloat by the valley mouth (second review)', () => {
    for (const [x, y, zz] of [[1586.5, 65, 1022.5], [1588.5, 63, 1024.5], [1566.5, 62, 1024.5], [1605.5, 62, 1024.5]]) {
      const at = rescueFromOldTunnel(x, y, zz);
      expect(at, `${x},${y},${zz}`).not.toBeNull();
      const [rx, ry, rz] = at!;
      expect(isWaterId(world.blockAt(Math.floor(rx), Math.floor(ry + 0.4), Math.floor(rz)))).toBe(true);
      expect(isWaterId(world.blockAt(Math.floor(rx), Math.floor(ry + EYE), Math.floor(rz)))).toBe(false);
      for (let y = Math.floor(ry); y < ry + 1.8; y++) expect(B_SOLID[world.blockAt(Math.floor(rx), y, Math.floor(rz))]).toBe(0);
    }
    // Anywhere fine today is left alone: in the new tunnel, in the pools, on the balcony.
    expect(rescueFromOldTunnel(GATE.x1 + 2.5, TUNNEL.y0, TUNNEL.z + 0.5)).toBeNull();
    expect(rescueFromOldTunnel(MOUTH_BASINS.valley.x0 + 1.5, TUNNEL.y0, TUNNEL.z + 0.5)).toBeNull();
    expect(rescueFromOldTunnel(WATERFALL.x + 10, W - 0.4, TUNNEL.z)).toBeNull();
    expect(rescueFromOldTunnel(1615.5, 65, 1024.5)).toBeNull(); // on the valley pool's deepest bed
    expect(rescueFromOldTunnel(1796.5, 82, 1024.5)).toBeNull();
  });

  it('draws the canyon stream unbroken on the map table’s 8 m grid', () => {
    const step = 8;
    const s0 = CANYON_STREAM[0][1], s1 = CANYON_STREAM[CANYON_STREAM.length - 1][1];
    for (let j = Math.ceil(s0 / step); (j + 0.5) * step < s0 + (s1 - s0) * 0.85; j++) {
      const zz = j * step + step / 2;
      let wet = false;
      for (let i = 190; i < 200; i++) if (inCanyonStream(i * step + step / 2, zz, step / 2)) wet = true;
      expect(wet, `z ${zz}`).toBe(true);
    }
  });
});

describe('the drowned tunnel’s mouths, right under the falls', () => {
  const mouths = [
    { f: CANYON_FALLS, face: TUNNEL.x0, basin: MOUTH_BASINS.canyon },
    { f: WATERFALL, face: TUNNEL.x1 - 1, basin: MOUTH_BASINS.valley },
  ];

  it('opens in the cliff foot straight under each curtain, in deep water', () => {
    for (const { f, face, basin } of mouths) {
      // The opening: water through the face, across the tunnel's width and height.
      for (let z = TUNNEL.z - TUNNEL.halfWidth; z <= TUNNEL.z + TUNNEL.halfWidth; z++)
        for (let y = TUNNEL.y0; y < TUNNEL.y1; y++) expect(isWaterId(world.blockAt(face, y, z)), `${face},${y},${z}`).toBe(true);
      // Framed by solid rock above and to either side.
      expect(B_SOLID[world.blockAt(face, TUNNEL.y1, TUNNEL.z)]).toBe(1);
      expect(B_SOLID[world.blockAt(face, TUNNEL.y0 + 1, TUNNEL.z - TUNNEL.halfWidth - 1)]).toBe(1);
      // The curtain falls right in front of it: the falls' columns are the basin's nearest ones.
      expect(f.x).toBe(face + f.dir);
      // Deep water under the curtain, down to the tunnel's floor.
      for (const x of [f.x, f.x + f.dir])
        for (let z = basin.z0; z < basin.z1; z++)
          for (let y = TUNNEL.y0; y <= W; y++) expect(isWaterId(world.blockAt(x, y, z)), `${x},${y},${z}`).toBe(true);
    }
  });

  it('climbs out of each mouth a block at a time to a ledge just under the surface (step 0 of phase 5)', () => {
    for (const { f, basin } of mouths) {
      for (let z = basin.z0; z < basin.z1; z++) {
        // From the curtain outward: the floor never rises more than a block at once, and ends a block under the surface.
        let last = TUNNEL.y0, x = f.x;
        for (; x >= basin.x0 && x < basin.x1; x += f.dir) {
          let top = TUNNEL.y0 - 1;
          while (B_SOLID[world.blockAt(x, top + 1, z)]) top++;
          expect(top + 1 - last, `${x},${z}`).toBeLessThanOrEqual(1);
          last = top + 1;
          expect(isWaterId(world.blockAt(x, last, z))).toBe(true);
        }
        expect(last, `outer edge at z ${z}`).toBe(W);
      }
    }
  });

  it('has a warm lamp in each mouth’s frame, in sight from the water just inside the falls', () => {
    for (const { f, face } of mouths) {
      const lamps = MOUTH_LAMPS.filter(([x]) => x === face);
      expect(lamps.length).toBeGreaterThanOrEqual(1);
      for (const l of lamps) expect(world.blockAt(...l)).toBe(LAMP);
      // From anywhere across the curtain's width, just under the surface behind it, a lamp is in sight.
      for (let z = f.z0; z < f.z1; z++)
        for (const ey of [W - 0.4, W - 1.2]) {
          const eye: [number, number, number] = [f.x + 0.5, ey, z + 0.5];
          const seen = lamps.some((l) => inSight(eye, [l[0] + 0.5 + f.dir * 0.51, l[1] + 0.5, l[2] + 0.5]));
          expect(seen, `from ${eye.join(',')}`).toBe(true);
        }
    }
  });

  it('keeps moss off the rock round the mouths and in the tunnel', () => {
    for (let x = TUNNEL.x0 - 6; x < TUNNEL.x1 + 6; x++)
      for (let z = TUNNEL.z - 6; z <= TUNNEL.z + 6; z++)
        for (let y = TUNNEL.y0 - 2; y <= W + 2; y++) expect(world.blockAt(x, y, z), `${x},${y},${z}`).not.toBe(MOSSY);
  });
});

/** Is the straight line from a to b clear of opaque blocks (b's own block excepted)? */
function inSight(a: [number, number, number], b: [number, number, number]): boolean {
  const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * 20);
  for (let k = 0; k < n; k++) {
    const t = k / n;
    const x = Math.floor(a[0] + (b[0] - a[0]) * t), y = Math.floor(a[1] + (b[1] - a[1]) * t), z = Math.floor(a[2] + (b[2] - a[2]) * t);
    if (B_OPAQUE[world.blockAt(x, y, z)]) return false;
  }
  return true;
}

describe('the tunnel is lit all the way', () => {
  const LEVEL = 7;
  const centre = (w: World) => {
    const out: number[] = [];
    for (let x = TUNNEL.x0; x < TUNNEL.x1; x++) if (isWaterId(w.blockAt(x, TUNNEL.y0 + 1, TUNNEL.z))) out.push(w.lightAt(x, TUNNEL.y0 + 1, TUNNEL.z) & 15);
    return out;
  };

  it('never drops below a set level along its centre line, with the gate shut or open', () => {
    expect(TUNNEL_LAMPS.length).toBeGreaterThanOrEqual(TUNNEL.x1 - TUNNEL.x0 - 3);
    const shut = centre(world);
    expect(shut.length).toBe(TUNNEL.x1 - TUNNEL.x0 - (GATE.x1 - GATE.x0));
    for (const l of shut) expect(l).toBeGreaterThanOrEqual(LEVEL);
    const w2 = load(TUNNEL.x0 - 2, TUNNEL.z - 4, TUNNEL.x1 + 2, TUNNEL.z + 4);
    for (let y = GATE.y0; y < GATE.y1; y++) for (let z = GATE.z0; z < GATE.z1; z++) for (let x = GATE.x0; x < GATE.x1; x++) w2.setBlock(x, y, z, WATER);
    const open = centre(w2);
    expect(open.length).toBe(TUNNEL.x1 - TUNNEL.x0);
    for (const l of open) expect(l).toBeGreaterThanOrEqual(LEVEL);
  });
});

describe('the current in the tunnel', () => {
  it('runs toward the valley, gently', () => {
    const c = riverCurrent(GATE.x1 + 3, TUNNEL.y0 + 0.5, TUNNEL.z + 0.5);
    expect(c).toBeGreaterThanOrEqual(0.5);
    expect(c).toBeLessThanOrEqual(0.8);
    expect(c).toBe(RIVER_CURRENT);
    expect(riverCurrent(TUNNEL.x0 + 0.5, TUNNEL.y0 + 0.5, TUNNEL.z + 0.5)).toBe(RIVER_CURRENT);
    // None out in the pools, or above the tunnel.
    expect(riverCurrent(CANYON_POOL.cx, W, CANYON_POOL.cz)).toBe(0);
    expect(riverCurrent(GATE.x1 + 3, TUNNEL.y1 + 0.5, TUNNEL.z + 0.5)).toBe(0);
    expect(riverCurrent(TUNNEL.x1 + 1, TUNNEL.y0 + 0.5, TUNNEL.z + 0.5)).toBe(0);
  });

  it('carries a swimmer who lets go toward the valley', () => {
    const p = new Player();
    p.flow = riverCurrent;
    p.setPosition(GATE.x1 + 1.5, TUNNEL.y0, TUNNEL.z + 0.5);
    for (let i = 0; i < 120; i++) p.step(1 / 60, still, (x, y, z) => world.blockAt(x, y, z));
    expect(p.x - (GATE.x1 + 1.5)).toBeGreaterThan(0.4);
  });
});

// ---- Swimming the whole way, both directions -----------------------------------------------------

const still: Input = { forward: 0, strafe: 0, jump: false, sprint: false, descend: false };

/** A swimmer in the real world, with the gate and the current. */
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
    expect(done(this.p), `stuck at ${this.p.x.toFixed(2)}, ${this.p.y.toFixed(2)}`).toBe(true);
  }
  get headOut(): boolean { return !isWaterId(this.w.blockAt(Math.floor(this.p.x), Math.floor(this.p.y + EYE), Math.floor(this.p.z))); }
}

const WEST = Math.PI / 2, EAST = -Math.PI / 2;
const fwd: Input = { ...still, forward: 1 };
const z = TUNNEL.z + 0.5;

/** Afloat just outside one curtain: swim straight at it, through the tunnel, and up beyond the other. */
function swim(from: 'valley' | 'canyon') {
  const out = from === 'valley';
  const s = new Swim(out ? MOUTH_BASINS.valley.x0 + 3.5 : MOUTH_BASINS.canyon.x1 - 3.5, z);
  expect(s.headOut).toBe(true);
  const yaw = out ? WEST : EAST;
  // Holding forward and nothing else: through the white water, down into the mouth, along the tunnel
  // (the gate opens as you come) and out of the far mouth; then up the basin's steps, through the
  // falling water, until the head is out beyond it. No Space to swim up (phase 5, step 0).
  const pastMouth = out ? (p: Player) => p.x < TUNNEL.x0 - 0.35 : (p: Player) => p.x > TUNNEL.x1 + 0.35;
  s.until(fwd, yaw, pastMouth);
  s.until(fwd, yaw, () => s.headOut, 6);
  expect(out ? s.p.x < CANYON_FALLS.x + CANYON_FALLS.dir : s.p.x > WATERFALL.x + WATERFALL.dir).toBe(true); // clear of the curtain
  return { time: s.t, breath: BREATH_MAX - s.low };
}

describe('swimming the river both ways', () => {
  const out = swim('valley'), home = swim('canyon');

  it('takes well under one breath going out, against the current', () => {
    expect(out.time).toBeLessThan(12);
    expect(out.breath).toBeLessThan(12);
  });

  it('takes well under one breath coming home, with the current', () => {
    expect(home.time).toBeLessThan(12);
    expect(home.breath).toBeLessThan(12);
  });

  it('is easier coming home than going out', () => {
    expect(home.time).toBeLessThan(out.time);
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
