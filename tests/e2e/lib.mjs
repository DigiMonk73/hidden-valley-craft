// Shared set-up for the play-through's parts (docs/PHASE6.md, 11). Each part starts its own browser on the
// served build, sets its own scene through window.__hv, and ends with finish(), which prints its checks.
// Needs the build served: npx vite preview --port 4173.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { execSync } from 'node:child_process';

export async function start(query = 'rd=4&hour=12') {
  const BASE = process.env.BASE || 'http://localhost:4173/';
  const results = [];
  const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };

  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  // DSF=0.25 draws a sixteenth of the pixels: software rendering then keeps up, and the game runs near real
  // time as it does on a fast machine (here it runs about ten times slower than the clock).
  const ctx = await browser.newContext({ viewport: { width: 800, height: 450 }, ...(process.env.DSF ? { deviceScaleFactor: Number(process.env.DSF) } : {}) });
  const page = await ctx.newPage();
  // HC=8 makes the page believe the machine has that many cores (the game starts up to six workers by it):
  // for reproducing what happens on a bigger machine than this one.
  if (process.env.HC) await page.addInitScript((n) => Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => n }), Number(process.env.HC));
  // NOAUDIO=1 takes Web Audio away from the page (the game then runs silent): for telling whether sound is what grows.
  if (process.env.NOAUDIO) await page.addInitScript(() => { delete window.AudioContext; delete window.webkitAudioContext; });
  // CPU=1 prints, every thirty seconds, where the page's main thread spent its time (self time by function;
  // build with `npx vite build --minify false` for readable names): for finding what blocks the page.
  if (process.env.CPU) {
    const prof = await ctx.newCDPSession(page);
    await prof.send('Profiler.enable');
    await prof.send('Profiler.setSamplingInterval', { interval: 5000 });
    await prof.send('Profiler.start');
    const t0 = Date.now();
    let busy = false;
    const timer = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        const { profile } = await prof.send('Profiler.stop');
        await prof.send('Profiler.start');
        const self = new Map(), dt = profile.timeDeltas ?? [], byId = new Map(profile.nodes.map((n) => [n.id, n]));
        (profile.samples ?? []).forEach((id, i) => { const f = byId.get(id).callFrame, k = `${f.functionName || '(anonymous)'} :${f.lineNumber}`; self.set(k, (self.get(k) ?? 0) + (dt[i] ?? 0)); });
        const top = [...self].sort((a, b) => b[1] - a[1]).slice(0, 9).map(([k, v]) => `${Math.round(v / 1000)} ms ${k}`);
        console.log(`CPU ${Math.round((Date.now() - t0) / 1000)}s main thread: ${top.join(' | ')}`);
      } catch { /* the page is gone */ }
      busy = false;
    }, 30_000);
    page.on('close', () => clearInterval(timer));
    page.on('crash', () => clearInterval(timer));
  }
  // The play-through does not capture the mouse (LOCK=1 does, to see it). Headless Chromium answers a pointer
  // lock with an endless stream of mouse moves that move nothing: 60,000 to 85,000 of them folded into every
  // frame's event, about 30 MB a second of the browser's own memory, and when a frame stalls, millions in one
  // event and a dead tab (the mid part's crash, docs/PHASE7.md). So the game is told capture is not allowed
  // and uses its free-look fallback, as it does in a sandboxed frame.
  if (!process.env.LOCK) await page.addInitScript(() => { Element.prototype.requestPointerLock = function () { return Promise.reject(new Error('no mouse capture in the play-through')); }; });
  const errors = [];
  page.on('crash', () => { errors.push('the page crashed'); console.log('FAIL the page crashed (the renderer died: memory?)'); });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  // MEM=1 watches the page's memory (for finding what grows; see README). Every ten seconds a line: the
  // processes' sizes, the main thread's heap and buffers, each worker's heap and buffers, and the counts of
  // everything that could pile up. Every thirty: the code that allocated most since, on the main thread and
  // in the workers (build with `npx vite build --minify false` to get readable names).
  if (process.env.MEM) {
    const cdp = await ctx.newCDPSession(page);
    const mb = (v) => Math.round((v ?? 0) / 1048576);
    const sampling = { samplingInterval: 65536, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true };
    await cdp.send('HeapProfiler.enable');
    await cdp.send('HeapProfiler.startSampling', sampling);
    // The workers are their own targets: talk to each through the page's session.
    const workers = new Map(); // sessionId → { waiting: Map<id, resolve> }
    let nextId = 1;
    const toWorker = (sessionId, method, params = {}) => new Promise((resolve) => {
      const id = nextId++, w = workers.get(sessionId);
      if (!w) return resolve(null);
      w.waiting.set(id, resolve);
      setTimeout(() => { if (w.waiting.delete(id)) resolve(null); }, 4000); // a worker deep in a job answers late
      cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) }).catch(() => resolve(null));
    });
    cdp.on('Target.attachedToTarget', ({ sessionId, targetInfo }) => {
      if (targetInfo.type !== 'worker') return;
      workers.set(sessionId, { waiting: new Map() });
      void toWorker(sessionId, 'HeapProfiler.enable').then(() => toWorker(sessionId, 'HeapProfiler.startSampling', sampling));
    });
    cdp.on('Target.detachedFromTarget', ({ sessionId }) => workers.delete(sessionId));
    cdp.on('Target.receivedMessageFromTarget', ({ sessionId, message }) => {
      const m = JSON.parse(message), w = workers.get(sessionId), r = w?.waiting.get(m.id);
      if (r) { w.waiting.delete(m.id); r(m.result ?? null); }
    });
    await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: false });
    const t0 = Date.now();
    let n = 0, busy = false;
    const seen = new Map(); // who → Map<site, bytes> at the last look
    const sites = (who, profile) => {
      if (!profile) return [];
      const by = new Map();
      const walk = (node) => { const f = node.callFrame, k = `${f.functionName || '(anonymous)'} :${f.lineNumber}`; by.set(k, (by.get(k) ?? 0) + node.selfSize); node.children.forEach(walk); };
      walk(profile.head);
      const before = seen.get(who) ?? new Map();
      seen.set(who, by);
      return [...by].map(([k, v]) => [k, v - (before.get(k) ?? 0)]).filter(([, v]) => v > 8e6);
    };
    const timer = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        const heap = await cdp.send('Runtime.getHeapUsage');
        const c = await page.evaluate(() => {
          const gm = window.__hv?.game;
          if (!gm) return null;
          const st = gm.streamer, info = gm.renderer.gl.info;
          return {
            creatures: gm.wild.creatures.length, arrows: gm.wild.arrows.length, columns: gm.world.columns.reduce((k, col) => k + (col ? 1 : 0), 0),
            pending: st.pendingCols.size, dirty: st.dirty.size, meshing: st.meshing.size, uploads: st.uploads.length, queued: gm.exec.queued,
            geometries: info.memory.geometries, textures: info.memory.textures, sceneKids: gm.renderer.scene.children.length,
            dom: document.getElementsByTagName('*').length, time: Math.round(gm.time * 10) / 10,
          };
        }).catch(() => null);
        const ids = [...workers.keys()];
        const wh = await Promise.all(ids.map((id) => toWorker(id, 'Runtime.getHeapUsage')));
        let rss = '';
        try { rss = execSync("ps -eo rss,args --sort=-rss | grep -E 'type=(renderer|gpu-process)' | grep -v grep | awk '{printf \"%s%d \", ($0 ~ /gpu-process/ ? \"gpu \" : \"renderer \"), $1/1024}'").toString().trim(); } catch { /* no ps */ }
        console.log(`MEM ${Math.round((Date.now() - t0) / 1000)}s rss MB [${rss}] main: heap ${mb(heap.usedSize)}/${mb(heap.totalSize)}, buffers ${mb(heap.backingStorageSize)}, embedder ${mb(heap.embedderHeapUsedSize)}; workers heap/total+buffers: [${wh.map((h) => (h ? `${mb(h.usedSize)}/${mb(h.totalSize)}+${mb(h.backingStorageSize)}` : 'busy')).join(' ')}] ${JSON.stringify(c)}`);
        if (++n % 3 === 0) {
          // Where the bytes were allocated since the last look (collected or not), by function.
          const main = sites('main', (await cdp.send('HeapProfiler.getSamplingProfile')).profile).map(([k, v]) => [`main ${k}`, v]);
          const ws = new Map();
          for (const id of ids) for (const [k, v] of sites(id, (await toWorker(id, 'HeapProfiler.getSamplingProfile'))?.profile)) ws.set(`workers ${k}`, (ws.get(`workers ${k}`) ?? 0) + v);
          const top = [...main, ...ws].sort((a, b) => b[1] - a[1]).slice(0, 10);
          console.log(`MEM allocated in the last 30 s: ${top.map(([k, v]) => `${mb(v)} MB ${k}`).join(' | ') || 'nothing over 8 MB'}`);
        }
      } catch { /* the page is busy or gone */ }
      busy = false;
    }, 10_000);
    page.on('close', () => clearInterval(timer));
    page.on('crash', () => clearInterval(timer));
  }

  const idle = () => page.waitForFunction(() => window.__hv && window.__hv.idle(), null, { timeout: 180_000, polling: 300 });
  const g = (fn, arg) => page.evaluate(fn, arg);

  await page.goto(`${BASE}?${query}`);
  await idle();
  check('loads and becomes ready', true);
  await page.getByRole('button', { name: 'Play' }).click();
  await page.waitForTimeout(1200);
  const mode = await g(() => window.__hv.game.look.mode);
  check('play starts (mouse captured or free-look fallback)', mode === 'captured' || mode === 'free', `look mode: ${mode}`);
  // With nobody touching the mouse the page must hear nothing from it, and the view must not turn.
  const quiet = await g(() => new Promise((res) => {
    const gm = window.__hv.game, yaw = gm.player.yaw;
    let moves = 0, folded = 0;
    const h = (e) => { moves++; folded = Math.max(folded, e.getCoalescedEvents?.().length ?? 0); };
    window.addEventListener('pointermove', h, true);
    setTimeout(() => { window.removeEventListener('pointermove', h, true); res({ moves, mostFoldedIntoOne: folded, turned: Math.abs(gm.player.yaw - yaw) > 1e-6 }); }, 3000);
  }));
  check('the mouse left alone, the page hears nothing from it and the view does not turn (a captured mouse floods a headless page with moves)', quiet.moves === 0 && !quiet.turned, JSON.stringify(quiet));

  // Keeps the mouse captured: a click that only re-captures it is not a click on anything.
  const ensureLook = async () => {
    if (await g(() => window.__hv.game.look.mode === 'off')) {
      await page.mouse.click(400, 225);
      await page.waitForFunction(() => window.__hv.game.look.mode !== 'off', null, { timeout: 10_000 }).catch(() => {});
    }
  };
  // Holds breath and health up while the scene is set by hand (software rendering is slow).
  const keepAlive = () => g(() => { const gm = window.__hv.game; gm.player.breath = 20; gm.vitals.hp = 100; });
  // ---- Phase 4: Zone-1's near band ---------------------------------------------------------------
  // A right-click on whatever `ready` says is in front, with the view held still while it lands.
  const useAt = async (setup, ready, arg) => {
    await ensureLook();
    await keepAlive();
    await g(setup, arg);
    await page.waitForFunction(([r, a]) => { const gm = window.__hv.game; return (0, eval)(r)(gm, a); }, [ready.toString(), arg], { timeout: 60_000, polling: 150 }).catch(() => {});
    await g(() => {
      window.__aimLock = true;
      if (!window.__aimHook) { window.__aimHook = true; window.addEventListener('mousemove', (e) => { if (window.__aimLock) e.stopImmediatePropagation(); }, true); }
    });
    await page.mouse.click(400, 225, { button: 'right' });
    await g(() => { window.__aimLock = false; });
    await page.waitForTimeout(500);
  };
  // Closes an open screen (Escape with none open would open the pause menu instead).
  const closeScreens = async () => {
    if (await g(() => window.__hv.game.screen.isOpen || window.__hv.game.paper.isOpen)) await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  };
  const walkWest = async (x0, z, untilX) => {
    await ensureLook();
    await g(([x0, z]) => { const gm = window.__hv.game; gm.hour = 11; gm.player.flying = false; gm.player.setPosition(x0, 125, z); gm.player.yaw = Math.PI / 2; gm.player.pitch = 0; }, [x0, z]);
    await page.waitForFunction(() => window.__hv.idle() && window.__hv.game.player.onGround, null, { timeout: 120_000, polling: 300 }).catch(() => {});
    await keepAlive();
    await page.keyboard.down('KeyW');
    await page.waitForFunction((x) => { const p = window.__hv.game.player; p.yaw = Math.PI / 2; p.pitch = 0; return p.x < x; }, untilX, { timeout: 90_000, polling: 100 }).catch(() => {});
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(1300); // the places are checked once a second
  };
  const P = await g(() => JSON.parse(JSON.stringify(window.__hv.places)));
  const flags = () => g(() => [...window.__hv.game.flags]);
  // Spawning is on here (not test mode): the outpost's raiders take their posts when the player comes near.
  // Software rendering runs the game several times slower than the clock, so every wait is for a condition,
  // with a long limit.
  const LONG = 300_000;
  const groundY = (x, z) => g(([x, z]) => { const w = window.__hv.game.world; let y = 150; while (y > 30 && w.blockAt(Math.floor(x), y - 1, Math.floor(z)) === 0) y--; return y; }, [x, z]);
  /** Puts the player on the ground at (x, z), flying while the land loads so they never fall into it (or are seen falling). */
  const standAt = async (x, z, yaw, pitch = 0) => {
    await ensureLook();
    await g(([x, z]) => { const gm = window.__hv.game; gm.hour = 11; gm.player.flying = true; gm.player.setPosition(x, 150, z); }, [x, z]);
    await page.waitForFunction(() => window.__hv.idle(), null, { timeout: LONG, polling: 300 }).catch(() => {});
    const y = await groundY(x, z);
    await g(([x, y, z, yaw, pitch]) => { const gm = window.__hv.game; gm.player.setPosition(x, y, z); gm.player.flying = false; gm.player.yaw = yaw; gm.player.pitch = pitch; gm.vitals.hp = 100; }, [x, y, z, yaw, pitch]);
    await page.waitForTimeout(300);
  };
  const walkTo = async (yaw, done, arg) => {
    await page.keyboard.down('KeyW');
    const ok = await page.waitForFunction(([yaw, d, a]) => { const gm = window.__hv.game, p = gm.player; p.yaw = yaw; p.pitch = 0; gm.vitals.hp = Math.max(gm.vitals.hp, 60); return (0, eval)(d)(p, a); }, [yaw, done.toString(), arg], { timeout: LONG, polling: 100 }).then(() => true, () => false);
    await page.keyboard.up('KeyW');
    return ok;
  };
  const waitFlag = (flag) => page.waitForFunction((f) => window.__hv.game.flags.has(f), flag, { timeout: LONG, polling: 250 }).then(() => true, () => false);
  const aimAt = (kind) => g((k) => {
    const gm = window.__hv.game, p = gm.player, c = gm.wild.creatures.find((o) => o.kind === k);
    if (!c) return false;
    const dx = c.x - p.x, dz = c.z - p.z;
    p.yaw = Math.atan2(-dx, -dz); p.pitch = -Math.atan2(p.eyeY - (c.y + 1.2), Math.hypot(dx, dz));
    return true;
  }, kind);
  const hold = (name) => g((n) => { const h = window.__hv.game.hotbar, id = window.__hv.itemId(n); let k = h.slots.findIndex((s) => s && s.id === id); if (k < 0 || k > 8) { h.slots[7] = { id, count: 1 }; k = 7; } h.selected = k; }, name);

  const raiders = () => g(() => window.__hv.game.wild.creatures.filter((c) => ['lookout', 'gunman', 'rusher'].includes(c.kind)).map((c) => `${c.kind}:${c.mind}`));

  const finish = async () => {
    check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    await browser.close();
    const failed = results.filter((r) => !r.ok).length;
    console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
    console.log(`CHECKS ${results.length - failed}/${results.length}`);
    process.exit(failed ? 1 : 0);
  };

  return { page, g, check, idle, errors, ensureLook, keepAlive, useAt, closeScreens, walkWest, P, flags, LONG, groundY, standAt, walkTo, waitFlag, aimAt, hold, raiders, finish };
}
