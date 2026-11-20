// The play-through, part 6: Zone-4 and the uplink (Phase 8, docs/PHASE8.md). The ridge road's sign, the gate
// without a suit (the meter's warning; back out alive), Ray's word and the suit, the gate in the suit, the pass
// and Ray, the sump's edge, the observatory's optics, the yard's dish and racks with the Ashen behind their
// wall, a tablet; at home the antenna hoisted, the telescope, the terminal, the link, the first answer, the
// closing card, the queries and what they change, a medicine, a lure, the armour: M5. Last: the gate is a wall.
// Needs the build served: npx vite preview --port 4173. Run on its own, or all parts with: node tests/e2e/play.mjs
import { start } from './lib.mjs';

const { page, g, check, ensureLook, keepAlive, useAt, closeScreens, P, flags, LONG, standAt, waitFlag, hold, gameWait, finish } = await start();
const Z = P.ZONE4, Z4 = P.Z4, T = P.RIDGE_TOWER;
const count = (name) => g((n) => window.__hv.game.hotbar.count(window.__hv.itemId(n)), name);
const give = (list) => g((list) => { const h = window.__hv.game.hotbar, id = window.__hv.itemId; for (const [n, k] of list) { const have = h.count(id(n)); if (have < k) h.add(id(n), k - have); } }, list);
const road = (s) => g((s) => { const [x, z] = window.__hv.ridge.point(s); return [x, window.__hv.ridge.height(s) + 1, z]; }, s);
const mark = (i) => g((i) => window.__hv.ridge.mark(i), i);
const meter = () => page.locator('.hv-doseline').textContent().catch(() => '');
const toasts = () => page.locator('.hv-toast').allTextContents().catch(() => []);
const state = () => g(() => { const gm = window.__hv.game; return { dose: gm.dose, hp: gm.vitals.hp, x: gm.player.x, z: gm.player.z }; });
/** Stands on the ridge road `s` metres along it, on foot, facing up the road. */
const onRoad = async (s) => { const [x, , z] = await road(s); const [x2, , z2] = await road(s + 4); await standAt(x, z, Math.atan2(-(x2 - x), -(z2 - z))); };
/** A right-click on the block at c, standing at `from` and looking at its middle. */
const use = (c, from, dy = 0.5) => useAt(([c, from]) => { const gm = window.__hv.game; gm.player.flying = false; gm.player.setPosition(from[0], from[1], from[2]); },
  (gm, [c, , dy]) => { const p = gm.player, tx = c[0] + 0.5 - p.x, ty = c[1] + dy - p.eyeY, tz = c[2] + 0.5 - p.z; p.yaw = Math.atan2(-tx, -tz); p.pitch = Math.atan2(ty, Math.hypot(tx, tz)); const t = gm.target; return window.__hv.idle() && t && t.x === c[0] && t.y === c[1] && t.z === c[2]; }, [c, from, dy]);
/** Mines the block at c from `from`, with the pickaxe. */
const mine = async (c, from) => {
  await hold('steel_pickaxe');
  await ensureLook();
  await g(([from]) => { const gm = window.__hv.game; gm.player.flying = false; gm.player.setPosition(from[0], from[1], from[2]); }, [from]);
  await page.mouse.down();
  await page.waitForFunction((c) => { const gm = window.__hv.game, p = gm.player, tx = c[0] + 0.5 - p.x, ty = c[1] + 0.4 - p.eyeY, tz = c[2] + 0.5 - p.z; p.yaw = Math.atan2(-tx, -tz); p.pitch = Math.atan2(ty, Math.hypot(tx, tz)); gm.vitals.hp = Math.max(gm.vitals.hp, 60); return gm.world.blockAt(...c) === 0; }, c, { timeout: LONG, polling: 100 }).catch(() => {});
  await page.mouse.up();
};
const make = async (label, times = 1) => { for (let k = 0; k < times; k++) await page.locator('.iv-recipe', { hasText: label }).first().locator('.iv-make').click().catch(() => {}); };
const openWorkbench = () => useAt(() => { const gm = window.__hv.game; gm.player.setPosition(1820.5, 82, 1009.3); gm.player.yaw = 0; gm.player.pitch = -0.55; },
  (gm) => { gm.player.yaw = 0; gm.player.pitch = -0.55; const t = gm.target; return t && t.x === 1820 && t.z === 1007; });
