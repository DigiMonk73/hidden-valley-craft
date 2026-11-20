// The home was rebuilt (docs/HOME.md), so a valley saved in the earlier layout is not opened: its chests, bed and
// rooms are somewhere else now. This is that rule, held by the save keeper (docs/FIXES.md, 10): whichever copy the
// old valley is found in (the stored save, the close-time copy, the backup, a hand-over, a pasted save), it is
// never opened, never written over unkept, and the player is told once in plain words.

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

import { openPage, memoryPending, settle, browserStore } from './game/harness.ts';
import { tab } from './game/stubs.ts';
import { MemoryStore, type Store } from '../src/platform/storage.ts';
import { Keeper, SAVE_KEY, BACKUP_KEY, EARLIER_KEY, BAD_KEY, NOTES } from '../src/save/keeper.ts';
import { BEGUN, newSave, normaliseSave } from '../src/save/state.ts';
import { encodeSave, parseSave, fromEarlierLayout, WORLD_LAYOUT, type SaveData } from '../src/save/save.ts';
import { saveToCode } from '../src/platform/fileio.ts';
import { EARLIER_BUILD } from '../src/game.ts';
import { START_WALLET } from '../src/sim/trade.ts';

vi.setConfig({ testTimeout: 60_000 });
afterEach(() => { tab.answer = 'held'; tab.freed = []; });

const stored = async (s: Store, key = SAVE_KEY) => { const r = await parseSave(await s.get(key), normaliseSave); return r.ok ? r.data : null; };
/** A valley as this build saves it. */
const valley = (wallet: number, extra: Partial<SaveData> = {}): SaveData => ({ ...newSave(), wallet, flags: [BEGUN], ...extra });
/** The same, as a build from before the home was rebuilt saved it: no layout mark (or the first). */
const old = (wallet: number, extra: Partial<SaveData> = {}): SaveData => { const d = valley(wallet, extra); delete d.layout; return d; };

describe('a save carries the layout it was made in', () => {
  it('a new valley, a checked save and a written save are all of this layout', async () => {
    expect(newSave().layout).toBe(WORLD_LAYOUT);
    expect(normaliseSave(valley(5))!.layout).toBe(WORLD_LAYOUT);
    const p = await openPage();
    p.in.edited();
    await p.in.save(false);
    const kept = (await stored(p.store))!;
    expect(kept.layout).toBe(WORLD_LAYOUT);
    expect(fromEarlierLayout(kept)).toBe(false);
    // So the next start opens it: the check must not drop the mark (it once would have, and every valley would
    // have been taken for an old one and thrown away at each start).
    p.game.wallet = 4321;
    p.in.edited();
    await p.in.save(false);
    const q = await openPage(p.store, p.pending);
    expect(q.game.wallet).toBe(4321);
    expect(q.hud.statusWarn).toBe(false);
  });

  it('a save with no mark, or the first, is from the earlier layout; junk for a mark is too', () => {
    expect(normaliseSave(old(5))!.layout).toBe(1);
    expect(normaliseSave({ ...valley(5), layout: 1 })!.layout).toBe(1);
    expect(normaliseSave({ ...valley(5), layout: 'two' })!.layout).toBe(1);
    expect(fromEarlierLayout(normaliseSave(old(5))!)).toBe(true);
  });
});

