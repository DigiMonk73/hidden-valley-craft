// What the script promises and was not there (docs/PHASE9B.md, 6), on the real `Game`: the handbooks on the
// bookshelf, the water filter, the binoculars; and a version 13 valley brought up to this build's save.

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

import { openPage, memoryPending, loadLand, play, fire, settle, browserStore, type Page } from './game/harness.ts';
import { newSave, normaliseSave, BEGUN, BOOKS_READ } from '../src/save/state.ts';
import { encodeSave, parseSave, type SaveData } from '../src/save/save.ts';
import { SAVE_KEY } from '../src/save/keeper.ts';
import { recipesAt } from '../src/sim/crafting.ts';
import { blockId, WATER } from '../src/world/blocks.ts';
import { itemId } from '../src/world/items.ts';
import { HOME_FIT } from '../src/gen/home.ts';
import { BINOCULAR_ZOOM, BAD_WATER_HP } from '../src/game.ts';
import { HOME_HOLD } from '../src/sim/home.ts';
import v13 from './fixtures/v13/saves.json' with { type: 'json' };

vi.setConfig({ testTimeout: 180_000 });

const valley = (extra: Partial<SaveData> = {}): SaveData => ({ ...newSave(), flags: [BEGUN], ...extra });
const key = (code: string) => fire('window', 'keydown', { code });
const inner = (p: Page) => p.game as unknown as {
  target: unknown; placeBlock(): void; useHeldItem(): boolean; aim(): boolean; endGlass(): void; glassing: boolean; frame(t: number): void; keys: Set<string>; lastHurt: number;
  renderer: { zoom?: number; setZoom(z: number): void }; look: { onDelta(dx: number, dy: number): void };
};
async function onLand(extra: Partial<SaveData> = {}): Promise<Page> {
  const store = browserStore();
  await store.set(SAVE_KEY, await encodeSave(valley(extra)));
  const p = await openPage(store, memoryPending());
  await loadLand(p);
  p.in.resume();
  play(p, 2);
  return p;
}

describe('the builder’s handbooks, on the bookshelf', () => {
  it('a new valley does not know the workshop; a right-click on the bookshelves teaches it, says so once the journal is put down, and it is kept', async () => {
    const p = await onLand();
    const g = p.game;
    expect(g.flags.has(BOOKS_READ)).toBe(false);
    expect(recipesAt('smelter', g.flags)).toEqual([]);
    const [x, y, z] = HOME_FIT.bookshelf;
    inner(p).target = { x, y, z, id: g.world.blockAt(x, y, z), nx: -1, ny: 0, nz: 0 };
    expect(g.world.blockAt(x, y, z)).toBe(blockId('bookshelf'));
    inner(p).placeBlock();
    expect(p.in.paper.isOpen).toBe(true); // the journal is open
    expect(g.flags.has(BOOKS_READ)).toBe(true);
    expect(g.flags.has('journal_read')).toBe(true);
    expect(recipesAt('smelter', g.flags).length).toBeGreaterThan(0);
    expect(p.hud.toasts.join(' ')).not.toMatch(/handbooks/); // not said behind the open page
    key('Escape');
    expect(p.in.paper.isOpen).toBe(false);
    expect(p.hud.toasts.filter((t) => /builder’s handbooks: smelting, smithing, the kiln, tanning/.test(t)).length).toBe(1);
    // Read again: nothing more is said.
    inner(p).placeBlock();
    key('Escape');
    expect(p.hud.toasts.filter((t) => /handbooks/.test(t)).length).toBe(1);
    // Saved and opened again, it is still known.
    await p.in.save(false);
    await settle(p);
    const q = await openPage(p.store, p.pending);
    expect(q.game.flags.has(BOOKS_READ)).toBe(true);
  });

  it('a valley saved by version 13 already knows the workshop, and is saved from here on as version 5', async () => {
    const bytes = new Uint8Array(Buffer.from((v13 as unknown as { home: string }).home, 'base64'));
    const raw = await parseSave(bytes, (r) => r as SaveData);
    if (!raw.ok) throw new Error('the fixture did not parse');
    expect(raw.data.version).toBe(4);
    expect(raw.data.flags).not.toContain(BOOKS_READ);
    const store = browserStore();
    await store.set(SAVE_KEY, bytes);
    const p = await openPage(store, memoryPending());
    expect(p.game.flags.has(BOOKS_READ)).toBe(true);
    for (const st of ['kiln', 'smelter', 'anvil', 'tannery'] as const) expect(recipesAt(st, p.game.flags).length, st).toBeGreaterThan(0);
    p.in.edited();
    await p.in.save(false);
    await settle(p);
    const now = await parseSave(await store.get(SAVE_KEY), (r) => r as SaveData);
    expect(now.ok && now.data.version).toBe(5);
    expect(now.ok && now.data.flags).toContain(BOOKS_READ);
    expect(normaliseSave(now.ok ? now.data : null)!.flags).toContain(BOOKS_READ);
  });
});