const phone = () => useAt(() => { const gm = window.__hv.game; gm.player.setPosition(1811.5, 82, 1029.5); gm.player.yaw = -Math.PI / 2; gm.player.pitch = -0.25; },
  (gm) => { const t = gm.target; gm.player.yaw = -Math.PI / 2; gm.player.pitch = -0.25; return t && t.x === 1813 && t.y === 83 && t.z === 1029; });
const computer = () => useAt(() => { const gm = window.__hv.game; gm.player.setPosition(1811.5, 82, 1028.5); gm.player.yaw = -Math.PI / 2; gm.player.pitch = -0.25; },
  (gm) => { gm.player.yaw = -Math.PI / 2; gm.player.pitch = -0.25; const t = gm.target; return t && t.x === 1813 && t.y === 83 && t.z === 1028; });
/** Sets a block from the pack on the valley floor beside the garden (as a player would place it), at slot k. */
const setDown = (name, k) => g(([n, k]) => {
  const gm = window.__hv.game, w = gm.world, x = 1735 + 3 * k, z = 1058;
  let y = 90; while (y > 60 && w.blockAt(x, y - 1, z) === 0) y--;
  w.setBlock(x, y, z, window.__hv.itemId(n));
  gm.hotbar.remove(window.__hv.itemId(n), 1);
  for (let dz = 1; dz <= 3; dz++) for (let dy = 0; dy < 3; dy++) { const b = window.__hv.blockName(w.blockAt(x, y + dy, z + dz)); if (/fern|grass|bromeliad|orchid|bamboo/.test(b) && b !== 'grass') w.setBlock(x, y + dy, z + dz, 0); }
  return [x, y, z];
}, [name, k]);
const openAt = (c) => use(c, [c[0] + 0.5, c[1], c[2] + 2.8], 0.5);

// The scene the earlier parts leave behind: M4 done, the generator's plans sent, Ray known.
await g(() => {
  const gm = window.__hv.game, h = gm.hotbar, id = window.__hv.itemId;
  for (const f of ['m1_done', 'm2_done', 'm3_done', 'm4_done', 'shelter_found', 'marco_met', 'marco_trust1', 'home_hint', 'zone2_seen', 'zone3_entered', 'dam_seen', 'dam_crest', 'ashen_seen', 'doc_known', 'ray_known', 'ray_called',
    'hydro_plans', 'hydro_built', 'uplink_plans', 'dose_seen', 'rad_near', 'ate', 'drank', 'journal_read', 'armory_found', 'slept', 'left_valley']) gm.flags.add(f);
  h.slots.fill(null);
  for (const [n, k] of [['steel_pickaxe', 1], ['uplink_plans', 1]]) h.add(id(n), k);
  gm.paper.pace = 0; // the handshake and the card at once
});

// ---- The bend and the gate, with no suit --------------------------------------------------------------------
await onRoad(4);
check('at the avenue’s bend: the sign TORRE · OBSERVATORIO, and the toast says the lamps lead north to the tower', await waitFlag('ridge_bend'), (await flags()).slice(-4).join(' '));
check('the goal on screen has moved on to M5: reach the relay tower', /M5 · Reach the relay tower/.test((await page.locator('.hv-goal').textContent().catch(() => '')) ?? ''), (await page.locator('.hv-goal').textContent().catch(() => '')) ?? '');
await onRoad((await mark(4)) + 4);
check('at the gate, with no suit: the toast says the ground is poisoned and to call Ray', (await waitFlag('ridge_gate')) && (await toasts()).some((t) => /Call him from the cave/.test(t)), (await toasts()).join(' | ').slice(0, 160));
// A few steps past the board: the meter warns in red, the dose climbs; back out alive.
const inside = await road((await mark(5)) + 26), outside = await road((await mark(4)) - 12);
await g((p) => { const gm = window.__hv.game; gm.player.setPosition(p[0], p[1], p[2]); }, inside);
await page.waitForFunction(() => window.__hv.game.dose > 12, null, { timeout: LONG, polling: 50 }).catch(() => {});
const warn = await meter(), alarm = await page.locator('.hv-doseline.alarm').count();
await g((p) => { const gm = window.__hv.game; gm.player.setPosition(p[0], p[1], p[2]); }, outside);
await gameWait(1.5);
const out1 = await state();
await gameWait(1.5);
const out2 = await state();
check('past the board with no suit the meter says NO SUIT and the seconds to the limit, in red, and the dose climbs', /NO SUIT/.test(warn ?? '') && /limit in 0:\d\d/.test(warn ?? '') && alarm === 1, warn ?? '');
check('turned back in time: alive, a dose taken, and outside the signs it climbs no more', out1.hp > 0 && out1.dose > 12 && out1.dose < 100 && out2.dose <= out1.dose, JSON.stringify(out1));

