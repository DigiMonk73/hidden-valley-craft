// The raiders' outpost (docs/PHASE5.md, step 4): three raiders at their posts, a lookout on the roof with a
// rifle, a pistol behind the sandbags, a machete in the doorway. A first human fight, small and slow:
// - they know you are there only once they have seen you (the lookout watches the road to the east);
// - every shot comes after an aim you can see and hear, and lands only if the raider can still see you
//   when it goes off: a solid block between you is cover;
// - killed raiders stay dead (the game saves which are left): the outpost is a one-time fight.
// The sanctuary rule holds: nobody here moves into, sees into or shoots into the valley.

import { B_SOLID } from '../world/blocks.ts';
import { inSanctuary } from '../gen/layout.ts';
import { POSTS, OUTPOST_AT } from '../gen/zone1far.ts';
import { makeCreature, moveBody, canSee, KINDS, RAIDER_KINDS, STRIKE_HEIGHT, type Creature, type Kind, type Senses } from './creatures.ts';

type BlockAt = (x: number, y: number, z: number) => number;

/** Which raider each bit of `left` stands for. */
export const RAIDER_BIT: Record<'lookout' | 'gunman' | 'rusher', number> = { lookout: 1, gunman: 2, rusher: 4 };
export const ALL_RAIDERS = 7;
const POST_OF = { lookout: POSTS.lookout, gunman: POSTS.pistol, rusher: POSTS.machete };

/** How far each sees you: before the alarm, and after it. The lookout, before it, only looks east. */
export const SIGHT: Record<'lookout' | 'gunman' | 'rusher', [number, number]> = { lookout: [45, 60], gunman: [25, 35], rusher: [14, 40] };
/** Half the lookout's field of view before the alarm, either side of the way he faces (the road east). */
export const LOOKOUT_CONE = (70 * Math.PI) / 180;
/** How long a raider must see you to raise the alarm (a turn of the head first). */
export const NOTICE = 0.8;
/** Seconds between a gun raider's shots, after the aim. */
export const COOLDOWN: Record<'lookout' | 'gunman', number> = { lookout: 3, gunman: 2.2 };
/** The players are this near the outpost for its raiders to be at their posts. */
export const OUTPOST_NEAR = 110;

export interface OutpostState {
  /** Which raiders are still alive (bits of RAIDER_BIT); saved. */
  left: number;
  /** Has the outpost been alerted (until the player goes away and its raiders stand down)? */
  alert: boolean;
}

export type RaiderEvent =
  | { kind: 'notice' | 'shout' | 'aim' | 'swing'; c: Creature }
  | { kind: 'shot'; c: Creature; hit: boolean; damage: number; cover: [number, number, number] | null }
  | { kind: 'blow'; c: Creature; damage: number };

const isRaider = (k: Kind): k is 'lookout' | 'gunman' | 'rusher' => RAIDER_KINDS.has(k);

/** The raiders still alive who are not about: each at his post, if the land there is loaded. */
export function manOutpost(creatures: Creature[], st: OutpostState, px: number, pz: number, loaded: (x: number, z: number) => boolean): Creature[] {
  if (Math.hypot(px - OUTPOST_AT[0], pz - OUTPOST_AT[1]) > OUTPOST_NEAR || !loaded(OUTPOST_AT[0], OUTPOST_AT[1])) return [];
  const made: Creature[] = [];
  for (const kind of ['lookout', 'gunman', 'rusher'] as const) {
    if (!(st.left & RAIDER_BIT[kind]) || creatures.some((c) => c.kind === kind)) continue;
    const p = POST_OF[kind];
    if (inSanctuary(p.x, p.z)) continue;
    // Each stands exactly where he is posted: the lookout on the roof, not on the ground below it.
    const c = makeCreature(kind, p.x, p.y, p.z);
    c.post = { ...p };
    c.yaw = p.yaw;
    c.mind = st.alert ? 'alerted' : 'watch';
    made.push(c);
  }
  return made;
}

