// The wild outside the valley: every creature and every arrow in flight, stepped at 20 Hz. It spawns
// and lets go of creatures around the player, runs their minds, flies arrows, and reports what the
// game should hear and feel. The sanctuary rule holds here as everywhere: nothing lives or flies
// into the valley (inSanctuary in src/gen/layout.ts).

import { B_SOLID } from '../world/blocks.ts';
import { inSanctuary } from '../gen/layout.ts';
import { think, hurt, KINDS, PACK_KINDS, type Creature, type Hit, type Kind, type Mind } from './creatures.ts';
import { trySpawn, despawnFar, denPack, DEN_SIZE, FLOCK_SIZE } from './spawner.ts';
import { snared, snareNear } from '../sim/rabbits.ts';

export const WILD_HZ = 20;
const STEP = 1 / WILD_HZ;
const GRAVITY = 18;

type BlockAt = (x: number, y: number, z: number) => number;

export interface Arrow {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  damage: number;
  /** Stuck in a block (it can be picked up), or still flying. */
  stuck: boolean;
  /** Seconds since it was loosed or stuck. */
  age: number;
}

export interface WildSenses {
  px: number; py: number; pz: number; // the player's feet
  night: boolean;
  /** A rifle shot since the last update. */
  shot: boolean;
  blockAt: BlockAt;
  /** Is the column at (x, z) loaded? Creatures never spawn or walk into unloaded land. */
  loaded: (x: number, z: number) => boolean;
  rand: () => number;
  /** How many arrows the player has room to pick up (no limit if not given). */
  arrowRoom?: () => number;
}

export type WildSound = { kind: 'rustle' | 'grunt' | 'growl' | 'hit' | 'bark' | 'snarl' | 'yip' | 'cluck'; x: number; y: number; z: number };

export interface WildEvents {
  /** Blows that landed on the player, before armour. */
  hits: Hit[];
  sounds: WildSound[];
  /** Creatures killed this update (by arrows), with where they fell. */
  kills: Creature[];
  /** Arrows the player walked over and picked up. */
  picked: number;
  /** Snares that caught a rabbit: the game marks them full. */
  snared: [number, number, number][];
}

/** How much of a blow gets through what the player carries: the best of the vest and leather armour. */
export function armourFactor(count: (name: string) => number): number {
  if (count('armor_vest') > 0) return 0.7;
  if (count('leather_armor') > 0) return 0.85;
  return 1;
}

export class Wild {
  creatures: Creature[] = [];
  arrows: Arrow[] = [];
  private acc = 0;
  private spawnIn = 0;
  private shotHeard = false;
  /** Off in test mode, so a scene set up by hand stays as it was set. */
  spawning = true;
  /** How many of the farmhouse den's dogs are still alive (the game saves it). */
  denLeft = DEN_SIZE;
  /** How many hens are left in the farm's feral flock: caught or killed ones are gone until it regrows (saved). */
  flockLeft = FLOCK_SIZE;