// ---- Ray's word, the suit, the meeting asked for -------------------------------------------------------------
await g(() => { const gm = window.__hv.game; gm.player.setPosition(1811.5, 82, 1029.5); gm.dose = 0; gm.vitals.hp = 100; });
await phone();
await page.locator('.pp-panel .row', { hasText: 'Ray (R. Quispe' }).locator('.pp-call').click().catch(() => {});
await page.waitForTimeout(400);
const word = await page.locator('.pp-say').textContent().catch(() => '');
check('called after M4, Ray tells of the ridge and sends the suit’s pattern', (await flags()).includes('suit_word') && /Canvas, lead sheet/.test(word ?? ''), (word ?? '').slice(0, 90));
await closeScreens();
await give([['canvas', 4], ['scrap_lead', 4], ['glass', 1], ['charcoal', 2]]);
await openWorkbench();
await make('Hazard suit');
await closeScreens();
check('the hazard suit is made at the workbench from canvas, lead, glass and charcoal', (await count('hazard_suit')) === 1, `suit ×${await count('hazard_suit')}`);
await phone();
await page.locator('.pp-panel .row', { hasText: 'Ask Ray to meet' }).locator('.pp-call').click().catch(() => {});
await page.waitForTimeout(400);
check('carrying the suit, the phone’s second button asks Ray to the refuge: he will be there by day', (await flags()).includes('ray_coming'), ((await page.locator('.pp-panel').textContent().catch(() => '')) ?? '').slice(-160));
await closeScreens();

// ---- The gate in the suit; the pass; Ray ---------------------------------------------------------------------
await g((p) => { const gm = window.__hv.game; gm.hour = 11; gm.player.flying = true; gm.player.setPosition(p[0], 150, p[2]); }, inside);
await page.waitForFunction(() => window.__hv.idle(), null, { timeout: LONG, polling: 300 }).catch(() => {});
await g((p) => { const gm = window.__hv.game; gm.player.flying = false; gm.player.setPosition(p[0], p[1], p[2]); gm.dose = 0; }, inside);
await gameWait(5);
const suited = await state(), calm = await meter();
check('in the suit the same road costs a fortieth: a few seconds, about one of dose, and the meter is calm', suited.dose > 0.3 && suited.dose < 4 && /suit · limit in/.test(calm ?? '') && !/NO SUIT/.test(calm ?? '') && (await page.locator('.hv-doseline.alarm').count()) === 0, `${suited.dose.toFixed(2)} · ${calm}`);
await standAt(Z.clean.x - 3, Z.clean.z + 1, -Math.PI / 2);
const passSeen = await waitFlag('ridge_pass');
const d0 = (await state()).dose;
await gameWait(2);
check('the pass: inside the green boards the meter is still', passSeen && (await state()).dose <= d0 && ((await meter()) ?? '') === '', `${d0} → ${(await state()).dose}`);
await page.waitForFunction(() => { const gm = window.__hv.game; gm.hour = 11; return gm.wild.creatures.some((c) => c.kind === 'ray'); }, null, { timeout: LONG, polling: 200 }).catch(() => {});
const ray = await g(() => { const c = window.__hv.game.wild.creatures.find((o) => o.kind === 'ray'); return c ? [c.x, c.y, c.z] : null; });
check('Ray is at the refuge by day, by its door', !!ray && Math.hypot(ray[0] - P.RAY_SPOT.x, ray[2] - P.RAY_SPOT.z) < 1.5, JSON.stringify(ray));
await useAt((r) => { const gm = window.__hv.game; gm.player.setPosition(r[0] - 2.6, r[1], r[2]); },
  (gm, r) => { const p = gm.player, tx = r[0] - p.x, ty = r[1] + 1.2 - p.eyeY, tz = r[2] - p.z; p.yaw = Math.atan2(-tx, -tz); p.pitch = Math.atan2(ty, Math.hypot(tx, tz)); return window.__hv.idle() && gm.wild.creatures.some((c) => c.kind === 'ray'); }, ray ?? [P.RAY_SPOT.x, 110, P.RAY_SPOT.z]);
