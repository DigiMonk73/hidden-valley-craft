// Phase 8 in the real game (docs/PHASE8.md): the dose and the suit, the medicines, Ray, the hoist and the antenna,
// the telescope, the terminal and the uplink page, the closing card, the lures and pots, and what a save keeps.
// The game runs in Node on the harness (tests/game/harness.ts); the pure rules are in tests/phase8.test.ts.

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
vi.mock('../src/ui/scopeView.ts', () => ({ ScopeView: class { shown = false; label = ''; show() { this.shown = true; } hide() { this.shown = false; } setLabel(t: string) { this.label = t; } } }));

import { openPage, fire, type Page } from './game/harness.ts';
import type { FakePaper } from './game/stubs.ts';
import { runJob, type GenResult } from '../src/jobs/tasks.ts';
import { newSave, normaliseSave, migrate } from '../src/save/state.ts';
import { SAVE_VERSION } from '../src/save/save.ts';
import { blockId, blockName } from '../src/world/blocks.ts';
import { itemId } from '../src/world/items.ts';
import { CS } from '../src/world/constants.ts';
import { ZONE4, HOME, ridgeRoadPoint, ridgeRoadMark, ridgeRoadHeight } from '../src/gen/layout.ts';
import { HOME_FIT } from '../src/gen/home.ts';
import { antennaBlocks, antennaSpot } from '../src/gen/antenna.ts';
import { RAY_SPOT } from '../src/sim/ridge.ts';
import { recipesAt } from '../src/sim/crafting.ts';
import { itemName } from '../src/world/items.ts';
import { findPlaced } from '../src/game/uplink.ts';
import { Player } from '../src/sim/player.ts';
import { makeCreature } from '../src/entity/creatures.ts';
import { M5_STEPS } from '../src/sim/m5.ts';
import { nextGoal } from '../src/sim/guide.ts';
import { WINDOW_HOURS, spoken } from '../src/sim/uplink.ts';
import { CATALOG_RAY_M5 } from '../src/sim/trade.ts';
import { LURE_SECONDS, POT_SECONDS } from '../src/sim/countermeasures.ts';
import { RAY } from '../src/game/people.ts';

vi.setConfig({ testTimeout: 120_000 });

/** The game's private parts these tests reach into. */
interface In8 {
  tickRadiation(dt: number): void; tickZone4(): void; tickDevices(dt: number): void; tickWild(dt: number): void;
  useHeldItem(): boolean; usePhase8(name: string, x: number, y: number, z: number): boolean; useFurniture(x: number, y: number, z: number, id: number): boolean;
  useComputer(): void; useHoist(): void; openPhone(): void; closePaper(): void; placeBlock(): void; die(): void; meetRay(): void;
  wildEvents(ev: unknown): void; readInput(): { forward: number }; startScope(x: number, y: number, z: number): void;
  scoping: unknown; scopeOk: boolean; doseLine: { text: string; alarm: boolean }; target: unknown; keys: Set<string>; playing: boolean;
  screen: { opened: unknown[]; onMake(r: unknown): void };
}
/** (Phase 8's play moved to `Game.ridge`, src/game/ridge.ts, in Phase 9B's split: its methods are reached there.) */
const RIDGE: Record<string, string> = { tickZone4: 'tick', tickDevices: 'tickDevices', usePhase8: 'use', useHoist: 'useHoist', startScope: 'startScope' };
const inside = (p: Page) => new Proxy(p.game as object, {
  get(g, k) {
    const ridge = (g as { ridge: Record<string, (...a: unknown[]) => unknown> }).ridge;
    if (typeof k === 'string' && RIDGE[k]) return (...a: unknown[]) => ridge[RIDGE[k]](...a);
    const v = Reflect.get(g, k, g);
    return typeof v === 'function' ? v.bind(g) : v;
  },
  set(g, k, v) { return Reflect.set(g, k, v, g); },
}) as unknown as In8;
const paper = (p: Page) => p.in.paper as unknown as FakePaper;

/** A page with play begun in Survival. No land is loaded unless a test brings some in. */
async function begun(flags: string[] = []): Promise<Page> {
  const p = await openPage();
  p.in.ready = true;
  p.in.resume();
  for (const f of flags) p.game.flags.add(f);
  return p;
}
/** Generates the columns covering a rectangle into the game's world. */
function land(p: Page, x0: number, z0: number, x1: number, z1: number): void {
  for (let cz = Math.floor(z0 / CS); cz <= Math.floor(z1 / CS); cz++)
    for (let cx = Math.floor(x0 / CS); cx <= Math.floor(x1 / CS); cx++)
      if (!p.game.world.column(cx, cz)) p.game.world.addColumn(cx, cz, (runJob({ kind: 'gen', cx, cz, edits: [] }).result as GenResult).chunks);
}
const give = (p: Page, name: string, n = 1) => { expect(p.game.hotbar.add(itemId(name), n)).toBe(0); };
const count = (p: Page, name: string) => p.game.hotbar.count(itemId(name));
/** Puts one of an item in the hand (the selected slot). */
function hold(p: Page, name: string): void {
  if (!count(p, name)) give(p, name);
  const slots = (p.game.hotbar as unknown as { slots: ({ id: number } | null)[] }).slots;
  const i = slots.findIndex((s) => s?.id === itemId(name));
  if (i > 8) { [slots[0], slots[i]] = [slots[i], slots[0]]; p.game.hotbar.select(0); } else p.game.hotbar.select(i);
  expect(p.game.hotbar.current?.id).toBe(itemId(name));
}
const at = (p: Page, x: number, y: number, z: number) => { p.game.player.setPosition(x, y, z); };
/** A point on the ridge road, `past` metres beyond the gate. */
const onRoad = (past: number): [number, number, number] => { const s = ridgeRoadMark(ZONE4.road.gate[1]) + past; const [x, z] = ridgeRoadPoint(s); return [x, ridgeRoadHeight(s) + 1, z]; };
/** The recipe for a thing at a station, if it shows with what is known. */
const recipe = (station: Parameters<typeof recipesAt>[0], out: string, known: ReadonlySet<string>) => recipesAt(station, known).find((r) => itemName(r.out[0]) === out);
const said = (p: Page, part: string) => p.hud.toasts.some((t) => t.includes(part));

