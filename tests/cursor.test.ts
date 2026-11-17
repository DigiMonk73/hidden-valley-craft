import { describe, it, expect } from 'vitest';
import { Inventory } from '../src/sim/inventory.ts';
import { pickFromPalette, putAway } from '../src/sim/cursor.ts';
import { make, RECIPES } from '../src/sim/crafting.ts';
import { itemId } from '../src/world/items.ts';
import { blockId } from '../src/world/blocks.ts';

const full = (id: number) => { const inv = new Inventory(); while (inv.add(id, 64) === 0); return inv; };

describe('the inventory screen’s cursor (re-check, Phase 2)', () => {
  it('a full pack in builder’s mode: palette blocks can be let go, so the screen always closes', () => {
    const inv = full(itemId('flint'));
    const held = pickFromPalette(inv, { stack: null, fromPalette: false }, blockId('planks'))!;
    expect(held.fromPalette).toBe(true);
    expect(putAway(inv, held, null)).toBeNull();
  });

  it('picking from the palette while holding a part-fitting stack never duplicates it', () => {
    const inv = full(itemId('flint'));
    inv.slots[0] = { id: blockId('planks'), count: 60 }; // room for 4 more planks
    const before = inv.count(blockId('planks'));
    const held = { stack: { id: blockId('planks'), count: 64 }, fromPalette: false };
    expect(pickFromPalette(inv, held, blockId('cobble'))).toBeNull(); // doesn't all fit: nothing happens
    expect(inv.count(blockId('planks'))).toBe(before);
    expect(held.stack.count).toBe(64);
  });

  it('real things that cannot be put away keep the screen open', () => {
    const inv = full(itemId('flint'));
    expect(putAway(inv, { stack: { id: itemId('coal'), count: 3 }, fromPalette: false }, null)).toEqual({ id: itemId('coal'), count: 3 });
  });

  it('making something refuses when it would leave no room for what is held', () => {
    const inv = full(itemId('flint'));
    inv.slots[0] = { id: blockId('log'), count: 1 };
    const planks = RECIPES.find((r) => r.out[0] === blockId('planks') && r.station === 'hand')!;
    // The log's slot becomes planks: the coal on the cursor would then have nowhere to go.
    expect(make(inv, planks, { id: itemId('coal'), count: 1 })).toBe('full');
    expect(make(inv, planks, null)).toBe('made');
  });
});
