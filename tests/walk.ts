// Walking the generated world (docs/REVIEW.md, N3): the land as the generator makes it, the step rules
// measured on the real `Player`, a flood of everywhere those rules reach, and the real `Player` set to
// walk a route cell by cell. Used by tests/walk.test.ts; nothing here knows any place by name.

import { generateColumn } from '../src/gen/terrain.ts';
import { B_SOLID, B_TOP, BEDROCK, AIR, WATER, isWaterId, blockName } from '../src/world/blocks.ts';
import { CS, WORLD_X, WORLD_Y, WORLD_Z, COLS_X } from '../src/world/constants.ts';
import { Player, type Input } from '../src/sim/player.ts';
import { fallDamage } from '../src/sim/survival.ts';

export type BlockAt = (x: number, y: number, z: number) => number;

/** The generated land, column by column as it is asked for (no light: walking needs none). Outside the world is bedrock, as in the game. */
export class Land {
  private cols = new Map<number, Uint16Array>();
  private lastKey = -1;
  private last: Uint16Array | null = null;
  generated = 0;

  blockAt: BlockAt = (x, y, z) => {
    if (y < 0) return BEDROCK;
    if (y >= WORLD_Y) return AIR;
    if (x < 0 || z < 0 || x >= WORLD_X || z >= WORLD_Z) return BEDROCK;
    const key = (z >> 5) * COLS_X + (x >> 5);
    if (key !== this.lastKey) {
      let col = this.cols.get(key);
      if (!col) { col = generateColumn(x >> 5, z >> 5); this.cols.set(key, col); this.generated++; }
      this.last = col; this.lastKey = key;
    }
    return this.last![(y << 10) | ((z & (CS - 1)) << 5) | (x & (CS - 1))];
  };

  /** The same land with some blocks read as others (the builder's gate standing open, say). */
  seenAs(swap: (id: number, x: number, y: number, z: number) => number): BlockAt {
    return (x, y, z) => swap(this.blockAt(x, y, z), x, y, z);
  }

  /** Forgets the columns (a long test file would otherwise hold every one it ever looked at). */
  forget(): void { this.cols.clear(); this.lastKey = -1; this.last = null; }
}

// ---- The step rules, measured on the real Player ---------------------------------------------------------

export interface Rules {
  /** The body's height: what must be clear above the feet. */
  height: number;
  /** The highest ledge walked up without a jump (the auto-step), in blocks. */
  step: number;
  /** The highest ledge got onto with a jump. */
  climb: number;
  /** How far a running jump carries over level ground, in whole blocks of gap crossed. */
  gap: number;
  /** How far above the top of the water a swimmer's feet come while holding Space. */
  swimLift: number;
  /** A fall of up to this many blocks does no harm; one of `deadlyFall` or more kills from full health. */
  safeFall: number;
  deadlyFall: number;
}

const STILL: Input = { forward: 0, strafe: 0, jump: false, sprint: false, descend: false };
const DT = 1 / 60;

/** A little made-up world for measuring: `solid(x, y, z)` and `water(x, y, z)` say what is where. */
function toy(solid: (x: number, y: number, z: number) => boolean, water: (x: number, y: number, z: number) => boolean = () => false): BlockAt {
  return (x, y, z) => (solid(x, y, z) ? BEDROCK : water(x, y, z) ? WATER : AIR);
}

/** Walks the real Player north (−z) from z 8.5 for `secs`; returns where it ends. */
function toyWalk(world: BlockAt, y: number, secs: number, input: Partial<Input>): Player {
  const p = new Player();
  p.setPosition(0.5, y, 8.5);
  for (let t = 0; t < 0.5; t += DT) p.step(DT, STILL, world); // settle on the ground
  for (let t = 0; t < secs; t += DT) p.step(DT, { ...STILL, forward: 1, ...input }, world);
  return p;
}

