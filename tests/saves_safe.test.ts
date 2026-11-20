// N1 (docs/REVIEW.md, docs/FIXES.md): saves are safe. The four ways a valley could be lost (a slow storage open, a
// blank hand-over, a malformed save, two tabs) are each shown closed; there is a backup; play is saved on a timer
// with or without an edit; and a save that cannot be used ends at a working menu with a plain line.

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

import { openPage, memoryPending, loadLand, play, hide, settle, browserStore } from './game/harness.ts';
import { tab } from './game/stubs.ts';
import { MemoryStore, openStore, markHome, OPEN_WAIT_MS, OPEN_WAIT_KNOWN_MS, type Store } from '../src/platform/storage.ts';
import { Keeper, SAVE_KEY, BACKUP_KEY, BAD_KEY, NOTES } from '../src/save/keeper.ts';
import { newSave, normaliseSave, migrate, START } from '../src/save/state.ts';
import { encodeSave, encodeSaveNow, parseSave, SAVE_FORMAT, SAVE_VERSION, type SaveData } from '../src/save/save.ts';
import { saveToCode } from '../src/platform/fileio.ts';
import { DEGRADED, SECOND_TAB } from '../src/game.ts';
import { Inventory, BACKPACK_SLOTS, BASE_SLOTS } from '../src/sim/inventory.ts';
import { itemId } from '../src/world/items.ts';
import { blockId } from '../src/world/blocks.ts';
import { World } from '../src/world/world.ts';
import { START_WALLET } from '../src/sim/trade.ts';

const bytes = (o: unknown) => new TextEncoder().encode(JSON.stringify(o));
const stored = async (s: Store, key = SAVE_KEY) => { const r = await parseSave(await s.get(key), normaliseSave); return r.ok ? r.data : null; };
const valley = (wallet: number, extra: Partial<SaveData> = {}): SaveData => ({ ...newSave(), wallet, ...extra });

vi.setConfig({ testTimeout: 60_000 }); // these build the real game; the machine may be busy