/** The bearing a body at (ax, az) must face to look at (bx, bz), in the game's yaw (0 looks north, −z). */
const bearing = (ax: number, az: number, bx: number, bz: number) => Math.atan2(-(bx - ax), -(bz - az));
const angleDiff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/** Can this raider see the player now: in range, in his field of view, nothing solid between? */
export function raiderSees(c: Creature, s: Senses, alert: boolean, blockAt: BlockAt): boolean {
  if (!isRaider(c.kind) || s.playerInSanctuary) return false;
  const dist = Math.hypot(s.px - c.x, s.pz - c.z);
  if (dist > SIGHT[c.kind][alert ? 1 : 0]) return false;
  if (!alert && c.kind === 'lookout' && angleDiff(bearing(c.x, c.z, s.px, s.pz), c.post?.yaw ?? c.yaw) > LOOKOUT_CONE) return false;
  return canSee(c, s, blockAt) || canSee(c, { ...s, py: s.py + 0.45 }, blockAt); // the chest, or the head
}

/** The chance a shot lands on a player it can see: less far off, less on a running target. */
export function hitChance(kind: 'lookout' | 'gunman', dist: number, speed: number): number {
  let p = kind === 'lookout' ? 0.9 - dist / 90 : 0.85 - dist / 40;
  if (speed > 3) p *= 0.6;
  return Math.max(0.1, Math.min(0.9, p));
}

/** Where a bullet from the raider's eye toward the player first meets something solid, or null if it reaches them. */
function firstSolid(c: Creature, s: Senses, blockAt: BlockAt): [number, number, number] | null {
  const ax = c.x, ay = c.y + KINDS[c.kind].height * 0.85, az = c.z, bx = s.px, by = s.py + 1.2, bz = s.pz;
  const n = Math.ceil(Math.hypot(bx - ax, by - ay, bz - az) / 0.2);
  for (let k = 1; k < n; k++) {
    const t = k / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
    if (B_SOLID[blockAt(Math.floor(x), Math.floor(y), Math.floor(z))]) return [x, y, z];
  }
  return null;
}

/**
 * One step of a raider's mind. `st` is the outpost's shared state: one raider raising the alarm alerts
 * them all. Returns what happened (sounds to play, shots to land).
 */