let measured: Rules | null = null;
/** What the real Player can do, found by trying it in toy worlds (so a change to the Player changes the walk). */
export function measureRules(): Rules {
  if (measured) return measured;
  // A flat floor at y 10 with a ledge n blocks high from z 5 north.
  const ledge = (n: number) => toy((_x, y, z) => y < 10 || (z < 5 && y < 10 + n));
  const gets = (n: number, jump: boolean) => { const p = toyWalk(ledge(n), 10, 3, { jump }); return p.z < 4.5 && p.y >= 10 + n - 0.01; };
  let step = 0, climb = 0;
  while (gets(step + 1, false)) step++;
  while (gets(climb + 1, true)) climb++;
  // The jump's top, standing still: a ledge between whole blocks (a slab on a block) is judged by this.
  {
    const p = new Player();
    const flat = toy((_x, y) => y < 10);
    p.setPosition(0.5, 10, 0.5);
    for (let t = 0; t < 0.5; t += DT) p.step(DT, STILL, flat);
    let top = 0;
    for (let t = 0; t < 2; t += DT) { p.step(DT, { ...STILL, jump: t < 0.1 }, flat); top = Math.max(top, p.y - 10); }
    climb = Math.max(climb, Math.floor(top * 16) / 16);
  }
  // A gap n wide in the floor (z 5 − n … 4), sprinting and jumping at its edge.
  const crosses = (n: number) => {
    const world = toy((_x, y, z) => y < 10 && !(z >= 5 - n && z < 5));
    const p = new Player();
    p.setPosition(0.5, 10, 8.5);
    for (let t = 0; t < 0.5; t += DT) p.step(DT, STILL, world);
    for (let t = 0; t < 4; t += DT) p.step(DT, { ...STILL, forward: 1, sprint: true, jump: p.z < 5 }, world);
    return p.z < 5 - n && p.y > 9.99;
  };
  let gap = 0;
  while (gap < 8 && crosses(gap + 1)) gap++;
  // Water three deep under y 10 (its top face at 10), with a bank n blocks above the water's top from z 5 north.
  const bank = (n: number) => toy((_x, y, z) => y < 7 || (z < 5 && y < 10 + n), (_x, y) => y >= 7 && y < 10);
  let swimLift = -Infinity;
  {
    const p = new Player();
    const pool = bank(4);
    p.setPosition(0.5, 8, 8.5);
    for (let t = 0; t < 6; t += DT) { p.step(DT, { ...STILL, jump: true }, pool); if (t > 3) swimLift = Math.max(swimLift, p.y - 10); }
  }
  const out = (n: number) => { const p = new Player(); const w = bank(n); p.setPosition(0.5, 8, 8.5); for (let t = 0; t < 8; t += DT) p.step(DT, { ...STILL, forward: 1, jump: true }, w); return p.z < 4.5 && p.y >= 10 + n - 0.01; };
  if (!out(0)) throw new Error('a swimmer cannot leave water at a bank level with it');
  // (A bank a whole block above the water: only if the lift and the step together reach it.)
  if (out(1) !== (swimLift + step >= 1)) throw new Error('the swim rule (lift + step) does not match the Player');
  let deadlyFall = 1;
  while (fallDamage(deadlyFall) < 100) deadlyFall++;
  let safeFall = 0;
  while (fallDamage(safeFall + 1) === 0) safeFall++;
  measured = { height: 1.8, step, climb, gap, swimLift, safeFall, deadlyFall };
  return measured;
}

// ---- The flood ------------------------------------------------------------------------------------------

export interface Spot { x: number; y: number; z: number; swim: boolean }

export interface FloodOptions {
  /** Columns the flood may enter (all, if unset). */
  inside?: (x: number, z: number) => boolean;
  /** Places a walker may not stand or swim (the dam's deck, when asking what is reached without it). */
  barred?: (x: number, y: number, z: number) => boolean;
  /** The highest ledge taken: `rules.step` for a walk with no jump; the jump's reach if unset. */
  climb?: number;
  /** The longest drop taken in one step: anything short of a deadly fall if unset. */
  drop?: number;
  /** Running jumps over gaps, too (generous: used where the question is "can it be reached at all"). */
  jumps?: boolean;
  /** Stop when this many places are reached (a runaway guard). */
  limit?: number;
}

