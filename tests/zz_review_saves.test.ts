// Review probes for branch `fixes` (the saves, N1). Written by a reviewer who did not write the code.
// A test here states what SHOULD hold. Those marked FINDING fail on fixes@0c408c0: the failure is the proof.
// Those marked HOLDS pass: places that were attacked and stood. The findings are numbered as in the review's report
// (worst first, across tests/zz_review_*.test.ts and tests/e2e/zz_review.mjs).

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

import { openPage, memoryPending, play, hide, settle, browserStore, type Page } from './game/harness.ts';
import { tab } from './game/stubs.ts';
import { MemoryStore, openStore, type Store } from '../src/platform/storage.ts';
import { SAVE_KEY, BACKUP_KEY, BAD_KEY } from '../src/save/keeper.ts';
import { newSave, normaliseSave } from '../src/save/state.ts';
import { encodeSave, parseSave, SAVE_FORMAT, type SaveData } from '../src/save/save.ts';
import { saveToCode } from '../src/platform/fileio.ts';
import { START_WALLET } from '../src/sim/trade.ts';

const stored = async (s: Store, key = SAVE_KEY) => { const r = await parseSave(await s.get(key), normaliseSave); return r.ok ? r.data : null; };
/** A valley told apart by its wallet. `begun`, so it is somebody's real valley and not a blank one. */
const valley = (wallet: number, extra: Partial<SaveData> = {}): SaveData => ({ ...newSave(), wallet, flags: ['begun'], ...extra });
/** Every wallet the browser still holds anywhere: the save, the backup, the close-time copy. */
async function wallets(store: Store, pending: { read(): Uint8Array | null }): Promise<number[]> {
  const out: number[] = [];
  for (const k of [SAVE_KEY, BACKUP_KEY]) { const d = await stored(store, k); if (d) out.push(d.wallet!); }
  const c = await parseSave(pending.read(), normaliseSave);
  if (c.ok) out.push(c.data.wallet!);
  return out;
}

vi.setConfig({ testTimeout: 120_000 });
afterEach(() => { tab.answer = 'held'; tab.freed = []; vi.useRealTimers(); vi.unstubAllGlobals(); });

const REAL = 777_777; // the player's real valley
const OLDER = 222_222; // another real valley, sitting in the backup

describe('FINDING 1 · the one backup slot is written over by the next thing that happens', () => {
  it('New game by mistake, then the page is reloaded: the valley left must still be somewhere', async () => {
    const store = browserStore(), pending = memoryPending();
    await store.set(SAVE_KEY, await encodeSave(valley(REAL)));
    let p = await openPage(store, pending);
    expect(p.game.wallet).toBe(REAL);
    await p.in.newGame();
    expect((await stored(store, BACKUP_KEY))!.wallet).toBe(REAL); // New game did keep it…
    hide(); await settle(p);
    p = await openPage(store, pending); // …until the page is opened again
    expect(await wallets(store, pending)).toContain(REAL);
  });

  it('"Open the backup" to look at it, then the page is closed: this session’s play must still be somewhere next time', async () => {
    const store = browserStore(), pending = memoryPending();
    await store.set(SAVE_KEY, await encodeSave(valley(OLDER))); // the valley as the session finds it
    let p = await openPage(store, pending);
    p.game.wallet = REAL; p.in.edited();
    await p.in.save(false); // the session's play, saved
    await p.in.openBackup(); // "The backup is open. The valley you just left is the backup now."
    expect((await stored(store, BACKUP_KEY))!.wallet).toBe(REAL);
    hide(); await settle(p);
    p = await openPage(store, pending);
    expect(await wallets(store, pending)).toContain(REAL);
  });

  it('New game by mistake, then a second tab is opened to look: the valley left must still be somewhere', async () => {
    const store = browserStore(), pending = memoryPending();
    await store.set(SAVE_KEY, await encodeSave(valley(REAL)));
    const p = await openPage(store, pending);
    await p.in.newGame();
    tab.answer = 'taken';
    await openPage(store, pending); // the second tab only looks; it is held back from playing
    expect(await wallets(store, pending)).toContain(REAL);
  });

  it('New game clicked three times quickly (arm, erase, and once more): the valley left must still be somewhere', async () => {
    const store = browserStore(), pending = memoryPending();
    await store.set(SAVE_KEY, await encodeSave(valley(REAL)));
    const p = await openPage(store, pending);
    // src/ui/hud.ts: the first click arms the button for 4 s; every click inside those 4 s calls newGame().
    await p.in.newGame();
    await p.in.newGame();
    await settle(p);
    expect(await wallets(store, pending)).toContain(REAL);
  });

  it('"Open the backup" double-clicked: the valley being played must still be somewhere', async () => {
    const store = browserStore(), pending = memoryPending();
    await store.set(SAVE_KEY, await encodeSave(valley(OLDER)));
    const p = await openPage(store, pending);
    await p.in.loadFromCode(saveToCode(await encodeSave(valley(REAL)))); // REAL is played; OLDER is the backup
    expect((await stored(store))!.wallet).toBe(REAL);
    expect((await stored(store, BACKUP_KEY))!.wallet).toBe(OLDER);
    void p.in.openBackup(); void p.in.openBackup();
    await settle(p);
    expect(await wallets(store, pending)).toContain(REAL);
  });

  it('"Load pasted code" double-clicked: the valley being left must still be somewhere', async () => {
    const store = browserStore(), pending = memoryPending();
    await store.set(SAVE_KEY, await encodeSave(valley(REAL)));
    const p = await openPage(store, pending);
    const code = saveToCode(await encodeSave(valley(OLDER)));
    void p.in.loadFromCode(code); void p.in.loadFromCode(code);
    await settle(p);
    expect(await wallets(store, pending)).toContain(REAL);
  });
});

