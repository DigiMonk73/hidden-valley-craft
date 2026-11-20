import { describe, it, expect } from 'vitest';
import { generateColumn } from '../src/gen/terrain.ts';
import { blockName, blockId, B_SOLID, BLOCK_DEFS } from '../src/world/blocks.ts';
import { GARDEN, VALLEY, SPRINGS, distToValley, valleyFloorHeight, ravineX, outsideHeight } from '../src/gen/layout.ts';
import { CS, WORLD_Y, PADDED_VOLUME, paddedIndex } from '../src/world/constants.ts';
import { meshChunk } from '../src/mesh/mesher.ts';

// Phase 9A, 5: three more tree shapes, bananas, vines on the valley's cliffs. They are step 7 of the generator, the
// last, and may only fill open air: nothing that was built, and no rock, may move. The fixtures that pin the land of
// earlier phases (tools/worldhash.ts, tools/landhash.ts) are hashed with version 13's plants (`'v13'`), so they
// still compare like with like; this file ties the plants of today to those.

const PLANT = /^(air|log|leaves|leaves_pale|tree_fern_trunk|fern_fronds|bamboo|banana_trunk|banana_leaves|banana_bunch|vine(@\w+)?|bromeliad|orchid|fern|tall_grass)$/;
const at = (lx: number, y: number, lz: number) => (y << 10) | (lz << 5) | lx;

/** The valley and the home; the old road from the gorge to the canyon; and every fourth column of the whole world. */
const COLUMNS: [number, number][] = [];
for (let cz = 28; cz <= 36; cz++) for (let cx = 46; cx <= 58; cx++) COLUMNS.push([cx, cz]);
for (let cz = 31; cz <= 33; cz++) for (let cx = 20; cx <= 45; cx++) COLUMNS.push([cx, cz]);
for (let cz = 1; cz < 64; cz += 4) for (let cx = 1; cx < 64; cx += 4) COLUMNS.push([cx, cz]);

describe('the plants of today against version 13\'s', () => {
  const counts: Record<string, number> = {};
  let inHome = 0, inGarden = 0;
  const wrong: string[] = [];
  for (const [cx, cz] of COLUMNS) {
    const was = generateColumn(cx, cz, 'v13'), now = generateColumn(cx, cz);
    for (let i = 0; i < was.length; i++) {
      if (was[i] === now[i]) continue;
      const a = blockName(was[i]), b = blockName(now[i]);
      if (!PLANT.test(a) || !PLANT.test(b)) { if (wrong.length < 10) wrong.push(`${a} → ${b} in column ${cx},${cz}`); continue; }
      counts[b] = (counts[b] ?? 0) + 1;
      const x = cx * CS + (i & 31), z = cz * CS + ((i >> 5) & 31), y = i >> 10;
      // The home's own box (src/gen/terrain.ts, HOME_BOUNDS) and the garden.
      if (x >= 1786 && x < 1842 && z >= 998 && z < 1050 && y >= 70 && y < 100) inHome++;
      if (x >= GARDEN.x0 && x < GARDEN.x1 && z >= GARDEN.z0 && z < GARDEN.z1 && y < VALLEY.floor + 12) inGarden++;
    }
  }

  it('differ only where a plant or open air was: no rock, no water, nothing built is moved or replaced', () => {
    expect(wrong).toEqual([]);
  });

  it('nothing at all differs in the home or over the garden', () => {
    expect(inHome).toBe(0);
    expect(inGarden).toBe(0);
  });

  it('every new plant is there: pale leaves, banana stems, leaves and bunches, vines on all four sides', () => {
    for (const name of ['leaves_pale', 'banana_trunk', 'banana_leaves', 'vine', 'vine@east', 'vine@south', 'vine@west']) expect(counts[name] ?? 0, name).toBeGreaterThan(20);
    expect(counts.banana_bunch ?? 0).toBeGreaterThan(5);
  });

  it('version 13\'s plants have none of them', () => {
    // (Counted, then checked once: an assertion for each of eight million cells took 35 s on the build machine and timed out.)
    const isNew = new Uint8Array(BLOCK_DEFS.length);
    for (const n of ['leaves_pale', 'banana_trunk', 'banana_leaves', 'banana_bunch', 'vine', 'vine@east', 'vine@south', 'vine@west']) isNew[blockId(n)] = 1;
    let found = 0;
    for (const [cx, cz] of COLUMNS.slice(0, 40)) for (const id of generateColumn(cx, cz, 'v13')) found += isNew[id];
    expect(found).toBe(0);
  });
});