describe('the ridge’s ground on the body', () => {
  it('without a suit the road takes you to the limit in seconds, then your health, then your life; the meter says so in red', async () => {
    const p = await begun();
    const g = inside(p);
    at(p, ...onRoad(60));
    g.tickRadiation(1);
    expect(p.game.dose).toBeGreaterThan(8);
    expect(g.doseLine.text).toContain('NO SUIT');
    expect(g.doseLine.text).toContain('limit in 0:0');
    expect(g.doseLine.alarm).toBe(true);
    for (let i = 0; i < 9; i++) g.tickRadiation(1);
    expect(p.game.dose).toBe(100);
    expect(g.doseLine.text).toContain('taking your health');
    expect(p.game.vitals.hp).toBeLessThanOrEqual(40);
    expect(p.game.vitals.hp).toBeGreaterThan(0);
    // Three or four seconds more and it is over: dead outside, the pack left where you fell.
    for (let i = 0; i < 5 && p.game.player.x < 1000; i++) g.tickRadiation(1);
    expect(p.game.player.x).toBeGreaterThan(1700); // woke at the cave
    expect(said(p, 'You wake at the cave with nothing') || said(p, 'You wake, aching')).toBe(true);
  });

  it('carried in the pack, the suit lets a fortieth through: the same ten seconds cost three, and the meter is calm', async () => {
    const p = await begun();
    const g = inside(p);
    give(p, 'hazard_suit');
    at(p, ...onRoad(60));
    for (let i = 0; i < 10; i++) g.tickRadiation(1);
    expect(p.game.dose).toBeGreaterThan(2);
    expect(p.game.dose).toBeLessThan(4);
    expect(g.doseLine.text).toMatch(/^\+0\.3\/s · suit · limit in \d+:\d\d$/);
    expect(g.doseLine.alarm).toBe(false);
    expect(p.game.vitals.hp).toBeGreaterThan(95);
    // On the pass's clean ground the meter is still.
    at(p, ZONE4.clean.x, 110, ZONE4.clean.z);
    const before = p.game.dose;
    g.tickRadiation(5);
    expect(p.game.dose).toBe(before);
    expect(g.doseLine.text).toBe('');
    // Once the uplink has mapped the dose, the meter adds what the road costs each way.
    p.game.flags.add('agi_rad');
    at(p, ...onRoad(140));
    g.tickRadiation(0.1);
    expect(g.doseLine.text).toMatch(/road: tower \+\d+, gate \+\d+$/);
  });

  it('flying in Builder’s mode takes no dose', async () => {
    const p = await openPage();
    p.hud.actions.pickMode('builder' as never);
    p.in.ready = true; p.in.resume();
    p.game.player.flying = true;
    at(p, ...onRoad(60));
    inside(p).tickRadiation(10);
    expect(p.game.dose).toBe(0);
  });
});

describe('the medicines', () => {
  it('a blue tablet binds thirty of the dose and is used up; with no dose it is kept', async () => {
    const p = await begun();
    const g = inside(p);
    give(p, 'rad_tablets', 2);
    hold(p, 'rad_tablets');
    expect(g.useHeldItem()).toBe(true);
    expect(count(p, 'rad_tablets')).toBe(2);
    expect(said(p, 'No dose to bind')).toBe(true);
    p.game.dose = 70;
    g.useHeldItem();
    expect(p.game.dose).toBe(40);
    expect(count(p, 'rad_tablets')).toBe(1);
  });

  it('antibiotics bring health to the most the dose allows; adrenaline halves a blow for a minute and fills the focus', async () => {
    const p = await begun();
    const g = inside(p);
    p.game.dose = 50; p.game.vitals.hp = 20;
    hold(p, 'antibiotics');
    g.useHeldItem();
    expect(p.game.vitals.hp).toBe(70);
    expect(count(p, 'antibiotics')).toBe(0);
    // A blow of 20: whole without it, half with it.
    const blow = () => { const hp = p.game.vitals.hp; g.wildEvents({ hits: [{ damage: 20, by: 'ashen' }], sounds: [], kills: [], picked: 0, snared: [], raiders: [], jaguar: [], silent: [], ashen: [], caught: [], hens: [] }); return hp - p.game.vitals.hp; };
    expect(blow()).toBe(20);
    p.game.focus.left = 0;
    hold(p, 'adrenaline');
    g.useHeldItem();
    expect(p.game.focus.left).toBeGreaterThan(3.9);
    expect(blow()).toBe(10);
    // A second shot while the first lasts is not used up.
    give(p, 'adrenaline'); hold(p, 'adrenaline');
    g.useHeldItem();
    expect(count(p, 'adrenaline')).toBe(1);
    g.tickRadiation(61);
    expect(p.game.adrenaline).toBe(0);
    p.game.vitals.hp = 60;
    expect(blow()).toBe(20);
  });

  it('engineer’s armour lets about a third of a blow through, from the pack', async () => {
    const p = await begun();
    give(p, 'engineer_armor');
    const hp = p.game.vitals.hp;
    inside(p).wildEvents({ hits: [{ damage: 20, by: 'ashen' }], sounds: [], kills: [], picked: 0, snared: [], raiders: [], jaguar: [], silent: [], ashen: [], caught: [], hens: [] });
    expect(hp - p.game.vitals.hp).toBeCloseTo(7, 5);
  });

  it('the medical bench and the distiller are cold until a hydro generator turns', async () => {
    const p = await begun(['m4_done', 'pharma_learned']);
    const g = inside(p);
    land(p, 1790, 1010, 1800, 1030);
    const [x, y, z] = [1796, HOME.floor, 1020];
    p.game.world.setBlock(x, y, z, blockId('med_bench'));
    g.target = { x, y, z, id: blockId('med_bench'), nx: 0, ny: 1, nz: 0, dist: 2 };
    g.placeBlock();
    expect(said(p, 'The medical bench is cold')).toBe(true);
    expect(g.screen.opened.length).toBe(0);
    p.game.devices.hydro_generator = [[1700, 60, 1000]];
    g.placeBlock();
    expect(g.screen.opened.length).toBe(1);
    expect((g.screen.opened[0] as unknown[])[2]).toBe('med_bench');
  });
});

