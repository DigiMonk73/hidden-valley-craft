// The faults found and left by earlier phases, mended in Phase 9B (docs/PHASE9B.md, 3): the parts with no game round them.
import { describe, it, expect } from 'vitest';
import { Keeper, SAVE_KEY, EARLIER_KEY, EARLIER_KEY_2, NOTES } from '../src/save/keeper.ts';
import { encodeSave, type SaveData } from '../src/save/save.ts';
import { newSave, BEGUN } from '../src/save/state.ts';
import { MemoryStore } from '../src/platform/storage.ts';
import { memoryPending } from './game/harness.ts';
import { World } from '../src/world/world.ts';
import { blockId, AIR } from '../src/world/blocks.ts';
import { itemId, maxStack } from '../src/world/items.ts';
import { CS, CHUNKS_Y, PS, PADDED_VOLUME, paddedIndex } from '../src/world/constants.ts';
import { setDown, clearEmptySack, SACK } from '../src/sim/drop.ts';
import { leaveLostPack } from '../src/sim/death.ts';
import { Inventory } from '../src/sim/inventory.ts';
import { breakBlock } from '../src/sim/interact.ts';
import { meshChunk, lightForDrawing } from '../src/mesh/mesher.ts';
import { collectContainers, restoreContainers } from '../src/save/save.ts';

const valley = (wallet: number, extra: Partial<SaveData> = {}): SaveData => ({ ...newSave(), wallet, flags: [BEGUN], ...extra });
/** A valley as a build from before the home was rebuilt saved it: no layout mark. */
const old = (wallet: number, extra: Partial<SaveData> = {}): SaveData => { const d = valley(wallet, extra); delete d.layout; return d; };

describe('a valley from an earlier build is kept aside, once and for good', () => {
  it('a second old save found later does not write over the first one kept', async () => {
    const store = new MemoryStore();
    const first = await encodeSave(old(111, { seq: 3 }));
    await store.set(SAVE_KEY, first);
    await new Keeper(store, memoryPending()).load();
    expect(await store.get(EARLIER_KEY)).toEqual(first);
    // An old page still open in another tab writes its own old save over save:1 again; this page is opened again.
    const second = await encodeSave(old(222, { seq: 4 }));
    await store.set(SAVE_KEY, second);
    const r = await new Keeper(store, memoryPending()).load();
    expect(r.note).toBe(NOTES.earlier);
    expect(await store.get(EARLIER_KEY), 'the first one kept is still there').toEqual(first);
    expect(await store.get(EARLIER_KEY_2)).toEqual(second);
  });

  it('the same old save found again is not kept twice', async () => {
    const store = new MemoryStore();
    const first = await encodeSave(old(111));
    await store.set(SAVE_KEY, first);
    await new Keeper(store, memoryPending()).load();
    await store.set(SAVE_KEY, first);
    await new Keeper(store, memoryPending()).load();
    expect(await store.get(EARLIER_KEY)).toEqual(first);
    expect(await store.get(EARLIER_KEY_2)).toBeNull();
  });

  it('when it cannot be kept aside the player is told so, in the stored case and the close-time case', async () => {
    const m = new MemoryStore();
    // A store that takes no new keys (full), but still reads.
    const full = { kind: 'indexeddb' as const, get: (k: string) => m.get(k), set: async (k: string, v: Uint8Array) => (k === SAVE_KEY ? m.set(k, v) : false) };
    const was = await encodeSave(old(111));
    await m.set(SAVE_KEY, was);
    const r = await new Keeper(full, memoryPending()).load();
    expect(r.data).toBeNull();
    expect(r.note).toBe(NOTES.earlierLost);
    expect(r.note).toMatch(/could not be kept aside/);
    // Only a close-time copy:
    const m2 = new MemoryStore();
    const full2 = { kind: 'indexeddb' as const, get: (k: string) => m2.get(k), set: async () => false };
    const pending = memoryPending();
    pending.bytes = was;
    const r2 = await new Keeper(full2, pending).load();
    expect(r2.note).toBe(NOTES.earlierLost);
  });

  it('a store that throws on the write is the same as one that refuses it', async () => {
    const m = new MemoryStore();
    await m.set(SAVE_KEY, await encodeSave(old(111)));
    const broken = { kind: 'indexeddb' as const, get: (k: string) => m.get(k), set: async (): Promise<boolean> => { throw new Error('quota'); } };
    const r = await new Keeper(broken, memoryPending()).load();
    expect(r.note).toBe(NOTES.earlierLost);
  });

  it('the load tells the game when the stored valley was saved (for a hand-over from an unnamed page)', async () => {
    const store = new MemoryStore();
    await store.set(SAVE_KEY, await encodeSave(valley(5, { id: 'v-x', seq: 2, savedAt: '2026-11-20T10:00:00.000Z' })));
    const r = await new Keeper(store, memoryPending()).load();
    expect([r.storedId, r.storedSeq, r.storedAt]).toEqual(['v-x', 2, '2026-11-20T10:00:00.000Z']);
  });
});

