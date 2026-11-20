// Photographs the hand and what it holds (docs/PHASE9A.md, 1), many to a picture, without loading the world.
// Needs the dev server: npx vite --port 5173. Usage: node tools/handroom.mjs <name> item[:swing[:aim[:draw[:recoil]]]] ...
// writes out/9a/hand-<name>.png. For checking the look by eye; not a pass/fail test.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const [name, ...items] = process.argv.slice(2);
mkdirSync('out/9a', { recursive: true });
const cols = Number(process.env.COLS || Math.min(3, items.length)), W = Number(process.env.W || 480), H = Number(process.env.H || 270);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W * cols, height: H * Math.ceil(items.length / cols) } });
page.on('pageerror', (e) => console.log('[page error]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[page]', m.text()); });
await page.goto(`${process.env.DEV || 'http://localhost:5173/'}tools/handroom.html?cols=${cols}&w=${W}&h=${H}&light=${process.env.LIGHT || 1}&items=${items.join(',')}`);
await page.waitForFunction(() => window.__done, null, { timeout: 60_000 });
await page.screenshot({ path: `out/9a/hand-${name}.png` });
await browser.close();
console.log(`out/9a/hand-${name}.png`);
