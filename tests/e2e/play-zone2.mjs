// The play-through, part 3: Zone-2 and power (Phase 6, docs/PHASE6.md). At home: the solar arrays, the battery
// bank and the rig, the computer's power lines, the pump; Doc by phone; gunpowder, bullets and rounds; Marco's
// trust 2 and his guns. Needs the build served: npx vite preview --port 4173.
// Run on its own, or all parts with: node tests/e2e/play.mjs
import { start } from './lib.mjs';

const { page, g, check, ensureLook, keepAlive, useAt, closeScreens, P, flags, LONG, standAt, walkTo, waitFlag, hold, finish } = await start();
const Z = P.ZONE2, Z2 = P.Z2;
const hx = (z) => 797 + 7 * Math.sin((Z.highway.z0 - z) / 95); // the highway's centre line (layout.ts, highwayX)

// The scene parts 1 and 2 leave behind: Marco met and trusted, home from Zone-1, the scout's armband kept.
await g(() => {
  const gm = window.__hv.game, h = gm.hotbar, id = window.__hv.itemId;
  for (const f of ['shelter_found', 'marco_met', 'marco_trust1', 'home_hint']) gm.flags.add(f);
  h.slots.fill(null);
  for (const [n, k] of [['steel_pickaxe', 1], ['armband', 1], ['empty_jug', 2]]) h.add(id(n), k);
});

// ---- The land: up the highway from the camp to the ruins, the radiation, the cave, the compound -------------
// The faction's men stay in for the walk (their fight is checked on its own below).
await g(() => { window.__hv.game.wild.faction.down = 31; });
// 1. The camp's north edge: the lit highway sign.
await standAt(hx(Z.highway.z0 - 4), Z.highway.z0 - 4, 0);
check('at the camp’s north edge, the highway sign: CARRETERA 4 · LAS CRUCES', await waitFlag('highway_seen'), (await flags()).join(' '));
// 2. North past the border into Zone-2, with the armband: the toast says what it does.
await standAt(hx(Z.border.z + 12), Z.border.z + 12, 0);
await walkTo(0, (p, z) => p.z < z, Z.border.z - 8);
check('past the painted barriers, Zone 2: the toast names the danger and the armband', await waitFlag('zone2_seen'));
// 3. The ruins: the toast, the compound's mark up the road, the hardware store's stock, a fridge mined for its unit, Doc's card.
await walkTo(0, (p, z) => p.z < z, Z.mall.z1 - 6);
check('the ruins: shops on the right, the exchange on the left, and the toast says what to take', await waitFlag('ruins_seen'));
check('looking up the highway from the ruins, the broken circle over Las Cruces’ gate', await waitFlag('compound_seen'));
await useAt((c) => { const gm = window.__hv.game; gm.player.setPosition(c[0] - 2.3, c[1], c[2] + 0.5); gm.player.yaw = -Math.PI / 2; gm.player.pitch = -0.45; },
  (gm, c) => { gm.player.yaw = -Math.PI / 2; gm.player.pitch = -0.45; const t = gm.target; return t && t.x === c[0] && t.z === c[2]; }, Z2.HARDWARE_CRATE);
const stock = await page.locator('.iv-title').first().textContent().catch(() => '');
await page.locator('.iv-grid').first().locator('.iv-slot').first().click({ modifiers: ['Shift'] }).catch(() => {});
await closeScreens();
check('the hardware store’s stock crate opens: the pump unit is taken', /Hardware/.test(stock ?? '') && (await g(() => window.__hv.game.hotbar.count(window.__hv.itemId('pump_unit')))) === 1, stock ?? '');
await hold('steel_pickaxe');
await ensureLook();
const fridge = Z2.DISPLAY_FRIDGES[0];
await g((f) => { const gm = window.__hv.game; gm.player.setPosition(f[0] - 2 + 0.5, f[1], f[2] + 0.5); gm.player.yaw = -Math.PI / 2; gm.player.pitch = -0.3; }, fridge);
await page.mouse.down();
await page.waitForFunction((f) => { const gm = window.__hv.game; gm.player.yaw = -Math.PI / 2; gm.player.pitch = -0.3; return gm.world.blockAt(...f) === 0; }, fridge, { timeout: LONG, polling: 100 }).catch(() => {});
await page.mouse.up();
check('a dead display fridge is mined for its fridge unit', (await g(() => window.__hv.game.hotbar.count(window.__hv.itemId('fridge_unit')))) === 1);
await useAt((c) => { const gm = window.__hv.game; gm.player.setPosition(c[0] - 2.3, c[1], c[2] + 0.5); gm.player.yaw = -Math.PI / 2; gm.player.pitch = -0.35; },
  (gm, c) => { gm.player.yaw = -Math.PI / 2; gm.player.pitch = -0.35; const t = gm.target; return t && t.x === c[0] && t.z === c[2]; }, Z2.PHARMACY_COUNTER);