check('right-clicked, he hands over the dam’s modem and two boxes of tablets, once', (await flags()).includes('ray_met') && (await count('sat_modem')) === 1 && (await count('rad_tablets')) === 2, `modem ×${await count('sat_modem')} tablets ×${await count('rad_tablets')}`);
check('the hut’s stove is a stove: the pass is a place to cook and rest', /stove|range/.test(await g((c) => window.__hv.blockName(window.__hv.game.world.blockAt(...c)), Z4.HUT_STOVE)), await g((c) => window.__hv.blockName(window.__hv.game.world.blockAt(...c)), Z4.HUT_STOVE));

// ---- The sump's edge; the observatory; the yard ---------------------------------------------------------------
await standAt(Z.sump.x + Z.sump.r - 6, Z.sump.z, Math.PI / 2);
const sumpSeen = await waitFlag('ridge_sump');
const hot = await meter();
check('at the sump’s ring: the toast says go round, and the meter shows why (several times the road’s rate, in the suit)', sumpSeen && /\+(\d+)\/s/.test(hot ?? '') && Number((hot ?? '').match(/\+(\d+)\/s/)?.[1] ?? 0) >= 1, hot ?? '');
await g(() => { window.__woke = 0; window.__watch = setInterval(() => { const gm = window.__hv.game; if (gm.wild.creatures.some((c) => c.kind === 'ashen' && ['charge', 'windup', 'lunge', 'seek'].includes(c.mind))) window.__woke++; }, 100); });
await standAt(Z.observatory.x + 1.5, Z.observatory.z + 7, 0);
check('at the observatory: the toast says the optics come away with a pick', await waitFlag('ridge_dome'));
await mine(Z4.DOME_SCOPE, [Z4.DOME_SCOPE[0] + 0.5, Z4.DOME_SCOPE[1] - 1, Z4.DOME_SCOPE[2] + 2.3]);
check('the observatory’s telescope is mined for its optics', (await count('telescope_optics')) === 1, `optics ×${await count('telescope_optics')}`);
await standAt(T.x + 14, T.z - 6, Math.PI / 2);
check('the tower’s yard: the toast names the dish and the racks, and warns of the dark half', (await waitFlag('ridge_yard')) && (await waitFlag('yard_reached')));
await mine(Z4.DISH_PANELS[0], [Z4.DISH_PANELS[0][0] + 0.5, Z4.DISH_PANELS[0][1], Z4.DISH_PANELS[0][2] - 1.6]);
check('a panel of the fallen dish is mined: an antenna section', (await count('antenna_section')) === 1, `sections ×${await count('antenna_section')}`);
const rack = Z4.RELAY_RACKS[3];
await mine(rack, [rack[0] + 0.5, rack[1], rack[2] - 1.8]);
check('a rack in the station’s lit half is mined: rare components', (await count('rare_components')) >= 1, `components ×${await count('rare_components')}`);
await use(Z4.PHARMA_MANUAL, [Z4.PHARMA_MANUAL[0] - 1.5, Z4.PHARMA_MANUAL[1] - 1, Z4.PHARMA_MANUAL[2] + 1.5]);
check('the field pharmacy manual on its shelf is read: the bench and the distiller can be made', (await flags()).includes('pharma_learned'), ((await page.locator('.pp-panel').textContent().catch(() => '')) ?? '').slice(0, 80));
await closeScreens();
const stir = await g(() => { clearInterval(window.__watch); const gm = window.__hv.game; return { woke: window.__woke, about: gm.wild.creatures.filter((c) => c.kind === 'ashen').length, noticed: gm.flags.has('ashen_noticed') }; });
check('all of it taken by day from the yard and the lit half, a pick at work, the two of them behind their wall: neither stirred', stir.woke === 0 && stir.about >= 1, JSON.stringify(stir));

