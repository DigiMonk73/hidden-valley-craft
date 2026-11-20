// Review probes for branch `fixes` (money, milestones, modes: N4 and N2). Written by a reviewer who did not write
// the code. A test here states what SHOULD hold. Those marked FINDING fail on fixes@0c408c0: the failure is the
// proof. Those marked HOLDS pass: places that were attacked and stood. The findings are numbered as in the review's
// report (worst first, across tests/zz_review_*.test.ts and tests/e2e/zz_review.mjs).

import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/render/renderer.ts', async () => (await import('./game/stubs.ts')).rendererModule);
vi.mock('../src/ui/hud.ts', async () => (await import('./game/stubs.ts')).hudModule);
vi.mock('../src/ui/inventoryScreen.ts', async () => (await import('./game/stubs.ts')).screenModule);
vi.mock('../src/ui/paperScreen.ts', async () => (await import('./game/stubs.ts')).paperModule);
vi.mock('../src/audio/audio.ts', async () => (await import('./game/stubs.ts')).audioModule);
vi.mock('../src/platform/look.ts', async () => (await import('./game/stubs.ts')).lookModule);
vi.mock('../src/ui/icons.ts', async () => (await import('./game/stubs.ts')).iconsModule);
vi.mock('../src/ui/mapView.ts', async () => (await import('./game/stubs.ts')).mapModule);
vi.mock('../src/platform/tablock.ts', async () => (await import('./game/stubs.ts')).tablockModule);

import { openPage, memoryPending, play, hide, settle, fire, browserStore, type Page } from './game/harness.ts';
import type { Trade } from './game/stubs.ts';
import { CATALOG, CATALOG_M3, CATALOG_RAY, PURSE, sellPrice, keepNames } from '../src/sim/trade.ts';
import { RIG_SATS_PER_DAY } from '../src/sim/power.ts';
import { M1_STEPS, M2_STEPS, M3_STEPS, M4_STEPS, trackM3, trackM4 } from '../src/sim/milestones.ts';
import { RECIPES, unlocked } from '../src/sim/crafting.ts';
import { breakBlock } from '../src/sim/interact.ts';
import { Inventory } from '../src/sim/inventory.ts';
import { itemId, itemName, itemLabel, mineSeconds } from '../src/world/items.ts';
import { blockId, BLOCK_DEFS } from '../src/world/blocks.ts';
import { chunkKey, chunkIndex, CS } from '../src/world/constants.ts';
import { World } from '../src/world/world.ts';
import { inSanctuary, VALLEY, HOME_GROUNDS } from '../src/gen/layout.ts';
import { PHARMACY_COUNTER } from '../src/gen/zone2.ts';
import { LOGBOOK_DESK } from '../src/gen/zone3.ts';
import { load } from './load.ts';
import { DAY_SECONDS } from '../src/render/sky.ts';
import { newSave } from '../src/save/state.ts';
import { encodeSave } from '../src/save/save.ts';
import { SAVE_KEY } from '../src/save/keeper.ts';

vi.setConfig({ testTimeout: 180_000 });

