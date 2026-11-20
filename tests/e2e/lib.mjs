// Shared set-up for the play-through's parts (docs/PHASE6.md, 11). Each part starts its own browser on the
// served build, sets its own scene through window.__hv, and ends with finish(), which prints its checks.
// Needs the build served: npx vite preview --port 4173.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

export async function start(query = 'rd=4&hour=12') {
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

  await page.goto(`${BASE}?${query}`);
  await idle();
  check('loads and becomes ready', true);
  await page.getByRole('button', { name: 'Play' }).click();
  // A new valley opens with a few short cards (docs/FIXES.md, 7): the first says who you are; "Skip" ends them.
  const opening = await page.locator('.hv-intro .card p').first().textContent({ timeout: 5000 }).catch(() => null);
  check('a new valley opens with a short card saying who you are, and it can be skipped', /engineer/.test(opening ?? '') && (opening ?? '').length < 220, (opening ?? 'no card').replace(/\n/g, ' '));
  await page.locator('.hv-intro .skip').click().catch(() => {});
  await page.waitForTimeout(1200);
  // You arrive hungry and thirsty (the first lesson is to eat and drink; part 1 checks eating). The scenes these
  // parts set by hand assume a fed player, as before.
  await page.evaluate(() => { const v = window.__hv.game.vitals; v.hunger = 100; v.thirst = 100; });
  const mode = await g(() => window.__hv.game.look.mode);
  check('play starts (mouse captured or free-look fallback)', mode === 'captured' || mode === 'free', `look mode: ${mode}`);

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
