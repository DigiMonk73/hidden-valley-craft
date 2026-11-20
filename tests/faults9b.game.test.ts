// The faults found and left by earlier phases, mended in Phase 9B (docs/PHASE9B.md, 3): on the real `Game`.
// And the rule this phase works under: a valley saved by version 13 opens here and keeps everything.

import { describe, it, expect, vi, afterEach } from 'vitest';

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
import { tab } from './game/stubs.ts';
import { newSave, normaliseSave, BEGUN } from '../src/save/state.ts';
import { encodeSave, parseSave, SAVE_FORMAT, SAVE_VERSION, WORLD_LAYOUT, type SaveData } from '../src/save/save.ts';
import { SAVE_KEY, NOTES } from '../src/save/keeper.ts';
import { MemoryStore } from '../src/platform/storage.ts';
import { blockId, B_SOLID, AIR } from '../src/world/blocks.ts';
import { itemId } from '../src/world/items.ts';
import { SACK } from '../src/sim/drop.ts';
import { HOME_DANGER, HOME_HOLD } from '../src/sim/home.ts';
import { RIM_MENDS, VALLEY, inSanctuary } from '../src/gen/layout.ts';
import v13 from './fixtures/v13/saves.json' with { type: 'json' };

vi.setConfig({ testTimeout: 180_000 });
afterEach(() => { tab.answer = 'held'; tab.freed = []; });

const valley = (wallet: number, extra: Partial<SaveData> = {}): SaveData => ({ ...newSave(), wallet, flags: [BEGUN], ...extra });
const key = (code: string, extra: Record<string, unknown> = {}) => fire('window', 'keydown', { code, ...extra });
/** A page with play begun in a valley already begun (so no opening), the player hanging in the air. */
async function begun(extra: Partial<SaveData> = {}): Promise<Page> {
  const store = browserStore();
  await store.set(SAVE_KEY, await encodeSave(valley(5000, extra)));
  const p = await openPage(store, memoryPending());
  p.in.ready = true;
  p.in.resume();
  return p;
}
/** The same with the land round the home loaded: the player stands on the balcony. */
async function begunOnLand(): Promise<Page> {
  const store = browserStore();
  await store.set(SAVE_KEY, await encodeSave(valley(5000)));
  const p = await openPage(store, memoryPending());
  await loadLand(p);
  p.in.resume();
  play(p, 2);
  return p;
}
const inner = (p: Page) => p.game as unknown as { time: number; playing: boolean; keys: Set<string>; home: { held: number | null }; lastHurt: number; playTime: number; player: { x: number; y: number; z: number; flying: boolean; headInWater: boolean; breath: number; setPosition(x: number, y: number, z: number): void }; lastWriteFailed: boolean; notice: string | null; updateSaveStatus(): void; openSack: unknown; closeScreen(): void; placeBlock(): void; target: unknown };
/** Fixed steps of the game with H held, as the loop runs them. */
const holdH = (p: Page, seconds: number): void => { for (let i = 0; i < Math.ceil(seconds * 60); i++) { inner(p).keys.add('KeyH'); p.in.tick(1 / 60); } };

describe('Esc on the pause menu goes back to the game', () => {
  it('Esc pauses; a second Esc, a moment later, resumes', async () => {
    const p = await begun();
    expect(p.in.playing).toBe(true);
    key('Escape');
    expect(p.in.playing).toBe(false);
    expect(p.hud.menuShown).toBe(true);
    p.in.time += 1; // a second on the menu
    key('Escape');
    expect(p.in.playing).toBe(true);
    expect(p.hud.menuShown).toBe(false);
  });

  it('the Esc that paused cannot also resume: not in the same moment, and not as a held key’s repeats', async () => {
    const p = await begun();
    key('Escape');
    key('Escape'); // the browser hands the page the same press twice (once as the lost mouse, once as the key)
    expect(p.in.playing).toBe(false);
    p.in.time += 1;
    key('Escape', { repeat: true });
    expect(p.in.playing).toBe(false);
  });

  it('Esc does not begin a valley that has not been begun (that is Play’s, with the opening), nor start one still loading', async () => {
    const fresh = await openPage(browserStore(), memoryPending());
    fresh.in.ready = true;
    fresh.in.time += 5;
    key('Escape');
    expect(fresh.in.playing).toBe(false);
    const loading = await begun();
    key('Escape');
    loading.in.ready = false;
    loading.in.time += 5;
    key('Escape');
    expect(loading.in.playing).toBe(false);
  });

  it('with a screen open Esc still only closes the screen', async () => {
    const p = await begun();
    key('KeyE');
    expect(p.in.screen.isOpen).toBe(true);
    key('Escape');
    expect(p.in.screen.isOpen).toBe(false);
    expect(p.in.playing).toBe(true);
  });
});

