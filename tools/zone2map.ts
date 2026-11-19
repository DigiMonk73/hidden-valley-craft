// Draws Zone-2's layout from above for the owner (docs/phase6-map.png): the land as shading, the old
// road and the highway north from the hunting camp, each place as a box, the radiation rings, with labels.
// It reads only the layout. Run: node --experimental-strip-types --no-warnings tools/zone2map.ts
// The labels are drawn by headless Chromium (pre-installed), over the picture this computes.

import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { encodePng } from './png.ts';
import {
  surfaceHeight, zoneAt, onRoad, onHighway, ZONE2, ZONE1FAR, highwayX, onCaveTrail, onCampTrail, ZONES, type ZoneId,
} from '../src/gen/layout.ts';

const X0 = 690, X1 = 910, Z0 = 530, Z1 = 1050, S = 2;
const W = (X1 - X0) * S, H = (Z1 - Z0) * S;
const px = new Uint8Array(W * H * 3);
const TINT: Partial<Record<ZoneId, [number, number, number]>> = { mid: [150, 170, 110], deep: [120, 140, 100], zone2: [175, 160, 130], zone3: [130, 130, 150] };

const cell = (x: number, z: number): [number, number, number] => {
  const h = surfaceHeight(x, z), hx = surfaceHeight(x + 1, z), hz = surfaceHeight(x, z + 1);
  const shade = Math.max(0.55, Math.min(1.25, 0.8 + (h - 88) / 40 + (h - hx) * 0.08 + (h - hz) * 0.08));
  const t = TINT[zoneAt(x, z)] ?? [150, 170, 110];
  let c: [number, number, number] = [t[0] * shade, t[1] * shade, t[2] * shade];
  if (onRoad(x, z) || onHighway(x, z)) c = [92, 92, 96];
  if (onHighway(x, z) && Math.abs(x + 0.5 - highwayX(z)) < 0.5 && z % 6 < 3) c = [220, 190, 60];
  if (onCampTrail(x, z) || onCaveTrail(x, z)) c = [150, 120, 80];
  const l = ZONE2.lot;
  if (x >= l.x0 && x < l.x1 && z >= l.z0 && z < l.z1) c = [105, 105, 108];
  return c;
};
for (let j = 0; j < H; j++)
  for (let i = 0; i < W; i++) {
    const c = cell(X0 + Math.floor(i / S), Z0 + Math.floor(j / S));
    const k = (j * W + i) * 3;
    px[k] = Math.min(255, c[0]); px[k + 1] = Math.min(255, c[1]); px[k + 2] = Math.min(255, c[2]);
  }
const base = encodePng(W, H, px).toString('base64');

// Boxes and labels in world coordinates.
type Box = { x0: number; x1: number; z0: number; z1: number; fill: string; label?: string; side?: 'l' | 'r' };
const Z = ZONE2, F = ZONE1FAR;
const boxes: Box[] = [
  { ...Z.compound, fill: 'rgba(120,30,30,0.85)', label: 'Las Cruces: the faction compound (walls, two gate towers, the armband’s mark)', side: 'r' },
  { ...Z.exchange, fill: 'rgba(60,60,80,0.9)', label: 'Telephone exchange: server racks, battery room; mast with a red light', side: 'l' },
  ...Z.shops.map((s) => ({ x0: Z.mall.x0, x1: Z.mall.x1, z0: s.z0, z1: s.z1, fill: s.name === 'farmacia' ? 'rgba(40,110,60,0.9)' : s.name === 'ferreteria' ? 'rgba(150,90,30,0.9)' : 'rgba(40,80,140,0.9)',
    label: s.name === 'farmacia' ? 'Pharmacy: Doc’s card' : s.name === 'ferreteria' ? 'Hardware: wiring, pipes, lead, pumps, casings' : 'Supermarket: fridge units', side: 'r' as const })),
  { x0: Z.cave.cavern.x0, x1: Z.cave.cavern.x1, z0: Z.cave.cavern.z0, z1: Z.cave.cavern.z1, fill: 'rgba(200,180,40,0.55)', label: 'Hot-spring cavern (13 m down): sulfur; saltpeter on the passage walls; steam vent', side: 'r' },
  { x0: F.camp.x0, x1: F.camp.x1, z0: F.camp.z0, z1: F.camp.z1, fill: 'rgba(60,90,50,0.7)', label: 'Hunting camp (Phase 5): the highway starts at its north edge', side: 'r' },
  { x0: F.outpost.x0, x1: F.outpost.x1, z0: F.outpost.z0, z1: F.outpost.z1, fill: 'rgba(110,40,30,0.8)', label: 'Raider outpost (Phase 5)', side: 'r' },
];
const pins: { x: number; z: number; label: string; color: string; side: 'l' | 'r' }[] = [
  { x: highwayX(Z.highway.z0 - 2) - 6, z: Z.highway.z0 - 2, label: 'Highway sign “CARRETERA 4 · LAS CRUCES”, lit', color: '#fff', side: 'l' },
  { x: highwayX(Z.border.z), z: Z.border.z, label: 'Zone-2 border: barriers painted with the faction’s mark', color: '#e33', side: 'l' },
  { x: Z.cave.mouthX, z: Z.cave.z, label: 'Cave mouth, lit', color: '#fc4', side: 'r' },
  { x: Z.exchange.mastX, z: Z.exchange.mastZ, label: '', color: '#f22', side: 'l' },
  { x: 800, z: ZONE1FAR.campHead.z, label: 'Old road (Phase 5): the camp’s marked trail north', color: '#fff', side: 'r' },
];
const rings = Z.hotspots.map((h) => ({ ...h }));
const sx = (x: number) => (x - X0) * S, sz = (z: number) => (z - Z0) * S;