// A blue tablet binds thirty of the dose.
await g(() => { window.__hv.game.dose = 42; });
await hold('rad_tablets');
await useAt(() => { const gm = window.__hv.game; gm.player.setPosition(380.5, 127, 384.5); gm.player.pitch = 1.2; }, (gm) => { gm.player.pitch = 1.2; return !gm.target; });
const afterTablet = (await state()).dose;
check('a blue tablet binds thirty of the dose, and is used up', afterTablet > 11 && afterTablet < 14 && (await count('rad_tablets')) === 1, `${afterTablet.toFixed(1)} · tablets ×${await count('rad_tablets')}`);

// ---- Home: the run, the antenna, the telescope ----------------------------------------------------------------
await g(() => { const gm = window.__hv.game; gm.vitals.hp = 100; gm.player.setPosition(1796.5, 82, 1024.5); });
check('home alive from the ridge: M5’s run is done', await waitFlag('ridge_home'), (await flags()).slice(-6).join(' '));
await page.waitForFunction(() => window.__hv.idle(), null, { timeout: LONG, polling: 300 }).catch(() => {});
await use(P.HOIST, [P.HOIST[0] - 1.6, P.HOIST[1], P.HOIST[2] + 1.6], 0.4);
check('the builder’s hoist on the balcony says what it is for', (await toasts()).some((t) => /hoist: a winch/.test(t)) && !(await flags()).includes('antenna_up'), (await toasts()).join(' | ').slice(0, 140));
await give([['antenna_section', 3], ['steel_ingot', 16], ['wiring', 12], ['pipe_fittings', 4], ['glass', 8], ['planks', 2], ['rare_components', 6], ['copper_nugget', 6], ['plate_armor', 1], ['canvas', 2], ['battery_cell', 2], ['scrap_metal', 2]]);
await openWorkbench();
await make('Satellite antenna');
await closeScreens();
check('the satellite antenna is assembled at the workbench from three sections, steel, wiring and fittings', (await count('sat_antenna')) === 1 && (await count('antenna_section')) === 0, `antenna ×${await count('sat_antenna')}`);
await hold('sat_antenna');
await use(P.HOIST, [P.HOIST[0] - 1.6, P.HOIST[1], P.HOIST[2] + 1.6], 0.4);
const up = await g((m) => {
  const gm = window.__hv.game, w = gm.world;
  let dish = 0, mast = 0, top = 0;
  for (let x = m.x0 - 4; x <= m.x1; x++) for (let z = m.z - 3; z <= m.z + 3; z++) for (let y = m.above; y < m.above + 40; y++) { const b = window.__hv.blockName(w.blockAt(x, y, z)); if (b === 'sat_dish') { dish++; top = Math.max(top, y); } if (b === 'tower_steel') mast++; }
  return { flag: gm.flags.has('antenna_up'), dish, mast, top, held: gm.hotbar.count(window.__hv.itemId('sat_antenna')) };
}, P.MAST);
check('with the antenna in hand the hoist sets the mast and the dish on the cliff above the cave’s mouth', up.flag && up.dish === 21 && up.mast >= 6 && up.held === 0 && up.top > P.MAST.above, JSON.stringify(up));

