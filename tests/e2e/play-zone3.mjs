// The play-through, part 5: Zone-3 and hydro (Phase 7, docs/PHASE7.md). The dam road and the barricade, the
// dam, Ray's logbook, the first Ashen by day (seen from the bend, walked past, woken and dodged, stopped at
// the dam; hold H refused), the salvage; at home steel, the lathe, Ray's plans, the hydro generator in the
// creek, the farm on the computer, the uplink plans, a gun mod and plate armour: M4.
// Needs the build served: npx vite preview --port 4173. Run on its own, or all parts with: node tests/e2e/play.mjs
import { start } from './lib.mjs';

const { page, g, check, ensureLook, keepAlive, useAt, closeScreens, P, flags, LONG, standAt, walkTo, waitFlag, hold, finish } = await start();
const Z = P.ZONE3, Z3 = P.Z3, D = Z.dam, A = Z.avenue;
const hx = (z) => 797 + 7 * Math.sin((P.ZONE2.highway.z0 - z) / 95); // the highway's centre line (layout.ts, highwayX)
const count = (name) => g((n) => window.__hv.game.hotbar.count(window.__hv.itemId(n)), name);
const gameSeconds = (s) => g(() => { window.__t0 = window.__hv.game.time; }).then(() => page.waitForFunction((s) => window.__hv.game.time > window.__t0 + s, s, { timeout: LONG, polling: 200 }).catch(() => {}));
const ashen = () => g(() => window.__hv.game.wild.creatures.filter((c) => c.kind === 'ashen').map((c) => ({ x: c.x, z: c.z, mind: c.mind, post: !!c.post, keen: !!c.keen })));

// The scene the earlier parts leave behind: home from Las Cruces with the armband, Marco and Doc known.
await g(() => {
  const gm = window.__hv.game, h = gm.hotbar, id = window.__hv.itemId;
  // (M1 to M3 are done: the parts before check them, and M4's recipes need M3.)
  for (const f of ['m1_done', 'm2_done', 'm3_done', 'shelter_found', 'marco_met', 'marco_trust1', 'home_hint', 'zone2_seen', 'ruins_seen', 'highway_seen', 'compound_seen', 'zone2_home', 'doc_known', 'focus_hint', 'mid_seen', 'deep_seen']) gm.flags.add(f);
  h.slots.fill(null);
  for (const [n, k] of [['steel_pickaxe', 1], ['armband', 1], ['machete', 1]]) h.add(id(n), k);
  gm.wild.faction.down = 31; // the faction's men stay in for the walk (their fight is part 4's)
});

// ---- The way there: the sign on the highway, the dam road, the barricade, the dam ---------------------------
// (Just north of the border's chicane, which is walked round in part 4.)
await standAt(hx(D.z + 7) + 1, D.z + 7, 0);
await walkTo(0, (p, z) => p.z < z, D.z + 3);
check('on the highway just past the border, the sign: PRESA RÍO SECO, and a lit road west', await waitFlag('dam_road_seen'), (await flags()).slice(-6).join(' '));
await standAt(Z.barricade.x + 24, D.z, Math.PI / 2);
await walkTo(Math.PI / 2, (p, x) => p.x < x, Z.barricade.x + 8);
check('at the faction’s barricade: NO PASAR · CENIZOS, and the toast names Zone 3 and what lives there', await waitFlag('dam_seen'));
await standAt(D.x1 - 4, D.z, Math.PI / 2);
const reachedMid = await walkTo(Math.PI / 2, (p, x) => p.x < x, D.spill);
const deck = await g(() => ({ y: window.__hv.game.player.y, z: window.__hv.game.player.z }));
check('the dam’s deck is walked from its east end to the middle, level, between the parapets', reachedMid && deck.y === D.crest && Math.abs(deck.z - D.z) < 2.5, JSON.stringify(deck));
check('on the crest: the toast says the dam still makes power, and that they don’t come onto it', await waitFlag('dam_crest'));