describe('FINDING 2 · the hand-over between page versions is taken without asking whose it is', () => {
  it('a tab that was told "another tab has saved since" must not hand its stale valley on over the newer save', async () => {
    tab.answer = 'unsupported'; // a sandboxed frame: no Web Locks, the counter does the job
    const store = browserStore(), pending = memoryPending();
    await store.set(SAVE_KEY, await encodeSave(valley(100)));
    const one = await openPage(store, pending);
    const two = await openPage(store, pending);
    two.game.wallet = REAL; two.in.edited();
    await two.in.save(false); // the second tab plays on and saves: REAL is the newest
    one.game.wallet = 5; one.in.edited();
    await one.in.save(false); // the first is stale, and is stopped
    expect(one.game.keeper.stopped).toBe('other-tab');
    expect((await stored(store))!.wallet).toBe(REAL);
    // A new version of the page is published: claude.ai hands each open page's state to its next version.
    const handed = one.game.handover();
    const next = await openPage(store, pending, { handover: handed });
    play(next, 0.2); next.in.pause(); await settle(next);
    expect(next.game.wallet).toBe(REAL);
    expect((await stored(store))!.wallet).toBe(REAL);
  });

  it('a valley begun while the storage would not open must not be handed on over the real one', async () => {
    const real = browserStore(), pending = memoryPending();
    await real.set(SAVE_KEY, await encodeSave(valley(REAL)));
    // Session 1: IndexedDB did not open. The game says "what you do meanwhile is kept apart and will not replace it".
    const standIn: Store = Object.assign(new MemoryStore(), { degraded: true });
    const apart = await openPage(standIn, memoryPending());
    expect(apart.game.wallet).toBe(START_WALLET);
    play(apart, 0.2);
    const handed = apart.game.handover();
    // The page's next version arrives, and this time the storage opens.
    const next = await openPage(real, pending, { handover: handed });
    play(next, 0.2); next.in.pause(); await settle(next);
    expect((await stored(real))!.wallet).toBe(REAL);
  });
});

