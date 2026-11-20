// N6 (docs/REVIEW.md, docs/FIXES.md 7): the first ten minutes. An opening that says who you are and where, short
// and skippable; the first goals on screen one at a time, then the next milestone step; how to eat and drink.

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

import { openPage, memoryPending, browserStore, type Page } from './game/harness.ts';
import { OPENING, FIRST_GOALS, HINTS, nextGoal } from '../src/sim/guide.ts';
import { M1_STEPS, M2_STEPS, M4_STEPS } from '../src/sim/milestones.ts';
import { ARRIVAL, BEGUN, newSave } from '../src/save/state.ts';
import { encodeSave } from '../src/save/save.ts';
import { SAVE_KEY } from '../src/save/keeper.ts';
import { itemId, foodOf } from '../src/world/items.ts';
import { Inventory } from '../src/sim/inventory.ts';

vi.setConfig({ testTimeout: 60_000 });

interface Hands { useHeldItem(): boolean; openJournal(): void; tickPlaces(): void }
const hands = (p: Page) => p.game as unknown as Hands;
const hold = (p: Page, name: string) => { p.game.hotbar.select(p.game.hotbar.slots.findIndex((s) => s && s.id === itemId(name))); };

describe('the opening', () => {
  it('is a few short cards in plain words: never a wall of text', () => {
    expect(OPENING.length).toBeGreaterThanOrEqual(2);
    expect(OPENING.length).toBeLessThanOrEqual(4);
    for (const card of OPENING) {
      expect(card.length).toBeLessThan(220);
      expect(card.split('\n').length).toBeLessThanOrEqual(3);
    }
    const all = OPENING.join(' ');
    expect(all).toMatch(/engineer/); // who you are
    expect(all).toMatch(/waterfall/); // how you came
    expect(all).toMatch(/valley/); // where you are
  });

  it('is shown once, when play first begins in a new valley, and not again after a reload', async () => {
    const a = await openPage();
    expect(a.hud.introCards).toEqual([]);
    a.in.ready = true;
    a.in.resume();
    expect(a.hud.introCards).toEqual(OPENING);
    expect(a.in.playing).toBe(true); // the stand-in reads it at once; in the page "Skip" or "Begin" does
    expect(a.game.flags.has(BEGUN)).toBe(true);
    a.in.pause();
    await a.in.save(false);
    const b = await openPage(a.store, a.pending);
    b.in.ready = true;
    b.in.resume();
    expect(b.hud.introCards).toEqual([]);
    expect(b.in.playing).toBe(true);
  });

  it('a valley from before the opening existed is not shown it', async () => {
    const store = browserStore();
    await store.set(SAVE_KEY, await encodeSave({ ...newSave(), flags: [BEGUN, 'm1_done'] }));
    const p = await openPage(store, memoryPending());
    p.in.ready = true;
    p.in.resume();
    expect(p.hud.introCards).toEqual([]);
  });
});

