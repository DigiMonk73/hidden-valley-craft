import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Flock, Birds, quetzalDay, SHY, BIRD_KINDS, type BirdFrame, type BirdEvent } from '../src/render/birds.ts';
import { quetzalTree, generateColumn } from '../src/gen/terrain.ts';
import { blockId, blockName, AIR } from '../src/world/blocks.ts';
import { VALLEY, GARDEN, valleyFloorHeight, inValleyBowl, inSanctuary } from '../src/gen/layout.ts';
import { makeRng } from '../src/core/noise.ts';

// Phase 9A, 6: hummingbirds, doves, the quetzal. Scenery: no health, no minds, the valley only. What they do is plain
// arithmetic (Flock) and is checked here; how they look is judged in pictures.

const GRASS = blockId('grass'), ORCHID = blockId('orchid'), LEAVES = blockId('leaves'), LOG = blockId('log');
/** A valley of bare grass at the floor's own height, with whatever is put on it. */
function land(extra: Map<string, number> = new Map()) {
  return (x: number, y: number, z: number) => extra.get(`${x},${y},${z}`) ?? (y < valleyFloorHeight(x, z) ? GRASS : AIR);
}
const HERE = { x: 1700.5, z: 1040.5 }; // open floor, mid-valley
function frame(over: Partial<BirdFrame> = {}): BirdFrame {
  const y = valleyFloorHeight(HERE.x, HERE.z);
  return { px: HERE.x, py: y + 1.62, pz: HERE.z, hour: 9, day: 0, time: 0, sprinting: false, blockAt: land(), tree: null, ...over };
}
/** Runs the flock for `seconds`; returns every event. */
function run(flock: Flock, f: BirdFrame, seconds: number, lively = true, each?: (f: BirdFrame) => void): BirdEvent[] {
  const all: BirdEvent[] = [];
  for (let t = 0; t < seconds; t += 1 / 30) { f.time += 1 / 30; all.push(...flock.update(1 / 30, f, lively)); each?.(f); }
  return all;
}
function flowers(n: number): Map<string, number> {
  const m = new Map<string, number>();
  for (let k = 0; k < n; k++) { const x = Math.floor(HERE.x) + 4 + k * 2, z = Math.floor(HERE.z) + 3; m.set(`${x},${valleyFloorHeight(x, z)},${z}`, ORCHID); }
  return m;
}

describe('the valley\'s birds', () => {
  it('are there by day in the valley, and nowhere else: not at night, not outside, not with effects off', () => {
    const day = new Flock(makeRng(1));
    run(day, frame({ blockAt: land(flowers(5)) }), 20);
    expect(day.count('dove')).toBeGreaterThan(0);
    expect(day.count('hummingbird')).toBeGreaterThan(0);
    for (const b of day.birds) expect(inValleyBowl(b.x, b.z) || b.mode === 'leave').toBe(true);

    const night = new Flock(makeRng(1));
    run(night, frame({ hour: 23, blockAt: land(flowers(5)) }), 20);
    expect(night.birds.length).toBe(0);

    const outside = new Flock(makeRng(1));
    run(outside, frame({ px: 1400.5, pz: 1030.5, py: 110 }), 20);
    expect(outside.birds.length).toBe(0);

    const off = new Flock(makeRng(1));
    run(off, frame({ blockAt: land(flowers(5)) }), 20, false);
    expect(off.birds.length).toBe(0);
  });

  it('leave when night falls, and are gone', () => {
    const flock = new Flock(makeRng(2)), f = frame({ blockAt: land(flowers(5)) });
    run(flock, f, 20);
    expect(flock.birds.length).toBeGreaterThan(2);
    f.hour = 20;
    run(flock, f, 12);
    expect(flock.birds.length).toBe(0);
  });

  it('are few: never more than a dozen, however long they are watched', () => {
    const flock = new Flock(makeRng(3)), f = frame({ blockAt: land(flowers(12)), day: 1, tree: null });
    let most = 0;
    run(flock, f, 120, true, () => { most = Math.max(most, flock.birds.length); });
    expect(most).toBeLessThanOrEqual(8);
  });
});

