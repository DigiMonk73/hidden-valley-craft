import { describe, it, expect } from 'vitest';
import { World } from '../src/world/world.ts';
import { runJob, type GenResult } from '../src/jobs/tasks.ts';
import { blockId, AIR } from '../src/world/blocks.ts';
import { WORLD_Y } from '../src/world/constants.ts';

const COLS: [number, number][] = [];
for (let cz = 30; cz <= 32; cz++) for (let cx = 55; cx <= 57; cx++) COLS.push([cx, cz]);

function build(edits: World['edits'] = new Map()): World {
  const w = new World();
  w.edits = edits;
  for (const [cx, cz] of COLS) w.addColumn(cx, cz, (runJob({ kind: 'gen', cx, cz, edits: w.columnEdits(cx, cz) }).result as GenResult).chunks);
  return w;
}

/** Light of the middle column, edited in place, against the same edits lit from scratch. */
function mismatches(edited: World): number {
  const fresh = build(edited.edits);
  let bad = 0;
  for (let y = 0; y < WORLD_Y; y++)
    for (let z = 31 * 32; z < 32 * 32; z++)
      for (let x = 56 * 32; x < 57 * 32; x++) if (edited.lightAt(x, y, z) !== fresh.lightAt(x, y, z)) bad++;
  return bad;
}

describe('editing keeps light equal to lighting from scratch', () => {
  it('for leaves and water placed in the top layer of the world', () => {
    const w = build();
    w.setBlock(1800, WORLD_Y - 1, 1000, blockId('leaves'));
    w.setBlock(1805, WORLD_Y - 1, 1003, blockId('water'));
    expect(mismatches(w)).toBe(0);
  });

  it('for a shaft dug down from the plateau, capped with glass, and a lantern below', () => {
    const w = build();
    for (let y = 117; y > 88; y--) w.setBlock(1830, y, 1010, AIR);
    w.setBlock(1830, 118, 1010, blockId('glass'));
    w.setBlock(1830, 89, 1010, blockId('lantern'));
    expect(mismatches(w)).toBe(0);
  });
});
