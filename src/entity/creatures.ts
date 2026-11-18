// Wildlife outside the valley: rabbits, deer, wild boar and the night's puma. Each has a simple
// mind (wander, flee, charge, stalk), a body that walks on the blocks, and what it gives when hunted.
// The valley is a sanctuary: no creature here can enter it, at any depth (docs/PLAN.md).

import { B_SOLID, isWaterId } from '../world/blocks.ts';
import { inSanctuary } from '../gen/layout.ts';

export type Kind = 'rabbit' | 'deer' | 'boar' | 'puma';

export interface KindDef {
  hp: number;
  width: number;
  height: number;
  walk: number; // m/s, wandering
  run: number; // m/s, fleeing or charging
  shy: number; // flees when the player comes this close (0: never flees on sight)
  hostile: boolean; // can attack the player
  damage: number;
  windup: number; // seconds of warning before a hit lands
  drops: [string, number][];
}

export const KINDS: Record<Kind, KindDef> = {
  rabbit: { hp: 6, width: 0.4, height: 0.45, walk: 1.4, run: 5.5, shy: 7, hostile: false, damage: 0, windup: 0, drops: [['rabbit_raw', 1], ['hide', 1]] },
  deer: { hp: 30, width: 0.8, height: 1.4, walk: 1.6, run: 7.5, shy: 14, hostile: false, damage: 0, windup: 0, drops: [['venison_raw', 3], ['hide', 1], ['bone', 1]] },
  boar: { hp: 45, width: 0.9, height: 0.9, walk: 1.3, run: 5.6, shy: 0, hostile: true, damage: 10, windup: 0.6, drops: [['pork_raw', 3], ['hide', 1], ['bone', 1]] },
  puma: { hp: 60, width: 0.8, height: 0.9, walk: 2.2, run: 7, shy: 0, hostile: true, damage: 16, windup: 0.5, drops: [['puma_pelt', 1]] },
};

export type Mind = 'wander' | 'flee' | 'charge' | 'stalk' | 'windup' | 'recover';

export interface Creature {
  id: number;
  kind: Kind;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  yaw: number;
  hp: number;
  mind: Mind;
  timer: number; // seconds left in the current mind
  goalX: number; goalZ: number;
  onGround: boolean;
  /** For drawing: how far the legs have swung. */
  stride: number;
  /** Seconds since last hurt (for a red flash). */
  hurt: number;
}

type BlockAt = (x: number, y: number, z: number) => number;

let nextId = 1;

export function makeCreature(kind: Kind, x: number, y: number, z: number): Creature {
  return { id: nextId++, kind, x, y, z, vx: 0, vy: 0, vz: 0, yaw: Math.random() * Math.PI * 2, hp: KINDS[kind].hp, mind: 'wander', timer: 0, goalX: x, goalZ: z, onGround: false, stride: 0, hurt: 9 };
}

/** Whether a creature's body fits at (x, y, z): no solid blocks, and never inside the sanctuary. */
export function fits(c: Creature, x: number, y: number, z: number, blockAt: BlockAt): boolean {
  const d = KINDS[c.kind];
  const h = d.width / 2;
  // The whole body stays out of the sanctuary, not only its middle.
  for (const [cx, cz] of [[x - h, z - h], [x + h, z - h], [x - h, z + h], [x + h, z + h], [x, z]]) if (inSanctuary(cx, cz)) return false;
  for (let by = Math.floor(y); by <= Math.floor(y + d.height - 1e-6); by++)
    for (let bz = Math.floor(z - h); bz <= Math.floor(z + h - 1e-6); bz++)
      for (let bx = Math.floor(x - h); bx <= Math.floor(x + h - 1e-6); bx++) if (B_SOLID[blockAt(bx, by, bz)]) return false;
  return true;
}

