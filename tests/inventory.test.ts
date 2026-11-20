import { describe, it, expect } from 'vitest';
import { Inventory, clickSlot, quickMove, HAND, type Stack } from '../src/sim/inventory.ts';
import { itemId, mineSeconds, maxStack } from '../src/world/items.ts';
import { blockId } from '../src/world/blocks.ts';

describe('inventory', () => {
  it('stacks up to the item’s limit, then fills empty slots, and says what did not fit', () => {
    const inv = new Inventory(3);
    const can = itemId('canned_food'); // stacks to 16
    expect(inv.add(can, 40)).toBe(0);
    expect(inv.slots.map((s) => s?.count)).toEqual([16, 16, 8]);
    expect(inv.add(can, 10)).toBe(2);
    expect(inv.count(can)).toBe(48);
  });

  it('removes all or nothing', () => {
    const inv = new Inventory();
    inv.add(itemId('nails'), 5);
    expect(inv.remove(itemId('nails'), 6)).toBe(false);
    expect(inv.remove(itemId('nails'), 5)).toBe(true);
    expect(inv.count(itemId('nails'))).toBe(0);
  });

  it('tools wear with use and break when worn out', () => {
    const inv = new Inventory();
    inv.slots[0] = { id: itemId('stone_pickaxe'), count: 1 };
    for (let i = 0; i < 129; i++) expect(inv.wearTool()).toBe(false);
    expect(inv.wearTool()).toBe(true);
    expect(inv.slots[0]).toBeNull();
  });

  it('click and shift-click move, split, merge and swap stacks', () => {
    const a: (Stack | null)[] = [{ id: blockId('dirt'), count: 10 }, null];
    let cursor = clickSlot(a, 0, null, true); // right-click picks up half
    expect(cursor!.count).toBe(5);
    cursor = clickSlot(a, 1, cursor, false); // put down
    expect(cursor).toBeNull();
    expect(a.map((s) => s?.count)).toEqual([5, 5]);
    const b: (Stack | null)[] = [{ id: blockId('dirt'), count: maxStack(blockId('dirt')) - 2 }, null];
    quickMove(a, 0, b);
    expect(b.map((s) => s?.count)).toEqual([64, 3]);
  });

  it('a save keeps items, counts and wear', () => {
    const inv = Inventory.starter();
    inv.slots[0]!.wear = 12;
    const back = Inventory.fromSave(inv.toSave(), 2);
    expect(back.slots[0]).toEqual({ id: itemId('steel_pickaxe'), count: 1, wear: 12 });
    expect(back.selected).toBe(2);
  });

  it('the right tool mines much faster than bare hands', () => {
    const stone = blockId('limestone');
    expect(mineSeconds(stone, itemId('steel_pickaxe'))).toBeLessThan(mineSeconds(stone, 0) / 4);
    expect(mineSeconds(blockId('dirt'), itemId('steel_shovel'))).toBeLessThan(mineSeconds(blockId('dirt'), itemId('steel_pickaxe')));
  });

  it('the bare hand is a place on the hotbar that holds nothing, even with a full pack (the owner, 2026-11-20)', () => {
    const inv = new Inventory();
    for (let i = 0; i < inv.size; i++) inv.slots[i] = { id: itemId('canned_food'), count: 1 };
    inv.select(HAND);
    expect(inv.selected).toBe(HAND);
    expect(inv.current).toBeNull();
    expect(inv.take()).toBe(0);
    expect(inv.wearTool()).toBe(false);
    expect(inv.slots.every((s) => s && s.count === 1)).toBe(true); // nothing taken from slot 9 (index -1 wraps nowhere)
    // The wheel comes round through it at both ends: … 8, hand, 0 …
    inv.select(8); inv.select(inv.selected + 1); expect(inv.selected).toBe(HAND);
    inv.select(inv.selected + 1); expect(inv.selected).toBe(0);
    inv.select(inv.selected - 1); expect(inv.selected).toBe(HAND);
    inv.select(inv.selected - 1); expect(inv.selected).toBe(8);
    for (let i = 0; i < 9; i++) { inv.select(i); expect(inv.selected).toBe(i); } // keys 1–9 are as they were
    // It is kept in a save, and a save of slot 9 is still slot 9.
    expect(Inventory.fromSave(inv.toSave(), HAND).selected).toBe(HAND);
    expect(Inventory.fromSave(inv.toSave(), 8).selected).toBe(8);
  });
});

import { newSave, normaliseSave } from '../src/save/state.ts';
describe('the bare hand in a save', () => {
  it('a save holding the bare hand loads holding it; anything below it loads as slot 1', () => {
    const d = newSave();
    d.selected = HAND;
    expect(normaliseSave(JSON.parse(JSON.stringify(d)))!.selected).toBe(HAND);
    d.selected = -7;
    expect(normaliseSave(JSON.parse(JSON.stringify(d)))!.selected).toBe(HAND); // clamped to the nearest place
    d.selected = 4;
    expect(normaliseSave(JSON.parse(JSON.stringify(d)))!.selected).toBe(4);
  });
});