// ---- The control house: Ray's logbook ----------------------------------------------------------------------
await useAt((c) => { const gm = window.__hv.game; gm.hour = 11; gm.player.flying = false; gm.player.setPosition(c[0] - 1.4, c[1], c[2] + 0.5); gm.player.yaw = -Math.PI / 2; gm.player.pitch = -0.6; },
  (gm, c) => { gm.player.yaw = -Math.PI / 2; gm.player.pitch = -0.6; const t = gm.target; return window.__hv.idle() && t && t.x === c[0] && t.z === c[2]; }, Z3.LOGBOOK_DESK);
check('the engineer’s logbook on the desk: Ray’s number goes into the phone', (await flags()).includes('ray_known'), (await flags()).slice(-5).join(' '));

// ---- The first Ashen: seen from the bend above, by day, standing in the road -------------------------------
await standAt(A.x + 0.5, D.z + 3, Math.PI, -0.13);
await page.waitForFunction(() => { const gm = window.__hv.game, p = gm.player; p.yaw = Math.PI; p.pitch = -0.13; gm.hour = 11; return gm.wild.creatures.some((c) => c.kind === 'ashen' && c.post); }, null, { timeout: LONG, polling: 200 }).catch(() => {});
const firstSeen = await page.waitForFunction(() => { const gm = window.__hv.game, p = gm.player; p.yaw = Math.PI; p.pitch = -0.13; return gm.flags.has('ashen_seen'); }, null, { timeout: LONG, polling: 200 }).then(() => true, () => false);
const first = (await ashen()).find((a) => a.post);
check('from the bend, by day, one of them stands in the road below, its back to you: the toast says what it is and how to pass', firstSeen && !!first && Math.abs(first.x - A.x) < 2 && first.mind === 'wander', JSON.stringify(first));
check('nine of them in all, and only this one out by day', (await ashen()).length <= 9 && (await ashen()).filter((a) => a.post).length === 1, `${(await ashen()).length} about`);

// Walked past, seven paces wide and behind its face: it never notices.
await standAt(A.x - 6.5, Z.firstAshen.z - 22, Math.PI);
const walkedPast = await walkTo(Math.PI, (p, z) => p.z > z, Z.firstAshen.z + 14);
const after = (await ashen()).find((a) => a.post);
check('a careful player walks past it by day, wide and behind its face, and it never turns', walkedPast && !!after && after.mind === 'wander' && !(await flags()).includes('ashen_noticed'), JSON.stringify(after));

// Woken on purpose: stand in front of its face. It notices, comes, rears and shrieks; a step back and it misses.
await g((f) => { const gm = window.__hv.game; gm.vitals.hp = 100; gm.player.setPosition(f.x, gm.player.y, f.z + 4.5); gm.player.yaw = 0; gm.player.pitch = 0; }, Z.firstAshen);
await ensureLook();
const shrieked = await page.waitForFunction(() => { const gm = window.__hv.game, p = gm.player; p.yaw = 0; p.pitch = 0; return gm.wild.creatures.some((c) => c.kind === 'ashen' && c.mind === 'windup'); }, null, { timeout: LONG, polling: 30 }).then(() => true, () => false);
await page.keyboard.down('KeyS');
const missed = await page.waitForFunction(() => { const gm = window.__hv.game, p = gm.player; p.yaw = 0; p.pitch = 0; return gm.flags.has('ashen_missed') || gm.vitals.hp < 100; }, null, { timeout: LONG, polling: 30 }).then(() => true, () => false);
await page.keyboard.up('KeyS');
const dodge = await g(() => ({ hp: window.__hv.game.vitals.hp, missed: window.__hv.game.flags.has('ashen_missed'), shriek: window.__hv.game.flags.has('ashen_shriek'), noticed: window.__hv.game.flags.has('ashen_noticed') }));
check('in front of its face it notices, comes, rears and shrieks (the warning)', shrieked && dodge.shriek && dodge.noticed, JSON.stringify(dodge));
check('stepping back when it shrieks, the lunge misses: no harm done', missed && dodge.missed && dodge.hp === 100, JSON.stringify(dodge));

