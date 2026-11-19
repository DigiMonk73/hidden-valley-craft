// The map on the builder's table: the land from the layout, shown only where the player has been
// (one cell per 32 m column), with the cave and the player marked.

import { surfaceHeight, zoneAt, distToValley, POOL, CANYON_POOL, inCanyonStream, VALLEY, HOME, creekDistance, ROAD, RAMP, ZONE1, ZONE1FAR, roadZ, TUNNEL, ZONE2, highwayX } from '../gen/layout.ts';
import { SCOUT_AT } from '../gen/zone1.ts';
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

/** What the map shows beyond the land: the road home once known, and the places found. */
export interface MapMarks { route?: boolean; shelter?: boolean; scout?: boolean; farm?: boolean; outpost?: boolean; mine?: boolean; camp?: boolean; bridge?: boolean; highway?: boolean; ruins?: boolean; cave?: boolean; compound?: boolean }

export function drawMap(explored: Uint8Array, playerX: number, playerZ: number, marks: MapMarks = {}): HTMLCanvasElement {
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
  // The road home (M1's "safe extraction route"): cave → tunnel → ramp → the road west, in red ink.
  if (marks.route) {
    ctx.strokeStyle = '#a3241c';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 2]);
    ctx.beginPath();
    ctx.moveTo(HOME.wallX * s, VALLEY.cz * s);
    ctx.lineTo(POOL.cx * s, POOL.cz * s);
    ctx.lineTo(TUNNEL.x0 * s, TUNNEL.z * s);
    for (const [x, z] of RAMP) ctx.lineTo(x * s, z * s);
    for (let x = ROAD.east; x >= ROAD.west; x -= 8) ctx.lineTo(x * s, roadZ(x) * s);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  const mark = (x: number, z: number, colour: string) => { ctx.fillStyle = colour; ctx.fillRect(x * s - 1.5, z * s - 1.5, 3, 3); };
  if (marks.shelter) mark((ZONE1.shelter.x0 + ZONE1.shelter.x1) / 2, ZONE1.shelter.z0, '#2c5a8c');
  if (marks.scout) mark(SCOUT_AT[0], SCOUT_AT[2], '#1b130a');
  if (marks.farm) mark((ZONE1.farm.x0 + ZONE1.farm.x1) / 2, (ZONE1.farm.z0 + ZONE1.farm.z1) / 2, '#8a5a32');
  // Zone-1's mid and deep places, once found (docs/PHASE5.md).
  const F = ZONE1FAR;
  if (marks.outpost) mark((F.outpost.x0 + F.outpost.x1) / 2, (F.outpost.z0 + F.outpost.z1) / 2, '#a3241c');
  if (marks.mine) mark(F.mine.x, F.mine.z, '#3a3a3a');
  if (marks.camp) { mark((F.camp.x0 + F.camp.x1) / 2, (F.camp.z0 + F.camp.z1) / 2, '#3e5a2e'); ctx.fillStyle = '#3e5a2e'; ctx.fillRect(F.campHead.x * s - 0.5, F.camp.z1 * s, 1, (F.campHead.z - F.camp.z1) * s); }
  if (marks.bridge) mark(F.bridge.near, F.bridge.z, '#6e6c66');
  // Zone-2's highway and places, once found (docs/PHASE6.md).
  const Z = ZONE2;
  if (marks.highway) { ctx.fillStyle = '#5a5a5a'; for (let z = Z.highway.z1; z <= Z.highway.z0; z += 2) ctx.fillRect(highwayX(z) * s - 0.6, z * s, 1.2, 2 * s); }
  if (marks.ruins) { mark((Z.mall.x0 + Z.mall.x1) / 2, (Z.mall.z0 + Z.mall.z1) / 2, '#3b6ea5'); mark((Z.exchange.x0 + Z.exchange.x1) / 2, (Z.exchange.z0 + Z.exchange.z1) / 2, '#3b6ea5'); }
  if (marks.cave) mark(Z.cave.mouthX, Z.cave.z, '#c8b22a');
  if (marks.compound) mark((Z.compound.x0 + Z.compound.x1) / 2, (Z.compound.z0 + Z.compound.z1) / 2, '#a3241c');
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

/** The scout's map scrap: a ridgeline's contours, a bend in a road, an arrow, and a place-name in pencil. */
export function drawMapScrap(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 320; c.height = 200;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#e6dab8';
  ctx.beginPath();
  ctx.moveTo(6, 14); ctx.lineTo(300, 4); ctx.lineTo(314, 120); ctx.lineTo(296, 196); ctx.lineTo(18, 188); ctx.lineTo(4, 96);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#8a7a52';
  ctx.lineWidth = 1;
  for (let k = 0; k < 4; k++) { // the ridge's contours
    ctx.beginPath();
    for (let x = 30; x <= 290; x += 10) ctx.lineTo(x, 40 + k * 11 + 14 * Math.sin(x / 38 + k * 0.3));
    ctx.stroke();
  }
  ctx.strokeStyle = '#4a3a24';
  ctx.lineWidth = 3;
  ctx.beginPath(); // the road, and its bend
  ctx.moveTo(40, 180); ctx.bezierCurveTo(110, 150, 120, 110, 200, 120); ctx.lineTo(280, 100);
  ctx.stroke();
  ctx.strokeStyle = '#a3241c';
  ctx.lineWidth = 2.5;
  ctx.beginPath(); // the arrow
  ctx.moveTo(150, 170); ctx.lineTo(240, 130); ctx.moveTo(240, 130); ctx.lineTo(224, 130); ctx.moveTo(240, 130); ctx.lineTo(232, 144);
  ctx.stroke();
  ctx.fillStyle = '#3a3a3a';
  ctx.font = 'italic 18px Georgia, serif';
  ctx.fillText('Las Cruces', 214, 92);
  return c;
}
