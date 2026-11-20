import { describe, it, expect } from 'vitest';
import { skyAt } from '../src/render/sky.ts';

// Phase 9A (docs/PHASE9A.md, 3 and the fresh review): moonlight is drawn brighter, in the light's colour only.
describe('the light on the land through dusk, night and dawn', () => {
  const lum = (h: number) => { const s = skyAt(h); return (0.3 * s.skyLight.r + 0.59 * s.skyLight.g + 0.11 * s.skyLight.b) * s.daylight; };

  it('never dips below the night\'s: dusk does not go dark and then brighten (it did: 18:30 was a third of 19:30)', () => {
    const night = lum(0);
    for (let h = 0; h < 24; h += 0.05) expect(lum(h), `at ${h.toFixed(2)}`).toBeGreaterThanOrEqual(night * 0.999);
    // And it only falls from sunset into the night, and only rises from the night into the morning.
    for (let h = 17; h < 21; h += 0.05) expect(lum(h + 0.05), `after ${h.toFixed(2)}`).toBeLessThanOrEqual(lum(h) * 1.001);
    for (let h = 3; h < 7; h += 0.05) expect(lum(h + 0.05), `after ${h.toFixed(2)}`).toBeGreaterThanOrEqual(lum(h) * 0.999);
  });

  it('the night\'s daylight number is 0.3 still (the Ashen live by it), and a moonlit cliff top can be seen', () => {
    for (const h of [22, 0, 2]) expect(skyAt(h).daylight).toBeCloseTo(0.3, 5);
    expect(lum(0)).toBeGreaterThan(0.2);
    expect(lum(12)).toBeGreaterThan(0.9);
  });
});