describe('hummingbirds', () => {
  it('come only where there are flowers, hover beside one, and move on to another', () => {
    const none = new Flock(makeRng(4));
    run(none, frame(), 20);
    expect(none.count('hummingbird')).toBe(0);

    const flock = new Flock(makeRng(4)), fl = flowers(5), f = frame({ blockAt: land(fl) });
    const visited = new Set<string>();
    run(flock, f, 60, true, () => {
      for (const b of flock.birds) {
        if (b.kind !== 'hummingbird' || b.mode !== 'hover') continue;
        const key = `${Math.floor(b.tx)},${Math.floor(b.ty)},${Math.floor(b.tz)}`;
        expect(fl.has(key), `hovering at ${key}, which is no flower`).toBe(true);
        expect(Math.hypot(b.x - b.tx, b.z - b.tz)).toBeLessThan(0.05); // beside it, still
        visited.add(key);
      }
    });
    expect(flock.count('hummingbird')).toBeGreaterThan(0);
    expect(flock.count('hummingbird')).toBeLessThanOrEqual(3);
    expect(visited.size).toBeGreaterThan(1);
  });

  it('are gone from a flower before a hand reaches it', () => {
    const flock = new Flock(makeRng(5)), f = frame({ blockAt: land(flowers(5)) });
    run(flock, f, 15);
    const hovering = () => flock.birds.find((q) => q.kind === 'hummingbird' && q.mode === 'hover' && q.t > 0.5);
    for (let t = 0; t < 30 && !hovering(); t += 1 / 30) run(flock, f, 1 / 30);
    const b = hovering()!;
    expect(b).toBeDefined();
    f.px = b.x + 0.5; f.py = b.y; f.pz = b.z; // the player is on it
    run(flock, f, 1.5);
    expect(Math.hypot(b.x - f.px, b.y - f.py, b.z - f.pz)).toBeGreaterThan(SHY.hummingbird);
  });
});

describe('doves', () => {
  it('walk on the valley floor, well clear of the player, and stay on it', () => {
    const flock = new Flock(makeRng(6)), f = frame();
    run(flock, f, 30, true, () => {
      for (const b of flock.birds) {
        if (b.kind !== 'dove' || b.mode !== 'peck') continue;
        expect(b.y).toBe(valleyFloorHeight(b.x, b.z));
        expect(Math.hypot(b.x - f.px, b.z - f.pz)).toBeGreaterThan(SHY.dove - 0.6);
      }
    });
    expect(flock.count('dove')).toBeGreaterThanOrEqual(3);
  });

  it('burst up when walked at, sooner when run at, and settle again further off', () => {
    const flock = new Flock(makeRng(7)), f = frame();
    run(flock, f, 20);
    const b = flock.birds.find((q) => q.kind === 'dove' && q.mode === 'peck')!;
    // Walk to seven metres: it stays. Run at it from there: it goes.
    const a = Math.atan2(b.z - f.pz, b.x - f.px);
    f.px = b.x - Math.cos(a) * 7.5; f.pz = b.z - Math.sin(a) * 7.5;
    expect(flock.update(1 / 30, f, true).some((e) => e.kind === 'flush')).toBe(false);
    f.sprinting = true;
    const ev = run(flock, f, 0.5);
    expect(ev.some((e) => e.kind === 'flush')).toBe(true);
    expect(b.mode === 'fly' || b.mode === 'leave').toBe(true);
    f.sprinting = false;
    let up = 0;
    run(flock, f, 14, true, () => { if (b.mode === 'fly') up = Math.max(up, b.y - valleyFloorHeight(b.x, b.z)); });
    expect(up).toBeGreaterThan(1.5); // it flew, it did not slide
    if (b.mode === 'peck') {
      expect(Math.hypot(b.x - f.px, b.z - f.pz)).toBeGreaterThan(15);
      expect(b.y).toBe(valleyFloorHeight(b.x, b.z));
    }
  });
});

