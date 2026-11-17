import { describe, it, expect } from 'vitest';
import { World } from '../src/world/world.ts';
import { runJob, type GenResult } from '../src/jobs/tasks.ts';
import { Inventory } from '../src/sim/inventory.ts';
import { till, sow, grow, pickCoffee, cropDrops, FARMLAND } from '../src/sim/farming.ts';
import { breakBlock } from '../src/sim/interact.ts';
import { blockId, blockName, AIR } from '../src/world/blocks.ts';
import { itemId } from '../src/world/items.ts';
import { GARDEN, VALLEY } from '../src/gen/layout.ts';

function valley(): World {
  const w = new World();
  for (let cz = 30; cz <= 33; cz++) for (let cx = 53; cx <= 56; cx++)
    w.addColumn(cx, cz, (runJob({ kind: 'gen', cx, cz, edits: [] }).result as GenResult).chunks);
  return w;
}

describe('the garden', () => {
  it('the builder’s garden is planted at mixed stages, with a coffee grove', () => {
    const w = valley();
    const seen = new Set<string>();
    for (let z = GARDEN.z0; z < GARDEN.z1; z++) for (let x = GARDEN.x0; x < GARDEN.x1; x++) {
      const n = blockName(w.blockAt(x, VALLEY.floor, z));
      if (n.startsWith('crop_') || n.startsWith('coffee_')) seen.add(n.replace(/_\d$/, ''));
    }
    for (const k of ['crop_corn', 'crop_beans', 'crop_squash', 'crop_tomato', 'crop_pepper', 'crop_potato', 'crop_herbs', 'coffee_bush']) expect(seen.has(k), k).toBe(true);
  });

  it('till, sow, grow to ripe and harvest: produce and seed', () => {
    const w = valley();
    const inv = new Inventory();
    inv.slots[0] = { id: itemId('seeds_corn'), count: 2 };
    const x = 1700, z = 990, y = VALLEY.floor - 1;
    w.setBlock(x, y, z, blockId('grass'));
    w.setBlock(x, y + 1, z, AIR);
    expect(till(w, x, y, z)).toBe(true);
    expect(w.blockAt(x, y, z)).toBe(FARMLAND);
    expect(sow(w, inv, x, y, z)).toBe(true);
    expect(inv.count(itemId('seeds_corn'))).toBe(1);
    for (let k = 0; k < 3; k++) expect(grow(w, x, y + 1, z)).toBe(true);
    expect(grow(w, x, y + 1, z)).toBe(false); // ripe: no further
    expect(cropDrops(w.blockAt(x, y + 1, z))).toEqual([[itemId('corn'), 3], [itemId('seeds_corn'), 2]]);
    breakBlock(w, inv, x, y + 1, z);
    expect(inv.count(itemId('corn'))).toBe(3);
    expect(inv.count(itemId('seeds_corn'))).toBe(3);
  });

  it('crops need light: nothing grows in a dark cave', () => {
    const w = valley();
    const x = 1700, z = 990, y = VALLEY.floor - 1;
    w.setBlock(x, y, z, FARMLAND);
    w.setBlock(x, y + 1, z, blockId('crop_beans_0'));
    for (let dy = 2; dy < 5; dy++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) w.setBlock(x + dx, y + dy, z + dz, blockId('limestone'));
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (dx || dz) for (let dy = 1; dy < 2; dy++) w.setBlock(x + dx, y + dy, z + dz, blockId('limestone'));
    expect(grow(w, x, y + 1, z)).toBe(false);
  });

  it('ripe coffee is picked and the bush stays', () => {
    const w = valley();
    const inv = new Inventory();
    w.setBlock(1700, VALLEY.floor, 991, blockId('coffee_bush_2'));
    expect(pickCoffee(w, inv, 1700, VALLEY.floor, 991)).toBe(true);
    expect(blockName(w.blockAt(1700, VALLEY.floor, 991))).toBe('coffee_bush_1');
    expect(inv.count(itemId('coffee_beans'))).toBe(3);
  });
});
