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

  it('health at nothing stays at nothing: a full stomach does not mend the dead (a fed player could not be killed by bites, blows or bullets)', () => {
    // The game's order in one tick: the blows land (health clamped at 0), then the body is advanced, then death is looked for.
    const v = { hp: 12, hunger: 100, thirst: 100 };
    for (let bite = 0; bite < 14 && v.hp > 0; bite++) v.hp = Math.max(0, v.hp - 10);
    expect(v.hp).toBe(0);
    tickVitals(v, 1 / 60, 1, false);
    expect(v.hp).toBe(0); // was 0.0058: alive, and for good
    tickVitals(v, 30, 1, false);
    expect(v.hp).toBe(0);
    // One hair above nothing still mends, as before.
    const w = { hp: 0.5, hunger: 100, thirst: 100 };
    tickVitals(w, 1, 1, false);
    expect(w.hp).toBeGreaterThan(0.5);
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