/** Stands the player at the edge of a small pool made at their feet, looking down into it, at (x, z). */
function atWater(p: Page, x: number, z: number): void {
  const g = p.game, w = g.world;
  let y = 150;
  while (y > 1 && w.blockAt(x, y - 1, z) === 0) y--;
  // (Level ground to stand on, a pool one block east, and nothing over either.)
  w.setBlock(x, y - 1, z, blockId('limestone'));
  w.setBlock(x + 1, y - 2, z, blockId('limestone'));
  w.setBlock(x + 1, y - 1, z, WATER);
  for (let dy = 0; dy < 3; dy++) { w.setBlock(x, y + dy, z, 0); w.setBlock(x + 1, y + dy, z, 0); }
  g.player.setPosition(x + 0.5, y, z + 0.5);
  g.player.yaw = -Math.PI / 2; // east
  g.player.pitch = -1.1;
  g.hpBefore = g.vitals.hp;
  inner(p).frame(performance.now() + 1e7); // the game finds what is looked at
}

/** Carries the player through the air to (x, z), well outside the valley, and waits for the land there to come in. */
async function carryTo(p: Page, x: number, z: number): Promise<void> {
  const g = p.game;
  g.player.flying = true;
  g.player.setPosition(x, 150, z);
  let t = performance.now() + 5e6;
  for (let i = 0; i < 4000 && !(g.world.isLoaded(x, z) && g.streamer.settledAround(x, z, 1)); i++) {
    inner(p).frame((t += 16));
    await new Promise((r) => setImmediate(r));
  }
  if (!g.world.isLoaded(x, z)) throw new Error('the land outside never came in');
  g.player.flying = false;
}

