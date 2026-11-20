// The Ashen (docs/PHASE7.md, 2): the people of the industrial river, changed by the pathogen eight years ago.
// Light decides what one is: in daylight or a lamp's pool it is dull (slow, half blind); in the dark it is
// keen (fast, and it sees all round). Out of the dark it sees poorly into light: someone standing in daylight
// or under a lamp it sees only from close. It hears running and gunshots through walls, a walk or a pick only
// with nothing solid between. Its one attack is a lunge,
// always telegraphed: it stops, rears and shrieks, then throws itself three metres the way it was facing;
// step back or aside and it misses and stumbles. Never more than three hunt at once.
// The rules that hold: nothing here spawns, walks, sees or lunges into the sanctuary; Ashen ground is Zone-3
// west of the gorge, so they never step onto the dam, a bridge the player builds, or the other zones.
// Zone-4 (docs/PHASE8.md) has one nest more, in the relay station's battery hall, and the yard round it is
// theirs too. A burning smoke pot is ground they will not step into, and walk out of.

import { ZONE3, ZONE4, ravineX, zoneAt, inSanctuary, zone3Floor, zone4Floor } from '../gen/layout.ts';
import { B_SOLID } from '../world/blocks.ts';
import { makeCreature, moveBody, canSee, KINDS, STRIKE_HEIGHT, type Creature, type Mind, type Senses } from './creatures.ts';

type BlockAt = (x: number, y: number, z: number) => number;

/** Below this light (0–15) where it stands, an Ashen is keen. */
export const LIGHT_KEEN = 7;
export interface Temper { sight: number; cone: number; hearSprint: number; hearWalk: number; hearMine: number; speed: number; windup: number; damage: number }
/** Dull: in daylight or lamplight. It sees a little way, only in front; hears running and mining. */
export const DULL: Temper = { sight: 6, cone: (60 * Math.PI) / 180, hearSprint: 16, hearWalk: 0, hearMine: 8, speed: KINDS.ashen.walk, windup: KINDS.ashen.windup, damage: KINDS.ashen.damage };
/** Keen: in the dark. It sees far, all round; hears a walk; faster than a walk, slower than a sprint. */
export const KEEN: Temper = { sight: 20, cone: Math.PI, hearSprint: 24, hearWalk: 8, hearMine: 10, speed: KINDS.ashen.run, windup: 0.6, damage: 24 };
/** From the dark it is dazzled by light: a player standing in light is seen only this near (as a dull one sees). */
export const DAZZLED = DULL.sight;
/** Once it is hunting, it keeps track of a player in plain view this far off, dull or keen. */
export const HUNT_SIGHT = 16;
/** How far a gunshot is heard, and a suppressed one. */
export const SHOT_HEARD = 70;
export const QUIET_SHOT_HEARD = 12;
/** The lunge: begun within this distance, this long, this quick; it lands within this reach of the body. */
export const LUNGE_FROM = 3.5;
export const LUNGE_LENGTH = 3;
export const LUNGE_SECONDS = 0.3;
export const LUNGE_REACH = 1.1;
/** After a miss it stands bent this long (the opening); after a hit, this long. */
export const STUMBLE = 1.6;
export const AFTER_HIT = 1.2;
/** How long it must sense you before it comes (a rattle first). */
export const NOTICE = 0.7;
/** It gives up this far from its nest, or after this long with no sight or sound of you. */
export const LEASH = 45;
export const LOSE_SECONDS = 12;
/** By night it wanders this far from its nest's door. */
export const ROAM = 14;
/** Never more than this many hunt at once: the others only watch. */
export const MAX_HUNTING = 3;
/** They are about while the player is this near a nest, and gone again this far off. */
export const ASHEN_NEAR = 120;
export const ASHEN_FAR = 180;

const HUNTING: ReadonlySet<Mind> = new Set<Mind>(['charge', 'windup', 'lunge', 'recover']);
export const isHunting = (c: Creature): boolean => c.kind === 'ashen' && HUNTING.has(c.mind);

export interface AshenSenses extends Senses {
  /** The light where a body stands, 0–15: the brighter of the daylight reaching it and lamplight. */
  lightAt: (x: number, y: number, z: number) => number;
  /** Is the player mining (a pick on rock carries, where nothing solid is between)? */
  mining?: boolean;
  /** Smoke pots burning now: ground no Ashen steps into, and walks out of (docs/PHASE8.md, 4). */
  smoke?: Smoke[];
}
export interface Smoke { x: number; z: number; r: number }