export function thinkRaider(c: Creature, dt: number, s: Senses, st: OutpostState, blockAt: BlockAt, rand: () => number): RaiderEvent[] {
  if (!isRaider(c.kind)) return [];
  const ev: RaiderEvent[] = [];
  const d = KINDS[c.kind];
  c.hurt += dt;
  c.timer -= dt;
  const dist = Math.hypot(s.px - c.x, s.pz - c.z);
  const sees = raiderSees(c, s, st.alert, blockAt);
  const face = () => { c.yaw = bearing(c.x, c.z, s.px, s.pz); };
  if (st.alert && (c.mind === 'watch' || c.mind === 'notice')) { c.mind = 'alerted'; c.timer = 0.3; }
  let toX = 0, toZ = 0, speed = 0;

  switch (c.mind) {
    case 'watch':
      // At his post, unaware. The lookout's gaze sweeps the road slowly.
      if (c.post) c.yaw = c.post.yaw + (c.kind === 'lookout' ? 0.5 * Math.sin(c.goalX += dt * 0.35) : 0);
      if (sees) { c.mind = 'notice'; c.timer = NOTICE; face(); ev.push({ kind: 'notice', c }); }
      break;
    case 'notice':
      // He turns his head: if he still sees you when the moment's up, he shouts.
      if (sees) face();
      if (c.timer <= 0) {
        if (sees) { st.alert = true; c.mind = 'alerted'; c.timer = 0.4; ev.push({ kind: 'shout', c }); }
        else c.mind = 'watch';
      }
      break;
    case 'alerted':
      if (sees) face();
      if (c.timer > 0) break;
      if (c.kind === 'rusher') { if (sees || dist < SIGHT.rusher[1]) { c.mind = 'charge'; c.timer = 10; } }
      else if (sees) { c.mind = 'aim'; c.timer = d.windup; ev.push({ kind: 'aim', c }); }
      break;
    case 'aim':
      // The aim: he tracks you while the glint shows and the bolt clicks. Then the shot, which lands only
      // if he can still see you, and not always then.
      if (sees) face();
      if (c.timer <= 0 && (c.kind === 'lookout' || c.kind === 'gunman')) {
        const cover = sees ? null : firstSolid(c, s, blockAt);
        const hit = sees && !s.playerInSanctuary && rand() < hitChance(c.kind, dist, s.pv ?? 0);
        ev.push({ kind: 'shot', c, hit, damage: d.damage, cover });
        c.mind = 'recover'; c.timer = COOLDOWN[c.kind];
      }
      break;
    case 'recover':
      if (sees) face();
      if (c.kind === 'rusher') { toX = -(s.px - c.x); toZ = -(s.pz - c.z); speed = d.walk; }
      if (c.timer <= 0) { c.mind = c.kind === 'rusher' ? 'charge' : 'alerted'; c.timer = c.kind === 'rusher' ? 10 : 0; }
      break;
    case 'charge': {
      // The rusher runs at you; near, he raises the machete (the warning) before the blow.
      const reachable = !s.playerInSanctuary && Math.abs(s.py - c.y) < 3;
      if (!reachable || dist > SIGHT.rusher[1] + 10) { c.mind = 'alerted'; c.timer = 1; break; }
      toX = s.px - c.x; toZ = s.pz - c.z; speed = d.run;
      if (dist < 1.4 + d.width / 2 && Math.abs(s.py - c.y) < STRIKE_HEIGHT && canSee(c, s, blockAt)) {
        c.mind = 'windup'; c.timer = d.windup; speed = 0; ev.push({ kind: 'swing', c });
      }
      break;
    }
    case 'windup':
      face();
      if (c.timer <= 0) {
        if (dist < 1.9 + d.width / 2 && !s.playerInSanctuary && Math.abs(s.py - c.y) < STRIKE_HEIGHT && canSee(c, s, blockAt)) ev.push({ kind: 'blow', c, damage: d.damage });
        c.mind = 'recover'; c.timer = 1.2;
      }
      break;
    default:
      c.mind = st.alert ? 'alerted' : 'watch';
  }
  // The gun raiders keep to their posts; the rusher, once the fight is over, walks back to his.
  if (c.kind === 'rusher' && c.mind === 'alerted' && c.post && !sees && Math.hypot(c.post.x - c.x, c.post.z - c.z) > 0.6) {
    toX = c.post.x - c.x; toZ = c.post.z - c.z; speed = d.walk;
  }
  const len = Math.hypot(toX, toZ);
  if (len > 0.01 && c.mind !== 'aim' && c.mind !== 'windup') c.yaw = Math.atan2(-toX, -toZ);
  const want = len > 0.01 ? speed / len : 0;
  const k = Math.min(1, dt * 8);
  c.vx += (toX * want - c.vx) * k;
  c.vz += (toZ * want - c.vz) * k;
  moveBody(c, dt, blockAt);
  if (c.kind === 'rusher') c.stride += Math.hypot(c.vx, c.vz) * dt * 3;
  return ev;
}

/** Raises the alarm: every raider at the outpost turns to the fight. */
export function alertOutpost(creatures: Creature[], st: OutpostState): void {
  st.alert = true;
  for (const c of creatures) if (RAIDER_KINDS.has(c.kind) && (c.mind === 'watch' || c.mind === 'notice')) { c.mind = 'alerted'; c.timer = 0.3; }
}

/**
 * A blow on a raider who hasn't seen you, with a blade, is a silent takedown: he dies without a sound and
 * the others are not told. Anything else is a fight.
 */
export function silentTakedown(c: Creature, st: OutpostState, blade: boolean): boolean {
  return RAIDER_KINDS.has(c.kind) && !st.alert && c.mind === 'watch' && blade;
}
