// The play-through, part 3: Zone-1's mid and deep bands (Phase 5). The outpost fight (the glint, cover, a
// silent takedown, the rifle), the back room and the forge, the camp and the jaguar, the bridge and the body,
// hold H home, F3; and the outpost stays cleared after a reload.
// Needs the build served: npx vite preview --port 4173. Run on its own, or all parts with: node tests/e2e/play.mjs
import { start } from './lib.mjs';

const { page, g, check, idle, ensureLook, keepAlive, useAt, closeScreens, P, flags, LONG, standAt, walkTo, waitFlag, aimAt, hold, raiders, finish } = await start();

// The rifle from the armory and its rounds (part 1 takes them).
await g(() => { const h = window.__hv.game.hotbar, id = window.__hv.itemId; h.add(id('hunting_rifle'), 1); h.add(id('rifle_rounds'), 20); });

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

// 2. Cover works: behind a wall the lookout can't shoot you. He holds his aim, waiting for you to show
// yourself (a hidden player is never shot, and stepping out gives a moment's warning again).
await g(([x, z]) => {
  const gm = window.__hv.game, w = gm.world, p = gm.player;
  p.setPosition(x, p.y, z); p.yaw = Math.PI / 2;
  const y0 = Math.floor(p.y);
  for (let dz = -3; dz <= 3; dz++) for (let y = y0; y < y0 + 4; y++) w.setBlock(x - 2, y, z + dz, window.__hv.itemId('cobble'));
  gm.streamer.markUrgentAround(x - 2, y0, z);
  gm.vitals.hp = 100;
  window.__cover = { t0: gm.time, hp: 100, shots: 0, last: '' };
  clearInterval(window.__coverT);
  window.__coverT = setInterval(() => {
    const l = gm.wild.creatures.find((c) => c.kind === 'lookout'), s = window.__cover;
    if (l && s.last === 'aim' && l.mind === 'recover') s.shots++;
    if (l) s.last = l.mind;
    // (The scene is the lookout's: the machete is held at his post, so only the rifle's shot is in question.)
    const r = gm.wild.creatures.find((c) => c.kind === 'rusher');
    if (r && r.post) { r.x = r.post.x; r.z = r.post.z; r.vx = r.vz = 0; r.mind = 'alerted'; r.timer = 1; }
    s.hp = Math.min(s.hp, gm.vitals.hp);
  }, 5);
}, [P.OUTPOST_AT[0] + 26.5, 1024.5]);
await page.waitForFunction(() => window.__hv.game.time - window.__cover.t0 > 5, null, { timeout: LONG, polling: 200 }).catch(() => {});
const cover = await g(() => { clearInterval(window.__coverT); const l = window.__hv.game.wild.creatures.find((c) => c.kind === 'lookout'); return { ...window.__cover, mind: l?.mind }; });
check('behind a wall the lookout can’t hit you: he holds his aim, waiting', cover.hp === 100 && cover.shots === 0, `health ${cover.hp}, shots ${cover.shots}, lookout ${cover.mind}`);

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
// Lost at the end of the road? Hold H: two seconds later you are where you wake (the bed). The save checks
// below edit a block in the cave.
await g(() => { const v = window.__hv.game.vitals; v.hunger = 100; v.thirst = 100; v.hp = 100; }); // nobody starving: that hurts too
await page.keyboard.down('KeyH');
const wentHome = await page.waitForFunction(() => { const gm = window.__hv.game, p = gm.player, s = gm.spawn; p.yaw = (93 * Math.PI) / 180; return Math.hypot(p.x - s.x, p.z - s.z) < 0.5; }, null, { timeout: LONG, polling: 100 }).then(() => true, () => false);
await page.keyboard.up('KeyH');
check('holding H takes you home from the broken bridge', wentHome, await g(() => { const p = window.__hv.game.player, s = window.__hv.game.spawn; return `at ${p.x.toFixed(1)},${p.z.toFixed(1)}, wakes at ${s.x.toFixed(1)},${s.z.toFixed(1)}`; }));

// The outpost stays cleared after a save and a reload.
await ensureLook();
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Save now' }).click();
await page.waitForTimeout(800);
await page.reload();
await idle();
check('the outpost stays cleared after the reload', await g(() => window.__hv.game.wild.outpost.left === 0 && window.__hv.game.flags.has('outpost_cleared')));

await finish();