/** Every nest: Zone-3's five, then the relay station's on the ridge (appended, so the bits saved for Zone-3's stay theirs). */
export const NESTS = [...ZONE3.nests, ZONE4.nest];
/** How far from the relay's nest the ridge is theirs: the yard and the slope round it. */
export const RELAY_GROUND = 50;

export interface AshenState {
  /** Which Ashen are down until dawn (a bit each); saved. */
  down: number;
  /** The first sight: by day one stands out in the road until the player has seen it. */
  firstOut: boolean;
}
export function newAshen(): AshenState { return { down: 0, firstOut: true }; }

export type AshenEvent = { kind: 'notice' | 'shriek' | 'lunge' | 'miss' | 'breath' | 'step'; c: Creature } | { kind: 'hit'; c: Creature; damage: number };

/** One Ashen's place: its nest, which of the nest's it is, and its bit in `down`. */
export interface Slot { bit: number; nest: number; k: number }
export const SLOTS: Slot[] = [];
NESTS.forEach((n, i) => { for (let k = 0; k < n.n; k++) SLOTS.push({ bit: 1 << SLOTS.length, nest: i, k }); });
export const ALL_ASHEN = SLOTS.reduce((m, s) => m | s.bit, 0);

/** The floor's height at a nest: the building's floor, or the mine's drift. */
export function nestFloor(i: number): number {
  const n = NESTS[i];
  if (n === ZONE4.nest) return zone4Floor.tower;
  if (n.under) return zone3Floor.yard - ZONE3.mine.depth;
  return n.name === 'powerhouse' ? zone3Floor.powerhouse : n.name === 'shop' ? zone3Floor.shop : n.name === 'foundry' ? zone3Floor.foundry : zone3Floor.yard;
}

/**
 * Ashen ground: Zone-3, west of the river's gorge, and on the ridge the ground round the relay station. Never
 * the sanctuary, never over the gorge (so not the dam, nor a bridge the player builds), never the dam's own west end.
 */
export function ashenGround(x: number, z: number): boolean {
  if (inSanctuary(x, z)) return false;
  // On the ridge: round the relay station only, and never the pass's clean ground.
  const r = ZONE4.nest;
  if (zoneAt(x, z) === 'zone4') return Math.hypot(x - r.x, z - r.z) < RELAY_GROUND && Math.hypot(x - ZONE4.clean.x, z - ZONE4.clean.z) > ZONE4.clean.r + 2;
  if (zoneAt(x, z) !== 'zone3') return false;
  if (x >= ravineX(z) - 26) return false;
  const d = ZONE3.dam;
  return !(x >= d.x0 - 1 && Math.abs(z - d.z) < 6);
}

const bearing = (ax: number, az: number, bx: number, bz: number) => Math.atan2(-(bx - ax), -(bz - az));
const angleDiff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/** Is this Ashen keen now: does it stand in the dark? */
export function keenAt(c: Creature, s: AshenSenses): boolean {
  return s.lightAt(Math.floor(c.x), Math.floor(c.y + 1), Math.floor(c.z)) < LIGHT_KEEN;
}

/** Does it see or hear the player now? `hunting`: it already knows you are there. */
export function ashenSenses(c: Creature, s: AshenSenses, keen: boolean, hunting: boolean, blockAt: BlockAt): 'seen' | 'heard' | null {
  if (s.playerInSanctuary) return null;
  const t = keen ? KEEN : DULL;
  const dist = Math.hypot(s.px - c.x, s.pz - c.z), dy = Math.abs(s.py - c.y);
  // Running carries through walls. A walk or a pick is heard only where nothing solid stands between.
  if (s.sprint && dist < t.hearSprint && dy < 10) return 'heard';
  const quiet = Math.max((s.pv ?? 0) > 1 && !s.sprint ? t.hearWalk : 0, s.mining ? t.hearMine : 0);
  let clear: boolean | null = null;
  const inLine = () => (clear ??= canSee(c, s, blockAt) || canSee(c, { ...s, py: s.py + 0.45 }, blockAt));
  if (dist < quiet && dy < 10 && inLine()) return 'heard';
  // Sight. From the dark, someone standing in light is seen only from close: the bright road outside a dark
  // bay door, the lamps' pools at night, the lit half of a building.
  let sight = t.sight;
  if (keen && s.lightAt(Math.floor(s.px), Math.floor(s.py + 1), Math.floor(s.pz)) >= LIGHT_KEEN) sight = DAZZLED;
  if (hunting) sight = Math.max(sight, HUNT_SIGHT);
  if (dist > sight || dy > 12) return null;
  if (!hunting && !keen && angleDiff(bearing(c.x, c.z, s.px, s.pz), c.yaw) > t.cone) return null;
  return inLine() ? 'seen' : null;
}

