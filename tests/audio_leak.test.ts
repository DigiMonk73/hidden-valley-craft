// Placed one-shot sounds each make a panner. They used to stay wired to the mix for ever (docs/REVIEW.md, E1):
// thousands in an hour's play. A stand-in for Web Audio counts what is connected and what is let go.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Sound, PLACED_LIFE } from '../src/audio/audio.ts';

/** Any node, parameter or buffer: every method exists and does nothing; `connect` hands back what it was given. */
function fake(own: Record<string, unknown> = {}): Record<string, unknown> {
  const made: Record<string | symbol, unknown> = { ...own };
  return new Proxy(made, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'then') return undefined;
      if (k === 'connect') return (dest: unknown) => dest;
      if (k === 'getChannelData') return () => new Float32Array(16);
      if (typeof k === 'string' && /^(gain|frequency|Q|detune|playbackRate|position[XYZ]|forward[XYZ]|up[XYZ]|listener)$/.test(k)) return (t[k] = fake({ value: 0 }));
      if (k === 'duration') return 4;
      return (t[k] = () => fake());
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

const live = new Set<object>();
class FakePanner {
  constructor() { return fake({ connect: (d: unknown) => { live.add(this); return d; }, disconnect: () => { live.delete(this); } }) as unknown as FakePanner; }
}
class FakeContext {
  currentTime = 0;
  sampleRate = 4;
  constructor() { return fake({ currentTime: 0, sampleRate: 4 }) as unknown as FakeContext; }
}

const listener = { x: 0, y: 80, z: 0, fx: 1, fy: 0, fz: 0, underwater: false, open: 1, inValley: true, creekDist: 10, hour: 12, falls: [] };

describe('placed sounds let their panners go (E1)', () => {
  const g = globalThis as unknown as Record<string, unknown>;
  beforeEach(() => { live.clear(); g.AudioContext = FakeContext; g.PannerNode = FakePanner; });
  afterEach(() => { delete g.AudioContext; delete g.PannerNode; });

  it('a thousand shots leave nothing wired once they are over', () => {
    const s = new Sound();
    s.start();
    Object.assign(s, { nextBird: Infinity, nextFrog: Infinity, nextOwl: Infinity, nextBand: Infinity }); // no birds of the game's own
    const ctx = (s as unknown as { ctx: { currentTime: number } }).ctx;
    const before = live.size; // the two waterfalls' panners stay for good
    for (let i = 0; i < 1000; i++) s.lure(10, 80, 10);
    expect(live.size).toBe(before + 1000);
    // Still sounding: nothing is cut off.
    ctx.currentTime = PLACED_LIFE - 0.5;
    s.update(listener as never);
    expect(live.size).toBe(before + 1000);
    ctx.currentTime = PLACED_LIFE + 0.1;
    s.update(listener as never);
    expect(live.size).toBe(before);
    expect(s.placedCount).toBe(0);
  });

  it('a sound made later outlives the sweep of the earlier ones', () => {
    const s = new Sound();
    s.start();
    Object.assign(s, { nextBird: Infinity, nextFrog: Infinity, nextOwl: Infinity, nextBand: Infinity }); // no birds of the game's own
    const ctx = (s as unknown as { ctx: { currentTime: number } }).ctx;
    const before = live.size;
    s.hiss(0, 80, 0);
    ctx.currentTime = 5;
    s.stinger(1, 50, 80, 0);
    ctx.currentTime = PLACED_LIFE + 1;
    s.update(listener as never);
    expect(live.size).toBe(before + 1);
    ctx.currentTime = 5 + PLACED_LIFE + 1;
    s.update(listener as never);
    expect(live.size).toBe(before);
  });
});