// Hold H is no escape, and the dam is: with one hunting close by, H does nothing; on the dam's deck it cannot follow.
await g(([x0, z, y]) => {
  const gm = window.__hv.game, c = gm.wild.creatures.find((o) => o.kind === 'ashen' && !['wander', 'seek', 'notice'].includes(o.mind)) ?? gm.wild.creatures.find((o) => o.kind === 'ashen');
  c.x = x0 - 12; c.z = z; c.y = y; c.mind = 'charge'; c.lost = 0; c.post = undefined; c.leg = 9;
  window.__hunter = c;
  gm.vitals.hp = 100;
  gm.player.setPosition(x0 + 5.5, y, z);
  gm.player.yaw = Math.PI / 2;
}, [D.x0, D.z, D.crest]);
await ensureLook();
await page.keyboard.down('KeyH');
await gameSeconds(3.5);
await page.keyboard.up('KeyH');
const held = await g(() => ({ x: window.__hv.game.player.x, hunting: ['charge', 'windup', 'lunge', 'recover'].includes(window.__hunter.mind), held: window.__hv.game.home.held }));
check('hold H does nothing with one of them hunting you close by', held.x < 700 && held.held === null, JSON.stringify(held));
await gameSeconds(6);
const stopped = await g(() => ({ ax: window.__hunter.x, hp: window.__hv.game.vitals.hp, px: window.__hv.game.player.x }));
check('it comes to the dam’s end and stops: it never steps onto the deck, and the player on it is unharmed', stopped.ax < D.x0 - 1 && stopped.ax > D.x0 - 14 && stopped.hp === 100, JSON.stringify(stopped));

// ---- The avenue by day with every one of them in its nest: walked down its middle, past the dark bays ---------
// (The review's walk: the bays used to see 20 m out into the road. Any mind but 'wander' from here on is counted.)
await g(() => {
  const gm = window.__hv.game;
  gm.wild.ashen.down = 0; gm.wild.ashen.firstOut = false; gm.hour = 11; gm.vitals.hp = 100;
  gm.wild.creatures = gm.wild.creatures.filter((c) => c.kind !== 'ashen');
  window.__woke = 0;
  window.__watch = setInterval(() => { if (gm.wild.creatures.some((c) => c.kind === 'ashen' && c.mind !== 'wander')) window.__woke++; }, 40);
});
const nests = () => g(() => window.__hv.game.wild.creatures.filter((c) => c.kind === 'ashen' && !c.post).length);
await standAt(A.x + 0.5, Z.powerhouse.door - 6, Math.PI);
await page.waitForFunction(() => window.__hv.game.wild.creatures.filter((c) => c.kind === 'ashen').length >= 5, null, { timeout: LONG, polling: 200 }).catch(() => {});
const pastPower = await walkTo(Math.PI, (p, z) => p.z > z, Z.powerhouse.z1 + 4);
await standAt(A.x + 0.5, Z.shop.door - 4, Math.PI);
const pastShops = await walkTo(Math.PI, (p, z) => p.z > z, Z.foundry.z1 + 4);
const walk = await g(() => ({ woke: window.__woke, minds: window.__hv.game.wild.creatures.filter((c) => c.kind === 'ashen').map((c) => c.mind).join(' ') }));
check('the avenue by day, down its middle past the powerhouse’s, the shop’s and the foundry’s dark bays, all of them in: none stirs', pastPower && pastShops && walk.woke === 0 && (await nests()) >= 5, JSON.stringify(walk));