  /** Runs as many 20 Hz steps as `dt` holds. */
  update(dt: number, s: WildSenses): WildEvents {
    const ev: WildEvents = { hits: [], sounds: [], kills: [], picked: 0, snared: [] };
    if (s.shot) this.shotHeard = true;
    this.acc += dt;
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.step(s, ev);
    }
    return ev;
  }

  private step(s: WildSenses, ev: WildEvents): void {
    // Spawning: one try a second, and letting go of what is far away.
    this.spawnIn -= STEP;
    if (this.spawnIn <= 0 && this.spawning) {
      this.spawnIn = 1;
      this.creatures = despawnFar(this.creatures, s.px, s.pz, s.night);
      this.creatures.push(...trySpawn(this.creatures, s.px, s.pz, s.night, s.rand, s.blockAt, s.loaded, { chicken: this.flockLeft }));
      this.creatures.push(...denPack(this.creatures, s.px, s.pz, this.denLeft, s.rand, s.blockAt, s.loaded));
    }
    const senses = { px: s.px, py: s.py, pz: s.pz, playerInSanctuary: inSanctuary(s.px, s.pz), night: s.night, shot: this.shotHeard };
    this.shotHeard = false;
    for (const c of this.creatures) {
      if (!s.loaded(c.x, c.z)) continue; // its ground isn't there: it waits
      const before: Mind = c.mind;
      const hit = think(c, STEP, senses, s.blockAt, s.rand);
      if (hit) ev.hits.push(hit);
      if (c.mind !== before) this.cue(c, before, ev);
      // A roaming pack hunts together: when one notices the player, the others near it join in round the same bearing.
      if (PACK_KINDS.has(c.kind) && !c.home && c.mind === 'flank' && before === 'wander')
        for (const o of this.creatures) if (o !== c && o.kind === c.kind && o.mind === 'wander' && Math.hypot(o.x - c.x, o.z - c.z) < 30) { o.mind = 'flank'; o.timer = 7; o.flankBase = c.flankBase; }
      // The flock talks among itself.
      if (c.kind === 'chicken' && s.rand() < 0.004) ev.sounds.push({ kind: 'cluck', x: c.x, y: c.y + 0.3, z: c.z });
      // A grazing rabbit now and then smells a snare's bait and wanders over to it.
      if (c.kind === 'rabbit' && c.mind === 'wander' && s.rand() < 0.02) {
        const at = snareNear(c, s.blockAt);
        if (at) { c.goalX = at[0] + 0.5; c.goalZ = at[2] + 0.5; c.timer = 6; }
      }
    }
    for (const { c, at } of snared(this.creatures, s.blockAt)) {
      this.remove(c);
      ev.snared.push(at);
      ev.sounds.push({ kind: 'rustle', x: at[0] + 0.5, y: at[1] + 0.3, z: at[2] + 0.5 });
    }
    this.flyArrows(s, ev);
  }

  /** Sounds that go with a change of mind: a bolt through the undergrowth, a grunt, a growl. */
  private cue(c: Creature, before: Mind, ev: WildEvents): void {
    const at = { x: c.x, y: c.y + KINDS[c.kind].height / 2, z: c.z };
    if (c.mind === 'flee' && before !== 'flee') ev.sounds.push({ kind: 'rustle', ...at });
    // The boar grunts as it starts its charge, and again as it lowers its head to strike.
    if (c.kind === 'boar' && (c.mind === 'charge' || c.mind === 'windup')) ev.sounds.push({ kind: 'grunt', ...at });
    if (c.kind === 'puma' && c.mind === 'windup') ev.sounds.push({ kind: 'growl', ...at });
    // A pack gives itself away as it comes: dogs bark, coyotes yip; each snarls as it crouches to spring.
    if (PACK_KINDS.has(c.kind) && c.mind === 'flank' && before === 'wander') ev.sounds.push({ kind: c.kind === 'dog' ? 'bark' : 'yip', ...at });
    if (PACK_KINDS.has(c.kind) && c.mind === 'windup') ev.sounds.push({ kind: 'snarl', ...at });
    if (c.kind === 'chicken' && c.mind === 'flee' && before !== 'flee') ev.sounds.push({ kind: 'cluck', ...at });
  }

  /** Looses an arrow from the eye along a direction, at a speed set by the draw. */
  shoot(x: number, y: number, z: number, dx: number, dy: number, dz: number, draw: number): Arrow {
    const d = Math.max(0, Math.min(1, draw));
    const speed = 18 + 30 * d;
    const a: Arrow = { x, y, z, vx: dx * speed, vy: dy * speed, vz: dz * speed, damage: Math.round(12 + 10 * d), stuck: false, age: 0 };
    this.arrows.push(a);
    return a;
  }

  private flyArrows(s: WildSenses, ev: WildEvents): void {
    const keep: Arrow[] = [];
    for (const a of this.arrows) {
      a.age += STEP;
      if (a.stuck) {
        // Walking over a spent arrow picks it up; left alone, it stays a few minutes.
        const near = Math.hypot(a.x - s.px, a.z - s.pz) < 1.3 && Math.abs(a.y - (s.py + 0.6)) < 1.6;
        if (near && (s.arrowRoom?.() ?? Infinity) > ev.picked) { ev.picked++; continue; } // a full pack leaves it lying
        if (a.age < 300) keep.push(a);
        continue;
      }
      const sx = a.x, sy = a.y, sz = a.z;
      const stuck = stepArrow(a, STEP, s.blockAt);
      const hit = arrowHitCreature(this.creatures, sx, sy, sz, a.x, a.y, a.z);
      if (hit) {
        ev.sounds.push({ kind: 'hit', x: hit.x, y: hit.y + KINDS[hit.kind].height / 2, z: hit.z });
        if (hurt(hit, a.damage)) { ev.kills.push(hit); this.remove(hit); }
        // The arrow drops where the animal was, to be picked up again.
        a.x = hit.x; a.y = hit.y + 0.2; a.z = hit.z; a.stuck = true; a.age = 0;
        keep.push(a);
        continue;
      }
      if (stuck) { a.age = 0; keep.push(a); continue; }
      if (a.age > 8 || !s.loaded(a.x, a.z)) continue; // flew off out of the world
      keep.push(a);
    }
    this.arrows = keep;
  }

  remove(c: Creature): void { this.creatures = this.creatures.filter((o) => o !== c); }

  /** Puts a creature in the world (for tests and the play-through). Refused inside the sanctuary. */
  add(c: Creature): boolean {
    if (inSanctuary(c.x, c.z)) return false;
    this.creatures.push(c);
    return true;
  }

  count(kind: Kind): number { return this.creatures.filter((c) => c.kind === kind).length; }

  clear(): void { this.creatures = []; this.arrows = []; }
}

