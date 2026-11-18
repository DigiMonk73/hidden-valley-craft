// Dying outside the valley (docs/PHASE3.md, step 6): everything carried is left in a lost pack where
// you fell, a sack that opens like a chest and never goes away. In the valley nothing is lost.

import { AIR, B_SOLID, BLOCK_DEFS, blockId, blockName, isWaterId, B_RENDER, RENDER } from '../world/blocks.ts';
import { WORLD_Y } from '../world/constants.ts';
import { GATE, inSanctuary } from '../gen/layout.ts';
import { packPos } from '../world/light.ts';
import type { World } from '../world/world.ts';
import type { Inventory } from './inventory.ts';

export const LOST_PACK = blockId('lost_pack');

/** Does dying here cost what you carry? Only outside the valley. */
export function losesPack(x: number, z: number): boolean { return !inSanctuary(x, z); }

/** A cell the pack can be left in: open air, water or a plant, not part of the gate, holding nothing. */
function free(world: World, x: number, y: number, z: number): boolean {
  if (y < 1 || y >= WORLD_Y - 1) return false; // the block could not be set there
  if (x >= GATE.x0 && x < GATE.x1 && y >= GATE.y0 && y < GATE.y1 && z >= GATE.z0 && z < GATE.z1) return false;
  const id = world.blockAt(x, y, z);
  if (BLOCK_DEFS[id]?.container) return false;
  // Wild plants can be flattened; a set snare or a crop someone planted cannot.
  if (/^(snare|crop_)/.test(blockName(id))) return false;
  return id === AIR || isWaterId(id) || (!B_SOLID[id] && B_RENDER[id] === RENDER.cross);
}

/** The nearest free cell to (x, y, z), resting on something where it can, or null if none is near. */
export function packSpot(world: World, x: number, y: number, z: number): [number, number, number] | null {
  const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
  let best: [number, number, number] | null = null, bestScore = Infinity;
  for (let dy = -3; dy <= 3; dy++)
    for (let dz = -3; dz <= 3; dz++)
      for (let dx = -3; dx <= 3; dx++) {
        const cx = fx + dx, cy = fy + dy, cz = fz + dz;
        if (!free(world, cx, cy, cz)) continue;
        // Nearer is better; a cell on the ground (not hanging in the air) is better still.
        const grounded = B_SOLID[world.blockAt(cx, cy - 1, cz)] ? 0 : 2;
        const score = dx * dx + dy * dy + dz * dz + grounded;
        if (score < bestScore) { bestScore = score; best = [cx, cy, cz]; }
      }
  return best;
}

/**
 * Leaves everything carried in a lost pack near (x, y, z) and empties the pack. The sack holds
 * exactly the carried slots. Returns where it was left, or null if there was nowhere (nothing is lost then).
 */
export function leaveLostPack(world: World, inv: Inventory, x: number, y: number, z: number): [number, number, number] | null {
  if (inv.slots.every((s) => !s)) return null;
  const at = packSpot(world, x, y, z);
  if (!at) return null;
  if (!world.setBlock(at[0], at[1], at[2], LOST_PACK)) return null; // nothing is lost then
  world.containers.set(packPos(at[0], at[1], at[2]), inv.slots.map((s) => (s ? { ...s } : null)));
  inv.slots = inv.slots.map(() => null);
  return at;
}
