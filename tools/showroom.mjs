// Sets pieces of furniture out in a row on a stage in the open air and photographs them from where a player
// would stand: 2.5 blocks away, at eye height, by day and by lamp light. For judging each piece by eye.
// Usage: node tools/showroom.mjs name[+onTop] ...   (e.g. table chair@south desk@south+computer@south)
//   NIGHT=1 takes the lamp-light pictures too. Pictures go to out/show_<n>.png, four pieces to a picture.
// Needs the preview server (npx vite preview --port 4173).
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { mkdirSync } from 'node:fs';

const pieces = process.argv.slice(2);
const PER = Number(process.env.PER || 4), DIST = Number(process.env.DIST || 2.6);
const X0 = 1740, Y = 120, Z = 1024;
mkdirSync('out', { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: Number(process.env.DSF || 1) });
page.on('pageerror', (e) => console.log('[page error]', e.message));
for (const hour of process.env.NIGHT ? [12, 21] : [12]) {
  for (let g = 0; g * PER < pieces.length; g++) {
    const group = pieces.slice(g * PER, g * PER + PER);
    const cx = X0 + (group.length * 2 - 1) / 2 + 0.5;
    await page.goto(`http://localhost:4173/?test&rd=3&hour=${hour}&cam=${[cx, Y + 1.62, Z + DIST + 0.5, 0, -0.18].join(',')}`);
    await page.waitForFunction(() => window.__hv && window.__hv.idle(), null, { timeout: 600_000, polling: 500 });
    await page.evaluate(({ group, X0, Y, Z }) => {
      const hv = window.__hv, w = hv.game.world, id = (n) => hv.blockId(n);
      for (let x = X0 - 3; x < X0 + group.length * 2 + 3; x++) {
        for (let z = Z - 1; z <= Z + 5; z++) w.setBlock(x, Y - 1, z, id('planks'));
        for (let y = Y; y < Y + 4; y++) w.setBlock(x, y, Z - 1, id('plaster'));
      }
      group.forEach((spec, i) => {
        const [base, ...tops] = spec.split('+');
        const x = X0 + 1 + i * 2;
        if (base.startsWith('wall:')) w.setBlock(x, Y + 1, Z, id(base.slice(5)));
        else w.setBlock(x, Y, Z, id(base));
        tops.forEach((t, k) => w.setBlock(x, Y + 1 + k, Z, id(t)));
        w.setBlock(x + 1, Y + 3, Z + 1, id('lantern'));
      });
    }, { group, X0, Y, Z });
    await page.waitForFunction(() => window.__hv.idle(), null, { timeout: 600_000, polling: 500 });
    await page.waitForTimeout(800);
    const name = `out/show_${hour === 12 ? 'day' : 'night'}_${g}.png`;
    await page.screenshot({ path: name, timeout: 180_000 });
    console.log(name, group.join(' '));
  }
}
await browser.close();
