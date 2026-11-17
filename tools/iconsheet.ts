// Draws every item icon, enlarged, on a mid-grey ground: out/icons.png (for checking them by eye).
// Run: node --experimental-strip-types tools/iconsheet.ts
import { writeFileSync, mkdirSync } from 'node:fs';
import { encodePng } from './png.ts';
import { drawItemIcon, hasIcon } from '../src/render/itemIcons.ts';
import data from '../data/items.json' with { type: 'json' };

const names = [...new Set(data.items.map((i) => i.icon))];
const S = 5, PAD = 4, COLS = 10, T = 16;
const cell = T * S + PAD, rows = Math.ceil(names.length / COLS);
const W = COLS * cell + PAD, H = rows * cell + PAD;
const px = new Uint8Array(W * H * 3).fill(110);
names.forEach((name, n) => {
  if (!hasIcon(name)) console.warn('missing icon:', name);
  const t = drawItemIcon(name);
  const ox = PAD + (n % COLS) * cell, oy = PAD + Math.floor(n / COLS) * cell;
  for (let y = 0; y < T * S; y++)
    for (let x = 0; x < T * S; x++) {
      const si = ((y / S | 0) * T + (x / S | 0)) * 4;
      const a = t[si + 3] / 255, di = ((oy + y) * W + ox + x) * 3;
      for (let k = 0; k < 3; k++) px[di + k] = Math.round(t[si + k] * a + px[di + k] * (1 - a));
    }
});
mkdirSync('out', { recursive: true });
writeFileSync('out/icons.png', encodePng(W, H, px));
console.log(`out/icons.png: ${names.length} icons`);
