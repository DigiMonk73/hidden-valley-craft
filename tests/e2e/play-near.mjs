// The play-through, part 2: Zone-1's near band (Phase 4). The saddle, Marco and his trade, the scout's pistol,
// the farm's chickens and the coop, M1, and the journal's newest note.
// Needs the build served: npx vite preview --port 4173. Run on its own, or all parts with: node tests/e2e/play.mjs
import { start } from './lib.mjs';

const { page, g, check, ensureLook, keepAlive, useAt, closeScreens, walkWest, gameWait, P, flags, finish } = await start();
// The scene part 1 leaves behind: the rifle from the armory and its rounds, a cooked steak to sell, and the
// gate swum both ways (part 1 checks the swim itself).
await g(() => {
  const gm = window.__hv.game, h = gm.hotbar, id = window.__hv.itemId;
  h.add(id('hunting_rifle'), 1); h.add(id('rifle_rounds'), 20); h.add(id('venison_cooked'), 1);
  for (const f of ['been_out', 'gate_both']) gm.flags.add(f);
});

// 1. Up the road to the saddle: the first view of Zone-1.
await walkWest(P.SADDLE.x + 14, 1024.5, P.SADDLE.x - 1);
check('walks up to the saddle and is told what lies below', (await flags()).includes('saddle_seen'), (await flags()).join(' '));

// 2. On to the bus shelter: Marco's number goes into the phone.
await walkWest(P.SADDLE.x - 20, 1027.5, (P.ZONE1.shelter.x0 + P.ZONE1.shelter.x1) / 2 + 2);
check('reaches the lit bus shelter and finds Marco’s number', (await flags()).includes('shelter_found'));

// 3. Home to the phone in the cave, and call him.
await useAt(() => { const gm = window.__hv.game; gm.player.setPosition(1811.5, 82, 1029.5); gm.player.yaw = -Math.PI / 2; gm.player.pitch = -0.25; },
  (gm) => { const t = gm.target; gm.player.yaw = -Math.PI / 2; gm.player.pitch = -0.25; return t && t.x === 1813 && t.y === 83 && t.z === 1029; });
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
await gameWait(1.3);
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
// Home alive from Zone-1, with Marco's trust and the scout's pistol: M1 is done, and only then can M2's things (the coop) be made.
await g(() => { const gm = window.__hv.game; gm.player.flying = false; gm.player.setPosition(1820.5, 82, 1009.3); });
const m1Home = await page.waitForFunction(() => window.__hv.game.flags.has('m1_done'), null, { timeout: 120_000, polling: 300 }).then(() => true, () => false);
check('home from Zone-1, M1 is done: the coop can be made now', m1Home, (await flags()).filter((f) => /gate_both|trust1|extracted|pistol_taken|m1_done/.test(f)).join(' '));
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
  await useAt(() => { const gm = window.__hv.game; gm.hour = 21; gm.player.setPosition(1808.5, 82, 1037.5); gm.player.yaw = -Math.PI / 2; gm.player.pitch = -0.35; },
    // The clock is set once, before aiming: setting it again while waiting could put a slept night back to
    // 21:00, and a second sleep lays a second morning's eggs.
    (gm) => { gm.player.yaw = -Math.PI / 2; gm.player.pitch = -0.35; const t = gm.target; return t && t.x === 1810 && t.z === 1037; });
  if (await g(() => window.__hv.game.hour < 7)) break;
}
await page.waitForFunction((c) => window.__hv.game.world.containerAt(...c).some((s) => s && s.id === window.__hv.itemId('egg')), coopAt, { timeout: 60_000, polling: 250 }).catch(() => {});
const eggs = await g((c) => window.__hv.game.world.containerAt(...c).reduce((n, s) => n + (s && s.id === window.__hv.itemId('egg') ? s.count : 0), 0), coopAt);
check('in the morning the coop has eggs', eggs === 2, `eggs ×${eggs}`);
// The eggs are left in: another night, and one hatches. Her hens walk round the coop, one per hen.
// (A record of the night, printed if the hatch fails: the clock as each frame saw it, and what was said.)
await g(() => {
  const gm = window.__hv.game, log = window.__night = [];
  const toast = gm.hud.toast.bind(gm.hud);
  gm.hud.toast = (line, ms) => { log.push(`said: ${String(line).slice(0, 40)}`); return toast(line, ms); };
  let last = '';
  const f = () => { const now = `${gm.hour.toFixed(2)}/${gm.dayClock.toFixed(2)}`; if (now !== last && log.length < 60) log.push(last = now); if (window.__night === log) requestAnimationFrame(f); };
  requestAnimationFrame(f);
});
for (let attempt = 0; attempt < 3; attempt++) {
  await useAt(() => { const gm = window.__hv.game; gm.hour = 21; gm.player.setPosition(1808.5, 82, 1037.5); gm.player.yaw = -Math.PI / 2; gm.player.pitch = -0.35; },
    (gm) => { gm.player.yaw = -Math.PI / 2; gm.player.pitch = -0.35; const t = gm.target; return t && t.x === 1810 && t.z === 1037; });
  if (await g(() => window.__hv.game.hour < 7)) break;
}
// The hatch is the game's to do in its own time: wait for it, not for the wall clock.
await page.waitForFunction((c) => window.__hv.game.world.containerAt(...c).reduce((n, s) => n + (s && s.id === window.__hv.itemId('live_chicken') ? s.count : 0), 0) === 3, coopAt, { timeout: 60_000, polling: 250 }).catch(() => {});
const hens3 = await g((c) => window.__hv.game.world.containerAt(...c).reduce((n, s) => n + (s && s.id === window.__hv.itemId('live_chicken') ? s.count : 0), 0), coopAt);
check('an egg left in hatches: three hens in the coop', hens3 === 3, `hens ×${hens3}` + (hens3 === 3 ? '' : ' · the night: ' + (await g(() => window.__night.join(' | ')))));
await g(() => { window.__night = null; });
await g((c) => { const p = window.__hv.game.player; p.setPosition(c[0] + 0.5, c[1], c[2] + 3.5); }, coopAt);
const walkers = await page.waitForFunction(() => window.__hv.game.wild.creatures.filter((c) => c.tame).length === 3, null, { timeout: 300_000, polling: 300 }).then(() => true, () => false);
check('her three hens walk round the coop', walkers, `${await g(() => window.__hv.game.wild.creatures.filter((c) => c.tame).length)} walking`);

// 8. Home alive from Zone-1, with the gate swum both ways, Marco's trust and the pistol: M1 is done.
await gameWait(1.3);
const m1 = await g(() => ({ done: window.__hv.game.flags.has('m1_done'), f: [...window.__hv.game.flags] }));
check('M1, the first outside run, is done', m1.done, m1.f.join(' '));
check('the meeting with Marco ended once you left him', !m1.f.includes('marco_meeting'));
// The journal opens at the newest of your own notes.
await useAt(() => { const p = window.__hv.game.player; p.setPosition(1812.5, 82, 1031.5); p.yaw = -Math.PI / 2; p.pitch = -0.1; },
  (gm) => { gm.player.yaw = -Math.PI / 2; gm.player.pitch = -0.1; const t = gm.target; return t && t.x === 1814 && t.z === 1031; });
const notesPage = await page.locator('.pp-panel').textContent().catch(() => '');
check('the journal opens at your newest note', /Your notes/.test(notesPage ?? '') && /first run/i.test(notesPage ?? ''), (notesPage ?? '').slice(0, 70));
await closeScreens();

await finish();
