import { describe, it, expect } from 'vitest';
import { freshVitals, tickVitals, fallDamage, consume, HUNGER_MINUTES, THIRST_MINUTES } from '../src/sim/survival.ts';

describe('survival', () => {
  it('thirst empties in about 25 minutes of walking, hunger in about 40', () => {
    const v = freshVitals();
    for (let t = 0; t < THIRST_MINUTES * 60; t++) tickVitals(v, 1, 1, false);
    expect(v.thirst).toBeCloseTo(0, 6);
    expect(v.hunger).toBeCloseTo(100 * (1 - THIRST_MINUTES / HUNGER_MINUTES), 0);
  });

  it('starving or parched wears health away; well fed heals', () => {
    const v = { hp: 50, hunger: 0, thirst: 80 };
    tickVitals(v, 10, 1, false);
    expect(v.hp).toBeLessThan(50);
    const w = { hp: 50, hunger: 90, thirst: 90 };
    tickVitals(w, 10, 1, false);
    expect(w.hp).toBeGreaterThan(50);
  });

  it('a fall of four blocks is safe; ten hurts badly', () => {
    expect(fallDamage(4)).toBe(0);
    expect(fallDamage(10)).toBeGreaterThan(35);
  });

  it('eating when full does nothing (the food is not used up)', () => {
    const v = freshVitals();
    expect(consume(v, { hunger: 30 })).toBe(false);
    v.hunger = 50;
    expect(consume(v, { hunger: 30 })).toBe(true);
    expect(v.hunger).toBe(80);
  });
});
