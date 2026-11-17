// Draws every block texture side by side, enlarged, on a mid-grey ground: out/textures.png.
// Run: node --experimental-strip-types tools/texsheet.ts
import { writeFileSync, mkdirSync } from 'node:fs';
import { encodePng } from './png.ts';
import { drawTexture, hasTexture, TEX } from '../src/render/textures.ts';
import { TEXTURE_NAMES } from '../src/world/blocks.ts';

const S = 6, PAD = 4, COLS = 8;
const cell = TEX * S + PAD;
const rows = Math.ceil(TEXTURE_NAMES.length / COLS);
const W = COLS * cell + PAD, H = rows * cell + PAD;
const px = new Uint8Array(W * H * 3).fill(110);
TEXTURE_NAMES.forEach((name, n) => {
  if (!hasTexture(name)) console.warn('missing texture:', name);
  const t = drawTexture(name);
  const ox = PAD + (n % COLS) * cell, oy = PAD + Math.floor(n / COLS) * cell;
  for (let y = 0; y < TEX * S; y++)
    for (let x = 0; x < TEX * S; x++) {
      const si = ((y / S | 0) * TEX + (x / S | 0)) * 4;
      const a = t[si + 3] / 255;
      const di = ((oy + y) * W + ox + x) * 3;
      for (let k = 0; k < 3; k++) px[di + k] = Math.round(t[si + k] * a + px[di + k] * (1 - a));
    }
});
mkdirSync('out', { recursive: true });
writeFileSync('out/textures.png', encodePng(W, H, px));
console.log('wrote out/textures.png:', TEXTURE_NAMES.join(', '));