/** A small flat world: stone up to y 63 in the nine columns round (10, 10), open sky above. */
function flat(): World {
  const w = new World();
  const stone = blockId('limestone');
  for (let cz = 9; cz <= 11; cz++) for (let cx = 9; cx <= 11; cx++) w.addColumn(cx, cz, Array.from({ length: CHUNKS_Y }, (_, cy) => (cy <= 1 ? { blocks: stone, light: 0 } : { blocks: AIR, light: 0xf0 })));
  return w;
}
const X = 10 * CS + 16, Y = 64, Z = 10 * CS + 16;

describe('setting things down (nothing could be dropped on the ground)', () => {
  it('a stack set down goes into a sack at the feet, whole, wear and all', () => {
    const w = flat();
    const pick = { id: itemId('iron_pickaxe'), count: 1, wear: 17 };
    const at = setDown(w, pick, X + 0.5, Y, Z + 0.5)!;
    expect(at).not.toBeNull();
    expect(w.blockAt(...at)).toBe(SACK);
    expect(w.blockAt(at[0], at[1] - 1, at[2])).toBe(blockId('limestone')); // standing on the ground, not hung in the air
    expect(Math.hypot(at[0] - X, at[2] - Z)).toBeLessThanOrEqual(1.5);
    expect(w.containerAt(...at)!.filter(Boolean)).toEqual([pick]);
    expect(w.containerAt(...at)!.length).toBe(9);
  });

  it('the next thing goes into the same sack while it has room; like things stack', () => {
    const w = flat();
    const a = setDown(w, { id: itemId('cordage'), count: 3 }, X + 0.5, Y, Z + 0.5)!;
    const b = setDown(w, { id: itemId('cordage'), count: 2 }, X + 1.5, Y, Z + 0.5)!;
    const c = setDown(w, { id: blockId('planks'), count: 10 }, X + 0.5, Y, Z + 0.5)!;
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    const kept = w.containerAt(...a)!.filter(Boolean);
    expect(kept).toEqual([{ id: itemId('cordage'), count: 5 }, { id: blockId('planks'), count: 10 }]);
  });

  it('a full sack is left alone and a second is begun; nothing is ever split between them or lost', () => {
    const w = flat();
    const first = setDown(w, { id: itemId('iron_pickaxe'), count: 1 }, X + 0.5, Y, Z + 0.5)!;
    for (let k = 1; k < 9; k++) expect(setDown(w, { id: itemId('iron_pickaxe'), count: 1, wear: k }, X + 0.5, Y, Z + 0.5)).toEqual(first);
    const big = { id: blockId('limestone'), count: maxStack(blockId('limestone')) };
    const second = setDown(w, big, X + 0.5, Y, Z + 0.5)!;
    expect(second).not.toEqual(first);
    expect(w.containerAt(...first)!.filter(Boolean).length).toBe(9);
    expect(w.containerAt(...second)!.filter(Boolean)).toEqual([big]);
  });

  it('with nowhere to put a sack nothing changes and it says so (null)', () => {
    const w = flat();
    // Walled in: every cell round the feet is rock.
    const stone = blockId('limestone');
    for (let dy = -3; dy <= 3; dy++) for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) w.setBlock(X + dx, Y + dy, Z + dz, stone);
    const s = { id: itemId('cordage'), count: 3 };
    expect(setDown(w, s, X + 0.5, Y, Z + 0.5)).toBeNull();
    expect(s.count).toBe(3);
    expect(w.containers.size).toBe(0);
  });

  it('a sack that holds things cannot be mined away; emptied, it is taken away when the screen closes', () => {
    const w = flat();
    const at = setDown(w, { id: itemId('cordage'), count: 3 }, X + 0.5, Y, Z + 0.5)!;
    const pack = new Inventory(36);
    expect(breakBlock(w, pack, ...at)).toMatchObject({ changed: false, keepsItems: true });
    expect(clearEmptySack(w, ...at)).toBe(false);
    w.containerAt(...at)!.fill(null);
    expect(clearEmptySack(w, ...at)).toBe(true);
    expect(w.blockAt(...at)).toBe(AIR);
    expect(w.containers.size).toBe(0);
    // Nothing else is ever taken away by it.
    w.setBlock(X, Y, Z + 2, blockId('chest'));
    expect(clearEmptySack(w, X, Y, Z + 2)).toBe(false);
    expect(w.blockAt(X, Y, Z + 2)).toBe(blockId('chest'));
  });

  it('the lost pack of a death is not a sack: it is never added to and never taken away', () => {
    const w = flat();
    const inv = new Inventory(36);
    inv.add(itemId('cordage'), 1);
    const lost = leaveLostPack(w, inv, X + 0.5, Y, Z + 0.5)!;
    const at = setDown(w, { id: itemId('cordage'), count: 3 }, X + 0.5, Y, Z + 0.5)!;
    expect(at).not.toEqual(lost);
    expect(w.containerAt(...lost)!.filter(Boolean)).toEqual([{ id: itemId('cordage'), count: 1 }]);
    w.containerAt(...lost)!.fill(null);
    expect(clearEmptySack(w, ...lost)).toBe(false);
  });

  it('a sack and what is in it are saved and come back', () => {
    const w = flat();
    const at = setDown(w, { id: itemId('iron_pickaxe'), count: 1, wear: 5 }, X + 0.5, Y, Z + 0.5)!;
    const saved = JSON.parse(JSON.stringify(collectContainers(w)));
    const w2 = flat();
    w2.setBlock(...at, SACK);
    restoreContainers(w2, { containers: saved } as SaveData);
    expect(w2.containerAt(...at)!.filter(Boolean)).toEqual([{ id: itemId('iron_pickaxe'), count: 1, wear: 5 }]);
  });
});

