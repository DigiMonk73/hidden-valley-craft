// Phase 5 (docs/PHASE5.md): Zone-1's mid and deep bands. This file starts with the lead's extra
// (creatures never put on roofs) and grows with each step.

import { describe, it, expect } from 'vitest';
import { groundAt } from '../src/entity/spawner.ts';
import { ZONE1 } from '../src/gen/layout.ts';
import { MARCO_SPOT } from '../src/gen/zone1.ts';
import { World } from '../src/world/world.ts';
import { runJob, type GenResult } from '../src/jobs/tasks.ts';
import { CS } from '../src/world/constants.ts';
import { blockId, blockName } from '../src/world/blocks.ts';

export function load(x0: number, z0: number, x1: number, z1: number): World {
  const w = new World();
  for (let cz = Math.floor(z0 / CS); cz <= Math.floor(z1 / CS); cz++)
    for (let cx = Math.floor(x0 / CS); cx <= Math.floor(x1 / CS); cx++)
      w.addColumn(cx, cz, (runJob({ kind: 'gen', cx, cz, edits: [] }).result as GenResult).chunks);
  return w;
}

describe('live spawns stand on the ground, never on a roof or a built thing (the lead, 2026-11-18)', () => {
  const w = load(1050, 1000, 1120, 1090);
  const at = (x: number, y: number, z: number) => w.blockAt(x, y, z);

  it('puts Marco under the bus shelter’s roof, not on it', () => {
    const s = ZONE1.shelter;
    // The lead's spawn, and every column under the roof.
    expect(groundAt(1112.5, 1022.5, at)).toBe(s.floor);
    for (let x = s.x0 + 1; x < s.x1 - 1; x++) for (let z = s.z0 + 1; z < s.z1; z++) {
      const y = groundAt(x + 0.5, z + 0.5, at);
      if (y !== null) expect(y, `${x},${z}`).toBeLessThanOrEqual(s.floor + 1);
    }
    expect(groundAt(MARCO_SPOT[0], MARCO_SPOT[2], at)).toBe(s.floor);
  });

  it('puts a creature on the barn’s floor, never its roof', () => {
    const b = ZONE1.barn, F = ZONE1.farm.floor;
    for (let x = b.x0 + 1; x < b.x1 - 1; x++) for (let z = b.z0 + 1; z < b.z1 - 1; z++) {
      const y = groundAt(x + 0.5, z + 0.5, at);
      if (y !== null) expect(y, `${x},${z}`).toBeLessThan(F + 2);
    }
    expect(groundAt(b.x0 + 3.5, b.z0 + 3.5, at)).toBe(F);
  });

  it('never stands one on a coop, a chest or a fence post', () => {
    const F = ZONE1.farm.floor, x = ZONE1.farm.x0 + 3, z = ZONE1.farm.z1 - 3;
    for (const name of ['coop', 'chest', 'fence_post']) {
      w.setBlock(x, F, z, blockId(name));
      expect(groundAt(x + 0.5, z + 0.5, at), name).toBeNull();
      w.setBlock(x, F, z, 0);
    }
    expect(groundAt(x + 0.5, z + 0.5, at)).toBe(F);
  });

  it('still finds the ground in open country and at the bottom of a dug pit', () => {
    const x = ZONE1.farm.x0 + 6, z = ZONE1.farm.z1 - 4, F = ZONE1.farm.floor;
    expect(blockName(at(x, F - 1, z))).not.toBe('air');
    expect(groundAt(x + 0.5, z + 0.5, at)).toBe(F);
    for (let y = F - 6; y < F; y++) w.setBlock(x, y, z, 0);
    expect(groundAt(x + 0.5, z + 0.5, at)).toBe(F - 6);
  });
});