interface Hands { talkToMarco(): void; goHome(): void; die(): void; openScreen(chest: null): void; closeScreen(): void; closePaper(): void; openPhone(): void; useFurniture(x: number, y: number, z: number, id: number): boolean }
const hands = (p: Page) => p.game as unknown as Hands;
const give = (p: Page, name: string, n = 1) => p.game.hotbar.add(itemId(name), n);
const row = (t: Trade, name: string) => t.sell.find((r) => r.label.startsWith(itemLabel(itemId(name))))!;
function setEdit(w: World, x: number, y: number, z: number, name: string): void {
  const k = chunkKey(Math.floor(x / CS), Math.floor(y / CS), Math.floor(z / CS));
  const m = w.edits.get(k) ?? new Map<number, number>();
  m.set(chunkIndex(x % CS, y % CS, z % CS), blockId(name));
  w.edits.set(k, m);
}
/** A Survival page with play begun and the player hanging in the air on the balcony (no land under these tests). */
async function begun(): Promise<Page> {
  const p = await openPage();
  p.in.ready = true;
  p.in.resume();
  return p;
}
/** A place in the valley far from the balcony, so its land is never loaded here and what stands there counts "as last seen". */
function farCorner(): [number, number, number] {
  for (let x = Math.floor(VALLEY.cx) - 200; x < VALLEY.cx; x++) if (inSanctuary(x, VALLEY.cz) && inSanctuary(x + 3, VALLEY.cz)) return [x, 70, Math.floor(VALLEY.cz)];
  throw new Error('no far corner');
}
/** One rig on a hydro generator, both "as last seen" turning. */
function rigOnHydro(p: Page): void {
  const [x, y, z] = farCorner();
  setEdit(p.game.world, x, y, z, 'mining_rig');
  setEdit(p.game.world, x + 1, y, z, 'hydro_generator');
  p.game.devices.hydro_generator = [[x + 1, y, z]];
}

describe('FINDING 3 · two one-of-a-kind desks can be mined for planks before they are read', () => {
  it.each([
    ['the pharmacy counter (Doc’s card): M3’s "Call Doc" and with it M3, and M4’s recipes behind it', PHARMACY_COUNTER, 'pharmacy_counter'],
    ['the engineer’s desk (Ray’s logbook): Ray’s plans, the hydro generator and M4', LOGBOOK_DESK, 'logbook_desk'],
  ] as const)('%s must not be lost to a pickaxe', (_what, at, name) => {
    const [x, y, z] = at;
    const w = load(x - 1, z - 1, x + 1, z + 1);
    expect(w.blockAt(x, y, z)).toBe(blockId(name));
    const inv = new Inventory();
    const seconds = mineSeconds(blockId(name), itemId('steel_axe'));
    const broke = breakBlock(w, inv, x, y, z).changed;
    // Either it cannot be mined, or mining it gives the desk back to set down again.
    const safe = seconds < 0 || !broke || inv.count(blockId(name)) > 0;
    expect({ safe, seconds, broke, got: inv.slots.filter(Boolean).map((s) => `${itemName(s!.id)} ×${s!.count}`) }).toMatchObject({ safe: true });
  });

  it('and with the card gone nothing else gives Doc’s number: M3 cannot be finished, so M4’s recipes never open', async () => {
    const p = await begun();
    const f = p.game.flags;
    for (const s of [...M1_STEPS, ...M2_STEPS, ...M3_STEPS]) if (s.flag !== 'doc_called') f.add(s.flag);
    f.add('m1_done'); f.add('m2_done'); f.add('shelter_found');
    hands(p).openPhone();
    expect(p.in.paper.phoneRows.some((r) => /doc/i.test(r.name))).toBe(false); // no row to call
    trackM3(f, VALLEY.cx, VALLEY.cz, { arrays: 1, banks: 1, fridges: 1, pumps: 1, rigSats: 1 });
    expect(f.has('m3_done')).toBe(false);
    const locked = RECIPES.filter((r) => r.after === 'm3_done' && !unlocked(r, f)).length;
    expect(locked).toBeGreaterThan(5);
    // (This test passes: it is the second half of the proof above. `doc_known` is set in one place only, the counter's right-click.)
  });
});

