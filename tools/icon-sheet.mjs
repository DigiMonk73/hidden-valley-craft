// A contact sheet of the game's icon (assets/icon/) in a real browser: every size at 1:1, browser-tab
// mock-ups on light and dark at 16 px (and 32 px on a sharp screen), for checking it by eye.
// Run after tools/icon.ts: node tools/icon-sheet.mjs  → docs/review/icon-sheet.png
import { createRequire } from 'node:module';
// Playwright is installed globally in this environment, so load it through require (NODE_PATH).
const { chromium } = createRequire(import.meta.url)('playwright');
import { readFileSync, mkdirSync } from 'node:fs';

const uri = (s) => `data:image/png;base64,${readFileSync(`assets/icon/icon-${s}.png`).toString('base64')}`;
const tab = (bg, fg, tabBg, s) => `<div class="bar" style="background:${bg}">
  <div class="tab" style="background:${tabBg};color:${fg}"><img src="${uri(s)}" width="16" height="16">Under the Falls</div>
  <div class="tab dim" style="color:${fg}"><span class="dot"></span>Another page</div></div>`;
const html = `<!doctype html><html><head><link rel="icon" href="${uri(32)}"><style>
body{margin:0;padding:16px;font:13px system-ui,sans-serif;background:#888;color:#111}
.row{display:flex;gap:16px;align-items:flex-end;margin-bottom:16px;flex-wrap:wrap}
.cell{text-align:center}.cell img{display:block;image-rendering:pixelated;margin-bottom:4px}
.bar{display:flex;gap:4px;padding:6px 8px 0;width:420px}
.tab{display:flex;gap:8px;align-items:center;padding:8px 12px;border-radius:8px 8px 0 0;width:170px}
.tab img{image-rendering:auto}.dim{opacity:.6}.dot{width:16px;height:16px;border-radius:50%;background:currentColor;opacity:.4}
.pair{display:flex;gap:16px}.on{padding:12px}
</style></head><body>
<div class="row">${[16, 32, 48, 180, 192, 256, 512].map((s) => `<div class="cell"><img src="${uri(s)}" width="${s}" height="${s}">${s}</div>`).join('')}</div>
<div class="pair">
 <div>${tab('#dee1e6', '#202124', '#ffffff', 16)}${tab('#202124', '#e8eaed', '#35363a', 16)}</div>
 <div class="on" style="background:#fff">${[16, 32, 48].map((s) => `<img src="${uri(s)}" width="${s}" height="${s}" style="margin-right:12px">`).join('')}</div>
 <div class="on" style="background:#111">${[16, 32, 48].map((s) => `<img src="${uri(s)}" width="${s}" height="${s}" style="margin-right:12px">`).join('')}</div>
</div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1340, height: 860 }, deviceScaleFactor: Number(process.env.DPR ?? 1) });
await page.setContent(html);
mkdirSync('docs/review', { recursive: true });
const out = process.env.OUT ?? 'docs/review/icon-sheet.png';
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(out);
