// Draws the designed world as a top-down map image (out/map.png): land height as shading, the
// danger zones as tints, water in blue and the named places marked. Run: npm run map
// It reads only the layout, so it shows the plan of the world, not the player's changes.

import { writeFileSync, mkdirSync } from 'node:fs';
import { encodePng } from './png.ts';
import {
  surfaceHeight, zoneAt, distToValley, creekDistance, pathAt, VALLEY, POOL, CANYON_POOL, inCanyonStream, HOME, ZONES, type ZoneId,
} from '../src/gen/layout.ts';
import { WORLD_X, WORLD_Z } from '../src/world/constants.ts';

const STEP = 2;
const W = WORLD_X / STEP, H = WORLD_Z / STEP;
const px = new Uint8Array(W * H * 3);

const TINT: Record<ZoneId, [number, number, number]> = {
  valley: [120, 200, 120], canyon: [170, 190, 150], buffer: [90, 160, 90], near: [190, 180, 90], mid: [200, 140, 70],
  deep: [150, 80, 80], zone2: [170, 110, 150], zone3: [120, 110, 170], zone4: [220, 220, 120],
};

function put(x: number, y: number, c: [number, number, number]): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
}

for (let j = 0; j < H; j++)
  for (let i = 0; i < W; i++) {
    const x = i * STEP, z = j * STEP;
    const h = surfaceHeight(x, z);
    const hx = surfaceHeight(x + STEP, z);
    const shade = Math.max(0.35, Math.min(1.25, 0.55 + (h - 40) / 200 + (h - hx) * 0.04));
    const t = TINT[zoneAt(x, z)];
    let c: [number, number, number] = [t[0] * shade, t[1] * shade, t[2] * shade];
    const inValley = distToValley(x, z) < VALLEY.radius;
    const water = (inValley && (Math.hypot(x - POOL.cx, z - POOL.cz) < POOL.radius || creekDistance(x, z) < 2)) ||
      Math.hypot(x - CANYON_POOL.cx, z - CANYON_POOL.cz) < CANYON_POOL.radius || inCanyonStream(x, z, 0.5);
    if (water) c = [60, 120, 220];
    if (pathAt(x, z).dist < 2) c = [230, 220, 200];
    put(i, j, c.map((v) => Math.max(0, Math.min(255, Math.round(v)))) as [number, number, number]);
  }

// Markers: the cave (white), zone boundaries (dashed lines).
const mark = (x: number, z: number, r: number, c: [number, number, number]) => {
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) put(Math.round(x / STEP) + dx, Math.round(z / STEP) + dz, c);
};
mark(HOME.wallX + 10, VALLEY.cz, 3, [255, 255, 255]);
for (const lx of [ZONES.saddleX, ZONES.nearX, ZONES.midX, ZONES.ravineX])
  for (let j = 0; j < H; j += 6) put(Math.round(lx / STEP), j, [20, 20, 20]);

const png = encodePng(W, H, px);
mkdirSync('out', { recursive: true });
writeFileSync('out/map.png', png);
console.log(`wrote out/map.png (${W}×${H}, ${STEP} m per pixel)`);