const EPS = 1e-6;

/**
 * Everywhere the step rules reach from the starting places. A place is a column and the height of the feet
 * there (standing on a block's top, or afloat in a water block). Moves go to the four neighbours: level, up a
 * ledge, down a drop, into and out of water, up and down through it.
 */
export class Flood {
  readonly spots: Spot[] = [];
  private index = new Map<number, number>();
  private from: number[] = [];
  /** Every move found, as pairs of spot numbers. */
  private moves: number[] = [];
  private climb: number;
  private drop: number;
  private rules: Rules;
  private blockAt: BlockAt;
  private opts: FloodOptions;

  constructor(blockAt: BlockAt, starts: Spot[], opts: FloodOptions = {}) {
    this.blockAt = blockAt;
    this.opts = opts;
    this.rules = measureRules();
    this.climb = opts.climb ?? this.rules.climb;
    this.drop = opts.drop ?? this.rules.deadlyFall - 1;
    for (const s of starts) this.add(s, -1);
    const limit = opts.limit ?? 4_000_000;
    for (let i = 0; i < this.spots.length && this.spots.length < limit; i++) this.spread(i);
  }

  private key(s: Spot): number {
    return ((s.x * 2048 + s.z) * 4096 + Math.round(s.y * 16)) * 2 + (s.swim ? 1 : 0);
  }

  private add(s: Spot, from: number): number {
    const k = this.key(s);
    let i = this.index.get(k);
    if (i === undefined) {
      if (this.opts.barred?.(s.x, s.y, s.z)) return -1;
      i = this.spots.length;
      this.spots.push(s);
      this.from.push(from);
      this.index.set(k, i);
    }
    if (from >= 0 && i !== from) this.moves.push(from, i);
    return i;
  }

  has(x: number, y: number, z: number, swim = false): boolean {
    return this.index.has(this.key({ x, y, z, swim }));
  }

  /** The reached place in a column nearest a height (standing first), or null. */
  at(x: number, z: number, nearY: number, within = 1.5): Spot | null {
    let best: Spot | null = null;
    for (let h = Math.round((nearY - within) * 16); h <= Math.round((nearY + within) * 16); h++) {
      for (const swim of [false, true]) {
        const i = this.index.get(((x * 2048 + z) * 4096 + h) * 2 + (swim ? 1 : 0));
        if (i !== undefined && (!best || Math.abs(h / 16 - nearY) < Math.abs(best.y - nearY))) best = this.spots[i];
      }
    }
    return best;
  }

  /** Is there solid in column (x, z) anywhere in the open span lo … hi? (A railing stands taller than its block.) */
  private blockedSpan(x: number, z: number, lo: number, hi: number): boolean {
    for (let by = Math.floor(lo) - 1; by < hi - EPS; by++) {
      const id = this.blockAt(x, by, z);
      if (B_SOLID[id] && by + B_TOP[id] / 16 > lo + EPS) return true;
    }
    return false;
  }

  private room(x: number, z: number, y: number): boolean {
    return !this.blockedSpan(x, z, y, y + this.rules.height);
  }

  /** Stepping (or falling) into column (x, z) with the feet at `h`: where that ends, or null if the way is shut or the fall too long. */
  private settle(x: number, z: number, h: number): Spot | null {
    if (!this.room(x, z, h)) return null;
    for (let y = Math.floor(h + EPS); y >= 0; y--) {
      const id = this.blockAt(x, y, z);
      if (isWaterId(id)) {
        // Water breaks a fall if it is two deep or more; one block of it is the ground under it.
        const deep = isWaterId(this.blockAt(x, y - 1, z));
        const fell = h - (deep ? y + 1 : y);
        return fell <= this.drop + EPS ? { x, y, z, swim: true } : null;
      }
      if (B_SOLID[id]) {
        const top = y + B_TOP[id] / 16;
        return h - top <= this.drop + EPS ? { x, y: top, z, swim: false } : null;
      }
    }
    return null;
  }

