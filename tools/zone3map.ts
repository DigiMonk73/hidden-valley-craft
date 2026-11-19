// Draws Zone-3's layout from above for the owner (docs/phase7-map.png): the land as shading, the river's
// gorge with the reservoir and the dam, the dam road from Zone-2's highway, the avenue down the west bank
// and each place on it as a box, with labels. It reads only the layout.
// Run: node --experimental-strip-types --no-warnings tools/zone3map.ts
// The labels are drawn by headless Chromium (pre-installed), over the picture this computes.

import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { encodePng } from './png.ts';
import {
  surfaceHeight, zoneAt, onRoad, onHighway, ZONE2, ZONE3, ZONE1FAR, highwayX, onDamRoad, onDamCrest, onAvenue, onFarRoad, onMineTrail,
  inReservoir, riverBelowDam, ravineX, ZONES, type ZoneId,
} from '../src/gen/layout.ts';

const X0 = 470, X1 = 830, Z0 = 690, Z1 = 1050, S = 2;
const W = (X1 - X0) * S, H = (Z1 - Z0) * S;
const px = new Uint8Array(W * H * 3);
const TINT: Partial<Record<ZoneId, [number, number, number]>> = { mid: [150, 170, 110], deep: [120, 140, 100], zone2: [175, 160, 130], zone3: [140, 142, 160] };
const Z = ZONE3, F = ZONE1FAR, D = Z.dam;

const cell = (x: number, z: number): [number, number, number] => {
  const h = surfaceHeight(x, z), hx = surfaceHeight(x + 1, z), hz = surfaceHeight(x, z + 1);
  const shade = Math.max(0.4, Math.min(1.25, 0.8 + (h - 82) / 50 + (h - hx) * 0.06 + (h - hz) * 0.06));
  const t = TINT[zoneAt(x, z)] ?? [150, 170, 110];
  let c: [number, number, number] = [t[0] * shade, t[1] * shade, t[2] * shade];
  if (inReservoir(x, z)) c = [50, 110, 170];
  const r = riverBelowDam(x, z);
  if (r === 'pool' || r === 'stream') c = [70, 140, 200];
  if (r === 'bed') c = [130, 125, 110];
  if (onRoad(x, z) || onHighway(x, z) || onDamRoad(x, z) || onAvenue(x, z) || onFarRoad(x, z)) c = [92, 92, 96];
  if (onHighway(x, z) && Math.abs(x + 0.5 - highwayX(z)) < 0.5 && z % 6 < 3) c = [220, 190, 60];
  if (x >= D.x0 && x < D.x1 && Math.abs(z + 0.5 - D.z) < 4) c = onDamCrest(x, z) ? [150, 150, 152] : [200, 200, 200];
  if (onMineTrail(x, z)) c = [150, 120, 80];
  // The rails.
  const y = Z.yard;
  for (const tx of y.tracks) if (z >= y.z0 + 2 && z < 1034 && (x === tx - 1 || x === tx + 1)) c = [60, 50, 45];
  return c;
};
for (let j = 0; j < H; j++)
  for (let i = 0; i < W; i++) {
    const c = cell(X0 + Math.floor(i / S), Z0 + Math.floor(j / S));
    const k = (j * W + i) * 3;
    px[k] = Math.min(255, c[0]); px[k + 1] = Math.min(255, c[1]); px[k + 2] = Math.min(255, c[2]);
  }
const base = encodePng(W, H, px).toString('base64');

