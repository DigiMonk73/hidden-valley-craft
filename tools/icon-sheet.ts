// A contact sheet of the game's icon (assets/icon/, written by tools/icon.ts) in a real browser: every size at
// 1:1 on white and black, 16 and 32 px (the clean tab versions) blown up ×8, mock light and dark browser tabs,
// and 512 px. For checking it by eye.
// Run after tools/icon.ts: node --experimental-strip-types --no-warnings tools/icon-sheet.ts → docs/review/icon-sheet.png
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { SIZES } from './icon.ts';
// Playwright is installed globally in this environment, so load it through require (NODE_PATH).
const { chromium } = createRequire(import.meta.url)('playwright');

const uri = (s: number) => `data:image/png;base64,${readFileSync(`assets/icon/icon-${s}.png`).toString('base64')}`;
const img = (s: number, w = s) => `<img src="${uri(s)}" width="${w}" height="${w}">`;
const tab = (bar: string, fg: string, on: string) =>
  `<div class="bar" style="background:${bar}"><div class="tab" style="background:${on};color:${fg}">${img(16)}Under the Falls</div>` +
  `<div class="tab" style="color:${fg};opacity:.6"><span class="dot"></span>New tab</div></div>`;
const html = `<!doctype html><html><head><style>
body{margin:0;padding:20px;font:13px system-ui,sans-serif;background:#8a8a8a;color:#111}
.row{display:flex;gap:20px;align-items:flex-end;margin-bottom:18px;flex-wrap:wrap}
.cell{text-align:center}.cell img{display:block;margin-bottom:4px}
.pair{display:flex;gap:10px}.pair span{display:flex;gap:14px;align-items:center;padding:12px}
.zoom img{image-rendering:pixelated}
.bar{display:flex;gap:4px;padding:6px 8px 0;width:440px}
.tab{display:flex;gap:8px;align-items:center;padding:8px 12px;border-radius:8px 8px 0 0;width:160px}
.dot{width:16px;height:16px;border-radius:50%;background:currentColor;opacity:.4}
</style></head><body>
<div class="row">${SIZES.filter((s) => s <= 256).map((s) => `<div class="cell">${img(s)}${s}</div>`).join('')}</div>
<div class="row">
  <div class="cell zoom">${img(16, 128)}16 ×8</div><div class="cell zoom">${img(32, 256)}32 ×8</div>
  <div class="cell">${img(512)}512</div>
  <div><div class="pair"><span style="background:#fff">${[16, 32, 48].map((s) => img(s)).join('')}</span><span style="background:#111">${[16, 32, 48].map((s) => img(s)).join('')}</span></div>
  <div style="margin-top:14px">${tab('#dee1e6', '#202124', '#ffffff')}${tab('#202124', '#e8eaed', '#35363a')}</div></div>
</div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: Number(process.env.DPR ?? 1) });
await page.setContent(html);
mkdirSync('docs/review', { recursive: true });
const out = process.env.OUT ?? 'docs/review/icon-sheet.png';
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(out);