describe('FINDING 5 · a version-1 valley gets a new random id at every read', () => {
  const v1 = (wallet: number) => { const d = valley(wallet) as unknown as Record<string, unknown>; d.version = 1; delete d.id; delete d.seq; delete d.mode; delete d.endless; return d; };

  it('reading the same version-1 bytes twice gives the same valley id', () => {
    const raw = v1(REAL);
    expect(normaliseSave(raw)!.id).toBe(normaliseSave(raw)!.id);
  });

  it('the first session on an older save: if the store’s write does not land as the page closes, the close-time copy must open next time', async () => {
    const m = new MemoryStore();
    let landing = true;
    const store: Store = { kind: 'indexeddb', get: (k) => m.get(k), set: async (k, v) => (k === SAVE_KEY && !landing ? false : m.set(k, v)) };
    const pending = memoryPending();
    await store.set(SAVE_KEY, new TextEncoder().encode(JSON.stringify(v1(100))));
    landing = false; // the tab is closed before IndexedDB finishes (what the close-time copy is for)
    let p = await openPage(store, pending);
    p.game.wallet = REAL; p.in.edited();
    hide(); await settle(p);
    expect(pending.bytes).not.toBeNull();
    landing = true;
    p = await openPage(store, pending);
    expect(p.game.wallet).toBe(REAL);
  });
});

describe('FINDING 9 · a write that never answers stops saving for the session and nothing says so', () => {
  it('after minutes of play with the store hung, the menu or a toast must say the valley is not being saved', async () => {
    const m = new MemoryStore();
    let hung = false;
    const store: Store = { kind: 'indexeddb', get: (k) => m.get(k), set: (k, v) => (hung && k === SAVE_KEY ? new Promise<boolean>(() => {}) : m.set(k, v)) };
    const p = await openPage(store, memoryPending());
    p.in.ready = true;
    p.game.player.flying = true;
    hung = true;
    for (let i = 0; i < 5; i++) { p.in.edited(); play(p, 70); await new Promise((r) => setTimeout(r, 30)); }
    p.in.pause();
    await new Promise((r) => setTimeout(r, 100));
    const said = p.hud.statusWarn || p.hud.toasts.some((t) => /sav/i.test(t));
    expect({ said, saving: p.in.saving, status: p.hud.status }).toMatchObject({ said: true });
  });
});

describe('FINDING 7 · the address bar flies in Survival', () => {
  it('?cam=… (BootOptions.cam, read from the address in src/main.ts) must not set a Survival player flying', async () => {
    const store = browserStore();
    await store.set(SAVE_KEY, await encodeSave(valley(REAL)));
    const p = await openPage(store, memoryPending(), { cam: [1800, 90, 1024, 0, 0] });
    expect(p.game.mode).toBe('survival');
    expect(p.game.player.flying).toBe(false);
  });
});

describe('FINDING 10 · one failed read of save:head at the start, and the page later says another tab has the valley', () => {
  it('a read of the head that fails at the start must not be taken for another tab later (Play is then held back until a reload)', async () => {
    const m = new MemoryStore();
    let failHead = false;
    const store: Store = { kind: 'indexeddb', get: async (k) => (failHead && k === 'save:head' ? null : m.get(k)), set: (k, v) => m.set(k, v) };
    const pending = memoryPending();
    let p = await openPage(store, pending);
    p.in.edited(); await p.in.save(false); // an earlier session leaves its head
    failHead = true;
    p = await openPage(store, pending); // this session's one read of the head fails (IndexedDB answers null on error)
    failHead = false;
    p.in.edited(); await p.in.save(false);
    expect(p.game.keeper.stopped).toBeNull();
  });
});

describe('FINDING 12 · a valley first kept in localStorage is left behind, with no word, the day IndexedDB opens in time', () => {
  /** The stand-ins tests/saves_safe.test.ts uses: an indexedDB whose open answers after `ms`, and a localStorage. */
  function fakeIdb(ms: number) {
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
    return { open: () => { const req: Record<string, unknown> = { result: db }; setTimeout(() => (req.onsuccess as () => void)?.(), ms); return req; } };
  }
  function fakeLocal() {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } };
  }

  it('first visit: the open takes 2.5 s (nothing yet says a valley is kept there). Second visit: it takes 10 ms. The valley must open, or the page must say where it is', async () => {
    vi.stubGlobal('localStorage', fakeLocal());
    vi.stubGlobal('indexedDB', fakeIdb(2500));
    const first = await openStore(); // gives up after 1.5 s, as it must for a frame that never answers
    expect(first.kind).toBe('localstorage');
    await first.set(SAVE_KEY, await encodeSave(valley(REAL))); // the first visit's play is kept there
    vi.stubGlobal('indexedDB', fakeIdb(10));
    const second = await openStore();
    const found = await stored(second);
    console.info(`REVIEW second visit: the store is ${second.kind}, degraded ${!!second.degraded}, and holds ${found ? `a valley with wallet ${found.wallet}` : 'no save: a fresh valley starts, with no line said'}`);
    expect(found?.wallet === REAL || !!second.degraded).toBe(true);
  });
});

