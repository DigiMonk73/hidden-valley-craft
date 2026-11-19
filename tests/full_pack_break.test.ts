import { describe, it, expect } from 'vitest';
import { World } from '../src/world/world.ts';
import { runJob, type GenResult } from '../src/jobs/tasks.ts';
import { blockId, AIR } from '../src/world/blocks.ts';
import { itemId } from '../src/world/items.ts';
import { Inventory } from '../src/sim/inventory.ts';
import { breakBlock } from '../src/sim/interact.ts';

function balcony(): World {
  const w = new World();
  for (let cz = 31; cz <= 32; cz++) for (let cx = 55; cx <= 56; cx++) w.addColumn(cx, cz, (runJob({ kind: 'gen', cx, cz, edits: [] }).result as GenResult).chunks);
  return w;
}

// Review (Silas, 2026-11-18): with a full pack, breaking a block removed it and its drop was lost.
describe('breaking a block with a full pack', () => {
  it('keeps the block, and loses nothing', () => {
    const w = balcony();
    const [x, y, z] = [1794, 82, 1029];
    expect(w.blockAt(x, y, z)).toBe(AIR);
    w.setBlock(x, y, z, blockId('cobble'));
    const inv = new Inventory();
    while (inv.add(itemId('flint'), 64) === 0);
    const before = JSON.stringify(inv.slots);
    const r = breakBlock(w, inv, x, y, z);
    expect(r).toEqual({ changed: false, full: true });
    expect(w.blockAt(x, y, z)).toBe(blockId('cobble'));
    expect(JSON.stringify(inv.slots)).toBe(before);
  });

  it('with room, breaks it and gives the drop as before', () => {
    const w = balcony();
    const [x, y, z] = [1794, 82, 1029];
    w.setBlock(x, y, z, blockId('cobble'));
    const inv = new Inventory();
    expect(breakBlock(w, inv, x, y, z)).toEqual({ changed: true, full: false });
    expect(w.blockAt(x, y, z)).toBe(AIR);
    expect(inv.count(blockId('cobble'))).toBe(1);
  });
});