check('the pharmacy counter has Doc’s card: his number goes into the phone', (await flags()).includes('doc_known'));
// 4. Radiation: at the edge of the van's ring the counter clicks, the toast warns, and the dose climbs on the HUD.
const van = Z.hotspots[0];
await standAt(van.x + van.r + 2.5, van.z + 0.5, -Math.PI / 2);
check('near the van, the warning: a hiss and clicking, stay outside the signs', await waitFlag('rad_near'));
await g((v) => { const gm = window.__hv.game; gm.player.setPosition(v.x + 1.5, gm.player.y, v.z + 3.5); }, van);
await page.waitForFunction(() => window.__hv.game.dose > 3, null, { timeout: LONG, polling: 200 }).catch(() => {});
const dose = await g(() => ({ dose: window.__hv.game.dose, meter: getComputedStyle(document.querySelector('.hv-dose')).display !== 'none', hp: window.__hv.game.vitals.hp }));
check('inside the ring the dose climbs, shown on the HUD, and caps health', dose.dose > 3 && dose.meter && dose.hp <= 100 - 0.6 * dose.dose + 1, JSON.stringify(dose));
await g((v) => { const gm = window.__hv.game; gm.player.setPosition(v.x + v.r + 6, gm.player.y, v.z); }, van);
// 5. The hot-spring cave: the lit mouth, and saltpeter mined from the decline's walls.
await standAt(Z.cave.mouthX - 6, Z.cave.z + 0.5, -Math.PI / 2);
check('the cave’s lit mouth: the toast says saltpeter and sulfur are inside', await waitFlag('cave_seen'));
const salt = await g(([cv, F]) => {
  const w = window.__hv.game.world;
  for (let k = 1; k < cv.depth; k++) for (const dz of [-2, 2]) for (let dy = 0; dy < 4; dy++) { const x = cv.mouthX + k, y = F - k + dy, z = cv.z + dz; if (window.__hv.blockName(w.blockAt(x, y, z)) === 'saltpeter_crust') return [x, y, z]; }
  return null;
}, [Z.cave, Z2.CAVE_FLOOR + Z.cave.depth]);
if (salt) {
  await ensureLook();
  // Stand on the decline's floor beside it, in the middle of the way down.
  await g(([s, cv, KF]) => { const gm = window.__hv.game; gm.player.setPosition(s[0] + 0.5, KF - (s[0] - cv.mouthX), cv.z + 0.5); }, [salt, Z.cave, Z2.CAVE_FLOOR + Z.cave.depth]);
  await page.mouse.down();
  await page.waitForFunction((s) => { const gm = window.__hv.game, p = gm.player, dx = s[0] + 0.5 - p.x, dy = s[1] + 0.5 - p.eyeY, dz = s[2] + 0.5 - p.z; p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.atan2(dy, Math.hypot(dx, dz)); return gm.world.blockAt(...s) === 0; }, salt, { timeout: LONG, polling: 100 }).catch(() => {});
  await page.mouse.up();
}
check('saltpeter is mined from the decline’s white crust', (await g(() => window.__hv.game.hotbar.count(window.__hv.itemId('saltpeter')))) >= 1, JSON.stringify(salt));
// 6. The armband: a patrol takes you for one of theirs from 20 m; at 10 m he looks again and knows.
await standAt(hx(700) - 1.5, 700, 0);
const met = await g(() => {
  const gm = window.__hv.game, p = gm.player;
  gm.wild.creatures = gm.wild.creatures.filter((c) => !['patrol', 'sentry', 'guard'].includes(c.kind));
  gm.wild.faction.alert = false; gm.wild.faction.blown = false; gm.wild.faction.down = 31;
  const c = window.__hv.spawn('patrol', p.x, p.z - 20);
  if (!c) return false;
  c.mind = 'watch'; c.squad = 1; c.yaw = Math.PI; c.post = { x: c.x, y: c.y, z: c.z, yaw: Math.PI }; c.route = undefined;
  window.__patrol = c;
  return true;
});
await page.waitForFunction(() => window.__hv.game.time > (window.__t2 = window.__t2 ?? window.__hv.game.time) + 4, null, { timeout: LONG, polling: 200 }).catch(() => {});
const passed = await g(() => ({ alert: window.__hv.game.wild.faction.alert, mind: window.__patrol && window.__patrol.mind }));
check('with the armband, a patrol 20 m off takes you for one of his own', met && !passed.alert && passed.mind === 'watch', JSON.stringify(passed));
await g(() => { const gm = window.__hv.game, c = window.__patrol; gm.player.setPosition(c.x, gm.player.y, c.z + 10); gm.player.yaw = 0; });
const seen = await page.waitForFunction(() => { window.__hv.game.vitals.hp = 100; return window.__hv.game.wild.faction.alert; }, null, { timeout: LONG, polling: 100 }).then(() => true, () => false);
check('at 10 m he looks again, and knows you aren’t: the alarm', seen);
// 7. Home alive from the ruins: M3's first step. (Set straight home: being shot at stops H.)
await g(() => { const gm = window.__hv.game; gm.wild.creatures = gm.wild.creatures.filter((c) => !['patrol', 'sentry', 'guard'].includes(c.kind)); gm.wild.faction.alert = false; gm.vitals.hp = 100; gm.player.setPosition(gm.spawn.x || 1796.5, gm.spawn.y || 82, gm.spawn.z || 1024.5); });
check('home alive from the ruins at Las Cruces: M3’s run is done', await waitFlag('zone2_home'), (await flags()).join(' '));