describe('FINDING 8 · with a screen open the clock runs and the body, the wild and Marco’s hours do not', () => {
  it('a whole day spent in the pack screen should cost a day’s food and water', async () => {
    const p = await begun();
    const g = p.game;
    g.player.flying = false;
    g.vitals = { hp: 100, hunger: 80, thirst: 80 };
    rigOnHydro(p);
    p.in.tickPlaces();
    const wallet = g.wallet, hour = g.hour;
    fire('window', 'keydown', { code: 'KeyE' }); // the pack screen
    expect(p.in.screen.isOpen).toBe(true);
    play(p, DAY_SECONDS);
    hands(p).closeScreen();
    p.in.tickPlaces();
    console.info(`REVIEW a game day in the pack screen: hour ${hour.toFixed(2)} → ${g.hour.toFixed(2)}, hunger ${g.vitals.hunger}, thirst ${g.vitals.thirst}, the rig paid ${g.wallet - wallet} sats`);
    expect(g.wallet - wallet).toBeGreaterThan(RIG_SATS_PER_DAY * 0.95); // the day did pass: the rig was paid for it
    expect(g.vitals.hunger).toBeLessThan(80); // …so the body should have lived it
  });

  it('Marco’s trade left open past six in the evening and through the night: he should not still be dealing at dawn with a new purse', async () => {
    const p = await begun();
    const g = p.game;
    give(p, 'iron_ingot', 40);
    g.hour = 17.9;
    play(p, 0.2);
    hands(p).talkToMarco();
    const view = p.in.paper.tradeView!;
    for (let i = 0; i < 12; i++) row(view(), 'iron_ingot').act();
    expect(g.marcoPaid).toBe(PURSE);
    play(p, DAY_SECONDS * 0.55); // to about seven the next morning, the screen never closed
    const before = g.wallet;
    for (let i = 0; i < 12; i++) row(view(), 'iron_ingot').act();
    console.info(`REVIEW trade screen held open from 17:54 to ${g.hour.toFixed(2)}: a second purse of ${g.wallet - before} sats sold into, with no night outside`);
    expect(g.wallet - before).toBe(0);
  });
});

describe('FINDING 7 (again) · the address bar turns the clock in Survival', () => {
  it('?hour=5.99 on a reload must not be a new dawn (Marco’s purse whole again, a minute after it was emptied)', async () => {
    const store = browserStore(), pending = memoryPending();
    await store.set(SAVE_KEY, await encodeSave({ ...newSave(), flags: ['begun'], hour: 12, marcoPaid: PURSE }));
    const p = await openPage(store, pending, { hour: 5.99 }); // src/main.ts: `if (q.has('hour')) opts.hour = …`
    expect(p.game.mode).toBe('survival');
    p.in.ready = true; p.game.player.flying = true;
    play(p, 5);
    expect(p.game.marcoPaid).toBe(PURSE);
  });
});

describe('FINDING 11 · the home phone is a block: mined, carried and set down, it is Doc in the field', () => {
  it('docs/FIXES.md, 7: "Doc stays on the home phone… a phone in the pocket would make Doc a field medic"', async () => {
    // The builder's phone comes away in the hand as itself…
    const w = load(HOME_GROUNDS.x0, HOME_GROUNDS.z0, HOME_GROUNDS.x1 - 1, HOME_GROUNDS.z1 - 1);
    let at: [number, number, number] | null = null;
    for (let y = 60; y < 130 && !at; y++) for (let z = HOME_GROUNDS.z0; z < HOME_GROUNDS.z1 && !at; z++) for (let x = HOME_GROUNDS.x0; x < HOME_GROUNDS.x1; x++) if (w.blockAt(x, y, z) === blockId('phone')) { at = [x, y, z]; break; }
    expect(at).not.toBeNull();
    const inv = new Inventory();
    expect(breakBlock(w, inv, ...at!).changed).toBe(true);
    const carried = inv.count(blockId('phone'));
    // …and wherever it is set down it rings Doc: at the ruins of Las Cruces, hurt, a right-click heals for the fee.
    const p = await begun();
    const g = p.game;
    g.flags.add('doc_known');
    g.player.setPosition(PHARMACY_COUNTER[0] + 2.5, PHARMACY_COUNTER[1], PHARMACY_COUNTER[2] + 0.5);
    g.vitals.hp = 20;
    hands(p).useFurniture(PHARMACY_COUNTER[0] + 3, PHARMACY_COUNTER[1], PHARMACY_COUNTER[2], blockId('phone'));
    const doc = p.in.paper.phoneRows.find((r) => /doc/i.test(r.name));
    doc?.call?.();
    const care = p.in.paper.tradeView?.().buy[0];
    care?.act();
    console.info(`REVIEW the phone mined gives ${carried} phone; set down at the pharmacy in Zone 2 and Doc called: health 20 → ${g.vitals.hp}`);
    expect({ carried, healedInTheField: g.vitals.hp > 20 }).toEqual({ carried: 0, healedInTheField: false });
  });
});

