// Play with the mouse really captured (docs/PHASE9B.md, 4). The play-through refuses capture (a captured mouse floods
// a headless page with empty moves: README), so what only happens with a captured mouse had no check in a browser:
// capture on Play, the captured sensitivity, losing capture (Esc, or the browser taking it away) pausing the game,
// capture coming back when a screen is closed and on Resume, and Esc on the menu resuming.
// This run captures for under a minute of real time in all, which the page survives.
// Needs the build served: npx vite preview --port 4173. Run: node tests/e2e/capture.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const BASE = process.env.BASE || 'http://localhost:4173/';
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
// (A small picture: the frames come quicker, and each frame's flood of empty moves is the smaller for it.)
const ctx = await browser.newContext({ viewport: { width: 480, height: 270 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('crash', () => { errors.push('the page crashed'); console.log('FAIL the page crashed'); });
const g = (fn, arg) => page.evaluate(fn, arg);
const state = () => g(() => { const gm = window.__hv.game; return { mode: gm.look.mode, locked: document.pointerLockElement === document.getElementById('game'), playing: gm.playing, menu: getComputedStyle(document.querySelector('.hv-menu')).display !== 'none', screen: gm.screen.isOpen, yaw: gm.player.yaw, pitch: gm.player.pitch }; });
const until = (fn, arg, ms = 20_000) => page.waitForFunction(fn, arg, { timeout: ms, polling: 100 }).then(() => true, () => false);
/** One or two frames of the game, so a key or a lock change has been acted on. */
const frames = (n = 2) => g((n) => new Promise((done) => { const gm = window.__hv.game, f0 = gm.renderer.gl.info.render.frame; const t = setInterval(() => { if (gm.renderer.gl.info.render.frame >= f0 + n) { clearInterval(t); done(); } }, 30); }), n);
/** The mouse moved by (dx, dy), as the browser reports it to the page while captured. */
const move = (dx, dy) => g(([dx, dy]) => { document.dispatchEvent(new MouseEvent('mousemove', { movementX: dx, movementY: dy, bubbles: true })); }, [dx, dy]);

await page.goto(`${BASE}?rd=2&hour=12`);
await page.waitForFunction(() => window.__hv && window.__hv.idle(), null, { timeout: 300_000, polling: 300 });
await page.getByRole('button', { name: 'Play' }).click();
await page.locator('.hv-intro .skip').click().catch(() => {});
await until(() => window.__hv.game.playing && window.__hv.game.look.mode !== 'off');
let s = await state();
check('Play captures the mouse (the browser grants the lock to the game’s picture)', s.mode === 'captured' && s.locked && s.playing, JSON.stringify(s));
const captureWorks = s.mode === 'captured';

if (captureWorks) {
  // ---- Captured sensitivity -------------------------------------------------------------------------------
  const sens = await g(() => window.__hv.game.look.sensitivity);
  await move(100, 0);
  let t = await state();
  check('a move of 100 to the right turns the view right by 100 × the sensitivity, no more (free-look’s extra 1.4 is not applied)', Math.abs((s.yaw - t.yaw) - 100 * sens) < 1e-9 && Math.abs(sens - 0.0022) < 1e-9, `turned ${(s.yaw - t.yaw).toFixed(5)} rad, sensitivity ${sens}`);
  await move(0, 50);
  let u = await state();
  check('a move down looks down by the same measure', Math.abs((t.pitch - u.pitch) - 50 * sens) < 1e-9, `pitched ${(t.pitch - u.pitch).toFixed(5)}`);
  // Sensitivity 2 from the game's own setting: twice the turn. Invert: up looks down.
  await g(() => window.__hv.game.hud && window.__hv.game.changeSettings({ sens: 2, inv: true }));
  await move(100, 50);
  let v = await state();
  check('sensitivity 2 turns twice as far, and invert flips up and down, while captured', Math.abs((u.yaw - v.yaw) - 200 * 0.0022) < 1e-9 && Math.abs((v.pitch - u.pitch) - 100 * 0.0022) < 1e-9, `turned ${(u.yaw - v.yaw).toFixed(5)}, pitched ${(v.pitch - u.pitch).toFixed(5)}`);
  await g(() => window.__hv.game.changeSettings({ sens: 1, inv: false }));

  // ---- A screen takes the mouse back, and closing it captures again -----------------------------------------
  await page.keyboard.press('KeyE');
  await until(() => window.__hv.game.screen.isOpen && !document.pointerLockElement);
  s = await state();
  check('E opens the pack and gives the mouse back; the game is not paused by that', s.screen && !s.locked && s.playing && !s.menu, JSON.stringify(s));
  const yawOpen = s.yaw;
  await move(300, 0);
  check('with the pack open the mouse does not turn the view', (await state()).yaw === yawOpen);
  await page.keyboard.press('KeyE');
  const again = await until(() => !window.__hv.game.screen.isOpen && window.__hv.game.look.mode === 'captured' && !!document.pointerLockElement, null, 8000);
  s = await state();
  check('closing the pack captures the mouse again, by itself', again && s.playing, JSON.stringify(s));

  // ---- Esc: the mouse is let go and the game pauses; Resume captures again ------------------------------------
  await page.keyboard.press('Escape');
  await until(() => !window.__hv.game.playing);
  s = await state();
  check('Esc pauses: the menu is up and the mouse is free', !s.playing && s.menu && !s.locked && s.mode === 'off', JSON.stringify(s));
  await page.getByRole('button', { name: 'Resume' }).click();
  await until(() => window.__hv.game.playing);
  // A browser may refuse to capture again in the second after Esc: the game then asks for a click.
  let back = await until(() => window.__hv.game.look.mode === 'captured', null, 3000);
  let asked = false;
  if (!back) {
    asked = /Click to look around/.test(await page.locator('.hv-toast').textContent());
    await page.mouse.click(240, 135);
    back = await until(() => window.__hv.game.look.mode === 'captured', null, 8000);
  }
  s = await state();
  check('Resume plays again with the mouse captured (at once, or after the one click the game asks for)', back && s.playing && s.locked, `${JSON.stringify(s)}${asked ? ' (it asked for a click)' : ''}`);

  // ---- Esc on the menu resumes (docs/PHASE9B.md, 3), with a real lock ---------------------------------------
  await page.keyboard.press('Escape');
  await until(() => !window.__hv.game.playing);
  // (More than 0.4 s of the game's clock on the menu: the same Esc must not undo its own pause.)
  await g(() => new Promise((done) => { const gm = window.__hv.game, t = gm.time; const i = setInterval(() => { if (gm.time - t > 0.6) { clearInterval(i); done(); } }, 50); }));
  check('a moment later the game is still paused (the Esc that paused did not also resume)', !(await state()).playing);
  await page.keyboard.press('Escape');
  const resumed = await until(() => window.__hv.game.playing, null, 8000);
  back = await until(() => window.__hv.game.look.mode === 'captured', null, 3000);
  if (resumed && !back) { await page.mouse.click(240, 135); back = await until(() => window.__hv.game.look.mode === 'captured', null, 8000); }
  s = await state();
  check('Esc on the menu goes back to the game, the mouse captured (at once, or after one click)', resumed && back && s.playing && !s.menu, JSON.stringify(s));

  // ---- The browser takes the mouse away with no key (another window comes to the front) ----------------------
  await g(() => document.exitPointerLock());
  const paused = await until(() => !window.__hv.game.playing, null, 8000);
  s = await state();
  check('capture lost with no key pressed (another window in front): the game pauses on the menu', paused && s.menu && s.mode === 'off', JSON.stringify(s));
  // Left like that, nothing goes on moving: no key is held, nothing is being mined.
  check('and nothing is left held down', await g(() => { const gm = window.__hv.game; return gm.keys.size === 0 && !gm.mining.active; }));
  // A click on the picture while paused does not start play (only Play / Resume and Esc do).
  await frames(2);
  check('the game stays paused until Resume or Esc', !(await state()).playing);
} else {
  console.log('The browser here did not grant mouse capture, so nothing past this could be checked: see docs/PHASE9B.md, 4, for what to try by hand.');
}
check('no error on the page', errors.length === 0, errors.join(' | ').slice(0, 300));
await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
