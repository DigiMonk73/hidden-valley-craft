// What the player carries: 36 slots (the first 9 are the hotbar), 45 with the expedition backpack.
// Holds blocks and items alike. Tools wear with use and break when worn out.

import { itemId, itemName, maxStack, toolOf } from '../world/items.ts';
import { ITEM_ALIASES, type Slot } from '../save/save.ts';

export interface Stack { id: number; count: number; wear?: number }

export const HOTBAR = 9;
export const BASE_SLOTS = 36;
export const BACKPACK_SLOTS = 45;

export class Inventory {
  slots: (Stack | null)[];
  selected = 0;
  /** Builder's mode: placing never runs out. */
  creative = false;

  constructor(size = BASE_SLOTS) { this.slots = new Array(size).fill(null); }

  /** What the player starts with in their hands: the builder's coat-hook tools. The rest is in the home. */
  static starter(): Inventory {
    const inv = new Inventory();
    const kit: [string, number][] = [['steel_pickaxe', 1], ['steel_axe', 1], ['steel_shovel', 1], ['lantern', 8], ['canned_food', 2]];
    kit.forEach(([n, c], i) => (inv.slots[i] = { id: itemId(n), count: c }));
    return inv;
  }

  get size(): number { return this.slots.length; }

  clone(): Inventory {
    const c = new Inventory(this.slots.length);
    c.slots = this.slots.map((s) => (s ? { ...s } : null));
    c.selected = this.selected;
    c.creative = this.creative;
    return c;
  }

  /** Puts a stack anywhere it fits, keeping its wear; returns what is left over (null if all of it fitted). */
  stow(s: Stack): Stack | null {
    if (s.wear === undefined) {
      const left = this.add(s.id, s.count);
      return left > 0 ? { id: s.id, count: left } : null;
    }
    const empty = this.slots.findIndex((x) => !x);
    if (empty < 0) return s;
    this.slots[empty] = s;
    return null;
  }
  get current(): Stack | null { return this.slots[this.selected]; }

  select(i: number): void { this.selected = ((i % HOTBAR) + HOTBAR) % HOTBAR; }

  /** Opens the backpack's extra row. */
  grow(size: number): void { while (this.slots.length < size) this.slots.push(null); }

  /** Adds items: onto matching stacks first (hotbar first), then into empty slots. Returns what didn't fit. */
  add(id: number, count = 1): number {
    const max = maxStack(id);
    for (const s of this.slots) {
      if (count <= 0) return 0;
      if (s && s.id === id && s.count < max && s.wear === undefined) {
        const n = Math.min(count, max - s.count);
        s.count += n;
        count -= n;
      }
    }
    for (let i = 0; i < this.slots.length && count > 0; i++) {
      if (this.slots[i]) continue;
      const n = Math.min(count, max);
      this.slots[i] = { id, count: n };
      count -= n;
    }
    return count;
  }

  /** How many more of an item would fit. */
  room(id: number): number {
    const max = maxStack(id);
    return this.slots.reduce((n, s) => n + (!s ? max : s.id === id && s.wear === undefined ? Math.max(0, max - s.count) : 0), 0);
  }

  count(id: number): number {
    return this.slots.reduce((n, s) => n + (s && s.id === id ? s.count : 0), 0);
  }

  /** Takes `count` of an item from anywhere; all or nothing. */
  remove(id: number, count = 1): boolean {
    if (this.count(id) < count) return false;
    for (let i = this.slots.length - 1; i >= 0 && count > 0; i--) {
      const s = this.slots[i];
      if (!s || s.id !== id) continue;
      const n = Math.min(count, s.count);
      s.count -= n;
      count -= n;
      if (s.count <= 0) this.slots[i] = null;
    }
    return true;
  }

  /** Uses one of the selected stack (placing a block, eating); returns its id, or 0 if there was none. */
  take(): number {
    const s = this.current;
    if (!s) return 0;
    if (this.creative) return s.id;
    s.count--;
    if (s.count <= 0) this.slots[this.selected] = null;
    return s.id;
  }

  /** Wears the selected tool by one use; returns true if it broke. */
  wearTool(): boolean {
    const s = this.current;
    const tool = s && toolOf(s.id);
    if (!s || !tool || this.creative) return false;
    s.wear = (s.wear ?? 0) + 1;
    if (s.wear >= tool.uses) { this.slots[this.selected] = null; return true; }
    return false;
  }

  toSave(): (Slot | null)[] {
    return this.slots.map((s) => (s ? { name: itemName(s.id), count: s.count, ...(s.wear ? { wear: s.wear } : {}) } : null));
  }

  static fromSave(slots: (Slot | null)[], selected: number): Inventory {
    // A pack is 36 slots or, with the expedition backpack, 45: never some other size. (A save made with an item
    // held and no room once grew the pack by a slot for good; what does not fit is the save's `spill` now.)
    const inv = new Inventory(slots.length > BASE_SLOTS ? BACKPACK_SLOTS : BASE_SLOTS);
    slots.slice(0, inv.size).forEach((s, i) => {
      if (!s) return;
      const name = ITEM_ALIASES[s.name] ?? s.name;
      try { inv.slots[i] = { id: itemId(name), count: Math.min(maxStack(itemId(name)), s.count), ...(s.wear ? { wear: s.wear } : {}) }; } catch { /* an item that no longer exists */ }
    });
    inv.selected = ((Math.floor(selected) % HOTBAR) + HOTBAR) % HOTBAR || 0;
    return inv;
  }
}

/** Moves between two slot arrays the way inventory screens do: put down, pick up, swap or merge. */
export function clickSlot(slots: (Stack | null)[], i: number, cursor: Stack | null, half: boolean): Stack | null {
  const here = slots[i];
  if (!cursor) {
    if (!here) return null;
    if (half && here.count > 1) {
      const n = Math.ceil(here.count / 2);
      here.count -= n;
      return { id: here.id, count: n };
    }
    slots[i] = null;
    return here;
  }
  if (!here) {
    if (half) {
      slots[i] = { id: cursor.id, count: 1, ...(cursor.wear ? { wear: cursor.wear } : {}) };
      cursor.count--;
      return cursor.count > 0 ? cursor : null;
    }
    slots[i] = cursor;
    return null;
  }
  const max = maxStack(here.id);
  if (here.id === cursor.id && here.wear === undefined && cursor.wear === undefined && here.count < max) {
    const n = Math.min(half ? 1 : cursor.count, max - here.count);
    here.count += n;
    cursor.count -= n;
    return cursor.count > 0 ? cursor : null;
  }
  slots[i] = cursor;
  return here;
}

/** Shift-click: moves a whole stack from one set of slots into a range of another, merging where it can. */
export function quickMove(from: (Stack | null)[], i: number, to: (Stack | null)[], start = 0, end = to.length): void {
  const s = from[i];
  if (!s) return;
  const max = maxStack(s.id);
  for (let k = start; k < end; k++) {
    const t = to[k];
    if (t && t !== s && t.id === s.id && t.wear === undefined && s.wear === undefined && t.count < max) {
      const n = Math.min(s.count, max - t.count);
      t.count += n; s.count -= n;
      if (s.count === 0) { from[i] = null; return; }
    }
  }
  for (let k = start; k < end; k++) {
    if (!to[k]) { to[k] = s; from[i] = null; return; }
  }
}