type Box = { x0: number; x1: number; z0: number; z1: number; fill: string; label?: string; side?: 'l' | 'r' };
const g = Z.mine.gallery;
const boxes: Box[] = [
  { ...Z.control, fill: 'rgba(60,60,90,0.95)', label: '2. Control house: the engineer’s logbook, Ray’s number', side: 'l' },
  { ...Z.powerhouse, fill: 'rgba(40,90,130,0.9)', label: '3. Powerhouse: turbine parts, the sluice tools, control cabinets', side: 'r' },
  { ...Z.shop, fill: 'rgba(150,90,30,0.9)', label: '4. Machine shop: lathes, steel racks', side: 'r' },
  { ...Z.foundry, fill: 'rgba(130,60,40,0.9)', label: '4. Foundry: the crucible (for making steel at home)', side: 'l' },
  { ...Z.signalBox, fill: 'rgba(200,60,60,0.95)', label: '5. Rail yard: signal box (red light), a locomotive, wagons: rails and plate for steel, a wagon of coal', side: 'l' },
  { x0: g.x0, x1: g.x1, z0: g.z0, z1: g.z1, fill: 'rgba(90,70,50,0.6)', label: '6. Mine gallery (18 m down, lit): thick iron and coal. A dark drift off it', side: 'l' },
  { x0: ZONE2.exchange.x0, x1: ZONE2.exchange.x1, z0: ZONE2.exchange.z0, z1: ZONE2.exchange.z1, fill: 'rgba(60,60,80,0.6)', label: 'Telephone exchange (Phase 6)', side: 'r' },
  { x0: ZONE2.mall.x0, x1: ZONE2.mall.x1, z0: ZONE2.mall.z0, z1: ZONE2.mall.z1, fill: 'rgba(40,80,140,0.6)', label: 'Strip mall (Phase 6)', side: 'r' },
];
// Rolling stock in the yard.
const [tb, ta] = Z.yard.tracks;
const stock: Box[] = [
  { x0: ta - 1, x1: ta + 2, z0: 928, z1: 939, fill: 'rgba(40,40,40,0.95)' }, { x0: ta - 1, x1: ta + 2, z0: 942, z1: 950, fill: 'rgba(70,60,50,0.95)' },
  { x0: ta - 1, x1: ta + 2, z0: 953, z1: 961, fill: 'rgba(110,110,120,0.95)' }, { x0: tb - 1, x1: tb + 2, z0: 930, z1: 939, fill: 'rgba(120,50,40,0.95)' },
  { x0: tb - 1, x1: tb + 2, z0: 944, z1: 953, fill: 'rgba(120,50,40,0.95)' },
];
const pins: { x: number; z: number; label: string; color: string; side: 'l' | 'r' }[] = [
  { x: highwayX(D.z) - 5, z: D.z - 4, label: 'Sign on the highway, lit: “PRESA RÍO SECO ←”. 10 m inside Zone-2’s border', color: '#fff', side: 'r' },
  { x: Z.barricade.x, z: D.z, label: 'The faction’s barricade and warning: “NO PASAR · CENIZOS”. They don’t cross', color: '#e33', side: 'r' },
  { x: (D.x0 + D.x1) / 2, z: D.z, label: '1. The dam: the way over, lit. The Ashen never come onto it', color: '#fff', side: 'r' },
  { x: Z.firstAshen.x, z: Z.firstAshen.z, label: 'The first Ashen: standing in the road by day, seen from the bend above', color: '#dde', side: 'l' },
  { x: ravineX(Z.river.sink), z: Z.river.sink, label: 'The river sinks into the limestone here', color: '#7cf', side: 'r' },
  { x: Z.mine.headX, z: Z.mine.z, label: '', color: '#fc4', side: 'l' },
  { x: (ta + tb) / 2, z: 1020, label: 'Level crossing: two red lights, seen from the broken bridge', color: '#f33', side: 'l' },
  { x: F.body.x, z: F.body.z, label: 'The body from Phase 5, now beside the far road', color: '#eee', side: 'r' },
  { x: (F.bridge.far + F.bridge.deckEnd) / 2, z: F.bridge.z, label: 'The broken bridge (Phase 5): build across the gap to come this way', color: '#fff', side: 'r' },
  ...Z.nests.map((n) => ({ x: n.x, z: n.z, label: '', color: '#b9b', side: 'l' as const })),
];
const sx = (x: number) => (x - X0) * S, sz = (z: number) => (z - Z0) * S;
const labels = [...boxes.filter((b) => b.label).map((b) => ({ fx: 260 + sx(b.side === 'r' ? b.x1 : b.x0), y: sz((b.z0 + b.z1) / 2), label: b.label!, side: b.side! })),
  ...pins.filter((p) => p.label).map((p) => ({ fx: 260 + sx(p.x), y: sz(p.z), label: p.label, side: p.side }))];
