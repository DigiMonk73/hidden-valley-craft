// N4 (docs/REVIEW.md, docs/FIXES.md 6): money and milestones have weight. Marco's purse, the parts he will not
// take, rows that stay put, milestone steps that tick only for the real step and in order, each milestone's
// recipes after the one before, the wallet, the rig and Ray's prices, waking after a death at home, and the jug.

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

import { openPage, play, type Page } from './game/harness.ts';
import type { Trade } from './game/stubs.ts';
import { WAKE_FLOOR } from '../src/game.ts';
import { CATALOG, CATALOG_M3, CATALOG_RAY, RAY_PLANS_PRICE, DOC_PRICE, START_WALLET, PURSE, sell, sellPrice, keptFor, keepNames, tradeNamesValid } from '../src/sim/trade.ts';
import { RIG_SATS_PER_DAY } from '../src/sim/power.ts';
import { M1_STEPS, M2_STEPS, M3_STEPS, M4_STEPS, MILESTONES, trackM1, trackM2, trackM3, trackM4, notWalkedHome } from '../src/sim/milestones.ts';
import { RECIPES, recipesAt, waitingAt, unlocked, AFTER_LABEL } from '../src/sim/crafting.ts';
import { Inventory } from '../src/sim/inventory.ts';
import { itemId, itemLabel } from '../src/world/items.ts';
import { blockId } from '../src/world/blocks.ts';
import { packPos } from '../src/world/light.ts';
import { GATE, VALLEY, inSanctuary } from '../src/gen/layout.ts';
import { SCOUT_AT } from '../src/gen/zone1.ts';
import { HOME_CHESTS } from '../src/gen/inheritance.ts';

vi.setConfig({ testTimeout: 60_000 });

interface Hands { talkToMarco(): void; goHome(): void; die(): void; useHeldItem(): boolean }
const hands = (p: Page) => p.game as unknown as Hands;
const give = (p: Page, name: string, n = 1) => p.game.hotbar.add(itemId(name), n);
const count = (p: Page, name: string) => p.game.hotbar.count(itemId(name));
/** Opens Marco's trade and gives the screen as it now reads. */
function marco(p: Page): () => Trade {
  hands(p).talkToMarco();
  return p.in.paper.tradeView!;
}
const label = (name: string) => itemLabel(itemId(name));
const row = (t: Trade, name: string) => t.sell.find((r) => r.label.startsWith(label(name)))!;
const anyId = (name: string) => { try { return blockId(name); } catch { return itemId(name); } };

describe('the wallet, the rig and the prices', () => {
  it('starts small: forty units, less than one lot of everything Marco sells', () => {
    expect(START_WALLET).toBe(1_000_000);
    const everything = [...CATALOG, ...CATALOG_M3].reduce((n, lot) => n + lot.sats, 0);
    expect(everything).toBeGreaterThan(START_WALLET);
  });

  it('a rig earns a wound care a day, and a farm of three out-earns anything Marco can pay', () => {
    expect(RIG_SATS_PER_DAY).toBe(DOC_PRICE.wound);
    expect(3 * RIG_SATS_PER_DAY).toBeGreaterThan(PURSE);
    expect(PURSE).toBe(250_000);
  });

  it('a hill of iron is many days of selling, not one afternoon: Phase 7’s gallery through Marco’s purse', () => {
    const inv = new Inventory();
    const ore = itemId('iron_ore');
    let wallet = 0, paid = 0, sold = 0;
    for (let i = 0; i < 200; i++) {
      inv.add(ore, 1);
      const r = sell(inv, wallet, ore, PURSE - paid);
      if (!r.ok) { expect(r.why).toBe('purse'); break; }
      paid += r.wallet - wallet; wallet = r.wallet; sold++;
    }
    expect(paid).toBeLessThanOrEqual(PURSE);
    expect(sold).toBe(Math.floor(PURSE / sellPrice(ore)));
    expect(sold).toBeLessThan(25);
  });

  it('Ray is the premium the script gives him; the road to M4 costs more than the starting wallet', () => {
    const board = CATALOG_RAY.find((l) => l.id === itemId('mining_board'))!;
    expect(RAY_PLANS_PRICE + board.sats).toBeGreaterThan(START_WALLET * 0.9);
    for (const lot of CATALOG_RAY) expect(sellPrice(lot.id) * lot.lot).toBeLessThan(lot.sats);
  });

  it('Marco pays little for a gun (it was 600,000 for a pistol), and sells primers once he trusts you', () => {
    expect(sellPrice(itemId('pistol'))).toBe(100_000);
    expect(sellPrice(itemId('raider_rifle'))).toBe(150_000);
    expect(CATALOG_M3.some((l) => l.id === itemId('primer'))).toBe(true);
    expect(tradeNamesValid()).toBe(true);
  });

  it('the pantry is about ten days of food, not forty', () => {
    const tins = HOME_CHESTS.flatMap((c) => c.items).filter(([n]) => n === 'canned_food').reduce((n, [, c]) => n + c, 0);
    expect(tins).toBe(8);
  });
});