/** Moves a body: gravity, then each horizontal axis, stepping up single blocks and stopping at drops > 3 m. */
function moveBody(c: Creature, dt: number, blockAt: BlockAt): void {
  c.vy = Math.max(-30, c.vy - 26 * dt);
  const ny = c.y + c.vy * dt;
  c.onGround = false;
  if (fits(c, c.x, ny, c.z, blockAt)) c.y = ny;
  else { if (c.vy < 0) { c.y = Math.floor(ny) + 1; c.onGround = true; } c.vy = 0; }
  for (const axis of [0, 1]) {
    const v = axis === 0 ? c.vx : c.vz;
    if (!v) continue;
    const nx = axis === 0 ? c.x + v * dt : c.x, nz = axis === 1 ? c.z + v * dt : c.z;
    // Don't walk off a cliff: animals keep to ground they can come back up.
    let drop = 0;
    while (drop < 4 && fits(c, nx, c.y - drop - 1, nz, blockAt) && c.y - drop - 1 > 0) drop++;
    const cliff = c.onGround && drop >= 4;
    const wet = isWaterId(blockAt(Math.floor(nx), Math.floor(c.y), Math.floor(nz)));
    if (!cliff && !wet && fits(c, nx, c.y, nz, blockAt)) { c.x = nx; c.z = nz; continue; }
    if (!cliff && !wet && c.onGround && fits(c, nx, Math.floor(c.y) + 1, nz, blockAt) && fits(c, c.x, Math.floor(c.y) + 1, c.z, blockAt)) {
      c.y = Math.floor(c.y) + 1; c.x = nx; c.z = nz; continue;
    }
    // Blocked: turn away next time it chooses.
    if (axis === 0) c.vx = 0; else c.vz = 0;
    c.timer = Math.min(c.timer, 0.2);
  }
}

export interface Senses {
  px: number; py: number; pz: number; // the player's feet
  playerInSanctuary: boolean;
  night: boolean;
  /** A gunshot this tick, heard within 60 m. */
  shot: boolean;
}

export interface Hit { damage: number; by: Kind }

/** How far above or below a creature the player can be and still be struck. */
export const STRIKE_HEIGHT = 1.5;

/** Can the creature see the player: no solid block between its head and the player's chest? */
export function canSee(c: Creature, s: Senses, blockAt: BlockAt): boolean {
  const ax = c.x, ay = c.y + KINDS[c.kind].height * 0.8, az = c.z;
  const bx = s.px, by = s.py + 1.2, bz = s.pz;
  const n = Math.ceil(Math.hypot(bx - ax, by - ay, bz - az) / 0.2);
  for (let k = 1; k < n; k++) {
    const t = k / n;
    if (B_SOLID[blockAt(Math.floor(ax + (bx - ax) * t), Math.floor(ay + (by - ay) * t), Math.floor(az + (bz - az) * t))]) return false;
  }
  return true;
}

/**
 * One step of a creature's life. Returns a hit on the player if one lands this step.
 * Hostiles never pursue into the sanctuary: a player inside it is out of their world.
 */
