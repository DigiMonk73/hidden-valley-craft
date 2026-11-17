// End-to-end check of Phase 0 in headless Chromium: the game loads, the player can walk, mine a
// block (it goes into the hotbar) and place one, and a save survives a page reload.
// Needs the build served: npx vite preview --port 4173. Run: node tests/e2e/play.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const BASE = process.env.BASE || 'http://localhost:4173/';
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 800, height: 450 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const idle = () => page.waitForFunction(() => window.__hv && window.__hv.idle(), null, { timeout: 180_000, polling: 300 });
const g = (fn, arg) => page.evaluate(fn, arg);

await page.goto(`${BASE}?rd=4&hour=12`);
await idle();
check('loads and becomes ready', true);

await page.getByRole('button', { name: 'Play' }).click();
await page.waitForTimeout(1200);
const mode = await g(() => window.__hv.game.look.mode);
check('play starts (mouse captured or free-look fallback)', mode === 'captured' || mode === 'free', `look mode: ${mode}`);

// Walk east into the cave for a second.
const x0 = await g(() => window.__hv.game.player.x);
await g(() => { const p = window.__hv.game.player; p.yaw = -Math.PI / 2; p.pitch = 0; });
await page.keyboard.down('KeyW');
await page.waitForTimeout(1500);
await page.keyboard.up('KeyW');
const x1 = await g(() => window.__hv.game.player.x);
check('walks (W moves the player)', x1 - x0 > 2, `moved ${(x1 - x0).toFixed(2)} m east`);

// Mine the floor just ahead. Synthetic mouse events can turn the view as they land, so press
// first, then aim, then read what is targeted.
await page.mouse.move(400, 225);
await g(() => { window.__hv.game.hotbar.slots[8] = null; });
await page.mouse.down();
await page.waitForTimeout(300);
// Hold the aim until a frame has drawn with it and something is targeted.
await page.waitForFunction(() => {
  const gm = window.__hv.game, p = gm.player;
  if (Math.abs(p.pitch + 1.0) > 1e-3) { p.pitch = -1.0; p.yaw = -Math.PI / 2; return false; }
  return gm.target && gm.target.y < p.y;
}, null, { timeout: 10_000, polling: 100 }).catch(() => {});
const target = await g(() => { const t = window.__hv.game.target; return t && { x: t.x, y: t.y, z: t.z, id: t.id }; });
check('looks at a block', !!target, JSON.stringify(target));
// Software rendering is slow, so game time runs behind the clock here: wait for the result.
await page.waitForFunction((t) => window.__hv.game.world.blockAt(t.x, t.y, t.z) === 0, target, { timeout: 10_000 }).catch(() => {});
await page.mouse.up();
const after = await g((t) => window.__hv.game.world.blockAt(t.x, t.y, t.z), target);
check('mining removes the block', after === 0, `block now ${after}`);
const gained = await g((id) => window.__hv.game.hotbar.slots.some((s) => s && s.id === id && s.count === 1), target.id);
check('the mined block goes into the hotbar', gained);

// Place it back: right click uses the selected block (the one just mined) somewhere in front.
await g((id) => { const h = window.__hv.game.hotbar; h.selected = h.slots.findIndex((s) => s && s.id === id && s.count === 1); }, target.id);
const editsBefore = await g(() => [...window.__hv.game.world.edits.values()].reduce((n, m) => n + [...m.values()].filter((v) => v !== 0).length, 0));
await page.mouse.click(400, 225, { button: 'right' });
await page.waitForFunction((id) => !window.__hv.game.hotbar.slots.some((s) => s && s.id === id && s.count === 1), target.id, { timeout: 5_000 }).catch(() => {});
const editsAfter = await g(() => [...window.__hv.game.world.edits.values()].reduce((n, m) => n + [...m.values()].filter((v) => v !== 0).length, 0));
check('right click places the selected block', editsAfter === editsBefore + 1, `placed blocks ${editsBefore} → ${editsAfter}`);

// Mine a block next to it and leave the hole, then save and reload.
const t2 = { x: target.x, y: target.y, z: target.z + 1 };
await g((t) => window.__hv.game.world.setBlock(t.x, t.y, t.z, 0), t2);
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
const menuShown = await page.getByRole('button', { name: 'Save now' }).isVisible();
check('Esc opens the menu', menuShown);
await page.getByRole('button', { name: 'Save now' }).click();
await page.waitForTimeout(800);
const store = await g(() => window.__hv.game.store.kind);
await page.reload();
await idle();
const restored = await g((t) => window.__hv.game.world.blockAt(t.x, t.y, t.z), t2);
check('a saved edit survives a reload', restored === 0, `storage: ${store}, block now ${restored}`);
const pos = await g(() => { const p = window.__hv.game.player; return [p.x, p.z]; });
check('the player is where they saved', Math.abs(pos[0] - x1) < 3, `x ${pos[0].toFixed(1)}`);

// Close without saving: the page saves as it goes.
const t3 = { x: t2.x, y: t2.y, z: t2.z - 2 };
const before3 = await g((t) => window.__hv.game.world.blockAt(t.x, t.y, t.z), t3);
await g((t) => window.__hv.game.breakBlock(t.x, t.y, t.z), t3);
await page.reload();
await idle();
const after3 = await g((t) => window.__hv.game.world.blockAt(t.x, t.y, t.z), t3);
check('leaving the page keeps the last edit', before3 !== 0 && after3 !== before3, `block ${before3} → ${after3} after reload`);

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
