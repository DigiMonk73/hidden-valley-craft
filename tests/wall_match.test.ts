import { describe, it, expect } from 'vitest';
import { World } from '../src/world/world.ts';
import { runJob, type GenResult } from '../src/jobs/tasks.ts';
import { blockId, blockName, AIR } from '../src/world/blocks.ts';
import { Inventory } from '../src/sim/inventory.ts';
import { breakBlock, placeBlock } from '../src/sim/interact.ts';
import { make, RECIPES } from '../src/sim/crafting.ts';
import { HOME } from '../src/gen/layout.ts';

// The owner (2026-11-19): a block mined out of the cave wall and put back did not match. Limestone
// dropped rubble, a different block, and there was no way to get the smooth wall back.
describe('a mined wall block goes back as it was', () => {
  const living = HOME.rooms.find((r) => r.name === 'living')!;
  const w = new World();
  for (let cz = 31; cz <= 32; cz++) for (let cx = 55; cx <= 57; cx++) w.addColumn(cx, cz, (runJob({ kind: 'gen', cx, cz, edits: [] }).result as GenResult).chunks);
  // A block of the living room's north wall, at head height (west of the hearth).
  const [x, y, z] = [living.x0 + 1, living.y0 + 2, living.z0 - 1];

  it('the cave wall is limestone, and mining it gives limestone', () => {
    const wall = w.blockAt(x, y, z);
    expect(blockName(wall)).toMatch(/^limestone/);
    const inv = new Inventory();
    expect(breakBlock(w, inv, x, y, z).changed).toBe(true);
    expect(inv.count(wall)).toBe(1);
    // Put back, it is the very same block.
    inv.select(inv.slots.findIndex((s) => s && s.id === wall));
    const placed = placeBlock(w, inv, { intersectsBlock: () => false }, { x, y: y, z: z + 1, nx: 0, ny: 0, nz: -1, id: AIR, dist: 1 } as never);
    expect(placed).toEqual([x, y, z]);
    expect(w.blockAt(x, y, z)).toBe(wall);
  });

  it('rubble is still to be had: limestone breaks down to it by hand', () => {
    const inv = new Inventory();
    inv.add(blockId('limestone'), 3);
    const r = RECIPES.find((q) => q.station === 'hand' && q.out[0] === blockId('cobble') && q.in[0][0] === blockId('limestone'))!;
    expect(make(inv, r)).toBe('made');
    expect(inv.count(blockId('cobble'))).toBe(1);
  });
});
