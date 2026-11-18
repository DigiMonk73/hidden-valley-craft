// Wildlife outside the valley: rabbits, deer, wild boar and the night's puma; in Zone-1, feral dogs,
// coyotes and feral chickens; and one person, Marco, who waits at his bus shelter. Each has a simple
// mind (wander, flee, charge, stalk, flank), a body that walks on the blocks, and what it gives when hunted.
// The valley is a sanctuary: no creature here can enter it, at any depth (docs/PLAN.md).

import { B_SOLID, isWaterId } from '../world/blocks.ts';
import { inSanctuary } from '../gen/layout.ts';

export type Kind = 'rabbit' | 'deer' | 'boar' | 'puma' | 'dog' | 'coyote' | 'chicken' | 'marco' | 'lookout' | 'gunman' | 'rusher' | 'jaguar';

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
  // Zone-1's near band (docs/PHASE4.md).
  dog: { hp: 22, width: 0.6, height: 0.75, walk: 1.6, run: 6, shy: 0, hostile: true, damage: 8, windup: 0.5, drops: [['hide', 1], ['bone', 1]] },
  coyote: { hp: 16, width: 0.55, height: 0.7, walk: 2, run: 6.4, shy: 0, hostile: true, damage: 6, windup: 0.55, drops: [['hide', 1]] },
  chicken: { hp: 4, width: 0.35, height: 0.5, walk: 0.7, run: 3.2, shy: 4, hostile: false, damage: 0, windup: 0, drops: [['chicken_raw', 1], ['feather', 2]] },
  marco: { hp: 1e9, width: 0.6, height: 1.85, walk: 1.2, run: 1.2, shy: 0, hostile: false, damage: 0, windup: 0, drops: [] },
  // Zone-1's mid band (docs/PHASE5.md): the outpost's three raiders and the hunting camp's jaguar. A gun's
  // `windup` is its aim, the warning before the shot.
  lookout: { hp: 40, width: 0.6, height: 1.85, walk: 1.2, run: 1.2, shy: 0, hostile: true, damage: 18, windup: 1.5, drops: [['raider_rifle', 1], ['rifle_rounds', 10]] },
  gunman: { hp: 40, width: 0.6, height: 1.85, walk: 1.2, run: 1.2, shy: 0, hostile: true, damage: 12, windup: 1.0, drops: [['pistol', 1], ['pistol_rounds', 8]] },
  rusher: { hp: 45, width: 0.6, height: 1.85, walk: 1.5, run: 4.6, shy: 0, hostile: true, damage: 14, windup: 0.7, drops: [['machete', 1]] },
  jaguar: { hp: 90, width: 0.85, height: 1.0, walk: 2.0, run: 7.5, shy: 0, hostile: true, damage: 22, windup: 0.55, drops: [['jaguar_pelt', 1]] },
};

/** The outpost's three raiders: people, not game, but hostile. */
export const RAIDER_KINDS: ReadonlySet<Kind> = new Set<Kind>(['lookout', 'gunman', 'rusher']);

/** Kinds that hunt as a pack, each from its own side (docs/PHASE4.md, "The flank"). */
export const PACK_KINDS: ReadonlySet<Kind> = new Set<Kind>(['dog', 'coyote']);
/** The side each member of a pack takes round the player, by its place in the pack: left, right, behind. */
export const FLANK_SIDES = [-1.25, 1.25, Math.PI];
/** How far from the player a pack member circles before it closes in. */
export const FLANK_RADIUS = 4;
/** A den's dogs come out when the player is this near their home, by day and by night. */
export const DEN_RANGE = { day: 12, night: 30 };

export type Mind = 'wander' | 'flee' | 'charge' | 'stalk' | 'windup' | 'recover' | 'flank'
  // The raiders (src/entity/outpost.ts) and the jaguar's one crossing (src/entity/jaguar.ts).
  | 'watch' | 'notice' | 'alerted' | 'aim' | 'cross' | 'stare' | 'leave';

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
  /** Its place in a pack (which side it flanks from), or -1. */
  pack: number;
  /** Where it lives and keeps near (a den, a farmyard), or null to roam. */
  home: [number, number] | null;
  /** The pack's bearing from the player when it noticed them: the sides are taken round this. */
  flankBase: number;
  /** Seconds a hurt animal still fights back wherever the player is (a dog shot from afar comes for them). */
  angry: number;
  /** A raider's post (feet, and the way he watches), which he keeps to. */
  post?: { x: number; y: number; z: number; yaw: number };
  /** Seconds left held in a leghold trap (it can't move); below 0, seconds before a trap can take it again. */
  held?: number;
}

/** Medium game a leghold trap holds (DESIGN.md: deer and boar). */
export const TRAPPABLE: ReadonlySet<Kind> = new Set<Kind>(['deer', 'boar']);

type BlockAt = (x: number, y: number, z: number) => number;

let nextId = 1;