describe('Ray', () => {
  /** Calls a contact on the phone by the start of its name; returns what is said. */
  const call = (p: Page, name: string) => { inside(p).openPhone(); const row = paper(p).phoneRows.find((r) => r.name.startsWith(name)); return row?.call ? row.call() : null; };

  it('gives his word on the ridge only once M4 is done; the suit’s pattern shows at the workbench then', async () => {
    const p = await begun(['ray_known', 'ray_called', 'hydro_plans', 'hydro_built', 'uplink_plans']);
    expect(call(p, 'Ray')).toBe(RAY.ridgeNotYet);
    expect(p.game.flags.has('suit_word')).toBe(false);
    expect(recipe('workbench', 'hazard_suit', p.game.flags)).toBeUndefined();
    p.game.flags.add('m4_done');
    expect(call(p, 'Ray')).toBe(RAY.ridge);
    expect(p.game.flags.has('suit_word')).toBe(true);
    expect(recipe('workbench', 'hazard_suit', p.game.flags)).toBeDefined();
    // From his word on he sells a suit of his own make: lead is finite, and a suit can lie in a lost pack on the ridge.
    const lots = paper(p).tradeView!().buy;
    const suit = lots.find((r) => r.label.startsWith('Hazard suit'))!;
    expect(suit).toBeDefined();
    p.game.wallet = 10_000_000;
    suit.act();
    expect(count(p, 'hazard_suit')).toBe(1);
    expect(lots.some((r) => r.label.startsWith('Blue tablets'))).toBe(false); // the ridge's own things only after the meeting
    p.game.hotbar.remove(itemId('hazard_suit'), 1);
    // His usual talk after that.
    expect(RAY.again).toContain(call(p, 'Ray'));
  });

  it('will not climb the hill for someone with no suit; with one he waits at the refuge by day, hands over the modem once, and sells what the ridge gives', async () => {
    const p = await begun(['ray_known', 'ray_called', 'hydro_plans', 'hydro_built', 'uplink_plans', 'm4_done', 'suit_word']);
    const g = inside(p);
    expect(call(p, RAY.meetButton)).toBe(RAY.meetNoSuit);
    expect(p.game.flags.has('ray_coming')).toBe(false);
    const status = () => { g.openPhone(); return paper(p).phoneRows.find((r) => r.name === RAY.meetButton)!.status; };
    expect(status()).toBe('needs a hazard suit');
    give(p, 'hazard_suit');
    expect(status()).toBe('you carry the suit: ask him'); // (it said "needs a hazard suit" to someone carrying one)
    expect(call(p, RAY.meetButton)).toBe(RAY.meetDay);
    expect(call(p, RAY.meetButton)).toBe(RAY.meetWaiting);
    // At the pass by day he is there; at night he is not.
    land(p, RAY_SPOT.x - 6, RAY_SPOT.z - 6, RAY_SPOT.x + 6, RAY_SPOT.z + 6);
    at(p, RAY_SPOT.x - 4, 110, RAY_SPOT.z);
    const ray = () => p.game.wild.creatures.find((c) => c.kind === 'ray');
    p.game.hour = 22; g.tickZone4();
    expect(ray()).toBeUndefined();
    p.game.hour = 10; g.tickZone4();
    expect(ray()).toBeDefined();
    expect(Math.hypot(ray()!.x - RAY_SPOT.x, ray()!.z - RAY_SPOT.z)).toBeLessThan(1.5);
    g.tickZone4();
    expect(said(p, 'Ray is here')).toBe(true);
    expect(p.game.wild.creatures.filter((c) => c.kind === 'ray').length).toBe(1);
    // With no room in the pack he waits: the modem never goes on the ground.
    const slots = (p.game.hotbar as unknown as { slots: unknown[] }).slots;
    const kept = slots.slice();
    for (let i = 0; i < slots.length; i++) slots[i] ??= { id: itemId('stone_pickaxe'), count: 1 };
    g.meetRay();
    expect([p.game.flags.has('ray_met'), count(p, 'sat_modem')]).toEqual([false, 0]);
    expect(said(p, 'Make room in your pack first')).toBe(true);
    slots.splice(0, slots.length, ...kept);
    g.meetRay();
    expect([p.game.flags.has('ray_met'), count(p, 'sat_modem'), count(p, 'rad_tablets')]).toEqual([true, 1, 2]);
    expect(said(p, 'The dam’s telemetry modem')).toBe(true);
    // He stays while you stand with him (he used to vanish under his own words), and has no more to give.
    g.tickZone4();
    expect(ray()).toBeDefined();
    g.meetRay();
    expect(said(p, RAY.look)).toBe(true);
    expect(count(p, 'sat_modem')).toBe(1);
    // Walk off and he is gone for good, the button with him; his catalogue has grown.
    at(p, RAY_SPOT.x - 60, 110, RAY_SPOT.z);
    g.tickZone4();
    expect(ray()).toBeUndefined();
    at(p, RAY_SPOT.x - 4, 110, RAY_SPOT.z);
    g.tickZone4();
    expect(ray()).toBeUndefined();
    g.openPhone();
    expect(paper(p).phoneRows.some((r) => r.name === RAY.meetButton)).toBe(false);
    call(p, 'Ray');
    const labels = paper(p).tradeView!().buy.map((r) => r.label);
    expect(CATALOG_RAY_M5.length).toBe(4);
    for (const part of ['Blue tablets', 'Rare components', 'Antenna section', 'Pipe fittings', 'Hazard suit']) expect(labels.some((l) => l.startsWith(part)), part).toBe(true);
    // A second meeting gives nothing more.
    g.meetRay();
    expect(count(p, 'sat_modem')).toBe(1);
  });

  it('is never struck or shot: he is a person', async () => {
    const p = await begun();
    const r = makeCreature('ray', 400, 100, 400);
    const { hurt } = await import('../src/entity/creatures.ts');
    expect(hurt(r, 1e6)).toBe(false);
    expect(r.hp).toBeGreaterThan(1e6);
    void p;
  });
});

