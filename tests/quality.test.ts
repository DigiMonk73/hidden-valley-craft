// Keeping the game smooth by itself (docs/PHASE9B.md, 1): the watch on the frame rate, and the ladder of lighter pictures.
import { describe, it, expect } from 'vitest';
import { FrameWatch, lighter, lighterLine, GRACE_S, WINDOW_S, SLOW_WINDOWS } from '../src/game/quality.ts';

/** Feeds frames at a steady rate for some seconds; true if the watch asked for a lighter picture. */
function run(w: FrameWatch, fps: number, seconds: number): boolean {
  let asked = false;
  for (let i = 0; i < Math.round(fps * seconds); i++) if (w.frame(1 / fps)) asked = true;
  return asked;
}

describe('the watch on the frame rate', () => {
  it('60 and 30 frames a second never ask for a lighter picture', () => {
    expect(run(new FrameWatch(), 60, 120)).toBe(false);
    expect(run(new FrameWatch(), 30, 120)).toBe(false); // a screen held at 30 is not "slow"
  });

  it('20 frames a second asks, but only after the grace and two slow windows', () => {
    const w = new FrameWatch();
    const before = GRACE_S + WINDOW_S * SLOW_WINDOWS;
    expect(run(w, 20, before - 1)).toBe(false);
    expect(run(w, 20, 2)).toBe(true);
  });

  it('after asking it waits again before asking once more', () => {
    const w = new FrameWatch();
    let n = 0;
    while (!w.frame(0.1)) n++;
    expect(n / 10).toBeCloseTo(GRACE_S + WINDOW_S * SLOW_WINDOWS, 0);
    expect(run(w, 10, GRACE_S + WINDOW_S)).toBe(false);
    expect(run(w, 10, WINDOW_S + 1)).toBe(true);
  });

  it('one slow window between good ones is forgiven (a hitch while the land loads)', () => {
    const w = new FrameWatch();
    run(w, 60, GRACE_S + 0.01);
    for (let k = 0; k < 6; k++) {
      expect(run(w, 15, WINDOW_S)).toBe(false);
      expect(run(w, 60, WINDOW_S)).toBe(false);
    }
  });

  it('a long gap (the tab hidden, the page stalled once) is not slowness', () => {
    const w = new FrameWatch();
    run(w, 60, GRACE_S + 1);
    for (let k = 0; k < 20; k++) { expect(w.frame(5)).toBe(false); expect(run(w, 60, 1)).toBe(false); }
  });

  it('reset() starts over (the player changed the picture; play was paused)', () => {
    const w = new FrameWatch();
    run(w, 10, GRACE_S + WINDOW_S + 1);
    w.reset();
    expect(run(w, 10, GRACE_S + WINDOW_S + 1)).toBe(false);
  });

  it('takes nonsense without harm', () => {
    const w = new FrameWatch();
    expect(w.frame(0)).toBe(false);
    expect(w.frame(-1)).toBe(false);
    expect(w.frame(NaN)).toBe(false);
  });
});

describe('the ladder of lighter pictures', () => {
  it('goes softer, then to 224 m, then softer again, then to the short views, and stops', () => {
    const steps = [];
    let p: { scale: number; view: number } | null = { scale: 1, view: 12 };
    while ((p = lighter(p))) steps.push(`${p.scale}@${p.view}`);
    expect(steps).toEqual(['0.75@12', '0.75@7', '0.5@7', '0.5@5', '0.5@4']);
  });

  it('never makes anything heavier, from any start', () => {
    for (const scale of [1, 0.75, 0.5]) for (const view of [4, 5, 7, 8, 10, 12]) {
      const n = lighter({ scale, view });
      if (!n) { expect(scale).toBe(0.5); expect(view).toBe(4); continue; }
      expect(n.scale).toBeLessThanOrEqual(scale);
      expect(n.view).toBeLessThanOrEqual(view);
      expect(n.scale < scale || n.view < view).toBe(true);
    }
  });

  it('says in plain words what it did', () => {
    expect(lighterLine({ scale: 1, view: 8 }, { scale: 0.75, view: 8 })).toMatch(/softer/);
    expect(lighterLine({ scale: 0.75, view: 8 }, { scale: 0.75, view: 7 })).toMatch(/224 m/);
  });
});