// ---- Attacked, and stood ---------------------------------------------------------------------------------

/** A store whose n-th write fails (returns false), counting from 1; `seen` is how many writes were asked for. */
function failingAt(n: number): Store & { seen: number; m: MemoryStore; keys: string[] } {
  const m = new MemoryStore();
  const s = { kind: 'indexeddb' as const, seen: 0, m, keys: [] as string[], get: (k: string) => m.get(k), set: async (k: string, v: Uint8Array) => { s.keys.push(k); return ++s.seen === n ? false : m.set(k, v); } };
  return s;
}

describe('FINDING 4 · a swap goes ahead when the backup of the valley being left could not be written', () => {
  it('whichever single write fails through a session of play, a load and Open the backup, the page ends at a working menu and no real valley is left nowhere (it holds for every write but that one)', async () => {
    // First count the writes of the whole script on a healthy store.
    const script = async (store: Store & { m: MemoryStore }, pending: ReturnType<typeof memoryPending>) => {
      await store.m.set(SAVE_KEY, await encodeSave(valley(REAL)));
      const p = await openPage(store, pending);
      p.in.ready = true; p.game.player.flying = true;
      p.game.wallet = REAL + 1; p.in.edited();
      play(p, 3); await settle(p);
      p.in.pause(); await settle(p);
      await p.in.loadFromCode(saveToCode(await encodeSave(valley(OLDER))));
      await p.in.openBackup();
      p.in.ready = true; play(p, 3); await settle(p);
      hide(); await settle(p);
      return p;
    };
    const healthy = failingAt(0);
    await script(healthy, memoryPending());
    const writes = healthy.seen;
    expect(writes).toBeGreaterThan(5);
    const lost: number[] = [], opened: number[] = [];
    for (let n = 1; n <= writes; n++) {
      const store = failingAt(n), pending = memoryPending();
      await script(store, pending);
      // The valley as played (REAL + 1) or as found (REAL), and the one loaded (OLDER), must each be held somewhere.
      const all = await wallets(store, pending);
      if (!(all.includes(REAL + 1) || all.includes(REAL)) || !all.includes(OLDER)) { lost.push(n); console.info(`REVIEW write ${n} (${store.keys[n - 1]}) failed of [${store.keys.join(', ')}]: the browser holds wallets ${JSON.stringify(all)}`); }
      // Next start, on the same storage now healthy: a real valley opens (not a fresh one), at a working menu.
      const again = await openPage(store, pending);
      opened.push(again.game.wallet);
      expect(again.hud.menuShown).toBe(true);
      expect(again.game.keeper.stopped).toBeNull();
    }
    expect(opened.filter((w) => w === START_WALLET)).toEqual([]);
    expect(lost).toEqual([]);
  });
});

