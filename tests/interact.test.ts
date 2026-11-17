import { describe, it, expect } from 'vitest';
import { World } from '../src/world/world.ts';
import { runJob, type GenResult } from '../src/jobs/tasks.ts';
import { Hotbar } from '../src/sim/hotbar.ts';
import { breakBlock, placeBlock } from '../src/sim/interact.ts';
import { blockId, AIR } from '../src/world/blocks.ts';
import { WORLD_Y } from '../src/world/constants.ts';

function world(): World {
  const w = new World();
  for (let cz = 30; cz <= 32; cz++) for (let cx = 55; cx <= 57; cx++)
    w.addColumn(cx, cz, (runJob({ kind: 'gen', cx, cz, edits: [] }).result as GenResult).chunks);
  return w;
}
const nobody = { intersectsBlock: () => false };

describe('placing and mining', () => {
  it('does not use up a block placed against the top of the world', () => {
    const w = world();
    const h = Hotbar.starter();
    const before = h.current!.count;
    w.setBlock(1800, WORLD_Y - 1, 1000, blockId('glass'));
    const placed = placeBlock(w, h, nobody, { x: 1800, y: WORLD_Y - 1, z: 1000, nx: 0, ny: 1, nz: 0, id: blockId('glass'), dist: 1 });
    expect(placed).toBeNull();
    expect(h.current!.count).toBe(before);
  });

  it('places against a face and pays one block', () => {
    const w = world();
    const h = Hotbar.starter();
    const before = h.current!.count;
    const placed = placeBlock(w, h, nobody, { x: 1808, y: 81, z: 1024, nx: 0, ny: 1, nz: 0, id: blockId('planks'), dist: 1 });
    expect(placed).toEqual([1808, 82, 1024]);
    expect(w.blockAt(1808, 82, 1024)).toBe(h.current!.id);
    expect(h.current!.count).toBe(before - 1);
  });

  it('mining gives the block and leaves air; mining under a plant takes the plant too', () => {
    const w = world();
    const h = new Hotbar();
    w.setBlock(1808, 82, 1024, blockId('dirt'));
    w.setBlock(1808, 83, 1024, blockId('fern'));
    expect(breakBlock(w, h, 1808, 82, 1024).changed).toBe(true);
    expect(w.blockAt(1808, 82, 1024)).toBe(AIR);
    expect(w.blockAt(1808, 83, 1024)).toBe(AIR);
    expect(h.slots.filter(Boolean).map((s) => s!.id).sort()).toEqual([blockId('dirt'), blockId('fern')].sort());
  });
});