describe('trading with Marco', () => {
  it('he pays out only so much in a day, says so, and his purse is whole again at dawn', async () => {
    const p = await openPage();
    give(p, 'iron_ingot', 40);
    const view = marco(p);
    const start = p.game.wallet;
    let last = '';
    for (let i = 0; i < 40; i++) last = row(view(), 'iron_ingot').act();
    expect(p.game.wallet - start).toBe(PURSE);
    expect(last).toContain('one man and a mule');
    expect(row(view(), 'iron_ingot').can).toBe(false);
    expect(view().sellHead).toContain('0.00000000 BTC more today');
    expect(count(p, 'iron_ingot')).toBe(40 - PURSE / sellPrice(itemId('iron_ingot')));
    // The purse is saved with the valley (a reload is not a new day)…
    expect(p.game.snapshot().marcoPaid).toBe(PURSE);
    // …and whole again when a new day begins.
    p.in.ready = true;
    p.game.player.flying = true;
    p.game.hour = 5.95;
    play(p, 0.2);
    p.game.hour = 6.05;
    play(p, 0.2);
    expect(p.game.marcoPaid).toBe(0);
  });

  it('he will not take a part a milestone step still needs, so one sale can never end your progress', async () => {
    const p = await openPage();
    give(p, 'pump_unit', 1); // there is exactly one in the world
    give(p, 'bowstring', 3);
    give(p, 'battery_cell', 12);
    const view = marco(p);
    for (const name of ['pump_unit', 'bowstring', 'battery_cell']) {
      const r = row(view(), name);
      expect(r.can, name).toBe(false);
      expect(r.label).toContain('keep it');
      expect(r.act()).toContain('keep it');
    }
    expect([count(p, 'pump_unit'), count(p, 'bowstring'), count(p, 'battery_cell')]).toEqual([1, 3, 12]);
    // Once the step is done, what is left over is his to buy.
    p.game.flags.add('bank_built');
    const spare = row(view(), 'battery_cell');
    expect(spare.can).toBe(true);
    spare.act();
    expect(count(p, 'battery_cell')).toBe(11);
  });

  it('every kept part is a real item, and waits on a real step', () => {
    const steps = new Set([...M1_STEPS, ...M2_STEPS, ...M3_STEPS, ...M4_STEPS].map((s) => s.flag));
    expect(keepNames().length).toBeGreaterThan(8);
    for (const [name, flag] of keepNames()) {
      expect(steps.has(flag), `${name} → ${flag}`).toBe(true);
      expect(keptFor(itemId(name), new Set())).toBe(flag);
      expect(keptFor(itemId(name), new Set([flag]))).toBeNull();
      expect(sellPrice(itemId(name)), name).toBeGreaterThan(0);
    }
  });

  it('a row that sells out stays where it is: quick clicks never sell the next thing down', async () => {
    const p = await openPage();
    give(p, 'hide', 2); give(p, 'puma_pelt', 1); give(p, 'iron_ingot', 3);
    const view = marco(p);
    const at = view().sell.findIndex((r) => r.label.startsWith(label('hide')));
    const rows = view().sell.length;
    // Four clicks on the same place on the screen (it used to sell the hides, the pelt and an ingot).
    for (let i = 0; i < 4; i++) view().sell[at].act();
    expect([count(p, 'hide'), count(p, 'puma_pelt'), count(p, 'iron_ingot')]).toEqual([0, 1, 3]);
    expect(view().sell[at].label).toContain('none left');
    expect(view().sell[at].can).toBe(false);
    expect(view().sell.length).toBe(rows);
  });
});

