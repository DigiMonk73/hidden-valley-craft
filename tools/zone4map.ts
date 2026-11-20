// Draws Zone-4's layout from above (docs/phase8-map.png): the land as shading, the fallout as dead ground, the
// reservoir and the dam, the ridge road from the avenue's bend to the tower, and each place on it, with labels.
// It reads only the layout.
// Run: node --experimental-strip-types --no-warnings tools/zone4map.ts
// The labels are drawn by headless Chromium (pre-installed), over the picture this computes.

import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { encodePng } from './png.ts';
import {
  surfaceHeight, zoneAt, ZONE3, ZONE4, PLACES, onDamCrest, onAvenue, onRidgeRoad, inReservoir, falloutAt, falloutDepth,
  ridgeRoadLength, ridgeRoadMark, ridgeRoadPoint, type ZoneId,
} from '../src/gen/layout.ts';

const X0 = 320, X1 = 690, Z0 = 340, Z1 = 790, S = 2;
const W = (X1 - X0) * S, H = (Z1 - Z0) * S;
const px = new Uint8Array(W * H * 3);
const TINT: Partial<Record<ZoneId, [number, number, number]>> = { zone2: [175, 160, 130], zone3: [130, 150, 120], zone4: [168, 160, 140] };
const Z = ZONE4, D = ZONE3.dam, T = PLACES.ridgeTower;

const cell = (x: number, z: number): [number, number, number] => {
  const h = surfaceHeight(x, z), hx = surfaceHeight(x + 1, z), hz = surfaceHeight(x, z + 1);
  const shade = Math.max(0.45, Math.min(1.25, 0.72 + (h - 82) / 120 + (h - hx) * 0.07 + (h - hz) * 0.07));
  const t = TINT[zoneAt(x, z)] ?? [150, 170, 110];
  let c: [number, number, number] = [t[0] * shade, t[1] * shade, t[2] * shade];
  // The fallout: the hotter the ground, the redder. The pass's clean pocket stays green.
  const rate = falloutAt(x + 0.5, z + 0.5);
  if (rate > Z.rates.off) { const k = Math.min(1, (rate - Z.rates.off) / (Z.sump.rate - Z.rates.off)); c = [c[0] + 70 * k, c[1] - 60 * k, c[2] - 70 * k]; }
  if (falloutDepth(x, z) > 0 && rate === 0) c = [90 * shade, 170 * shade, 90 * shade];
  if (Math.abs(falloutDepth(x, z)) < 1) c = [230, 200, 40];
  if (Math.hypot(x - Z.sump.x, z - Z.sump.z) < Z.sump.pond) c = [40, 60, 50];
  if (inReservoir(x, z)) c = [50, 110, 170];
  if (onAvenue(x, z)) c = [92, 92, 96];
  if (onRidgeRoad(x, z)) c = [70, 70, 76];
  if (x >= D.x0 && x < D.x1 && Math.abs(z + 0.5 - D.z) < 4) c = onDamCrest(x, z) ? [150, 150, 152] : [200, 200, 200];
  return c;
};
for (let j = 0; j < H; j++)
  for (let i = 0; i < W; i++) {
    const c = cell(X0 + Math.floor(i / S), Z0 + Math.floor(j / S));
    const k = (j * W + i) * 3;
    px[k] = Math.max(0, Math.min(255, c[0])); px[k + 1] = Math.max(0, Math.min(255, c[1])); px[k + 2] = Math.max(0, Math.min(255, c[2]));
  }
const base = encodePng(W, H, px).toString('base64');

const L = ridgeRoadLength(), dam = D.x0 - ZONE3.avenue.x; // the dam's west end to the bend
const along = (k: number) => Math.round(dam + ridgeRoadMark(k));
let edgeS = 0;
for (let s = 0; s <= L; s++) { const [x, z] = ridgeRoadPoint(s); if (falloutDepth(x, z) > 0) { edgeS = s; break; } }