// ---- The salvage, by day, from the lit halves, with them in their nests behind the walls ----------------------
await standAt(Z.powerhouse.x0 - 3.5, Z.powerhouse.door + 1, -Math.PI / 2);
check('at the powerhouse door: the toast says what is inside, under the lamps, and to leave the dark end be', await waitFlag('powerhouse_seen'));
const openFrom = (c, dx, dz, yaw, pitch = -0.45) => useAt(([c, dx, dz, yaw, pitch]) => { const gm = window.__hv.game; gm.player.setPosition(c[0] + 0.5 + dx, c[1], c[2] + 0.5 + dz); gm.player.yaw = yaw; gm.player.pitch = pitch; },
  (gm, [c, , , yaw, pitch]) => { gm.player.yaw = yaw; gm.player.pitch = pitch; const t = gm.target; return t && t.x === c[0] && t.y === c[1] && t.z === c[2]; }, [c, dx, dz, yaw, pitch]);
const takeFirst = async () => { await page.locator('.iv-grid').first().locator('.iv-slot').first().click({ modifiers: ['Shift'] }).catch(() => {}); await closeScreens(); };
await openFrom(Z3.PARTS_CRATE, 0, 1.8, 0);
const crateTitle = await page.locator('.iv-title').first().textContent().catch(() => '');
await takeFirst();
check('the powerhouse’s parts crate opens: the turbine parts are taken', /Powerhouse/.test(crateTitle ?? '') && (await count('turbine_parts')) === 1, crateTitle ?? '');
await openFrom(Z3.TOOL_LOCKER, 0, 1.8, 0);
await takeFirst();
check('the tool locker gives the sluice tools', (await count('sluice_tools')) === 1);
await openFrom(Z3.CONTROL_CABINETS[0], 0, 1.8, 0);
await takeFirst();
check('a control cabinet gives a graphics card (the electronics for more rigs)', (await count('gpu')) === 1);

/** Mines the block at c from (dx, dz) beside it, with the pickaxe. */
const mine = async (c, dx, dz) => {
  await hold('steel_pickaxe');
  await ensureLook();
  await g(([c, dx, dz]) => { const gm = window.__hv.game; gm.player.setPosition(c[0] + 0.5 + dx, c[1], c[2] + 0.5 + dz); }, [c, dx, dz]);
  await page.mouse.down();
  await page.waitForFunction((c) => { const gm = window.__hv.game, p = gm.player, tx = c[0] + 0.5 - p.x, ty = c[1] + 0.4 - p.eyeY, tz = c[2] + 0.5 - p.z; p.yaw = Math.atan2(-tx, -tz); p.pitch = Math.atan2(ty, Math.hypot(tx, tz)); return gm.world.blockAt(...c) === 0; }, c, { timeout: LONG, polling: 100 }).catch(() => {});
  await page.mouse.up();
};
await standAt(Z.shop.x0 - 3.5, Z.shop.door + 1, -Math.PI / 2);
check('at the machine shop’s door: the toast says lathes, steel, and the foundry’s crucible across the road', await waitFlag('shops_seen'));
await mine(Z3.OLD_LATHES[0], 0, 1.8);
check('a seized lathe is mined for its parts', (await count('lathe_parts')) === 1);
await mine(Z3.STEEL_RACKS[0], -1.8, 0);
check('a rack of steel bar is mined for steel stock', (await count('steel_stock')) >= 1);
await standAt(Z.foundry.x1 + 2.5, Z.foundry.door + 1, Math.PI / 2);
await mine(Z3.FOUNDRY_CRUCIBLE, 0, 1.8);
check('the foundry’s crucible is mined and carried off', (await count('crucible')) === 1);
await standAt(A.x + 0.5, Z.signalBox.z1 + 4, Math.PI);
check('at the rail yard: the toast says rails and plate for steel, a wagon of coal, and that the engine shed is dark', await waitFlag('yard_seen'));
const salvage = await g(() => { clearInterval(window.__watch); return { woke: window.__woke, about: window.__hv.game.wild.creatures.filter((c) => c.kind === 'ashen').length }; });
check('all of it taken by day from the lit halves, crates opened and a pick at work, with them behind the walls: none stirred', salvage.woke === 0 && salvage.about >= 5, JSON.stringify(salvage));
check('the works are reached; not home yet, so M4’s run is not ticked', (await flags()).includes('works_reached') && !(await flags()).includes('zone3_home'));
await g(() => { const gm = window.__hv.game; gm.vitals.hp = 100; gm.player.setPosition(gm.spawn.x || 1796.5, gm.spawn.y || 82, gm.spawn.z || 1024.5); });
check('home alive from across the dam: M4’s run is done', await waitFlag('zone3_home'), (await flags()).slice(-6).join(' '));