// The telescope: made at a lathe, set under the sky on the balcony, looked through.
await g(() => { const h = window.__hv.game.hotbar; h.add(window.__hv.itemId('lathe'), 1); });
const latheAt = await setDown('lathe', 1);
await openAt(latheAt);
await make('Telescope');
await closeScreens();
check('the telescope is made at the lathe round the observatory’s optics', (await count('telescope')) === 1 && (await count('telescope_optics')) === 0, `telescope ×${await count('telescope')}`);
const scopeAt = [1795, 82, 1021];
await g((c) => { const gm = window.__hv.game; gm.world.setBlock(c[0], c[1], c[2], window.__hv.itemId('telescope')); gm.hotbar.remove(window.__hv.itemId('telescope'), 1); gm.player.setPosition(c[0] + 1.5, c[1], c[2] + 2.5); }, scopeAt);
check('set down under the sky on the balcony, it counts: M5’s telescope', await waitFlag('telescope_set'));
await g(() => { window.__hv.game.hour = 11; });
await use(scopeAt, [scopeAt[0] + 1.2, scopeAt[1], scopeAt[2] + 1.6], 0.6);
const through = await g(() => ({ fov: window.__hv.game.renderer.camera.fov, shown: !document.querySelector('.sc-wrap')?.hidden }));
const named = await g(() => { const gm = window.__hv.game, t = window.__hv.scopeTargets().find((q) => !q.hidden); if (!t) return null; gm.player.yaw = t.yaw; gm.player.pitch = t.pitch; return t.label; });
await page.waitForFunction(() => (document.querySelector('.sc-label')?.textContent ?? '') !== '', null, { timeout: 30_000, polling: 100 }).catch(() => {});
const label = await page.locator('.sc-label').textContent().catch(() => '');
check('right-clicked, the view narrows twelve times in a round field; aimed at a thing it knows, the cross-hairs name it', through.shown && through.fov < 8 && !!named && label === named, `${JSON.stringify(through)} · ${named} · ${label}`);
await page.keyboard.press('KeyE');
await page.waitForTimeout(300);
const back = await g(() => ({ fov: window.__hv.game.renderer.camera.fov, shown: !document.querySelector('.sc-wrap')?.hidden, pack: window.__hv.game.screen.isOpen }));
check('E steps back from the telescope: the view is whole again, and the pack did not open', back.fov > 70 && !back.shown && !back.pack, JSON.stringify(back));

// ---- The terminal, the link, the first answer, the card ------------------------------------------------------
await openWorkbench();
await make('Uplink terminal');
await closeScreens();
check('the uplink terminal is built round Ray’s modem (the plans kept)', (await count('uplink_terminal')) === 1 && (await count('sat_modem')) === 0 && (await count('uplink_plans')) === 1, `terminal ×${await count('uplink_terminal')}`);
await hold('uplink_terminal');
await computer();
const fitted = (await flags()).includes('uplink_fitted');
await page.locator('[data-action="Uplink"]').click().catch(() => {});
await page.waitForTimeout(300);
const down = (await page.locator('.up-panel').textContent().catch(() => '')) ?? '';
const canOpen = await page.locator('[data-open]').isEnabled().catch(() => null);
check('fitted to the builder’s computer, its Uplink page lists what the link needs: here the power is missing, and the link stays down', fitted && /POWER\s*--/.test(down) && /ANTENNA\s*OK/.test(down) && /LINK DOWN/.test(down) && canOpen === false, down.replace(/\s+/g, ' ').slice(0, 200));
await closeScreens();
// A generator in the creek (as in part 5).
const wet = await g(() => {
  const gm = window.__hv.game, w = gm.world, isWater = (x, y, z) => /water/.test(window.__hv.blockName(w.blockAt(x, y, z)));
  for (let z = 1040; z < 1075; z++) for (let x = 1650; x < 1720; x++) for (let y = 66; y < 74; y++) {
    if (w.blockAt(x, y, z) !== 0 || w.blockAt(x, y - 1, z) === 0 || isWater(x, y - 1, z)) continue;
    if (isWater(x + 1, y - 1, z) || isWater(x - 1, y - 1, z) || isWater(x, y - 1, z + 1) || isWater(x, y - 1, z - 1)) { w.setBlock(x, y, z, window.__hv.itemId('hydro_generator')); return [x, y, z]; }
  }
  return null;
});
await page.waitForFunction(() => window.__hv.game.devices.hydro_generator.length > 0, null, { timeout: LONG, polling: 200 }).catch(() => {});
await computer();
await page.locator('[data-action="Uplink"]').click().catch(() => {});
await page.waitForTimeout(300);
await page.locator('[data-open]').click().catch(() => {});
await page.waitForFunction(() => /ENDPOINTS/.test(document.querySelector('.up-out')?.textContent ?? ''), null, { timeout: 30_000, polling: 100 }).catch(() => {});
const first = (await page.locator('.up-out').textContent().catch(() => '')) ?? '';
check('with the generator turning the link opens, and the first answer comes unasked: the endpoints heard, one of them a beacon far to the north', !!wet && (await flags()).includes('uplink_live') && /ENDPOINTS HEARD/.test(first) && /MIRA-7/.test(first) && /BEACON/.test(first), first.replace(/\s+/g, ' ').slice(0, 160));
check('it does not speak: no lower-case letter, no question or greeting, in anything it printed', !/[a-z]/.test(first) && !/[!?]/.test(first) && !(await flags()).includes('agi_asked'), first.match(/[a-z!?].{0,20}/)?.[0] ?? '');
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
const card = (await page.locator('.end-card').textContent().catch(() => '')) ?? '';
check('putting the page down brings the closing card: it answered; the valley is yours; the rest is waiting', (await flags()).includes('ending_seen') && /^It answered\./.test(card) && /The valley is yours\. The rest is waiting\./.test(card) && /Mira/.test(card), card.slice(0, 120));
await page.locator('.end-btn').click({ force: true }).catch(() => {});
await page.waitForTimeout(400);
const after = await g(() => ({ paper: window.__hv.game.paper.isOpen, playing: window.__hv.game.playing }));
check('its one button goes back to the valley: the game goes on', !after.paper && after.playing, JSON.stringify(after));