describe('the ridge’s places and M5’s run', () => {
  it('says each place once, the gate differently with a suit; the yard and home alive tick the run, and a death outside before home undoes it', async () => {
    const p = await begun();
    const g = inside(p);
    at(p, ZONE4.gate.x, 90, ZONE4.gate.z);
    g.tickZone4();
    expect(said(p, 'Call him from the cave')).toBe(true);
    expect(p.game.flags.has('ridge_gate')).toBe(true);
    const n = p.hud.toasts.length;
    g.tickZone4();
    expect(p.hud.toasts.length).toBe(n);
    at(p, (ZONE4.yard.x0 + ZONE4.yard.x1) / 2, 130, (ZONE4.yard.z0 + ZONE4.yard.z1) / 2);
    g.tickZone4();
    expect(p.game.flags.has('yard_reached')).toBe(true);
    expect(said(p, 'The relay tower')).toBe(true);
    // Dead on the ridge: the run is walked again.
    p.game.vitals.hp = 0; g.die();
    expect(p.game.flags.has('yard_reached')).toBe(false);
    at(p, (ZONE4.yard.x0 + ZONE4.yard.x1) / 2, 130, (ZONE4.yard.z0 + ZONE4.yard.z1) / 2);
    g.tickZone4();
    at(p, 1700, 60, 1024);
    g.tickZone4();
    expect(p.game.flags.has('ridge_home')).toBe(true);
    expect(said(p, 'Home from the ridge, alive')).toBe(true);
  });

  it('the goal on screen moves on to M5 after M4, step by step', () => {
    const f = new Set(['m1_done', 'm2_done', 'm3_done', 'm4_done']);
    expect(nextGoal(f)).toBe(`M5 · ${M5_STEPS[0].label}`);
    f.add('ridge_home');
    expect(nextGoal(f)).toBe(`M5 · ${M5_STEPS[1].label}`);
    for (const st of M5_STEPS) f.add(st.flag);
    f.add('m5_done');
    expect(nextGoal(f)).toBeNull();
  });

  it('the pages left on the ridge are read where they lie and kept in the notes; the manual teaches the bench and the distiller', async () => {
    const p = await begun(['m4_done']);
    const g = inside(p);
    const { HUT_LOG, PHARMA_MANUAL } = await import('../src/gen/zone4.ts');
    expect(g.usePhase8('note_desk', HUT_LOG[0], HUT_LOG[1], HUT_LOG[2])).toBe(true);
    expect(p.game.flags.has('hut_log')).toBe(true);
    expect(paper(p).isOpen).toBe(true);
    g.closePaper();
    expect(recipe('workbench', 'med_bench', p.game.flags)).toBeUndefined();
    g.usePhase8('manual_shelf', PHARMA_MANUAL[0], PHARMA_MANUAL[1], PHARMA_MANUAL[2]);
    expect(p.game.flags.has('pharma_learned')).toBe(true);
    expect(recipe('workbench', 'med_bench', p.game.flags)).toBeDefined();
    expect(recipe('workbench', 'distiller', p.game.flags)).toBeDefined();
  });
});

describe('M5 at home', () => {
  it('the hoist says what it is for; with the antenna in hand it sets the mast and dish on the cliff, once, and the save keeps them', async () => {
    const p = await begun();
    const g = inside(p);
    land(p, HOME_FIT.mast.x0 - 4, HOME_FIT.mast.z - 4, HOME_FIT.mast.x1 + 2, HOME_FIT.mast.z + 4);
    g.useHoist();
    expect(said(p, 'He meant to lift something heavy')).toBe(true);
    p.game.flags.add('uplink_plans');
    g.useHoist();
    expect(said(p, 'With the satellite antenna assembled')).toBe(true);
    expect(p.game.flags.has('antenna_up')).toBe(false);
    hold(p, 'sat_antenna');
    const spot = antennaSpot(HOME_FIT.mast, (x, y, z) => !!blockName(p.game.world.blockAt(x, y, z)) && p.game.world.blockAt(x, y, z) !== 0 && !blockName(p.game.world.blockAt(x, y, z)).includes('water'))!;
    g.useHoist();
    expect(p.game.flags.has('antenna_up')).toBe(true);
    expect(count(p, 'sat_antenna')).toBe(0);
    for (const [x, y, z, name] of antennaBlocks(...spot)) expect(blockName(p.game.world.blockAt(x, y, z)), `${x},${y},${z}`).toBe(name);
    expect(spot[1]).toBeGreaterThan(HOME_FIT.mast.above);
    // Again: it only says the antenna is up.
    g.useHoist();
    expect(said(p, 'The antenna is up on the cliff')).toBe(true);
    // The save holds the blocks and the flag.
    const d = normaliseSave(JSON.parse(JSON.stringify(p.game.snapshot())))!;
    const q = await begun();
    q.game.applySave(d);
    expect(q.game.flags.has('antenna_up')).toBe(true);
    expect(findPlaced(q.game.world.edits, 'sat_dish').length).toBe(37);
    expect(findPlaced(q.game.world.edits, 'tower_steel')).toContainEqual(spot);
  });

  it('a telescope counts under open sky at home, not under the cave’s roof; right-clicked, it narrows the view until you step back', async () => {
    const p = await begun();
    const g = inside(p);
    land(p, 1790, 1016, 1812, 1030);
    // In the cave, under rock.
    p.game.world.setBlock(1808, HOME.floor, 1024, blockId('telescope'));
    at(p, 1806, HOME.floor, 1024);
    g.tickZone4();
    expect([g.scopeOk, p.game.flags.has('telescope_set')]).toEqual([false, false]);
    // On the balcony, under the sky.
    p.game.world.setBlock(1808, HOME.floor, 1024, 0);
    p.game.world.setBlock(1795, HOME.floor, 1022, blockId('telescope'));
    at(p, 1796.5, HOME.floor, 1022.5);
    g.tickZone4();
    expect([g.scopeOk, p.game.flags.has('telescope_set')]).toEqual([true, true]);
    expect(p.game.linkNeeds().telescope).toBe(true);
    // Away from home it counts as last seen (the search is not run out there), and is looked at again on coming back.
    at(p, 1000, 90, 1000);
    p.game.world.setBlock(1795, HOME.floor, 1022, 0);
    g.tickZone4();
    expect(p.game.linkNeeds().telescope).toBe(true);
    at(p, 1796.5, HOME.floor, 1022.5);
    g.tickZone4();
    expect(p.game.linkNeeds().telescope).toBe(false);
    p.game.world.setBlock(1795, HOME.floor, 1022, blockId('telescope'));
    g.tickZone4();
    expect(p.game.linkNeeds().telescope).toBe(true);
    // Looking through it: the body stands still; E puts it down.
    g.startScope(1795, HOME.floor, 1022);
    expect(g.scoping).toBeTruthy();
    g.keys.add('KeyW');
    expect(g.readInput().forward).toBe(0);
    fire('window', 'keydown', { code: 'KeyE' });
    expect(g.scoping).toBeNull();
    expect(g.screen.opened.length).toBe(0); // E put the telescope down; it did not open the pack
    // Taken indoors again it stops counting, and the link says so.
    p.game.world.setBlock(1795, HOME.floor, 1022, 0);
    g.tickZone4();
    expect(p.game.linkNeeds().telescope).toBe(false);
  });
});

