// N2 (docs/REVIEW.md, docs/FIXES.md): Survival and Builder's mode. One choice before a valley is begun, saved and
// shown in Settings. In Survival the keys for flying, endless blocks and the clock do nothing. In Builder's mode
// they work, but the clock keys turn the sky only: nothing is paid and no day begins. Quest blocks still give
// their parts with endless blocks on.

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

import { openPage, memoryPending, play, fire, browserStore, type Page } from './game/harness.ts';
import { newSave, normaliseSave, BEGUN } from '../src/save/state.ts';
import { encodeSave, SAVE_VERSION } from '../src/save/save.ts';
import { SAVE_KEY } from '../src/save/keeper.ts';
import { breakBlock } from '../src/sim/interact.ts';
import { Inventory } from '../src/sim/inventory.ts';
import { World } from '../src/world/world.ts';
import { blockId } from '../src/world/blocks.ts';
import { itemId } from '../src/world/items.ts';
import { chunkKey, chunkIndex, CS } from '../src/world/constants.ts';
import { load } from './load.ts';
import { ZONE1FAR } from '../src/gen/layout.ts';
import { RAIDER_FORGE } from '../src/gen/zone1far.ts';

vi.setConfig({ testTimeout: 60_000 });

const key = (p: Page, code: string) => fire('window', 'keydown', { code });
/** A page with play begun, the player hanging in the air (no land is loaded in these tests). */
async function begun(mode: 'survival' | 'builder'): Promise<Page> {
  const p = await openPage();
  p.hud.actions.pickMode(mode as never);
  p.in.ready = true;
  p.in.resume();
  return p;
}
/** Puts a block among the valley's edits, as if the player had set it there. */
function setEdit(w: World, x: number, y: number, z: number, name: string): void {
  const k = chunkKey(Math.floor(x / CS), Math.floor(y / CS), Math.floor(z / CS));
  const m = w.edits.get(k) ?? new Map<number, number>();
  m.set(chunkIndex(x % CS, y % CS, z % CS), blockId(name));
  w.edits.set(k, m);
}

describe('the choice', () => {
  it('is offered for a valley not yet begun, defaults to Survival, and is fixed once play begins', async () => {
    const p = await openPage();
    expect([p.game.mode, p.hud.mode, p.hud.canChooseMode]).toEqual(['survival', 'survival', true]);
    p.hud.actions.pickMode('builder' as never);
    expect([p.game.mode, p.hud.mode, p.game.hotbar.creative]).toEqual(['builder', 'builder', true]);
    p.hud.actions.pickMode('survival' as never);
    expect([p.game.mode, p.game.hotbar.creative]).toEqual(['survival', false]);
    p.in.ready = true;
    p.in.resume();
    expect(p.game.flags.has(BEGUN)).toBe(true);
    expect(p.hud.canChooseMode).toBe(false);
    p.hud.actions.pickMode('builder' as never); // too late: the valley is begun
    expect(p.game.mode).toBe('survival');
  });

  it('is saved with the valley, shown again after a reload, and offered again by New game', async () => {
    const a = await begun('builder');
    a.in.pause();
    await a.in.save(false);
    const b = await openPage(a.store, a.pending);
    expect([b.game.mode, b.hud.mode, b.hud.canChooseMode, b.game.hotbar.creative]).toEqual(['builder', 'builder', false, true]);
    await b.in.newGame();
    expect([b.game.mode, b.hud.canChooseMode, b.game.hotbar.creative, b.game.player.flying]).toEqual(['survival', true, false, false]);
  });

  it('a valley from before the choice existed is Survival, and already begun', async () => {
    const old: Record<string, unknown> = { ...newSave(), version: 2, flags: ['safe_open'] };
    delete old.mode; delete old.endless;
    const d = normaliseSave(old)!;
    expect([d.version, d.mode, d.endless]).toEqual([SAVE_VERSION, 'survival', false]);
    expect(d.flags).toEqual(['safe_open', BEGUN, 'books_read']); // (and, begun before the handbooks existed, it has read them: docs/PHASE9B.md, 6)
  });

  it('nobody flies or has endless blocks in Survival, whatever a save says', async () => {
    const store = browserStore();
    const d = newSave('survival');
    d.player.flying = true;
    d.endless = true;
    await store.set(SAVE_KEY, await encodeSave(d));
    const p = await openPage(store, memoryPending());
    expect([p.game.player.flying, p.game.hotbar.creative]).toEqual([false, false]);
  });
});

