import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { meshChunk } from '../src/mesh/mesher.ts';
import { runJob } from '../src/jobs/tasks.ts';
import { GLOW_OF, GLOW_STRIDE } from '../src/world/glow.ts';
import { BLOCK_DEFS, B_EMIT, blockId, AIR } from '../src/world/blocks.ts';
import { CS, PADDED_VOLUME, paddedIndex } from '../src/world/constants.ts';
import { Glows } from '../src/render/glow.ts';
import { skyAt } from '../src/render/sky.ts';

// Phase 9A, 3: a glow round every lamp and fire. The mesher lists them chunk by chunk; the renderer draws one
// soft light for each. How they look is judged in pictures (tools/shots9a.mjs valley).

const STONE = blockId('limestone');
function chunk(fill: number): { blocks: Uint16Array; light: Uint8Array; set: (x: number, y: number, z: number, id: number) => void } {
  const blocks = new Uint16Array(PADDED_VOLUME).fill(fill), light = new Uint8Array(PADDED_VOLUME).fill(0xf0);
  return { blocks, light, set: (x, y, z, id) => { blocks[paddedIndex(x + 1, y + 1, z + 1)] = id; } };
}

describe('which blocks glow', () => {
  it('every lamp and fire that lights the land round it has a glow, and nothing dim has', () => {
    for (let id = 0; id < BLOCK_DEFS.length; id++) {
      const name = BLOCK_DEFS[id].name;
      if (B_EMIT[id] >= 7) expect(GLOW_OF[id], name).toBeDefined();
      if (B_EMIT[id] === 0 && name !== 'sludge') expect(GLOW_OF[id], name).toBeUndefined(); // (the sump's sludge glows and lights nothing)
    }
  });

  it('a glow sits inside its block, at its lit part, in a colour', () => {
    for (let id = 0; id < BLOCK_DEFS.length; id++) {
      const g = GLOW_OF[id];
      if (!g) continue;
      for (const v of [g.x, g.y, g.z, g.r, g.g, g.b]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
      expect(g.size).toBeGreaterThan(0.3);
      expect(g.size).toBeLessThan(2.5);
    }
    expect(GLOW_OF[blockId('hearth_flames')]!.fire).toBe(true);
    expect(GLOW_OF[blockId('lantern')]!.fire).toBe(false);
    // A facing block's glow turns with it.
    const a = GLOW_OF[blockId('wall_lamp')]!, b = GLOW_OF[blockId('wall_lamp@south')]!;
    expect(Math.abs(a.z - 0.5)).toBeCloseTo(Math.abs(b.z - 0.5), 5);
    expect(a.z).not.toBeCloseTo(b.z, 3);
  });
});

describe('the mesher lists a chunk\'s glows', () => {
  it('one for a lantern, where it hangs; none in a chunk without lamps', () => {
    const c = chunk(AIR);
    expect(meshChunk(c.blocks, c.light).glows.length).toBe(0);
    c.set(5, 6, 7, blockId('lantern'));
    const g = meshChunk(c.blocks, c.light).glows;
    expect(g.length).toBe(GLOW_STRIDE);
    const def = GLOW_OF[blockId('lantern')]!;
    expect(g[0]).toBeCloseTo(5 + def.x, 5); expect(g[1]).toBeCloseTo(6 + def.y, 5); expect(g[2]).toBeCloseTo(7 + def.z, 5);
    expect(g[3]).toBe(blockId('lantern'));
    expect(g[4]).toBe(15); // under the open sky
  });

  it('a lamp sealed in rock glows at its open face only, and not at all when walled in', () => {
    const c = chunk(STONE);
    c.set(8, 8, 8, blockId('sealed_lamp'));
    expect(meshChunk(c.blocks, c.light).glows.length).toBe(0);
    c.set(9, 8, 8, AIR); // open to the east
    const g = meshChunk(c.blocks, c.light).glows;
    expect(g.length).toBe(GLOW_STRIDE);
    expect(g[0]).toBeGreaterThan(9); // out in front of the east face: not cut in half by the wall, not seen through the rock from the west
    expect(g[1]).toBeCloseTo(8.5, 5); expect(g[2]).toBeCloseTo(8.5, 5);
  });

  it('the list crosses from the worker with the mesh', () => {
    const c = chunk(AIR);
    c.set(1, 1, 1, blockId('lantern'));
    const { result, transfer } = runJob({ kind: 'mesh', key: 1, version: 1, blocks: c.blocks, light: c.light });
    if (result.kind !== 'mesh') throw new Error('not a mesh');
    expect(transfer).toContain(result.mesh.glows.buffer);
  });
});

describe('the glows drawn', () => {
  it('follow the chunks: added, replaced and taken away', () => {
    const g = new Glows();
    const sky = skyAt(21);
    const list = (n: number) => { const a = new Float32Array(n * GLOW_STRIDE); for (let i = 0; i < n; i++) a.set([i, 2, 3, blockId('lantern'), 0], i * GLOW_STRIDE); return a; };
    g.setChunk(1, 0, 0, 0, list(3));
    g.setChunk(2, 1, 0, 0, list(2));
    g.sync(sky, 150, 1350, 0);
    expect(g.count).toBe(5);
    expect(g.mesh.geometry.instanceCount).toBe(5);
    g.setChunk(1, 0, 0, 0, list(1)); // the chunk was meshed again with fewer lamps
    g.sync(sky, 150, 1350, 0);
    expect(g.count).toBe(3);
    g.setChunk(2, 1, 0, 0, new Float32Array(0)); // and one with none left
    g.removeChunk(1);
    g.sync(sky, 150, 1350, 0);
    expect(g.count).toBe(0);
    // A chunk's glows are placed in the world, not in the chunk.
    g.setChunk(7, 2, 3, 4, list(1));
    g.sync(sky, 150, 1350, 0);
    const p = g.mesh.geometry.getAttribute('iPos') as THREE.InstancedBufferAttribute;
    expect([p.getX(0), p.getY(0), p.getZ(0)]).toEqual([2 * CS, 3 * CS + 2, 4 * CS + 3]);
  });

  it('a chunk with a lamp that comes and goes before any frame is drawn harms nothing (it threw: no attribute had been made yet)', () => {
    const g = new Glows();
    g.setChunk(1, 0, 0, 0, new Float32Array([1, 2, 3, blockId('lantern'), 0]));
    g.removeChunk(1);
    expect(() => g.sync(skyAt(21), 150, 1350, 0)).not.toThrow();
    expect(g.count).toBe(0);
  });

  it('only a lamp sealed in rock and the sump\'s sludge sit "in a wall": a furnace that stands free glows from its own middle', () => {
    expect(GLOW_OF[blockId('sealed_lamp')]!.inWall).toBe(true);
    expect(GLOW_OF[blockId('sludge')]!.inWall).toBe(true);
    expect(GLOW_OF[blockId('crucible_furnace')]!.inWall).toBe(false);
    const c = chunk(AIR);
    c.set(4, 4, 4, blockId('crucible_furnace'));
    const g = meshChunk(c.blocks, c.light).glows;
    expect([g[0], g[1], g[2]]).toEqual([4.5, 4.5, 4.5]); // (it sat 0.22 above the furnace's top)
  });
});
