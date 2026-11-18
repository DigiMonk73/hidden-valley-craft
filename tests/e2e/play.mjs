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

// Dive through the valley falls into the tunnel's mouth beneath them, and swim west to the gate.
await ensureLook();
await g(() => { const gm = window.__hv.game; gm.hour = 12; gm.player.flying = false; gm.player.setPosition(1602, 68.6, 1024.5); gm.player.yaw = Math.PI / 2; gm.player.pitch = 0; });
await page.waitForFunction(() => window.__hv.idle(), null, { timeout: 120_000, polling: 300 }).catch(() => {});
const curtain = await g(() => { const p = window.__hv.game.player, w = window.__hv.game.world; return window.__hv.blockName(w.blockAt(Math.floor(p.x), 70, Math.floor(p.z))) === 'falling_water'; });
await page.waitForFunction(() => { const gm = window.__hv.game; gm.player.breath = 20; return gm.player.y < 62.5; }, null, { timeout: 60_000, polling: 100 }).catch(() => {});
const dived = await g(() => window.__hv.game.player.y);
check('dives through the falls down the tunnel mouth', curtain && dived < 62.5, `under the curtain ${curtain}, height ${dived.toFixed(1)}`);
await page.keyboard.down('KeyW');
await page.waitForFunction(() => { const gm = window.__hv.game; gm.player.breath = 20; return gm.player.x < 1595.6; }, null, { timeout: 60_000, polling: 100 }).catch(() => {});
await page.keyboard.up('KeyW');
const atGate = await g(() => ({ x: window.__hv.game.player.x, wet: window.__hv.game.player.headInWater }));
check('swims along the drowned tunnel to the gate', atGate.x < 1596 && atGate.wet, `x ${atGate.x.toFixed(1)}, under water ${atGate.wet}`);

// Pull the marked stone on the north wall: the gate grinds open.
let gateState = 'shut';
for (let attempt = 0; attempt < 3 && gateState === 'shut'; attempt++) {
  await ensureLook();
  // Face the north wall from just in front of the stone, so no corner of rock is in the way.
  await g(() => { const p = window.__hv.game.player; p.setPosition(1594.5, 62, 1023.4); p.yaw = 0; p.pitch = -0.15; });
  await page.waitForFunction(() => { const gm = window.__hv.game, t = gm.target; gm.player.breath = 20; return t && t.x === 1594 && t.y === 63 && t.z === 1022; }, null, { timeout: 30_000, polling: 100 }).catch(() => {});
  await page.mouse.click(400, 225, { button: 'right' });
  await page.waitForTimeout(400);
  gateState = await g(() => window.__hv.game.gate.state);
}
check('the marked stone opens the gate', gateState !== 'shut', `gate ${gateState}`);
await page.waitForFunction(() => { window.__hv.game.player.breath = 20; return window.__hv.game.gate.state === 'open'; }, null, { timeout: 60_000, polling: 200 }).catch(() => {});
// Swim through into the air pocket.
await g(() => { const p = window.__hv.game.player; p.setPosition(1595.5, 62, 1024.5); p.yaw = Math.PI / 2; p.pitch = 0; });
await page.keyboard.down('KeyW');
await page.waitForFunction(() => { const gm = window.__hv.game; gm.player.breath = 20; return gm.player.x < 1589; }, null, { timeout: 60_000, polling: 100 }).catch(() => {});
await page.keyboard.up('KeyW');
const through = await g(() => window.__hv.game.player.x);
check('swims through the gate into the air pocket', through < 1590, `x ${through.toFixed(1)}`);
const shut = await page.waitForFunction(() => { window.__hv.game.player.breath = 20; return window.__hv.game.gate.state === 'shut'; }, null, { timeout: 90_000, polling: 300 }).then(() => true, () => false);
check('the gate closes itself behind', shut);

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
