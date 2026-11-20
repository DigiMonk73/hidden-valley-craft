import { describe, it, expect } from 'vitest';
import { nearestViewChunks, VIEW_CHUNKS, SCALES, DEFAULT_SETTINGS, readSettings, parseSettings, encodeSettings } from '../src/game/settings.ts';

describe('view distance from older saved settings', () => {
  it('maps every old choice to the nearest offered one', () => {
    expect(nearestViewChunks(4)).toBe(4);
    expect(nearestViewChunks(6)).toBe(7); // between two: the longer
    expect(nearestViewChunks(8)).toBe(8);
    expect(nearestViewChunks(12)).toBe(12);
    expect(nearestViewChunks(99)).toBe(12);
    expect(nearestViewChunks(0)).toBe(4);
    for (const n of VIEW_CHUNKS) expect(nearestViewChunks(n)).toBe(n);
  });

  it('offers 128 m and 160 m for weaker computers (docs/PHASE9B.md, 1)', () => {
    expect(VIEW_CHUNKS).toContain(4);
    expect(VIEW_CHUNKS).toContain(5);
  });
});

describe('settings kept across sessions (docs/PHASE9B.md, 2)', () => {
  it('come back as they were written', () => {
    const s = { rd: 5, rdOwn: true, sens: 1.7, inv: true, vol: 0.35, scale: 0.5, aa: false, auto: false };
    expect(parseSettings(encodeSettings(s))).toEqual(s);
  });

  it('a copy saved by version 13 (view, sensitivity, invert, volume only) keeps those and takes the defaults for the rest', () => {
    const v13 = new TextEncoder().encode(JSON.stringify({ rd: 10, sens: 1.4, inv: true, vol: 0.5 }));
    expect(parseSettings(v13)).toEqual({ ...DEFAULT_SETTINGS, rd: 10, sens: 1.4, inv: true, vol: 0.5 });
  });

  it('nothing saved, or something unreadable, gives the defaults', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(new TextEncoder().encode('{not json'))).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(new TextEncoder().encode('7'))).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(new TextEncoder().encode('null'))).toEqual(DEFAULT_SETTINGS);
  });

  it('values of the wrong kind or out of range are put right, never passed on', () => {
    const s = readSettings({ rd: 'far', sens: 40, inv: 'yes', vol: -3, scale: 0.6, aa: 1, auto: null, rdOwn: 'x' });
    expect(s.rd).toBe(DEFAULT_SETTINGS.rd);
    expect(s.sens).toBe(2.5);
    expect(s.inv).toBe(false);
    expect(s.vol).toBe(0);
    expect(SCALES).toContain(s.scale);
    expect(s.scale).toBe(0.5); // 0.6 is nearer a half than three quarters
    expect(s.aa).toBe(true);
    expect(s.auto).toBe(true);
    expect(s.rdOwn).toBe(false);
    expect(readSettings({ sens: NaN, vol: Infinity, scale: NaN }).sens).toBe(1);
    expect(readSettings({ vol: Infinity }).vol).toBe(DEFAULT_SETTINGS.vol);
    expect(readSettings({ scale: 7 }).scale).toBe(1);
    expect(readSettings({ scale: 0.01 }).scale).toBe(0.5);
  });
});