describe('the keeper does not open a valley from the earlier layout', () => {
  it('the stored save: a fresh valley, a plain line, and the old one kept under its own key', async () => {
    const store = new MemoryStore();
    const was = await encodeSave(old(777, { seq: 9 }));
    await store.set(SAVE_KEY, was);
    const r = await new Keeper(store, memoryPending()).load();
    expect([r.data, r.from, r.note]).toEqual([null, 'nothing', NOTES.earlier]);
    expect(r.unsaved).toBe(true);
    expect(await store.get(EARLIER_KEY)).toEqual(was);
    expect(await store.get(BAD_KEY)).toBeNull(); // it is not damaged, and not filed with the damaged
  });

  it('its close-time copy is not opened in its place either', async () => {
    const store = new MemoryStore(), pending = memoryPending();
    await store.set(SAVE_KEY, await encodeSave(old(777, { id: 'v-a', seq: 9 })));
    pending.bytes = await encodeSave(old(778, { id: 'v-a', seq: 10 }));
    const r = await new Keeper(store, pending).load();
    expect([r.data, r.note]).toEqual([null, NOTES.earlier]);
    expect(pending.bytes).toBeNull();
  });

  it('a close-time copy alone (a page that never reached its store) is kept and not opened', async () => {
    const store = new MemoryStore(), pending = memoryPending();
    const was = await encodeSave(old(778));
    pending.bytes = was;
    const r = await new Keeper(store, pending).load();
    expect([r.data, r.note, r.unsaved]).toEqual([null, NOTES.earlier, true]);
    expect(await store.get(EARLIER_KEY)).toEqual(was);
  });

  it('a fresh valley of this layout, saved only as the page closed over the old save, does open', async () => {
    const store = new MemoryStore(), pending = memoryPending();
    await store.set(SAVE_KEY, await encodeSave(old(777)));
    pending.bytes = await encodeSave(valley(55));
    const r = await new Keeper(store, pending).load();
    expect([r.data?.wallet, r.from, r.note]).toEqual([55, 'closing-copy', null]);
    expect(await store.get(EARLIER_KEY)).not.toBeNull();
  });

  it('a backup from the earlier layout is not offered, and cannot be opened', async () => {
    const store = new MemoryStore();
    await store.set(SAVE_KEY, await encodeSave(valley(55)));
    await store.set(BACKUP_KEY, await encodeSave(old(777)));
    const k = new Keeper(store, memoryPending());
    const r = await k.load();
    expect(r.data!.wallet).toBe(55);
    expect(k.backupWhen).toBeNull();
    expect(await k.backup()).toBeNull();
  });
});

describe('the game and a valley from the earlier layout', () => {
  it('starts fresh, says so in the menu and again when play begins, keeps the old save, and the next start is quiet', async () => {
    const store = browserStore(), pending = memoryPending();
    const was = await encodeSave(old(777, { seq: 9 }));
    await store.set(SAVE_KEY, was);
    const a = await openPage(store, pending);
    expect(a.game.wallet).toBe(START_WALLET);
    expect(a.hud.status).toBe(EARLIER_BUILD);
    expect(a.hud.statusWarn).toBe(true);
    a.in.ready = true;
    a.in.resume();
    expect(a.hud.toasts).toContain(EARLIER_BUILD);
    a.in.pause();
    await settle(a);
    expect(await store.get(EARLIER_KEY)).toEqual(was);
    const kept = (await stored(store))!;
    expect([kept.wallet, kept.layout]).toEqual([START_WALLET, WORLD_LAYOUT]);
    const b = await openPage(store, pending);
    expect(b.hud.statusWarn).toBe(false);
    expect(b.hud.status).not.toBe(EARLIER_BUILD);
  });

  it('a hand-over from a page of the earlier layout is not opened', async () => {
    // Nothing stored (a sandboxed frame): the old page's valley is not carried into the new world.
    const a = await openPage(browserStore(), memoryPending(), { handover: old(777) });
    expect(a.game.wallet).toBe(START_WALLET);
    expect(a.hud.status).toBe(EARLIER_BUILD);
    // A valley of this layout is stored: the old hand-over does not replace it, and there is nothing to say.
    const store = browserStore();
    const mine = valley(55, { seq: 3 });
    await store.set(SAVE_KEY, await encodeSave(mine));
    const b = await openPage(store, memoryPending(), { handover: { ...old(777), id: mine.id, seq: 8 } });
    expect(b.game.wallet).toBe(55);
    expect(b.hud.statusWarn).toBe(false);
  });

  it('a pasted save from the earlier layout is refused before anything is stored, and the valley is untouched', async () => {
    const a = await openPage();
    a.game.wallet = 4242;
    a.game.flags.add(BEGUN);
    a.in.edited();
    await a.in.save(false);
    const before = await a.store.get(SAVE_KEY);
    await a.in.loadFromCode(saveToCode(await encodeSave(old(777))));
    expect(a.hud.toasts.at(-1)).toContain('earlier build');
    expect(a.game.wallet).toBe(4242);
    expect(await a.store.get(SAVE_KEY)).toEqual(before);
    expect(await a.store.get(BACKUP_KEY)).toBeNull();
  });
});