/**
 * Moves an arrow one step under gravity, in small sub-steps so it can't pass through a block.
 * Returns true when it strikes a block and sticks there. Arrows never fly into the sanctuary:
 * one that would is stopped at its edge.
 */
export function stepArrow(a: Arrow, dt: number, blockAt: BlockAt): boolean {
  a.vy -= GRAVITY * dt;
  const speed = Math.hypot(a.vx, a.vy, a.vz);
  const n = Math.max(1, Math.ceil((speed * dt) / 0.25));
  for (let k = 0; k < n; k++) {
    const nx = a.x + (a.vx * dt) / n, ny = a.y + (a.vy * dt) / n, nz = a.z + (a.vz * dt) / n;
    if (B_SOLID[blockAt(Math.floor(nx), Math.floor(ny), Math.floor(nz))] || ny < 1) {
      a.stuck = true;
      return true;
    }
    if (inSanctuary(nx, nz)) {
      // Stopped at the valley's edge: it drops to the ground there, where it can be picked up.
      while (a.y > 1 && !B_SOLID[blockAt(Math.floor(a.x), Math.floor(a.y) - 1, Math.floor(a.z))]) a.y -= 1;
      a.y = Math.floor(a.y) + 0.1;
      a.stuck = true;
      return true;
    }
    a.x = nx; a.y = ny; a.z = nz;
  }
  return false;
}

/** The creature the segment from (sx, sy, sz) to (ex, ey, ez) first passes through, if any. */
export function arrowHitCreature(cs: Creature[], sx: number, sy: number, sz: number, ex: number, ey: number, ez: number): Creature | null {
  const dx = ex - sx, dy = ey - sy, dz = ez - sz;
  let best: Creature | null = null, bestT = Infinity;
  for (const c of cs) {
    const d = KINDS[c.kind], h = d.width / 2 + 0.1;
    const lo = [c.x - h, c.y, c.z - h], hi = [c.x + h, c.y + d.height + 0.1, c.z + h];
    const o = [sx, sy, sz], v = [dx, dy, dz];
    let t0 = 0, t1 = 1, ok = true;
    for (let i = 0; i < 3 && ok; i++) {
      if (Math.abs(v[i]) < 1e-9) { if (o[i] < lo[i] || o[i] > hi[i]) ok = false; continue; }
      let ta = (lo[i] - o[i]) / v[i], tb = (hi[i] - o[i]) / v[i];
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) ok = false;
    }
    if (ok && t0 < bestT) { best = c; bestT = t0; }
  }
  return best;
}
