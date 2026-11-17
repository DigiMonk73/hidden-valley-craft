import { describe, it, expect } from 'vitest';
import { nearestViewChunks, VIEW_CHUNKS } from '../src/ui/hud.ts';

describe('view distance from older saved settings', () => {
  it('maps every old choice to the nearest offered one, never further than asked beyond the minimum', () => {
    expect(nearestViewChunks(4)).toBe(7);
    expect(nearestViewChunks(6)).toBe(7);
    expect(nearestViewChunks(8)).toBe(8);
    expect(nearestViewChunks(12)).toBe(12);
    for (const n of VIEW_CHUNKS) expect(nearestViewChunks(n)).toBe(n);
  });
});