  /**
   * The ledges in column (x, z) between `lo` (not included) and `hi` that a body can stand on. One with water
   * over it is a place to float, not to stand: nobody jumps from under water.
   */
  private ledges(x: number, z: number, lo: number, hi: number): Spot[] {
    const out: Spot[] = [];
    for (let by = Math.floor(lo) - 1; by <= Math.floor(hi + EPS); by++) {
      const id = this.blockAt(x, by, z);
      if (!B_SOLID[id]) continue;
      const top = by + B_TOP[id] / 16;
      if (top > lo + EPS && top <= hi + EPS && this.room(x, z, top)) {
        const wet = isWaterId(this.blockAt(x, Math.floor(top + EPS), z));
        out.push(wet ? { x, y: Math.floor(top + EPS), z, swim: true } : { x, y: top, z, swim: false });
      }
    }
    return out;
  }

  private spread(i: number): void {
    const s = this.spots[i];
    const inside = this.opts.inside;
    const R = this.rules;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const bx = s.x + dx, bz = s.z + dz;
      if (inside && !inside(bx, bz)) continue;
      if (!s.swim) {
        // Level or down.
        const land = this.settle(bx, bz, s.y);
        if (land) this.add(land, i);
        // Up a ledge: the body rises where it stands, then moves over.
        for (const up of this.ledges(bx, bz, s.y, s.y + this.climb)) if (!this.blockedSpan(s.x, s.z, s.y, up.y + R.height)) this.add(up, i);
        if (this.opts.jumps) this.leap(i, s, dx, dz);
      } else {
        // Afloat in water block y: on through water, out over a bank, or off an edge.
        const upper = isWaterId(this.blockAt(s.x, s.y + 1, s.z));
        if (isWaterId(this.blockAt(bx, s.y, bz))) { if (this.room(bx, bz, s.y)) this.add({ x: bx, y: s.y, z: bz, swim: true }, i); }
        else {
          const land = this.settle(bx, bz, s.y);
          if (land) this.add(land, i);
        }
        // The feet come up to the next water block, or a little above the top of the last; from there, a step out.
        let feet = upper ? s.y + 1 : s.y + 1 + R.swimLift;
        while (feet > s.y && this.blockedSpan(s.x, s.z, feet, feet + R.height)) feet -= 1 / 16;
        for (const up of this.ledges(bx, bz, s.y, feet + R.step)) if (!this.blockedSpan(s.x, s.z, Math.max(s.y, up.y - R.step), up.y + R.height)) this.add(up, i);
      }
    }
    if (s.swim) {
      if (isWaterId(this.blockAt(s.x, s.y + 1, s.z)) && this.room(s.x, s.z, s.y + 1)) this.add({ x: s.x, y: s.y + 1, z: s.z, swim: true }, i);
      if (isWaterId(this.blockAt(s.x, s.y - 1, s.z))) this.add({ x: s.x, y: s.y - 1, z: s.z, swim: true }, i);
    }
  }

  /**
   * A running jump straight on over a gap: as far as the measured leap on the level (a block up at the far side
   * if the gap is short), and further the lower it lands.
   */
  private leap(i: number, s: Spot, dx: number, dz: number): void {
    const R = this.rules, inside = this.opts.inside;
    const far = R.gap + Math.floor(Math.sqrt(this.drop));
    for (let n = 1; n <= far; n++) {
      const mx = s.x + dx * n, mz = s.z + dz * n, tx = mx + dx, tz = mz + dz;
      if (this.blockedSpan(mx, mz, s.y, s.y + R.height)) break; // something in the way of the leap
      if (inside && !inside(tx, tz)) break;
      if (n <= 2) for (const up of this.ledges(tx, tz, s.y, s.y + R.step)) this.add(up, i);
      const land = this.settle(tx, tz, s.y);
      if (land && n <= R.gap + Math.floor(Math.sqrt(Math.max(0, s.y - land.y)))) this.add(land, i);
    }
  }

  /** The way the flood first came to a place, from its start. */
  wayTo(to: Spot): Spot[] {
    const out: Spot[] = [];
    for (let i = this.index.get(this.key(to)) ?? -1; i >= 0; i = this.from[i]) out.push(this.spots[i]);
    return out.reverse();
  }

  /** The places reached from which none of the `home` places can be reached again by the same rules. */
  stuck(home: (s: Spot) => boolean): Spot[] {
    const n = this.spots.length;
    // The moves, turned round.
    const count = new Int32Array(n + 1);
    for (let k = 0; k < this.moves.length; k += 2) count[this.moves[k + 1] + 1]++;
    for (let i = 0; i < n; i++) count[i + 1] += count[i];
    const back = new Int32Array(this.moves.length / 2), fill = count.slice(0, n);
    for (let k = 0; k < this.moves.length; k += 2) back[fill[this.moves[k + 1]]++] = this.moves[k];
    const ok = new Uint8Array(n);
    const queue: number[] = [];
    for (let i = 0; i < n; i++) if (home(this.spots[i])) { ok[i] = 1; queue.push(i); }
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q];
      for (let k = count[i]; k < count[i + 1]; k++) { const j = back[k]; if (!ok[j]) { ok[j] = 1; queue.push(j); } }
    }
    return this.spots.filter((_s, i) => !ok[i]);
  }
}