type Box = { x0: number; x1: number; z0: number; z1: number; fill: string; label?: string; side?: 'l' | 'r' };
const R = Z.relay, O = Z.observatory;
const boxes: Box[] = [
  { ...ZONE3.control, fill: 'rgba(60,60,90,0.8)', label: 'The dam’s control house (Phase 7)', side: 'r' },
  { ...Z.hut, fill: 'rgba(120,80,40,0.95)', label: `3. The refuge hut on the pass (${along(Z.road.pass)} m): clean ground, a stove, supplies. Ray is met here, once, by day`, side: 'r' },
  { x0: O.x - O.r, x1: O.x + O.r + 1, z0: O.z - O.r, z1: O.z + O.r + 1, fill: 'rgba(235,235,240,0.95)', label: `5. The observatory (${along(Z.road.dome)} m): a small dome, lit inside. The telescope’s optics`, side: 'r' },
  { x0: R.split, x1: R.x1, z0: R.z0, z1: R.z1, fill: 'rgba(60,110,150,0.95)', label: `6. The relay station (${Math.round(dam + L)} m), lit half: the equipment racks (rare components), the spares crate`, side: 'l' },
  { x0: R.x0, x1: R.split, z0: R.z0, z1: R.z1, fill: 'rgba(40,40,50,0.95)', label: 'Its battery hall, walled off and dark: two Ashen. Nothing needed is in there', side: 'l' },
  { x0: T.x - 5, x1: T.x + 6, z0: T.z - 5, z1: T.z + 6, fill: 'rgba(200,60,60,0.9)', label: `7. The tower (${T.height} m, a red beacon): the fallen dish at its foot gives the antenna sections`, side: 'l' },
];
const [gx, gz] = Z.road.pts[Z.road.gate];
const pins: { x: number; z: number; label: string; color: string; side: 'l' | 'r' }[] = [
  { x: Z.sign.x, z: Z.sign.z, label: '1. The sign at the avenue’s bend, lit: “TORRE · OBSERVATORIO →”. The road’s lamps are the dam’s own line to the tower', color: '#fff', side: 'l' },
  { x: gx, z: gz, label: `2. The gate (${along(Z.road.gate)} m): a boom, a booth, the board “ZONA CALIENTE · SOLO CON TRAJE”. The fallout begins ${Math.round(edgeS - ridgeRoadMark(Z.road.gate))} m past it (the yellow line: warning signs all along it)`, color: '#fd3', side: 'r' },
  { x: Z.ray.x, z: Z.ray.z, label: '', color: '#6cf', side: 'r' },
  { x: Z.sump.x, z: Z.sump.z, label: '4. The sump: a black pond in a hollow, ringed with signs. The hottest ground. The straight line from the pass to the tower crosses it; the road goes round', color: '#f33', side: 'l' },
  { x: Z.nest.x, z: Z.nest.z, label: '', color: '#b9b', side: 'l' },
  ...Z.pass.knolls.map(([x, z]) => ({ x, z, label: '', color: '#987', side: 'l' as const })),
];
const sx = (x: number) => (x - X0) * S, sz = (z: number) => (z - Z0) * S;
const labels = [...boxes.filter((b) => b.label).map((b) => ({ fx: 260 + sx(b.side === 'r' ? b.x1 : b.x0), y: sz((b.z0 + b.z1) / 2), label: b.label!, side: b.side! })),
  ...pins.filter((p) => p.label).map((p) => ({ fx: 260 + sx(p.x), y: sz(p.z), label: p.label, side: p.side }))];