export function makeCreature(kind: Kind, x: number, y: number, z: number): Creature {
  return { id: nextId++, kind, x, y, z, vx: 0, vy: 0, vz: 0, yaw: Math.random() * Math.PI * 2, hp: KINDS[kind].hp, mind: 'wander', timer: 0, goalX: x, goalZ: z, onGround: false, stride: 0, hurt: 9, pack: -1, home: null, flankBase: 0, angry: 0 };
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
export function moveBody(c: Creature, dt: number, blockAt: BlockAt): void {
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
  /** How fast the player is moving (m/s): a running target is harder to hit. */
  pv?: number;
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
  c.angry = Math.max(0, c.angry - dt);
  const dx = s.px - c.x, dz = s.pz - c.z;
  const dist = Math.hypot(dx, dz);
  const reachable = !s.playerInSanctuary && Math.abs(s.py - c.y) < 3;
  let hit: Hit | null = null;

  // Caught in a leghold: it struggles where it stands until the trap lets it go.
  if (c.held !== undefined && c.held > 0) {
    c.held -= dt;
    if (c.held <= 0) c.held = -30;
    c.vx = c.vz = 0;
    c.yaw += Math.sin(c.timer * 7) * 0.02;
    moveBody(c, dt, blockAt);
    return null;
  }
  if (c.held !== undefined && c.held < 0) c.held = Math.min(0, c.held + dt);

  // Marco stands where he is and turns to whoever comes near.
  if (c.kind === 'marco') {
    c.vx = c.vz = 0;
    if (dist < 14 && dist > 0.1) c.yaw = Math.atan2(-dx, -dz);
    moveBody(c, dt, blockAt);
    return null;
  }

  // A pack notices the player: dogs when the player comes near their den (wider at night), coyotes
  // anywhere near. Each member then takes its own side round the player.
  const pack = PACK_KINDS.has(c.kind);
  if (pack && reachable && c.mind === 'wander') {
    const range = c.home ? (s.night ? DEN_RANGE.night : DEN_RANGE.day) : 30;
    const near = c.home ? Math.hypot(s.px - c.home[0], s.pz - c.home[1]) < range : dist < range;
    if (near) {
      c.mind = 'flank'; c.timer = 7;
      c.flankBase = c.home ? Math.atan2(c.home[1] - s.pz, c.home[0] - s.px) : Math.atan2(c.z - s.pz, c.x - s.px);
    }
  }
  // A dog won't follow far from its den: past its range (and a little more) it goes home.
  if (pack && c.home && c.angry <= 0 && (c.mind === 'flank' || c.mind === 'charge' || c.mind === 'recover')) {
    const range = (s.night ? DEN_RANGE.night : DEN_RANGE.day) + 14;
    if (Math.hypot(s.px - c.home[0], s.pz - c.home[1]) > range) { c.mind = 'wander'; c.timer = 0; }
  }
  if (pack && !reachable && c.mind === 'flank') { c.mind = 'wander'; c.timer = 0; }

  // Changes of mind.
  if (d.shy && dist < d.shy && c.mind !== 'flee') { c.mind = 'flee'; c.timer = 3 + rand() * 2; }
  if (s.shot && dist < 60 && c.kind !== 'puma' && c.kind !== 'jaguar') { c.mind = d.hostile && dist < 12 ? 'charge' : 'flee'; c.timer = 4; }
  if (d.hostile && reachable) {
    if (c.kind === 'boar' && dist < 4 && (c.mind === 'wander')) { c.mind = 'charge'; c.timer = 8; }
    if (c.kind === 'puma' && s.night && c.mind === 'wander' && dist < 40) { c.mind = 'stalk'; c.timer = 30; }
    // A provoked jaguar comes for you wherever you are within reach of it.
    if (c.kind === 'jaguar' && c.angry > 0 && c.mind === 'wander' && dist < 60) { c.mind = 'charge'; c.timer = 10; }
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
        // Creatures with a home keep to it: dogs lie up in their den by day and range out at night;
        // chickens scratch round their yard.
        if (c.home) {
          const keep = c.kind === 'dog' ? (s.night ? 22 : 2.5) : 9;
          const ha = rand() * Math.PI * 2, hr = rand() * keep;
          c.goalX = c.home[0] + Math.cos(ha) * hr; c.goalZ = c.home[1] + Math.sin(ha) * hr;
        }
        c.timer = 2 + rand() * 6;
        if (rand() < 0.4 && (!c.home || Math.hypot(c.x - c.home[0], c.z - c.home[1]) < 25)) { c.goalX = c.x; c.goalZ = c.z; }
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
      if ((dist > 25 && c.angry <= 0) || dist > 60 || c.timer <= 0) { c.mind = c.angry > 0 ? 'charge' : 'wander'; c.timer = c.angry > 0 ? 6 : 0; }
      break;
    case 'flank': {
      // Circle to this member's own side of the player, a few metres off, then close in.
      const a = c.flankBase + FLANK_SIDES[Math.max(0, c.pack) % FLANK_SIDES.length];
      const gx = s.px + Math.cos(a) * FLANK_RADIUS, gz = s.pz + Math.sin(a) * FLANK_RADIUS;
      toX = gx - c.x; toZ = gz - c.z; speed = d.run;
      if (Math.hypot(toX, toZ) < 1.2 || c.timer <= 0) { c.mind = 'charge'; c.timer = 6; }
      if (dist > 40) { c.mind = 'wander'; c.timer = 0; }
      break;
    }
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
      // A pack circles round again to its sides; the puma stalks; the boar charges.
      if (c.timer <= 0) { c.mind = c.kind === 'puma' ? 'stalk' : pack ? 'flank' : 'charge'; c.timer = pack ? 5 : 8; }
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
  if (c.kind === 'marco') return false; // a person, not game
  if (c.kind === 'jaguar') c.angry = 60; // provoked: the fight is real
  c.hp -= damage;
  c.hurt = 0;
  if (c.hp <= 0) return true;
  if (c.kind === 'boar') { c.mind = 'charge'; c.timer = 8; }
  else if (PACK_KINDS.has(c.kind)) { c.angry = 20; if (c.mind === 'wander') { c.mind = 'charge'; c.timer = 8; } }
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
