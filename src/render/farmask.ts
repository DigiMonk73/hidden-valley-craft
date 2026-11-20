// Where the distant land hides so the real blocks show (docs/PHASE9A.md, 4). Pure, so it is tested without a graphics card.

import { COLS_X, COLS_Z } from '../world/constants.ts';

/**
 * Which columns' distant land is hidden, as bytes for the mask texture (255: hidden, only the real blocks show).
 *
 * The distant land is coarse: 8 m cells, a little lower than the real ground and set back from a real cliff's face.
 * So a view line can pass through a column that is still distant land, under where its real rock would be, and
 * on into a drawn column from inside the rock, where that column's faces look away: sky showed through ("holes of
 * sky while loading", and in a steady view wherever the edge of the loaded land crossed a cliff).
 *
 * A drawn column therefore hides its distant land only when it cannot be seen through one that is not drawn: every
 * column next to it is drawn, and every column within two of it that is nearer the eye. Where both are drawn, the
 * real blocks are stencilled first and the distant land shows only where they left nothing (src/render/farland.ts),
 * so it fills holes and never covers the real land. (tests/farland.test.ts)
 */
export function hideFarLand(drawn: Uint8Array, ecx: number, ecz: number, out: Uint8Array): Uint8Array {
  for (let cz = 0; cz < COLS_Z; cz++)
    for (let cx = 0; cx < COLS_X; cx++) {
      const i = cz * COLS_X + cx;
      if (!drawn[i]) { out[i] = 0; continue; }
      const d = (cx - ecx) * (cx - ecx) + (cz - ecz) * (cz - ecz);
      let hide = 255;
      for (let dz = -2; dz <= 2 && hide; dz++)
        for (let dx = -2; dx <= 2; dx++) {
          const nx = cx + dx, nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= COLS_X || nz >= COLS_Z) continue;
          if (drawn[nz * COLS_X + nx]) continue;
          const next = Math.abs(dx) <= 1 && Math.abs(dz) <= 1;
          if (next || (nx - ecx) * (nx - ecx) + (nz - ecz) * (nz - ecz) < d) { hide = 0; break; }
        }
      out[i] = hide;
    }
  return out;
}
