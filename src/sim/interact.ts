// Mining and placing: what happens to the world and the hotbar when the player breaks or places a
// block. Kept apart from the game loop so it can be tested on its own.

import { AIR, WATER, B_RENDER, B_SOLID, RENDER, isWaterId, facingVariant, blockName, blockId } from '../world/blocks.ts';
import { dropOf, isBlockItem } from '../world/items.ts';
import { packPos } from '../world/light.ts';
import { cropDrops } from './farming.ts';
import type { World } from '../world/world.ts';
import type { Inventory } from './inventory.ts';
import type { RayHit } from './raycast.ts';

const HEARTH_FIRE = blockId('hearth_fire'), HEARTH_FLAMES = blockId('hearth_flames');

export interface Body { intersectsBlock(x: number, y: number, z: number): boolean; yaw?: number }

/** Breaks a block. Returns false if nothing changed; `full` is set when a drop didn't fit. */
export function breakBlock(world: World, hotbar: Inventory, x: number, y: number, z: number): { changed: boolean; full: boolean; keepsItems?: boolean } {
  const id = world.blockAt(x, y, z);
  // A chest that still holds things stays put: empty it first.
  const held = world.containerAt(x, y, z);
  if (held?.some(Boolean)) return { changed: false, full: false, keepsItems: true };
  // Crops give their harvest; everything else its one drop. A plant on top loses its footing and drops too.
  const above = world.blockAt(x, y + 1, z);
  const plantAbove = B_RENDER[above] === RENDER.cross;
  // A hearth fire's flames stand in the block above it, and go out with it.
  const flamesAbove = id === HEARTH_FIRE && above === HEARTH_FLAMES;
  const drops: [number, number][] = [...(cropDrops(id) ?? [[dropOf(id), 1]]), ...(plantAbove ? cropDrops(above) ?? [[dropOf(above), 1]] : [])];
  // Nothing is ever lost: if the pack can't take everything, the block stays where it is.
  if (!hotbar.creative) {
    const trial = hotbar.clone();
    if (drops.some(([item, n]) => item && n > 0 && trial.add(item, n) > 0)) return { changed: false, full: true };
  }
  // A broken block next to water lets the water in (still water, for now).
  const besideWater = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]].some(([a, b, c]) => isWaterId(world.blockAt(x + a, y + b, z + c)));
  if (!world.setBlock(x, y, z, besideWater ? WATER : AIR)) return { changed: false, full: false };
  // An emptied chest's record stays (empty), so a chest put back here never refills with the builder's things.
  if (held) world.containers.set(packPos(x, y, z), held.map(() => null));
  if (plantAbove || flamesAbove) world.setBlock(x, y + 1, z, AIR);
  if (!hotbar.creative) for (const [item, n] of drops) if (item && n > 0) hotbar.add(item, n);
  return { changed: true, full: false };
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
  if (id === HEARTH_FIRE && world.blockAt(x, y + 1, z) === AIR) world.setBlock(x, y + 1, z, HEARTH_FLAMES); // a fire set down burns
  hotbar.take();
  return [x, y, z];
}

/**
 * Opens or shuts a door: every connected block of it (both halves, both leaves). It won't shut on
 * someone standing in it ('blocked'). Returns false if the block isn't a door.
 */
export function toggleDoor(world: World, x: number, y: number, z: number, occupied: (x: number, y: number, z: number) => boolean = () => false): boolean | 'blocked' {
  const from = world.blockAt(x, y, z);
  const door = (id: number) => blockName(id).match(/^(steel_door|door_wood_r|door_wood)(_open)?(@\w+)?$/);
  const m = door(from);
  if (!m) return false;
  // A double door's two leaves (door_wood and door_wood_r) open and shut together.
  const family = (name: string) => name.replace(/_r$/, '');
  const swung = (id: number) => { const d = door(id)!; return blockId(d[1] + (d[2] ? '' : '_open') + (d[3] ?? '')); };
  // The door's parts: the same block, joined up, down and sideways (a few blocks at most).
  const parts: [number, number, number][] = [];
  const seen = new Set<string>();
  const stack: [number, number, number][] = [[x, y, z]];
  while (stack.length && parts.length < 8) {
    const [a, b, c] = stack.pop()!;
    const k = `${a},${b},${c}`;
    const part = door(world.blockAt(a, b, c));
    if (seen.has(k) || !part || family(part[1]) !== family(m[1]) || part[2] !== m[2] || part[3] !== m[3]) continue;
    seen.add(k);
    parts.push([a, b, c]);
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) stack.push([a + dx, b + dy, c + dz]);
  }
  const shutting = !!m[2];
  if (shutting && parts.some(([a, b, c]) => occupied(a, b, c))) return 'blocked'; // never shut on someone
  for (const [a, b, c] of parts) world.setBlock(a, b, c, swung(world.blockAt(a, b, c)));
  return true;
}