/** Where a body dropped into column (x, z) from height `fromY` comes to stand (or float). */
export function footing(blockAt: BlockAt, x: number, z: number, fromY: number): Spot {
  for (let y = Math.floor(fromY); y >= 0; y--) {
    const id = blockAt(x, y, z);
    if (isWaterId(id)) return { x, y, z, swim: true };
    if (B_SOLID[id]) return { x, y: y + B_TOP[id] / 16, z, swim: false };
  }
  return { x, y: 0, z, swim: false };
}

/** Every place in column (x, z) where a body can stand, and the top of every stretch of water it can float in. */
export function standing(blockAt: BlockAt, x: number, z: number, y0 = 1, y1 = WORLD_Y - 1): Spot[] {
  const out: Spot[] = [];
  const free = (lo: number) => {
    for (let by = Math.floor(lo) - 1; by < lo + 1.8 - EPS; by++) { const id = blockAt(x, by, z); if (B_SOLID[id] && by + B_TOP[id] / 16 > lo + EPS) return false; }
    return true;
  };
  for (let y = y0; y <= y1; y++) {
    const id = blockAt(x, y, z);
    if (B_SOLID[id]) { const top = y + B_TOP[id] / 16; if (free(top)) out.push({ x, y: top, z, swim: false }); }
    else if (isWaterId(id) && !isWaterId(blockAt(x, y + 1, z)) && free(y)) out.push({ x, y, z, swim: true });
  }
  return out;
}

/** Groups places that touch (side by side, or one above the other) into clusters, biggest first. */
export function clusters(spots: Spot[]): Spot[][] {
  const byCol = new Map<number, Spot[]>();
  for (const s of spots) { const k = s.x * 2048 + s.z; const a = byCol.get(k); if (a) a.push(s); else byCol.set(k, [s]); }
  const seen = new Set<Spot>();
  const out: Spot[][] = [];
  for (const s of spots) {
    if (seen.has(s)) continue;
    const group: Spot[] = [s];
    seen.add(s);
    for (let q = 0; q < group.length; q++) {
      const a = group[q];
      for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        for (const b of byCol.get((a.x + dx) * 2048 + a.z + dz) ?? []) if (!seen.has(b) && Math.abs(b.y - a.y) <= 20) { seen.add(b); group.push(b); }
      }
    }
    out.push(group);
  }
  return out.sort((a, b) => b.length - a.length);
}

export const show = (s: Spot | null | undefined): string => (s ? `(${s.x}, ${Math.round(s.y * 100) / 100}, ${s.z})${s.swim ? ' in water' : ''}` : '(nowhere)');

// ---- The real Player, walking a way cell by cell --------------------------------------------------------