// ---- At home: steel, the lathe, Ray, hydro, the farm, the mods ----------------------------------------------
// The rest of a run's salvage is put in the pack here (each kind is found as checked above).
await g(() => {
  const h = window.__hv.game.hotbar, id = window.__hv.itemId;
  h.remove(id('armband'), 1); h.remove(id('machete'), 1);
  for (const [n, k] of [['steel_stock', 16], ['coal', 8], ['cobble', 8], ['clay', 4], ['iron_ingot', 2], ['wiring', 12], ['planks', 4], ['pistol', 1], ['pipe_fittings', 1], ['armor_vest', 1], ['leather', 2]]) h.add(id(n), k);
});
const openAt = (c) => useAt((c) => { const gm = window.__hv.game; gm.player.setPosition(c[0] + 0.5, c[1], c[2] + 2.8); gm.player.yaw = 0; gm.player.pitch = -0.35; },
  (gm, c) => { gm.player.yaw = 0; gm.player.pitch = -0.35; const t = gm.target; return t && t.x === c[0] && t.y === c[1] && t.z === c[2]; }, c);
const openWorkbench = () => useAt(() => { const gm = window.__hv.game; gm.player.setPosition(1820.5, 82, 1009.3); gm.player.yaw = 0; gm.player.pitch = -0.55; },
  (gm) => { gm.player.yaw = 0; gm.player.pitch = -0.55; const t = gm.target; return t && t.x === 1820 && t.z === 1007; });
const make = async (label, times = 1) => { for (let k = 0; k < times; k++) await page.locator('.iv-recipe', { hasText: label }).first().locator('.iv-make').click().catch(() => {}); };
/** Sets a block from the pack on the valley floor beside the garden (as a player would place it), at slot k. */
const setDown = (name, k) => g(([n, k]) => {
  const gm = window.__hv.game, w = gm.world, x = 1735 + 3 * k, z = 1058;
  let y = 90; while (y > 60 && w.blockAt(x, y - 1, z) === 0) y--;
  w.setBlock(x, y, z, window.__hv.itemId(n));
  gm.hotbar.remove(window.__hv.itemId(n), 1);
  for (let dz = 1; dz <= 3; dz++) for (let dy = 0; dy < 3; dy++) { const b = window.__hv.blockName(w.blockAt(x, y + dy, z + dz)); if (/fern|grass|bromeliad|orchid|bamboo/.test(b) && b !== 'grass') w.setBlock(x, y + dy, z + dz, 0); }
  return [x, y, z];
}, [name, k]);
const phone = () => useAt(() => { const gm = window.__hv.game; gm.player.setPosition(1811.5, 82, 1029.5); gm.player.yaw = -Math.PI / 2; gm.player.pitch = -0.25; },
  (gm) => { const t = gm.target; gm.player.yaw = -Math.PI / 2; gm.player.pitch = -0.25; return t && t.x === 1813 && t.y === 83 && t.z === 1029; });

// 1. Steel: the crucible furnace from the foundry's crucible, then ingots from rail and plate.
await openWorkbench();
const hydroHidden = !(await page.locator('.iv-recipe', { hasText: 'Hydro generator' }).count());
await make('Crucible furnace');
await closeScreens();
const furnaceAt = await setDown('crucible_furnace', 0);
await openAt(furnaceAt);
await make('Steel ingot', 8);
check('the crucible furnace makes steel from rail and plate: M4’s steel', (await count('steel_ingot')) === 16 && (await flags()).includes('steel_made'), `steel ×${await count('steel_ingot')}`);
await closeScreens();

