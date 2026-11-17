// What the inventory screen's cursor may do with the stack it holds, kept apart from the screen so it
// can be tested: nothing is ever duplicated, and nothing real is ever lost.

import { maxStack } from '../world/items.ts';
import type { Inventory, Stack } from './inventory.ts';

/**
 * The cursor's stack, and whether it came from the builder's palette. Blocks from the palette are free:
 * picking another block puts them back on the palette, and any that don't fit on closing simply go.
 */
export interface Held { stack: Stack | null; fromPalette: boolean }

/** Picks a block off the palette. Real items held are put in the pack first, and only if all of them fit. */
export function pickFromPalette(inv: Inventory, held: Held, id: number): Held | null {
  if (held.stack && !held.fromPalette) {
    const trial = inv.clone();
    if (trial.stow({ ...held.stack })) return null; // no room: keep holding them
    inv.slots = trial.slots;
  }
  return { stack: { id, count: maxStack(id) }, fromPalette: true };
}

/**
 * Puts the held stack away on closing: into the pack, then a spare slot of an open chest. Returns what
 * is still held; palette blocks that don't fit are let go, so the screen can always close in builder's mode.
 */
export function putAway(inv: Inventory, held: Held, chest: (Stack | null)[] | null): Stack | null {
  if (!held.stack) return null;
  let left = inv.stow(held.stack);
  if (left && chest) {
    const spare = chest.findIndex((s) => !s);
    if (spare >= 0) { chest[spare] = left; left = null; }
  }
  return held.fromPalette ? null : left;
}