describe('the water filter does something', () => {
  it('in the valley water is clean with or without it: a drink costs nothing, a jug fills', async () => {
    const p = await onLand();
    const g = p.game;
    g.hotbar.slots.fill(null);
    g.hotbar.select(0);
    g.vitals.thirst = 40; g.vitals.hp = 80;
    atWater(p, Math.floor(g.player.x), Math.floor(g.player.z));
    expect(inner(p).useHeldItem()).toBe(true);
    expect(g.vitals.thirst).toBeCloseTo(65, 0);
    expect(g.vitals.hp).toBeGreaterThanOrEqual(80);
    expect(p.hud.toasts.at(-1)).toBe('Cold, clear water');
    g.hotbar.slots[0] = { id: itemId('empty_jug'), count: 1 };
    expect(inner(p).useHeldItem()).toBe(true);
    expect(g.hotbar.count(itemId('water_jug'))).toBe(1);
  });

  it('outside it, without the filter: a drink quenches and costs health, is said, and is not "danger" for hold H; a jug is not filled', async () => {
    const p = await onLand();
    const g = p.game;
    await carryTo(p, 1300.5, 1024.5);
    g.hotbar.slots.fill(null);
    g.hotbar.select(0);
    g.vitals.thirst = 40; g.vitals.hp = 80; g.hpBefore = 80;
    atWater(p, 1300, 1024);
    expect(inner(p).useHeldItem()).toBe(true);
    expect(g.vitals.thirst).toBeCloseTo(65, 0);
    expect(g.vitals.hp).toBeCloseTo(80 - BAD_WATER_HP, 1);
    expect(p.hud.toasts.at(-1)).toMatch(/not clean.*water filter/);
    // The next sip costs the same and does not say it all again.
    g.vitals.thirst = 40;
    const said = p.hud.toasts.length;
    inner(p).useHeldItem();
    expect(g.vitals.hp).toBeCloseTo(80 - 2 * BAD_WATER_HP, 1);
    expect(p.hud.toasts.length).toBe(said);
    // It never kills outright.
    g.vitals.hp = 3; g.vitals.thirst = 40;
    inner(p).useHeldItem();
    expect(g.vitals.hp).toBe(1);
    // A bad stomach is not a blow: hold H still works.
    g.vitals.hp = 50; g.hpBefore = 50; g.vitals.thirst = 40;
    inner(p).useHeldItem();
    p.in.tick(1 / 60);
    inner(p).lastHurt = -Infinity;
    key('KeyH');
    expect(p.hud.toasts.join(' ')).not.toMatch(/Not with danger this close/);
    for (let i = 0; i < (HOME_HOLD + 0.2) * 60; i++) { inner(p).keys.add('KeyH'); p.in.tick(1 / 60); }
    expect(p.hud.toasts.join(' | ')).toMatch(/Home\./);
  });

  it('outside it, with the filter in the pack: clean, at no cost, and jugs fill', async () => {
    const p = await onLand();
    const g = p.game;
    await carryTo(p, 1300.5, 1024.5);
    g.hotbar.slots.fill(null);
    g.hotbar.slots[20] = { id: itemId('water_filter'), count: 1 };
    g.hotbar.select(0);
    g.vitals.thirst = 40; g.vitals.hp = 80;
    atWater(p, 1300, 1024);
    expect(inner(p).useHeldItem()).toBe(true);
    expect(g.vitals.hp).toBeGreaterThanOrEqual(80);
    expect(p.hud.toasts.at(-1)).toMatch(/through the filter/);
    g.hotbar.slots[0] = { id: itemId('empty_jug'), count: 2 };
    expect(inner(p).useHeldItem()).toBe(true);
    expect(g.hotbar.count(itemId('water_jug'))).toBe(1);
    // Without it the jug stays empty, and the reason is said.
    g.hotbar.slots[20] = null;
    inner(p).useHeldItem();
    expect(g.hotbar.count(itemId('water_jug'))).toBe(1);
    expect(p.hud.toasts.at(-1)).toMatch(/Not to carry home/);
  });
});

