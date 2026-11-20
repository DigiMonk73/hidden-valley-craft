// Prints the home as letters, one level or one north–south / east–west cut at a time, for checking a layout by eye.
// Usage: node --experimental-strip-types --no-warnings tools/homeslice.ts y=82 [x0 x1 z0 z1]   (or x=1807, or z=1024)
import { generateColumn } from '../src/gen/terrain.ts';
import { blockName } from '../src/world/blocks.ts';
import { CS } from '../src/world/constants.ts';

const cols = new Map<string, Uint16Array>();
export function genBlock(x: number, y: number, z: number): string {
  const cx = x >> 5, cz = z >> 5, k = `${cx},${cz}`;
  let c = cols.get(k);
  if (!c) cols.set(k, (c = generateColumn(cx, cz)));
  return blockName(c[(y << 10) | ((z & (CS - 1)) << 5) | (x & (CS - 1))]);
}
const LETTER: [RegExp, string][] = [
  [/^air$/, ' '], [/^limestone$/, '#'], [/^limestone_mossy$/, '%'], [/^stone_bricks$/, 'B'], [/^planks$/, '='], [/^cobble$/, 'o'],
  [/^iron_ore$/, 'i'], [/^lantern$/, '*'], [/^chest$/, 'C'], [/^rug/, '~'], [/^stone_railing/, 'r'], [/^log/, 'L'], [/^glass$/, 'G'],
  [/^(dirt|grass|forest_floor)$/, '.'], [/^leaves$/, '&'],
];
const letter = (n: string) => LETTER.find(([re]) => re.test(n))?.[1] ?? n[0].toUpperCase();

if (process.argv[1]?.endsWith('homeslice.ts')) {
  const [cut, ...rest] = process.argv.slice(2);
  const [axis, at] = cut.split('=');
  const v = Number(at);
  const [x0, x1, z0, z1] = rest.length >= 4 ? rest.map(Number) : [1788, 1836, 1002, 1046];
  const seen = new Map<string, string>();
  const row = (f: (k: number) => string, a: number, b: number) => { let s = ''; for (let k = a; k <= b; k++) { const n = f(k); const l = letter(n); if (!' #%'.includes(l)) seen.set(l, (seen.get(l) ?? '') + (seen.get(l)?.includes(n) ? '' : ' ' + n)); s += l; } return s; };
  if (axis === 'y') { console.log(`y ${v}: x ${x0}..${x1} →, z ${z0}..${z1} ↓`); for (let z = z0; z <= z1; z++) console.log(String(z).padStart(5), row((x) => genBlock(x, v, z), x0, x1)); }
  else if (axis === 'x') { console.log(`x ${v}: z ${z0}..${z1} →, y down from 130`); for (let y = 130; y >= 76; y--) console.log(String(y).padStart(5), row((z) => genBlock(v, y, z), z0, z1)); }
  else { console.log(`z ${v}: x ${x0}..${x1} →, y down from 124`); for (let y = 124; y >= 76; y--) console.log(String(y).padStart(5), row((x) => genBlock(x, y, v), x0, x1)); }
  for (const [l, n] of seen) console.log(`  ${l}:${n}`);
}
