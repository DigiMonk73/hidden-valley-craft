// The clock at the start of the hotbar (the owner, 2026-11-20: the bed opens at five, and nothing told the time).
import { describe, it, expect } from 'vitest';
import { clockText, canSleep } from '../src/ui/clock.ts';

describe('the clock', () => {
  it('reads like a watch: 12-hour time with AM and PM, the first day is Day 1', () => {
    expect(clockText(0, 0)).toEqual({ time: '12:00 AM', day: 'Day 1', sleep: true });
    expect(clockText(6.5, 0).time).toBe('6:30 AM');
    expect(clockText(12, 2)).toEqual({ time: '12:00 PM', day: 'Day 3', sleep: false });
    expect(clockText(16 + 59.9 / 60, 0).time).toBe('4:59 PM');
    expect(clockText(17, 0).time).toBe('5:00 PM');
    expect(clockText(23.999, 4).time).toBe('11:59 PM');
    expect(clockText(24, 0).time).toBe('12:00 AM'); // the moment the hour wraps
  });
  it('turns warm exactly when the bed can be slept in: five in the evening to six in the morning', () => {
    for (let h = 0; h < 24; h += 0.25) expect(clockText(h, 0).sleep, String(h)).toBe(h >= 17 || h < 6);
    expect(canSleep(16.99)).toBe(false);
    expect(canSleep(17)).toBe(true);
    expect(canSleep(5.99)).toBe(true);
    expect(canSleep(6)).toBe(false);
  });
});

import { readFileSync } from 'node:fs';
describe('the clock plate', () => {
  it('keeps "10:00 AM" on one line in a narrow window: no fixed width, no wrapping (2026-11-21)', () => {
    // Layout is not measured here (no browser); the rule is pinned, and the picture at 960 px wide was looked at.
    const css = readFileSync(new URL('../src/ui/hud.ts', import.meta.url), 'utf8');
    const rule = css.match(/\.hv-clock \{[^}]*\}/)![0];
    expect(rule).toContain('white-space: nowrap');
    expect(rule).not.toMatch(/[^-]width: \d/); // a min-width only: the plate grows to fit its text
  });
});