// ---- Attacked, and stood ---------------------------------------------------------------------------------

describe('HOLDS · no loop of buying, making and selling gains sats', () => {
  it('whatever can be bought (Marco, Ray) and whatever can be made from it sells to Marco for less than it cost', () => {
    const cost = new Map<number, number>();
    for (const lot of [...CATALOG, ...CATALOG_M3, ...CATALOG_RAY]) cost.set(lot.id, Math.min(cost.get(lot.id) ?? Infinity, lot.sats / lot.lot));
    for (let pass = 0; pass < 12; pass++) {
      for (const r of RECIPES) {
        // A tool that is only held (count 0) is paid for once and kept: counted free here, which favours the cheat.
        const sum = r.in.reduce((n, [id, c]) => n + (c > 0 ? (cost.get(id) ?? Infinity) * c : cost.has(id) ? 0 : Infinity), 0);
        const each = sum / r.out[1];
        if (each < (cost.get(r.out[0]) ?? Infinity)) cost.set(r.out[0], each);
      }
    }
    const gains = [...cost].filter(([id, c]) => sellPrice(id) >= c).map(([id, c]) => `${itemName(id)}: costs ${c}, sells ${sellPrice(id)}`);
    expect(gains).toEqual([]);
    expect(cost.size).toBeGreaterThan(20);
  });

  it('no kept part can be turned at a bench into something Marco buys before its step is done', () => {
    const kept = new Map(keepNames().map(([n, flag]) => [itemId(n), flag]));
    const leaks: string[] = [];
    for (const r of RECIPES) {
      const from = r.in.filter(([id, c]) => c > 0 && kept.has(id));
      if (!from.length || !sellPrice(r.out[0])) continue;
      // Rounds are the one case: making them IS the step (ammo_made), so the parts are free by then.
      const flags = new Set(from.map(([id]) => kept.get(id)!));
      const outKept = kept.get(r.out[0]);
      if (outKept && flags.has(outKept)) continue; // still kept, for the same step
      if ([...flags].every((f) => f === 'ammo_made') && /_rounds$/.test(itemName(r.out[0]))) continue;
      leaks.push(`${from.map(([id]) => itemName(id))} → ${itemName(r.out[0])}`);
    }
    expect(leaks).toEqual([]);
  });
});

describe('HOLDS · Marco’s purse cannot be dodged', () => {
  it('not by a reload, a close and reopen, New game then the backup, a death, hold H, or midnight', async () => {
    const store = browserStore(), pending = memoryPending();
    let p = await openPage(store, pending);
    p.in.ready = true; p.in.resume();
    give(p, 'iron_ingot', 30);
    hands(p).talkToMarco();
    for (let i = 0; i < 12; i++) row(p.in.paper.tradeView!(), 'iron_ingot').act();
    expect(p.game.marcoPaid).toBe(PURSE);
    hands(p).closePaper();
    p.game.player.flying = true;
    // Midnight.
    p.game.hour = 23.99; play(p, 0.2); play(p, 2);
    expect(p.game.hour).toBeLessThan(1);
    expect(p.game.marcoPaid).toBe(PURSE);
    // A death at home, and hold H.
    hands(p).die(); hands(p).goHome();
    expect(p.game.marcoPaid).toBe(PURSE);
    // New game, then the backup.
    p.in.pause(); await settle(p);
    await p.in.newGame(); await p.in.openBackup(); await settle(p);
    expect(p.game.marcoPaid).toBe(PURSE);
    // The page closed and opened again.
    hide(); await settle(p);
    p = await openPage(store, pending);
    expect(p.game.marcoPaid).toBe(PURSE);
    expect(row((hands(p).talkToMarco(), p.in.paper.tradeView!()), 'iron_ingot').can).toBe(false);
  });

  it('a sale never leaves the wallet a fraction or the purse overdrawn, whatever is sold', async () => {
    const p = await begun();
    for (const lot of [...CATALOG, ...CATALOG_M3, ...CATALOG_RAY]) expect(Number.isInteger(lot.sats)).toBe(true);
    for (const name of ['nails', 'feather', 'bullet', 'pistol_rounds', 'herbs', 'puma_pelt', 'jaguar_pelt', 'raider_rifle']) give(p, name, 40);
    p.game.flags.add('ammo_made');
    hands(p).talkToMarco();
    const view = p.in.paper.tradeView!;
    for (let i = 0; i < 400; i++) for (const r of view().sell) r.act();
    expect(Number.isInteger(p.game.wallet)).toBe(true);
    expect(p.game.marcoPaid).toBeLessThanOrEqual(PURSE);
  });
});