describe('the first goals, one at a time', () => {
  it('are eat, drink, the journal, the armory, sleep, the way out, in that order', () => {
    expect(FIRST_GOALS.map((g) => g.flag)).toEqual(['ate', 'drank', 'journal_read', 'armory_found', 'slept', 'left_valley']);
    for (const g of FIRST_GOALS) expect(g.label.length).toBeLessThan(140);
    const f = new Set<string>();
    for (const g of FIRST_GOALS) {
      expect(nextGoal(f)).toBe(g.label);
      f.add(g.flag);
    }
    // After them, the next step of the milestone in hand, one at a time.
    expect(nextGoal(f)).toBe(`M1 · ${M1_STEPS[0].label}`);
    f.add(M1_STEPS[0].flag);
    expect(nextGoal(f)).toBe(`M1 · ${M1_STEPS[1].label}`);
    for (const s of M1_STEPS) f.add(s.flag);
    f.add('m1_done');
    expect(nextGoal(f)).toBe(`M2 · ${M2_STEPS[0].label}`);
    // Done out of order, a goal is simply passed over.
    expect(nextGoal(new Set(['ate', 'drank', 'slept']))).toBe(FIRST_GOALS[2].label);
    // A valley past M1 is past the first goals, ticked or not.
    expect(nextGoal(new Set(['m1_done']))).toBe(`M2 · ${M2_STEPS[0].label}`);
    for (const m of ['m1_done', 'm2_done', 'm3_done']) f.add(m);
    expect(nextGoal(f)).toBe(`M4 · ${M4_STEPS[0].label}`);
    f.add('m4_done');
    // Phase 8: M5's steps follow (docs/PHASE8.md); with every milestone done there is nothing left to point at.
    expect(nextGoal(f)).toMatch(/^M5 · /);
    f.add('m5_done');
    expect(nextGoal(f)).toBeNull();
  });

  it('you arrive hungry and thirsty with a tin and a jug in hand’s reach, and eating and drinking move the goal on', async () => {
    const p = await openPage();
    const g = p.game;
    expect(g.vitals).toEqual(ARRIVAL);
    expect(ARRIVAL.hunger).toBeLessThan(60);
    expect(ARRIVAL.thirst).toBeLessThan(60);
    const kit = Inventory.starter();
    expect(kit.slots.slice(0, 9).some((s) => s && s.id === itemId('canned_food'))).toBe(true); // on the hotbar, not in the pack
    expect(kit.slots.slice(0, 9).some((s) => s && s.id === itemId('water_jug'))).toBe(true);
    p.in.ready = true;
    p.in.resume();
    expect(p.hud.goal).toBe(FIRST_GOALS[0].label);
    hold(p, 'canned_food');
    expect(hands(p).useHeldItem()).toBe(true);
    expect(g.vitals.hunger).toBeGreaterThan(ARRIVAL.hunger);
    expect(p.hud.goal).toBe(FIRST_GOALS[1].label);
    hold(p, 'water_jug');
    expect(hands(p).useHeldItem()).toBe(true);
    expect(g.vitals.thirst).toBeGreaterThan(ARRIVAL.thirst);
    expect(p.hud.goal).toBe(FIRST_GOALS[2].label);
    hands(p).openJournal();
    hands(p).tickPlaces();
    expect(p.hud.goal).toBe(FIRST_GOALS[3].label);
    expect(g.snapshot().flags).toEqual(expect.arrayContaining(['ate', 'drank', 'journal_read']));
  });

  it('later, the first time you run low, a line says how to eat and how to drink', async () => {
    const p = await openPage();
    for (const f of ['ate', 'drank']) p.game.flags.add(f);
    p.game.vitals.hunger = 30;
    hands(p).tickPlaces();
    expect(p.hud.toasts).toContain(HINTS.hungry);
    p.game.vitals.thirst = 30;
    hands(p).tickPlaces();
    expect(p.hud.toasts).toContain(HINTS.thirsty);
    const n = p.hud.toasts.length;
    hands(p).tickPlaces();
    expect(p.hud.toasts.length).toBe(n); // once
  });

  it('every food says "right-click to eat" (or drink) with its name when it comes to hand', async () => {
    const { useHint } = await vi.importActual<typeof import('../src/ui/hud.ts')>('../src/ui/hud.ts');
    expect(useHint(itemId('canned_food'))).toBe(' · right-click to eat');
    expect(useHint(itemId('water_jug'))).toBe(' · right-click to drink');
    expect(useHint(itemId('steel_pickaxe'))).toBe('');
    expect(foodOf(itemId('canned_food'))).toBeDefined();
  });
});

describe('small things that were hard to find', () => {
  it('once Marco trusts you he keeps the shelter every day: no call needed', async () => {
    const p = await openPage();
    const g = p.game;
    const { MARCO_SPOT } = await import('../src/gen/zone1.ts');
    const { load } = await import('./load.ts');
    // The land at the shelter (the harness loads none by itself).
    const w = load(MARCO_SPOT[0] - 2, MARCO_SPOT[2] - 2, MARCO_SPOT[0] + 2, MARCO_SPOT[2] + 2);
    g.world.columns = w.columns;
    g.player.flying = true;
    g.player.setPosition(MARCO_SPOT[0] + 30, MARCO_SPOT[1] + 2, MARCO_SPOT[2]);
    g.hour = 10;
    hands(p).tickPlaces();
    expect(g.wild.creatures.some((c) => c.kind === 'marco')).toBe(false); // a stranger still: he comes when called
    g.flags.add('marco_trust1');
    hands(p).tickPlaces();
    expect(g.wild.creatures.some((c) => c.kind === 'marco')).toBe(true);
    g.hour = 20;
    hands(p).tickPlaces();
    expect(g.wild.creatures.some((c) => c.kind === 'marco')).toBe(false); // by day only
  });

  it('a wrong code on the safe says where the code is written', () => {
    expect(HINTS.safeWrong).toMatch(/journal/);
    expect(HINTS.noSky).toMatch(/open sky/);
    for (const k of ['smoker', 'jerky_rack', 'hutch']) expect(HINTS[k]).toMatch(/right-click/);
  });
});