// ---- The queries, and what they change ------------------------------------------------------------------------
await computer();
const story = await page.locator('[data-action="The story so far"]').count();
await page.locator('[data-action="Uplink"]').click().catch(() => {});
await page.waitForTimeout(300);
const ask = async (q) => { await page.locator(`[data-query="${q}"]`).click().catch(() => {}); await page.waitForTimeout(200); return (await page.locator('.up-out').textContent().catch(() => '')) ?? ''; };
const rad = await ask('RAD'), bio = await ask('BIO'), eph = await ask('EPH');
check('the queries are open at once, and “The story so far” is on the computer; RAD, BIO and EPH each answer in rows', story === 1 && /RAD/.test(rad) && /BIO/.test(bio) && /EPH/.test(eph) && ![rad, bio, eph].some((t) => /[a-z]/.test(t)), `${rad.slice(0, 40)} | ${bio.slice(0, 40)} | ${eph.slice(0, 40)}`);
const asked = await flags();
check('asking it something beyond the first answer is M5’s step, and each answer leaves its mark', ['agi_asked', 'agi_rad', 'agi_bio', 'agi_eph'].every((f) => asked.includes(f)), asked.filter((f) => /^agi_/.test(f)).join(' '));
await ask('SCH');
await page.locator('[data-pull="sch_sonic"]').click().catch(() => {});
await page.waitForTimeout(200);
const drawing = (await page.locator('.up-out').textContent().catch(() => '')) ?? '';
await page.locator('[data-pull="sch_armor"]').click().catch(() => {});
await page.waitForTimeout(200);
const shut = (await page.locator('.up-note').textContent().catch(() => '')) ?? '';
check('SCH sends one drawing a window: the sonic lure’s comes with its parts table; a second at once is refused', (await flags()).includes('sch_sonic') && !(await flags()).includes('sch_armor') && /QTY/.test(drawing) && /WINDOW SHUT/.test(shut), `${drawing.replace(/\s+/g, ' ').slice(0, 80)} · ${shut}`);
// Seven hours on, the window is open again.
await g(() => { const gm = window.__hv.game; gm.day += 1; });
await ask('SCH');
await page.locator('[data-pull="sch_armor"]').click().catch(() => {});
await page.waitForTimeout(200);
check('a window later the next drawing comes: the engineer’s armour', (await flags()).includes('sch_armor'));
await closeScreens();
// What the answers change: the meter on the road, the map table, the phone.
await phone();
const book = (await page.locator('.pp-panel').textContent().catch(() => '')) ?? '';
check('the beacon is on the phone: MIRA-7, a bearing and a distance, no voice', /MIRA-7/.test(book) && /no voice/.test(book), book.slice(0, 200));
await closeScreens();