// ---- At home: power, the rig, Doc, ammunition, Marco -------------------------------------------------------
// The rest of a run's salvage is put in the pack here (each kind is found as checked above).
await g(() => {
  const h = window.__hv.game.hotbar, id = window.__hv.itemId;
  for (const [n, k] of [['pv_panel', 8], ['wiring', 16], ['planks', 24], ['nails', 32], ['battery_cell', 6], ['gpu', 2], ['psu', 1], ['mining_board', 1], ['pipe_fittings', 2]]) h.add(id(n), k);
});

/** Opens a station or thing at (x, y, z) from 2.8 m south of it, looking north. */
const openAt = (c) => useAt((c) => { const gm = window.__hv.game; gm.player.setPosition(c[0] + 0.5, c[1], c[2] + 2.8); gm.player.yaw = 0; gm.player.pitch = -0.35; },
  (gm, c) => { gm.player.yaw = 0; gm.player.pitch = -0.35; const t = gm.target; return t && t.x === c[0] && t.y === c[1] && t.z === c[2]; }, c);
const openWorkbench = () => useAt(() => { const gm = window.__hv.game; gm.player.setPosition(1820.5, 82, 1009.3); gm.player.yaw = 0; gm.player.pitch = -0.55; },
  (gm) => { gm.player.yaw = 0; gm.player.pitch = -0.55; const t = gm.target; return t && t.x === 1820 && t.z === 1007; });
const make = async (label, times = 1) => { for (let k = 0; k < times; k++) await page.locator('.iv-recipe', { hasText: label }).first().locator('.iv-make').click().catch(() => {}); };
const count = (name) => g((n) => window.__hv.game.hotbar.count(window.__hv.itemId(n)), name);
/** Sets a block from the pack on the valley floor beside the garden (as a player would place it), at slot k. */
const setDown = (name, k) => g(([n, k]) => {
  const gm = window.__hv.game, w = gm.world, x = 1735 + 3 * k, z = 1058;
  let y = 90; while (y > 60 && w.blockAt(x, y - 1, z) === 0) y--;
  w.setBlock(x, y, z, window.__hv.itemId(n));
  gm.hotbar.remove(window.__hv.itemId(n), 1);
  return [x, y, z];
}, [name, k]);