describe('hold H works while starving, parched or out of air; a blow still stops it', () => {
  /** Standing in the open air high above the land (nothing is loaded): flying keeps the body still but spares it nothing we test here. */
  async function hungry(set: (p: Page) => void): Promise<Page> {
    const p = await begun();
    set(p);
    p.in.tick(1 / 60);
    return p;
  }

  it('starving: health is going down every tick, and H still takes you home', async () => {
    const p = await hungry((p) => { p.game.vitals.hunger = 0; p.game.vitals.hp = 50; p.game.hpBefore = 50; });
    for (let i = 0; i < 120; i++) p.in.tick(1 / 60);
    const hp = p.game.vitals.hp;
    expect(hp).toBeLessThan(50); // it really is wearing away
    expect(inner(p).playTime - inner(p).lastHurt).toBeGreaterThan(HOME_DANGER); // and that is not "hurt"
    key('KeyH');
    expect(p.hud.toasts.join(' ')).not.toMatch(/danger this close/);
    expect(inner(p).home.held).not.toBeNull();
    holdH(p, HOME_HOLD + 0.2);
    expect(p.hud.toasts.join(' | ')).toMatch(/Home\./);
  });

  it('out of air under water: the same', async () => {
    const p = await begun();
    const pl = inner(p).player;
    // Under water with no breath left: the body's own loss, six health a second.
    Object.defineProperty(pl, 'headInWater', { get: () => true, set: () => {}, configurable: true });
    pl.breath = 0;
    Object.defineProperty(pl, 'breath', { get: () => 0, set: () => {}, configurable: true });
    for (let i = 0; i < 30; i++) p.in.tick(1 / 60);
    expect(p.game.vitals.hp).toBeLessThan(100);
    key('KeyH');
    expect(p.hud.toasts.join(' ')).not.toMatch(/danger this close/);
    holdH(p, HOME_HOLD + 0.2);
    expect(p.hud.toasts.join(' | ')).toMatch(/Home\./);
  });

  it('a blow is still danger: H is refused for ten seconds after it, and a blow while holding cancels', async () => {
    const p = await begun();
    for (let i = 0; i < 30; i++) p.in.tick(1 / 60);
    p.game.vitals.hp -= 20; // a bite
    p.in.tick(1 / 60);
    key('KeyH');
    expect(p.hud.toasts.join(' ')).toMatch(/Not with danger this close/);
    expect(inner(p).home.held).toBeNull();
    // Later, heading home, a second blow stops it.
    for (let i = 0; i < (HOME_DANGER + 1) * 60; i++) p.in.tick(1 / 60);
    key('KeyH');
    holdH(p, 0.5);
    expect(inner(p).home.held).not.toBeNull();
    p.game.vitals.hp -= 20;
    holdH(p, 0.1);
    expect(inner(p).home.held).toBeNull();
    expect(p.hud.toasts.join(' ')).toMatch(/Hurt: you stop/);
  });

  it('a blow while starving is still a blow (the body’s own loss does not hide it)', async () => {
    const p = await hungry((p) => { p.game.vitals.hunger = 0; p.game.vitals.hp = 80; p.game.hpBefore = 80; });
    for (let i = 0; i < 60; i++) p.in.tick(1 / 60);
    p.game.vitals.hp -= 15;
    p.in.tick(1 / 60);
    key('KeyH');
    expect(p.hud.toasts.join(' ')).toMatch(/Not with danger this close/);
  });
});