const placed: { fx: number; y: number; ty: number; label: string; side: 'l' | 'r' }[] = [];
for (const side of ['l', 'r'] as const) {
  let last = side === 'l' ? 250 : -1e9;
  const col = labels.filter((t) => t.side === side).sort((a, b) => a.y - b.y).map((t) => { const ty = Math.max(t.y, last + 86); last = ty; return { ...t, ty }; });
  let floor = H - 70;
  for (let i = col.length - 1; i >= 0; i--) { col[i].ty = Math.min(col[i].ty, floor); floor = col[i].ty - 86; }
  placed.push(...col);
}
const suited = (rate: number) => (rate * Z.suit).toFixed(1);
const html = `<!doctype html><html><body style="margin:0;background:#1d1d1d">
<div style="position:relative;width:${W + 520}px;height:${H}px;font:13px/1.25 -apple-system,Helvetica,Arial,sans-serif;color:#fff">
<img src="data:image/png;base64,${base}" style="position:absolute;left:260px;top:0;image-rendering:pixelated">
<svg width="${W + 520}" height="${H}" style="position:absolute;left:0;top:0">
<circle cx="${260 + sx(Z.sump.x)}" cy="${sz(Z.sump.z)}" r="${Z.sump.r * S}" fill="none" stroke="#f33" stroke-width="2" stroke-dasharray="6 4"/>
<circle cx="${260 + sx(Z.clean.x)}" cy="${sz(Z.clean.z)}" r="${Z.clean.r * S}" fill="none" stroke="#6f6" stroke-width="2"/>
${boxes.map((b) => `<rect x="${260 + sx(b.x0)}" y="${sz(b.z0)}" width="${(b.x1 - b.x0) * S}" height="${(b.z1 - b.z0) * S}" ${b.fill.startsWith('rgba(235') ? 'rx="10"' : ''} fill="${b.fill}" stroke="#fff" stroke-width="1"/>`).join('')}
${pins.map((p) => `<circle cx="${260 + sx(p.x)}" cy="${sz(p.z)}" r="${p.label ? 5 : 4}" fill="${p.color}" stroke="#000"/>`).join('')}
${placed.map((t) => `<polyline points="${t.fx},${t.y} ${t.side === 'r' ? 260 + W + 2 : 258},${t.y} ${t.side === 'r' ? 260 + W + 8 : 252},${t.ty}" fill="none" stroke="#ddd"/>`).join('')}
</svg>
${placed.map((t) => t.side === 'r' ? `<div style="position:absolute;left:${260 + W + 10}px;top:${t.ty - 8}px;width:250px">${t.label}</div>` : `<div style="position:absolute;left:4px;top:${t.ty - 8}px;width:244px;text-align:right">${t.label}</div>`).join('')}
<div style="position:absolute;left:4px;top:8px;width:250px;font-size:15px"><b>Zone-4 (Phase 8)</b><br>North is up. 1 square = 1 m ×2.<br>Dark grey: the ridge road, lit all the way. Pale ground inside the yellow line: the fallout, dead forest. Green ring: clean ground. Red ring: the sump.<br><br>From the dam’s west end:<br>the gate ${along(Z.road.gate)} m<br>the hut on the pass ${along(Z.road.pass)} m<br>the observatory ${along(Z.road.dome)} m<br>the tower’s yard ${Math.round(dam + L)} m</div>
<div style="position:absolute;left:${260 + sx(336)}px;top:${sz(700)}px;font-size:13px;background:rgba(0,0,0,0.55);padding:6px 8px;border-radius:4px"><b>Dose a second, in the suit (without it ×${Math.round(1 / Z.suit)})</b><br>on the road ${suited(Z.rates.road)} · off it ${suited(Z.rates.off)} · the sump’s heart ${suited(Z.sump.rate)}<br>indoors ${suited(Z.rates.indoors)} · the pass 0<br>100 is the limit: past it, the dose comes off your health</div>
<div style="position:absolute;left:${260 + sx(340)}px;top:${sz(352)}px;color:#fe8;font-weight:bold;font-size:15px">Zone-4, danger 7: the ground itself</div>
<div style="position:absolute;left:${260 + sx(470)}px;top:${sz(735)}px;color:#dde;font-weight:bold">Zone-3 (Phase 7)</div>
<div style="position:absolute;left:${260 + sx(626)}px;top:${sz(560)}px;color:#cef;transform:rotate(90deg);transform-origin:left top;white-space:nowrap">the reservoir: the guide rail north from the dam</div>
<div style="position:absolute;left:${260 + sx(612)}px;top:${sz(758)}px;color:#fff;white-space:nowrap">the dam</div>
<div style="position:absolute;left:${260 + sx(560)}px;top:${sz(770)}px;color:#ccc;white-space:nowrap">↓ the avenue (Phase 7)</div>
</div></body></html>`;

mkdirSync('out', { recursive: true });
writeFileSync('out/zone4map.html', html);
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W + 520, height: H } });
await page.setContent(html);
mkdirSync('docs', { recursive: true });
await page.screenshot({ path: 'docs/phase8-map.png' });
await browser.close();
console.log(`wrote docs/phase8-map.png (${W + 520}×${H})`);
