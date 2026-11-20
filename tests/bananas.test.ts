// The banana bunch (docs/PHASE9B.md, 6): Track A's plants carry bunches; ripe, one is picked with a right-click for
// bananas, and a green bunch hangs in its place and yellows as a crop ripens. On the real generated land.
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/world.ts';
import { runJob, type GenResult } from '../src/jobs/tasks.ts';
import { Inventory } from '../src/sim/inventory.ts';
import { grow, growWhileAway, cropDrops, pickBananas, BANANAS_A_BUNCH } from '../src/sim/farming.ts';
import { breakBlock } from '../src/sim/interact.ts';
import { blockId, blockName } from '../src/world/blocks.ts';
import { itemId } from '../src/world/items.ts';
import { CS } from '../src/world/constants.ts';

const RIPE = blockId('banana_bunch'), GREEN = blockId('banana_bunch_green'), BANANA = itemId('banana');

/** The valley's middle, generated as the game does it; and the bunches hanging there. */
function land(): { w: World; bunches: [number, number, number][] } {
  const w = new World();
  const bunches: [number, number, number][] = [];
  for (let cz = 29; cz <= 31; cz++) for (let cx = 52; cx <= 55; cx++) w.addColumn(cx, cz, (runJob({ kind: 'gen', cx, cz, edits: [] }).result as GenResult).chunks);
  for (let cz = 30; cz <= 30; cz++) for (let cx = 53; cx <= 54; cx++)
    for (let y = 60; y < 140; y++) for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) if (w.blockAt(cx * CS + lx, y, cz * CS + lz) === RIPE) bunches.push([cx * CS + lx, y, cz * CS + lz]);
  return { w, bunches };
}

describe('the banana bunch', () => {
  it('the valley’s banana plants carry ripe bunches that can be picked: bananas, and a green bunch in its place', () => {
    const { w, bunches } = land();
    expect(bunches.length).toBeGreaterThan(0);
    const [x, y, z] = bunches[0];
    const inv = new Inventory();
    expect(pickBananas(w, inv, x, y, z)).toBe(true);
    expect(inv.count(BANANA)).toBe(BANANAS_A_BUNCH);
    expect(w.blockAt(x, y, z)).toBe(GREEN);
    expect(pickBananas(w, inv, x, y, z)).toBe(false); // green: nothing to pick yet
    expect(inv.count(BANANA)).toBe(BANANAS_A_BUNCH);
  });

  it('the green bunch yellows as a crop ripens, where it hangs (no farmland under it), and can be picked again', () => {
    const { w, bunches } = land();
    const [x, y, z] = bunches[0];
    w.setBlock(x, y, z, GREEN);
    expect(grow(w, x, y, z)).toBe(true);
    expect(w.blockAt(x, y, z)).toBe(RIPE);
    expect(grow(w, x, y, z)).toBe(false); // ripe is the last stage
    // Over a night's sleep beside it, too.
    w.setBlock(x, y, z, GREEN);
    let n = 0;
    while (w.blockAt(x, y, z) === GREEN && n++ < 20) growWhileAway(w, x, z, 9, Math.random);
    expect(w.blockAt(x, y, z)).toBe(RIPE);
    expect(pickBananas(w, new Inventory(), x, y, z)).toBe(true);
  });

  it('a full pack leaves the bunch where it hangs', () => {
    const { w, bunches } = land();
    const [x, y, z] = bunches[0];
    const inv = new Inventory();
    for (let i = 0; i < inv.slots.length; i++) inv.slots[i] = { id: itemId('limestone'), count: 64 };
    expect(pickBananas(w, inv, x, y, z)).toBe('full');
    expect(w.blockAt(x, y, z)).toBe(RIPE);
  });

  it('cut down, a ripe bunch gives its bananas and a green one nothing (it is not a block to carry about)', () => {
    expect(cropDrops(RIPE)).toEqual([[BANANA, BANANAS_A_BUNCH]]);
    expect(cropDrops(GREEN)).toEqual([]);
    const { w, bunches } = land();
    const [x, y, z] = bunches[0];
    const inv = new Inventory();
    breakBlock(w, inv, x, y, z);
    expect(inv.count(BANANA)).toBe(BANANAS_A_BUNCH);
    expect(inv.count(itemId('banana_bunch'))).toBe(0);
    expect(blockName(w.blockAt(x, y, z))).toBe('air');
  });
});