const labels = [...boxes.filter((b) => b.label).map((b) => ({ fx: 260 + sx(b.side === 'r' ? b.x1 : b.x0), y: sz((b.z0 + b.z1) / 2), label: b.label!, side: b.side! })), ...pins.filter((p) => p.label).map((p) => ({ fx: 260 + sx(p.x), y: sz(p.z), label: p.label, side: p.side })),
  ...rings.map((r) => ({ fx: 260 + sx(r.x + (r.x > 790 ? r.r : -r.r)), y: sz(r.z), label: r.name === 'van' ? 'Radiation: the wrecked clinic van (lead casket inside)' : 'Radiation: the drainage pond', side: (r.x > 790 ? 'r' : 'l') as 'l' | 'r' }))];
const placed: { fx: number; y: number; ty: number; label: string; side: 'l' | 'r' }[] = [];
for (const side of ['l', 'r'] as const) {
  let last = -1e9;
  for (const t of labels.filter((t) => t.side === side).sort((a, b) => a.y - b.y)) { const ty = Math.max(t.y, last + 46); placed.push({ ...t, ty }); last = ty; }
}
const d = (z: number) => Math.round(Z.highway.z0 - z);
const html = `<!doctype html><html><body style="margin:0;background:#1d1d1d">
<div style="position:relative;width:${W + 520}px;height:${H}px;font:13px/1.25 -apple-system,Helvetica,Arial,sans-serif;color:#fff">
<img src="data:image/png;base64,${base}" style="position:absolute;left:260px;top:0;image-rendering:pixelated">
<svg width="${W + 520}" height="${H}" style="position:absolute;left:0;top:0">
${boxes.map((b) => `<rect x="${260 + sx(b.x0)}" y="${sz(b.z0)}" width="${(b.x1 - b.x0) * S}" height="${(b.z1 - b.z0) * S}" fill="${b.fill}" stroke="#fff" stroke-width="1"/>`).join('')}
${rings.map((r) => `<circle cx="${260 + sx(r.x)}" cy="${sz(r.z)}" r="${r.r * S}" fill="rgba(240,220,0,0.35)" stroke="#ff0" stroke-width="2" stroke-dasharray="4 3"/>`).join('')}
${pins.map((p) => { const y = sz(p.z), x = 260 + sx(p.x), xt = p.side === 'r' ? 260 + W + 8 : 252; void xt; return `<circle cx="${x}" cy="${y}" r="5" fill="${p.color}" stroke="#000"/>`; }).join('')}
${placed.map((t) => `<polyline points="${t.fx},${t.y} ${t.side === 'r' ? 260 + W + 2 : 258},${t.y} ${t.side === 'r' ? 260 + W + 8 : 252},${t.ty}" fill="none" stroke="${t.label.startsWith('Radiation') ? '#ff0' : '#ddd'}"/>`).join('')}
<text x="${260 + W / 2}" y="${sz(Z.highway.z1 + 30)}" fill="#fff" font-size="12" text-anchor="middle" transform="rotate(-90 ${260 + sx(highwayX(700)) - 10} ${sz(700)})"></text>
</svg>
${placed.map((t) => t.side === 'r' ? `<div style="position:absolute;left:${260 + W + 10}px;top:${t.ty - 8}px;width:250px">${t.label}</div>` : `<div style="position:absolute;left:4px;top:${t.ty - 8}px;width:244px;text-align:right">${t.label}</div>`).join('')}
<div style="position:absolute;left:4px;top:8px;width:250px;font-size:15px"><b>Zone-2 (Phase 6)</b><br>North is up. 1 square = 1 m ×2.<br>Grey: the old road and the highway (yellow centre line). Red: the faction. Yellow rings: radiation.<br><br>Camp → border ${d(Z.border.z)} m<br>Camp → ruins ${d(Z.mall.z1)} m<br>Camp → cave ${d(Z.caveTrail.z) + Math.round(Z.cave.mouthX - highwayX(Z.caveTrail.z))} m<br>Camp → compound gate ${d(Z.compound.z1)} m</div>
<div style="position:absolute;left:266px;top:${sz(ZONES.zone2Play) + 6}px;color:#fcc;font-weight:bold">▲ Zone-2, danger 5</div><div style="position:absolute;left:266px;top:${sz(ZONES.zone2Play) + 24}px;color:#fcc;font-weight:bold">▼ Zone-1 mid band, danger 3</div>
<div style="position:absolute;left:260px;top:${sz(ZONES.zone2Play)}px;width:${W}px;border-top:2px dashed #f66"></div>
</div></body></html>`;

mkdirSync('out', { recursive: true });
writeFileSync('out/zone2map.html', html);
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W + 520, height: H } });
await page.setContent(html);
mkdirSync('docs', { recursive: true });
await page.screenshot({ path: 'docs/phase6-map.png' });
await browser.close();
console.log(`wrote docs/phase6-map.png (${W + 520}×${H})`);