afterEach(() => { tab.answer = 'held'; tab.freed = []; vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('a save is checked before the game touches it', () => {
  it('refuses a save with the right header and its fields missing, instead of throwing later', () => {
    expect(normaliseSave({ format: SAVE_FORMAT, version: 1 })).toBeNull();
    expect(normaliseSave({ format: SAVE_FORMAT, version: SAVE_VERSION, player: { x: 1 }, hotbar: [], palette: [], edits: [] })).toBeNull();
    expect(normaliseSave(null)).toBeNull();
    expect(normaliseSave('a save')).toBeNull();
  });

  it('makes a damaged save whole: finite numbers, the player inside the world, junk dropped', () => {
    const d = normaliseSave({
      ...newSave(), hour: 'noon', wallet: -5, dose: Infinity, den: 99, selected: 40, flags: ['ok', 7, null], explored: [3, -1, 99999, 'x'],
      player: { x: -4000, y: 9e9, z: 1024, yaw: null, pitch: 50, flying: 'yes' },
      vitals: { hp: NaN, hunger: 400, thirst: -3 }, spawn: { x: 'here' },
      hotbar: [{ name: 'planks', count: 3 }, { name: 'not_an_item', count: 1 }, { name: 'planks', count: -2 }, 'junk', null],
      palette: ['limestone'], edits: [[5, [1, 0, 99999999, 0, 2, 7]], ['x', [1, 0]], [6, 'no']],
      containers: [[10, 10, 10, [{ name: 'planks', count: 1 }]], [1, 2], 'no'],
    })!;
    expect(d).not.toBeNull();
    expect(d.hour).toBe(16.5);
    expect(d.wallet).toBe(0);
    expect(d.dose).toBe(0);
    expect(d.den).toBe(3);
    expect(d.selected).toBe(8);
    expect(d.flags).toEqual(['ok']);
    expect(d.explored).toEqual([3]);
    expect(d.player).toEqual({ x: 0.5, y: 208, z: 1024, yaw: 0, pitch: 1.55, flying: false });
    expect(d.vitals).toEqual({ hp: 100, hunger: 100, thirst: 0 });
    expect(d.spawn).toEqual({ x: START.x, y: START.y, z: START.z, yaw: START.yaw });
    expect(d.hotbar.length).toBe(BASE_SLOTS);
    expect(d.hotbar.filter(Boolean)).toEqual([{ name: 'planks', count: 3 }]);
    expect(d.edits).toEqual([[5, [1, 0]]]);
    expect(d.containers).toEqual([[10, 10, 10, [{ name: 'planks', count: 1 }]]]);
  });

  it('keeps a pack at 36 or 45 slots: what an old save held past that is spill, not a 46th slot for good', () => {
    const slots = Array.from({ length: BACKPACK_SLOTS + 1 }, () => ({ name: 'planks', count: 64 }));
    const d = normaliseSave({ ...newSave(), hotbar: slots })!;
    expect(d.hotbar.length).toBe(BACKPACK_SLOTS);
    expect(d.spill).toEqual([{ name: 'planks', count: 64 }]);
    expect(Inventory.fromSave(d.hotbar, 0).size).toBe(BACKPACK_SLOTS);
    expect(Inventory.fromSave(slots, 0).size).toBe(BACKPACK_SLOTS);
  });

  it('upgrades an older save one version at a time, and refuses one from a later build without touching it', async () => {
    const old: Record<string, unknown> = { ...newSave(), version: 1 };
    delete old.id; delete old.seq;
    const d = normaliseSave(old)!;
    expect(d.version).toBe(SAVE_VERSION);
    expect(d.id).toMatch(/^v-/);
    expect(d.seq).toBe(0);
    expect(migrate({ version: 0 })).toBe(false);
    const later = bytes({ ...newSave(), version: SAVE_VERSION + 1 });
    expect(await parseSave(later, normaliseSave)).toEqual({ ok: false, why: 'newer' });
    expect(await parseSave(bytes({ format: SAVE_FORMAT, version: 1 }), normaliseSave)).toEqual({ ok: false, why: 'damaged' });
    expect(await parseSave(bytes({ format: 'other' }), normaliseSave)).toEqual({ ok: false, why: 'not-a-save' });
    expect(await parseSave(new Uint8Array(0), normaliseSave)).toEqual({ ok: false, why: 'empty' });
  });

  it('a box set where another kind stood takes its own size (a chest where a hutch was is not 9 slots)', () => {
    const w = new World();
    const chest = blockId('chest');
    // No column is loaded, so say what block is there.
    w.blockAt = () => chest;
    w.containers.set(((70 << 22) | (1000 << 11) | 1700) >>> 0, new Array(9).fill(null));
    const size = w.containerAt(1700, 70, 1000)!.length;
    expect(size).toBeGreaterThan(9);
  });
});

describe('the keeper: which copy opens, the backup, and who may write', () => {
  it('a slow storage open cannot lose the valley: a fresh valley’s close-time copy never beats the real save', async () => {
    // Session 1 saved the real valley. Session 2 could not reach it, started fresh and left a close-time copy.
    const store = new MemoryStore(), pending = memoryPending();
    await store.set(SAVE_KEY, await encodeSave(valley(9_999_999, { seq: 12 })));
    pending.write(encodeSaveNow(valley(5_000_000, { seq: 40, savedAt: '2999-01-01T00:00:00.000Z' }))); // newer by the clock, and by its counter
    const r = await new Keeper(store, pending).load();
    expect(r.from).toBe('store');
    expect(r.data!.wallet).toBe(9_999_999);
    expect(pending.bytes).toBeNull(); // and the stray copy is gone
    expect((await stored(store))!.wallet).toBe(9_999_999);
  });

  it('the close-time copy of the same valley opens when it is the later write, and not when it is the earlier', async () => {
    const real = valley(100, { seq: 5 });
    const store = new MemoryStore(), pending = memoryPending();
    await store.set(SAVE_KEY, await encodeSave(real));
    pending.write(encodeSaveNow({ ...real, wallet: 200, seq: 6 }));
    const later = await new Keeper(store, pending).load();
    expect([later.from, later.data!.wallet, later.unsaved]).toEqual(['closing-copy', 200, true]);
    pending.write(encodeSaveNow({ ...real, wallet: 50, seq: 4 }));
    const earlier = await new Keeper(store, pending).load();
    expect([earlier.from, earlier.data!.wallet]).toEqual(['store', 100]);
  });

  it('keeps a backup of the save as each session found it, and opens it when the save cannot be read', async () => {
    const store = new MemoryStore();
    const k1 = new Keeper(store, memoryPending());
    k1.adopt(valley(700));
    await k1.save(() => valley(700));
    await new Keeper(store, memoryPending()).load(); // the next session: its backup is the save as found
    expect((await stored(store, BACKUP_KEY))!.wallet).toBe(700);
    const junk = new Uint8Array([0x1f, 0x8b, 1, 2, 3, 4]);
    await store.set(SAVE_KEY, junk);
    const k3 = new Keeper(store, memoryPending());
    const r = await k3.load();
    expect(r.from).toBe('backup');
    expect(r.data!.wallet).toBe(700);
    expect(r.note).toContain('backup');
    expect(r.unsaved).toBe(true);
    expect(await store.get(BAD_KEY)).toEqual(junk); // the unreadable bytes are kept aside, not written over
  });

  it('with no backup, an unreadable save starts a fresh valley, says so, and is kept aside', async () => {
    const store = new MemoryStore();
    await store.set(SAVE_KEY, bytes({ format: SAVE_FORMAT, version: 1 }));
    const r = await new Keeper(store, memoryPending()).load();
    expect([r.data, r.note]).toEqual([null, NOTES.fresh]);
    expect(new TextDecoder().decode((await store.get(BAD_KEY))!)).toContain(SAVE_FORMAT);
  });

  it('a save from a newer build is never written over by an older page', async () => {
    const store = new MemoryStore();
    const newer = bytes({ ...newSave(), version: SAVE_VERSION + 1 });
    await store.set(SAVE_KEY, newer);
    const k = new Keeper(store, memoryPending());
    const r = await k.load();
    expect([r.data, r.note, k.stopped]).toEqual([null, NOTES.newer, 'newer-build']);
    expect(await k.save(() => valley(1))).toBe('stopped');
    expect(k.saveNow(() => valley(1))).toBeNull();
    expect(await k.replace(valley(1), null)).toBe(false);
    expect(await store.get(SAVE_KEY)).toEqual(newer);
  });

  it('a read that fails is not taken for "no save": the page stops saving rather than write over it', async () => {
    const inner = new MemoryStore();
    await inner.set(SAVE_KEY, await encodeSave(valley(9_999_999)));
    const flaky: Store = { kind: 'indexeddb', get: async () => null, set: (k, v) => inner.set(k, v), getChecked: async () => 'error' };
    const k = new Keeper(flaky, memoryPending());
    const r = await k.load();
    expect([r.data, r.note, k.stopped]).toEqual([null, NOTES.storeError, 'store-error']);
    expect(await k.save(() => valley(1))).toBe('stopped');
    expect(await k.replace(valley(1), null)).toBe(false);
    expect((await stored(inner))!.wallet).toBe(9_999_999);
  });

  it('two tabs: the stale one stops and says so, instead of winning', async () => {
    const store = new MemoryStore();
    const first = valley(900_000);
    await store.set(SAVE_KEY, await encodeSave(first));
    const a = new Keeper(store, memoryPending()), b = new Keeper(store, memoryPending());
    a.adopt((await a.load()).data!);
    b.adopt((await b.load()).data!);
    expect(await a.save(() => valley(900_000))).toBe('ok'); // tab A plays on and saves
    expect(await b.save(() => valley(100))).toBe('stopped'); // tab B, stale, tries to save its older state
    expect(b.stopped).toBe('other-tab');
    expect(b.saveNow(() => valley(100))).toBeNull(); // nor as its page closes
    expect((await stored(store))!.wallet).toBe(900_000);
    expect(await a.save(() => valley(950_000))).toBe('ok'); // and A is not stopped by B
  });

  it('a session that follows another, with no other tab, saves as usual', async () => {
    const store = new MemoryStore();
    const a = new Keeper(store, memoryPending());
    a.adopt(valley(1));
    await a.save(() => valley(1));
    const b = new Keeper(store, memoryPending());
    b.adopt((await b.load()).data!);
    expect(await b.save(() => valley(2))).toBe('ok');
    expect(await b.save(() => valley(3))).toBe('ok');
    expect((await stored(store))!.seq).toBe(3);
  });

  it('replacing the valley (New game, a load) makes the one left the backup', async () => {
    const store = new MemoryStore();
    const k = new Keeper(store, memoryPending());
    const old = valley(123);
    k.adopt(old);
    const fresh = newSave();
    expect(await k.replace(fresh, old)).toBe(true);
    expect((await stored(store))!.id).toBe(fresh.id);
    expect((await k.backup())!.wallet).toBe(123);
    expect(k.backupWhen).not.toBeNull();
  });

  it('a failed write is reported, not swallowed', async () => {
    const full: Store = { kind: 'localstorage', get: async () => null, set: async () => false };
    const k = new Keeper(full, memoryPending());
    k.adopt(valley(1));
    expect(await k.save(() => valley(1))).toBe('failed');
  });
});

describe('opening the browser’s storage', () => {
  /** A stand-in for indexedDB whose open answers after `ms`, or never. */
  function fakeIdb(ms: number | null) {
    const kv = new Map<string, Uint8Array>();
    const db = {
      close() {},
      transaction: () => {
        const tx: Record<string, unknown> = {};
        tx.objectStore = () => ({
          put: (v: Uint8Array, k: string) => { kv.set(k, v); setTimeout(() => (tx.oncomplete as () => void)?.(), 0); },
          get: (k: string) => { const r: Record<string, unknown> = { result: kv.get(k) }; setTimeout(() => (r.onsuccess as () => void)?.(), 0); return r; },
        });
        return tx;
      },
    };
    return { open: () => { const req: Record<string, unknown> = { result: db }; if (ms !== null) setTimeout(() => (req.onsuccess as () => void)?.(), ms); return req; } };
  }
  function fakeLocal() {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } };
  }

  it('waits for a slow open when the valley is kept there, and says it is opening', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('localStorage', fakeLocal());
    vi.stubGlobal('indexedDB', fakeIdb(2500)); // the review's case: slower than the old 1.5 s limit
    markHome('indexeddb');
    let said = false;
    const opening = openStore(() => { said = true; });
    await vi.advanceTimersByTimeAsync(OPEN_WAIT_MS + 100);
    expect(said).toBe(true);
    await vi.advanceTimersByTimeAsync(1500);
    const s = await opening;
    expect(s.kind).toBe('indexeddb');
    expect(s.degraded).toBeFalsy();
  });

  it('if it never opens, the stand-in store is marked, so the game can say the real valley is untouched', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('localStorage', fakeLocal());
    vi.stubGlobal('indexedDB', fakeIdb(null));
    markHome('indexeddb');
    const opening = openStore();
    await vi.advanceTimersByTimeAsync(OPEN_WAIT_KNOWN_MS + 100);
    const s = await opening;
    expect(s.kind).toBe('localstorage');
    expect(s.degraded).toBe(true);
  });

  it('where nothing was ever kept there (a sandboxed frame), it falls back quickly and quietly', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('localStorage', fakeLocal());
    vi.stubGlobal('indexedDB', fakeIdb(null));
    const opening = openStore();
    await vi.advanceTimersByTimeAsync(OPEN_WAIT_MS + 100);
    const s = await opening;
    expect(s.kind).toBe('localstorage');
    expect(s.degraded).toBeFalsy();
  });
});

