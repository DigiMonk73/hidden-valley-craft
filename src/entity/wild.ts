// The wild outside the valley: every creature and every arrow in flight, stepped at 20 Hz. It spawns
// and lets go of creatures around the player, runs their minds, flies arrows, and reports what the
// game should hear and feel. The sanctuary rule holds here as everywhere: nothing lives or flies
// into the valley (inSanctuary in src/gen/layout.ts).

import { B_SOLID } from '../world/blocks.ts';
import { inSanctuary } from '../gen/layout.ts';
import { think, hurt, settle, inPlayersView, KINDS, PACK_KINDS, RAIDER_KINDS, FACTION_KINDS, TRAPPABLE, type Creature, type Hit, type Kind, type Mind } from './creatures.ts';
import { manFaction, standDown, newFaction, PASS, type FactionState } from './faction.ts';
import { thinkRaider, manOutpost, alertOutpost, ALL_RAIDERS, SHOT_HEARD, type OutpostState, type RaiderEvent } from './outpost.ts';
import { thinkJaguar } from './jaguar.ts';
import { thinkAshen, manAshen, standDownAshen, ashenHear, provokeAshen, isHunting, newAshen, SHOT_HEARD as ASHEN_SHOT_HEARD, QUIET_SHOT_HEARD, type AshenEvent, type AshenState, type Smoke } from './ashen.ts';
import { LEGHOLD, HOLD_SECONDS } from '../sim/preserve.ts';
import { OUTPOST_AT } from '../gen/zone1far.ts';
import { trySpawn, despawnFar, denPack, groundAt, DEN_SIZE, FLOCK_SIZE } from './spawner.ts';
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
  /** Loosed from inside the sanctuary: it flies there freely. One loosed outside is stopped at the line. */
  home?: boolean;
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
  /** Which way the player faces (their yaw), if known. */
  pyaw?: number;
  /** How fast the player is moving (m/s), and whether they are sprinting. */
  pv?: number;
  sprint?: boolean;
  /** Does the player carry the scout's armband (Zone-2's men take them for one of theirs, from afar)? */
  armband?: boolean;
  /** A suppressed shot since the last update: heard only close by (docs/PHASE7.md). */
  quietShot?: boolean;
  /** The light at a block, 0–15: the brighter of the daylight reaching it and lamplight (the Ashen live by it). Bright everywhere if not given. */
  lightAt?: (x: number, y: number, z: number) => number;
  /** Is the player mining? */
  mining?: boolean;
  /** The smoke of pots burning now: no Ashen steps into it (docs/PHASE8.md, 4). */
  smoke?: Smoke[];
  /** Sonic lures calling this update: every Ashen in earshot that is not hunting goes to one, as to a shot. */
  calls?: { x: number; z: number; r: number }[];
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
  /** What the raiders did: noticed, shouted, aimed, fired, swung (docs/PHASE5.md). */
  raiders: RaiderEvent[];
  /** The jaguar slipped away into the trees, or was provoked. */
  jaguar: ('gone' | 'provoked')[];
  /** Arrows that killed a raider who never saw it coming (silent: the others are not told). */
  silent: number;
  /** What the Ashen did: noticed, shrieked, lunged, missed, hit, breathed (docs/PHASE7.md). */
  ashen: AshenEvent[];
}

