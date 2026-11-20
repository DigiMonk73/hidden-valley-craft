// The map on the builder's table: the land from the layout, shown only where the player has been
// (one cell per 32 m column), with the cave and the player marked.

import { surfaceHeight, zoneAt, distToValley, POOL, CANYON_POOL, inCanyonStream, VALLEY, HOME, creekDistance, ROAD, RAMP, ZONE1, ZONE1FAR, roadZ, TUNNEL, ZONE2, highwayX, ZONE3, inReservoir, ZONE4, PLACES, falloutAt, ridgeRoadLength, ridgeRoadPoint } from '../gen/layout.ts';
import { NESTS } from '../entity/ashen.ts';
import { MIRA } from '../sim/uplink.ts';
import { cpuCanvas } from '../platform/canvas.ts';
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
        Math.hypot(x - CANYON_POOL.cx, z - CANYON_POOL.cz) < CANYON_POOL.radius || inCanyonStream(x, z, step / 2) || inReservoir(x, z);
      if (wet) c = [86, 132, 164];
      const shade = Math.max(0.6, Math.min(1.25, 0.8 + (h - 90) / 260 + (h - hx) * 0.03));
      px.set([c[0] * shade, c[1] * shade, c[2] * shade, 255], (j * N + i) * 4);
    }
  shaded = px;
  return px;
}

/** What the map shows beyond the land: the road home once known, and the places found. */
export interface MapMarks { route?: boolean; shelter?: boolean; scout?: boolean; farm?: boolean; outpost?: boolean; mine?: boolean; camp?: boolean; bridge?: boolean; highway?: boolean; ruins?: boolean; cave?: boolean; compound?: boolean; dam?: boolean; works?: boolean ; ridge?: boolean; fallout?: boolean; nests?: boolean; mira?: boolean }

export function drawMap(explored: Uint8Array, playerX: number, playerZ: number, marks: MapMarks = {}): HTMLCanvasElement {
  const { canvas, ctx } = cpuCanvas(N, N);
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
  // Zone-3's dam road and dam, and beyond it the avenue and the works, once found (docs/PHASE7.md).
  const Z3 = ZONE3, D = Z3.dam;
  if (marks.dam) { ctx.fillStyle = '#5a5a5a'; ctx.fillRect(D.x1 * s, D.z * s - 0.5, (highwayX(D.z) - D.x1) * s, 1); ctx.fillStyle = '#d8d8d4'; ctx.fillRect(D.x0 * s, D.z * s - 1, (D.x1 - D.x0) * s, 2); }
  if (marks.works) {
    ctx.fillStyle = '#5a5a5a';
    ctx.fillRect(Z3.avenue.x * s, D.z * s - 0.5, (D.x0 - Z3.avenue.x) * s, 1);
    ctx.fillRect(Z3.avenue.x * s - 0.5, D.z * s, 1, (Z3.avenue.z1 - D.z) * s);
    for (const b of [Z3.powerhouse, Z3.shop, Z3.foundry]) mark((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, '#2d5f8a');
    mark((Z3.yard.x0 + Z3.yard.x1) / 2, Z3.yard.z0 + 30, '#6e3a22');
  }
  // Zone-4 (docs/PHASE8.md). The ridge road, once its gate has been reached: the avenue's bend to the tower.
  const ridgeRoad = () => { ctx.beginPath(); for (let d = 0; d <= ridgeRoadLength(); d += 6) { const [x, z] = ridgeRoadPoint(d); ctx.lineTo(x * s, z * s); } ctx.stroke(); };
  // What the uplink's RAD answer adds: the poisoned ground, hatched in yellow, the sump in red, the road through it.
  if (marks.fallout) {
    const C = ZONE4.centre, R = ZONE4.reach;
    const px = WORLD_X / N; // metres a pixel
    for (let j = Math.max(0, Math.floor((C.z - R) / px)); j <= (C.z + R) / px; j++) for (let i = Math.max(0, Math.floor((C.x - R) / px)); i <= (C.x + R) / px; i++) {
      const x = (i + 0.5) * px, z = (j + 0.5) * px, f = falloutAt(x, z);
      if (f <= 0 || (i + j) & 1) continue;
      ctx.fillStyle = f > ZONE4.rates.off ? 'rgba(190,40,20,.85)' : f >= ZONE4.rates.off * 0.9 ? 'rgba(214,170,20,.7)' : 'rgba(214,190,60,.4)';
      ctx.fillRect(i, j, 1, 1);
    }
    ctx.strokeStyle = '#a3241c'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(ZONE4.sump.x * s, ZONE4.sump.z * s, ZONE4.sump.r * s, 0, Math.PI * 2); ctx.stroke();
  }
  if (marks.ridge || marks.fallout) {
    ctx.strokeStyle = marks.fallout ? '#1b130a' : '#5a5a5a'; ctx.lineWidth = 1;
    ridgeRoad();
    mark(ZONE4.gate.x, ZONE4.gate.z, '#d6a614');
    if (marks.fallout) { mark(ZONE4.clean.x, ZONE4.clean.z, '#2e8a4a'); mark(PLACES.ridgeTower.x, PLACES.ridgeTower.z, '#1b130a'); }
  }
  // BIO: every nest, ringed.
  if (marks.nests) {
    ctx.strokeStyle = '#6a1a6a'; ctx.lineWidth = 1;
    for (const n of NESTS) { ctx.beginPath(); ctx.arc(n.x * s, n.z * s, 2.5, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = '#6a1a6a'; ctx.fillRect(n.x * s - 0.5, n.z * s - 0.5, 1, 1); }
  }
  // END: the beacon far to the north, as a bearing on the map's edge.
  if (marks.mira) {
    const a = (MIRA.brg * Math.PI) / 180, x0 = HOME.wallX * s, z0 = VALLEY.cz * s;
    // From the cave along the bearing to the top edge.
    const t = z0 / Math.cos(a), ex = Math.max(8, Math.min(N - 8, x0 + Math.sin(a) * t));
    ctx.strokeStyle = '#2c5a8c'; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(x0, z0); ctx.lineTo(ex, 4); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#2c5a8c';
    ctx.beginPath(); ctx.moveTo(ex, 1); ctx.lineTo(ex - 4, 9); ctx.lineTo(ex + 4, 9); ctx.closePath(); ctx.fill();
    ctx.font = '9px Georgia, serif';
    ctx.fillText(`${MIRA.id} · ${String(MIRA.brg).padStart(3, '0')}° · ${Math.round(MIRA.km)} km`, Math.min(N - 110, ex + 7), 10);
  }
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
  const { canvas: c, ctx } = cpuCanvas(320, 200);
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
