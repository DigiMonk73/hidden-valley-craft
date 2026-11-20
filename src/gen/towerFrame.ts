// The relay tower's steel frame (docs/PHASE8.md), as plain geometry: four tapering legs, a ring of girts at
// each level, one brace across each face, the top quarter buckled by a storm and one leg snapped. The same
// frame is built of blocks on the ridge (src/gen/zone4.ts) and drawn as thin beams from afar
// (src/render/tower.ts), so the shape on the skyline is the shape you walk up to. Pure.

export type P3 = [number, number, number];
export interface Beam { a: P3; b: P3; t: number }

/** Half the frame's width at its foot and at its top, and how many levels of bracing it has. */
export const TOWER_FRAME = { base: 5, top: 1, levels: 10, mast: 3 };

/** A corner of the frame at height y (k: 0 north-west, 1 north-east, 2 south-east, 3 south-west), from the tower's centre on the ground. */
export function towerCorner(k: number, y: number, height: number): P3 {
  const half = TOWER_FRAME.base + (TOWER_FRAME.top - TOWER_FRAME.base) * (y / height);
  const sx = k === 0 || k === 3 ? -1 : 1, sz = k < 2 ? -1 : 1;
  // Above three quarters of its height the frame leans away, buckled.
  const bend = Math.max(0, y - height * 0.75);
  return [sx * half + bend * bend * 0.012, y, sz * half + bend * 0.1];
}

/** One leg (the south-east) is snapped off near the top. */
const broken = (k: number, y: number, height: number) => k === 2 && y > height * 0.86;

/** Every beam of the frame, from the tower's centre on the ground. */
export function towerBeams(height: number): Beam[] {
  const out: Beam[] = [];
  const L = TOWER_FRAME.levels;
  for (let i = 0; i < L; i++) {
    const y0 = (height * i) / L, y1 = (height * (i + 1)) / L;
    for (let k = 0; k < 4; k++) {
      const n = (k + 1) % 4;
      if (!broken(k, y1, height)) out.push({ a: towerCorner(k, y0, height), b: towerCorner(k, y1, height), t: 0.45 });
      if (broken(k, y1, height) || broken(n, y1, height)) continue;
      out.push({ a: towerCorner(k, y1, height), b: towerCorner(n, y1, height), t: 0.25 });
      // One brace a face, leaning the other way on each level.
      out.push(i % 2 ? { a: towerCorner(k, y0, height), b: towerCorner(n, y1, height), t: 0.2 } : { a: towerCorner(n, y0, height), b: towerCorner(k, y1, height), t: 0.2 });
    }
  }
  // The mast at the top.
  const tip = towerTip(height);
  out.push({ a: tip, b: [tip[0], tip[1] + TOWER_FRAME.mast, tip[2]], t: 0.3 });
  return out;
}

/** The middle of the frame's top: where the mast stands, and the beacon on it. */
export function towerTip(height: number): P3 {
  const a = towerCorner(0, height, height), b = towerCorner(1, height, height);
  return [(a[0] + b[0]) / 2, height, (a[2] + b[2]) / 2];
}

/**
 * The frame as blocks: every cell a beam passes through, as offsets [dx, dy, dz] from the block the tower's
 * centre stands on (dy 0 is the first block above the ground). No cell twice.
 */
export function towerCells(height: number): P3[] {
  const seen = new Set<number>(), out: P3[] = [];
  for (const { a, b } of towerBeams(height)) {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * 3);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      // The top of the frame is the last whole block under `height`, not one above it.
      const x = Math.floor(a[0] + (b[0] - a[0]) * t + 0.5), y = Math.min(height + TOWER_FRAME.mast - 1, Math.floor(a[1] + (b[1] - a[1]) * t)), z = Math.floor(a[2] + (b[2] - a[2]) * t + 0.5);
      const key = ((y + 8) << 16) | ((x + 64) << 8) | (z + 64);
      if (!seen.has(key)) { seen.add(key); out.push([x, y, z]); }
    }
  }
  return out;
}
