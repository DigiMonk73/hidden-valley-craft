import { describe, it, expect } from 'vitest';
import itemsData from '../data/items.json' with { type: 'json' };
import { recipesAt, make } from '../src/sim/crafting.ts';
import { Inventory } from '../src/sim/inventory.ts';
import { itemId, hasItem, foodOf } from '../src/world/items.ts';
import { blockId } from '../src/world/blocks.ts';
import { hasIcon } from '../src/render/itemIcons.ts';
import { KINDS } from '../src/entity/creatures.ts';

describe('what the wild gives, and what is made of it', () => {
  it('every item has a drawn icon', () => {
    for (const it of itemsData.items) expect(hasIcon(it.icon), it.name).toBe(true);
  });

  it('every creature drop is a real item', () => {
    for (const k of Object.values(KINDS)) for (const [name] of k.drops) expect(hasItem(name), name).toBe(true);
  });

  it('meat cooks at the stove into better food', () => {
    for (const m of ['rabbit', 'venison', 'pork']) {
      const inv = new Inventory();
      inv.add(itemId(`${m}_raw`), 1);
      const r = recipesAt('stove').find((x) => x.out[0] === itemId(`${m}_cooked`))!;
      expect(make(inv, r)).toBe('made');
      expect(inv.count(itemId(`${m}_cooked`))).toBe(1);
      expect(foodOf(itemId(`${m}_cooked`))!.hunger!).toBeGreaterThan(foodOf(itemId(`${m}_raw`))!.hunger! * 4);
    }
  });

  it('the tannery turns hide into leather, and the workbench leather into armour', () => {
    const inv = new Inventory();
    inv.add(itemId('hide'), 3);
    inv.add(itemId('salt'), 3);
    inv.add(itemId('cordage'), 2);
    const tan = recipesAt('tannery', new Set(['books_read'])).find((x) => x.in[0][0] === itemId('hide'))!;
    for (let k = 0; k < 3; k++) expect(make(inv, tan)).toBe('made');
    expect(inv.count(itemId('leather'))).toBe(6);
    const armour = recipesAt('workbench').find((x) => x.out[0] === itemId('leather_armor'))!;
    expect(make(inv, armour)).toBe('made');
    expect(inv.count(itemId('leather_armor'))).toBe(1);
  });

  it('the workbench makes snares and the hutch; the anvil makes arrowheads', () => {
    expect(recipesAt('workbench').some((r) => r.out[0] === blockId('snare'))).toBe(true);
    expect(recipesAt('workbench').some((r) => r.out[0] === blockId('hutch'))).toBe(true);
    expect(recipesAt('anvil', new Set(['books_read'])).some((r) => r.out[0] === itemId('arrowhead'))).toBe(true);
    expect(recipesAt('workbench').some((r) => r.out[0] === itemId('arrow') && r.in.some(([id]) => id === itemId('arrowhead')))).toBe(true);
  });
});