describe('a slab just across a chunk’s edge does not darken the faces beside it (N5j)', () => {
  /** Sky light at the four corners of the top face of the floor block at padded (x, 1, z), with a slab at (sx, 2, sz). */
  function topFaceSky(x: number, z: number, sx: number, sz: number): number[] {
    const blocks = new Uint16Array(PADDED_VOLUME), light = new Uint8Array(PADDED_VOLUME);
    const stone = blockId('limestone'), slab = blockId('slab_stone_bricks');
    for (let pz = 0; pz < PS; pz++) for (let px = 0; px < PS; px++) {
      blocks[paddedIndex(px, 0, pz)] = stone; blocks[paddedIndex(px, 1, pz)] = stone;
      for (let py = 2; py < PS; py++) light[paddedIndex(px, py, pz)] = 0xf0; // open sky over a stone floor
    }
    blocks[paddedIndex(sx, 2, sz)] = slab;
    light[paddedIndex(sx, 2, sz)] = 0; // a slab keeps the sun out of its own cell
    const m = meshChunk(blocks, light).solid;
    const out: number[] = [];
    for (let q = 0; q < m.quads; q++) {
      const vs = [0, 1, 2, 3].map((k) => q * 4 + k);
      const top = vs.every((v) => (m.pack[v * 4] & 7) === 2 && m.positions[v * 3 + 1] === 1 && m.positions[v * 3] >= x - 1 && m.positions[v * 3] <= x && m.positions[v * 3 + 2] >= z - 1 && m.positions[v * 3 + 2] <= z);
      if (top) for (const v of vs) out.push(m.pack[v * 4 + 2]);
    }
    return out;
  }

  it('the floor beside a slab is lit the same whether the slab is inside the chunk or one block over its edge', () => {
    // Inside: the floor block at chunk cell (10, 0, 10) (padded 11, 1, 11) with a slab on its east neighbour.
    const insideChunk = topFaceSky(11, 11, 12, 11);
    // Across the edge: the floor block in the chunk's last column (padded 32) with the slab in the border (padded 33).
    const acrossEast = topFaceSky(32, 11, 33, 11);
    const acrossWest = topFaceSky(1, 11, 0, 11);
    const acrossSouth = topFaceSky(11, 32, 11, 33);
    expect(insideChunk.length).toBe(4);
    expect(Math.min(...insideChunk)).toBeGreaterThanOrEqual(13 * 16); // no dark fringe inside the chunk (fixed in Phase 2)
    expect([...acrossEast].sort()).toEqual([...insideChunk].sort());
    expect([...acrossWest].sort()).toEqual([...insideChunk].sort());
    expect([...acrossSouth].sort()).toEqual([...insideChunk].sort());
  });

  it('a slab in the border’s very corner, with nothing known above it, harms nothing and reads no cell outside the padded chunk', () => {
    const blocks = new Uint16Array(PADDED_VOLUME), light = new Uint8Array(PADDED_VOLUME).fill(0xf0);
    const slab = blockId('slab_stone_bricks');
    for (const [x, y, z] of [[0, 0, 0], [PS - 1, PS - 1, PS - 1], [0, PS - 1, 0], [PS - 1, 0, PS - 1]]) { blocks[paddedIndex(x, y, z)] = slab; light[paddedIndex(x, y, z)] = 0; }
    const out = lightForDrawing(blocks, light);
    expect(out.length).toBe(PADDED_VOLUME);
    for (const [x, y, z] of [[0, 0, 0], [PS - 1, PS - 1, PS - 1], [0, PS - 1, 0], [PS - 1, 0, PS - 1]]) expect(out[paddedIndex(x, y, z)] >> 4).toBeGreaterThanOrEqual(14);
    expect(() => meshChunk(blocks, light)).not.toThrow();
  });
});

