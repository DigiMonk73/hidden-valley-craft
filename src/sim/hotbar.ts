// The nine-slot hotbar. Phase 0 carries blocks only; the full inventory comes in Phase 2.

import { blockId, blockName } from '../world/blocks.ts';
import type { Slot } from '../save/save.ts';

export const STACK = 64;

export interface Stack { id: number; count: number }

export class Hotbar {
  slots: (Stack | null)[] = new Array(9).fill(null);
  selected = 0;
  /** Builder's mode: placing never runs out. */
  creative = false;

  /** What the builder left within reach: a starter set of building blocks. */
  static starter(): Hotbar {
    const h = new Hotbar();
    const kit: [string, number][] = [
      ['stone_bricks', 64], ['planks', 64], ['cobble', 64], ['glass', 32], ['lantern', 16],
      ['log', 32], ['dirt', 32], ['bamboo', 16], ['leaves', 16],
    ];
    kit.forEach(([n, c], i) => (h.slots[i] = { id: blockId(n), count: c }));
    return h;
  }

  get current(): Stack | null { return this.slots[this.selected]; }

  select(i: number): void { this.selected = ((i % 9) + 9) % 9; }

  /** Adds one block: onto a matching stack, else into the first empty slot. False if full. */
  add(id: number): boolean {
    for (const s of this.slots) if (s && s.id === id && s.count < STACK) { s.count++; return true; }
    const empty = this.slots.findIndex((s) => !s);
    if (empty < 0) return false;
    this.slots[empty] = { id, count: 1 };
    return true;
  }

  /** Uses one of the selected block; returns its id, or 0 if there is nothing to place. */
  take(): number {
    const s = this.current;
    if (!s) return 0;
    if (this.creative) return s.id;
    s.count--;
    if (s.count <= 0) this.slots[this.selected] = null;
    return s.id;
  }

  toSave(): (Slot | null)[] {
    return this.slots.map((s) => (s ? { name: blockName(s.id), count: s.count } : null));
  }

  static fromSave(slots: (Slot | null)[], selected: number): Hotbar {
    const h = new Hotbar();
    slots.slice(0, 9).forEach((s, i) => {
      if (!s) return;
      try { h.slots[i] = { id: blockId(s.name), count: Math.min(STACK, s.count) }; } catch { /* a block that no longer exists */ }
    });
    h.selected = selected;
    return h;
  }
}
