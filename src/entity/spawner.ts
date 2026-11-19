// Where and when wildlife appears: by zone and time of day, in a ring around the player, never in the
// valley (the sanctuary rule is checked here in code, whatever any table says).

import { zoneAt, inSanctuary, surfaceHeight, PLACES, type ZoneId } from '../gen/layout.ts';
import { B_SOLID, isWaterId, blockId, BLOCK_DEFS } from '../world/blocks.ts';

const hasBlock = (n: string) => BLOCK_DEFS.some((d) => d.name === n);

/** Tree crowns and trunks: a creature never stands on these; the search goes on down to the ground. */
const TREE = new Set(['log', 'leaves', 'tree_fern_trunk', 'fern_fronds'].map(blockId));
import { makeCreature, KINDS, PACK_KINDS, type Creature, type Kind } from './creatures.ts';
import { DEN, YARD } from '../gen/zone1.ts';

interface SpawnRule {
  kind: Kind; zones: ZoneId[]; cap: number; night: 'day' | 'night' | 'any'; group: [number, number];
  /** Spawns only round this point (when the player is near it), and the creatures keep to it as home. */
  anchor?: [number, number]; radius?: number;
}

export const SPAWNS: SpawnRule[] = [
  { kind: 'rabbit', zones: ['buffer'], cap: 6, night: 'day', group: [1, 3] },
  { kind: 'deer', zones: ['buffer', 'canyon'], cap: 4, night: 'any', group: [2, 3] },
  { kind: 'boar', zones: ['buffer'], cap: 2, night: 'any', group: [1, 2] },
  { kind: 'puma', zones: ['buffer'], cap: 1, night: 'night', group: [1, 1] },
  // Zone-1's near band (docs/PHASE4.md): coyote packs by night; the feral flock round the farmyard by day.
  { kind: 'coyote', zones: ['near'], cap: 3, night: 'night', group: [2, 3] },
  { kind: 'chicken', zones: ['near'], cap: 6, night: 'day', group: [2, 3], anchor: YARD, radius: 9 },
];

/** The farm's feral flock at its fullest; it regrows a hen a day (docs/PHASE4.md). */
export const FLOCK_SIZE = 6;

/** The farmhouse den: a pack of three dogs (docs/PHASE4.md). Killed dogs stay dead. */
export const DEN_SIZE = 3;
/** The den's dogs are about when the player is this near it. */
const DEN_NEAR = 100;

const RING_NEAR = 24, RING_FAR = 80, DESPAWN = 128, WARREN_NEAR = 16;
/** A night creature still about by day slips away once it is this far from the player. */
const DAWN_LEAVE = 24;

/** Built things a creature is never put on top of: roofs, coops and hutches, crates, fences, wrecks, sandbags. */
const BUILT = new Set([
  'tin_roof', 'slab_planks', 'slab_stone_bricks', 'coop', 'hutch', 'chest', 'fence_post', 'fence_wire', 'truck_body', 'truck_cab',
  'truck_wheel', 'scrap_heap', 'bench', 'table', 'stone_railing', 'sandbags', 'supply_crate', 'oil_drum', 'concrete_slab',
].flatMap((n) => (hasBlock(n) ? [n, `${n}@east`, `${n}@south`, `${n}@west`].filter(hasBlock) : [])).map(blockId));

/**
 * A spot a creature could stand: solid ground, room above (plants are fine), no water, outside the
 * sanctuary. Of the open spots in the column, the lowest that is not below the land's own height is
 * taken, so a creature stands on the floor under a roof rather than on it, and never on top of a coop,
 * a crate or a fence (the lead, 2026-11-18: Marco was put on the bus shelter's roof). A pit dug deeper
 * than the land leaves only the highest open spot, as before.
 */
export function groundAt(x: number, z: number, blockAt: (x: number, y: number, z: number) => number, top = 190): number | null {
  if (inSanctuary(x, z)) return null;
  const bx = Math.floor(x), bz = Math.floor(z);
  const land = surfaceHeight(bx, bz);
  let first: number | null = null, lowest: number | null = null, ground = false;
  for (let y = top; y > 2; y--) {
    const below = blockAt(bx, y - 1, bz);
    if (isWaterId(below) && !ground) return null; // water before any ground
    if (y < land - 3 && ground) break; // under the land: caves are not a place to put anything
    if (TREE.has(below) || !B_SOLID[below]) continue;
    ground = true;
    const here = blockAt(bx, y, bz), above = blockAt(bx, y + 1, bz);
    // Grass and ferns are no obstacle; rock or water is.
    const open = !B_SOLID[here] && !isWaterId(here) && !B_SOLID[above] && !isWaterId(above);
    if (open && !BUILT.has(below)) {
      if (first === null) first = y;
      if (y >= land - 3) lowest = y;
    }
  }
  return lowest ?? first;
}

