// Review probes for branch `fixes`, in a real browser with a real IndexedDB (the reviewer's; not part of the
// play-through). Each line states what SHOULD hold: a FAIL is a finding shown on the built page.
// Needs the build served: npx vite preview --port 4180. Run: BASE=http://localhost:4180/ node tests/e2e/zz_review.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const BASE = process.env.BASE || 'http://localhost:4180/';
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ready = (page) => page.waitForFunction(() => window.__hv && window.__hv.idle(), null, { timeout: 240_000, polling: 300 });
/** A browser of its own (its own storage), with the page open. */
async function fresh(query = 'rd=2') {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}?${query}`);
  await ready(page);
  return page;
}
const wallet = (page) => page.evaluate(() => window.__hv.game.wallet);
/** Play (or Resume), past the opening's cards on a new valley. */
async function begin(page) {
  await page.getByRole('button', { name: /^(Play|Resume)$/ }).click();
  const playing = () => page.waitForFunction(() => window.__hv.game.playing, null, { timeout: 3000 }).then(() => true, () => false);
  if (await playing()) return;
  await page.locator('.hv-intro .skip').click({ timeout: 20_000 }).catch(() => {});
  await page.waitForFunction(() => window.__hv.game.playing, null, { timeout: 30_000 });
}
/** Play, set the wallet (the valley's mark), pause: the pause saves. */
async function playAs(page, sats) {
  await begin(page);
  await page.evaluate((n) => { const g = window.__hv.game; g.wallet = n; g.edited(); }, sats);
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__hv.game.playing, null, { timeout: 20_000 });
  await page.waitForTimeout(1500);
}
async function openBackup(page) {
  await page.getByRole('button', { name: /Open the backup/ }).click();
  await page.waitForTimeout(1500);
  await ready(page);
}

// 1. New game by mistake, then a reload: is the valley left still in the backup?
{
  const p = await fresh();
  await playAs(p, 777_777);
  const btn = p.getByRole('button', { name: /New game|Click again/ });
  await btn.click(); await btn.click();
  await p.waitForTimeout(1500); await ready(p);
  check('(set-up) New game opened a fresh valley', (await wallet(p)) === 1_000_000);
  await p.reload(); await ready(p);
  await openBackup(p);
  check('New game by mistake, then a reload: "Open the backup" still gives the valley that was left', (await wallet(p)) === 777_777, `the backup's wallet is ${await wallet(p)}, the valley left had 777777`);
  await p.context().close();
}

// 2. "Open the backup" to look at it, then the page is closed: is the newer valley still there next time?
{
  const p = await fresh();
  await playAs(p, 111);
  await p.reload(); await ready(p); // a second session: its backup is the valley as found (111)
  await playAs(p, 222); // this session's play
  await openBackup(p);
  check('(set-up) the backup is the valley as the session found it', (await wallet(p)) === 111);
  await p.reload(); await ready(p);
  const now = await wallet(p);
  await openBackup(p);
  const other = await wallet(p);
  check('"Open the backup", then a reload: this session’s play (222) is still in the save or the backup', now === 222 || other === 222, `the save holds ${now}, the backup ${other}`);
  await p.context().close();
}

// 3. New game clicked three times within four seconds.
{
  const p = await fresh();
  await playAs(p, 333_333);
  const btn = p.getByRole('button', { name: /New game|Click again/ });
  await btn.click(); await btn.click(); await p.waitForTimeout(700); await btn.click();
  await p.waitForTimeout(2000); await ready(p);
  await openBackup(p);
  check('New game clicked three times: "Open the backup" still gives the valley that was left (on a slow machine the third click lands after the button’s 4 s and only arms it again: see the unit probe for two New games in a row)', (await wallet(p)) === 333_333, `the backup's wallet is ${await wallet(p)}`);
  await p.context().close();
}

// 4. "Open the backup" double-clicked.
{
  const p = await fresh();
  await playAs(p, 111);
  await p.reload(); await ready(p);
  await playAs(p, 222);
  await p.getByRole('button', { name: /Open the backup/ }).dblclick();
  await p.waitForTimeout(2500); await ready(p);
  const now = await wallet(p);
  await openBackup(p);
  const other = await wallet(p);
  check('"Open the backup" double-clicked: this session’s play (222) is still in the save or the backup', now === 222 || other === 222, `the save holds ${now}, the backup ${other}`);
  await p.context().close();
}

// 5. The address bar, in Survival.
{
  const p = await fresh('rd=2&cam=1800,95,1024,0,0');
  await begin(p);
  const s = await p.evaluate(() => ({ mode: window.__hv.game.mode, flying: window.__hv.game.player.flying }));
  check('?cam=… does not set a Survival player flying', s.mode === 'survival' && !s.flying, JSON.stringify(s));
  await p.context().close();
}

await browser.close();
console.log(`\n${results.filter(Boolean).length} of ${results.length} hold`);
process.exit(0);