describe('the quetzal', () => {
  const tree = quetzalTree()!;
  /** The tree as a trunk and a crown, on the bare floor. */
  const withTree = () => {
    const m = new Map<string, number>(), g = valleyFloorHeight(tree.x, tree.z);
    for (let y = g; y < g + 8; y++) m.set(`${tree.x},${y},${tree.z}`, LOG);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let y = g + 8; y < g + 11; y++) m.set(`${tree.x + dx},${y},${tree.z + dz}`, LEAVES);
    return m;
  };
  const near = (over: Partial<BirdFrame> = {}) => frame({ px: tree.x + 20.5, pz: tree.z + 8.5, py: valleyFloorHeight(tree.x + 20, tree.z + 8) + 1.62, hour: 7, day: 1, blockAt: land(withTree()), tree, ...over });

  it('has one tree: a broadleaf in the valley, by the garden, and it really grows there', () => {
    expect(inSanctuary(tree.x, tree.z)).toBe(true);
    expect(Math.hypot(tree.x - GARDEN.x0, tree.z - GARDEN.z1)).toBeLessThan(60);
    const col = generateColumn(tree.x >> 5, tree.z >> 5), g = valleyFloorHeight(tree.x, tree.z);
    expect(blockName(col[(g << 10) | ((tree.z & 31) << 5) | (tree.x & 31)])).toBe('log');
    expect(quetzalTree()).toBe(tree); // worked out once
  });

  it('comes the first morning and every third after, not in between', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].filter(quetzalDay)).toEqual([1, 4, 7]);
    for (const day of [0, 2, 3]) { const f = new Flock(makeRng(8)); run(f, near({ day }), 10); expect(f.count('quetzal')).toBe(0); }
    for (const hour of [4, 12, 20]) { const f = new Flock(makeRng(8)); run(f, near({ hour }), 10); expect(f.count('quetzal')).toBe(0); }
  });

  it('sits on top of its tree, calls now and then, and is noticed', () => {
    const flock = new Flock(makeRng(9)), f = near();
    const ev = run(flock, f, 30);
    expect(flock.count('quetzal')).toBe(1);
    const q = flock.birds.find((b) => b.kind === 'quetzal')!;
    expect(q.mode).toBe('perch');
    expect(Math.hypot(q.x - tree.x, q.z - tree.z)).toBeLessThan(3);
    expect(q.y).toBe(valleyFloorHeight(tree.x, tree.z) + 11); // standing on the crown's top
    const calls = ev.filter((e) => e.kind === 'quetzal_call').length;
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(calls).toBeLessThan(6); // now and then, not a car alarm
    expect(ev.some((e) => e.kind === 'quetzal_seen')).toBe(true);
  });

  it('leaves when you come under its tree, and is not back that morning; it is, three days on', () => {
    const flock = new Flock(makeRng(10)), f = near();
    run(flock, f, 5);
    expect(flock.count('quetzal')).toBe(1);
    f.px = tree.x + 2.5; f.pz = tree.z + 0.5; f.py = valleyFloorHeight(tree.x + 2, tree.z) + 1.62 + 4; // climbing toward it
    run(flock, f, 12);
    expect(flock.count('quetzal')).toBe(0);
    f.px = tree.x + 20.5; f.pz = tree.z + 8.5;
    run(flock, f, 20);
    expect(flock.count('quetzal')).toBe(0);
    f.day = 4;
    run(flock, f, 5);
    expect(flock.count('quetzal')).toBe(1);
  });

  it('does not come to a tree that has been felled', () => {
    const flock = new Flock(makeRng(11));
    run(flock, near({ blockAt: land() }), 10);
    expect(flock.count('quetzal')).toBe(0);
  });
});

describe('the birds drawn', () => {
  it('one mesh a kind, as many of each as there are, none when there are none', () => {
    const birds = new Birds();
    expect(birds.meshes.length).toBe(BIRD_KINDS.length);
    const light = (_x: number, _y: number, _z: number, out: THREE.Color) => out.setRGB(1, 1, 1);
    birds.draw(light);
    for (const m of birds.meshes) expect(m.visible).toBe(false);
    const f = frame({ blockAt: land(flowers(5)) });
    for (let t = 0; t < 20; t += 1 / 30) { f.time += 1 / 30; birds.flock.update(1 / 30, f, true); }
    birds.draw(light);
    BIRD_KINDS.forEach((kind, k) => {
      expect(birds.meshes[k].geometry.instanceCount).toBe(birds.flock.count(kind));
      expect(birds.meshes[k].visible).toBe(birds.flock.count(kind) > 0);
    });
    // A bird is a few dozen boxes: nothing beside the land.
    let tris = 0;
    for (const m of birds.meshes) tris += (m.geometry.index!.count / 3) * m.geometry.instanceCount;
    expect(tris).toBeLessThan(4000);
  });
});