/** Is the straight line from the player's eyes to a point clear of solid blocks? */
function playerSees(s: Senses, x: number, y: number, z: number, blockAt: BlockAt): boolean {
  const ax = s.px, ay = s.py + 1.6, az = s.pz;
  const n = Math.ceil(Math.hypot(x - ax, y - ay, z - az) / 0.2);
  for (let k = 1; k < n; k++) {
    const t = k / n;
    if (B_SOLID[blockAt(Math.floor(ax + (x - ax) * t), Math.floor(ay + (y - ay) * t), Math.floor(az + (z - az) * t))]) return false;
  }
  return true;
}
/** How near the player may be to an Ashen (and to its nest) for it to slip home unseen, with walls between. */
export const SLIP_BEHIND_WALLS = 10;
/** And with nothing between: only from this far off. */
export const SLIP_OPEN = 30;

/** Is the straight line at walking height from a body to (x, z) clear of solid blocks? */
function lineClear(c: Creature, x: number, z: number, blockAt: BlockAt): boolean {
  const n = Math.ceil(Math.hypot(x - c.x, z - c.z) / 0.4);
  for (let k = 1; k < n; k++) {
    const t = k / n, bx = Math.floor(c.x + (x - c.x) * t), bz = Math.floor(c.z + (z - c.z) * t);
    if (B_SOLID[blockAt(bx, Math.floor(c.y + 1.2), bz)] && B_SOLID[blockAt(bx, Math.floor(c.y + 2.2), bz)]) return false;
  }
  return true;
}

/** Where on its way out of its dark room this Ashen is: the first point it can walk straight to (0: the nest itself). */
function findLeg(c: Creature, blockAt: BlockAt): number {
  const n = NESTS[c.nest ?? 0];
  if (lineClear(c, n.x, n.z, blockAt) && Math.hypot(c.x - n.x, c.z - n.z) < 30) return 0;
  for (let i = 0; i < n.path.length; i++) if (lineClear(c, n.path[i][0], n.path[i][1], blockAt)) return i + 1;
  return n.path.length;
}

/**
 * One step of an Ashen's mind. `others`: how many other Ashen are hunting now. Returns what happened
 * (sounds to play, a blow that landed).
 */