describe('HOLDS · swaps during a save, and a close during a swap', () => {
  it('New game while an autosave is in flight: the store ends holding the new valley, the backup the old one', async () => {
    const store = browserStore(), pending = memoryPending();
    await store.set(SAVE_KEY, await encodeSave(valley(REAL)));
    const p = await openPage(store, pending);
    p.in.edited();
    const saving = p.in.save(false);
    const fresh = p.in.newGame();
    await Promise.all([saving, fresh]); await settle(p);
    expect((await stored(store))!.wallet).toBe(START_WALLET);
    expect((await stored(store, BACKUP_KEY))!.wallet).toBe(REAL);
    expect((await stored(store))!.id).toBe(p.game.keeper.id);
  });

  it('the page closes in the middle of New game: next time the new valley opens and the old one is the backup', async () => {
    const store = browserStore(), pending = memoryPending();
    await store.set(SAVE_KEY, await encodeSave(valley(REAL)));
    const p = await openPage(store, pending);
    const fresh = p.in.newGame();
    p.in.edited(); hide();
    await fresh; await settle(p);
    const again = await openPage(store, pending);
    expect(again.game.wallet).toBe(START_WALLET);
    // (The reload itself then writes the backup over: FINDING 1. Here only: the swap and the close did not cross.)
  });

  it('the page closes while an autosave is still compressing: the newest state opens next time, once', async () => {
    const store = browserStore(), pending = memoryPending();
    await store.set(SAVE_KEY, await encodeSave(valley(REAL)));
    const p = await openPage(store, pending);
    p.game.wallet = 1; p.in.edited();
    const saving = p.in.save(false);
    p.game.wallet = 2; p.in.edited();
    hide();
    await saving; await settle(p);
    expect((await stored(store))!.wallet).toBe(2);
    const again = await openPage(store, pending);
    expect(again.game.wallet).toBe(2);
    expect(again.game.keeper.seq).toBe((await stored(store))!.seq);
  });

  it('a close-time copy of another valley, or an earlier write of this one, never opens over the stored save', async () => {
    for (const [copy, opens] of [
      [valley(5, { id: 'other', seq: 99 }), REAL], [valley(5, { id: 'mine', seq: 3 }), REAL], [valley(5, { id: 'mine', seq: 4 }), REAL], [valley(5, { id: 'mine', seq: 5 }), 5],
    ] as const) {
      const store = browserStore(), pending = memoryPending();
      await store.set(SAVE_KEY, await encodeSave(valley(REAL, { id: 'mine', seq: 4 })));
      pending.write(new TextEncoder().encode(JSON.stringify(copy)));
      const p = await openPage(store, pending);
      expect(p.game.wallet).toBe(opens);
    }
  });
});