export interface Walked {
  arrived: boolean;
  /** Where the Player stopped. */
  at: [number, number, number];
  seconds: number;
  /** The longest fall on the way, in blocks, and the least breath left, in seconds. */
  fall: number;
  breath: number;
}

/**
 * Sets the real Player to follow a way found by the flood: it turns toward the middle of each next cell and
 * holds forward (and Space only where the way swims or `jump` is set). It never looks at the blocks itself,
 * so a ledge it cannot take, a hole or a wall stops it.
 */
export function follow(blockAt: BlockAt, way: Spot[], opts: { jump?: boolean; flow?: (x: number, y: number, z: number) => number; sprint?: boolean } = {}): Walked {
  const p = new Player();
  const s0 = way[0];
  p.setPosition(s0.x + 0.5, s0.y, s0.z + 0.5);
  p.flow = opts.flow ?? null;
  let t = 0, fall = 0, breath = p.breath;
  const wait = { ...STILL };
  for (let k = 0; k < 20; k++) p.step(DT, wait, blockAt);
  p.landedFall = 0;
  for (let i = 1; i < way.length; i++) {
    const w = way[i];
    const tx = w.x + 0.5, tz = w.z + 0.5;
    const budget = t + 6;
    for (;;) {
      const dx = tx - p.x, dz = tz - p.z;
      // A cell is passed when the Player is in its column (and, where the way swims, near its height).
      // (The last one when the Player stands wholly in it: on a step down, a body half over the edge is still on the step above.)
      const reach = i === way.length - 1 ? 0.15 : 0.35;
      const there = Math.abs(dx) < reach && Math.abs(dz) < reach && (!w.swim || Math.abs(p.y - w.y) < 0.45);
      if (there) break;
      if (t > budget) return { arrived: false, at: [p.x, p.y, p.z], seconds: t, fall, breath };
      p.yaw = Math.atan2(-dx, -dz);
      const near = Math.hypot(dx, dz) < reach;
      // In water: Space to rise toward the way's height, let go to sink.
      const jump = p.inWater ? p.y < w.y - 0.1 : (opts.jump ?? false) && p.onGround && w.y > p.y + 0.3;
      p.step(DT, { forward: near ? 0 : 1, strafe: 0, jump, sprint: opts.sprint ?? false, descend: false }, blockAt);
      t += DT;
      fall = Math.max(fall, p.landedFall);
      p.landedFall = 0;
      breath = Math.min(breath, p.breath);
    }
  }
  // Half a second to come to rest (the last cell may be a step down).
  for (let k = 0; k < 30; k++) { p.step(DT, wait, blockAt); t += DT; fall = Math.max(fall, p.landedFall); p.landedFall = 0; }
  return { arrived: true, at: [p.x, p.y, p.z], seconds: t, fall, breath };
}

/** What stands in a column at a height: for saying what an unreached road cell holds. */
export function nameAt(blockAt: BlockAt, x: number, y: number, z: number): string {
  return blockName(blockAt(x, y, z));
}

// ---- A route: its own cells, a walk along them, and the ground beside them --------------------------------

export interface Route {
  name: string;
  /** Is (x, z) one of the route's own cells (its paving)? */
  on: (x: number, z: number) => boolean;
  /** A box that holds every one of its cells: x0, z0, x1, z1 (inclusive). */
  box: [number, number, number, number];
  /** Where it starts and ends: a column, and a height at or a little above the ground there. */
  from: [number, number, number];
  to: [number, number, number];
}

/** The route's cells. */
export function cellsOf(r: Route): [number, number][] {
  const out: [number, number][] = [];
  for (let z = r.box[1]; z <= r.box[3]; z++) for (let x = r.box[0]; x <= r.box[2]; x++) if (r.on(x, z)) out.push([x, z]);
  return out;
}

export interface OnRoute {
  /** The walk on the route's own cells with no jump and no drop of more than a step. */
  flood: Flood;
  start: Spot;
  /** Where the walk reached its far end, or null. */
  end: Spot | null;
  /** Route cells the walk never stood on, with what stands there at the height of the cell beside it. */
  missed: { x: number; z: number; what: string }[];
  cells: number;
}