describe('milestone steps tick only for the real step', () => {
  const home: [number, number] = [VALLEY.cx, VALLEY.cz];

  it('"back home" is home, not anywhere east of the gate', () => {
    const f = new Set<string>();
    trackM1(f, 1560, 1024, false); // out in the canyon
    expect(f.has('been_out')).toBe(true);
    // Up on the ridge east of the gate's line, outside the valley: not home.
    const ridge: [number, number] = [GATE.x0 + 1, 900];
    expect(inSanctuary(...ridge)).toBe(false);
    trackM1(f, ...ridge, false);
    expect(f.has('gate_both')).toBe(false);
    trackM1(f, ...home, false);
    expect(f.has('gate_both')).toBe(true);
  });

  it('the pistol is the dead scout’s, taken from his pockets: any other pistol does not count', async () => {
    const p = await openPage();
    give(p, 'pistol', 1); // one bought, or a raider's
    p.in.tickPlaces();
    expect(p.game.flags.has('pistol_taken')).toBe(false);
    // His pockets searched, the pistol still in them.
    p.game.flags.add('scout_searched');
    p.game.world.containers.set(packPos(SCOUT_AT[0], SCOUT_AT[1], SCOUT_AT[2]), [{ id: itemId('pistol'), count: 1 }, null]);
    p.in.tickPlaces();
    expect(p.game.flags.has('pistol_taken')).toBe(false);
    // Taken.
    p.game.world.containers.set(packPos(SCOUT_AT[0], SCOUT_AT[1], SCOUT_AT[2]), [null, null]);
    p.in.tickPlaces();
    expect(p.game.flags.has('pistol_taken')).toBe(true);
  });

  it('hold H brings you home but is not the way home M1 counts; a step already ticked stays', async () => {
    const p = await openPage();
    const f = p.game.flags;
    f.add('been_out'); f.add('reached_near');
    hands(p).goHome();
    expect(p.hud.toasts.at(-1)).toContain('M1 counts the way home');
    p.in.tickPlaces(); // at home now
    expect([f.has('gate_both'), f.has('extracted')]).toEqual([false, false]);
    // Whereas walked and swum, it ticks.
    trackM1(f, 1100, 1028, false);
    trackM1(f, ...home, false);
    expect([f.has('gate_both'), f.has('extracted')]).toEqual([true, true]);
    hands(p).goHome();
    expect(p.hud.toasts.at(-1)).toBe('Home.');
    expect([f.has('gate_both'), f.has('extracted')]).toEqual([true, true]);
    const g = new Set(['been_out', 'gate_both', 'reached_near']);
    notWalkedHome(g);
    expect([...g]).toEqual(['been_out', 'gate_both']);
  });

  it('a milestone is done only after the one before (M3 used to complete with M1 and M2 undone)', () => {
    const f = new Set<string>(M3_STEPS.map((s) => s.flag));
    expect(trackM3(f, ...home, { arrays: 1, banks: 1, fridges: 1, pumps: 1, rigSats: 1 })).toEqual([]);
    expect(f.has('m3_done')).toBe(false);
    for (const s of M2_STEPS) f.add(s.flag);
    expect(trackM2(f, () => 0)).toEqual([]); // nor M2 before M1
    for (const s of M1_STEPS) f.add(s.flag);
    expect(trackM1(f, ...home, false)).toEqual(['m1_done']);
    expect(trackM2(f, () => 0)).toEqual(['m2_done']);
    expect(trackM3(f, ...home, { arrays: 1, banks: 1, fridges: 1, pumps: 1, rigSats: 1 })).toEqual(['m3_done']);
    for (const s of M4_STEPS) f.add(s.flag);
    expect(trackM4(f, ...home, { hydro: 1, rigs: 3 })).toEqual(['m4_done']);
    expect([...MILESTONES].every((m) => f.has(m))).toBe(true);
  });
});