/** One spawn attempt per rule; returns the creatures made. `loaded` says whether a column is in memory. */
export function trySpawn(
  creatures: Creature[], px: number, pz: number, night: boolean, rand: () => number,
  blockAt: (x: number, y: number, z: number) => number, loaded: (x: number, z: number) => boolean,
  /** Lower caps for kinds that are finite where they live (the farm's flock: how many hens are left). */
  limits: Partial<Record<Kind, number>> = {},
): Creature[] {
  const made: Creature[] = [];
  for (const rule of SPAWNS) {
    if (rule.night === 'day' && night) continue;
    if (rule.night === 'night' && !night) continue;
    const have = creatures.filter((c) => c.kind === rule.kind && !c.tame).length + made.filter((c) => c.kind === rule.kind).length;
    const cap = Math.min(rule.cap, limits[rule.kind] ?? Infinity);
    if (have >= cap) continue;
    let x: number, z: number;
    const w = PLACES.warren;
    if (rule.anchor) {
      const [ax, az] = rule.anchor;
      if (Math.hypot(px - ax, pz - az) > RING_FAR + 40) continue;
      const a = rand() * Math.PI * 2, r = rand() * (rule.radius ?? 8);
      x = ax + Math.cos(a) * r; z = az + Math.sin(a) * r;
      if (Math.hypot(x - px, z - pz) < 10) continue; // not under the player's nose
    } else if (rule.kind === 'rabbit' && Math.hypot(px - w.x, pz - w.z) < RING_FAR + 20 && rand() < 0.6) {
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
    const n = Math.min(cap - have, rule.group[0] + Math.floor(rand() * (rule.group[1] - rule.group[0] + 1)));
    for (let k = 0; k < n; k++) {
      const gx = x + (rand() - 0.5) * 4, gz = z + (rand() - 0.5) * 4;
      const y = groundAt(gx, gz, blockAt);
      if (y === null || inSanctuary(gx, gz) || !rule.zones.includes(zoneAt(gx, gz))) continue;
      const c = makeCreature(rule.kind, gx, y, gz);
      // Each takes the first place in the pack not already taken by one of its kind about.
      if (PACK_KINDS.has(rule.kind)) {
        const taken = new Set([...creatures, ...made].filter((o) => o.kind === rule.kind).map((o) => o.pack));
        let i = 0;
        while (taken.has(i)) i++;
        c.pack = i;
      }
      if (rule.anchor) c.home = [rule.anchor[0], rule.anchor[1]];
      made.push(c);
    }
  }
  return made;
}

/**
 * The den's dogs: when the player is near the farmhouse, those of the pack still alive (`left`) lie
 * in the house. Each keeps its own place in the pack, so the three always come from three sides.
 */
export function denPack(
  creatures: Creature[], px: number, pz: number, left: number, rand: () => number,
  blockAt: (x: number, y: number, z: number) => number, loaded: (x: number, z: number) => boolean,
): Creature[] {
  if (left <= 0 || Math.hypot(px - DEN[0], pz - DEN[2]) > DEN_NEAR || !loaded(DEN[0], DEN[2])) return [];
  const dogs = creatures.filter((c) => c.kind === 'dog' && c.home);
  const made: Creature[] = [];
  for (let k = 0; k < DEN_SIZE && dogs.length + made.length < left; k++) {
    if (dogs.some((c) => c.pack === k)) continue;
    const x = DEN[0] + (rand() - 0.5) * 3, z = DEN[2] + (rand() - 0.5) * 3;
    const y = groundAt(x, z, blockAt, DEN[1] + 3);
    if (y === null || inSanctuary(x, z)) continue;
    const c = makeCreature('dog', x, y, z);
    c.pack = k;
    c.home = [DEN[0], DEN[2]];
    made.push(c);
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
    if (c.tame) return true; // the coop's own hens: the game keeps them in step with it
    return d < DESPAWN && !inSanctuary(c.x, c.z);
  });
}

export { KINDS };
