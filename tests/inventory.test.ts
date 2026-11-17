import { describe, it, expect } from 'vitest';
import { Inventory, clickSlot, quickMove, type Stack } from '../src/sim/inventory.ts';
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
});