describe('HOLDS · hostile saves', () => {
  const cases: [string, Record<string, unknown>][] = [
    ['numbers that are not', { hour: Infinity, wallet: -Infinity, marcoPaid: NaN, dose: 1e308, den: -1, flock: 1e9, outpost: 'x', factionDown: 1e12, ashenDown: -5, selected: 1e9, seq: -3 }],
    ['a player nowhere', { player: { x: 1e300, y: -1e300, z: 5e-324, yaw: 1e300, pitch: -1e300, flying: 1 }, spawn: { x: -1, y: 1e9, z: 4096, yaw: 'n' } }],
    ['wrong types everywhere', { flags: 'begun', explored: {}, containers: 7, vitals: [], power: 'on', live: [], spill: {}, savedAt: 5, id: 9, mode: 3, endless: 'yes' }],
    ['items that are object keys', { hotbar: ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf'].map((name) => ({ name, count: 1 })), spill: [{ name: '__proto__', count: 1 }] }],
    ['palette that is object keys', { palette: ['__proto__', 'constructor', 'toString'], edits: [[0, [0, 0, 1, 1, 2, 2]]] }],
    ['wear on a stackable, counts past any stack', { hotbar: [{ name: 'planks', count: 1e9, wear: 5 }, { name: 'steel_pickaxe', count: 500, wear: 1e300 }, { name: 'lantern', count: 0.5 }] }],
    ['edits outside the palette and the world', { palette: ['limestone'], edits: [[-1, [0, 0]], [1e12, [0, 0]], [3, [0, 5, -1, 0, 32768, 0, 1.5, 0]], [4, [0]], [5, null], null] }],
    ['boxes of the wrong shape', { containers: [[1800, 80, 1024, []], [1800, 81, 1024, [null, 7, 'x', { name: 'planks', count: 3 }]], [1800, 82, 1024, Array.from({ length: 5000 }, () => ({ name: 'planks', count: 64 }))], [1e9, 0, 0, []], [1, 2]] }],
    ['a pack of the wrong length', { hotbar: [] }],
    ['a pack far too long', { hotbar: Array.from({ length: 5000 }, () => ({ name: 'planks', count: 64 })) }],
    ['power beyond reason', { power: { charge: 1e308, satsTotal: -1, satsToday: 1e308, frac: 99 }, live: { solar: [[1, 2], 'x', [1e9, 1e9, 1e9]], hydro: null } }],
    ['Builder’s fields in a Survival save', { mode: 'survival', endless: true, player: { x: 1800, y: 90, z: 1024, yaw: 0, pitch: 0, flying: true } }],
    ['flags that are not strings', { flags: [1, null, {}, ['begun'], 'x'.repeat(100), 'begun'] }],
    ['dead on arrival', { vitals: { hp: 0, hunger: 0, thirst: 0 } }],
  ];
  it.each(cases)('%s: the page starts, plays through a dawn without an error, and saves', async (_name, extra) => {
    const store = browserStore(), pending = memoryPending();
    const raw = { ...newSave(), flags: ['begun'], ...extra };
    await store.set(SAVE_KEY, new TextEncoder().encode(JSON.stringify(raw)));
    const p = await openPage(store, pending);
    expect(p.hud.menuShown).toBe(true);
    p.in.ready = true;
    p.game.hour = 5.99;
    play(p, 30); // across six in the morning: hutches, coops, racks, the purse, the men at their posts
    expect(p.game.player.flying && p.game.mode === 'survival').toBe(false);
    expect(p.game.hotbar.creative && p.game.mode === 'survival').toBe(false);
    p.in.pause(); await settle(p);
    const back = await stored(store);
    expect(back).not.toBeNull();
    expect(Number.isFinite(back!.wallet) && back!.wallet! >= 0 && Number.isInteger(back!.wallet)).toBe(true);
    expect(await store.get(BAD_KEY)).toBeNull(); // made whole, not thrown away
  });

  it('a version-1 and a version-2 save open with everything they held', async () => {
    for (const version of [1, 2]) {
      const d = valley(REAL, { hour: 9.25, dose: 12, den: 1, flock: 4, outpost: 5, marcoPaid: 1000, flags: ['m1_done', 'safe_open'] }) as unknown as Record<string, unknown>;
      d.version = version; delete d.mode; delete d.endless;
      if (version === 1) { delete d.id; delete d.seq; }
      (d.hotbar as unknown[])[20] = { name: 'iron_ingot', count: 7 };
      const store = browserStore();
      await store.set(SAVE_KEY, new TextEncoder().encode(JSON.stringify(d)));
      const p = await openPage(store, memoryPending());
      const g = p.game;
      expect([g.wallet, g.hour, g.dose, g.wild.denLeft, g.wild.flockLeft, g.wild.outpost.left, g.marcoPaid, g.mode]).toEqual([REAL, 9.25, 12, 1, 4, 5, 1000, 'survival']);
      expect(g.flags.has('m1_done') && g.flags.has('safe_open') && g.flags.has('begun')).toBe(true);
      expect(g.hotbar.slots[20]).toMatchObject({ count: 7 });
    }
  });

  it('a save from a newer build, pasted in or stored, is refused and nothing is written over', async () => {
    const store = browserStore(), pending = memoryPending();
    const newer = { ...valley(REAL), version: 99, somethingNew: true };
    await store.set(SAVE_KEY, new TextEncoder().encode(JSON.stringify(newer)));
    const before = await store.get(SAVE_KEY);
    const p = await openPage(store, pending);
    p.in.ready = true; play(p, 5); p.in.edited(); play(p, 5); p.in.pause(); hide(); await settle(p);
    await p.in.newGame(); await settle(p);
    expect(await store.get(SAVE_KEY)).toEqual(before);
    expect(pending.bytes).toBeNull();
  });
});

describe('HOLDS · the hand-over, when it is whole and whose it says', () => {
  it('a hand-over that is not a whole save is ignored; the stored valley opens', async () => {
    const store = browserStore();
    await store.set(SAVE_KEY, await encodeSave(valley(REAL)));
    for (const handover of [{}, { format: SAVE_FORMAT }, { format: SAVE_FORMAT, version: 3, player: {} }, { ...valley(5), hotbar: 'x' }, { ...valley(5), version: 99 }, 'x', 7, []]) {
      const p: Page = await openPage(store, memoryPending(), { handover });
      expect(p.game.wallet).toBe(REAL);
    }
  });
});
