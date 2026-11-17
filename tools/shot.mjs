// Takes screenshots of the built game (dist/index.html) in headless Chromium, from fixed cameras
// and times of day. For checking the look by eye; not a pass/fail test.
// Usage: node tools/shot.mjs [name=x,y,z,yawDeg,pitchDeg,hour ...]   (default: the balcony views)
import { createRequire } from 'node:module';
// Playwright is installed globally in this environment, so load it through require (NODE_PATH).
const { chromium } = createRequire(import.meta.url)('playwright');
import { mkdirSync } from 'node:fs';

const DEFAULT = {
  balcony_sunset: '1796.5,83.62,1024.5,90,-6,17.6',
  balcony_noon: '1796.5,83.62,1024.5,90,-8,12',
  living_room: '1812,83.62,1024.5,-90,-5,20',
  valley_floor: '1690,72,1040,60,2,16.5',
  rim_overview: '1700,150,1180,0,-32,15',
};
const args = process.argv.slice(2);
const shots = args.length ? Object.fromEntries(args.map((a) => a.split('='))) : DEFAULT;
// Serve dist/ first (npx vite preview --port 4173): workers can't start from file:// pages.
const BASE = process.env.BASE || 'http://localhost:4173/';
const W = Number(process.env.W || 960), H = Number(process.env.H || 540), RD = process.env.RD || '5';

mkdirSync('out', { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: Number(process.env.DSF || 1) });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
page.on('pageerror', (e) => console.log('[page error]', e.message));
for (const [name, spec] of Object.entries(shots)) {
  const [x, y, z, yaw, pitch, hour] = spec.split(',').map(Number);
  const cam = [x, y, z, (yaw * Math.PI) / 180, (pitch * Math.PI) / 180].join(',');
  const url = `${BASE}?test&rd=${RD}&hour=${hour}&cam=${cam}`;
  const t0 = Date.now();
  await page.goto(url);
  await page.waitForFunction(() => window.__hv && window.__hv.idle(), null, { timeout: 600_000, polling: 500 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `out/${name}.png` });
  console.log(`${name}: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
await browser.close();