describe('the uplink', () => {
  /** Everything the link needs, in place. */
  async function linked(): Promise<Page> {
    const p = await begun(['m4_done', 'antenna_up', 'uplink_plans', 'ray_met']);
    inside(p).scopeOk = true;
    p.game.devices.hydro_generator = [[1700, 60, 1000]];
    return p;
  }
  const action = (p: Page, label: string) => paper(p).computerActions.find((a) => a.label === label);

  it('the terminal is fitted by right-clicking the computer with it; the page lists what the link still needs', async () => {
    const p = await begun(['uplink_plans', 'ray_met']);
    const g = inside(p);
    g.useComputer();
    expect(paper(p).computerActions).toEqual([]);
    expect(paper(p).computerRows.find((r) => r[0] === 'Satellite uplink')![1]).toContain('no antenna');
    g.closePaper();
    hold(p, 'uplink_terminal');
    g.useComputer();
    expect(p.game.flags.has('uplink_fitted')).toBe(true);
    expect(count(p, 'uplink_terminal')).toBe(0);
    action(p, 'Uplink')!.act();
    const v = paper(p).uplinkView!;
    expect([v.ready, v.live]).toEqual([false, false]);
    expect(v.needs.map((n) => n.ok)).toEqual([false, false, false, true]);
    // M5's rows are on the computer, after M4's.
    expect(paper(p).computerRows.some((r) => r[0] === 'M5 · the uplink')).toBe(true);
  });

  it('opening it prints the endpoints unasked; putting the page down brings the closing card, once; then the queries are open', async () => {
    const p = await linked();
    const g = inside(p);
    p.game.flags.add('uplink_fitted');
    g.useComputer();
    action(p, 'Uplink')!.act();
    const v = paper(p).uplinkView!;
    expect([v.ready, v.live]).toEqual([true, false]);
    const { handshake, first } = v.open();
    expect(handshake.length).toBe(4);
    expect(first.head).toContain('ENDPOINTS');
    expect(first.rows.some((r) => r.includes('MIRA-7'))).toBe(true);
    for (const row of [first.head, ...first.rows]) expect(spoken(row), row).toBeNull();
    expect(p.game.flags.has('uplink_live')).toBe(true);
    expect(p.game.flags.has('agi_asked')).toBe(false); // the first answer came unasked
    expect(p.game.flags.has('ending_seen')).toBe(false);
    // The page is put down with the first answer on it (the real page arms this when the answer has printed).
    paper(p).putDown = v.firstRead;
    g.closePaper();
    expect(p.game.flags.has('ending_seen')).toBe(true);
    expect(paper(p).shown.at(-1)).toBe('ending');
    expect(paper(p).isOpen).toBe(true);
    paper(p).endingBack!();
    expect(paper(p).isOpen).toBe(false);
    expect(said(p, 'The valley is yours')).toBe(true);
    // Again at the computer: the queries at once, the card on request, never by itself again.
    g.useComputer();
    expect(paper(p).computerActions.map((a) => a.label)).toEqual(['Uplink', 'The story so far']);
    action(p, 'Uplink')!.act();
    const w = paper(p).uplinkView!;
    expect(w.live).toBe(true);
    const shown = paper(p).shown.length;
    paper(p).putDown = null;
    g.closePaper();
    expect(paper(p).shown.length).toBe(shown);
    // Mira's beacon is on the phone: a position, no voice.
    g.openPhone();
    expect(paper(p).phoneRows.find((r) => r.name === 'MIRA-7')!.status).toContain('no voice');
  });

  it('asking counts for M5 and changes what you carry: the map, the chips; one drawing a window, kept by the save', async () => {
    const p = await linked();
    const g = inside(p);
    p.game.flags.add('uplink_fitted'); p.game.flags.add('uplink_live'); p.game.flags.add('ending_seen');
    g.useComputer();
    action(p, 'Uplink')!.act();
    const v = paper(p).uplinkView!;
    expect(v.queries.map((q) => q.id)).toEqual(['RAD', 'BIO', 'EPH', 'SCH', 'END']);
    v.ask('RAD');
    expect([p.game.flags.has('agi_rad'), p.game.flags.has('agi_asked')]).toEqual([true, true]);
    v.ask('BIO'); v.ask('EPH');
    expect([p.game.flags.has('agi_bio'), p.game.flags.has('agi_eph')]).toEqual([true, true]);
    // A drawing: its recipe shows; the window shuts for six hours of the link's clock.
    p.game.day = 3; p.game.hour = 10;
    expect(recipe('lathe', 'thermal_optic', p.game.flags)).toBeUndefined();
    expect(v.pull('sch_thermal')).not.toBeNull();
    expect(recipe('lathe', 'thermal_optic', p.game.flags)).toBeDefined();
    expect(p.game.lastPull).toBe(3 * 24 + 10);
    expect(v.pull('sch_sonic')).toBeNull();
    expect(v.drawings().find((d) => d.flag === 'sch_thermal')!.held).toBe(true);
    // Saved, loaded: the window is still shut; six hours on it opens.
    const d = normaliseSave(JSON.parse(JSON.stringify(p.game.snapshot())))!;
    expect([d.day, d.lastPull]).toEqual([3, 82]);
    const q = await begun();
    q.game.applySave(d);
    inside(q).scopeOk = true; q.game.devices.hydro_generator = [[1700, 60, 1000]];
    inside(q).useComputer();
    action(q, 'Uplink')!.act();
    const w = paper(q).uplinkView!;
    expect(w.live).toBe(true);
    expect(w.pull('sch_sonic')).toBeNull();
    q.game.hour = 10 + WINDOW_HOURS;
    expect(w.pull('sch_sonic')).not.toBeNull();
    // Outside the valley the chips show: the time to dusk, and a nest close by.
    const nest = ZONE4.nest;
    at(q, nest.x + 20, 128, nest.z);
    q.game.hour = 15.5;
    inside(q).tickZone4();
    expect((q.hud as unknown as { chipText: string }).chipText).toBe('dusk in 2:30 · nest 20 m');
  });

  it('with the generator stopped the page says the link is down and names what is missing', async () => {
    const p = await linked();
    p.game.flags.add('uplink_fitted'); p.game.flags.add('uplink_live');
    p.game.devices.hydro_generator = [];
    inside(p).useComputer();
    action(p, 'Uplink')!.act();
    const v = paper(p).uplinkView!;
    expect([v.ready, v.live]).toEqual([false, false]);
    expect(v.needs.filter((n) => !n.ok).map((n) => n.label)).toEqual(['POWER']);
    expect(paper(p).computerRows.find((r) => r[0] === 'Satellite uplink')![1]).toContain('link down');
  });

  it('what is made at the benches ticks M5: a medicine, a build from a drawing, the armour', async () => {
    const p = await begun();
    const g = inside(p);
    for (const [name, flag] of [['antibiotics', 'med_made'], ['smoke_pot', 'schematic_built'], ['engineer_armor', 'armor3_made']] as const) {
      expect(p.game.flags.has(flag)).toBe(false);
      const id = name === 'smoke_pot' ? blockId(name) : itemId(name);
      g.screen.onMake({ out: [id, 1] });
      expect(p.game.flags.has(flag), flag).toBe(true);
    }
    expect(said(p, 'Engineer’s armour')).toBe(true);
  });
});

