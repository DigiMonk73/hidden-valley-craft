// Hashes the generated land by block NAME (ids move when blocks are added), leaving out a box: by default
// the builder's home. Used to show a change to the home changed nothing outside it.
// Usage: node --experimental-strip-types --no-warnings tools/landhash.ts [cx0 cz0 cx1 cz1] > out/landhash.txt
import { generateColumn } from '../src/gen/terrain.ts';
import { blockName } from '../src/world/blocks.ts';
import { CS, WORLD_Y } from '../src/world/constants.ts';

/** The box the home may change inside: its bounds in terrain.ts, at every height. */
export const HOME_BOX = { x0: 1786, x1: 1842, z0: 998, z1: 1050 };

const nameHash = new Map<number, number>();
function hashOfName(id: number): number {
  let h = nameHash.get(id);
  if (h === undefined) {
    h = 2166136261;
    for (const ch of blockName(id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    nameHash.set(id, h >>> 0);
  }
  return h;
}

export function columnHash(cx: number, cz: number): string {
  const col = generateColumn(cx, cz, 'v13'); // version 13's plants, as the fixture was made (tests/plants.test.ts)
  let h = 2166136261;
  for (let y = 0; y < WORLD_Y; y++)
    for (let lz = 0; lz < CS; lz++)
      for (let lx = 0; lx < CS; lx++) {
        const x = cx * CS + lx, z = cz * CS + lz;
        if (x >= HOME_BOX.x0 && x < HOME_BOX.x1 && z >= HOME_BOX.z0 && z < HOME_BOX.z1) continue;
        h = Math.imul(h ^ hashOfName(col[(y << 10) | (lz << 5) | lx]), 16777619);
      }
  return (h >>> 0).toString(16).padStart(8, '0');
}

if (process.argv[1]?.endsWith('landhash.ts')) {
  const [a, b, c, d] = process.argv.slice(2).map(Number);
  const [cx0, cz0, cx1, cz1] = process.argv.length >= 6 ? [a, b, c, d] : [0, 0, 63, 63];
  for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) console.log(`${cx},${cz} ${columnHash(cx, cz)}`);
}