describe('each milestone’s recipes need the one before', () => {
  const made = (known: string[]) => new Set(RECIPES.filter((r) => unlocked(r, new Set(known))).map((r) => r.out[0]));

  it('M2’s, M3’s and M4’s things cannot be made until M1, M2 and M3 are done', () => {
    const cases: [string, string[], string][] = [
      ['coop', [], 'm1_done'], ['forge', [], 'm1_done'], ['hunting_bow', [], 'm1_done'],
      ['solar_array', ['m1_done'], 'm2_done'], ['powder_mill', ['m1_done'], 'm2_done'], ['pistol_rounds', ['m1_done'], 'm2_done'],
      ['crucible_furnace', ['m1_done', 'm2_done'], 'm3_done'], ['lathe', ['m1_done', 'm2_done'], 'm3_done'], ['plate_armor', ['m1_done', 'm2_done'], 'm3_done'],
    ];
    for (const [name, before, needs] of cases) {
      const id = anyId(name);
      expect(made(before).has(id), `${name} before ${needs}`).toBe(false);
      expect(made([...before, needs, 'array_built', 'bank_built', 'hydro_plans', 'leghold_learned']).has(id), `${name} after ${needs}`).toBe(true);
    }
  });

  it('what waits is listed with what it waits for, and nothing from M0 or M1 waits', () => {
    const waiting = waitingAt('workbench', new Set());
    expect(waiting.some((r) => r.out[0] === blockId('coop'))).toBe(true);
    expect(waitingAt('workbench', new Set(['m1_done'])).some((r) => r.out[0] === blockId('coop'))).toBe(false);
    for (const r of RECIPES) if (r.after) expect(AFTER_LABEL[r.after], r.after).toBeDefined();
    // The inheritance's own recipes are all there from the first minute.
    for (const name of ['chest', 'bed', 'snare', 'hutch', 'leather_armor', 'stone_pickaxe', 'fishing_rod'])
      expect(recipesAt('workbench').some((r) => r.out[0] === anyId(name)), name).toBe(true);
    expect(recipesAt('hand').length).toBeGreaterThan(5);
  });
});

describe('dying at home is not a free meal', () => {
  it('you wake as hungry and thirsty as you were, never below 15; outside, as before', async () => {
    const p = await openPage();
    const g = p.game;
    expect(inSanctuary(g.player.x, g.player.z)).toBe(true);
    g.vitals = { hp: 0, hunger: 40, thirst: 0 };
    hands(p).die();
    expect(g.vitals).toEqual({ hp: 100, hunger: 40, thirst: WAKE_FLOOR });
    expect(p.hud.toasts.at(-1)).toContain('does not feed you');
    // (It used to raise both to 50: never eating cost one painless death every quarter of an hour.)
    g.vitals = { hp: 0, hunger: 0, thirst: 0 };
    g.player.setPosition(1100, 100, 1028); // Zone 1
    hands(p).die();
    expect(g.vitals).toEqual({ hp: 100, hunger: 50, thirst: 50 });
  });
});

describe('the jug comes back', () => {
  it('cold water gives its jug back, like a jug of water', async () => {
    const p = await openPage();
    const g = p.game;
    g.vitals.thirst = 10;
    g.hotbar.slots[0] = { id: itemId('cold_water'), count: 1 };
    g.hotbar.select(0);
    expect(hands(p).useHeldItem()).toBe(true);
    expect([count(p, 'cold_water'), count(p, 'empty_jug')]).toEqual([0, 1]);
  });

  it('with no room for the empty jug the drink waits, rather than the jug being destroyed', async () => {
    const p = await openPage();
    const g = p.game;
    g.vitals.thirst = 10;
    g.hotbar.slots = g.hotbar.slots.map(() => ({ id: itemId('planks'), count: 64 }));
    g.hotbar.slots[0] = { id: itemId('water_jug'), count: 2 };
    g.hotbar.select(0);
    expect(hands(p).useHeldItem()).toBe(true);
    expect(p.hud.toasts.at(-1)).toContain('No room in your pack for the empty jug');
    expect([count(p, 'water_jug'), g.vitals.thirst]).toEqual([2, 10]);
    // The last jug of a stack frees its own slot.
    g.hotbar.slots[0] = { id: itemId('water_jug'), count: 1 };
    hands(p).useHeldItem();
    expect([count(p, 'water_jug'), count(p, 'empty_jug')]).toEqual([0, 1]);
  });
});
