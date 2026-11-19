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
// Software rendering is slow, so game time runs behind the clock here: walk until moved or 30 s.
await page.waitForFunction((x) => window.__hv.game.player.x - x > 2.5, x0, { timeout: 30_000, polling: 200 }).catch(() => {});
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
// Hold the right tool for it (an axe for planks, a pickaxe for stone), as a player would.
await g((id) => { const k = window.__hv.bestTool(id); if (k >= 0) window.__hv.game.hotbar.selected = k; }, target.id);
// Software rendering is slow, so game time runs behind the clock here: wait for the result.
await page.waitForFunction((t) => window.__hv.game.world.blockAt(t.x, t.y, t.z) === 0, target, { timeout: 30_000 }).catch(() => {});
await page.mouse.up();
const after = await g((t) => window.__hv.game.world.blockAt(t.x, t.y, t.z), target);
check('mining removes the block', after === 0, `block now ${after}`);
const gained = await g((id) => window.__hv.game.hotbar.slots.some((s) => s && s.id === id && s.count === 1), target.id);
check('the mined block goes into the hotbar', gained);

// Place it back: right click uses the selected block (the one just mined) somewhere in front.
await g((id) => { const h = window.__hv.game.hotbar; h.selected = h.slots.findIndex((s) => s && s.id === id && s.count === 1); }, target.id);
// Count only edits to this block: the garden's crops grow (and so change blocks) meanwhile.
const editsBefore = await g((id) => [...window.__hv.game.world.edits.values()].reduce((n, m) => n + [...m.values()].filter((v) => v === id).length, 0), target.id);
await page.mouse.click(400, 225, { button: 'right' });
await page.waitForFunction((id) => !window.__hv.game.hotbar.slots.some((s) => s && s.id === id && s.count === 1), target.id, { timeout: 20_000 }).catch(() => {});
const editsAfter = await g((id) => [...window.__hv.game.world.edits.values()].reduce((n, m) => n + [...m.values()].filter((v) => v === id).length, 0), target.id);
check('right click places the selected block', editsAfter === editsBefore + 1, `placed blocks ${editsBefore} → ${editsAfter}`);

// The inventory opens with E and closes with E.
await page.keyboard.press('KeyE');
await page.waitForTimeout(300);
check('E opens the inventory', await page.locator('.iv-wrap').isVisible());
await page.keyboard.press('KeyE');
await page.waitForTimeout(300);
check('E closes it again', !(await page.locator('.iv-wrap').isVisible()));

// Walk to the vault's armory chest and open it: the builder's rifle is there.
await g(() => { const p = window.__hv.game.player; p.setPosition(1830.5, 82, 1022.5); p.yaw = -Math.PI / 2; p.pitch = -0.6; });
await page.waitForFunction(() => { const t = window.__hv.game.target; return t && t.x === 1832 && t.z === 1022; }, null, { timeout: 30_000, polling: 200 }).catch(() => {});
await page.mouse.click(400, 225, { button: 'right' });
await page.waitForTimeout(500);
const armory = await page.locator('.iv-title').first().textContent().catch(() => null);
check('right-clicking a chest opens it', armory === 'Armory', `title: ${armory}`);
await page.screenshot({ path: 'out/armory.png' });
// Shift-click the rifle into the backpack.
await page.locator('.iv-grid').first().locator('.iv-slot').first().click({ modifiers: ['Shift'] });
const hasRifle = await g(() => window.__hv.game.hotbar.slots.some((s) => s && s.id === window.__hv.rifleId));
await page.keyboard.press('Escape');
check('Shift-click takes the rifle', hasRifle);

