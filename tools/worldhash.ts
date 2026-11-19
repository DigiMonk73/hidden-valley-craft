// Hashes generated columns, to prove the land of earlier phases is unchanged by new work.
// Run: node --experimental-strip-types --no-warnings tools/worldhash.ts out/hash.json [cx0 cx1 cz0 cz1]
// Writes { "cx,cz": hash } for every column in the range (default: the whole world east of the ravine).
// Compare two runs: node --experimental-strip-types --no-warnings tools/worldhash.ts --diff a.json b.json

import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { generateColumn } from '../src/gen/terrain.ts';
import { COLS_X, COLS_Z } from '../src/world/constants.ts';
import { BLOCK_DEFS } from '../src/world/blocks.ts';

/** FNV-1a over the column's blocks by name, so adding blocks to the data (which shifts ids) changes nothing. */
const nameHash = BLOCK_DEFS.map((d) => { let h = 2166136261; for (const ch of d.name) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; });
export function hashColumn(cx: number, cz: number): number {
  const col = generateColumn(cx, cz);
  let h = 2166136261;
  for (let i = 0; i < col.length; i++) h = Math.imul(h ^ nameHash[col[i]], 16777619);
  return h >>> 0;
}

if (process.argv[1]?.endsWith('worldhash.ts')) {
  const a = process.argv.slice(2);
  if (a[0] === '--diff') {
    const A = JSON.parse(readFileSync(a[1], 'utf8')), B = JSON.parse(readFileSync(a[2], 'utf8'));
    const changed = Object.keys(A).filter((k) => k in B && A[k] !== B[k]);
    console.log(`${changed.length} of ${Object.keys(A).length} columns differ`);
    for (const k of changed) { const [cx, cz] = k.split(',').map(Number); console.log(`  column ${k}: x ${cx * 32}–${cx * 32 + 31}, z ${cz * 32}–${cz * 32 + 31}`); }
    process.exit(changed.length ? 1 : 0);
  }
  const out = a[0] ?? 'out/hash.json';
  const [cx0, cx1, cz0, cz1] = a.length >= 5 ? a.slice(1, 5).map(Number) : [21, COLS_X - 1, 0, COLS_Z - 1];
  const res: Record<string, number> = {};
  const t = Date.now();
  for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) res[`${cx},${cz}`] = hashColumn(cx, cz);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(res));
  console.log(`hashed ${Object.keys(res).length} columns in ${((Date.now() - t) / 1000).toFixed(1)} s → ${out}`);
}
