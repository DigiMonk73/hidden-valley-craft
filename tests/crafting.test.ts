import { describe, it, expect } from 'vitest';
import { RECIPES, recipesAt, make, canMake, stationOf } from '../src/sim/crafting.ts';
import { Inventory } from '../src/sim/inventory.ts';
import { itemId } from '../src/world/items.ts';
import { blockId } from '../src/world/blocks.ts';

describe('crafting', () => {
  it('every recipe has at most four kinds of input and names only real items', () => {
    expect(RECIPES.length).toBeGreaterThan(20);
    for (const r of RECIPES) expect(r.in.length).toBeLessThanOrEqual(4);
  });

  it('smelting takes ore and charcoal and gives an ingot', () => {
    const inv = new Inventory();
    inv.add(blockId('iron_ore'), 2);
    inv.add(itemId('charcoal'), 1);
    const r = recipesAt('smelter')[0];
    expect(make(inv, r)).toBe('made');
    expect(inv.count(itemId('iron_ingot'))).toBe(1);
    expect(make(inv, r)).toBe('short'); // out of charcoal
    expect(inv.count(blockId('iron_ore'))).toBe(1);
  });

  it('coffee uses a jug of water and gives the empty jug back', () => {
    const inv = new Inventory();
    inv.add(itemId('coffee_beans'), 3);
    inv.add(itemId('water_jug'), 1);
    const r = recipesAt('stove').find((x) => x.out[0] === itemId('coffee'))!;
    expect(make(inv, r)).toBe('made');
    expect(inv.count(itemId('coffee'))).toBe(3);
    expect(inv.count(itemId('empty_jug'))).toBe(1);
  });

  it('a bookshelf needs the journal in hand but does not use it up', () => {
    const inv = new Inventory();
    inv.add(blockId('planks'), 6);
    const r = recipesAt('workbench').find((x) => x.out[0] === blockId('bookshelf'))!;
    expect(canMake(inv, r)).toBe(false);
    inv.add(itemId('builders_journal'), 1);
    expect(make(inv, r)).toBe('made');
    expect(inv.count(itemId('builders_journal'))).toBe(1);
  });

  it('the stove and the fireplace both cook, whichever way they face', () => {
    expect(stationOf(blockId('stove@west'))).toBe('stove');
    expect(stationOf(blockId('fireplace@south'))).toBe('stove');
    expect(stationOf(blockId('limestone'))).toBeNull();
  });
});

describe('crafting into a full pack', () => {
  it('makes nothing (and uses nothing) when the result would not fit', () => {
    const inv = new Inventory(2);
    inv.slots[0] = { id: blockId('log'), count: 5 };
    inv.slots[1] = { id: itemId('flint'), count: 64 };
    const planks = recipesAt('hand').find((x) => x.out[0] === blockId('planks'))!;
    expect(make(inv, planks)).toBe('full');
    expect(inv.count(blockId('log'))).toBe(5);
    inv.slots[1] = null;
    expect(make(inv, planks)).toBe('made');
    expect(inv.count(blockId('planks'))).toBe(4);
  });
});
