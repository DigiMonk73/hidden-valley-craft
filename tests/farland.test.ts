import { describe, it, expect } from 'vitest';
import { buildFarLand, FAR_CELL } from '../src/gen/farland.ts';
import { surfaceHeight } from '../src/gen/layout.ts';

describe('distant land', () => {
  it('closes every 32 m column edge down below the ground, so no sky shows under the canopy', () => {
    const m = buildFarLand();
    // Find the lowest point of any side quad on the column edge x = 1024, around z = 600…700 (forest).
    let lowest = Infinity;
    const P = m.positions;
    for (let q = 0; q < m.index.length / 6; q++) {
      const v = q * 4;
      const xs = [0, 1, 2, 3].map((k) => P[(v + k) * 3]);
      const zs = [0, 1, 2, 3].map((k) => P[(v + k) * 3 + 2]);
      if (xs.every((x) => x === 1024) && zs.every((z) => z >= 640 && z <= 648)) {
        for (let k = 0; k < 4; k++) lowest = Math.min(lowest, P[(v + k) * 3 + 1]);
      }
    }
    const ground = surfaceHeight(1024 - FAR_CELL / 2, 644);
    expect(lowest).toBeLessThan(ground - 4);
  });
});