describe('the game and its saves', () => {
  it('everything round-trips through a save and a new page: a block, the pack, health, the hour, the wallet, the dose', async () => {
    const a = await openPage();
    await loadLand(a);
    const g = a.game;
    const [bx, by, bz] = [Math.floor(g.player.x) - 2, Math.floor(g.player.y) - 1, Math.floor(g.player.z)];
    expect(g.world.blockAt(bx, by, bz)).not.toBe(0);
    g.world.setBlock(bx, by, bz, 0);
    g.hotbar.add(itemId('planks'), 7);
    g.vitals = { hp: 41, hunger: 62, thirst: 33 };
    g.hour = 22.5;
    g.wallet = 1234;
    g.dose = 17;
    g.flags.add('safe_open');
    g.wild.faction.down = 5;
    g.player.setPosition(g.player.x - 3, g.player.y, g.player.z + 1);
    const at = [g.player.x, g.player.y, g.player.z];
    a.in.edited();
    await a.in.save(false);

    const b = await openPage(a.store, a.pending);
    const h = b.game;
    expect([h.player.x, h.player.y, h.player.z]).toEqual(at);
    expect(h.vitals).toEqual({ hp: 41, hunger: 62, thirst: 33 });
    expect([h.hour, h.wallet, h.dose, h.wild.faction.down]).toEqual([22.5, 1234, 17, 5]);
    expect(h.flags.has('safe_open')).toBe(true);
    expect(h.hotbar.count(itemId('planks'))).toBe(7);
    await loadLand(b);
    expect(h.world.blockAt(bx, by, bz)).toBe(0);
    expect(b.hud.toasts).toEqual([]);
  }, 60_000);

  it('saves play that changes no block: on a timer, on pause, and as the page closes', async () => {
    // On a timer.
    const a = await openPage();
    a.in.ready = true;
    a.game.player.flying = true; // nothing is loaded under the feet here
    play(a, 30);
    a.game.player.setPosition(1700, 90, 1000);
    a.game.vitals.hp = 12;
    expect(await stored(a.store)).toBeNull(); // not yet a minute
    play(a, 40);
    await settle(a);
    const timed = (await stored(a.store))!;
    expect([timed.player.x, timed.vitals!.hp]).toEqual([1700, 12]);
    expect(a.in.unsaved).toBe(false); // and no edit was counted to get it

    // On pause.
    a.game.player.setPosition(1650, 90, 1000);
    play(a, 1);
    a.in.pause();
    await settle(a);
    expect((await stored(a.store))!.player.x).toBe(1650);

    // As the page closes: the copy beside the store is complete before the event returns.
    a.game.player.setPosition(1600, 90, 1000);
    play(a, 1);
    a.pending.clear();
    hide();
    expect(a.pending.bytes).not.toBeNull();
    const closing = await parseSave(a.pending.bytes, normaliseSave);
    expect(closing.ok && closing.data.player.x).toBe(1600);
    const b = await openPage(a.store, a.pending);
    expect(b.game.player.x).toBe(1600);
  });

  it('a save that cannot be read ends at a working menu with a plain line, and the next start is clean', async () => {
    const store = browserStore(), pending = memoryPending();
    await store.set(SAVE_KEY, bytes({ format: SAVE_FORMAT, version: 1 })); // the review's page-bricking save
    const a = await openPage(store, pending);
    expect(a.in.booted).toBe(true);
    expect(a.hud.status).toBe(NOTES.fresh);
    expect(a.hud.statusWarn).toBe(true);
    expect(a.game.wallet).toBe(START_WALLET);
    a.in.ready = true;
    a.in.resume();
    expect(a.in.playing).toBe(true);
    expect(a.hud.toasts).toContain(NOTES.fresh);
    a.in.pause();
    await settle(a);
    const b = await openPage(store, pending);
    expect(b.hud.statusWarn).toBe(false);
    expect((await stored(store))!.wallet).toBe(START_WALLET);
    expect(await store.get(BAD_KEY)).not.toBeNull();
  });

  it('a damaged save pasted in is refused before it is stored, and the valley is untouched', async () => {
    const a = await openPage();
    a.game.wallet = 777;
    a.in.edited();
    await a.in.save(false);
    const before = await a.store.get(SAVE_KEY);
    await a.in.loadFromCode(saveToCode(bytes({ format: SAVE_FORMAT, version: 1 })));
    expect(a.hud.toasts.at(-1)).toContain('damaged');
    expect(a.game.wallet).toBe(777);
    expect(await a.store.get(SAVE_KEY)).toEqual(before);
    await a.in.loadFromCode('HVB1:not base64 at all!!');
    await a.in.loadFromCode(saveToCode(bytes({ ...newSave(), version: SAVE_VERSION + 1 })));
    expect(a.hud.toasts.at(-1)).toContain('newer build');
    expect(a.game.wallet).toBe(777);
    // And a later start is fine.
    const b = await openPage(a.store, a.pending);
    expect(b.game.wallet).toBe(777);
  });

  it('a good save pasted in opens, is stored at once, and the valley left becomes the backup', async () => {
    const a = await openPage();
    a.game.wallet = 777;
    await a.in.loadFromCode(saveToCode(await encodeSave(valley(4242))));
    expect(a.game.wallet).toBe(4242);
    expect((await stored(a.store))!.wallet).toBe(4242);
    expect((await stored(a.store, BACKUP_KEY))!.wallet).toBe(777);
    expect(a.hud.backup).not.toBeNull();
    await a.in.openBackup(); // and back again
    expect(a.game.wallet).toBe(777);
    expect((await stored(a.store, BACKUP_KEY))!.wallet).toBe(4242);
  });

  it('hands nothing to the page’s next version until a valley is open, and ignores a hand-over that is not a save', async () => {
    const { Game } = await import('../src/game.ts');
    const { fakeBrowser } = await import('./game/harness.ts');
    fakeBrowser();
    const store = browserStore();
    await store.set(SAVE_KEY, await encodeSave(valley(9_999_999)));
    const g = new Game({ clientWidth: 1, clientHeight: 1, addEventListener() {} } as unknown as HTMLCanvasElement, {} as HTMLElement, { renderChunks: 2, store, pending: memoryPending() });
    expect(g.handover()).toBeUndefined(); // before boot: the review's blank game at 0,0,0
    await g.boot();
    expect(g.handover()!.wallet).toBe(9_999_999);

    // A blank or broken hand-over does not replace the stored valley.
    for (const handover of [{}, { format: SAVE_FORMAT, version: SAVE_VERSION }, { ...newSave(), player: { x: 0 } }]) {
      const p = await openPage(store, memoryPending(), { handover });
      expect(p.game.wallet).toBe(9_999_999);
    }
    // A real one does, and is written to the store.
    const p = await openPage(store, memoryPending(), { handover: valley(31) });
    expect(p.game.wallet).toBe(31);
    await p.in.save(false);
    expect((await stored(store))!.wallet).toBe(31);
  });

  it('New game resets everything, backs the old valley up, and the save code is the new valley at once', async () => {
    const a = await openPage();
    a.game.wallet = 55;
    a.game.wild.faction.down = 7; // Zone-2's dead men used to survive New game
    a.game.wild.ashen.down = 3;
    a.game.dose = 60;
    a.game.flags.add('safe_open');
    a.game.vitals.hp = 5;
    a.in.edited();
    await a.in.save(false);
    await a.in.newGame();
    await settle();
    const g = a.game;
    expect([g.wallet, g.wild.faction.down, g.wild.ashen.down, g.dose, g.vitals.hp, g.flags.size]).toEqual([START_WALLET, 0, 0, 0, 100, 0]);
    expect((await stored(a.store, BACKUP_KEY))!.wallet).toBe(55);
    const code = a.in.cachedCode!;
    const { codeToSave } = await import('../src/platform/fileio.ts');
    const inCode = await parseSave(codeToSave(code), normaliseSave);
    expect(inCode.ok && inCode.data.wallet).toBe(START_WALLET); // it used to be the OLD valley until the next pause
    expect(inCode.ok && inCode.data.id).toBe((await stored(a.store))!.id);
  });

  it('a save that throws does not leave autosave dead for the session', async () => {
    const a = await openPage();
    a.in.edited();
    const real = a.game.snapshot.bind(a.game);
    let broken = true;
    a.game.snapshot = () => { if (broken) throw new Error('boom'); return real(); };
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    await a.in.save(false);
    quiet.mockRestore();
    expect(a.in.saving).toBe(false);
    broken = false;
    await a.in.save(false);
    expect(await stored(a.store)).not.toBeNull();
  });

  it('a failed write is said on screen and in the menu', async () => {
    let fail = false;
    const inner = new MemoryStore();
    const store: Store = { kind: 'localstorage', get: (k) => inner.get(k), set: (k, v) => (fail ? Promise.resolve(false) : inner.set(k, v)) };
    const a = await openPage(store);
    a.in.edited();
    fail = true;
    await a.in.save(false);
    expect(a.hud.toasts.at(-1)).toContain('Saving did not work');
    expect(a.hud.statusWarn).toBe(true);
    fail = false;
    await a.in.save(false);
    expect(a.hud.statusWarn).toBe(false);
  });

  it('a second tab does not play or save while the first has the valley; when the first goes, it opens the valley as left', async () => {
    const store = browserStore();
    await store.set(SAVE_KEY, await encodeSave(valley(900_000)));
    const a = await openPage(store, memoryPending());
    tab.answer = 'taken';
    const b = await openPage(store, memoryPending());
    expect(b.hud.blocked).toBe(SECOND_TAB);
    b.in.ready = true;
    b.in.resume();
    expect(b.in.playing).toBe(false);
    b.game.wallet = 100;
    b.in.edited();
    await b.in.save(false);
    b.in.saveNow();
    expect(b.pending.bytes).toBeNull();
    expect((await stored(store))!.wallet).toBe(900_000);
    expect(b.game.handover()).toBeUndefined();
    // Tab A plays on, saves and closes.
    a.game.wallet = 950_000;
    a.in.edited();
    await a.in.save(false);
    tab.freed.forEach((f) => f());
    await settle();
    expect(b.hud.blocked).toBeNull();
    expect(b.game.wallet).toBe(950_000);
  });

  it('where tabs cannot be locked, a stale tab that tries to save is stopped and told why', async () => {
    tab.answer = 'unsupported';
    const store = browserStore();
    await store.set(SAVE_KEY, await encodeSave(valley(900_000)));
    const a = await openPage(store, memoryPending());
    const b = await openPage(store, memoryPending());
    a.in.edited();
    await a.in.save(false);
    b.game.wallet = 100;
    b.in.edited();
    await b.in.save(false);
    expect(b.hud.blocked).toBe(NOTES.otherTab);
    expect(b.hud.toasts.at(-1)).toBe(NOTES.otherTab);
    expect((await stored(store))!.wallet).toBe(900_000);
  });

  it('says when the browser’s storage did not open, and keeps what is done meanwhile apart', async () => {
    const standIn: Store = Object.assign(new MemoryStore(), { degraded: true });
    const a = await openPage(standIn);
    expect(a.hud.status).toBe(DEGRADED);
    expect(a.hud.statusWarn).toBe(true);
  });

  it('what a pack could not hold when saved is put down in a sack, not kept as an extra slot', async () => {
    const full = Array.from({ length: BASE_SLOTS }, () => ({ name: 'planks', count: 64 }));
    const store = browserStore();
    await store.set(SAVE_KEY, await encodeSave({ ...newSave(), hotbar: full, spill: [{ name: 'steel_pickaxe', count: 1, wear: 3 }] }));
    const a = await openPage(store);
    expect(a.game.hotbar.size).toBe(BASE_SLOTS);
    expect(a.game.snapshot().spill).toEqual([{ name: 'steel_pickaxe', count: 1, wear: 3 }]); // still with the save until it is put down
    await loadLand(a);
    expect(a.game.snapshot().spill).toEqual([]);
    expect(a.hud.toasts.at(-1)).toContain('sack');
    const sacks = [...a.game.world.containers.values()].filter((c) => c.some((s) => s && s.id === itemId('steel_pickaxe')));
    expect(sacks.length).toBe(1);
  }, 60_000);
});
