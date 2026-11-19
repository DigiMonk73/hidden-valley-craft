// The hunting camp's jaguar (docs/PHASE5.md, step 5): it crosses the far side of the clearing once, stops
// and looks at you, then is gone into the trees with a sawing call. Its tracks stay; it does not come back.
// Provoke it (a shot, a blow, or walking right up to it) and the fight is real: it charges like the puma,
// but harder. The sanctuary rule holds as for every creature (fits() in creatures.ts).

import { ZONE1FAR } from '../gen/layout.ts';
import { makeCreature, moveBody, think, KINDS, type Creature, type Hit, type Senses } from './creatures.ts';

type BlockAt = (x: number, y: number, z: number) => number;

/** How long it holds your gaze, and how near you can come before it turns on you. */
export const STARE = 2.2;
/** While it crosses and looks it turns on you only this close: walking into the camp doesn't start a fight (review). */
export const PROVOKE_RANGE = 5;

export type JaguarEvent = 'gone' | 'provoked';

/** The jaguar at the start of its crossing, on the clearing's far side. */
export function makeJaguar(groundY: (x: number, z: number) => number | null): Creature | null {
  const [x, z] = ZONE1FAR.jaguarPath[0];
  const y = groundY(x, z);
  if (y === null) return null;
  const c = makeCreature('jaguar', x, y, z);
  c.mind = 'cross';
  c.pack = 1; // the next point of its path
  return c;
}

/**
 * One step of the jaguar. While it crosses, stares and leaves, it pays you no mind unless provoked; once
 * provoked it fights with the hunters' rules (think() in creatures.ts). Returns its hit, and 'gone' when it
 * has slipped away into the trees (the wild then lets it go), or 'provoked'.
 */
export function thinkJaguar(c: Creature, dt: number, s: Senses, blockAt: BlockAt, rand: () => number): { hit: Hit | null; event: JaguarEvent | null } {
  const scripted = c.mind === 'cross' || c.mind === 'stare' || c.mind === 'leave';
  if (!scripted) return { hit: think(c, dt, s, blockAt, rand), event: null };
  const d = KINDS.jaguar;
  c.hurt += dt;
  c.timer -= dt;
  const dist = Math.hypot(s.px - c.x, s.pz - c.z);
  // Provoked: hurt (angry), shot at, or come up on.
  if (!s.playerInSanctuary && (c.angry > 0 || s.shot || dist < PROVOKE_RANGE)) {
    c.mind = 'charge'; c.timer = 10; c.angry = Math.max(c.angry, 60);
    return { hit: null, event: 'provoked' };
  }
  const path = ZONE1FAR.jaguarPath;
  let toX = 0, toZ = 0, speed = 0, event: JaguarEvent | null = null;
  if (c.mind === 'cross') {
    const [gx, gz] = path[Math.min(c.pack, path.length - 1)];
    toX = gx - c.x; toZ = gz - c.z; speed = d.walk;
    if (Math.hypot(toX, toZ) < 0.8) {
      // Halfway across, it stops and looks at you.
      if (c.pack === 1) { c.mind = 'stare'; c.timer = STARE; }
      c.pack++;
    }
  } else if (c.mind === 'stare') {
    c.yaw = Math.atan2(-(s.px - c.x), -(s.pz - c.z));
    if (c.timer <= 0) { c.mind = 'leave'; c.timer = 8; }
  } else {
    // Into the trees beyond the clearing's far corner, at a lope, and gone.
    const [gx, gz] = path[path.length - 1];
    toX = gx + 6 - c.x; toZ = gz - 10 - c.z; speed = d.run * 0.6;
    if (Math.hypot(toX, toZ) < 1.2 || c.timer <= 0) event = 'gone';
  }
  const len = Math.hypot(toX, toZ);
  if (len > 0.01) c.yaw = Math.atan2(-toX, -toZ);
  const want = len > 0.01 ? speed / len : 0;
  const k = Math.min(1, dt * 8);
  c.vx += (toX * want - c.vx) * k;
  c.vz += (toZ * want - c.vz) * k;
  moveBody(c, dt, blockAt);
  c.stride += Math.hypot(c.vx, c.vz) * dt * 3;
  return { hit: null, event };
}

/** Is the player where the jaguar's crossing should begin: in the clearing, or on the trail just short of it? */
export function atCampClearing(px: number, pz: number): boolean {
  const c = ZONE1FAR.camp;
  return px > c.x0 - 4 && px < c.x1 + 4 && pz > c.z0 && pz < c.z1 + 10;
}