describe('the menu’s line about the save never hides what the player must act on', () => {
  it('"made by an earlier build" and "can’t keep saves" are both said, where the page keeps nothing', async () => {
    const old = valley(777); delete old.layout;
    const mem = new MemoryStore(); // kind 'memory': a page that may not keep saves
    await mem.set(SAVE_KEY, await encodeSave(old));
    const p = await openPage(mem, memoryPending());
    expect(p.hud.status).toContain(NOTES.earlier);
    expect(p.hud.status).toMatch(/isn’t allowed to keep saves/);
    expect(p.hud.statusWarn).toBe(true);
  });

  it('"made by an earlier build" and "the last save did not go through" are both said', async () => {
    const old = valley(777); delete old.layout;
    const store = browserStore();
    await store.set(SAVE_KEY, await encodeSave(old));
    const p = await openPage(store, memoryPending());
    expect(p.hud.status).toBe(NOTES.earlier);
    inner(p).lastWriteFailed = true;
    inner(p).updateSaveStatus();
    expect(p.hud.status).toContain(NOTES.earlier);
    expect(p.hud.status).toMatch(/last save did not go through/);
  });

  it('with nothing to say about how the valley was opened, each warning stands alone as before', async () => {
    const p = await openPage(new MemoryStore(), memoryPending());
    expect(p.hud.status).toMatch(/^This page isn’t allowed to keep saves/);
    const q = await openPage(browserStore(), memoryPending());
    expect(q.hud.statusWarn).toBe(false);
  });
});

describe('a hand-over from a page from before valleys had names', () => {
  // Version 11's page saved version 1 (no id). Read here, its save gets a name made from its own contents, so the
  // copy it hands on never has the name of the copy it stored a minute before: the hand-over was dropped, and the
  // play since the last autosave with it.
  const v1 = (wallet: number, savedAt: string, x = 1700): Record<string, unknown> => {
    const d = { ...valley(wallet, { savedAt }), version: 1 } as Record<string, unknown>;
    delete d.id; delete d.seq; delete d.mode; delete d.day; delete d.lastPull; delete d.running;
    (d.player as { x: number }).x = x;
    return d;
  };

  it('is used when it was saved no earlier than the store’s copy of the same unnamed valley', async () => {
    const store = browserStore();
    await store.set(SAVE_KEY, new TextEncoder().encode(JSON.stringify(v1(100, '2026-11-20T10:00:00.000Z'))));
    expect(normaliseSave(v1(100, '2026-11-20T10:00:00.000Z'))!.id).not.toBe(normaliseSave(v1(250, '2026-11-20T10:03:00.000Z', 1710))!.id); // the names differ
    const p = await openPage(store, memoryPending(), { handover: v1(250, '2026-11-20T10:03:00.000Z', 1710) });
    expect(p.game.wallet).toBe(250);
    expect(p.game.player.x).toBe(1710);
  });

  it('is not used when the store’s copy is the later one (a stale page), nor over a valley that has a name', async () => {
    const store = browserStore();
    await store.set(SAVE_KEY, new TextEncoder().encode(JSON.stringify(v1(100, '2026-11-20T10:00:00.000Z'))));
    const stale = await openPage(store, memoryPending(), { handover: v1(250, '2026-11-20T09:00:00.000Z') });
    expect(stale.game.wallet).toBe(100);
    const named = browserStore();
    await named.set(SAVE_KEY, await encodeSave(valley(100, { id: 'v-real', seq: 4 })));
    const q = await openPage(named, memoryPending(), { handover: v1(250, '2030-01-01T00:00:00.000Z') });
    expect(q.game.wallet).toBe(100);
  });

  it('a hand-over between pages of this build still goes by name and number', async () => {
    const store = browserStore();
    await store.set(SAVE_KEY, await encodeSave(valley(100, { id: 'v-real', seq: 4 })));
    const p = await openPage(store, memoryPending(), { handover: valley(300, { id: 'v-real', seq: 5 }) });
    expect(p.game.wallet).toBe(300);
    const q = await openPage(store, memoryPending(), { handover: valley(999, { id: 'v-other', seq: 50 }) });
    expect(q.game.wallet).toBe(100);
  });
});