describe('the binoculars do something', () => {
  it('held to the eyes with the right button they bring things four times nearer, the hand as much finer; let go, put away or paused, they come down', async () => {
    const p = await onLand();
    const g = p.game;
    const zooms: number[] = [];
    inner(p).renderer.setZoom = (z: number) => { zooms.push(z); };
    g.hotbar.slots.fill(null);
    g.hotbar.slots[0] = { id: itemId('binoculars'), count: 1 };
    g.hotbar.select(0);
    inner(p).target = null;
    expect(inner(p).aim()).toBe(true);
    expect(inner(p).glassing).toBe(true);
    expect(zooms.at(-1)).toBe(BINOCULAR_ZOOM);
    const yaw = g.player.yaw;
    inner(p).look.onDelta(0.4, 0);
    expect(yaw - g.player.yaw).toBeCloseTo(0.4 / BINOCULAR_ZOOM, 9);
    // The button let go.
    fire('window', 'mouseup', { button: 2 });
    expect(inner(p).glassing).toBe(false);
    expect(zooms.at(-1)).toBe(1);
    inner(p).look.onDelta(0.4, 0);
    expect(yaw - 0.1 - g.player.yaw).toBeCloseTo(0.4, 9);
    // Up again, then another thing chosen: they come down by themselves.
    inner(p).aim();
    g.hotbar.select(1);
    inner(p).frame(performance.now() + 2e7);
    expect(inner(p).glassing).toBe(false);
    expect(zooms.at(-1)).toBe(1);
    // And when the game is paused.
    g.hotbar.select(0);
    inner(p).aim();
    key('Escape');
    inner(p).frame(performance.now() + 3e7);
    expect(inner(p).glassing).toBe(false);
  });

  it('a ripe bunch on a banana plant is picked with a right-click: bananas, a word the first time, and a green bunch that says it is green', async () => {
    // Standing by the valley's banana plants, south-west of the home (Track A's plants, the real generated land).
    const p = await onLand({ player: { x: 1719.5, y: 70, z: 977.5, yaw: 0, pitch: 0, flying: false } });
    const g = p.game;
    const RIPE = blockId('banana_bunch');
    let at: [number, number, number] | null = null;
    for (let y = 66; y < 90 && !at; y++) for (let z = 960; z < 1000 && !at; z++) for (let x = 1700; x < 1740 && !at; x++) if (g.world.blockAt(x, y, z) === RIPE) at = [x, y, z];
    expect(at, 'a ripe bunch near the player').not.toBeNull();
    const [x, y, z] = at!;
    g.hotbar.slots.fill(null);
    inner(p).target = { x, y, z, id: RIPE, nx: 0, ny: 0, nz: 1 };
    inner(p).placeBlock();
    expect(g.hotbar.count(itemId('banana'))).toBe(4);
    expect(g.world.blockAt(x, y, z)).toBe(blockId('banana_bunch_green'));
    expect(p.hud.toasts.join(' ')).toMatch(/Bananas\. A green bunch hangs in its place/);
    inner(p).target = { x, y, z, id: blockId('banana_bunch_green'), nx: 0, ny: 0, nz: 1 };
    inner(p).placeBlock();
    expect(p.hud.toasts.at(-1)).toMatch(/Still green/);
    expect(g.hotbar.count(itemId('banana'))).toBe(4);
    // And the save keeps the picked plant as it is.
    expect([...g.world.edits.values()].some((m) => [...m.values()].includes(blockId('banana_bunch_green')))).toBe(true);
  });

  it('the headlamp lights the land round you while it is in the pack, anywhere in it, and not once it is gone', async () => {
    const p = await onLand();
    const g = p.game;
    const lit: boolean[] = [];
    (g.renderer as unknown as { setHeadlamp(on: boolean): void }).setHeadlamp = (on) => { lit.push(on); };
    const frame = (k: number) => { inner(p).frame(performance.now() + 5e7 + k * 1e6); return lit.at(-1); };
    g.hotbar.slots.fill(null);
    expect(frame(1)).toBe(false);
    g.hotbar.slots[30] = { id: itemId('headlamp'), count: 1 }; // deep in the pack, not in hand
    g.hotbar.select(0);
    expect(frame(2)).toBe(true);
    g.hotbar.slots[30] = null;
    expect(frame(3)).toBe(false);
  });

  it('a right-click with the hammer, the saw, the filter or the headlamp in hand says what it is for', async () => {
    const p = await onLand();
    const g = p.game;
    inner(p).target = null;
    for (const [name, says] of [['hammer', /twice as fast/], ['handsaw', /six planks/], ['water_filter', /safe to drink/], ['headlamp', /lights the ground/]] as const) {
      g.hotbar.slots.fill(null);
      g.hotbar.slots[0] = { id: itemId(name), count: 1 };
      g.hotbar.select(0);
      g.player.pitch = 1.2; // looking at the sky: nothing in reach
      inner(p).frame(performance.now() + 4e7);
      expect(inner(p).useHeldItem(), name).toBe(true);
      expect(p.hud.toasts.at(-1), name).toMatch(says);
    }
  });
});
