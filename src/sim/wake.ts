// Where you wake after a death, or arrive when you hold H: a place you can stand, with ground under it.
// The wake point is wherever you last slept, and the world can change after that: blocks stacked on it, a shaft
// dug under it, the bed carried out of the valley. (docs/REVIEW.md N3e; docs/FIXES.md, 3.) Pure.

import { B_SOLID } from '../world/blocks.ts';
import { inSanctuary } from '../gen/layout.ts';

export interface Spot { x: number; y: number; z: number; yaw: number }
type BlockAt = (x: number, y: number, z: number) => number;

/** The deepest drop under the feet that still counts as ground to wake on. */
export const WAKE_DROP = 3;

/** Can a body stand with its feet in this cell: two free cells, and something solid within a short drop below? */
export function standable(blockAt: BlockAt, bx: number, by: number, bz: number): boolean {
  if (B_SOLID[blockAt(bx, by, bz)] || B_SOLID[blockAt(bx, by + 1, bz)]) return false;
  for (let d = 1; d <= WAKE_DROP + 1; d++) if (B_SOLID[blockAt(bx, by - d, bz)]) return true;
  return false;
}

/**
 * The nearest cell to (x, y, z) that can be stood in, within `r` blocks across and three up or down, as the
 * middle of that cell; null if there is none. The cell itself wins if it will do.
 */
export function findStand(blockAt: BlockAt, x: number, y: number, z: number, r: number): [number, number, number] | null {
  const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
  let best: [number, number, number] | null = null, bestD = Infinity;
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) for (let dy = -3; dy <= 3; dy++) {
    const d = dx * dx + dz * dz + dy * dy * 1.5;
    if (d >= bestD || !standable(blockAt, bx + dx, by + dy, bz + dz)) continue;
    // Stand on the ground there, not in the air above it.
    let fy = by + dy;
    while (!B_SOLID[blockAt(bx + dx, fy - 1, bz + dz)]) fy--;
    best = [bx + dx + 0.5, fy, bz + dz + 0.5];
    bestD = d;
  }
  return best;
}

/** The place to wake: where you last slept, if that is still inside the valley; otherwise the balcony. */
export function wakeFrom(spawn: Spot, balcony: Spot): Spot {
  return inSanctuary(spawn.x, spawn.z) ? spawn : balcony;
}

/**
 * Once the land at the wake point is in: where to stand. The point itself if it is free with ground under it;
 * else the nearest such place within three blocks; else the same search, wider, round the balcony.
 * `moved` says why the spot is not the wake point: 'near' (something stands there or the ground is gone) or
 * 'balcony' (nowhere near it will do); null when it is the point itself, or when nowhere at all was found.
 */
export function settleWake(blockAt: BlockAt, at: Spot, balcony: Spot): { x: number; y: number; z: number; moved: 'near' | 'balcony' | null } {
  const bx = Math.floor(at.x), by = Math.floor(at.y), bz = Math.floor(at.z);
  const solid = (y: number) => !!B_SOLID[blockAt(bx, y, bz)];
  // Standing on a slab or a stair the feet are part-way up a cell that is itself solid: the room is above it.
  const onPart = at.y - by > 0.01;
  const fine = onPart ? solid(by) && !solid(by + 1) && !solid(by + 2) : standable(blockAt, bx, by, bz) && solid(by - 1);
  if (fine) return { x: at.x, y: at.y, z: at.z, moved: null };
  const near = findStand(blockAt, at.x, at.y, at.z, 3);
  if (near) return { x: near[0], y: near[1], z: near[2], moved: near[0] === at.x && near[1] === at.y && near[2] === at.z ? null : 'near' };
  const home = findStand(blockAt, balcony.x, balcony.y, balcony.z, 8);
  if (home) return { x: home[0], y: home[1], z: home[2], moved: 'balcony' };
  return { x: at.x, y: at.y, z: at.z, moved: null };
}