export function thinkAshen(c: Creature, dt: number, s: AshenSenses, others: number, blockAt: BlockAt, rand: () => number): AshenEvent[] {
  if (c.kind !== 'ashen') return [];
  const ev: AshenEvent[] = [];
  const nest = NESTS[c.nest ?? 0], path = nest.path;
  c.hurt += dt;
  c.timer -= dt;
  const keen = keenAt(c, s), t = keen ? KEEN : DULL;
  if (c.mind !== 'windup' && c.mind !== 'lunge') c.keen = keen; // a lunge is as it began
  const dx = s.px - c.x, dz = s.pz - c.z, dist = Math.hypot(dx, dz);
  const hunting = HUNTING.has(c.mind);
  const sensed = ashenSenses(c, s, keen, hunting, blockAt);
  const face = () => { if (dist > 0.05) c.yaw = bearing(c.x, c.z, s.px, s.pz); };
  let toX = 0, toZ = 0, speed = 0;
  const walkTo = (x: number, z: number, v: number): boolean => {
    toX = x - c.x; toZ = z - c.z; speed = v;
    return Math.hypot(toX, toZ) < 0.8;
  };
  /** A step out of its room along its path; true once it is outside. */
  const goOut = (v: number): boolean => {
    const leg = c.leg ?? 0;
    if (leg >= path.length) return true;
    if (walkTo(path[leg][0], path[leg][1], v)) c.leg = leg + 1;
    return false;
  };
  /** A step back toward its nest; true once it stands there. */
  const goIn = (v: number): boolean => {
    const leg = c.leg ?? 0;
    if (leg > 0) { if (walkTo(path[leg - 1][0], path[leg - 1][1], v)) c.leg = leg - 1; return false; }
    const [hx, hz] = c.home ?? [nest.x, nest.z];
    return walkTo(hx, hz, v);
  };
  const giveUp = () => { c.mind = 'wander'; c.timer = 0; c.lost = 0; c.post = undefined; c.leg = findLeg(c, blockAt); };

  switch (c.mind) {
    case 'wander': {
      if (sensed) { c.mind = 'notice'; c.timer = NOTICE; face(); ev.push({ kind: 'notice', c }); break; }
      // The first one stands out in the road, its back to the dam, until something moves it.
      // (By night it is one of the others: it roams, and at dawn goes in.)
      if (c.post && s.night) { c.post = undefined; c.goalX = c.x; c.goalZ = c.z; c.timer = 0; }
      if (c.post) { c.yaw = c.post.yaw + 0.12 * Math.sin((c.goalX += dt * 0.5)); break; }
      const roam = s.night && !nest.under;
      if (!roam) {
        // By day (and always underground) it keeps to its dark place, and sways there.
        c.lost = (c.lost ?? 0) + dt;
        if (goIn(1.6)) { speed = 0; c.lost = 0; c.yaw += 0.25 * dt * Math.sin((c.goalZ += dt * 0.4)); }
        else if (c.lost > 40) {
          // Stuck on the way (it has no path-finding): it slips back unseen. Only when the player can see
          // neither it nor its nest: far from both, or nearer with walls between.
          const [hx, hz] = c.home ?? [nest.x, nest.z], hy = nestFloor(c.nest ?? 0);
          const near = Math.min(dist, Math.hypot(s.px - hx, s.pz - hz));
          if (near > SLIP_OPEN || (near > SLIP_BEHIND_WALLS && !playerSees(s, c.x, c.y + 1.5, c.z, blockAt) && !playerSees(s, hx, hy + 1.5, hz, blockAt))) {
            c.x = hx; c.z = hz; c.y = hy; c.leg = 0; c.lost = 0;
          }
        }
        break;
      }
      // By night it comes out and wanders round its door, between the lamps.
      if (!goOut(1.4)) break;
      const [ox, oz] = path[path.length - 1];
      if (c.timer <= 0) {
        const a = rand() * Math.PI * 2, r = 2 + rand() * (ROAM - 2);
        c.goalX = ox + Math.cos(a) * r; c.goalZ = oz + Math.sin(a) * r;
        if (!ashenGround(c.goalX, c.goalZ) || inSmoke(s, c.goalX, c.goalZ) || rand() < 0.35) { c.goalX = c.x; c.goalZ = c.z; }
        c.timer = 4 + rand() * 7;
      }
      if (!walkTo(c.goalX, c.goalZ, 1.2)) break;
      speed = 0;
      break;
    }
    case 'notice':
      // It has heard or seen something: the head comes up, the rattle. If you are still there when the moment's up, it comes.
      if (sensed) face();
      if (c.timer <= 0) {
        if (!sensed) { c.mind = 'wander'; c.timer = 0; }
        else if (others < MAX_HUNTING) { c.mind = 'charge'; c.lost = 0; c.post = undefined; }
        else c.timer = 1; // three are already on you: this one only watches
      }
      break;
    case 'seek': {
      // Going to where a noise was. It finds you only if it then sees or hears you.
      if (sensed) { c.mind = 'notice'; c.timer = NOTICE; face(); ev.push({ kind: 'notice', c }); break; }
      c.lost = (c.lost ?? 0) + dt;
      c.post = undefined;
      if (!goOut(t.speed * 0.8)) { if (c.lost > LOSE_SECONDS * 2) giveUp(); break; }
      if (walkTo(c.goalX, c.goalZ, t.speed * 0.8) || Math.hypot(c.goalX - c.x, c.goalZ - c.z) < 2.5 || c.lost > LOSE_SECONDS) giveUp();
      break;
    }
    case 'charge': {
      c.lost = sensed ? 0 : (c.lost ?? 0) + dt;
      const far = Math.hypot(c.x - nest.x, c.z - nest.z) > LEASH;
      if (s.playerInSanctuary || c.lost > LOSE_SECONDS || (far && dist > LUNGE_FROM)) { giveUp(); break; }
      // Straight at you when it can see you or is out in the open; else out of its room first.
      const sees = sensed === 'seen' || lineClear(c, s.px, s.pz, blockAt);
      if (sees || (c.leg ?? 0) >= path.length) { toX = dx; toZ = dz; speed = t.speed; }
      else goOut(t.speed);
      if (dist < LUNGE_FROM && Math.abs(s.py - c.y) < STRIKE_HEIGHT && canSee(c, s, blockAt)) {
        // The warning: it stops, rears, arms wide, and shrieks. The lunge will go where you stand now.
        c.mind = 'windup'; c.timer = t.windup; c.keen = keen; speed = 0;
        face();
        const len = dist || 1;
        c.goalX = dx / len; c.goalZ = dz / len;
        ev.push({ kind: 'shriek', c });
      }
      break;
    }
    case 'windup':
      if (c.timer <= 0) { c.mind = 'lunge'; c.timer = LUNGE_SECONDS; ev.push({ kind: 'lunge', c }); }
      break;
    case 'lunge': {
      // Thrown forward along the line it chose. It lands only on a player still in its way.
      const v = LUNGE_LENGTH / LUNGE_SECONDS;
      toX = c.goalX; toZ = c.goalZ; speed = v;
      if (!s.playerInSanctuary && dist < LUNGE_REACH + KINDS.ashen.width / 2 && Math.abs(s.py - c.y) < STRIKE_HEIGHT && canSee(c, s, blockAt)) {
        ev.push({ kind: 'hit', c, damage: (c.keen ? KEEN : DULL).damage });
        c.mind = 'recover'; c.timer = AFTER_HIT; speed = 0;
      } else if (c.timer <= 0) { ev.push({ kind: 'miss', c }); c.mind = 'recover'; c.timer = STUMBLE; speed = 0; }
      break;
    }
    case 'recover':
      // Bent over, open: the moment to strike or to leave.
      if (c.timer <= 0) { c.mind = 'charge'; c.lost = 0; }
      break;
    default:
      c.mind = 'wander'; c.timer = 0;
  }

  // Smoke: one standing in a burning pot's smoke leaves off whatever it was at and walks straight out of it.
  const pot = (s.smoke ?? []).find((p) => Math.hypot(c.x - p.x, c.z - p.z) < p.r);
  if (pot && c.mind !== 'lunge' && c.mind !== 'windup') {
    if (HUNTING.has(c.mind) || c.mind === 'notice' || c.mind === 'seek') { c.mind = 'wander'; c.timer = 3; c.lost = 0; c.post = undefined; }
    const ax = c.x - pot.x, az = c.z - pot.z, al = Math.hypot(ax, az);
    toX = al > 0.05 ? ax / al : 1; toZ = al > 0.05 ? az / al : 0; speed = DULL.speed;
    c.goalX = c.x + toX * 3; c.goalZ = c.z + toZ * 3;
  }
  // The body: never a step off Ashen ground (the dam, a bridge, the other zones), never into the sanctuary,
  // never deeper into smoke.
  const len = Math.hypot(toX, toZ);
  if (len > 0.01 && speed > 0) {
    const ux = toX / len, uz = toZ / len, nx = c.x + ux * 0.7, nz = c.z + uz * 0.7;
    const deeper = (s.smoke ?? []).some((p) => { const d = Math.hypot(nx - p.x, nz - p.z); return d < p.r && d < Math.hypot(c.x - p.x, c.z - p.z); });
    if (deeper && c.mind === 'lunge') { c.mind = 'recover'; c.timer = STUMBLE; }
    if (!ashenGround(nx, nz) || deeper) speed = 0;
    else if (c.mind !== 'lunge' && c.mind !== 'windup') c.yaw = Math.atan2(-ux, -uz);
  }
  const want = len > 0.01 ? speed / len : 0;
  if (c.mind === 'lunge') { c.vx = toX * want; c.vz = toZ * want; }
  else { const k = Math.min(1, dt * 8); c.vx += (toX * want - c.vx) * k; c.vz += (toZ * want - c.vz) * k; }
  if (c.mind === 'windup' || c.mind === 'recover' || c.mind === 'notice') c.vx = c.vz = 0;
  const timer = c.timer;
  moveBody(c, dt, blockAt);
  if (c.mind !== 'wander') c.timer = timer; // a wall ends a wander's leg, not a wind-up or a stumble
  if (!ashenGround(c.x, c.z) && c.mind !== 'wander') giveUp();
  // Bare feet on the road as it comes: each footfall of a hunting one is heard (and, in the dark, raises ash).
  const strides = Math.floor(c.stride / Math.PI);
  c.stride += Math.hypot(c.vx, c.vz) * dt * 3;
  if (c.mind === 'charge' && Math.floor(c.stride / Math.PI) !== strides) ev.push({ kind: 'step', c });
  // A dry breath now and then while it stands unaware: the warning that one is near.
  if ((c.mind === 'wander' || c.mind === 'seek') && rand() < dt / 5) ev.push({ kind: 'breath', c });
  return ev;
}