/** How much of a blow gets through what the player carries: the best of the vest and leather armour. */
export function armourFactor(count: (name: string) => number): number {
  if (count('engineer_armor') > 0) return 0.35; // M5's (docs/PHASE8.md, 4)
  if (count('plate_armor') > 0) return 0.5; // M4's tier 2 (docs/PHASE7.md)
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
  /** The outpost: which of its raiders are alive (saved), and whether it is alerted. */
  outpost: OutpostState = { left: ALL_RAIDERS, alert: false };
  /** Zone-2's faction: who is down until dawn, whether they are alerted, whether the armband is seen through. */
  faction: FactionState = newFaction();
  /** Zone-3's Ashen: who is down until dawn (saved), and whether the first one still stands out in the road. */
  ashen: AshenState = newAshen();
  private quietHeard = false;
  private callsHeard: { x: number; z: number; r: number }[] = [];
  /** The blocks as the last update saw them: what a creature added by hand is fitted against. */
  private blocks: BlockAt | null = null;

  /** Runs as many 20 Hz steps as `dt` holds. */
  update(dt: number, s: WildSenses): WildEvents {
    const ev: WildEvents = { hits: [], sounds: [], kills: [], picked: 0, snared: [], raiders: [], jaguar: [], silent: 0, ashen: [] };
    if (s.shot) this.shotHeard = true;
    if (s.quietShot) this.quietHeard = true;
    // A lure's call is kept, like a shot, until the next step hears it (steps run at 20 Hz, the game faster).
    if (s.calls?.length) this.callsHeard.push(...s.calls);
    this.blocks = s.blockAt;
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
      this.creatures = despawnFar(this.creatures, s.px, s.pz, s.night, (c) => inPlayersView(c, s.px, s.py, s.pz, s.blockAt));
      this.creatures.push(...trySpawn(this.creatures, s.px, s.pz, s.night, s.rand, s.blockAt, s.loaded, { chicken: this.flockLeft }));
      this.creatures.push(...denPack(this.creatures, s.px, s.pz, this.denLeft, s.rand, s.blockAt, s.loaded));
      this.creatures.push(...manOutpost(this.creatures, this.outpost, s.px, s.pz, s.loaded, s.blockAt));
      this.creatures = standDown(this.creatures, this.faction, s.px, s.pz);
      this.creatures.push(...manFaction(this.creatures, this.faction, s.px, s.pz, s.loaded, (x, z) => groundAt(x, z, s.blockAt), s.blockAt));
      this.creatures = standDownAshen(this.creatures, s.px, s.pz);
      this.creatures.push(...manAshen(this.creatures, this.ashen, s.px, s.pz, s.night, s.loaded, (x, y, z) => floorNear(x, y, z, s.blockAt), s.blockAt));
      // Once the player has gone well away and the raiders are no longer about, the outpost stands down.
      if (!this.creatures.some((c) => RAIDER_KINDS.has(c.kind)) && Math.hypot(s.px - OUTPOST_AT[0], s.pz - OUTPOST_AT[1]) > 130) this.outpost.alert = false;
    }
    const senses = { px: s.px, py: s.py, pz: s.pz, pv: s.pv, sprint: s.sprint, playerInSanctuary: inSanctuary(s.px, s.pz), night: s.night, shot: this.shotHeard, pyaw: s.pyaw };
    // A gunshot anywhere near the outpost alerts all of it.
    if (this.shotHeard && Math.hypot(s.px - OUTPOST_AT[0], s.pz - OUTPOST_AT[1]) < SHOT_HEARD && this.outpost.left) alertOutpost(this.creatures, this.outpost);
    // And near any of Zone-2's men, all of them: the disguise is over for this visit.
    if (this.shotHeard && this.creatures.some((c) => FACTION_KINDS.has(c.kind) && Math.hypot(s.px - c.x, s.pz - c.z) < SHOT_HEARD)) this.alertFaction();
    // The Ashen come to where a shot was fired (not to the player): a suppressed one carries only a little way.
    if (this.shotHeard) ashenHear(this.creatures, s.px, s.pz, ASHEN_SHOT_HEARD);
    else if (this.quietHeard) {
      ashenHear(this.creatures, s.px, s.pz, QUIET_SHOT_HEARD);
      const near = (c: Creature) => Math.hypot(s.px - c.x, s.pz - c.z) < QUIET_SHOT_HEARD;
      if (this.outpost.left && this.creatures.some((c) => RAIDER_KINDS.has(c.kind) && near(c))) alertOutpost(this.creatures, this.outpost);
      if (this.creatures.some((c) => FACTION_KINDS.has(c.kind) && near(c))) this.alertFaction();
    }
    for (const call of this.callsHeard) ashenHear(this.creatures, call.x, call.z, call.r);
    this.callsHeard = [];
    this.shotHeard = false;
    this.quietHeard = false;
    const ashenSenses = { ...senses, lightAt: s.lightAt ?? (() => 15), mining: s.mining, smoke: s.smoke };
    for (const c of [...this.creatures]) {
      if (!s.loaded(c.x, c.z)) continue; // its ground isn't there: it waits
      const before: Mind = c.mind;
      if (FACTION_KINDS.has(c.kind)) {
        const alertBefore = this.faction.alert;
        for (const e of thinkRaider(c, STEP, senses, this.faction, s.blockAt, s.rand, s.armband && !this.faction.blown ? PASS : 0)) {
          ev.raiders.push(e);
          if (e.kind === 'shot' && e.hit) ev.hits.push({ damage: e.damage, by: c.kind });
          if (e.kind === 'blow') ev.hits.push({ damage: e.damage, by: c.kind });
        }
        if (this.faction.alert && !alertBefore) this.alertFaction();
        continue;
      }
      if (RAIDER_KINDS.has(c.kind)) {
        const alertBefore = this.outpost.alert;
        for (const e of thinkRaider(c, STEP, senses, this.outpost, s.blockAt, s.rand)) {
          ev.raiders.push(e);
          if (e.kind === 'shot' && e.hit) ev.hits.push({ damage: e.damage, by: c.kind });
          if (e.kind === 'blow') ev.hits.push({ damage: e.damage, by: c.kind });
        }
        if (this.outpost.alert && !alertBefore) alertOutpost(this.creatures, this.outpost);
        continue;
      }
      if (c.kind === 'ashen') {
        const others = this.creatures.filter((o) => o !== c && isHunting(o)).length;
        for (const e of thinkAshen(c, STEP, ashenSenses, others, s.blockAt, s.rand)) {
          ev.ashen.push(e);
          if (e.kind === 'hit') ev.hits.push({ damage: e.damage, by: 'ashen' });
        }
        continue;
      }
      if (c.kind === 'jaguar') {
        const j = thinkJaguar(c, STEP, senses, s.blockAt, s.rand);
        if (j.hit) ev.hits.push(j.hit);
        if (j.event) ev.jaguar.push(j.event);
        if (j.event === 'gone') this.remove(c);
        if (c.mind === 'windup' && before !== 'windup') ev.sounds.push({ kind: 'growl', x: c.x, y: c.y + 0.6, z: c.z });
        continue;
      }
      // A deer or boar that steps in a set leghold is held there (docs/PHASE5.md).
      if (TRAPPABLE.has(c.kind) && !(c.held && c.held !== 0) && s.blockAt(Math.floor(c.x), Math.floor(c.y), Math.floor(c.z)) === LEGHOLD) {
        c.held = HOLD_SECONDS;
        ev.sounds.push({ kind: 'hit', x: c.x, y: c.y + 0.3, z: c.z });
      }
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
    const a: Arrow = { x, y, z, vx: dx * speed, vy: dy * speed, vz: dz * speed, damage: Math.round(12 + 10 * d), stuck: false, age: 0, home: inSanctuary(x, z) };
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
        // An arrow in a raider who hasn't seen you does three times its harm; a kill so is silent.
        const faction = FACTION_KINDS.has(hit.kind);
        const unseen = (RAIDER_KINDS.has(hit.kind) && !this.outpost.alert && hit.mind === 'watch') || (faction && !this.faction.alert && hit.mind === 'watch');
        if (hurt(hit, unseen ? a.damage * 3 : a.damage)) {
          ev.kills.push(hit); this.remove(hit); if (unseen) ev.silent++;
          // Down until dawn from this moment: the next step's roll-call must not find the place empty and fill it.
          if (hit.squad && faction) this.faction.down |= hit.squad;
          if (hit.squad && hit.kind === 'ashen') this.ashen.down |= hit.squad;
        }
        if (RAIDER_KINDS.has(hit.kind) && (!unseen || hit.hp > 0)) alertOutpost(this.creatures, this.outpost);
        if (faction && (!unseen || hit.hp > 0)) this.alertFaction();
        if (hit.kind === 'ashen' && hit.hp > 0) this.provoke(hit, s.px, s.pz);
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

  /** Raises Zone-2's alarm: every man of the faction about turns to the fight, and the armband hides nothing. */
  alertFaction(): void {
    alertOutpost(this.creatures, this.faction, FACTION_KINDS);
    this.faction.blown = true;
  }

  /** An Ashen hurt and still standing turns on whoever hurt it (if three aren't hunting already, else it comes to look). */
  provoke(c: Creature, px: number, pz: number): void {
    provokeAshen(c, px, pz, this.creatures.filter((o) => o !== c && isHunting(o)).length);
  }

  remove(c: Creature): void { this.creatures = this.creatures.filter((o) => o !== c); }

  /**
   * Puts a creature in the world (Marco, the jaguar, a test's or the play-through's creature). Refused
   * inside the sanctuary (only a tame hen lives in the valley), and refused unless its whole body is clear
   * of the sanctuary's line and of every block: `blockAt`, or the blocks the last update saw.
   */
  add(c: Creature, blockAt: BlockAt | null = this.blocks): boolean {
    if (inSanctuary(c.x, c.z) && !c.tame) return false;
    if (!settle(c, blockAt ?? (() => 0))) return false;
    this.creatures.push(c);
    return true;
  }

  count(kind: Kind): number { return this.creatures.filter((c) => c.kind === kind).length; }

  clear(): void { this.creatures = []; this.arrows = []; this.outpost.alert = false; this.faction.alert = false; this.faction.blown = false; }
}

/**
 * Moves an arrow one step under gravity, in small sub-steps so it can't pass through a block.
 * Returns true when it strikes a block and sticks there. No arrow loosed outside flies into the
 * sanctuary: one that would is stopped at its edge. One loosed inside it (`home`) flies freely, in the
 * valley and out of it: the bow could not be loosed at home at all (the review, N5h).
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
    if (!a.home && inSanctuary(nx, nz)) {
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

/** The floor nearest to a height at (x, z): solid underfoot and room to stand, within a few blocks up or down. */
export function floorNear(x: number, y: number, z: number, blockAt: BlockAt): number | null {
  const bx = Math.floor(x), bz = Math.floor(z), y0 = Math.round(y);
  for (const dy of [0, -1, 1, -2, 2, -3, 3]) {
    const fy = y0 + dy;
    if (B_SOLID[blockAt(bx, fy - 1, bz)] && !B_SOLID[blockAt(bx, fy, bz)] && !B_SOLID[blockAt(bx, fy + 1, bz)]) return fy;
  }
  return null;
}