// 1. Two solar arrays from the ruins' panels, set out in the sun: the battery bank's recipe appears.
await openWorkbench();
const bankHidden = !(await page.locator('.iv-recipe', { hasText: 'Battery bank' }).count());
await make('Solar array', 2);
check('two solar arrays are made at the workbench (the bank not offered before one is built)', (await count('solar_array')) === 2 && bankHidden, `arrays ×${await count('solar_array')}`);
await closeScreens();
await setDown('solar_array', 0);
await setDown('solar_array', 1);
check('set out at home, the array ticks M3’s step', await waitFlag('array_built'), (await flags()).join(' '));

// 2. The battery bank, then the rig, the fridge and the pump (each offered only once the bank is built).
await openWorkbench();
await make('Battery bank');
await closeScreens();
await setDown('battery_bank', 2);
check('the battery bank is made and set down: power day and night', await waitFlag('bank_built'));
await openWorkbench();
await make('Bitcoin mining rig');
await make('Fridge');
await make('Water pump');
const built = { rig: await count('mining_rig'), fridge: await count('fridge'), pump: await count('water_pump') };
check('the rig, the fridge and the pump are made once the bank is built', built.rig === 1 && built.fridge === 1 && built.pump === 1, JSON.stringify(built));
await closeScreens();
const rigAt = await setDown('mining_rig', 3);
await setDown('fridge', 4);
const pumpAt = await setDown('water_pump', 5);

// 3. By day the rig runs and earns: its first sats tick M3's step and land in the wallet.
const wallet0 = await g(() => window.__hv.game.wallet);
await g(() => { window.__hv.game.hour = 11; });
check('the rig earns its first sats while the sun shines', await waitFlag('rig_earned'), await g(() => JSON.stringify(window.__hv.game.power)));
check('what it earns goes into the hot wallet', (await g(() => window.__hv.game.wallet)) > wallet0);
check('the fridge and the pump at home tick their step', (await flags()).includes('fridge_pump'));

// 4. The computer's power lines: the arrays, the bank, the rig's hashrate and what it has mined.
await useAt(() => { const gm = window.__hv.game; gm.player.setPosition(1805.5, 82, 1030.5); gm.player.yaw = Math.PI / 2; gm.player.pitch = -0.25; },
  (gm) => { gm.player.yaw = Math.PI / 2; gm.player.pitch = -0.25; const t = gm.target; return t && t.x === 1803 && t.z === 1030; });
const screen = await page.locator('.pp-panel').textContent().catch(() => '');
check('the computer shows the power, the rig’s hashrate and what it has mined', /TH\/s/.test(screen ?? '') && /Mined today/.test(screen ?? '') && /M3 · power up/.test(screen ?? ''), (screen ?? '').replace(/\s+/g, ' ').slice(0, 160));
await closeScreens();

// 5. The pump fills the jugs carried.
await openAt(pumpAt);
check('the pump fills every empty jug carried', (await count('water_jug')) === 2 && (await count('empty_jug')) === 0, `jugs ${await count('water_jug')}`);
void rigAt;

// 6. Doc, by phone: a dose from the hotspots is treated, and the call ticks M3's step.
await g(() => { window.__hv.game.dose = 30; });
await useAt(() => { const gm = window.__hv.game; gm.player.setPosition(1804.5, 82, 1027.5); gm.player.yaw = -Math.PI / 2; gm.player.pitch = -0.25; },
  (gm) => { const t = gm.target; gm.player.yaw = -Math.PI / 2; gm.player.pitch = -0.25; return t && t.x === 1806 && t.y === 83 && t.z === 1027; });
const phone = await page.locator('.pp-panel').textContent().catch(() => '');
check('the phone has Doc once his card is found', /Doc/.test(phone ?? ''), (phone ?? '').slice(0, 100));
await page.locator('.pp-panel .row', { hasText: 'Doc' }).locator('.pp-call').click().catch(() => {});
await page.waitForTimeout(400);
const docView = await page.locator('.pp-panel').textContent().catch(() => '');
await page.locator('.pp-trade .row', { hasText: 'Rad treatment' }).locator('button').click().catch(() => {});
await page.waitForTimeout(300);
const treated = await g(() => ({ dose: window.__hv.game.dose, called: window.__hv.game.flags.has('doc_called') }));
check('Doc talks you through rad treatment: the dose is gone', /Ibáñez|doctor/i.test(docView ?? '') && treated.dose === 0 && treated.called, JSON.stringify(treated));
await closeScreens();