// ---- What the drawings and the manual make ---------------------------------------------------------------------
await give([['corn', 4], ['water_jug', 1], ['charcoal', 3], ['herbs', 3], ['honey', 1], ['steel_ingot', 14], ['glass', 8], ['wiring', 8], ['rare_components', 5], ['copper_nugget', 6], ['pipe_fittings', 2], ['battery_cell', 1], ['scrap_metal', 2], ['plate_armor', 1], ['canvas', 2]]);
await openWorkbench();
await make('Medical bench');
await make('Distiller');
await make('Sonic lure');
await closeScreens();
check('the medical bench, the distiller and a pair of sonic lures are made at the workbench', (await count('med_bench')) === 1 && (await count('distiller')) === 1 && (await count('sonic_lure')) === 2 && (await flags()).includes('schematic_built'), `${await count('med_bench')} ${await count('distiller')} ${await count('sonic_lure')}`);
const stillAt = await setDown('distiller', 2), benchAt = await setDown('med_bench', 3);
await openAt(stillAt);
await make('Spirit');
await closeScreens();
await openAt(benchAt);
await make('Antibiotics');
await closeScreens();
check('with the generator turning the distiller makes spirit and the bench a medicine: M5’s medicine', (await count('antibiotics')) === 2 && (await flags()).includes('med_made'), `spirit ×${await count('spirit')} antibiotics ×${await count('antibiotics')}`);
await openAt(latheAt);
await make('Engineer’s armour');
await closeScreens();
check('the lathe makes the engineer’s armour from plate armour, steel and components', (await count('engineer_armor')) === 1 && (await flags()).includes('armor3_made'), `armour ×${await count('engineer_armor')}`);
const lureAt = await setDown('sonic_lure', 4);
await use(lureAt, [lureAt[0] + 0.5, lureAt[1], lureAt[2] + 2.2], 0.3);
const wail = await g((c) => ({ block: window.__hv.blockName(window.__hv.game.world.blockAt(...c)), running: window.__hv.game.running.length }), lureAt);
check('a lure set down and right-clicked starts to wail (its time runs, and the save keeps it)', wail.block === 'sonic_lure_on' && wail.running === 1, JSON.stringify(wail));
check('M5 · the uplink: all nine steps are done', await waitFlag('m5_done'), (await flags()).filter((f) => /ridge_home|ray_met|antenna_up|telescope_set|uplink_live|agi_asked|med_made|schematic_built|armor3_made/.test(f)).join(' '));
await computer();
const screen = (await page.locator('.pp-panel').textContent().catch(() => '')) ?? '';
check('the computer shows M5 done, and the link up', /M5 · the uplinkdone ✓/.test(screen.replace(/\s+/g, ' ')) || (/M5 · the uplink/.test(screen) && /link up/.test(screen)), screen.replace(/\s+/g, ' ').slice(-260));
await closeScreens();

// ---- Last: the gate is a wall. Without the suit the road past it kills, and you wake at the cave -------------
await g(() => { const gm = window.__hv.game, id = window.__hv.itemId; gm.hotbar.remove(id('hazard_suit'), 1); gm.dose = 0; gm.vitals.hp = 100; });
const deep = await road((await mark(5)) + 70);
await g((p) => { const gm = window.__hv.game; gm.hour = 11; gm.player.flying = true; gm.player.setPosition(p[0], 150, p[2]); }, deep);
await page.waitForFunction(() => window.__hv.idle(), null, { timeout: LONG, polling: 300 }).catch(() => {});
await g((p) => { const gm = window.__hv.game; gm.player.flying = false; gm.player.setPosition(p[0], p[1], p[2]); gm.dose = 0; gm.vitals.hp = 100; window.__t0 = gm.playTime; }, deep);
const died = await page.waitForFunction(() => window.__hv.game.player.x > 1500, null, { timeout: LONG, polling: 50 }).then(() => true, () => false);
const end = await g(() => { const gm = window.__hv.game; return { x: Math.round(gm.player.x), seconds: Math.round((gm.playTime - window.__t0) * 10) / 10, dose: Math.round(gm.dose), pack: gm.hotbar.slots.filter(Boolean).length }; });
check('seventy metres past the gate with no suit: dead in under twenty seconds, awake at the cave, the pack left on the road', died && end.seconds < 20 && end.pack === 0 && end.dose === 100, JSON.stringify(end));

await finish();