describe('Survival', () => {
  it('F, G and the clock keys do nothing', async () => {
    const p = await begun('survival');
    const hour = p.game.hour;
    for (const code of ['KeyF', 'KeyG', 'BracketLeft', 'BracketRight']) key(p, code);
    expect([p.game.player.flying, p.game.hotbar.creative, p.game.hour]).toEqual([false, false, hour]);
    expect(p.hud.toasts).toEqual([]);
  });
});

describe('Builder’s mode', () => {
  it('F flies, G turns endless blocks off and on, and the clock keys turn the hour', async () => {
    const p = await begun('builder');
    key(p, 'KeyF');
    expect(p.game.player.flying).toBe(true);
    key(p, 'KeyG');
    expect(p.game.hotbar.creative).toBe(false);
    key(p, 'KeyG');
    expect(p.game.hotbar.creative).toBe(true);
    p.game.hour = 12;
    key(p, 'BracketRight');
    expect(p.game.hour).toBe(13);
    key(p, 'BracketLeft'); key(p, 'BracketLeft');
    expect(p.game.hour).toBe(11);
  });

  it('turning the clock pays the rig nothing (it used to pay nearly a day’s sats a press)', async () => {
    const p = await begun('builder');
    const g = p.game;
    // A rig and a charged battery bank at home.
    setEdit(g.world, 1805, 82, 1020, 'mining_rig');
    setEdit(g.world, 1806, 82, 1020, 'battery_bank');
    g.power.charge = 12;
    g.hour = 12;
    p.in.tickPlaces(); // power is now run up to noon
    const wallet = g.wallet;
    for (let i = 0; i < 100; i++) { key(p, 'BracketLeft'); p.in.tickPlaces(); }
    expect(g.wallet).toBe(wallet);
    expect(g.power.charge).toBe(12);
    // The same jump made the old way (the hour simply set back) is what paid: 23 hours of mining.
    g.hour = (g.hour + 23) % 24;
    p.in.tickPlaces();
    expect(g.wallet).toBeGreaterThan(wallet);
  });

  it('turning the clock back before six starts no new day (it used to: eggs, rabbits and dead men came round again)', async () => {
    const p = await begun('builder');
    const g = p.game;
    g.player.flying = true;
    g.hour = 5.9;
    play(p, 0.2); // the frame's own clock catches up with the hour
    g.wild.flockLeft = 0;
    g.wild.faction.down = 5;
    for (let i = 0; i < 5; i++) { key(p, 'BracketLeft'); play(p, 0.2); }
    expect([g.wild.flockLeft, g.wild.faction.down]).toEqual([0, 5]);
    // Whereas the hour set back by hand, as the key once did, is a new dawn.
    g.hour = (g.hour + 23) % 24;
    play(p, 0.2);
    expect([g.wild.flockLeft, g.wild.faction.down]).toEqual([1, 0]);
  });
});

describe('quest blocks with endless blocks on', () => {
  it('the raiders’ one forge still gives its parts; a plain block still gives nothing', () => {
    const [fx, fy, fz] = RAIDER_FORGE;
    const w = load(fx - 2, fz - 2, fx + 2, fz + 2);
    expect(w.blockAt(fx, fy, fz)).toBe(blockId('raider_forge'));
    const inv = new Inventory();
    inv.creative = true;
    expect(breakBlock(w, inv, fx, fy, fz).changed).toBe(true);
    expect(inv.count(itemId('forge_parts'))).toBe(1);
    // A plain block: nothing goes into the pack.
    let y = fy;
    while (w.blockAt(fx + 3, y, fz) === 0) y--;
    const plain = w.blockAt(fx + 3, y, fz);
    breakBlock(w, inv, fx + 3, y, fz);
    expect(inv.count(plain)).toBe(0);
    expect(ZONE1FAR).toBeDefined();
  });

  it('and with a full pack the forge stays where it is, rather than its parts being lost', () => {
    const [fx, fy, fz] = RAIDER_FORGE;
    const w = load(fx - 2, fz - 2, fx + 2, fz + 2);
    const inv = new Inventory();
    inv.creative = true;
    inv.slots = inv.slots.map(() => ({ id: itemId('planks'), count: 64 }));
    expect(breakBlock(w, inv, fx, fy, fz)).toEqual({ changed: false, full: true });
    expect(w.blockAt(fx, fy, fz)).toBe(blockId('raider_forge'));
  });
});
