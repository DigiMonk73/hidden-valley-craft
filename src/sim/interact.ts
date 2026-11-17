// Mining and placing: what happens to the world and the hotbar when the player breaks or places a
// block. Kept apart from the game loop so it can be tested on its own.

import { AIR, WATER, B_RENDER, B_SOLID, RENDER, isWaterId, facingVariant, blockName, blockId } from '../world/blocks.ts';
import { dropOf, isBlockItem } from '../world/items.ts';
import { packPos } from '../world/light.ts';
import { cropDrops } from './farming.ts';
import type { World } from '../world/world.ts';
import type { Inventory } from './inventory.ts';
import type { RayHit } from './raycast.ts';

export interface Body { intersectsBlock(x: number, y: number, z: number): boolean; yaw?: number }

/** Breaks a block. Returns false if nothing changed; `full` is set when a drop didn't fit. */
export function breakBlock(world: World, hotbar: Inventory, x: number, y: number, z: number): { changed: boolean; full: boolean; keepsItems?: boolean } {
  const id = world.blockAt(x, y, z);
  // A chest that still holds things stays put: empty it first.
  const held = world.containerAt(x, y, z);
  if (held?.some(Boolean)) return { changed: false, full: false, keepsItems: true };
  // A broken block next to water lets the water in (still water, for now).
  const besideWater = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]].some(([a, b, c]) => isWaterId(world.blockAt(x + a, y + b, z + c)));
  if (!world.setBlock(x, y, z, besideWater ? WATER : AIR)) return { changed: false, full: false };
  if (held) world.containers.delete(packPos(x, y, z));
  let full = false;
  // Crops give their harvest; everything else its one drop.
  const drops = cropDrops(id) ?? [[dropOf(id), 1]];
  for (const [item, n] of drops) if (item && n > 0 && !hotbar.creative && hotbar.add(item, n) > 0) full = true;
  // Plants on top lose their footing.
  const above = world.blockAt(x, y + 1, z);
  if (B_RENDER[above] === RENDER.cross && world.setBlock(x, y + 1, z, AIR) && !hotbar.creative) { const d = dropOf(above); if (d) hotbar.add(d); }
  return { changed: true, full };
}

/** Where a placed block would go for this target: into a plant, else against the face looked at. */
export function placeTarget(t: RayHit): [number, number, number] {
  const intoPlant = B_RENDER[t.id] === RENDER.cross;
  return intoPlant ? [t.x, t.y, t.z] : [t.x + t.nx, t.y + t.ny, t.z + t.nz];
}

/** Places the selected block. The hotbar only pays for a block that was actually placed. */
export function placeBlock(world: World, hotbar: Inventory, body: Body, t: RayHit): [number, number, number] | null {
  const stack = hotbar.current;
  if (!stack || !isBlockItem(stack.id)) return null; // only blocks are placed; items are used
  const [x, y, z] = placeTarget(t);
  const there = world.blockAt(x, y, z);
  if (there !== AIR && !isWaterId(there) && B_RENDER[there] !== RENDER.cross) return null;
  // Furniture with a front (chairs, stoves, stairs…) turns to face whoever places it.
  const id = facingVariant(stack.id, body.yaw ?? 0);
  if (B_SOLID[id] && body.intersectsBlock(x, y, z)) return null;
  if (B_RENDER[id] === RENDER.cross && !B_SOLID[world.blockAt(x, y - 1, z)]) return null; // plants need ground
  if (!world.setBlock(x, y, z, id)) return null; // outside the world, or not loaded
  hotbar.take();
  return [x, y, z];
}

/** Opens or shuts a door: the block and the door blocks stacked with it. Returns false if it isn't a door. */
export function toggleDoor(world: World, x: number, y: number, z: number): boolean {
  const name = blockName(world.blockAt(x, y, z));
  const m = name.match(/^(steel_door)(_open)?(@\w+)?$/);
  if (!m) return false;
  const next = m[1] + (m[2] ? '' : '_open') + (m[3] ?? '');
  const from = world.blockAt(x, y, z);
  // Find the whole stack of this door, then swap every part.
  let y0 = y, y1 = y;
  while (world.blockAt(x, y0 - 1, z) === from) y0--;
  while (world.blockAt(x, y1 + 1, z) === from) y1++;
  for (let k = y0; k <= y1; k++) world.setBlock(x, k, z, blockId(next));
  return true;
}