const placed: { fx: number; y: number; ty: number; label: string; side: 'l' | 'r' }[] = [];
for (const side of ['l', 'r'] as const) {
  // Down the margin with room for three lines each (the left starts under the legend); then, from the bottom, pushed back up into the picture.
  let last = side === 'l' ? 196 : -1e9;
  const col = labels.filter((t) => t.side === side).sort((a, b) => a.y - b.y).map((t) => { const ty = Math.max(t.y, last + 56); last = ty; return { ...t, ty }; });
  let floor = H - 44;
  for (let i = col.length - 1; i >= 0; i--) { col[i].ty = Math.min(col[i].ty, floor); floor = col[i].ty - 56; }
  placed.push(...col);
}
const jx = Math.round(highwayX(D.z));
const html = `<!doctype html><html><body style="margin:0;background:#1d1d1d">
<div style="position:relative;width:${W + 520}px;height:${H}px;font:13px/1.25 -apple-system,Helvetica,Arial,sans-serif;color:#fff">
<img src="data:image/png;base64,${base}" style="position:absolute;left:260px;top:0;image-rendering:pixelated">
<svg width="${W + 520}" height="${H}" style="position:absolute;left:0;top:0">
${[...boxes, ...stock].map((b) => `<rect x="${260 + sx(b.x0)}" y="${sz(b.z0)}" width="${(b.x1 - b.x0) * S}" height="${(b.z1 - b.z0) * S}" fill="${b.fill}" stroke="#fff" stroke-width="1"/>`).join('')}
${pins.map((p) => `<circle cx="${260 + sx(p.x)}" cy="${sz(p.z)}" r="${p.color === '#b9b' ? 4 : 5}" fill="${p.color}" stroke="#000"/>`).join('')}
${placed.map((t) => `<polyline points="${t.fx},${t.y} ${t.side === 'r' ? 260 + W + 2 : 258},${t.y} ${t.side === 'r' ? 260 + W + 8 : 252},${t.ty}" fill="none" stroke="#ddd"/>`).join('')}
</svg>
${placed.map((t) => t.side === 'r' ? `<div style="position:absolute;left:${260 + W + 10}px;top:${t.ty - 8}px;width:250px">${t.label}</div>` : `<div style="position:absolute;left:4px;top:${t.ty - 8}px;width:244px;text-align:right">${t.label}</div>`).join('')}
<div style="position:absolute;left:4px;top:8px;width:250px;font-size:15px"><b>Zone-3 (Phase 7)</b><br>North is up. 1 square = 1 m ×2.<br>Blue: the reservoir and the river. Grey: roads. Pale dots: where the Ashen keep by day, in the dark.<br><br>Highway → dam ${jx - D.x1} m<br>Across the dam ${D.x1 - D.x0} m<br>Dam → powerhouse ${Math.round(D.x0 - Z.avenue.x + Z.powerhouse.z0 + 12 - D.z)} m<br>Dam → machine shop ${Math.round(D.x0 - Z.avenue.x + (Z.shop.z0 + Z.shop.z1) / 2 - D.z)} m<br>Dam → rail yard ${Math.round(D.x0 - Z.avenue.x + Z.yard.z0 - D.z)} m<br>Dam → old road ${Math.round(D.x0 - Z.avenue.x + Z.avenue.z1 - D.z)} m</div>
<div style="position:absolute;left:${260 + sx(690)}px;top:${sz(ZONES.zone2Play) + 6}px;color:#fcc;font-weight:bold">▲ Zone-2, danger 5 &nbsp; ▼ Zone-1, danger 3–4</div>
<div style="position:absolute;left:${260 + sx(646)}px;top:${sz(ZONES.zone2Play)}px;width:${W - sx(646)}px;border-top:2px dashed #f66"></div>
<div style="position:absolute;left:${260 + sx(478)}px;top:${sz(700)}px;color:#dde;font-weight:bold;font-size:15px">Zone-3, danger 6<br>(7 at night and underground)</div>
<div style="position:absolute;left:${260 + sx(646)}px;top:${sz(880)}px;color:#eee;transform:rotate(90deg);transform-origin:left top;white-space:nowrap">the gorge of the Río Seco (the ravine)</div>
<div style="position:absolute;left:${260 + sx(622)}px;top:${sz(700)}px;color:#cef;white-space:nowrap">reservoir</div>
</div></body></html>`;

mkdirSync('out', { recursive: true });
writeFileSync('out/zone3map.html', html);
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W + 520, height: H } });
await page.setContent(html);
mkdirSync('docs', { recursive: true });
await page.screenshot({ path: 'docs/phase7-map.png' });
await browser.close();
console.log(`wrote docs/phase7-map.png (${W + 520}×${H})`);