describe('HOLDS · a rig is paid a day’s sats for a day, and nothing for no power', () => {
  it('a full day of frames pays one day; a load in the middle pays nothing twice and back-dates nothing', async () => {
    const store = browserStore(), pending = memoryPending();
    let p = await openPage(store, pending);
    p.in.ready = true; p.in.resume();
    p.game.player.flying = true;
    rigOnHydro(p);
    p.in.tickPlaces();
    const start = p.game.wallet;
    play(p, DAY_SECONDS);
    const day = p.game.wallet - start;
    expect(Math.abs(day - RIG_SATS_PER_DAY)).toBeLessThan(RIG_SATS_PER_DAY * 0.01);
    // Close and reopen at another hour of the clock: nothing is paid for the gap, in either direction.
    p.in.pause(); await settle(p); hide(); await settle(p);
    const saved = p.game.wallet;
    p = await openPage(store, pending, { hour: (p.game.hour + 23) % 24 }); // the worst case: the hour an hour "back"
    p.in.ready = true; p.game.player.flying = true;
    p.in.playing = true;
    play(p, 2);
    expect(p.game.wallet - saved).toBeLessThan(RIG_SATS_PER_DAY / 24 / 10);
  });

  it('no generator and no sun: no pay; and only one rig runs without a generator', async () => {
    const p = await begun();
    const g = p.game;
    g.player.flying = true;
    const [x, y, z] = farCorner();
    for (let i = 0; i < 3; i++) setEdit(g.world, x + i, y, z, 'mining_rig');
    p.in.tickPlaces();
    const start = g.wallet;
    play(p, DAY_SECONDS / 4);
    expect(g.wallet).toBe(start);
    // A full bank with nothing to charge it runs one rig until it is empty, never three.
    setEdit(g.world, x, y, z + 1, 'battery_bank');
    g.power.charge = 12;
    play(p, DAY_SECONDS / 24);
    expect(g.power.rigs).toBeLessThanOrEqual(1);
    expect(trackM4(new Set(['m3_done']), VALLEY.cx, VALLEY.cz, { hydro: 0, rigs: g.power.rigs })).not.toContain('farm_running');
  });
});

