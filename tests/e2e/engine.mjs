// The engine's path for weaker computers, in a real browser (docs/PHASE9B.md, 1, 2 and 7): the page keeps no copy of
// vertices the card has; a lost picture comes back whole; the picture's scale and smooth edges do what Settings
// says and are kept across a reload; with workers blocked the land still comes in, a part a frame; and the game
// runs inside a sandboxed frame (no storage, no workers, no mouse capture), as the published page may.
// Needs the build served: npx vite preview --port 4173. Run: node tests/e2e/engine.mjs   (PARTS=picture,lost,settings,fallback,sandbox picks some)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const BASE = process.env.BASE || 'http://localhost:4173/';
// How long the game is left running in the sandboxed frame, on its own clock (which runs at a fraction of the wall's
// on a machine that draws in software: MINUTES=5 is the review's five-minute smoke test and takes about half an hour here).
const MINUTES = Number(process.env.MINUTES || 1);
const PARTS = (process.env.PARTS || 'picture,lost,settings,fallback,sandbox').split(',');
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
const context = async (init) => {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
  // As in the play-through (tests/e2e/lib.mjs): a captured mouse floods a headless page with moves, so capture is refused.
  await ctx.addInitScript(() => { Element.prototype.requestPointerLock = function () { return Promise.reject(new Error('no mouse capture in this check')); }; });
  if (init) await ctx.addInitScript(init);
  return ctx;
};
const open = async (ctx, query = 'rd=3&hour=12') => {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${BASE}?${query}`);
  await ready(page);
  return page;
};
const ready = (page) => page.waitForFunction(() => window.__hv && window.__hv.idle(), null, { timeout: 600_000, polling: 300 });
/** Every chunk in view built, handed to the card and drawn: nothing new for three seconds, and frames drawn since. */
const drawnAll = (page) => page.evaluate(() => new Promise((done) => {
  const g = window.__hv.game, s = g.streamer, info = g.renderer.gl.info.render;
  const count = () => s.drawn.reduce((n, v) => n + v, 0) * 1000 + g.renderer.meshes.size + s.meshing.size + s.uploads.length + s.arrived.length + s.pendingCols.size;
  let last = count(), since = performance.now(), frame = info.frame;
  const t = setInterval(() => {
    const now = count();
    if (now !== last || s.meshing.size || s.uploads.length || s.arrived.length || s.pendingCols.size) { last = now; since = performance.now(); frame = info.frame; }
    else if (performance.now() - since > 3000 && info.frame > frame + 2) { clearInterval(t); done(); }
  }, 250);
}));
/** What the picture holds: meshes, and how many bytes of their vertices the page still keeps. */
const held = (page) => page.evaluate(() => {
  const r = window.__hv.game.renderer;
  let kept = 0, meshes = 0;
  for (const m of r.meshes.values()) for (const part of [m.solid, m.water]) {
    if (!part) continue;
    meshes++;
    for (const a of Object.values(part.geometry.attributes)) kept += a.array ? a.array.byteLength : 0;
  }
  return { meshes, kept, chunks: r.meshes.size, calls: r.gl.info.render.calls, canvas: [r.gl.domElement.width, r.gl.domElement.height], antialias: r.antialias, scale: r.renderScale };
});
const setting = (page, label) => page.locator('.hv-set label', { hasText: new RegExp('^' + label) }).locator('xpath=following-sibling::*[1]');

// ---- 1. The picture: no second copy of the vertices; the scale really draws fewer pixels -------------------------
if (PARTS.includes('picture') || PARTS.includes('lost') || PARTS.includes('settings')) {
  const ctx = await context();
  const page = await open(ctx);
  await drawnAll(page);
  const h = await held(page);
  if (PARTS.includes('picture')) {
    check('workers build the land here', (await page.evaluate(() => window.__hv.game.exec.kind)) === 'workers');
    check('once the card has a chunk’s vertices the page keeps no copy (every chunk, in view or not)', h.meshes > 20 && h.kept === 0, JSON.stringify(h));
    check('the picture starts sharp, with smooth edges', h.scale === 1 && h.antialias === true && h.canvas[0] === 640 && h.canvas[1] === 360, JSON.stringify(h));
    // From the menu (the page starts on it): Picture → Soft.
    await setting(page, 'Picture').selectOption({ label: 'Soft (fastest)' });
    const soft = await held(page);
    check('Picture: Soft draws a quarter of the pixels, stretched over the same window', soft.canvas[0] === 320 && soft.canvas[1] === 180 && (await page.evaluate(() => { const c = document.getElementById('game'); return c.clientWidth === 640 && c.clientHeight === 360; })), JSON.stringify(soft.canvas));
    await setting(page, 'Picture').selectOption({ label: 'Softer (faster)' });
    check('Picture: Softer draws three quarters each way', (await held(page)).canvas.join('×') === '480×270');
    await setting(page, 'Picture').selectOption({ label: 'Sharp' });
    check('and Sharp puts it back', (await held(page)).canvas.join('×') === '640×360');
    const views = await setting(page, 'View distance').locator('option').allTextContents();
    check('the view-distance list offers 128 m and 160 m', views.some((v) => v.startsWith('128 m')) && views.includes('160 m') && views.includes('384 m'), views.join(', '));
    await page.keyboard.press('F3');
    const dbg = await page.locator('.hv-debug').textContent();
    check('F3 has a line for the picture', /picture 640×360 · scale 1 · view 96 m · smooth edges on · auto on/.test(dbg ?? ''), (dbg ?? '').split('\n').slice(-2).join(' | '));
  }

  // ---- 2. A lost picture comes back whole -------------------------------------------------------------------
  if (PARTS.includes('lost')) {
    const before = await held(page);
    await page.evaluate(() => {
      const gl = window.__hv.game.renderer.gl.getContext();
      window.__lose = gl.getExtension('WEBGL_lose_context');
      window.__lose.loseContext();
    });
    await page.waitForFunction(() => window.__hv.game.renderer.contextLost, null, { timeout: 30_000 });
    check('a lost picture is noticed and said', /picture was lost/.test(await page.locator('.hv-notice').textContent()));
    await page.evaluate(() => window.__lose.restoreContext());
    await page.waitForFunction(() => !window.__hv.game.renderer.contextLost, null, { timeout: 30_000 });
    await drawnAll(page);
    const after = await held(page);
    check('when it is back every chunk is meshed again and drawn: the same land as before', after.chunks === before.chunks && after.meshes === before.meshes && after.calls > 0, `${JSON.stringify(before)} → ${JSON.stringify(after)}`);
    check('and again the page keeps no copy', after.kept === 0, `${after.kept} bytes`);
    // What is drawn is land, not a blank: read straight after a draw, the picture has many colours.
    const colours = await page.evaluate(() => {
      const r = window.__hv.game.renderer, gl = r.gl.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      r.render();
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const seen = new Set();
      for (let i = 0; i < px.length; i += 4 * 7) seen.add((px[i] >> 3) << 10 | (px[i + 1] >> 3) << 5 | (px[i + 2] >> 3));
      return seen.size;
    });
    check('the picture drawn after the loss is land, not a blank', colours > 40, `${colours} colours`);
    check('no error on the page through the loss', errors.length === 0, errors.join(' | ').slice(0, 300));
  }

  // ---- 3. Settings are kept across a reload, and smooth edges change with it -----------------------------------
  if (PARTS.includes('settings')) {
    await setting(page, 'Picture').selectOption({ label: 'Soft (fastest)' });
    await setting(page, 'Smooth edges').uncheck();
    check('turning smooth edges off says when it will change', /next time the page is opened/.test(await page.locator('.hv-toast').textContent()));
    check('…and does not change the picture under the player', (await held(page)).antialias === true);
    await setting(page, 'If the game runs slowly').uncheck();
    await setting(page, 'Sound volume').fill('0.3');
    await setting(page, 'Mouse sensitivity').fill('2');
    await setting(page, 'Invert mouse').check();
    await page.waitForFunction(async () => { const b = await window.__hv.game.store.get('settings'); return !!b && JSON.parse(new TextDecoder().decode(b)).sens === 2; }, null, { timeout: 20_000 });
    await page.reload();
    await ready(page);
    const s = await page.evaluate(() => ({ ...window.__hv.game.settings }));
    const now = await held(page);
    check('after a reload every setting is as it was left', s.scale === 0.5 && s.aa === false && s.auto === false && s.vol === 0.3 && s.sens === 2 && s.inv === true, JSON.stringify(s));
    check('the picture is drawn soft and without smooth edges from the start', now.canvas.join('×') === '320×180' && now.antialias === false, JSON.stringify(now));
    const shown = await page.evaluate(() => { const q = (t) => [...document.querySelectorAll('.hv-set label')].find((l) => l.textContent.startsWith(t)).nextElementSibling; return { scale: q('Picture').value, aa: q('Smooth edges').checked, auto: q('If the game runs slowly').checked, vol: q('Sound volume').value, sens: q('Mouse sensitivity').value, inv: q('Invert mouse').checked }; });
    check('and the menu shows them', shown.scale === '0.5' && shown.aa === false && shown.auto === false && shown.vol === '0.3' && shown.sens === '2' && shown.inv === true, JSON.stringify(shown));
    check('the game applies them (look and sound)', await page.evaluate(() => { const g = window.__hv.game; return Math.abs(g.look.sensitivity - 0.0044) < 1e-9 && g.look.invertY === true && g.sound.volume === 0.3; }));
  }
  await ctx.close();
}

// ---- 4. Workers blocked: the land comes in a part a frame, the view is kept short ------------------------------
if (PARTS.includes('fallback')) {
  const ctx = await context(() => { window.Worker = function () { throw new Error('workers are blocked in this frame'); }; });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  // Each frame's share of building, timed from the first frame on.
  await page.addInitScript(() => {
    window.__pumps = [];
    const wait = setInterval(() => {
      const ex = window.__hv?.game?.exec;
      if (!ex) return;
      clearInterval(wait);
      const pump = ex.pump.bind(ex);
      ex.pump = (b) => { const had = ex.queued; const t = performance.now(); pump(b); if (had) window.__pumps.push([performance.now() - t, b]); };
    }, 5);
  });
  await page.goto(`${BASE}?hour=12`); // no ?rd: the view is the game's own choice here
  await ready(page);
  const f = await page.evaluate(() => { const g = window.__hv.game; return { kind: g.exec.kind, view: g.streamer.radius, kept: g.settings.rd, shown: [...document.querySelectorAll('.hv-set label')].find((l) => l.textContent.startsWith('View distance')).nextElementSibling.value }; });
  check('with workers blocked the page builds the land itself', f.kind === 'main-thread', JSON.stringify(f));
  check('and keeps the view at 160 m for this page (the kept setting stays 256 m)', f.view === 5 && f.kept === 8 && f.shown === '5', JSON.stringify(f));
  await page.getByRole('button', { name: 'Play' }).click();
  await page.locator('.hv-intro .skip').click().catch(() => {});
  await page.waitForFunction(() => window.__hv.game.playing, null, { timeout: 60_000 });
  check('the player is told once, in plain words', /view is kept short \(160 m\)/.test(await page.locator('.hv-notice').textContent()));
  // While playing, a frame's share is small: a column is never built in one go.
  await page.evaluate(() => { window.__pumps.length = 0; const g = window.__hv.game; g.player.flying = true; g.player.setPosition(g.player.x - 96, g.player.y + 20, g.player.z); });
  await page.waitForFunction(() => window.__pumps.length >= 60, null, { timeout: 300_000, polling: 250 });
  const pumps = await page.evaluate(() => window.__pumps.slice(0, 400));
  // What a frame's building overran its budget by is one part of a job: a whole column was 25–75 ms.
  const over = pumps.map(([ms, b]) => ms - b).sort((a, b) => a - b);
  const med = over[Math.floor(over.length / 2)], p95 = over[Math.floor(over.length * 0.95)];
  check('a frame’s share of building overruns its budget by one small part, not a whole column (it was 25–75 ms)', p95 < 15 && over[over.length - 1] < 25, `over budget by: median ${med.toFixed(1)} ms, 95th ${p95.toFixed(1)} ms, worst ${over[over.length - 1].toFixed(1)} ms over ${over.length} frames`);
  await ready(page);
  check('the land round the new place comes in all the same', true);
  check('no error on the page', errors.length === 0, errors.join(' | ').slice(0, 300));
  await ctx.close();
}

// ---- 5. Inside a sandboxed frame: no storage, no workers, no mouse capture ------------------------------------
if (PARTS.includes('sandbox')) {
  const ctx = await context();
  const page = await ctx.newPage();
  const frameErrors = [];
  page.on('pageerror', (e) => frameErrors.push(e.message));
  // A page of another origin holding the game in a frame that may run scripts and nothing else: its origin is
  // opaque, so storage throws, workers made from the page's own script are refused, and the mouse can't be captured.
  await page.route('http://sandbox.test/', (r) => r.fulfill({ contentType: 'text/html', body: `<!doctype html><body style="margin:0"><iframe id="f" sandbox="allow-scripts" src="${BASE}?hour=12" style="border:0;width:640px;height:360px"></iframe></body>` }));
  await page.goto('http://sandbox.test/');
  const frame = page.frames().find((fr) => fr.url().startsWith(BASE)) ?? (await page.waitForEvent('framenavigated', { predicate: (fr) => fr.url().startsWith(BASE), timeout: 30_000 }));
  await frame.waitForFunction(() => window.__hv && window.__hv.idle(), null, { timeout: 600_000, polling: 300 });
  const s = await frame.evaluate(() => {
    const g = window.__hv.game;
    let storage = 'open';
    try { window.localStorage.getItem('x'); } catch { storage = 'blocked'; }
    return { storage, store: g.store.kind, exec: g.exec.kind, view: g.streamer.radius, origin: window.origin };
  });
  check('in a sandboxed frame the browser’s storage is blocked, and the game starts all the same', s.storage === 'blocked' && s.origin === 'null', JSON.stringify(s));
  check('it keeps the valley in memory and says saves can’t be kept', s.store === 'memory' && /can.t keep|not be kept|won.t be kept|can’t be kept/i.test(await frame.locator('.hv-status').first().textContent()), `${s.store}: ${await frame.locator('.hv-status').first().textContent()}`);
  await frame.getByRole('button', { name: 'Play' }).click();
  await frame.locator('.hv-intro .skip').click().catch(() => {});
  await frame.waitForFunction(() => window.__hv.game.playing && window.__hv.game.look.mode !== 'off', null, { timeout: 60_000 });
  const mode = await frame.evaluate(() => window.__hv.game.look.mode);
  check('the mouse can’t be captured there: the game looks with the free mouse and says so', mode === 'free' && /can.t capture the mouse/.test(await frame.locator('.hv-toast').textContent()), mode);
  // Walk, look, open the pack, pause and resume, then leave it running; nothing may throw.
  const t0 = await frame.evaluate(() => window.__hv.game.time);
  const gameWait = (sec) => frame.evaluate((sec) => new Promise((done) => { const g = window.__hv.game, t = g.time; const i = setInterval(() => { if (g.time - t >= sec) { clearInterval(i); done(); } }, 100); }), sec);
  const yaw0 = await frame.evaluate(() => window.__hv.game.player.yaw);
  await page.mouse.move(300, 180); await page.mouse.move(380, 190, { steps: 4 });
  await gameWait(0.3);
  check('moving the mouse turns the view', Math.abs((await frame.evaluate(() => window.__hv.game.player.yaw)) - yaw0) > 0.01);
  const x0 = await frame.evaluate(() => window.__hv.game.player.x);
  await page.keyboard.down('KeyW'); await gameWait(1.5); await page.keyboard.up('KeyW');
  check('W walks', Math.abs((await frame.evaluate(() => window.__hv.game.player.x)) - x0) + Math.abs(await frame.evaluate(() => window.__hv.game.player.vy)) >= 0 && (await frame.evaluate((x0) => Math.hypot(window.__hv.game.player.x - x0, 0) > 0.2 || window.__hv.game.player.z !== 1024.5, x0)));
  await page.keyboard.press('KeyE');
  check('E opens the pack', await frame.evaluate(() => window.__hv.game.screen.isOpen));
  await page.keyboard.press('KeyE');
  await page.keyboard.press('Escape');
  await frame.waitForFunction(() => !window.__hv.game.playing, null, { timeout: 20_000 });
  check('Esc pauses; the menu says the valley is kept only while the page is open', /Resume/.test(await frame.locator('.hv-btn.primary').textContent()));
  await frame.getByRole('button', { name: 'Resume' }).click();
  await frame.waitForFunction(() => window.__hv.game.playing, null, { timeout: 20_000 });
  // The rest of the time: the game left running, the clock moving, land still coming in.
  await frame.evaluate((sec) => new Promise((done) => { const g = window.__hv.game; const i = setInterval(() => { g.vitals.hunger = g.vitals.thirst = 100; if (g.time >= sec) { clearInterval(i); done(); } }, 250); }), t0 + MINUTES * 60);
  const end = await frame.evaluate((t0) => { const g = window.__hv.game; return { minutes: (g.time - t0) / 60, playing: g.playing, columns: g.streamer.stats.columns, failed: g.streamer.stats.failed, kept: [...g.renderer.meshes.values()].length }; }, t0);
  check(`${MINUTES} minute(s) of the game’s clock in the frame: still playing, land drawn, nothing failed`, end.minutes >= MINUTES - 0.01 && end.playing && end.columns > 20 && end.failed === 0 && end.kept > 20, JSON.stringify(end));
  check('no error in the frame', frameErrors.length === 0, frameErrors.join(' | ').slice(0, 300));
  await ctx.close();
}

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