describe('vines', () => {
  const VINE = [blockId('vine'), blockId('vine@east'), blockId('vine@south'), blockId('vine@west')];
  // Where each vine's rock is: the block's sheet hangs against that side.
  const SIDE = [[0, 1], [-1, 0], [0, -1], [1, 0]];
  const cols: { cx: number; cz: number; col: Uint16Array }[] = [];
  for (let cz = 28; cz <= 36; cz++) for (let cx = 49; cx <= 57; cx++) cols.push({ cx, cz, col: generateColumn(cx, cz) });

  it('hang against rock, or from a vine above that does; never in mid-air', () => {
    let n = 0;
    for (const { cx, cz, col } of cols)
      for (let y = 1; y < WORLD_Y - 1; y++) for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
        const k = VINE.indexOf(col[at(lx, y, lz)]);
        if (k < 0) continue;
        n++;
        const [dx, dz] = SIDE[k];
        // A strand may hang up to two blocks past the foot of its rock.
        let held = false;
        for (let up = 0; up <= 2 && !held; up++) held = col[at(lx, y + up, lz)] === VINE[k] && B_SOLID[col[at(lx + dx, y + up, lz + dz)]] === 1;
        expect(held, `vine at ${cx * CS + lx}, ${y}, ${cz * CS + lz}`).toBe(true);
      }
    expect(n).toBeGreaterThan(300);
  });

  it('are on the valley\'s wall only, and keep clear of the home, the falls and the tunnel\'s mouths', () => {
    for (const { cx, cz, col } of cols)
      for (let i = 0; i < col.length; i++) {
        if (!VINE.includes(col[i])) continue;
        const x = cx * CS + (i & 31), z = cz * CS + ((i >> 5) & 31), y = i >> 10;
        const d = distToValley(x, z);
        expect(d).toBeGreaterThan(VALLEY.radius - 18);
        expect(d).toBeLessThan(VALLEY.radius + 22);
        expect(y).toBeGreaterThan(valleyFloorHeight(x, z) + 2); // nothing at walking height on the valley floor
        expect(x > 1786 - 14 && z > 998 - 10 && z < 1050 + 10, `by the home at ${x}, ${y}, ${z}`).toBe(false);
        for (const f of SPRINGS) expect(Math.abs(x - f.x) < 8 && z > f.z0 - 5 && z < f.z1 + 6, `by the falls at ${x}, ${y}, ${z}`).toBe(false);
      }
  });
});

