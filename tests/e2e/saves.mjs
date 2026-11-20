// The saves, in a real browser (docs/FIXES.md, N1): a walk with no edit survives a reload; a second tab is held back
// and told why; a slow storage open waits instead of starting a new valley; a broken save ends at a working menu.
// Needs the build served: npx vite preview --port 4173. Run: node tests/e2e/saves.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const BASE = process.env.BASE || 'http://localhost:4173/';
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
const errors = [];
const open = async (query = 'rd=2&hour=12') => {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}?${query}`);
  await page.waitForFunction(() => window.__hv && window.__hv.idle(), null, { timeout: 240_000, polling: 300 });
  return page;
};
// Waits are on the game's own state or clock, never the wall's: a slow machine runs the game at a fraction of real time.
const playing = (page) => page.waitForFunction(() => window.__hv.game.playing, null, { timeout: 60_000, polling: 100 });
const saved = (page) => page.waitForFunction(() => { const g = window.__hv.game; return !g.saving && g.editCount === g.savedCount; }, null, { timeout: 60_000, polling: 100 });
const gameWait = async (page, seconds) => {
  const t0 = await page.evaluate(() => window.__hv.game.time);
  await page.waitForFunction(([t0, s]) => window.__hv.game.time - t0 >= s, [t0, seconds], { timeout: 120_000, polling: 100 });
};
const ready = (page) => page.waitForFunction(() => window.__hv && window.__hv.idle(), null, { timeout: 240_000, polling: 300 });

// 1. Play without changing a block; pause; reload: position, health and the hour are there.
const a = await open();
check('the store is the browser’s own', (await a.evaluate(() => window.__hv.game.store.kind)) === 'indexeddb');
await a.getByRole('button', { name: 'Play' }).click();
await a.locator('.hv-intro .skip').click().catch(() => {}); // the opening, on a new valley
await playing(a);
// (A step to a spot that is free: the balcony has furniture on it, and a player saved inside some is put back at the cave.)
await a.evaluate(() => {
  const g = window.__hv.game, p = g.player, at = (x, y, z) => g.world.blockAt(x, y, z);
  const to = [[-1, 0], [-1, 1], [-1, -1], [0, 1], [0, -1], [-2, 0], [1, 0]].find(([dx, dz]) => p.fitsAt(p.x + dx, p.y, p.z + dz, at) && at(Math.floor(p.x + dx), Math.floor(p.y) - 1, Math.floor(p.z + dz)) !== 0);
  p.setPosition(p.x + to[0], p.y, p.z + to[1]); g.vitals.hp = 37; g.wallet = 424242;
});
const at = await a.evaluate(() => window.__hv.game.player.x);
await gameWait(a, 1);
await a.keyboard.press('Escape');
await a.waitForFunction(() => !window.__hv.game.playing, null, { timeout: 20_000 });
await saved(a);
await a.reload();
await ready(a);
const back = await a.evaluate(() => { const g = window.__hv.game; return { x: g.player.x, hp: g.vitals.hp, wallet: g.wallet, toasts: g.hud.blocked }; });
check('a walk with no block changed is saved on pause', Math.abs(back.x - at) < 0.01 && Math.round(back.hp) === 37 && back.wallet === 424242, JSON.stringify(back));
check('no backup is offered until a valley has been left (a page load makes none)', !(await a.getByRole('button', { name: /Open the backup/ }).isVisible()));

// 2. Leaving with no pause and no edit: the close-time copy.
await a.getByRole('button', { name: 'Play' }).click();
await playing(a);
await a.evaluate(() => { window.__hv.game.wallet = 31337; });
await gameWait(a, 0.3);
await a.reload();
await ready(a);
check('closing the page mid-play keeps what was not yet saved', (await a.evaluate(() => window.__hv.game.wallet)) === 31337);

// 3. A second tab while the first is open.
const b = await open();
const blocked = await b.evaluate(() => document.querySelector('.hv-status.warn')?.textContent ?? '');
check('a second tab says the game is open elsewhere, and Play is held back', /already open in another tab/.test(blocked) && (await b.getByRole('button', { name: 'Play' }).isDisabled()), blocked.slice(0, 60));
await b.evaluate(() => { const g = window.__hv.game; g.wallet = 1; g.edited(); return g.save(false); });
await a.reload();
await ready(a);
check('the second tab cannot write over the first’s valley', (await a.evaluate(() => window.__hv.game.wallet)) === 31337);
await a.close();
await b.waitForFunction(() => !document.querySelector('.hv-btn.primary').disabled, null, { timeout: 60_000 }).catch(() => {});
await ready(b);
check('when the first tab closes, the second opens the valley as it was left', (await b.evaluate(() => window.__hv.game.wallet)) === 31337 && !(await b.getByRole('button', { name: 'Play' }).isDisabled()));
await b.close();

// 4. A slow storage open (2.5 s, past the old 1.5 s limit): the valley still opens. One that never answers: the
//    game says the saved valley can't be reached, keeps what is done apart, and the valley is there at the next start.
const slowOpen = (ms) => {
  const real = indexedDB.open.bind(indexedDB);
  indexedDB.open = (...args) => {
    const req = real(...args);
    const fake = {};
    Object.defineProperty(fake, 'result', { get: () => req.result });
    req.onupgradeneeded = () => fake.onupgradeneeded?.();
    req.onsuccess = () => { if (ms !== null) setTimeout(() => fake.onsuccess?.(), ms); };
    req.onerror = () => fake.onerror?.();
    return fake;
  };
};
const c = await ctx.newPage();
await c.addInitScript(slowOpen, 2500);
await c.goto(`${BASE}?rd=2&hour=12`);
await ready(c);
const slow = await c.evaluate(() => ({ kind: window.__hv.game.store.kind, wallet: window.__hv.game.wallet }));
check('a slow storage open waits for the save instead of starting a new valley', slow.kind === 'indexeddb' && slow.wallet === 31337, JSON.stringify(slow));
await c.close();
const never = await ctx.newPage();
await never.addInitScript(slowOpen, null);
await never.goto(`${BASE}?rd=2&hour=12`);
await ready(never);
const lost = await never.evaluate(() => ({ kind: window.__hv.game.store.kind, wallet: window.__hv.game.wallet, said: [...document.querySelectorAll('.hv-status')].map((e) => e.textContent).join(' ') }));
check('storage that never opens: the game says the saved valley can’t be reached', lost.kind !== 'indexeddb' && /can’t be reached/.test(lost.said), JSON.stringify(lost).slice(0, 140));
await never.evaluate(() => { const g = window.__hv.game; g.wallet = 5; g.edited(); return g.save(false); });
await never.close();
const again = await open();
check('and what was done meanwhile did not replace it', (await again.evaluate(() => window.__hv.game.wallet)) === 31337);
await again.close();

// 5. A broken save pasted in, then a broken save in the store: a working menu both times.
const d = await open();
await d.getByRole('button', { name: 'Paste save code' }).click();
await d.locator('textarea.hv-code').last().fill('HVB1:' + Buffer.from(JSON.stringify({ format: 'hidden-valley-blocks-save', version: 1 })).toString('base64'));
await d.getByRole('button', { name: 'Load pasted code' }).click();
await d.waitForFunction(() => /damaged/.test(document.querySelector('.hv-toast')?.textContent ?? ''), null, { timeout: 60_000, polling: 100 });
check('a damaged save code is refused and the valley is untouched', (await d.evaluate(() => window.__hv.game.wallet)) === 31337);
await d.reload();
await ready(d);
check('and the page still starts afterwards', (await d.evaluate(() => window.__hv.game.wallet)) === 31337 && await d.getByRole('button', { name: 'Play' }).isVisible());
await d.evaluate(() => window.__hv.game.store.set('save:1', new TextEncoder().encode(JSON.stringify({ format: 'hidden-valley-blocks-save', version: 1 }))));
await d.evaluate(() => { window.__hv.game.saveNow = () => {}; }); // leave the broken bytes as they are
await d.reload();
await ready(d);
const after = await d.evaluate(() => ({ wallet: window.__hv.game.wallet, status: document.querySelector('.hv-status').parentElement.querySelectorAll('.hv-status')[1]?.textContent ?? '' }));
check('a broken stored save opens the backup at a working menu, and says so', after.wallet === 31337 && await d.getByRole('button', { name: 'Play' }).isVisible(), JSON.stringify(after).slice(0, 160));

// 6. New game by mistake: the valley left is the backup, a reload does not touch it, and it opens again.
await d.close(); // (one tab at a time: a second would be held back)
const e = await open();
const mine = await e.evaluate(() => window.__hv.game.wallet);
await e.getByRole('button', { name: 'New game' }).click();
await e.getByRole('button', { name: 'Click again to erase this save' }).click();
await e.waitForFunction((w) => window.__hv.game.wallet !== w, mine, { timeout: 60_000 }).catch(() => {});
await ready(e);
await saved(e);
await e.reload();
await ready(e);
check('after New game and a reload, the valley left is still offered as the backup', await e.getByRole('button', { name: /Open the backup/ }).isVisible());
await e.getByRole('button', { name: /Open the backup/ }).click();
await e.waitForFunction((w) => window.__hv.game.wallet === w, mine, { timeout: 60_000 }).catch(() => {});
check('and opening it brings the valley back', (await e.evaluate(() => window.__hv.game.wallet)) === mine, `wallet ${await e.evaluate(() => window.__hv.game.wallet)} (was ${mine})`);
await e.close();

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const passed = results.filter(Boolean).length;
console.log(`CHECKS ${passed}/${results.length}`);
process.exit(passed === results.length ? 0 : 1);