describe('the lure and the pot', () => {
  it('a lure started with a right-click wails its forty seconds, calls every Ashen in earshot to it, and is gone', async () => {
    const p = await begun();
    const g = inside(p);
    const nest = ZONE4.nest, [x, y, z] = [Math.floor(nest.x) + 12, 140, Math.floor(nest.z)];
    land(p, x, z, x, z);
    p.game.world.setBlock(x, y, z, blockId('sonic_lure'));
    const a = makeCreature('ashen', nest.x, 128, nest.z);
    p.game.wild.creatures.push(a);
    at(p, x + 30, 128, z);
    expect(g.usePhase8('sonic_lure', x, y, z)).toBe(true);
    expect(blockName(p.game.world.blockAt(x, y, z))).toBe('sonic_lure_on');
    expect(p.game.running.length).toBe(1);
    // (The creatures think twenty times a second, the game sixty: the call must not be lost between.)
    g.tickDevices(1 / 60); g.tickWild(1 / 60);
    for (let i = 0; i < 3; i++) g.tickWild(1 / 60);
    expect(a.mind).toBe('seek');
    expect([a.goalX, a.goalZ]).toEqual([x + 0.5, z + 0.5]);
    // It keeps its time across a save.
    for (let i = 0; i < 600; i++) g.tickDevices(1 / 60);
    const d = normaliseSave(JSON.parse(JSON.stringify(p.game.snapshot())))!;
    expect(d.running!.length).toBe(1);
    expect(d.running![0].left).toBeCloseTo(LURE_SECONDS - 10 - 1 / 60, 1);
    for (let i = 0; i < 31 * 60; i++) g.tickDevices(1 / 60);
    expect(p.game.running.length).toBe(0);
    expect(p.game.world.blockAt(x, y, z)).toBe(0);
  });

  it('a pot burns its minute; one left lit by a save that lost its clock is simply spent', async () => {
    const p = await begun();
    const g = inside(p);
    const [x, y, z] = [400, 150, 400];
    land(p, x, z, x, z);
    p.game.world.setBlock(x, y, z, blockId('smoke_pot'));
    g.usePhase8('smoke_pot', x, y, z);
    expect(blockName(p.game.world.blockAt(x, y, z))).toBe('smoke_pot_lit');
    for (let i = 0; i < POT_SECONDS + 1; i++) g.tickDevices(1);
    expect(p.game.world.blockAt(x, y, z)).toBe(0);
    p.game.world.setBlock(x, y, z, blockId('smoke_pot_lit'));
    g.usePhase8('smoke_pot_lit', x, y, z);
    expect(p.game.world.blockAt(x, y, z)).toBe(0);
  });
});