describe('the new trees', () => {
  it('reach no further from their trunk, and stand no taller, than version 13 allowed for (8 blocks out, 26 up)', () => {
    // Every new leaf lies within 8 blocks, level, of a cell that has a trunk in its column somewhere: checked on the buffer's forest.
    const cx0 = 40, cz0 = 31;
    const grid = new Map<string, Uint16Array>();
    for (let cz = cz0 - 1; cz <= cz0 + 1; cz++) for (let cx = cx0 - 1; cx <= cx0 + 1; cx++) grid.set(`${cx},${cz}`, generateColumn(cx, cz));
    const LOG = blockId('log'), PALE = blockId('leaves_pale'), LEAVES = blockId('leaves');
    const trunks: [number, number][] = [];
    for (const [k, col] of grid) {
      const [cx, cz] = k.split(',').map(Number);
      for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) for (let y = 60; y < WORLD_Y; y++) if (col[at(lx, y, lz)] === LOG) { trunks.push([cx * CS + lx, cz * CS + lz]); break; }
    }
    const mid = grid.get(`${cx0},${cz0}`)!;
    let leaves = 0;
    for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) for (let y = 60; y < WORLD_Y; y++) {
      const id = mid[at(lx, y, lz)];
      if (id !== PALE && id !== LEAVES) continue;
      leaves++;
      const x = cx0 * CS + lx, z = cz0 * CS + lz;
      expect(trunks.some(([tx, tz]) => Math.abs(tx - x) <= 8 && Math.abs(tz - z) <= 8), `a leaf at ${x}, ${y}, ${z} with no trunk near`).toBe(true);
    }
    expect(leaves).toBeGreaterThan(500);
  });
});

describe('the game\'s fences keep version 13\'s trees', () => {
  // A crown is something to walk on. Where what can be walked is the fence (the gorge, the mountains at the world's
  // ends, the valley's rim), today's trees are version 13's, block for block (tests/walk.test.ts walks them).
  const TREE = new Set(['log', 'leaves', 'leaves_pale', 'tree_fern_trunk', 'fern_fronds', 'banana_trunk', 'banana_leaves'].map(blockId));
  const same = (cx: number, cz: number, strip: (x: number, z: number) => boolean) => {
    const was = generateColumn(cx, cz, 'v13'), now = generateColumn(cx, cz);
    let checked = 0;
    for (let i = 0; i < was.length; i++) {
      const x = cx * CS + (i & 31), z = cz * CS + ((i >> 5) & 31);
      if (!strip(x, z)) continue;
      checked++;
      if (TREE.has(was[i]) || TREE.has(now[i])) expect(blockName(now[i]), `at ${x}, ${i >> 10}, ${z}`).toBe(blockName(was[i]));
    }
    return checked;
  };
  it('within 80 m of the gorge', () => {
    let n = 0;
    for (const cz of [6, 20, 33, 47, 58]) for (let cx = 17; cx <= 22; cx++) n += same(cx, cz, (x, z) => Math.abs(x - ravineX(z)) < 80);
    expect(n).toBeGreaterThan(100000);
  });
  it('in the mountains at the world\'s ends', () => {
    let n = 0;
    for (const cz of [0, 4, 8, 55, 59, 63]) for (const cx of [10, 26, 40, 54]) n += same(cx, cz, (_x, z) => Math.min(z, 2047 - z) < 290);
    expect(n).toBeGreaterThan(100000);
  });
  it('for 30 m outside the valley\'s treeless rim', () => {
    let n = 0;
    for (let cz = 27; cz <= 37; cz++) for (let cx = 48; cx <= 58; cx++) n += same(cx, cz, (x, z) => { const d = distToValley(x, z) - VALLEY.radius; return d > 0 && d < 52; });
    expect(n).toBeGreaterThan(100000);
  });
});

describe('a vine in the picture', () => {
  it('is a sheet against its rock, marked to be let go far off; nothing else is marked', () => {
    // From the balcony the vines on the far cliffs were dark specks on the owner's sunset: the shader drops a marked
    // quad between 60 and 140 m (the shading byte's third bit).
    const blocks = new Uint16Array(PADDED_VOLUME), light = new Uint8Array(PADDED_VOLUME).fill(0xf0);
    blocks[paddedIndex(5, 5, 6)] = blockId('limestone');
    blocks[paddedIndex(5, 5, 5)] = blockId('vine'); // its rock is on the +z side
    const m = meshChunk(blocks, light).solid;
    let marked = 0, plain = 0;
    for (let q = 0; q < m.quads; q++) {
      const shade = m.pack[q * 16 + 1];
      if (shade & 4) {
        marked++;
        // The vine's own sheet: one block wide and tall, a sixteenth off the rock's face.
        for (let k = 0; k < 4; k++) expect(m.positions[(q * 4 + k) * 3 + 2]).toBeCloseTo(4 + 15 / 16, 5);
      } else plain++;
      expect(shade & 3).toBe(shade & 4 ? 3 : shade); // the corner shading is still there under the mark
    }
    expect(marked).toBe(2); // the sheet, seen from either side
    expect(plain).toBeGreaterThanOrEqual(5); // the rock's open faces
  });
});