// Read the journal at the bookshelves, then open the vault safe with the code it gives.
await page.mouse.click(400, 225);
await page.waitForFunction(() => window.__hv.game.look.mode !== 'off', null, { timeout: 10_000 }).catch(() => {});
await g(() => { const p = window.__hv.game.player; p.setPosition(1812.5, 82, 1029.5); p.yaw = -Math.PI / 2; p.pitch = -0.1; });
await page.waitForFunction(() => { const t = window.__hv.game.target; return t && t.x === 1814; }, null, { timeout: 30_000, polling: 200 }).catch(() => {});
await page.mouse.click(400, 225, { button: 'right' });
await page.waitForTimeout(400);
const journal = await page.locator('.pp-panel').textContent().catch(() => '');
check('the bookshelf opens the builder’s journal', /builder's journal/i.test(journal ?? ''), (journal ?? '').slice(0, 60));
await page.keyboard.press('KeyE');
await page.mouse.click(400, 225);
await page.waitForFunction(() => window.__hv.game.look.mode !== 'off', null, { timeout: 10_000 }).catch(() => {});
await g(() => { const p = window.__hv.game.player; p.setPosition(1829.5, 82, 1024.5); p.yaw = Math.PI; p.pitch = -0.15; });
await page.waitForFunction(() => { const t = window.__hv.game.target; return t && t.x === 1829 && t.z === 1027; }, null, { timeout: 30_000, polling: 200 }).catch(() => {});
await page.mouse.click(400, 225, { button: 'right' });
await page.waitForTimeout(400);
for (const k of ['0', '6', '1', '8', '✓']) await page.locator('.pp-keypad button', { hasText: k }).first().click();
await page.waitForTimeout(300);
const opened = await g(() => window.__hv.game.flags.has('safe_open'));
check('the code from the journal opens the safe', opened);

// Sleep in the bed at night: morning comes, and the garden has grown.
await page.mouse.click(400, 225);
await page.waitForFunction(() => window.__hv.game.look.mode !== 'off', null, { timeout: 10_000 }).catch(() => {});
await g(() => { const gm = window.__hv.game; gm.hour = 21; gm.player.setPosition(1811.5, 82, 1019.5); gm.player.yaw = -Math.PI / 2; gm.player.pitch = -0.35; });
const gardenBefore = await g(() => window.__hv.gardenStages());
// Headless pointer lock can drop between steps; a click that only re-captures the mouse is not a
// right-click on the bed. So: make sure the mouse is held, aim, click, and try again if night stays.
let sleepTry = '';
for (let attempt = 0; attempt < 3; attempt++) {
  if (await g(() => window.__hv.game.look.mode === 'off')) {
    await page.mouse.click(400, 225);
    await page.waitForFunction(() => window.__hv.game.look.mode !== 'off', null, { timeout: 10_000 }).catch(() => {});
  }
  await g(() => { const gm = window.__hv.game; gm.hour = 21; gm.player.setPosition(1811.5, 82, 1019.5); gm.player.yaw = -Math.PI / 2; gm.player.pitch = -0.35; });
  await page.waitForFunction(() => { const t = window.__hv.game.target; return t && t.x === 1813 && t.z === 1019; }, null, { timeout: 30_000, polling: 200 }).catch(() => {});
  sleepTry = await g(() => JSON.stringify({ target: window.__hv.game.target && [window.__hv.game.target.x, window.__hv.game.target.y, window.__hv.game.target.z], look: window.__hv.game.look.mode }));
  await page.mouse.click(400, 225, { button: 'right' });
  const slept = await page.waitForFunction(() => window.__hv.game.hour < 7, null, { timeout: 3_000 }).then(() => true, () => false);
  if (slept) break;
  console.log(`  (sleep attempt ${attempt + 1} did not take: ${sleepTry})`);
}
const morning = await g(() => ({ hour: window.__hv.game.hour, stages: window.__hv.gardenStages() }));
check('sleeping in the bed brings morning', Math.abs(morning.hour - 6) < 0.2, `hour ${morning.hour.toFixed(2)}`);
check('the garden grows overnight', morning.stages > gardenBefore, `crop stages ${gardenBefore} → ${morning.stages}`);

// Eat from the hotbar: the builder's tinned food (slot 5 at the start).
// (Closing the chest with Esc can't recapture the mouse, so a click comes first, as a player would.)
await page.mouse.click(400, 225);
await page.waitForFunction(() => window.__hv.game.look.mode !== 'off', null, { timeout: 10_000 }).catch(() => {});
await g(() => { const gm = window.__hv.game; gm.vitals.hunger = 50; gm.hotbar.selected = 4; gm.player.setPosition(1808.5, 82, 1024.5); gm.player.pitch = 1.2; });
// Wait until what is in front is the rock overhead (nothing that opens: not the bed still targeted
// from sleeping, not a chest), so the click eats.
await page.waitForFunction(() => { const gm = window.__hv.game, t = gm.target; gm.player.pitch = 1.2; return !!t && t.y >= 86 && !gm.world.containerAt(t.x, t.y, t.z); }, null, { timeout: 30_000, polling: 200 }).catch(() => {});
await page.mouse.click(400, 225, { button: 'right' });
await page.waitForFunction(() => window.__hv.game.vitals.hunger > 70, null, { timeout: 10_000 }).catch(() => {});
const hunger = await g(() => window.__hv.game.vitals.hunger);
check('eating fills hunger', hunger > 70, `hunger ${hunger.toFixed(0)}`);

// ---- Phase 3: the way out ----------------------------------------------------------------------
// Keeps the mouse captured: a click that only re-captures it is not a click on anything.
const ensureLook = async () => {
  if (await g(() => window.__hv.game.look.mode === 'off')) {
    await page.mouse.click(400, 225);
    await page.waitForFunction(() => window.__hv.game.look.mode !== 'off', null, { timeout: 10_000 }).catch(() => {});
  }
};
// Holds breath and health up while the scene is set by hand (software rendering is slow).
const keepAlive = () => g(() => { const gm = window.__hv.game; gm.player.breath = 20; gm.vitals.hp = 100; });

// The way out and home again: from the surface, straight through the white water into the lit mouth
// under each waterfall, along the tunnel (the gate opens by itself as you come) and up under the far
// falls. No lever, and breath is not topped up: each way must take well under one breath.
const swimThrough = async (startX, yaw, pastMouth) => {
  await ensureLook();
  await g(([x, yaw]) => {
    const gm = window.__hv.game; gm.hour = 12; gm.player.flying = false; gm.vitals.hp = 100;
    gm.player.setPosition(x, 68.6, 1024.5); gm.player.yaw = yaw; gm.player.pitch = 0;
  }, [startX, yaw]);
  await page.waitForFunction(() => window.__hv.idle(), null, { timeout: 120_000, polling: 300 }).catch(() => {});
  await g(() => {
    const gm = window.__hv.game; gm.player.breath = 20;
    window.__swim = { low: 20, gate: 'shut', curtain: false };
    clearInterval(window.__swimTimer);
    window.__swimTimer = setInterval(() => {
      const p = gm.player, s = window.__swim;
      s.low = Math.min(s.low, p.breath);
      if (gm.gate.state !== 'shut') s.gate = gm.gate.state;
      if (window.__hv.blockName(gm.world.blockAt(Math.floor(p.x), 70, Math.floor(p.z))) === 'falling_water') s.curtain = true; // under the curtain
    }, 30);
  });
  await page.keyboard.down('KeyW');
  // Hold the heading: synthetic mouse events can turn the view mid-swim, and a swimmer turned
  // aside meets the rock beside the mouth instead of the mouth.
  // Holding forward alone carries the swimmer out of the far mouth and up the basin's steps until the
  // head is out (no Space to swim up).
  // Software rendering runs the game far slower than the clock, so the wait ends on a real stall (no
  // progress for 30 s), not on a fixed time.
  await g(() => { window.__swimProgress = { x: 0, y: 0, t: performance.now() }; });
  const through = await page.waitForFunction(([past, yaw]) => {
    const p = window.__hv.game.player, s = window.__swimProgress;
    p.yaw = yaw; p.pitch = 0;
    if (Math.abs(p.x - s.x) > 0.05 || Math.abs(p.y - s.y) > 0.05) { s.x = p.x; s.y = p.y; s.t = performance.now(); }
    if (performance.now() - s.t > 30_000) return 'stalled';
    return (past < 1590 ? p.x < past : p.x > past) && !p.headInWater;
  }, [pastMouth, yaw], { timeout: 600_000, polling: 50 }).then(async (h) => (await h.jsonValue()) === true, () => false);
  if (!through) console.log('  (swim stalled:', await g(() => {
    const gm = window.__hv.game, p = gm.player, w = gm.world;
    const cells = []; for (let y = 65; y <= 70; y++) cells.push(y + ':' + window.__hv.blockName(w.blockAt(Math.floor(p.x) - 1, y, Math.floor(p.z))));
    return JSON.stringify({ x: p.x, y: p.y, z: p.z, vy: p.vy, yaw: p.yaw, fly: p.flying, keys: [...gm.keys], playing: gm.playing, look: gm.look.mode, screens: [gm.screen.isOpen, gm.paper.isOpen], ahead: cells });
  }), ')');
  await page.keyboard.up('KeyW');
  const r = await g(() => { clearInterval(window.__swimTimer); const p = window.__hv.game.player; return { ...window.__swim, x: p.x, out: !p.headInWater }; });
  return { ...r, through };
};
const out = await swimThrough(1604.5, Math.PI / 2, 1581.6);
check('swims out: through the valley falls, the tunnel and up under the canyon falls', out.out && out.x < 1582 && out.curtain, `x ${out.x.toFixed(1)}, under the falls ${out.curtain}`);
check('the gate opens by itself on the way', out.gate !== 'shut', `gate ${out.gate}`);
check('holding forward alone brings the head up out of the canyon mouth (no Space)', out.through);
check('the way out takes well under one breath', out.low > 8, `breath left ${out.low.toFixed(1)} of 20`);
const shut = await page.waitForFunction(() => window.__hv.game.gate.state === 'shut', null, { timeout: 90_000, polling: 300 }).then(() => true, () => false);
check('the gate closes itself behind', shut);
const home = await swimThrough(1577.5, -Math.PI / 2, 1601.4);
check('swims home: through the canyon falls and up under the valley falls', home.out && home.x > 1601 && home.curtain, `x ${home.x.toFixed(1)}, under the falls ${home.curtain}`);
check('the gate opens by itself coming home', home.gate !== 'shut', `gate ${home.gate}`);
check('holding forward alone brings the head up out of the valley mouth (no Space)', home.through);
check('coming home takes well under one breath', home.low > 8, `breath left ${home.low.toFixed(1)} of 20`);

// Climb the last leg of the canyon ramp onto the old road.
await g(() => { const gm = window.__hv.game; gm.player.setPosition(1537.5, 101, 1034.5); gm.player.yaw = Math.atan2(4, -21); gm.player.pitch = 0; });
await page.waitForFunction(() => window.__hv.idle(), null, { timeout: 120_000, polling: 300 }).catch(() => {});
await keepAlive();
await page.keyboard.down('KeyW');
await page.waitForFunction(() => window.__hv.game.player.z > 1049, null, { timeout: 60_000, polling: 200 }).catch(() => {});
await page.keyboard.up('KeyW');
const road = await g(() => { const p = window.__hv.game.player; return { y: p.y, z: p.z, below: window.__hv.game.world.blockAt(Math.floor(p.x), Math.floor(p.y) - 1, Math.floor(p.z)) }; });
check('climbs the ramp to the road', road.z > 1049 && road.y >= 106, `z ${road.z.toFixed(1)}, height ${road.y.toFixed(1)}`);

// Shoot a deer with the bow, on a level stretch of the road further west. The deer is set grazing
// 18 m down the road (beyond the 14 m at which it bolts).
await g(() => {
  const gm = window.__hv.game, h = gm.hotbar;
  h.slots[6] = { id: window.__hv.itemId('compound_bow'), count: 1 };
  h.slots[7] = { id: window.__hv.itemId('arrow'), count: 6 };
  h.selected = 6;
  gm.player.setPosition(1392.5, 99.5, 1028.5); // a level stretch of road past the warren
});
await page.waitForFunction(() => window.__hv.idle() && window.__hv.game.player.onGround, null, { timeout: 120_000, polling: 300 }).catch(() => {});
const shootDeer = async () => {
  await ensureLook();
  await keepAlive();
  // Stand the deer still at 18 m and aim for the middle of its body, allowing for the arrow's drop.
  await g(() => {
    const gm = window.__hv.game, p = gm.player;
    // Our deer: the one set here before, if it is still about; others wandering by are sent away.
    let d = gm.wild.creatures.find((c) => c === window.__deer);
    gm.wild.creatures = gm.wild.creatures.filter((c) => c.kind !== 'deer' || c === d);
    if (!d) d = window.__deer = window.__hv.spawn('deer', p.x - 18, 1026.5);
    else { d.x = p.x - 18; d.z = 1026.5; d.vx = d.vz = 0; }
    d.mind = 'wander'; d.timer = 99; d.goalX = d.x; d.goalZ = d.z;
    // A badly hurt deer bolts (as it should); for the play-through it is held where it stands.
    const hx = d.x, hz = d.z;
    clearInterval(window.__pin);
    window.__pin = setInterval(() => { d.x = hx; d.z = hz; d.vx = d.vz = 0; }, 1);
    const dx = d.x - p.x, dz = d.z - p.z, dist = Math.hypot(dx, dz), h = d.y + 0.9 - p.eyeY;
    const v = 48, gr = 18;
    const pitch = Math.atan((v * v - Math.sqrt(v ** 4 - gr * (gr * dist * dist + 2 * h * v * v))) / (gr * dist));
    p.yaw = Math.atan2(-dx, -dz); p.pitch = pitch;
  });
  const hp0 = await g(() => window.__deer?.hp ?? 0);
  // Synthetic mouse presses arrive with a little movement that would turn the view: hold the aim still.
  await g(() => {
    window.__aimLock = true;
    if (!window.__aimHook) { window.__aimHook = true; window.addEventListener('mousemove', (e) => { if (window.__aimLock) e.stopImmediatePropagation(); }, true); }
  });
  await page.mouse.down({ button: 'right' });
  await page.waitForFunction(() => { const gm = window.__hv.game; return gm.drawing !== null && gm.playTime - gm.drawing >= 1.05; }, null, { timeout: 30_000, polling: 100 }).catch(() => {});
  await page.mouse.up({ button: 'right' });
  await g(() => { window.__aimLock = false; });
  await page.waitForFunction((h) => { const d = window.__deer; return !window.__hv.game.wild.creatures.includes(d) || d.hp < h; }, hp0, { timeout: 30_000, polling: 100 }).catch(() => {});
  await g(() => clearInterval(window.__pin));
};
await shootDeer();
const deerHp = await g(() => window.__deer?.hp ?? 0);
const deerAt = await g(() => { const d = window.__deer; return d ? [d.x, d.y, d.z].map((v) => v.toFixed(1)).join(',') : 'gone'; });
check('a full-drawn arrow hits the deer', deerHp === 8, `deer at ${deerHp} of 30, standing at ${deerAt}`);
await shootDeer();
const venison = await g(() => window.__hv.game.hotbar.count(window.__hv.itemId('venison_raw')));
check('a second arrow brings it down: venison in the pack', venison === 3, `venison ×${venison}`);
// Walk to where it fell to pick the arrows up again.
const arrowsLeft = await g(() => window.__hv.game.hotbar.count(window.__hv.itemId('arrow')));
await g(() => { const gm = window.__hv.game, a = gm.wild.arrows.find((o) => o.stuck); if (a) gm.player.setPosition(a.x, a.y, a.z); });
await page.waitForFunction((n) => window.__hv.game.hotbar.count(window.__hv.itemId('arrow')) > n, arrowsLeft, { timeout: 20_000, polling: 200 }).catch(() => {});
const arrowsNow = await g(() => window.__hv.game.hotbar.count(window.__hv.itemId('arrow')));
check('arrows can be picked up again', arrowsNow > arrowsLeft, `arrows ${arrowsLeft} → ${arrowsNow}`);

// Home to the balcony stove, and cook the venison.
await ensureLook();
await g(() => { const gm = window.__hv.game; gm.player.setPosition(1797.5, 82, 1032.5); gm.player.yaw = -Math.PI / 2; gm.player.pitch = -0.7; });
// The stove itself, not its pipe above.
await page.waitForFunction(() => { const gm = window.__hv.game, t = gm.target; gm.player.pitch = -0.7; gm.player.yaw = -Math.PI / 2; return t && t.x === 1799 && t.y === 82 && t.z === 1032; }, null, { timeout: 60_000, polling: 200 }).catch(() => {});
await page.mouse.click(400, 225, { button: 'right' });
await page.waitForTimeout(500);
await page.locator('.iv-recipe', { hasText: 'Venison steak' }).locator('.iv-make').click().catch(() => {});
const steaks = await g(() => window.__hv.game.hotbar.count(window.__hv.itemId('venison_cooked')));
check('venison cooks at the stove', steaks === 1, `steaks ×${steaks}`);
await page.keyboard.press('Escape');
await page.mouse.click(400, 225);
await page.waitForFunction(() => window.__hv.game.look.mode !== 'off', null, { timeout: 10_000 }).catch(() => {});

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

// 1. Up the road to the saddle: the first view of Zone-1.
await walkWest(P.SADDLE.x + 14, 1024.5, P.SADDLE.x - 1);
check('walks up to the saddle and is told what lies below', (await flags()).includes('saddle_seen'), (await flags()).join(' '));

// 2. On to the bus shelter: Marco's number goes into the phone.
await walkWest(P.SADDLE.x - 20, 1027.5, (P.ZONE1.shelter.x0 + P.ZONE1.shelter.x1) / 2 + 2);
check('reaches the lit bus shelter and finds Marco’s number', (await flags()).includes('shelter_found'));

// 3. Home to the phone in the cave, and call him.
await useAt(() => { const gm = window.__hv.game; gm.player.setPosition(1804.5, 82, 1027.5); gm.player.yaw = -Math.PI / 2; gm.player.pitch = -0.25; },
  (gm) => { const t = gm.target; gm.player.yaw = -Math.PI / 2; gm.player.pitch = -0.25; return t && t.x === 1806 && t.y === 83 && t.z === 1027; });
const phoneText = await page.locator('.pp-panel').textContent().catch(() => '');
check('the builder’s phone now has Marco', /Marco/.test(phoneText ?? ''), (phoneText ?? '').slice(0, 80));
await page.locator('.pp-call').first().click().catch(() => {});
await page.waitForTimeout(300);
const reply = await page.locator('.pp-say').textContent().catch(() => '');
check('calling him arranges a meeting at the shelter', (await flags()).includes('marco_meeting') && /shelter/.test(reply ?? ''), reply ?? '');
await closeScreens();

// 4. Back at the shelter by day, he is there: talk, buy salt, sell the venison steak.
await ensureLook();
await g((P) => { const gm = window.__hv.game; gm.hour = 12; gm.player.setPosition(P.MARCO_SPOT[0], P.ZONE1.shelter.floor, P.MARCO_SPOT[2] + 2.6); }, P);
await page.waitForFunction(() => window.__hv.idle() && window.__hv.game.wild.creatures.some((c) => c.kind === 'marco'), null, { timeout: 60_000, polling: 300 }).catch(() => {});
check('Marco waits at the shelter by day', await g(() => window.__hv.game.wild.creatures.some((c) => c.kind === 'marco')));
const wallet0 = await g(() => window.__hv.game.wallet);
await useAt(() => { const p = window.__hv.game.player; p.yaw = 0; p.pitch = 0; },
  (gm) => { gm.player.yaw = 0; gm.player.pitch = 0; const m = gm.wild.creatures.find((c) => c.kind === 'marco'); return !!m && !!gm.creatureInSight(4); });
const tradeOpen = await page.locator('.pp-trade').isVisible().catch(() => false);
check('right-clicking Marco opens his trade', tradeOpen);
const salt0 = await g(() => window.__hv.game.hotbar.count(window.__hv.itemId('salt')));
await page.locator('.pp-trade .row', { hasText: 'Salt' }).locator('button').first().click().catch(() => {});
await page.waitForTimeout(200);
await page.locator('.pp-trade .row', { hasText: 'Venison steak' }).locator('button').first().click().catch(() => {});
await page.waitForTimeout(200);
const deal = await g(([id]) => ({ wallet: window.__hv.game.wallet, salt: window.__hv.game.hotbar.count(id), trust: window.__hv.game.flags.has('marco_trust1') }), [await g(() => window.__hv.itemId('salt'))]);
check('buys salt and sells a steak: the wallet changes both ways', deal.salt === salt0 + 4 && deal.wallet !== wallet0, `salt ${salt0} → ${deal.salt}, wallet ${wallet0} → ${deal.wallet}`);
check('the first deal earns Marco’s trust (level 1)', deal.trust);
await closeScreens();

// 5. The dead scout: search his pockets and take the pistol.
await useAt((P) => { const gm = window.__hv.game; gm.player.setPosition(P.SCOUT_AT[0] + 2.5, P.SCOUT_AT[1], P.SCOUT_AT[2] + 0.5); gm.player.yaw = Math.PI / 2; gm.player.pitch = -0.6; },
  (gm, P) => { gm.player.yaw = Math.PI / 2; gm.player.pitch = -0.6; const t = gm.target; return t && t.x === P.SCOUT_AT[0] && t.z === P.SCOUT_AT[2]; }, P);
const pockets = await page.locator('.iv-title').first().textContent().catch(() => null);
check('the scout’s pockets open', /scout/i.test(pockets ?? ''), `title: ${pockets}`);
await page.locator('.iv-grid').first().locator('.iv-slot').first().click({ modifiers: ['Shift'] }).catch(() => {});
await closeScreens();
await page.waitForTimeout(1200);
const scout = await g(() => ({ pistol: window.__hv.game.hotbar.count(window.__hv.itemId('pistol')), f: [...window.__hv.game.flags] }));
check('takes the pistol, and the lore goes into the notes', scout.pistol === 1 && scout.f.includes('scout_searched') && scout.f.includes('pistol_taken'), scout.f.join(' '));

// 6. The farmyard: catch two chickens (spawning is off in test mode: no dogs, and the hens are set by hand).
const catchOne = async (n) => {
  await useAt((P) => {
    const gm = window.__hv.game, p = gm.player;
    p.setPosition(P.YARD[0], P.ZONE1.farm.floor, P.YARD[1] + 4);
    gm.wild.creatures = gm.wild.creatures.filter((c) => c.kind !== 'chicken');
    const c = window.__hen = window.__hv.spawn('chicken', P.YARD[0] + 0.5, P.YARD[1] + 2.3);
    clearInterval(window.__pin);
    if (c) window.__pin = setInterval(() => { c.x = P.YARD[0] + 0.5; c.z = P.YARD[1] + 2.3; c.vx = c.vz = 0; c.mind = 'wander'; c.timer = 9; }, 1);
  }, (gm) => {
    const p = gm.player, c = window.__hen;
    if (!c) return true;
    const dx = c.x - p.x, dz = c.z - p.z;
    p.yaw = Math.atan2(-dx, -dz); p.pitch = -Math.atan2(p.eyeY - (c.y + 0.25), Math.hypot(dx, dz));
    return !!gm.creatureInSight(3);
  }, P);
  await g(() => clearInterval(window.__pin));
  return g(() => window.__hv.game.hotbar.count(window.__hv.itemId('live_chicken')));
};
await catchOne(1);
const hens = await catchOne(2);
check('catches a pair of chickens by hand', hens === 2, `live chickens ×${hens}`);

// 7. Home: make a coop at the workbench from the barn's materials, put the pair in, sleep: eggs in the morning.
await g(() => {
  const h = window.__hv.game.hotbar, id = window.__hv.itemId;
  h.add(id('planks'), 6); h.add(id('wire_mesh'), 2); h.add(id('nails'), 8);
});
await useAt(() => { const gm = window.__hv.game; gm.player.setPosition(1820.5, 82, 1009.3); gm.player.yaw = 0; gm.player.pitch = -0.55; },
  (gm) => { gm.player.yaw = 0; gm.player.pitch = -0.55; const t = gm.target; return t && t.x === 1820 && t.z === 1007; });
await page.locator('.iv-recipe', { hasText: 'Chicken coop' }).locator('.iv-make').click().catch(() => {});
const coops = await g(() => window.__hv.game.hotbar.count(window.__hv.itemId('coop')));
check('a coop is made at the workbench', coops === 1, `coops ×${coops}`);
await closeScreens();
// Set it on the valley floor beside the garden, and open it.
const coopAt = await g(() => {
  const gm = window.__hv.game, w = gm.world, x = 1735, z = 1054;
  let y = 90; while (y > 60 && w.blockAt(x, y - 1, z) === 0) y--;
  w.setBlock(x, y, z, window.__hv.itemId('coop'));
  gm.hotbar.remove(window.__hv.itemId('coop'), 1);
  return [x, y, z];
});
await useAt((c) => { const gm = window.__hv.game; gm.player.setPosition(c[0] + 0.5, c[1], c[2] + 2.8); gm.player.yaw = 0; gm.player.pitch = -0.35; },
  (gm, c) => { gm.player.yaw = 0; gm.player.pitch = -0.35; const t = gm.target; return t && t.x === c[0] && t.z === c[2]; }, coopAt);
const henSlot = await g(() => window.__hv.game.hotbar.slots.findIndex((s) => s && s.id === window.__hv.itemId('live_chicken')));
if (henSlot >= 9) await page.locator('.iv-grid').nth(1).locator('.iv-slot').nth(henSlot - 9).click({ modifiers: ['Shift'] }).catch(() => {});
else await page.locator('.iv-grid').nth(2).locator('.iv-slot').nth(henSlot).click({ modifiers: ['Shift'] }).catch(() => {});
await closeScreens();
const inCoop = await g((c) => window.__hv.game.world.containerAt(...c).reduce((n, s) => n + (s && s.id === window.__hv.itemId('live_chicken') ? s.count : 0), 0), coopAt);
check('the pair goes into the coop', inCoop === 2, `chickens in the coop ×${inCoop}`);
for (let attempt = 0; attempt < 3; attempt++) {
  await useAt(() => { const gm = window.__hv.game; gm.hour = 21; gm.player.setPosition(1811.5, 82, 1019.5); gm.player.yaw = -Math.PI / 2; gm.player.pitch = -0.35; },
    // The clock is set once, before aiming: setting it again while waiting could put a slept night back to
    // 21:00, and a second sleep lays a second morning's eggs.
    (gm) => { gm.player.yaw = -Math.PI / 2; gm.player.pitch = -0.35; const t = gm.target; return t && t.x === 1813 && t.z === 1019; });
  if (await g(() => window.__hv.game.hour < 7)) break;
}
await page.waitForTimeout(500);
const eggs = await g((c) => window.__hv.game.world.containerAt(...c).reduce((n, s) => n + (s && s.id === window.__hv.itemId('egg') ? s.count : 0), 0), coopAt);
check('in the morning the coop has eggs', eggs === 2, `eggs ×${eggs}`);

// 8. Home alive from Zone-1, with the gate swum both ways, Marco's trust and the pistol: M1 is done.
await page.waitForTimeout(1300);
const m1 = await g(() => ({ done: window.__hv.game.flags.has('m1_done'), f: [...window.__hv.game.flags] }));
check('M1, the first outside run, is done', m1.done, m1.f.join(' '));
check('the meeting with Marco ended once you left him', !m1.f.includes('marco_meeting'));
// The journal opens at the newest of your own notes.
await useAt(() => { const p = window.__hv.game.player; p.setPosition(1812.5, 82, 1029.5); p.yaw = -Math.PI / 2; p.pitch = -0.1; },
  (gm) => { gm.player.yaw = -Math.PI / 2; gm.player.pitch = -0.1; const t = gm.target; return t && t.x === 1814; });
const notesPage = await page.locator('.pp-panel').textContent().catch(() => '');
check('the journal opens at your newest note', /Your notes/.test(notesPage ?? '') && /first run/i.test(notesPage ?? ''), (notesPage ?? '').slice(0, 70));
await closeScreens();

// ---- Phase 5: Zone-1's mid and deep bands ---------------------------------------------------------
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
const O = P.ZONE1FAR.outpost;

// 1. West along the road toward the smoke: the mid band's toast, then the outpost's; the lookout sees you and shouts.
await standAt(P.OUTPOST_AT[0] + 48, 1020.5, Math.PI / 2);
await walkTo(Math.PI / 2, (p, x) => p.x < x, P.OUTPOST_AT[0] + 26);
await waitFlag('outpost_seen');
let f5 = await flags();
check('walks into the mid band and is told of the outpost and how to come at it unseen', f5.includes('mid_seen') && f5.includes('outpost_seen'), f5.filter((x) => /seen/.test(x)).join(' '));
const alerted = await page.waitForFunction(() => { const gm = window.__hv.game; gm.player.yaw = Math.PI / 2; gm.vitals.hp = 100; return gm.wild.outpost.alert; }, null, { timeout: LONG, polling: 100 }).then(() => true, () => false);
check('the lookout sees you on the road and shouts the alarm', alerted, (await raiders()).join(' '));
const aimed = await page.waitForFunction(() => { const gm = window.__hv.game; gm.vitals.hp = 100; return gm.wild.creatures.some((c) => c.kind === 'lookout' && c.mind === 'aim'); }, null, { timeout: LONG, polling: 50 }).then(() => true, () => false);
check('he aims before he fires: the glint and the click come first', aimed, (await raiders()).join(' '));

// 2. Cover works: behind a wall the lookout's next shot misses.
await g(([x, z]) => {
  const gm = window.__hv.game, w = gm.world, p = gm.player;
  p.setPosition(x, p.y, z); p.yaw = Math.PI / 2;
  const y0 = Math.floor(p.y);
  for (let dz = -3; dz <= 3; dz++) for (let y = y0; y < y0 + 4; y++) w.setBlock(x - 2, y, z + dz, window.__hv.itemId('cobble'));
  gm.streamer.markUrgentAround(x - 2, y0, z);
  gm.vitals.hp = 100;
  window.__cover = { shots: 0, hp: 100, last: '' };
  clearInterval(window.__coverT);
  window.__coverT = setInterval(() => {
    const l = gm.wild.creatures.find((c) => c.kind === 'lookout'), s = window.__cover;
    if (l && s.last === 'aim' && l.mind === 'recover') s.shots++;
    if (l) s.last = l.mind;
    if (!s.shots) s.hp = Math.min(s.hp, gm.vitals.hp);
  }, 5);
}, [P.OUTPOST_AT[0] + 26.5, 1024.5]);
await page.waitForFunction(() => window.__cover.shots >= 1, null, { timeout: LONG, polling: 100 }).catch(() => {});
const cover = await g(() => { clearInterval(window.__coverT); return window.__cover; });
check('behind a wall the lookout’s shot misses: cover works', cover.shots >= 1 && cover.hp === 100, `shots ${cover.shots}, health ${cover.hp}`);

// 3. Start again unseen (the outpost stands down), on the roof behind the lookout (as up the crates at the
// back): a blade, a silent takedown.
await hold('machete');
await g((O) => { const gm = window.__hv.game, p = gm.player; gm.wild.clear(); p.flying = false; p.setPosition(O.x0 + 1.5, O.floor + 4, (O.z0 + O.z1) / 2); p.yaw = -Math.PI / 2; p.pitch = 0; gm.vitals.hp = 100; }, O);
await page.waitForFunction(() => window.__hv.game.wild.creatures.some((c) => c.kind === 'lookout'), null, { timeout: LONG, polling: 200 }).catch(() => {});
const before = await g(() => ({ alert: window.__hv.game.wild.outpost.alert, m: window.__hv.game.wild.creatures.find((c) => c.kind === 'lookout')?.mind }));
await walkTo(-Math.PI / 2, (p) => { const l = window.__hv.game.wild.creatures.find((c) => c.kind === 'lookout'); return !l || l.x - p.x < 2.2; });
for (let k = 0; k < 6 && await g(() => window.__hv.game.wild.creatures.some((c) => c.kind === 'lookout')); k++) {
  await aimAt('lookout');
  await page.waitForFunction(() => { const gm = window.__hv.game, l = gm.wild.creatures.find((c) => c.kind === 'lookout'); if (!l) return true; const p = gm.player, dx = l.x - p.x, dz = l.z - p.z; p.yaw = Math.atan2(-dx, -dz); p.pitch = -Math.atan2(p.eyeY - (l.y + 1.2), Math.hypot(dx, dz)); return gm.creatureInSight(3)?.c === l; }, null, { timeout: 30_000, polling: 50 }).catch(() => {});
  await g(() => { window.__aimLock = true; });
  await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up();
  await g(() => { window.__aimLock = false; });
  await page.waitForTimeout(1500);
}
const td = await g(() => { const gm = window.__hv.game; return { gone: !gm.wild.creatures.some((c) => c.kind === 'lookout'), alert: gm.wild.outpost.alert, left: gm.wild.outpost.left, rifle: gm.hotbar.count(window.__hv.itemId('raider_rifle')) }; });
check('on the roof behind him, unseen, a blade takes the lookout silently', before.alert === false && before.m === 'watch' && td.gone && !td.alert && td.rifle === 1, `was ${before.m}; ${JSON.stringify(td)}`);

// 4. The other two, with the rifle: the shot alerts them, so it has to count.
await hold('hunting_rifle');
await g(() => window.__hv.game.hotbar.add(window.__hv.itemId('rifle_rounds'), 10));
for (const kind of ['gunman', 'rusher']) {
  for (let k = 0; k < 8 && await g((k) => window.__hv.game.wild.creatures.some((c) => c.kind === k), kind); k++) {
    if (kind === 'rusher' && k === 0) await g((O) => { const p = window.__hv.game.player; p.setPosition(O.x0 + 7.5, O.floor, O.z0 - 7.5); }, O);
    await keepAlive();
    const seen = await page.waitForFunction((k) => { const gm = window.__hv.game, p = gm.player, c = gm.wild.creatures.find((o) => o.kind === k); if (!c) return true; const dx = c.x - p.x, dz = c.z - p.z; p.yaw = Math.atan2(-dx, -dz); p.pitch = -Math.atan2(p.eyeY - (c.y + 1.2), Math.hypot(dx, dz)); gm.vitals.hp = 100; return gm.creatureInSight(150)?.c === c; }, kind, { timeout: 60_000, polling: 50 }).then(() => true, () => false);
    if (!seen) { await g(([O, k]) => { const gm = window.__hv.game, c = gm.wild.creatures.find((o) => o.kind === k); if (c) gm.player.setPosition(c.x, O.floor, c.z - 5); }, [O, kind]); continue; }
    await g(() => { window.__aimLock = true; });
    await page.mouse.click(400, 225, { button: 'right' });
    await g(() => { window.__aimLock = false; });
    await page.waitForFunction((k) => { window.__hv.game.vitals.hp = 100; return !window.__hv.game.wild.creatures.some((c) => c.kind === k) || window.__hv.game.playTime - window.__hv.game.lastShot > 1.5; }, kind, { timeout: 60_000, polling: 100 }).catch(() => {});
  }
}
await waitFlag('outpost_cleared');
const cleared = await g(() => ({ left: window.__hv.game.wild.outpost.left, f: window.__hv.game.flags.has('outpost_cleared'), pistols: window.__hv.game.hotbar.count(window.__hv.itemId('pistol')) }));
check('the other two fall to the rifle: the outpost is cleared', cleared.left === 0 && cleared.f, JSON.stringify(cleared));
await g(() => window.__hv.game.wild.clear());
await page.waitForFunction(() => window.__hv.game.time > (window.__t0 = window.__t0 ?? window.__hv.game.time) + 3, null, { timeout: LONG, polling: 200 }).catch(() => {});
check('a one-time fight: nobody comes back to the outpost', (await raiders()).length === 0);

// 5. The back room: the raiders' crate, and the forge mined for its parts.
await useAt((O) => { const gm = window.__hv.game; gm.player.setPosition(O.x0 + 3.5, O.floor, O.z1 - 1.6); gm.player.yaw = Math.PI / 2; gm.player.pitch = -0.45; },
  (gm, O) => { gm.player.yaw = Math.PI / 2; gm.player.pitch = -0.45; const t = gm.target; return t && t.x === O.x0 + 1 && t.z === O.z1 - 2; }, O);
const crate = await page.locator('.iv-title').first().textContent().catch(() => null);
const stash = await g((c) => (window.__hv.game.world.containerAt(...c) ?? []).filter(Boolean).length, P.RAIDER_CRATE);
check('the raiders’ crate opens: ammunition, bowstrings, arrowheads', /raiders/i.test(crate ?? '') && stash >= 4, `${crate}: ${stash} stacks`);
await closeScreens();
await hold('steel_pickaxe');
await ensureLook();
await g(([O, F]) => { const gm = window.__hv.game; gm.player.setPosition(F[0] - 2.5 + 0.5, O.floor, F[2] + 0.5); gm.player.yaw = -Math.PI / 2; gm.player.pitch = -0.5; }, [O, P.RAIDER_FORGE]);
await page.mouse.down();
await page.waitForFunction((F) => { const gm = window.__hv.game; gm.player.yaw = -Math.PI / 2; gm.player.pitch = -0.5; return gm.world.blockAt(...F) === 0; }, P.RAIDER_FORGE, { timeout: LONG, polling: 100 }).catch(() => {});
await page.mouse.up();
const parts = await g(() => window.__hv.game.hotbar.count(window.__hv.itemId('forge_parts')));
check('the raiders’ forge is mined for its parts', parts === 1, `forge parts ×${parts}`);

// 6. Their workbench makes the workshop extension: the forge, and a tool rack with it.
await g(() => { const h = window.__hv.game.hotbar, id = window.__hv.itemId; h.add(id('stone_bricks'), 4); h.add(id('planks'), 6); h.add(id('nails'), 8); });
await useAt(([O, F]) => { const gm = window.__hv.game; gm.player.setPosition(F[0] - 2 + 0.5, O.floor, F[2] - 1.3); gm.player.yaw = Math.PI; gm.player.pitch = -0.6; },
  (gm, F) => { gm.player.yaw = Math.PI; gm.player.pitch = -0.6; const t = gm.target; return t && t.x === F[0] - 2 && t.z === F[2]; }, [O, P.RAIDER_FORGE]);
await page.locator('.iv-recipe', { hasText: /^Forge/ }).first().locator('.iv-make').click().catch(() => {});
const forge = await g(() => ({ forge: window.__hv.game.hotbar.count(window.__hv.itemId('forge')), rack: window.__hv.game.hotbar.count(window.__hv.itemId('tool_rack')), f: window.__hv.game.flags.has('forge_made'), open: window.__hv.game.screen.isOpen }));
check('the forge is made from the parts (M2’s workshop extension)', forge.forge === 1 && forge.rack === 1 && forge.f, JSON.stringify(forge));
await closeScreens();

// 7. The hunting camp: its marker on the road, the trail north, and the jaguar's one crossing.
await standAt(P.CAMP_MARKER[0] + 9, 1026.5, Math.PI / 2);
await walkTo(Math.PI / 2, (p, x) => p.x < x, P.CAMP_MARKER[0] + 1);
check('the camp’s marker on the road is noticed', await waitFlag('camp_marker'));
await standAt(P.ZONE1FAR.campHead.x + 0.5, P.ZONE1FAR.campHead.z - 4, 0);
await walkTo(0, (p, z) => p.z < z, P.ZONE1FAR.camp.z1 + 3);
await waitFlag('jaguar_seen');
const jag = await g(() => ({ seen: window.__hv.game.flags.has('jaguar_seen'), there: window.__hv.game.wild.creatures.some((c) => c.kind === 'jaguar') }));
check('at the clearing a jaguar crosses', jag.seen && jag.there, JSON.stringify(jag));
const gone = await page.waitForFunction(() => { window.__hv.game.vitals.hp = 100; return !window.__hv.game.wild.creatures.some((c) => c.kind === 'jaguar'); }, null, { timeout: LONG, polling: 200 }).then(() => true, () => false);
check('it stops, looks, and is gone into the trees', gone);

// 8. The road's end: the broken bridge, and the body across the ravine (the stinger plays as it comes into view).
await standAt(P.DECK_END[0] + 30, P.DECK_END[2], Math.PI / 2);
await walkTo(Math.PI / 2, (p, x) => p.x < x, P.DECK_END[0] + 3);
await waitFlag('bridge_seen');
await page.waitForFunction(() => { const p = window.__hv.game.player; p.yaw = (93 * Math.PI) / 180; p.pitch = (-7 * Math.PI) / 180; return window.__hv.game.flags.has('body_seen'); }, null, { timeout: LONG, polling: 200 }).catch(() => {});
f5 = await flags();
check('walks to the broken bridge, and sees the body across the ravine', f5.includes('deep_seen') && f5.includes('bridge_seen') && f5.includes('body_seen'), f5.filter((x) => /seen/.test(x)).join(' '));
// Home to the cave, where the save checks below edit a block.
await g(() => { const gm = window.__hv.game; gm.player.flying = false; gm.player.setPosition(1812.5, 82, 1029.5); gm.player.yaw = -Math.PI / 2; gm.player.pitch = 0; });
await page.waitForFunction(() => window.__hv.idle(), null, { timeout: LONG, polling: 300 }).catch(() => {});
// F3 shows the debug panel, and F3 again hides it (it used to stay up with its last text).
await ensureLook();
await page.keyboard.press('F3');
await page.waitForTimeout(400);
const debugOn = await g(() => getComputedStyle(document.querySelector('.hv-debug')).display !== 'none');
await page.keyboard.press('F3');
await page.waitForTimeout(400);
const debugOff = await g(() => getComputedStyle(document.querySelector('.hv-debug')).display === 'none');
check('F3 shows the debug panel and hides it again', debugOn && debugOff, `on ${debugOn}, off ${debugOff}`);

// Mine a block next to it and leave the hole, then save and reload.
const t2 = { x: target.x, y: target.y, z: target.z + 1 };
await g((t) => window.__hv.game.world.setBlock(t.x, t.y, t.z, 0), t2);
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
const savedAt = await g(() => window.__hv.game.player.x);
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
check('the player is where they saved', Math.abs(pos[0] - savedAt) < 1, `x ${pos[0].toFixed(1)} (saved at ${savedAt.toFixed(1)})`);
check('the outpost stays cleared after the reload', await g(() => window.__hv.game.wild.outpost.left === 0 && window.__hv.game.flags.has('outpost_cleared')));

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