// 2. The lathe: workshop tier 2.
await openWorkbench();
await make('Lathe');
check('the lathe is made from the shop’s parts and steel: workshop tier 2', (await count('lathe')) === 1 && (await flags()).includes('lathe_built'), `lathe ×${await count('lathe')}`);
await closeScreens();
const latheAt = await setDown('lathe', 1);

// 3. Ray, by phone: his first call, and his plans bought. Only then is the hydro generator offered.
await phone();
const book = await page.locator('.pp-panel').textContent().catch(() => '');
check('the phone has Ray once his logbook is read', /Ray/.test(book ?? ''), (book ?? '').slice(0, 120));
await page.locator('.pp-panel .row', { hasText: 'Ray' }).locator('.pp-call').click().catch(() => {});
await page.waitForTimeout(400);
const rayView = await page.locator('.pp-panel').textContent().catch(() => '');
const wallet0 = await g(() => window.__hv.game.wallet);
await page.locator('.pp-trade .row', { hasText: 'Micro-hydro plans' }).locator('button').click().catch(() => {});
await page.waitForTimeout(300);
const bought = await g(() => ({ plans: window.__hv.game.flags.has('hydro_plans'), called: window.__hv.game.flags.has('ray_called'), wallet: window.__hv.game.wallet }));
check('Ray answers as the dam’s engineer and sells his micro-hydro plans (no selling column: he buys nothing)', /Quispe/.test(rayView ?? '') && bought.plans && bought.called && bought.wallet < wallet0 && !/Sell 1/.test(rayView ?? ''), JSON.stringify(bought));
await closeScreens();
await openWorkbench();
await make('Hydro generator');
check('the hydro generator is offered only once the plans are bought, and is made (the sluice tools kept)', hydroHidden && (await count('hydro_generator')) === 1 && (await count('sluice_tools')) === 1 && (await count('turbine_parts')) === 0, `hidden before: ${hydroHidden}`);
await closeScreens();

// 4. Set on dry ground it makes nothing; set at the creek's water it turns: M4's hydro.
const dry = await setDown('hydro_generator', 2);
await gameSeconds(2.5);
check('a generator on dry ground does not turn', !(await flags()).includes('hydro_built'));
const wet = await g((dry) => {
  const gm = window.__hv.game, w = gm.world, isWater = (x, y, z) => /water/.test(window.__hv.blockName(w.blockAt(x, y, z)));
  w.setBlock(dry[0], dry[1], dry[2], 0);
  // The first bank cell beside the creek's water near the garden.
  for (let z = 1040; z < 1075; z++) for (let x = 1650; x < 1720; x++) for (let y = 66; y < 74; y++) {
    if (w.blockAt(x, y, z) !== 0 || w.blockAt(x, y - 1, z) === 0 || isWater(x, y - 1, z)) continue;
    if (isWater(x + 1, y - 1, z) || isWater(x - 1, y - 1, z) || isWater(x, y - 1, z + 1) || isWater(x, y - 1, z - 1)) { w.setBlock(x, y, z, window.__hv.itemId('hydro_generator')); return [x, y, z]; }
  }
  return null;
}, dry);
check('set at the creek’s edge, the generator turns: M4’s hydro', !!wet && (await waitFlag('hydro_built')), JSON.stringify(wet));

// 5. The farm: three rigs run at once on the creek's power, by night, with no array and no bank.
await g(() => { const gm = window.__hv.game; gm.hour = 23; gm.hotbar.add(window.__hv.itemId('mining_rig'), 3); });
for (const k of [3, 4, 5]) await setDown('mining_rig', k);
check('three rigs run at once on hydro, at night: a farm', await waitFlag('farm_running'), await g(() => JSON.stringify(window.__hv.game.power)));
const walletA = await g(() => window.__hv.game.wallet);
await g(() => { const gm = window.__hv.game; gm.hour = (gm.hour + 2) % 24; }); // two hours on
await gameSeconds(2.5);
const earned = (await g(() => window.__hv.game.wallet)) - walletA;
// (A rig earns 100,000 sats a day since docs/FIXES.md, 6: three of them for two hours is 25,000.)
check('the farm earns three rigs’ worth: about 25,000 sats in two hours', earned > 20000 && earned < 30000, `${earned} sats`);
await useAt(() => { const gm = window.__hv.game; gm.player.setPosition(1811.5, 82, 1028.5); gm.player.yaw = -Math.PI / 2; gm.player.pitch = -0.25; },
  (gm) => { gm.player.yaw = -Math.PI / 2; gm.player.pitch = -0.25; const t = gm.target; return t && t.x === 1813 && t.y === 83 && t.z === 1028; });