describe('saves', () => {
  it('a version-3 save comes up to this build’s with the days at nought, no drawing sent and nothing running', () => {
    const old = { ...newSave(), version: 3 } as Record<string, unknown>;
    delete old.day; delete old.lastPull; delete old.running;
    const d = normaliseSave(old)!;
    expect([d.version, d.day, d.lastPull, d.running]).toEqual([SAVE_VERSION, 0, null, []]);
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(4); // (5 since Phase 9B: tests/promises9b.test.ts)
    expect(migrate({ ...old })).toBe(true);
  });

  it('what Phase 8 adds is checked like the rest: nonsense falls back, and never throws', () => {
    const d = normaliseSave({ ...newSave(), day: 'x', lastPull: -5, running: [{ kind: 'lure', x: 1, y: 2, z: 3, left: 9, call: 1 }, { kind: 'bomb', x: 1, y: 2, z: 3, left: 9, call: 0 }, { kind: 'pot', x: 1e9, y: 2, z: 3, left: 9, call: 0 }, null, 7] })!;
    expect([d.day, d.lastPull]).toEqual([0, null]);
    expect(d.running).toEqual([{ kind: 'lure', x: 1, y: 2, z: 3, left: 9, call: 1 }]);
    expect(normaliseSave({ ...newSave(), day: 12.7, lastPull: 40.5 })).toMatchObject({ day: 12, lastPull: 40.5 });
  });

  it('the days are counted at midnight and when a night is slept through', async () => {
    const p = await begun();
    p.game.hour = 23.99;
    (p.game as unknown as { opts: { test: boolean } }).opts.test = false;
    const before = p.game.day;
    p.in.frame(performance.now() + 5e6);
    p.in.frame(performance.now() + 5e6 + 100);
    for (let i = 2; i < 40 && p.game.day === before; i++) p.in.frame(performance.now() + 5e6 + i * 100);
    expect(p.game.day).toBe(before + 1);
    expect(p.game.hour).toBeLessThan(1);
  });

  it('a player saved where the ridge has since been lowered is set down on the ground, unhurt; one standing, or in water, is left alone', () => {
    const ground = (top: number, water = false) => (_x: number, y: number, _z: number) => (y < top ? 1 : water && y < top + 3 ? blockId('water') : 0);
    const p = new Player();
    p.setPosition(10.5, 160, 10.5);
    expect(p.setDown(ground(120))).toBe(true);
    expect(p.y).toBe(120);
    expect(p.landedFall).toBe(0);
    p.step(1 / 60, { forward: 0, strafe: 0, jump: false, sprint: false, descend: false }, ground(120));
    expect(p.landedFall).toBe(0);
    // Standing on it, or a step above it: nothing.
    p.setPosition(10.5, 120, 10.5);
    expect(p.setDown(ground(120))).toBe(false);
    p.setPosition(10.5, 122.5, 10.5);
    expect(p.setDown(ground(120))).toBe(false);
    // Afloat: nothing.
    p.setPosition(10.5, 121, 10.5);
    expect(p.setDown(ground(120, true))).toBe(false);
    // Over nothing at all (land not loaded): nothing.
    p.setPosition(10.5, 160, 10.5);
    expect(p.setDown(() => 0)).toBe(false);
  });
});

// ---- The fresh review (docs/PHASE8.md, "The fresh review"): each finding, held by a test ---------------------

