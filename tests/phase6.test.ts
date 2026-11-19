// Phase 6 (docs/PHASE6.md): Zone-2 and power (M3). This file grows with each step.

import { describe, it, expect } from 'vitest';
import { load } from './load.ts';
import { ZONE1FAR, roadHeight } from '../src/gen/layout.ts';
import { blockOf } from '../src/world/light.ts';

describe('the Phase 5 outpost reads at night (the Phase 5 review: dim from 40 m)', () => {
  const w = load(830, 1010, 900, 1060);
  const o = ZONE1FAR.outpost, OF = o.floor, mz = (o.z0 + o.z1) >> 1;
  const lamp = (x: number, y: number, z: number) => blockOf(w.lightAt(x, y, z));

  it('lights every side of the building, the yard’s corners and the lookout’s platform', () => {
    const spots: [string, number, number, number][] = [
      ['front left of the yard', o.x0 - 3, OF + 1, o.z0 - 6],
      ['front right of the yard', o.x1 + 2, OF + 1, o.z0 - 6],
      ['west wall', o.x0 - 2, OF + 1, mz],
      ['east wall', o.x1 + 1, OF + 1, mz],
      ['back wall', (o.x0 + o.x1) >> 1, OF + 1, o.z1 + 1],
      ['lookout platform', o.x1 - 2, OF + 5, mz],
    ];
    for (const [what, x, y, z] of spots) expect(lamp(x, y, z), what).toBeGreaterThanOrEqual(8);
  });

  it('lights the stripped pickup across the road', () => {
    const h = ZONE1FAR.hulk;
    let best = 0;
    for (let x = h.x0; x < h.x1; x++) best = Math.max(best, lamp(x, roadHeight((h.x0 + h.x1) >> 1) + 2, h.z0 - 1));
    expect(best).toBeGreaterThanOrEqual(8);
  });
});