const screen = await page.locator('.pp-panel').textContent().catch(() => '');
check('the computer shows the hydro line, the farm’s rigs and hashrate, and M4’s steps', /Hydro/.test(screen ?? '') && /3 of 3 rigs running/.test(screen ?? '') && /M4 · hydro/.test(screen ?? ''), (screen ?? '').replace(/\s+/g, ' ').slice(0, 200));
await closeScreens();

// 6. Ray again, now that it turns: the uplink plans.
await phone();
await page.locator('.pp-panel .row', { hasText: 'Ray' }).locator('.pp-call').click().catch(() => {});
await page.waitForTimeout(400);
const raySaid = await page.locator('.pp-say').textContent().catch(() => '');
check('called once the generator turns, Ray sends the uplink plans (the lead-in to the ridge tower)', (await flags()).includes('uplink_plans') && (await count('uplink_plans')) === 1 && /uplink/i.test(raySaid ?? ''), (raySaid ?? '').slice(0, 100));
await closeScreens();

// 7. The lathe: a found gun fitted, and plate armour.
await openAt(latheAt);
await make('Pistol, suppressed');
await make('Plate armour');
check('at the lathe the pistol is fitted with a suppressor (the pistol used up) and plate armour is made', (await count('pistol_suppressed')) === 1 && (await count('pistol')) === 0 && (await count('plate_armor')) === 1, `${await count('pistol_suppressed')} ${await count('plate_armor')}`);
await closeScreens();
check('M4 · hydro: all eight steps are done', await waitFlag('m4_done'), (await flags()).filter((f) => /zone3_home|steel|lathe|hydro|farm|uplink|gun_mod|armor2/.test(f)).join(' '));
await keepAlive();

// ---- Last: they can kill. A fed player who stands still in front of one dies and wakes at the cave -----------
// (The review of Phases 0–6: a full stomach healed the killing blow away in the same tick, so no fed player
// could die of bites, blows or bullets. No helper tops health up here.)
await standAt(A.x + 0.5, Z.firstAshen.z + 24, 0);
await page.waitForFunction(() => { const gm = window.__hv.game; gm.hour = 11; return gm.wild.creatures.some((c) => c.kind === 'ashen'); }, null, { timeout: LONG, polling: 200 }).catch(() => {});
await g(() => {
  const gm = window.__hv.game, p = gm.player, c = gm.wild.creatures.find((o) => o.kind === 'ashen');
  c.x = p.x; c.z = p.z - 3; c.y = p.y; c.mind = 'charge'; c.lost = 0; c.post = undefined; c.leg = 9;
  gm.vitals.hp = 12; gm.vitals.hunger = 100; gm.vitals.thirst = 100;
  window.__low = 100;
  window.__lowWatch = setInterval(() => { window.__low = Math.min(window.__low, gm.vitals.hp); }, 20);
});
const died = await page.waitForFunction(() => { const gm = window.__hv.game; gm.hour = 11; return gm.player.x > 1500; }, null, { timeout: LONG, polling: 100 }).then(() => true, () => false);
const end = await g(() => { clearInterval(window.__lowWatch); const gm = window.__hv.game; return { x: Math.round(gm.player.x), hp: gm.vitals.hp, low: window.__low, pack: gm.hotbar.slots.filter(Boolean).length }; });
check('a fed player who stands still before one of them is killed: they wake at the cave with nothing, the pack left where they fell', died && end.hp === 100 && end.pack === 0, JSON.stringify(end));

await finish();
