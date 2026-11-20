// Where can the valley be walked into over its rim? (docs/PHASE9B.md, 3.) Floods the generated land from where the
// player comes out of the tunnel, by the real Player's step rules, and stops at the "deep" part of the valley's
// bowl: anything more than DEEP blocks below the plateau. Every place where the flood would have stepped or
// fallen into the deep part is a crossing: printed in groups by bearing from the valley's centre.
//
// Usage: node --experimental-strip-types --no-warnings tools/rimwalk.ts [jumps]
import { Land, Flood, standing, measureRules, type Spot } from '../tests/walk.ts';
import { VALLEY, HOME_GROUNDS, GATE, CANYON_FALLS, distToValley, outsideHeight } from '../src/gen/layout.ts';
import { WORLD_X } from '../src/world/constants.ts';

export const DEEP = 24;
/** The plateau's height on the bearing of (x, z), just outside the bowl. */
export function plateauAt(x: number, z: number): number {
  const d = distToValley(x, z) || 1, ux = (x - VALLEY.cx) / d, uz = (z - VALLEY.cz) / d;
  let h = 0;
  for (const r of [112, 116, 120]) h = Math.max(h, outsideHeight(Math.round(VALLEY.cx + ux * r), Math.round(VALLEY.cz + uz * r)));
  return h;
}
export const deep = (x: number, y: number, z: number): boolean => distToValley(x, z) < VALLEY.radius + 8 && y < plateauAt(x, z) - DEEP;

if (process.argv[1]?.endsWith('rimwalk.ts')) {
  const land = new Land();
  const at = land.blockAt;
  const R = measureRules();
  const M = 200;
  const x0 = VALLEY.cx - VALLEY.radius - M, x1 = Math.min(WORLD_X - 1, HOME_GROUNDS.x1 + M), z0 = VALLEY.cz - VALLEY.radius - M, z1 = VALLEY.cz + VALLEY.radius + M;
  const inside = (x: number, z: number) => x >= x0 && x <= x1 && z >= z0 && z <= z1;
  const out = Math.floor(CANYON_FALLS.x) - 12;
  const starts: Spot[] = standing(at, out, GATE.z0 + 1).slice(-1);
  const jumps = process.argv.includes('jumps');
  const hits: [number, number, number][] = [];
  const barred = (x: number, y: number, z: number) => { if (deep(x, y, z)) { hits.push([x, y, z]); return true; } return false; };
  const t0 = Date.now();
  const flood = new Flood(at, starts, jumps ? { inside, jumps: true, barred } : { inside, drop: R.safeFall, barred });
  console.log(`${jumps ? 'running jumps, any fall short of deadly' : 'walking, harmless falls'}: ${flood.spots.length} places reached in ${((Date.now() - t0) / 1000).toFixed(0)} s; ${hits.length} steps into the deep valley`);
  // Group by bearing (degrees clockwise from east, as x+ is east and z+ south).
  const byDeg = new Map<number, [number, number, number][]>();
  for (const h of hits) { const a = Math.round((Math.atan2(h[2] - VALLEY.cz, h[0] - VALLEY.cx) * 180) / Math.PI); byDeg.set(a, [...(byDeg.get(a) ?? []), h]); }
  const degs = [...byDeg.keys()].sort((a, b) => a - b);
  let run: number[] = [];
  const flush = () => {
    if (!run.length) return;
    const all = run.flatMap((d) => byDeg.get(d)!);
    const ys = all.map((h) => h[1]), ds = all.map((h) => distToValley(h[0], h[2]));
    const mid = all[Math.floor(all.length / 2)];
    console.log(`  bearing ${run[0]}°…${run[run.length - 1]}°: ${all.length} steps, y ${Math.min(...ys)}…${Math.max(...ys)}, ${Math.min(...ds).toFixed(0)}…${Math.max(...ds).toFixed(0)} m from the centre, e.g. (${mid.join(', ')}); plateau ${plateauAt(mid[0], mid[2])}`);
    run = [];
  };
  for (const d of degs) { if (run.length && d - run[run.length - 1] > 2) flush(); run.push(d); }
  flush();
}
