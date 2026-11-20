import { describe, it, expect } from 'vitest';
import { buildFarLand, FAR_CELL, FAR_KINDS } from '../src/gen/farland.ts';
import { surfaceHeight, VALLEY } from '../src/gen/layout.ts';
import { hideFarLand } from '../src/render/farmask.ts';
import { COLS_X, COLS_Z } from '../src/world/constants.ts';

describe('distant land', () => {
  it('closes every 32 m column edge down below the ground, so no sky shows under the canopy', () => {
    const m = buildFarLand();
    // Find the lowest point of any side quad on the column edge x = 1024, around z = 600…700 (forest).
    let lowest = Infinity;
    const P = m.positions;
    for (let q = 0; q < m.index.length / 6; q++) {
      const v = q * 4;
      const xs = [0, 1, 2, 3].map((k) => P[(v + k) * 3]);
      const zs = [0, 1, 2, 3].map((k) => P[(v + k) * 3 + 2]);
      if (xs.every((x) => x === 1024) && zs.every((z) => z >= 640 && z <= 648)) {
        for (let k = 0; k < 4; k++) lowest = Math.min(lowest, P[(v + k) * 3 + 1]);
      }
    }
    const ground = surfaceHeight(1024 - FAR_CELL / 2, 644);
    expect(lowest).toBeLessThan(ground - 4);
  });

  // Phase 9A, 4. The rim of the valley has no trees for 22 m (treeSpot); the distant land drew forest there, seven
  // metres too tall, and the rim dropped when the real blocks came in.
  it('draws the treeless rim of the valley as open ground at the ground\'s own height, not as forest', () => {
    const m = buildFarLand();
    const P = m.positions, M = m.mats;
    const canopy = FAR_KINDS.indexOf('canopy');
    let tops = 0;
    for (let q = 0; q < m.index.length / 6; q++) {
      const v = q * 4;
      if (M[v * 2 + 1] % 4 !== 0) continue; // top faces only
      const x = (P[v * 3] + P[(v + 2) * 3]) / 2, z = (P[v * 3 + 2] + P[(v + 2) * 3 + 2]) / 2;
      const d = Math.hypot(x - VALLEY.cx, z - VALLEY.cz);
      if (d < VALLEY.radius + 4 || d > VALLEY.radius + 18) continue;
      tops++;
      expect(Math.floor(M[v * 2 + 1] / 4), `cell at ${x}, ${z}`).not.toBe(canopy);
      expect(P[v * 3 + 1]).toBeLessThan(surfaceHeight(x, z) + 0.01);
    }
    expect(tops).toBeGreaterThan(50);
  });

  it('marks every face with its kind, and a tall bank as rock', () => {
    const m = buildFarLand();
    const M = m.mats, P = m.positions;
    const rock = FAR_KINDS.indexOf('rock');
    let tallRock = 0, tall = 0;
    for (let q = 0; q < m.index.length / 6; q++) {
      const v = q * 4, face = M[v * 2 + 1] % 4, kind = Math.floor(M[v * 2 + 1] / 4);
      expect(face).toBeLessThan(3);
      expect(kind).toBeLessThan(FAR_KINDS.length);
      if (face === 0 || kind === FAR_KINDS.indexOf('water')) continue; // (not the falls' own ribbons)
      const ys = [0, 1, 2, 3].map((k) => P[(v + k) * 3 + 1]);
      const x = P[v * 3], z = P[v * 3 + 2];
      // The valley's wall: every side there more than 20 m tall is a rock face.
      if (Math.max(...ys) - Math.min(...ys) > 20 && Math.abs(Math.hypot(x - VALLEY.cx, z - VALLEY.cz) - VALLEY.radius) < 24) { tall++; if (kind === rock) tallRock++; }
    }
    expect(tall).toBeGreaterThan(40);
    expect(tallRock).toBe(tall);
  });
});

describe('where the distant land hides (docs/PHASE9A.md, 4)', () => {
  const at = (cx: number, cz: number) => cz * COLS_X + cx;
  const mask = (cols: [number, number][]) => { const m = new Uint8Array(COLS_X * COLS_Z); for (const [x, z] of cols) m[at(x, z)] = 1; return m; };
  const disc = (ecx: number, ecz: number, r: number): [number, number][] => { const o: [number, number][] = []; for (let z = ecz - r; z <= ecz + r; z++) for (let x = ecx - r; x <= ecx + r; x++) if (Math.hypot(x - ecx, z - ecz) <= r + 0.5) o.push([x, z]); return o; };

  it('with everything round the eye drawn, the distant land hides there, and never where nothing is drawn', () => {
    const drawn = mask(disc(30, 30, 5)), inner = mask(disc(30, 30, 3));
    const out = hideFarLand(drawn, 30, 30, new Uint8Array(drawn.length));
    for (let i = 0; i < drawn.length; i++) { if (!drawn[i]) expect(out[i]).toBe(0); if (inner[i]) expect(out[i]).toBe(255); }
  });

  it('a column drawn before a nearer one keeps its distant land: no hole of sky through the nearer one', () => {
    // Columns load nearest first, but finish out of order. Here (33, 30) is still to come and (34, 30), (35, 30) behind it are in.
    const cols = disc(30, 30, 5).filter(([x, z]) => !(x === 33 && z === 30));
    const out = hideFarLand(mask(cols), 30, 30, new Uint8Array(COLS_X * COLS_Z));
    expect(out[at(33, 30)]).toBe(0); // not drawn: the distant land shows, as before
    expect(out[at(34, 30)]).toBe(0); // drawn, but seen through the missing one: the distant land stays (it was hidden: the hole)
    expect(out[at(35, 30)]).toBe(0);
    expect(out[at(32, 30)]).toBe(0); // next to the missing one: kept as well (it only fills what the real blocks leave)
    expect(out[at(31, 30)]).toBe(255); // nearer, and not next to it: unaffected
    expect(out[at(30, 34)]).toBe(255); // elsewhere: unaffected
    // Once the missing column is in, they hide.
    const done = hideFarLand(mask(disc(30, 30, 5)), 30, 30, new Uint8Array(COLS_X * COLS_Z));
    expect(done[at(34, 30)]).toBe(255);
  });

  it('at the edge of what is loaded, the outermost drawn columns keep theirs too (a cliff there was seen through from the side)', () => {
    const out = hideFarLand(mask(disc(30, 30, 5)), 30, 30, new Uint8Array(COLS_X * COLS_Z));
    expect(out[at(35, 30)]).toBe(0); // on the edge: (36, 30) is not drawn
    expect(out[at(30, 25)]).toBe(0);
    expect(out[at(34, 30)]).toBe(255); // one in from the edge: hidden, as everything nearer is
    expect(out[at(30, 30)]).toBe(255);
    // The world's own edge is not a missing column.
    const edge = hideFarLand(mask(disc(1, 1, 3)), 1, 1, new Uint8Array(COLS_X * COLS_Z));
    expect(edge[at(0, 0)]).toBe(255);
  });
});
