// A comparison sheet of the icon designs (tools/icon.ts) in a real browser, for the owner to choose from:
// each design at 16, 32 and 48 px at 1:1, 16 and 32 blown up ×8 so the pixels can be judged, 512 px, and in
// mock light and dark browser tabs.
// Run: node --experimental-strip-types --no-warnings tools/icon-sheet.ts  → docs/review/icon-options.png
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { DESIGNS, pngFor, type Design } from './icon.ts';
// Playwright is installed globally in this environment, so load it through require (NODE_PATH).
const { chromium } = createRequire(import.meta.url)('playwright');

const LABEL: Record<Design, string> = {
  falls: '1 · Waterfall and glow, flat',
  doorway: '2 · The doorway mark',
  pixel: '3 · Simplified pixel scene',
  scene: 'Today’s design (for reference)',
};
const order: Design[] = ['falls', 'doorway', 'pixel', 'scene'];
const uri = (d: Design, s: number) => `data:image/png;base64,${pngFor(d, s).toString('base64')}`;
const img = (d: Design, s: number, w = s) => `<img src="${uri(d, s)}" width="${w}" height="${w}">`;
const tab = (d: Design, bar: string, fg: string, on: string) =>
  `<div class="bar" style="background:${bar}"><div class="tab" style="background:${on};color:${fg}">${img(d, 16)}Under the Falls</div>` +
  `<div class="tab" style="color:${fg};opacity:.6"><span class="dot"></span>New tab</div></div>`;
const column = (d: Design) => `<div class="col"><h2>${LABEL[d]}</h2>
  <div class="small"><span style="background:#fff">${img(d, 16)}${img(d, 32)}${img(d, 48)}</span><span style="background:#111">${img(d, 16)}${img(d, 32)}${img(d, 48)}</span></div>
  <div class="zoom">${img(d, 16, 128)}${img(d, 32, 256)}</div><div class="cap">16 px and 32 px, ×8</div>
  ${tab(d, '#dee1e6', '#202124', '#ffffff')}${tab(d, '#202124', '#e8eaed', '#35363a')}
  <div class="big">${img(d, 512, 400)}</div><div class="cap">512 px (shown at 400)</div></div>`;
const html = `<!doctype html><html><head><style>
body{margin:0;padding:20px;font:13px system-ui,sans-serif;background:#8a8a8a;color:#111;display:flex;gap:20px}
.col{width:420px}h2{font-size:16px;margin:0 0 10px}
.small{display:flex;gap:8px;margin-bottom:10px}.small span{display:flex;gap:12px;align-items:center;padding:10px}
.zoom{display:flex;gap:16px;align-items:flex-start}.zoom img{image-rendering:pixelated}
.cap{margin:4px 0 12px;color:#222}
.bar{display:flex;gap:4px;padding:6px 8px 0}
.tab{display:flex;gap:8px;align-items:center;padding:8px 12px;border-radius:8px 8px 0 0;width:150px}
.dot{width:16px;height:16px;border-radius:50%;background:currentColor;opacity:.4}
.big{margin-top:14px}
</style></head><body>${order.map(column).join('')}</body></html>`;

if (Object.keys(DESIGNS).length !== order.length) throw new Error('a design is missing from the sheet');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1800, height: 900 }, deviceScaleFactor: Number(process.env.DPR ?? 1) });
await page.setContent(html);
mkdirSync('docs/review', { recursive: true });
const out = process.env.OUT ?? 'docs/review/icon-options.png';
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(out);