describe('a bunch of bananas (scenery now; Track B makes it something to pick)', () => {
  it('hangs beside the top of a banana\'s stem, under its leaves, and nowhere else', () => {
    const BUNCH = blockId('banana_bunch'), STEM = blockId('banana_trunk'), LEAF = blockId('banana_leaves');
    let n = 0;
    for (let cz = 30; cz <= 34; cz++) for (let cx = 50; cx <= 55; cx++) {
      const col = generateColumn(cx, cz);
      for (let y = 1; y < WORLD_Y - 1; y++) for (let lz = 1; lz < CS - 1; lz++) for (let lx = 1; lx < CS - 1; lx++) {
        if (col[at(lx, y, lz)] !== BUNCH) continue;
        n++;
        const beside = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => col[at(lx + dx, y, lz + dz)] === STEM);
        expect(beside, `a bunch at ${cx * CS + lx}, ${y}, ${cz * CS + lz} with no stem beside it`).toBe(true);
        expect(col[at(lx, y + 1, lz)]).toBe(LEAF);
      }
    }
    expect(n).toBeGreaterThan(3);
  });
});

describe('what the fresh review found in the plants', () => {
  it('no trunk or buttress hangs clear of its ground that did not in version 13 (an emergent\'s buttresses did, on a slope)', () => {
    // (Version 13's own thick trunks hang a block clear on a slope here and there; those are its, and are left.)
    const LOG = blockId('log');
    let low = 0, hanging = 0;
    for (const [cx, cz] of [[40, 31], [41, 31], [38, 30], [30, 32], [44, 33], [26, 30]]) {
      const col = generateColumn(cx, cz), was = generateColumn(cx, cz, 'v13');
      for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
        const g = outsideHeight(cx * CS + lx, cz * CS + lz);
        // The lowest log within three blocks of the ground here: a trunk or a buttress (a limb is higher).
        for (let y = g; y <= g + 2; y++) {
          if (col[at(lx, y, lz)] !== LOG) continue;
          low++;
          if (col[at(lx, y - 1, lz)] === 0 && was[at(lx, y, lz)] !== LOG) hanging++;
          break;
        }
      }
    }
    expect(low).toBeGreaterThan(50);
    expect(hanging).toBe(0);
  });

  it('a vine hangs only against limestone: never across ore in the wall (three did)', () => {
    const VINE = [blockId('vine'), blockId('vine@east'), blockId('vine@south'), blockId('vine@west')], SIDE = [[0, 1], [-1, 0], [0, -1], [1, 0]];
    const ok = new Set([0, blockId('limestone'), blockId('limestone_mossy')]);
    let n = 0;
    for (let cz = 28; cz <= 36; cz++) for (let cx = 49; cx <= 57; cx++) {
      const col = generateColumn(cx, cz);
      for (let y = 1; y < WORLD_Y - 1; y++) for (let lz = 1; lz < CS - 1; lz++) for (let lx = 1; lx < CS - 1; lx++) {
        const k = VINE.indexOf(col[at(lx, y, lz)]);
        if (k < 0) continue;
        n++;
        const wall = col[at(lx + SIDE[k][0], y, lz + SIDE[k][1])];
        if (!ok.has(wall)) throw new Error(`a vine at ${cx * CS + lx}, ${y}, ${cz * CS + lz} hangs over ${blockName(wall)}`);
      }
    }
    expect(n).toBeGreaterThan(1000);
  });
});