/** Is (x, z) in the smoke of a burning pot? */
export function inSmoke(s: { smoke?: Smoke[] }, x: number, z: number): boolean {
  return (s.smoke ?? []).some((p) => Math.hypot(x - p.x, z - p.z) < p.r);
}

/** Is an Ashen hunting within `r` m of (x, z)? Then hold H does nothing: it is no escape from them (docs/PHASE7.md). */
export function ashenOn(creatures: Creature[], x: number, z: number, r = 30): boolean {
  return creatures.some((c) => isHunting(c) && Math.hypot(c.x - x, c.z - z) < r);
}

/** Hurt, or shot at: it turns on the player if it may hunt, else comes to where the blow came from. */
export function provokeAshen(c: Creature, px: number, pz: number, others: number): void {
  if (c.kind !== 'ashen' || HUNTING.has(c.mind)) return;
  c.post = undefined;
  if (others < MAX_HUNTING && ashenGround(px, pz)) { c.mind = 'charge'; c.lost = 0; }
  else { c.mind = 'seek'; c.goalX = px; c.goalZ = pz; c.lost = 0; }
}

/** A noise at (x, z) heard within `range`: every Ashen not already hunting comes to look. */
export function ashenHear(creatures: Creature[], x: number, z: number, range: number): void {
  for (const c of creatures) {
    if (c.kind !== 'ashen' || HUNTING.has(c.mind) || Math.hypot(c.x - x, c.z - z) > range) continue;
    c.mind = 'seek'; c.goalX = x; c.goalZ = z; c.lost = 0; c.post = undefined;
  }
}