/** Walks a route on its own cells by the gentlest rules: the auto-step up, a step down, no jump. */
export function walkOn(blockAt: BlockAt, r: Route): OnRoute {
  const R = measureRules();
  const start = footing(blockAt, r.from[0], r.from[2], r.from[1] + 2);
  const flood = new Flood(blockAt, [start], { inside: r.on, climb: R.step, drop: R.step });
  const stood = new Map<number, number>();
  for (const s of flood.spots) stood.set(s.x * 2048 + s.z, s.y);
  const missed: OnRoute['missed'] = [];
  const cells = cellsOf(r);
  for (const [x, z] of cells) {
    if (stood.has(x * 2048 + z)) continue;
    // What is in the way: the block at the feet of whoever stands on the nearest walked cell.
    let y = NaN;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const h = stood.get((x + dx) * 2048 + z + dz); if (h !== undefined) { y = h; break; } }
    const top = footing(blockAt, x, z, WORLD_Y - 1);
    const what = Number.isNaN(y) ? `nothing walked beside it (ground at ${top.y})` : B_SOLID[blockAt(x, Math.floor(y), z)] ? blockName(blockAt(x, Math.floor(y), z)) : `a hole (ground at ${footing(blockAt, x, z, y).y}, the road at ${y})`;
    missed.push({ x, z, what });
  }
  const end = flood.at(r.to[0], r.to[2], r.to[1], 2.5);
  return { flood, start, end, missed, cells: cells.length };
}

/** How far each column is from the nearest of some cells (steps along the grid), out to `reach`. */
export function distanceFrom(cells: [number, number][], reach: number): (x: number, z: number) => number {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of cells) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
  x0 -= reach; z0 -= reach; x1 += reach; z1 += reach;
  const W = x1 - x0 + 1, H = z1 - z0 + 1;
  const d = new Int16Array(W * H).fill(-1);
  const queue: number[] = [];
  for (const [x, z] of cells) { const k = (z - z0) * W + (x - x0); if (d[k] < 0) { d[k] = 0; queue.push(k); } }
  for (let q = 0; q < queue.length; q++) {
    const k = queue[q], x = k % W, z = (k - x) / W;
    if (d[k] >= reach) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
      const nk = nz * W + nx;
      if (d[nk] < 0) { d[nk] = d[k] + 1; queue.push(nk); }
    }
  }
  return (x, z) => {
    if (x < x0 || z < z0 || x > x1 || z > z1) return Infinity;
    const v = d[(z - z0) * W + (x - x0)];
    return v < 0 ? Infinity : v;
  };
}

export interface Beside {
  flood: Flood;
  /** Pits: places within `near` of the cells that a walker can get into alive and never out of, grouped. */
  pits: Spot[][];
}

/**
 * Everything a walker can get to alive from `start` without going more than `far` from the cells (any jump,
 * any drop short of a deadly one, any swim), and the places among it, within `near` of the cells, from which
 * there is no way back to the start.
 */
export function beside(blockAt: BlockAt, cells: [number, number][], start: Spot, near: number, far: number, allow: (s: Spot) => boolean = () => false): Beside {
  const dist = distanceFrom(cells, far);
  const flood = new Flood(blockAt, [start], { inside: (x, z) => dist(x, z) <= far });
  const lost = flood.stuck((s) => s === flood.spots[0]).filter((s) => dist(s.x, s.z) <= near && !allow(s));
  return { flood, pits: clusters(lost) };
}

/** A pit, said in one line: how many places, its lowest, and the lip above it. */
export function showPit(blockAt: BlockAt, pit: Spot[]): string {
  const lo = pit.reduce((a, b) => (b.y < a.y ? b : a));
  let lip = Infinity;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) lip = Math.min(lip, footing(blockAt, lo.x + dx, lo.z + dz, WORLD_Y - 1).y);
  return `${pit.length} place${pit.length > 1 ? 's' : ''} at ${show(lo)}`;
}