// ---- Only what was mended changed (the rim's two bands, the brush by the outpost) --------------------------------
import land from './fixtures/v13-land.json' with { type: 'json' };
import { hashColumn } from '../tools/worldhash.ts';

describe('the land, against version 13’s', () => {
  // tests/fixtures/v13-land.json was made by hashing every column east of the gorge (2,752 of them) on main at
  // version 13 and on this branch: seven differ, and are listed with both hashes; the columns round them are
  // listed with the one they share. Nothing west of the gorge is touched by either change.
  const fx = land as unknown as { changed: Record<string, { was: number; now: number }>; neighbours: Record<string, number> };

  it('seven columns differ: two at each mended stair of the valley’s cliff, three at the outpost’s brush', () => {
    expect(Object.keys(fx.changed).sort()).toEqual(['27,32', '28,31', '28,32', '54,34', '55,30', '55,34', '56,30']);
    for (const [k, h] of Object.entries(fx.changed)) {
      const [cx, cz] = k.split(',').map(Number);
      expect(hashColumn(cx, cz), `column ${k}`).toBe(h.now);
      expect(h.now).not.toBe(h.was);
    }
  }, 120_000);

  it('every column next to one of them is block for block what version 13 had', () => {
    expect(Object.keys(fx.neighbours).length).toBeGreaterThan(30);
    for (const [k, was] of Object.entries(fx.neighbours)) {
      const [cx, cz] = k.split(',').map(Number);
      expect(hashColumn(cx, cz), `column ${k}`).toBe(was);
    }
  }, 120_000);
});