/** The Ashen who should be about and aren't: each in its nest (or, the first time by day, one out in the road). */
export function manAshen(creatures: Creature[], st: AshenState, px: number, pz: number, night: boolean, loaded: (x: number, z: number) => boolean, floorAt: (x: number, y: number, z: number) => number | null): Creature[] {
  const made: Creature[] = [];
  for (const q of SLOTS) {
    if (st.down & q.bit || creatures.some((c) => c.kind === 'ashen' && c.squad === q.bit)) continue;
    const n = NESTS[q.nest];
    if (Math.hypot(px - n.x, pz - n.z) > ASHEN_NEAR || !loaded(n.x, n.z)) continue;
    const first = q.bit === 1 && st.firstOut && !night;
    const f = ZONE3.firstAshen;
    const x = first ? f.x : n.x + (q.k ? 0.9 : -0.2), z = first ? f.z : n.z + (q.k ? -1.1 : 0.4);
    if (first && !loaded(x, z)) continue;
    if (!ashenGround(x, z)) continue;
    const y = floorAt(x, first ? zone3Floor.powerhouse : nestFloor(q.nest), z);
    if (y === null) continue;
    const c = makeCreature('ashen', x, y, z);
    c.squad = q.bit;
    c.nest = q.nest;
    c.leg = first ? n.path.length : 0;
    c.goalX = 0; c.goalZ = 0;
    c.home = [n.x + (q.k ? 0.9 : -0.2), n.z + (q.k ? -1.1 : 0.4)];
    c.yaw = q.k ? 1.9 : 4.4;
    if (first) { c.post = { x, y, z, yaw: Math.PI }; c.yaw = Math.PI; }
    made.push(c);
  }
  return made;
}

/** Those far from the player are let go (not killed: they are in their nests again when the player returns). */
export function standDownAshen(creatures: Creature[], px: number, pz: number): Creature[] {
  return creatures.filter((c) => {
    if (c.kind !== 'ashen') return true;
    const n = NESTS[c.nest ?? 0];
    return Math.min(Math.hypot(px - n.x, pz - n.z), Math.hypot(px - c.x, pz - c.z)) < ASHEN_FAR;
  });
}

/** A new day: others have drifted in for those killed. */
export function ashenDawn(st: AshenState): void { st.down = 0; }
