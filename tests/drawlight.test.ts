import { describe, it, expect } from 'vitest';
import { World } from '../src/world/world.ts';
import { runJob, type GenResult } from '../src/jobs/tasks.ts';
import { blockId } from '../src/world/blocks.ts';
import { meshChunk } from '../src/mesh/mesher.ts';

function balcony(): World {
  const w = new World();
  for (let cz = 30; cz <= 33; cz++) for (let cx = 55; cx <= 57; cx++) w.addColumn(cx, cz, (runJob({ kind: 'gen', cx, cz, edits: [] }).result as GenResult).chunks);
  return w;
}

/** Sky light (0–15) at the corners of the faces drawn in a chunk, matching a test. */
function faceSky(w: World, x: number, y: number, z: number, match: (face: number, px: number, py: number, pz: number) => boolean): number[] {
  const c = w.chunkAtBlock(x, y, z)!;
  const { blocks, light } = w.padded(c);
  const m = meshChunk(blocks, light).solid;
  const out: number[] = [];
  const at = (v: number) => [m.pack[v * 4] & 7, m.positions[v * 3] + c.cx * 32, m.positions[v * 3 + 1] + c.cy * 32, m.positions[v * 3 + 2] + c.cz * 32] as const;
  // A face counts when all four of its corners match.
  for (let q = 0; q < m.quads; q++) {
    const vs = [0, 1, 2, 3].map((k) => q * 4 + k);
    if (vs.every((v) => match(...at(v)))) for (const v of vs) out.push(m.pack[v * 4 + 2] / 16);
  }
  return out;
}

describe('slabs and stairs are lit like their surroundings (re-check, Phase 2)', () => {
  it('the top of a slab with a block over it is not black at noon', () => {
    const w = balcony();
    const [x, y, z] = [1794, 82, 1029];
    expect(w.lightAt(x, y, z) >> 4).toBe(15); // open sky on the balcony
    w.setBlock(x, y, z, blockId('slab_stone_bricks'));
    w.setBlock(x, y + 1, z, blockId('stone_bricks'));
    const top = faceSky(w, x, y, z, (f, px, py, pz) => f === 2 && py === y + 0.5 && px >= x && px <= x + 1 && pz >= z && pz <= z + 1);
    expect(top.length).toBe(4);
    for (const s of top) expect(s).toBeGreaterThanOrEqual(12);
  });

  it('the ground beside a slab has no dark fringe', () => {
    const w = balcony();
    const [x, y, z] = [1794, 82, 1029];
    const before = faceSky(w, x + 1, y - 1, z, (f, px, py, pz) => f === 2 && py === y && px >= x + 1 && px <= x + 2 && pz >= z && pz <= z + 1);
    w.setBlock(x, y, z, blockId('slab_stone_bricks'));
    const after = faceSky(w, x + 1, y - 1, z, (f, px, py, pz) => f === 2 && py === y && px >= x + 1 && px <= x + 2 && pz >= z && pz <= z + 1);
    expect(after.length).toBe(4);
    expect(Math.min(...after)).toBeGreaterThanOrEqual(Math.min(...before) - 1);
  });

  it('a stair’s riser facing a slab is lit', () => {
    const w = balcony();
    const [x, y, z] = [1794, 82, 1029];
    w.setBlock(x, y, z, blockId('stairs_stone_bricks@east'));
    w.setBlock(x + 1, y, z, blockId('slab_stone_bricks'));
    const faces = faceSky(w, x, y, z, (f, px, py, pz) => px >= x && px <= x + 1 && py >= y && py <= y + 1 && pz >= z && pz <= z + 1 && f !== 3);
    expect(faces.length).toBeGreaterThan(0);
    expect(Math.min(...faces)).toBeGreaterThanOrEqual(11);
  });
});