describe('setting things down from the pack', () => {
  it('what is let go outside the window goes into a sack at the feet; emptied through its screen, the sack is taken away', async () => {
    const p = await begunOnLand();
    const g = p.game;
    key('KeyE');
    const stack = { id: itemId('cordage'), count: 4 };
    expect(p.in.screen.onDrop(stack), p.hud.toasts.slice(-2).join(' | ')).toBe(true);
    expect(p.hud.toasts.join(' ')).toMatch(/Set down in a sack at your feet/);
    const sacks: [number, number, number][] = [];
    const px = Math.floor(g.player.x), py = Math.floor(g.player.y), pz = Math.floor(g.player.z);
    for (let dy = -3; dy <= 3; dy++) for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) if (g.world.blockAt(px + dx, py + dy, pz + dz) === SACK) sacks.push([px + dx, py + dy, pz + dz]);
    expect(sacks.length).toBe(1);
    expect(g.world.containerAt(...sacks[0])!.filter(Boolean)).toEqual([stack]);
    expect(p.in.unsaved).toBe(true); // it is part of the valley now
    // Opened by right-click like any chest (here: as the game does it), emptied, closed.
    key('Escape');
    const [x, y, z] = sacks[0];
    inner(p).target = { x, y, z, id: SACK, nx: 0, ny: 1, nz: 0 };
    inner(p).placeBlock();
    expect(p.in.screen.isOpen).toBe(true);
    expect(inner(p).openSack).toEqual([x, y, z]);
    g.world.containerAt(x, y, z)!.fill(null);
    key('Escape');
    expect(g.world.blockAt(x, y, z)).toBe(AIR);
    expect(g.world.containers.size).toBe(0);
  });

  it('a sack with something left in it stays; a click outside the window with nothing held closes the screen', async () => {
    const p = await begunOnLand();
    const g = p.game;
    key('KeyE');
    p.in.screen.onDrop({ id: itemId('cordage'), count: 4 });
    p.in.screen.onOutside();
    expect(p.in.screen.isOpen).toBe(false);
    let at: [number, number, number] | null = null;
    const px = Math.floor(g.player.x), py = Math.floor(g.player.y), pz = Math.floor(g.player.z);
    for (let dy = -3; dy <= 3; dy++) for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) if (g.world.blockAt(px + dx, py + dy, pz + dz) === SACK) at = [px + dx, py + dy, pz + dz];
    inner(p).target = { x: at![0], y: at![1], z: at![2], id: SACK, nx: 0, ny: 1, nz: 0 };
    inner(p).placeBlock();
    key('Escape');
    expect(g.world.blockAt(...at!)).toBe(SACK);
  });
});

// ---- A valley saved by version 13 -------------------------------------------------------------------------

const bytesOf = (b64: string): Uint8Array => new Uint8Array(Buffer.from(b64, 'base64'));
const saves = v13 as unknown as Record<'home' | 'ledgeA' | 'ledgeB' | 'madeBy', string>;

