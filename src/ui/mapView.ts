// The map on the builder's table: the land from the layout, shown only where the player has been
// (one cell per 32 m column), with the cave and the player marked.

import { surfaceHeight, zoneAt, distToValley, POOL, CANYON_POOL, inCanyonStream, VALLEY, HOME, creekDistance } from '../gen/layout.ts';
import { WORLD_X, WORLD_Z, COLS_X } from '../world/constants.ts';

const N = 256; // 8 m per pixel
let shaded: Uint8ClampedArray | null = null;

/** The whole land, shaded, worked out once (a few hundred milliseconds) and kept. */
function landColours(): Uint8ClampedArray {
  if (shaded) return shaded;
  const px = new Uint8ClampedArray(N * N * 4);
  const step = WORLD_X / N;
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const x = i * step + step / 2, z = j * step + step / 2;
      const h = surfaceHeight(x, z), hx = surfaceHeight(x + step, z);
      const zone = zoneAt(x, z);
      let c = zone === 'valley' ? [126, 160, 92] : zone === 'zone4' ? [168, 156, 128] : zone === 'zone3' ? [120, 138, 104] : [104, 138, 88];
      if (Math.abs(h - hx) > 6 || h > 160) c = [176, 166, 140];
      const wet = (distToValley(x, z) < VALLEY.radius && (Math.hypot(x - POOL.cx, z - POOL.cz) < POOL.radius || creekDistance(x, z) < 3)) ||
        Math.hypot(x - CANYON_POOL.cx, z - CANYON_POOL.cz) < CANYON_POOL.radius || inCanyonStream(x, z, step / 2);
      if (wet) c = [86, 132, 164];
      const shade = Math.max(0.6, Math.min(1.25, 0.8 + (h - 90) / 260 + (h - hx) * 0.03));
      px.set([c[0] * shade, c[1] * shade, c[2] * shade, 255], (j * N + i) * 4);
    }
  shaded = px;
  return px;
}

export function drawMap(explored: Uint8Array, playerX: number, playerZ: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = N;
  const ctx = canvas.getContext('2d')!;
  const land = landColours();
  const img = ctx.createImageData(N, N);
  const per = N / COLS_X; // pixels per column
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const k = (j * N + i) * 4;
      const seen = explored[Math.floor(j / per) * COLS_X + Math.floor(i / per)];
      if (seen) img.data.set(land.subarray(k, k + 4), k);
      else img.data.set([226, 214, 182, 255], k); // blank parchment
    }
  ctx.putImageData(img, 0, 0);
  const s = N / WORLD_X;
  // The cave, and where the player stands.
  ctx.fillStyle = '#7a1f12';
  ctx.fillRect(HOME.wallX * s - 2, VALLEY.cz * s - 2, 4, 4);
  ctx.strokeStyle = '#1b130a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(playerX * s, playerZ * s, 3, 0, Math.PI * 2);
  ctx.stroke();
  void WORLD_Z;
  return canvas;
}