describe('the fresh review', () => {
  /** A stand-in for the page's elements: enough for the uplink page to be filled and clicked. */
  function fakeDom() {
    const node = (tag: string) => {
      const n: Record<string, unknown> & { children: unknown[] } = { tag, children: [], dataset: {}, style: {}, textContent: '', className: '', hidden: false, disabled: false, onclick: null,
        append(...c: unknown[]) { n.children.push(...c); } };
      Object.defineProperty(n, 'innerHTML', { set() { n.children = []; } });
      return n;
    };
    (globalThis as Record<string, unknown>).document = { ...(globalThis as unknown as { document: object }).document, createElement: node, createTextNode: (t: string) => ({ text: t }) };
    const find = (p: { children?: unknown[] }, pred: (n: { dataset?: Record<string, string>; onclick?: () => void }) => boolean): { onclick: () => void } | null => {
      for (const c of (p.children ?? []) as { children?: unknown[]; dataset?: Record<string, string>; onclick?: () => void }[]) { if (pred(c)) return c as { onclick: () => void }; const r = find(c, pred); if (r) return r; }
      return null;
    };
    return { node, find };
  }
  const host = (flags: string[] = []) => {
    const g = { flags: new Set(['uplink_fitted', 'antenna_up', ...flags]), day: 3, hour: 10, lastPull: null as number | null, opened: 0, reads: 0,
      linkNeeds: () => ({ antenna: true, telescope: true, hydro: true, terminal: true }), edited() {}, linkOpened() { g.opened++; }, firstRead() { g.reads++; g.flags.add('ending_seen'); } };
    return g;
  };

  it('2 · the closing card cannot be lost: a page put down during the handshake still counts as read, and a link opened but never read opens again', async () => {
    const { fillUplink } = await import('../src/ui/uplinkScreen.ts');
    const { uplinkView } = await import('../src/game/uplink.ts');
    const { node, find } = fakeDom();
    // Put down one line into the handshake (it runs 2.7 s as shipped): the first answer is owed, so the card comes.
    const g = host(), panel = node('div');
    const down = fillUplink(panel as unknown as HTMLElement, uplinkView(g), 450);
    find(panel, (n) => !!n.dataset?.open)!.onclick();
    expect(g.flags.has('uplink_live')).toBe(true);
    down();
    expect(g.reads).toBe(1);
    down();
    expect(g.reads).toBe(1); // once
    // The tab closed with the answer on the page: the save has the link open and no card seen. The page offers
    // OPEN LINK again, not the queries, and the card follows as it should have.
    const h = host(['uplink_live', 'agi_end']), v = uplinkView(h);
    expect([v.ready, v.live]).toEqual([true, false]);
    const panel2 = node('div');
    const down2 = fillUplink(panel2 as unknown as HTMLElement, v, 0);
    expect(find(panel2, (n) => !!n.dataset?.query)).toBeNull();
    find(panel2, (n) => !!n.dataset?.open)!.onclick();
    down2();
    expect([h.reads, h.flags.has('ending_seen')]).toEqual([1, true]);
    expect(uplinkView(h).live).toBe(true);
  });

  it('3 · the manual and the pages cannot be mined away; a lure or pot cannot be mined while it runs; the dome’s shell goes back matching', async () => {
    const { BLOCK_DEFS } = await import('../src/world/blocks.ts');
    const { dropOf } = await import('../src/world/items.ts');
    for (const n of ['manual_shelf', 'note_desk', 'sonic_lure_on', 'smoke_pot_lit']) expect(BLOCK_DEFS[blockId(n)].hardness, n).toBeLessThan(0);
    for (const n of ['dome_shell', 'scope_tube', 'dead_trunk', 'sludge']) expect(dropOf(blockId(n)), n).toBe(blockId(n));
    // And a lure not yet started can still be picked up again.
    expect(BLOCK_DEFS[blockId('sonic_lure')].hardness).toBeGreaterThan(0);
  });

  it('4 · a save made with no suit on what is now poisoned ground wakes outside the gate, not into certain death; with a suit it is left where it was', async () => {
    const { gateRefuge } = await import('../src/sim/ridge.ts');
    const { inFallout, radiationAt } = await import('../src/gen/layout.ts');
    const at0 = gateRefuge();
    expect(inFallout(at0.x, at0.z)).toBe(false);
    expect(radiationAt(at0.x, at0.z)).toBe(0);
    const old = { ...newSave(), version: 3, flags: ['begun'] } as Record<string, unknown>;
    (old.player as { x: number; y: number; z: number }) = { ...(old.player as object), x: 300.5, y: 150, z: 300.5 } as never;
    const p = await begun();
    p.game.applySave(normaliseSave(old)!);
    expect([p.game.player.x, p.game.player.z]).toEqual([at0.x, at0.z]);
    inside(p).tickRadiation(5);
    expect(p.game.dose).toBe(0);
    // Carrying a suit: where they were.
    const suited = normaliseSave({ ...old, hotbar: [{ name: 'hazard_suit', count: 1 }, ...new Array(35).fill(null)] })!;
    p.game.applySave(suited);
    expect([p.game.player.x, p.game.player.z]).toEqual([300.5, 300.5]);
    // On the pass's clean ground with no suit: left alone too (hold H works there).
    (old.player as { x: number; z: number }).x = ZONE4.clean.x; (old.player as { x: number; z: number }).z = ZONE4.clean.z;
    p.game.applySave(normaliseSave(old)!);
    expect([p.game.player.x, p.game.player.z]).toEqual([ZONE4.clean.x, ZONE4.clean.z]);
  });

  it('5 · the dose’s cap coming down is not a blow: hold H works for a whole, suited player on the ridge road; health past the limit is a blow', async () => {
    const p = await begun();
    const g = inside(p);
    give(p, 'hazard_suit');
    at(p, ...onRoad(60)); // between the gate and the pass
    let hurts = 0;
    for (let i = 0; i < 90; i++) { g.tickRadiation(1); if (p.game.vitals.hp < p.game.hpBefore - 0.01) hurts++; p.game.hpBefore = p.game.vitals.hp; }
    expect(p.game.dose).toBeGreaterThan(20);
    expect(p.game.vitals.hp).toBeLessThan(90); // the cap did come down
    expect(hurts).toBe(0);
    // Without the suit, at the limit: that is being hurt.
    p.game.hotbar.remove(itemId('hazard_suit'), 1);
    p.game.dose = 100; p.game.vitals.hp = 40; p.game.hpBefore = 40;
    g.tickRadiation(0.5);
    expect(p.game.vitals.hp).toBeLessThan(p.game.hpBefore - 1);
  });

  it('7 · there are no tablets this side of the gate, to find or to buy, before a suit has been carried through it', async () => {
    const { ZONE4_CHESTS } = await import('../src/gen/inheritance.ts');
    const { BOOTH_SHELF } = await import('../src/gen/zone4.ts');
    const { inFallout } = await import('../src/gen/layout.ts');
    const outside = ZONE4_CHESTS.filter((c) => !inFallout(c.x, c.z) || (c.x === BOOTH_SHELF[0] && c.z === BOOTH_SHELF[2]));
    expect(outside.length).toBeGreaterThan(0);
    for (const c of outside) expect(c.items.some(([n]) => n === 'rad_tablets'), c.title).toBe(false);
    const { HOME_CHESTS, ZONE1_CHESTS, ZONE2_CHESTS, ZONE3_CHESTS } = await import('../src/gen/inheritance.ts');
    for (const c of [...HOME_CHESTS, ...ZONE1_CHESTS, ...ZONE2_CHESTS, ...ZONE3_CHESTS]) expect(c.items.some(([n]) => n === 'rad_tablets'), c.title).toBe(false);
  });

  it('8 · a night slept through counts a day, a nap after midnight does not; what was running is running after a load', async () => {
    const p = await begun();
    const g = inside(p);
    const bed = blockId('bed');
    for (const [hour, days] of [[17.2, 1], [23.5, 1], [0.5, 0], [5.5, 0]] as const) {
      p.game.hour = hour;
      const before = p.game.day;
      g.useFurniture(0, 0, 0, bed);
      expect(p.game.day - before, `slept from ${hour}`).toBe(days);
      expect(p.game.hour).toBe(6);
    }
    land(p, 400, 400, 400, 400);
    p.game.world.setBlock(400, 150, 400, blockId('smoke_pot'));
    g.usePhase8('smoke_pot', 400, 150, 400);
    g.tickDevices(7);
    const q = await begun();
    q.game.applySave(normaliseSave(JSON.parse(JSON.stringify(p.game.snapshot())))!);
    expect(q.game.running).toEqual([{ kind: 'pot', x: 400, y: 150, z: 400, left: POT_SECONDS - 7, call: 0 }]);
  });

  it('9 · Builder’s clock keys carry the day across midnight; a held key’s repeats do not put a screen down; every one of M5’s recipes waits for M4', async () => {
    const p = await openPage();
    p.hud.actions.pickMode('builder' as never);
    p.in.ready = true; p.in.resume();
    p.game.hour = 23.5; p.game.day = 4;
    fire('window', 'keydown', { code: 'BracketRight' });
    expect([p.game.day, p.game.hour]).toEqual([5, 0.5]);
    fire('window', 'keydown', { code: 'BracketLeft' });
    expect([p.game.day, p.game.hour]).toEqual([4, 23.5]);
    // E held: its repeats leave the open screen alone; a fresh press puts it down.
    inside(p).useComputer();
    fire('window', 'keydown', { code: 'KeyE', repeat: true });
    expect(paper(p).isOpen).toBe(true);
    fire('window', 'keydown', { code: 'KeyE' });
    expect(paper(p).isOpen).toBe(false);
    const { RECIPES } = await import('../src/sim/crafting.ts');
    const m5 = ['hazard_suit', 'sat_antenna', 'telescope', 'uplink_terminal', 'med_bench', 'distiller', 'spirit', 'rad_tablets', 'antibiotics', 'adrenaline', 'thermal_optic', 'sonic_lure', 'smoke_pot', 'engineer_armor'];
    const mine = RECIPES.filter((r) => m5.includes(itemName(r.out[0])));
    expect(mine.length).toBe(15);
    for (const r of mine) expect(r.after, itemName(r.out[0])).toBe('m4_done');
  });
});