export function think(c: Creature, dt: number, s: Senses, blockAt: BlockAt, rand: () => number): Hit | null {
  const d = KINDS[c.kind];
  c.hurt += dt;
  c.timer -= dt;
  const dx = s.px - c.x, dz = s.pz - c.z;
  const dist = Math.hypot(dx, dz);
  const reachable = !s.playerInSanctuary && Math.abs(s.py - c.y) < 3;
  let hit: Hit | null = null;

  // Changes of mind.
  if (d.shy && dist < d.shy && c.mind !== 'flee') { c.mind = 'flee'; c.timer = 3 + rand() * 2; }
  if (s.shot && dist < 60 && c.kind !== 'puma') { c.mind = d.hostile && dist < 12 ? 'charge' : 'flee'; c.timer = 4; }
  if (d.hostile && reachable) {
    if (c.kind === 'boar' && dist < 4 && (c.mind === 'wander')) { c.mind = 'charge'; c.timer = 8; }
    if (c.kind === 'puma' && s.night && c.mind === 'wander' && dist < 40) { c.mind = 'stalk'; c.timer = 30; }
  }
  if (!reachable && (c.mind === 'charge' || c.mind === 'stalk' || c.mind === 'windup')) { c.mind = 'wander'; c.timer = 0; }

  let speed = 0;
  let toX = 0, toZ = 0;
  switch (c.mind) {
    case 'wander':
      if (c.timer <= 0) {
        // Pick somewhere nearby to amble to, or stand and graze for a while.
        const a = rand() * Math.PI * 2, r = 3 + rand() * 9;
        c.goalX = c.x + Math.cos(a) * r; c.goalZ = c.z + Math.sin(a) * r;
        c.timer = 2 + rand() * 6;
        if (rand() < 0.4) { c.goalX = c.x; c.goalZ = c.z; }
      }
      toX = c.goalX - c.x; toZ = c.goalZ - c.z;
      speed = Math.hypot(toX, toZ) > 0.5 ? d.walk : 0;
      break;
    case 'flee':
      toX = -dx; toZ = -dz; speed = d.run;
      if (c.timer <= 0) c.mind = 'wander';
      break;
    case 'charge':
      toX = dx; toZ = dz; speed = d.run;
      if (dist < 1.4 + d.width / 2 && inReach(c, s, blockAt)) { c.mind = 'windup'; c.timer = d.windup; speed = 0; }
      if (dist > 25 || c.timer <= 0) { c.mind = 'wander'; c.timer = 0; }
      break;
    case 'stalk':
      // Close in quietly, then charge from cover.
      toX = dx; toZ = dz; speed = dist > 7 ? d.walk : d.run;
      if (dist < 1.4 + d.width / 2 && inReach(c, s, blockAt)) { c.mind = 'windup'; c.timer = d.windup; speed = 0; }
      if (!s.night || c.timer <= 0) { c.mind = 'wander'; c.timer = 0; }
      break;
    case 'windup':
      toX = dx; toZ = dz; speed = 0;
      if (c.timer <= 0) {
        // The blow lands only if the player is still in reach: stepping back is the defence.
        if (dist < 1.9 + d.width / 2 && reachable && inReach(c, s, blockAt)) hit = { damage: d.damage, by: c.kind };
        c.mind = 'recover'; c.timer = 1.4;
      }
      break;
    case 'recover':
      toX = -dx; toZ = -dz; speed = d.walk;
      if (c.timer <= 0) { c.mind = c.kind === 'puma' ? 'stalk' : 'charge'; c.timer = 8; }
      break;
  }
  // A badly hurt animal runs, hostile or not.
  if (c.hp < d.hp * 0.3 && c.mind !== 'flee') { c.mind = 'flee'; c.timer = 6; }

  const len = Math.hypot(toX, toZ);
  if (len > 0.01) c.yaw = Math.atan2(-toX, -toZ);
  const want = len > 0.01 ? speed / len : 0;
  const k = Math.min(1, dt * 8);
  c.vx += (toX * want - c.vx) * k;
  c.vz += (toZ * want - c.vz) * k;
  moveBody(c, dt, blockAt);
  c.stride += Math.hypot(c.vx, c.vz) * dt * 3;
  return hit;
}

/** Near enough in height, and nothing solid between: a blow could land. */
function inReach(c: Creature, s: Senses, blockAt: BlockAt): boolean {
  return Math.abs(s.py - c.y) < STRIKE_HEIGHT && canSee(c, s, blockAt);
}

/** Damages a creature; returns true if that killed it. A hurt animal flees, a hurt boar charges. */
export function hurt(c: Creature, damage: number): boolean {
  c.hp -= damage;
  c.hurt = 0;
  if (c.hp <= 0) return true;
  if (c.kind === 'boar') { c.mind = 'charge'; c.timer = 8; }
  else if (!KINDS[c.kind].hostile) { c.mind = 'flee'; c.timer = 5; }
  return false;
}

/** Where a ray from the eye first meets a creature's box, within reach. */
export function rayHitCreature(cs: Creature[], ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, reach: number): { c: Creature; dist: number } | null {
  let best: { c: Creature; dist: number } | null = null;
  for (const c of cs) {
    const d = KINDS[c.kind], h = d.width / 2;
    const lo = [c.x - h, c.y, c.z - h], hi = [c.x + h, c.y + d.height, c.z + h];
    let t0 = 0, t1 = reach;
    const o = [ox, oy, oz], v = [dx, dy, dz];
    let ok = true;
    for (let a = 0; a < 3 && ok; a++) {
      if (Math.abs(v[a]) < 1e-9) { if (o[a] < lo[a] || o[a] > hi[a]) ok = false; continue; }
      let ta = (lo[a] - o[a]) / v[a], tb = (hi[a] - o[a]) / v[a];
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) ok = false;
    }
    if (ok && (!best || t0 < best.dist)) best = { c, dist: t0 };
  }
  return best;
}