// 7. Ammunition: the powder mill makes gunpowder from saltpeter, charcoal and sulfur; the forge a bullet mould
// and bullets from scrap lead; the workbench rounds.
await g(() => {
  const h = window.__hv.game.hotbar, id = window.__hv.itemId;
  for (const [n, k] of [['cobble', 4], ['iron_ingot', 4], ['saltpeter', 2], ['sulfur', 1], ['charcoal', 3], ['stick', 1], ['scrap_lead', 1], ['brass_casing', 4], ['primer', 4]]) h.add(id(n), k);
});
await openWorkbench();
await make('Powder mill');
await closeScreens();
const millAt = await setDown('powder_mill', 6);
await openAt(millAt);
await make('Gunpowder');
check('the powder mill makes gunpowder', (await count('gunpowder')) === 2, `gunpowder ×${await count('gunpowder')}`);
await closeScreens();
await g(() => window.__hv.game.hotbar.add(window.__hv.itemId('forge'), 1));
const forgeAt = await setDown('forge', 7);
await openAt(forgeAt);
await make('Bullet mould');
await make('Lead bullet');
check('the forge makes a bullet mould, then bullets from scrap lead (the mould kept)', (await count('bullet')) === 8 && (await count('bullet_mold')) === 1, `bullets ×${await count('bullet')}`);
await closeScreens();
await openWorkbench();
await make('Pistol rounds');
check('rounds are made at the workbench: M3’s ammunition step', (await count('pistol_rounds')) === 4 && (await flags()).includes('ammo_made'), `rounds ×${await count('pistol_rounds')}`);
await closeScreens();

// 8. Marco: the first call after coming home from Las Cruces earns trust 2, and his trade now has guns.
await useAt(() => { const gm = window.__hv.game; gm.player.setPosition(1804.5, 82, 1027.5); gm.player.yaw = -Math.PI / 2; gm.player.pitch = -0.25; },
  (gm) => { const t = gm.target; gm.player.yaw = -Math.PI / 2; gm.player.pitch = -0.25; return t && t.x === 1806 && t.y === 83 && t.z === 1027; });
await page.locator('.pp-panel .row', { hasText: 'Marco' }).locator('.pp-call').click().catch(() => {});
await page.waitForTimeout(300);
const said = await page.locator('.pp-say').textContent().catch(() => '');
check('calling Marco after Las Cruces earns trust 2', (await flags()).includes('marco_trust2') && /Las Cruces/.test(said ?? ''), (said ?? '').slice(0, 90));
await closeScreens();
await ensureLook();
await g((P) => { const gm = window.__hv.game; gm.hour = 12; gm.player.setPosition(P.MARCO_SPOT[0], P.ZONE1.shelter.floor, P.MARCO_SPOT[2] + 2.6); }, P);
await page.waitForFunction(() => window.__hv.idle() && window.__hv.game.wild.creatures.some((c) => c.kind === 'marco'), null, { timeout: LONG, polling: 300 }).catch(() => {});
await useAt(() => { const p = window.__hv.game.player; p.yaw = 0; p.pitch = 0; },
  (gm) => { gm.player.yaw = 0; gm.player.pitch = 0; return !!gm.wild.creatures.find((c) => c.kind === 'marco') && !!gm.creatureInSight(4); });
const trade = await page.locator('.pp-trade').textContent().catch(() => '');
await page.locator('.pp-trade .row', { hasText: 'Pistol rounds' }).locator('button').first().click().catch(() => {});
await page.waitForTimeout(300);
check('Marco sells guns and rounds now; buying ticks M3’s step', /Pistol/.test(trade ?? '') && (await flags()).includes('marco_guns'), (trade ?? '').slice(0, 120));
await closeScreens();
await keepAlive();

await finish();
