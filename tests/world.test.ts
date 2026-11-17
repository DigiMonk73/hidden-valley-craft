import { describe, it, expect } from 'vitest';
import { generateColumn, COLUMN_VOLUME } from '../src/gen/terrain.ts';
import { lightColumn } from '../src/world/light.ts';
import { meshChunk } from '../src/mesh/mesher.ts';
import { runJob, type GenResult } from '../src/jobs/tasks.ts';
import { World } from '../src/world/world.ts';
import { blockId, AIR, WATER } from '../src/world/blocks.ts';
import { HOME, POOL, VALLEY } from '../src/gen/layout.ts';
import { CS, PADDED_VOLUME, paddedIndex } from '../src/world/constants.ts';

const ci = (x: number, y: number, z: number) => (y << 10) | (z << 5) | x;

describe('generator', () => {
  it('is deterministic', () => {
    const a = generateColumn(53, 32);
    const b = generateColumn(53, 32);
    expect(a.length).toBe(COLUMN_VOLUME);
    expect(Buffer.from(a.buffer).equals(Buffer.from(b.buffer))).toBe(true);
  });

  it('carves the home: open living room, paved balcony, lanterns', () => {
    // Living room centre (1808, 84, 1024) is in column (56, 32).
    const col = generateColumn(1808 >> 5, 1024 >> 5);
    expect(col[ci(1808 & 31, 84, 1024 & 31)]).toBe(AIR);
    expect(col[ci(1808 & 31, 81, 1024 & 31)]).toBe(blockId('planks'));
    const balcony = generateColumn(1796 >> 5, 1024 >> 5);
    expect(balcony[ci(1796 & 31, HOME.floor - 1, 1024 & 31)]).toBe(blockId('stone_bricks'));
    expect(balcony[ci(1796 & 31, HOME.floor, 1024 & 31)]).toBe(AIR);
    expect(col[ci(1808 & 31, 87, 1024 & 31)]).toBe(blockId('lantern'));
  });

  it('fills the pool with water and keeps the valley floor at its height', () => {
    const col = generateColumn(POOL.cx >> 5, POOL.cz >> 5);
    expect(col[ci(POOL.cx & 31, VALLEY.water, POOL.cz & 31)]).toBe(WATER);
    const floorCol = generateColumn(1700 >> 5, 980 >> 5);
    const lx = 1700 & 31, lz = 980 & 31;
    let top = 0;
    for (let y = 0; y < 192; y++) if (floorCol[ci(lx, y, lz)] !== AIR) top = y + 1;
    expect(Math.abs(top - VALLEY.floor)).toBeLessThanOrEqual(12); // floor or a tree on it
  });
});

describe('light', () => {
  it('lights open sky fully and the lanterns in the cave', () => {
    const col = generateColumn(1808 >> 5, 1024 >> 5);
    const light = lightColumn(col);
    expect(light[ci(1808 & 31, 191, 1024 & 31)] >> 4).toBe(15);
    expect(light[ci(1808 & 31, 87, 1024 & 31)] & 15).toBe(15); // the lantern itself
    expect(light[ci(1808 & 31, 84, 1024 & 31)] & 15).toBeGreaterThan(10); // near it
  });

  it('keeps light right when a block is placed and removed (incremental equals fresh)', () => {
    const world = new World();
    for (let cz = 31; cz <= 33; cz++)
      for (let cx = 55; cx <= 57; cx++) {
        const r = runJob({ kind: 'gen', cx, cz, edits: [] }).result as GenResult;
        world.addColumn(cx, cz, r.chunks);
      }
    const x = 1808, y = 84, z = 1024;
    const before = world.lightAt(x, y, z);
    world.setBlock(x, y + 1, z, blockId('limestone'));
    world.setBlock(x, y + 1, z, AIR);
    expect(world.lightAt(x, y, z)).toBe(before);
  });
});

describe('mesher', () => {
  it('meshes a solid cube with six faces and AO in range', () => {
    const blocks = new Uint16Array(PADDED_VOLUME);
    const light = new Uint8Array(PADDED_VOLUME).fill(0xf0);
    blocks[paddedIndex(5, 5, 5)] = blockId('limestone');
    const m = meshChunk(blocks, light);
    expect(m.solid.quads).toBe(6);
    expect(m.water.quads).toBe(0);
    for (let v = 0; v < 24; v++) expect(m.solid.pack[v * 4 + 1]).toBe(3);
  });

  it('fills water to the top of its block under a solid block, and lowers it under open air', () => {
    const blocks = new Uint16Array(PADDED_VOLUME);
    const light = new Uint8Array(PADDED_VOLUME).fill(0xf0);
    blocks[paddedIndex(5, 5, 5)] = WATER;
    blocks[paddedIndex(5, 6, 5)] = blockId('limestone');
    blocks[paddedIndex(9, 5, 5)] = WATER;
    const m = meshChunk(blocks, light);
    const tops = (x: number) => {
      const ys: number[] = [];
      for (let v = 0; v < m.water.quads * 4; v++) if (Math.floor(m.water.positions[v * 3]) === x || m.water.positions[v * 3] === x + 1) ys.push(m.water.positions[v * 3 + 1]);
      return Math.max(...ys);
    };
    expect(tops(4)).toBe(5); // chunk-local y: cell 4 spans 4…5
    expect(tops(8)).toBeCloseTo(4.875);
  });

  it('meshes a real chunk of the valley', () => {
    const world = new World();
    for (let cz = 31; cz <= 33; cz++)
      for (let cx = 55; cx <= 57; cx++) {
        const r = runJob({ kind: 'gen', cx, cz, edits: [] }).result as GenResult;
        world.addColumn(cx, cz, r.chunks);
      }
    const ch = world.column(56, 32)!.chunks[2];
    const p = world.padded(ch);
    const m = meshChunk(p.blocks, p.light);
    expect(m.solid.quads).toBeGreaterThan(100);
    expect(CS).toBe(32);
  });
});