describe('a valley saved by version 13 opens in this build and keeps everything', () => {
  it('the fixture really is version 13’s: save version 4, world layout 2, written by its own code', async () => {
    expect([SAVE_VERSION, WORLD_LAYOUT]).toEqual([4, 2]); // neither number was raised by this phase
    for (const name of ['home', 'ledgeA', 'ledgeB'] as const) {
      const r = await parseSave(bytesOf(saves[name]), (raw) => raw as SaveData);
      expect(r.ok).toBe(true);
      if (r.ok) expect([r.data.format, r.data.version, r.data.layout]).toEqual([SAVE_FORMAT, 4, 2]);
    }
  });

  it('everything it held is there: where you stood, what you carry, money, flags, the dose, the day, your blocks and your chests', async () => {
    const store = browserStore();
    await store.set(SAVE_KEY, bytesOf(saves.home));
    const was = await parseSave(bytesOf(saves.home), normaliseSave);
    if (!was.ok) throw new Error('the fixture did not parse');
    const p = await openPage(store, memoryPending());
    const g = p.game;
    expect(p.hud.statusWarn).toBe(false); // nothing is said about the save: it simply opened
    expect(p.hud.status).not.toMatch(/earlier build|fresh/);
    expect(g.wallet).toBe(123_456_789);
    expect(g.dose).toBe(12.5);
    expect(g.day).toBe(9);
    expect(g.hour).toBeCloseTo(was.data.hour, 6);
    expect([g.vitals.hp, g.vitals.hunger, g.vitals.thirst].map(Math.round)).toEqual([was.data.vitals!.hp, was.data.vitals!.hunger, was.data.vitals!.thirst].map(Math.round));
    for (const f of ['begun', 'been_out', 'gate_both', 'reached_near', 'shelter_found', 'safe_open', 'forge_made']) expect(g.flags.has(f), f).toBe(true);
    expect(g.hotbar.count(itemId('iron_ingot'))).toBe(7);
    expect(g.hotbar.count(itemId('cordage'))).toBeGreaterThanOrEqual(2);
    expect(g.hotbar.count(blockId('limestone'))).toBe(40);
    expect(g.explored[33 * 64 + 53]).toBe(1);
    expect([g.player.x, g.player.y, g.player.z]).toEqual([was.data.player.x, was.data.player.y, was.data.player.z]);
    await loadLand(p);
    // The player's blocks stand where they put them, and what they mined is still gone.
    expect(g.world.blockAt(1790, 82, 1030)).toBe(blockId('planks'));
    expect(g.world.blockAt(1791, 82, 1030)).toBe(blockId('lantern'));
    expect(g.world.blockAt(1789, 81, 1030)).toBe(AIR);
    // And the same save, saved again by this build and opened once more, is the same valley.
    p.in.edited();
    await p.in.save(false);
    await settle(p);
    const now = await parseSave(await store.get(SAVE_KEY), normaliseSave);
    if (!now.ok) throw new Error('this build’s save did not parse');
    expect([now.data.version, now.data.layout, now.data.id]).toEqual([4, 2, was.data.id]);
    expect(now.data.seq).toBeGreaterThan(was.data.seq!);
    expect(now.data.edits.length).toBe(was.data.edits.length);
    expect(now.data.containers).toEqual(was.data.containers);
    expect(now.data.hotbar).toEqual(was.data.hotbar);
    expect([...now.data.flags!].sort()).toEqual([...was.data.flags!].sort());
  });

  it('settings saved by version 13 are kept (docs/PHASE9B.md, 2)', async () => {
    const store = browserStore();
    await store.set(SAVE_KEY, bytesOf(saves.home));
    await store.set('settings', new TextEncoder().encode(JSON.stringify({ rd: 10, sens: 1.6, inv: true, vol: 0.4 })));
    const p = await openPage(store, memoryPending());
    expect(p.game.settings).toMatchObject({ rd: 10, sens: 1.6, inv: true, vol: 0.4, scale: 1, aa: true, auto: true });
  });

  for (const [name, mend] of [['ledgeA', 0], ['ledgeB', 1]] as const) {
    it(`saved standing on ${RIM_MENDS[mend].name}’s ledge, which the mend took away: the player is not shut in rock, not left falling, and the game goes on`, async () => {
      const store = browserStore();
      await store.set(SAVE_KEY, bytesOf(saves[name]));
      const was = await parseSave(bytesOf(saves[name]), normaliseSave);
      if (!was.ok) throw new Error('the fixture did not parse');
      const m = RIM_MENDS[mend];
      const deg = (Math.atan2(was.data.player.z - VALLEY.cz, was.data.player.x - VALLEY.cx) * 180) / Math.PI;
      expect(deg >= m.from && deg <= m.to && was.data.player.y >= m.lo && was.data.player.y < m.hi, 'the fixture stands inside the mended band').toBe(true);
      const p = await openPage(store, memoryPending());
      await loadLand(p); // (it used to be possible for a buried player to keep this from ever finishing)
      p.in.resume();
      expect(p.in.playing).toBe(true);
      const g = p.game, pl = g.player, at = (x: number, y: number, z: number) => g.world.blockAt(x, y, z);
      const inRock = () => B_SOLID[at(Math.floor(pl.x), Math.floor(pl.y + 0.1), Math.floor(pl.z))] || B_SOLID[at(Math.floor(pl.x), Math.floor(pl.y + 1.5), Math.floor(pl.z))];
      expect(inRock(), `shut in rock at ${pl.x}, ${pl.y}, ${pl.z}`).toBeFalsy();
      const hp0 = g.vitals.hp;
      play(p, 12); // long enough to fall the whole cliff, if that is what happens
      expect(inRock()).toBeFalsy();
      expect(g.vitals.hp, 'the change of land must not hurt or kill').toBeGreaterThanOrEqual(hp0 - 1);
      expect(pl.y).toBeGreaterThan(60);
      expect(inSanctuary(pl.x, pl.z)).toBe(true);
      // Everything else in the save is as it was.
      expect(g.wallet).toBe(123_456_789);
      expect(g.hotbar.count(itemId('iron_ingot'))).toBe(7);
      // And from wherever that left them, hold H goes home.
      inner(p).lastHurt = -Infinity;
      key('KeyH');
      holdH(p, HOME_HOLD + 0.2);
      expect(p.hud.toasts.join(' | ')).toMatch(/Home\./);
    });
  }
});
