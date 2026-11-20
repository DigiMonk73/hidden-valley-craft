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
import { makeCreature, moveBody, canSee, settle, KINDS, RAIDER_KINDS, ROLE, isMan, STRIKE_HEIGHT, type Creature, type Kind, type Senses } from './creatures.ts';

type BlockAt = (x: number, y: number, z: number) => number;

/** Which raider each bit of `left` stands for. */
export const RAIDER_BIT: Record<'lookout' | 'gunman' | 'rusher', number> = { lookout: 1, gunman: 2, rusher: 4 };
export const ALL_RAIDERS = 7;
const POST_OF = { lookout: POSTS.lookout, gunman: POSTS.pistol, rusher: POSTS.machete };

/** How far each sees you: before the alarm, and after it. The lookout, before it, only looks east. */
export const SIGHT: Record<'lookout' | 'gunman' | 'rusher', [number, number]> = { lookout: [45, 60], gunman: [25, 35], rusher: [14, 40] };
/**
 * Half each raider's field of view before the alarm, either side of the way he faces: the lookout watches
 * the road east; the pistol and the machete face the road too. Behind them, a player is unseen, so a blade
 * from behind can take any of them (review: the gunman and rusher used to see all round).
 */
export const LOOKOUT_CONE = (70 * Math.PI) / 180;
export const GROUND_CONE = (65 * Math.PI) / 180;
/** How far a gunshot is heard at the outpost: as far as its raiders are posted, and the rifle reaches. */
export const SHOT_HEARD = 150;
/** The rusher gives up a chase this far from his post, or after this long, and walks back to it. */
export const LEASH = 40;
export const CHASE_SECONDS = 10;
/** A raider who loses sight of you mid-aim holds his shot at least this long after you reappear. */
export const REACQUIRE = 0.5;
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
  | { kind: 'notice' | 'challenge' | 'shout' | 'aim' | 'swing'; c: Creature }
  | { kind: 'shot'; c: Creature; hit: boolean; damage: number; cover: [number, number, number] | null }
  | { kind: 'blow'; c: Creature; damage: number };

const isRaider = (k: Kind): boolean => isMan(k);
/** How a man fights: as the outpost's lookout (a rifle from a height), its pistol, or its machete. Zone-2's faction fight the same three ways. */
const roleOf = (c: Creature): 'lookout' | 'gunman' | 'rusher' => ROLE[c.kind]!;
/** A faction man's second look at a stranger who comes close wearing the armband (docs/PHASE6.md). */
export const CHALLENGE = 1.5;

/** The raiders still alive who are not about: each at his post, if the land there is loaded and the post is clear. */
export function manOutpost(creatures: Creature[], st: OutpostState, px: number, pz: number, loaded: (x: number, z: number) => boolean, blockAt: BlockAt = () => 0): Creature[] {
  if (Math.hypot(px - OUTPOST_AT[0], pz - OUTPOST_AT[1]) > OUTPOST_NEAR || !loaded(OUTPOST_AT[0], OUTPOST_AT[1])) return [];
  const made: Creature[] = [];
  for (const kind of ['lookout', 'gunman', 'rusher'] as const) {
    if (!(st.left & RAIDER_BIT[kind]) || creatures.some((c) => c.kind === kind)) continue;
    const p = POST_OF[kind];
    if (inSanctuary(p.x, p.z)) continue;
    // Each stands exactly where he is posted: the lookout on the roof, not on the ground below it.
    const c = makeCreature(kind, p.x, p.y, p.z);
    if (!settle(c, blockAt)) continue; // something has been built on his post
    c.post = { ...p, y: c.y };
    c.yaw = p.yaw;
    c.mind = st.alert ? 'alerted' : 'watch';
    made.push(c);
  }
  return made;
}

/** How far the player is from a raider's post. */
const fromPost = (c: Creature, s: Senses) => (c.post ? Math.hypot(s.px - c.post.x, s.pz - c.post.z) : 0);

/** The outpost as a save left it: an old save (no field) has all three raiders alive, and nobody alerted. */
export function outpostFromSave(left: number | undefined): OutpostState {
  return { left: typeof left === 'number' ? left & ALL_RAIDERS : ALL_RAIDERS, alert: false };
}