describe('HOLDS · Survival stays Survival', () => {
  it('no key flies, makes blocks endless or moves the hour, paused or playing, with a screen open or not', async () => {
    const p = await begun();
    const g = p.game;
    const codes = ['KeyF', 'KeyG', 'BracketLeft', 'BracketRight', 'KeyC', 'KeyB', 'KeyT', 'KeyN', 'KeyP', 'F1', 'F2', 'F4', 'Backquote', 'Slash', 'Period', 'Comma', 'Minus', 'Equal', 'PageUp', 'PageDown', 'Home', 'End', 'Insert', 'Delete', 'Tab'];
    const hour = g.hour;
    for (const state of ['playing', 'paused', 'screen'] as const) {
      if (state === 'paused') p.in.pause();
      if (state === 'screen') { p.in.resume(); fire('window', 'keydown', { code: 'KeyE' }); }
      for (const code of codes) for (const mods of [{}, { shiftKey: true }, { ctrlKey: true }, { altKey: true }]) fire('window', 'keydown', { code, ...mods });
      expect([state, g.player.flying, g.hotbar.creative, g.mode, g.hour]).toEqual([state, false, false, 'survival', hour]);
    }
  });

  it('the mode cannot be picked again once play has begun: not from the menu, not after a reload, not after Open the backup', async () => {
    const store = browserStore(), pending = memoryPending();
    let p = await openPage(store, pending);
    p.in.ready = true; p.in.resume();
    p.in.pause(); await settle(p);
    p.hud.actions.pickMode('builder' as never);
    expect([p.game.mode, p.game.hotbar.creative]).toEqual(['survival', false]);
    hide(); await settle(p);
    p = await openPage(store, pending);
    p.hud.actions.pickMode('builder' as never);
    expect(p.game.mode).toBe('survival');
    expect(p.hud.canChooseMode).toBe(false);
    // New game (a new valley may choose), then back to the old one through the backup: it is still Survival, still begun.
    await p.in.newGame();
    p.hud.actions.pickMode('builder' as never);
    expect(p.game.mode).toBe('builder');
    await p.in.openBackup();
    expect([p.game.mode, p.game.hotbar.creative, p.game.player.flying, p.hud.canChooseMode]).toEqual(['survival', false, false, false]);
  });
});

describe('HOLDS · every milestone step can be reached in order', () => {
  it('no step of a milestone needs a recipe that waits for that same milestone or a later one', () => {
    // What each step is made with, read from the recipes: the output whose making ticks or enables the step.
    const needs: Record<string, string[]> = {
      coop_laid: ['coop'], hutch_bred: ['hutch'], forge_made: ['forge'], preserved: ['smoker', 'jerky_rack'], bow_made: ['hunting_bow'], leghold_learned: [],
      array_built: ['solar_array'], bank_built: ['battery_bank'], rig_earned: ['mining_rig'], fridge_pump: ['fridge', 'water_pump'], ammo_made: ['pistol_rounds', 'gunpowder', 'bullet', 'bullet_mold', 'powder_mill'],
      steel_made: ['crucible_furnace', 'steel_ingot'], lathe_built: ['lathe'], hydro_built: ['hydro_generator'], gun_modded: ['pistol_suppressed'], armor2_made: ['plate_armor'],
    };
    const order = ['', 'm1_done', 'm2_done', 'm3_done'];
    const any = (name: string) => { try { return blockId(name); } catch { return itemId(name); } };
    const bad: string[] = [];
    [M1_STEPS, M2_STEPS, M3_STEPS, M4_STEPS].forEach((steps, m) => {
      for (const s of steps) for (const out of needs[s.flag] ?? []) {
        const ways = RECIPES.filter((r) => r.out[0] === any(out));
        if (!ways.length) { bad.push(`${s.flag}: nothing makes ${out}`); continue; }
        // Some way of making it must wait for an earlier milestone only.
        if (!ways.some((r) => order.indexOf(r.after ?? '') <= m)) bad.push(`${s.flag}: ${out} waits for ${ways.map((r) => r.after)}`);
        // And its learn flag, where it is a step, must be a step of this milestone or an earlier one.
      }
    });
    expect(bad).toEqual([]);
  });

  it('no one-of-a-kind part that a step needs has a price Marco will pay before the step is done', () => {
    // The parts found once or a few times in the world, by the recipes that eat them.
    const unique = ['forge_parts', 'crucible', 'lathe_parts', 'turbine_parts', 'sluice_tools', 'pump_unit', 'fridge_unit', 'bowstring', 'pv_panel', 'battery_cell', 'gpu', 'psu', 'mining_board', 'armor_vest'];
    const kept = new Set(keepNames().map(([n]) => n));
    const open = unique.filter((n) => sellPrice(itemId(n)) > 0 && !kept.has(n));
    expect(open).toEqual([]);
    expect(BLOCK_DEFS.length).toBeGreaterThan(100);
  });
});
