// Where and when wildlife appears: by zone and time of day, in a ring around the player, never in the
// valley (the sanctuary rule is checked here in code, whatever any table says).

import { zoneAt, inSanctuary, PLACES, type ZoneId } from '../gen/layout.ts';
import { B_SOLID, isWaterId, blockId } from '../world/blocks.ts';

/** Tree crowns and trunks: a creature never stands on these; the search goes on down to the ground. */
const TREE = new Set(['log', 'leaves', 'tree_fern_trunk', 'fern_fronds'].map(blockId));
import { makeCreature, KINDS, type Creature, type Kind } from './creatures.ts';

interface SpawnRule { kind: Kind; zones: ZoneId[]; cap: number; night: 'day' | 'night' | 'any'; group: [number, number] }

export const SPAWNS: SpawnRule[] = [
  { kind: 'rabbit', zones: ['buffer'], cap: 6, night: 'day', group: [1, 3] },
  { kind: 'deer', zones: ['buffer', 'canyon'], cap: 4, night: 'any', group: [2, 3] },
  { kind: 'boar', zones: ['buffer'], cap: 2, night: 'any', group: [1, 2] },
  { kind: 'puma', zones: ['buffer'], cap: 1, night: 'night', group: [1, 1] },
];

const RING_NEAR = 24, RING_FAR = 80, DESPAWN = 128, WARREN_NEAR = 16;
/** A night creature still about by day slips away once it is this far from the player. */
const DAWN_LEAVE = 24;

/** A spot a creature could stand: solid ground, room above (plants are fine), no water, outside the sanctuary. */
export function groundAt(x: number, z: number, blockAt: (x: number, y: number, z: number) => number, top = 190): number | null {
  if (inSanctuary(x, z)) return null;
  for (let y = top; y > 2; y--) {
    const below = blockAt(Math.floor(x), y - 1, Math.floor(z));
    if (isWaterId(below)) return null;
    if (TREE.has(below)) continue;
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
    const have = creatures.filter((c) => c.kind === rule.kind).length + made.filter((c) => c.kind === rule.kind).length;
    if (have >= rule.cap) continue;
    let x: number, z: number;
    const w = PLACES.warren;
    if (rule.kind === 'rabbit' && Math.hypot(px - w.x, pz - w.z) < RING_FAR + 20 && rand() < 0.6) {
      // Most rabbits come from the warren, when the player is anywhere near it.
      const a = rand() * Math.PI * 2, r = w.radius + rand() * 10;
      x = w.x + Math.cos(a) * r; z = w.z + Math.sin(a) * r;
      if (Math.hypot(x - px, z - pz) < WARREN_NEAR) continue; // not popping up under the player's nose
    } else {
      const a = rand() * Math.PI * 2, r = RING_NEAR + rand() * (RING_FAR - RING_NEAR);
      x = px + Math.cos(a) * r; z = pz + Math.sin(a) * r;
    }
    if (!loaded(x, z) || inSanctuary(x, z) || !rule.zones.includes(zoneAt(x, z))) continue;
    // A group never takes the kind over its cap.
    const n = Math.min(rule.cap - have, rule.group[0] + Math.floor(rand() * (rule.group[1] - rule.group[0] + 1)));
    for (let k = 0; k < n; k++) {
      const gx = x + (rand() - 0.5) * 4, gz = z + (rand() - 0.5) * 4;
      const y = groundAt(gx, gz, blockAt);
      if (y === null || inSanctuary(gx, gz) || !rule.zones.includes(zoneAt(gx, gz))) continue;
      made.push(makeCreature(rule.kind, gx, y, gz));
    }
  }
  return made;
}

/**
 * Creatures too far from the player are let go (they are not saved; new ones come). By day, night
 * creatures (the puma) slip away once they are out of the player's way.
 */
export function despawnFar(creatures: Creature[], px: number, pz: number, night = true): Creature[] {
  return creatures.filter((c) => {
    const d = Math.hypot(c.x - px, c.z - pz);
    if (!night && SPAWNS.some((r) => r.kind === c.kind && r.night === 'night') && d > DAWN_LEAVE) return false;
    return d < DESPAWN && !inSanctuary(c.x, c.z);
  });
}

export { KINDS };