/** The bearing a body at (ax, az) must face to look at (bx, bz), in the game's yaw (0 looks north, −z). */
const bearing = (ax: number, az: number, bx: number, bz: number) => Math.atan2(-(bx - ax), -(bz - az));
const angleDiff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/** Can this raider see the player now: in range, in his field of view, nothing solid between? */
export function raiderSees(c: Creature, s: Senses, alert: boolean, blockAt: BlockAt): boolean {
  if (!isRaider(c.kind) || s.playerInSanctuary) return false;
  const dist = Math.hypot(s.px - c.x, s.pz - c.z), role = roleOf(c);
  if (dist > SIGHT[role][alert ? 1 : 0]) return false;
  if (!alert && angleDiff(bearing(c.x, c.z, s.px, s.pz), c.post?.yaw ?? c.yaw) > (role === 'lookout' ? LOOKOUT_CONE : GROUND_CONE)) return false;
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
 * One step of a raider's mind. `st` is the outpost's (or the faction's) shared state: one raising the alarm
 * alerts them all. `pass`: a faction man takes a stranger wearing the armband for one of his own beyond this
 * distance, and looks again closer (0: no disguise). Returns what happened (sounds to play, shots to land).
 */
export function thinkRaider(c: Creature, dt: number, s: Senses, st: OutpostState, blockAt: BlockAt, rand: () => number, pass = 0): RaiderEvent[] {
  if (!isRaider(c.kind)) return [];
  const ev: RaiderEvent[] = [];
  const d = KINDS[c.kind], role = roleOf(c);
  c.hurt += dt;
  c.timer -= dt;
  const dist = Math.hypot(s.px - c.x, s.pz - c.z);
  // In the armband, unalerted, a man doesn't count you as a stranger until you are close.
  const sees = raiderSees(c, s, st.alert, blockAt) && !(pass > 0 && !st.alert && dist > pass);
  const face = () => { c.yaw = bearing(c.x, c.z, s.px, s.pz); };
  if (st.alert && (c.mind === 'watch' || c.mind === 'notice')) { c.mind = 'alerted'; c.timer = 0.3; }
  let toX = 0, toZ = 0, speed = 0;

  switch (c.mind) {
    case 'watch':
      // On a beat (a faction patrol), he walks it, looking where he goes.
      if (c.route && c.route.length) {
        const [gx, gz] = c.route[c.leg ?? 0];
        toX = gx - c.x; toZ = gz - c.z; speed = d.walk;
        if (Math.hypot(toX, toZ) < 0.8) c.leg = ((c.leg ?? 0) + 1) % c.route.length;
        if (Math.hypot(toX, toZ) > 0.01) c.yaw = Math.atan2(-toX, -toZ);
        c.post = { x: c.x, y: c.y, z: c.z, yaw: c.yaw };
      } else if (c.post) c.yaw = c.post.yaw + (role === 'lookout' ? 0.5 * Math.sin(c.goalX += dt * 0.35) : 0);
      // At his post, unaware. The lookout's gaze sweeps the road slowly.
      if (sees) { c.mind = 'notice'; c.timer = pass ? CHALLENGE : NOTICE; face(); ev.push({ kind: pass ? 'challenge' : 'notice', c }); }
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
      if (role === 'rusher') { if ((sees || dist < SIGHT.rusher[1]) && fromPost(c, s) < LEASH) { c.mind = 'charge'; c.timer = CHASE_SECONDS; } }
      else if (sees) { c.mind = 'aim'; c.timer = d.windup; ev.push({ kind: 'aim', c }); }
      break;
    case 'aim':
      // The aim: he tracks you while the glint shows and the bolt clicks. Then the shot, which lands only
      // if he can still see you, and not always then.
      if (sees) face();
      // Hidden mid-aim, he holds the shot: whoever steps back out gets a moment's warning again.
      else c.timer = Math.max(c.timer, REACQUIRE);
      if (c.timer <= 0 && (role === 'lookout' || role === 'gunman')) {
        const cover = sees ? null : firstSolid(c, s, blockAt);
        const hit = sees && !s.playerInSanctuary && rand() < hitChance(role, dist, s.pv ?? 0);
        ev.push({ kind: 'shot', c, hit, damage: d.damage, cover });
        c.mind = 'recover'; c.timer = COOLDOWN[role];
      }
      break;
    case 'recover':
      if (sees) face();
      if (role === 'rusher') { toX = -(s.px - c.x); toZ = -(s.pz - c.z); speed = d.walk; }
      if (c.timer <= 0) { c.mind = role === 'rusher' ? 'charge' : 'alerted'; c.timer = role === 'rusher' ? 10 : 0; }
      break;
    case 'charge': {
      // The rusher runs at you; near, he raises the machete (the warning) before the blow.
      const reachable = !s.playerInSanctuary && Math.abs(s.py - c.y) < 3;
      if (!reachable || dist > SIGHT.rusher[1] + 10 || c.timer <= 0 || fromPost(c, s) > LEASH + 5) { c.mind = 'alerted'; c.timer = 3; break; }
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
  if (role === 'rusher' && c.mind === 'alerted' && c.post && Math.hypot(c.post.x - c.x, c.post.z - c.z) > 0.6) {
    toX = c.post.x - c.x; toZ = c.post.z - c.z; speed = d.walk;
  }
  const len = Math.hypot(toX, toZ);
  if (len > 0.01 && c.mind !== 'aim' && c.mind !== 'windup') c.yaw = Math.atan2(-toX, -toZ);
  const want = len > 0.01 ? speed / len : 0;
  const k = Math.min(1, dt * 8);
  c.vx += (toX * want - c.vx) * k;
  c.vz += (toZ * want - c.vz) * k;
  moveBody(c, dt, blockAt);
  if (role === 'rusher' || c.route) c.stride += Math.hypot(c.vx, c.vz) * dt * 3;
  return ev;
}

/** Raises the alarm: every raider at the outpost turns to the fight. */
export function alertOutpost(creatures: Creature[], st: OutpostState, kinds: ReadonlySet<Kind> = RAIDER_KINDS): void {
  st.alert = true;
  for (const c of creatures) if (kinds.has(c.kind) && (c.mind === 'watch' || c.mind === 'notice')) { c.mind = 'alerted'; c.timer = 0.3; }
}

/**
 * A blow on a raider who hasn't seen you, with a blade, is a silent takedown: he dies without a sound and
 * the others are not told. Anything else is a fight.
 */
export function silentTakedown(c: Creature, st: OutpostState, blade: boolean): boolean {
  return isMan(c.kind) && !st.alert && c.mind === 'watch' && blade;
}
