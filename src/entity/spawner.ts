// Where and when wildlife appears: by zone and time of day, in a ring around the player, never in the
// valley (the sanctuary rule is checked here in code, whatever any table says).

import { zoneAt, inSanctuary, type ZoneId } from '../gen/layout.ts';
import { B_SOLID, isWaterId } from '../world/blocks.ts';
import { makeCreature, KINDS, type Creature, type Kind } from './creatures.ts';

interface SpawnRule { kind: Kind; zones: ZoneId[]; cap: number; night: 'day' | 'night' | 'any'; group: [number, number] }

export const SPAWNS: SpawnRule[] = [
  { kind: 'rabbit', zones: ['buffer', 'canyon'], cap: 6, night: 'day', group: [1, 3] },
  { kind: 'deer', zones: ['buffer', 'canyon'], cap: 4, night: 'any', group: [2, 3] },
  { kind: 'boar', zones: ['buffer'], cap: 2, night: 'any', group: [1, 2] },
  { kind: 'puma', zones: ['buffer'], cap: 1, night: 'night', group: [1, 1] },
];

const RING_NEAR = 24, RING_FAR = 80, DESPAWN = 128;

/** A spot a creature could stand: solid ground, room above (plants are fine), no water, outside the sanctuary. */
export function groundAt(x: number, z: number, blockAt: (x: number, y: number, z: number) => number, top = 190): number | null {
  if (inSanctuary(x, z)) return null;
  for (let y = top; y > 2; y--) {
    const below = blockAt(Math.floor(x), y - 1, Math.floor(z));
    if (isWaterId(below)) return null;
    if (B_SOLID[below]) {
      const here = blockAt(Math.floor(x), y, Math.floor(z)), above = blockAt(Math.floor(x), y + 1, Math.floor(z));
      // Grass and ferns are no obstacle; rock or water is.
      return !B_SOLID[here] && !isWaterId(here) && !B_SOLID[above] && !isWaterId(above) ? y : null;
    }
  }
  return null;
}

/** One spawn attempt per rule; returns the creatures made. `loaded` says whether a column is in memory. */
export function trySpawn(
  creatures: Creature[], px: number, pz: number, night: boolean, rand: () => number,
  blockAt: (x: number, y: number, z: number) => number, loaded: (x: number, z: number) => boolean,
): Creature[] {
  const made: Creature[] = [];
  for (const rule of SPAWNS) {
    if (rule.night === 'day' && night) continue;
    if (rule.night === 'night' && !night) continue;
    if (creatures.filter((c) => c.kind === rule.kind).length >= rule.cap) continue;
    const a = rand() * Math.PI * 2, r = RING_NEAR + rand() * (RING_FAR - RING_NEAR);
    const x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r;
    if (!loaded(x, z) || inSanctuary(x, z) || !rule.zones.includes(zoneAt(x, z))) continue;
    const n = rule.group[0] + Math.floor(rand() * (rule.group[1] - rule.group[0] + 1));
    for (let k = 0; k < n; k++) {
      const gx = x + (rand() - 0.5) * 4, gz = z + (rand() - 0.5) * 4;
      const y = groundAt(gx, gz, blockAt);
      if (y === null || inSanctuary(gx, gz)) continue;
      made.push(makeCreature(rule.kind, gx, y, gz));
    }
  }
  return made;
}

/** Creatures too far from the player are let go (they are not saved; new ones come). */
export function despawnFar(creatures: Creature[], px: number, pz: number): Creature[] {
  return creatures.filter((c) => Math.hypot(c.x - px, c.z - pz) < DESPAWN && !inSanctuary(c.x, c.z));
}

export { KINDS };
