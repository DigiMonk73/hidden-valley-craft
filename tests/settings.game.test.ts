// Settings on the real `Game` (docs/PHASE9B.md, 1 and 2): kept across sessions, applied at boot, and the picture
// made lighter by itself on a computer that can't keep up.

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

import { openPage, memoryPending, browserStore, settle, type Page } from './game/harness.ts';
import { DEFAULT_SETTINGS, parseSettings, encodeSettings, FALLBACK_VIEW, type Settings } from '../src/game/settings.ts';
import { GRACE_S, WINDOW_S, SLOW_WINDOWS } from '../src/game/quality.ts';

vi.setConfig({ testTimeout: 120_000 });

const stored = async (p: Page): Promise<Settings> => parseSettings(await p.store.get('settings'));
const act = (p: Page, name: string, v: unknown): void => { (p.hud.actions[name] as (v: unknown) => void)(v); };
/** The game's inner parts these tests look at. */
const inner = (p: Page) => p.game as unknown as { streamer: { radius: number }; look: { sensitivity: number; invertY: boolean }; sound: { volume: number }; renderer: Record<string, unknown>; watchFrames(gap: number): void; playing: boolean; ready: boolean };

const g = globalThis as unknown as { localStorage?: unknown };
afterEach(() => { delete g.localStorage; });
/** A browser's simplest storage, for the hint read before the picture is made. */
function fakeLocal(): Map<string, string> {
  const m = new Map<string, string>();
  g.localStorage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  return m;
}

describe('settings are kept across sessions', () => {
  it('every setting changed in the menu is there when the page is opened again, and is applied', async () => {
    const store = browserStore(), pending = memoryPending();
    const a = await openPage(store, pending, { renderChunks: undefined });
    act(a, 'setSensitivity', 1.8);
    act(a, 'setInvertY', true);
    act(a, 'setVolume', 0.25);
    act(a, 'setScale', 0.5);
    act(a, 'setAntialias', false);
    act(a, 'setAuto', false);
    act(a, 'setRenderDistance', 4);
    await settle(a);
    const want: Settings = { rd: 4, rdOwn: true, sens: 1.8, inv: true, vol: 0.25, scale: 0.5, aa: false, auto: false };
    expect(await stored(a)).toEqual(want);

    const b = await openPage(store, pending, { renderChunks: undefined });
    expect(b.game.settings).toEqual(want);
    expect(inner(b).streamer.radius).toBe(4);
    expect(inner(b).look.sensitivity).toBeCloseTo(0.0022 * 1.8, 9);
    expect(inner(b).look.invertY).toBe(true);
    expect(inner(b).sound.volume).toBe(0.25);
    // And the menu shows them.
    expect(b.hud.shownSettings).toEqual(want);
  });

  it('settings saved by version 13 are kept, and the new ones start at their defaults', async () => {
    const store = browserStore();
    await store.set('settings', new TextEncoder().encode(JSON.stringify({ rd: 12, sens: 0.7, inv: false, vol: 1 })));
    const p = await openPage(store, memoryPending(), { renderChunks: undefined });
    // (No worker starts in these tests, so the view is the short one of a page that builds its land itself: below.)
    expect(p.game.settings).toEqual({ ...DEFAULT_SETTINGS, rd: 12, sens: 0.7, vol: 1 });
    expect(inner(p).streamer.radius).toBe(FALLBACK_VIEW);
    expect(p.hud.shownSettings).toMatchObject({ rd: FALLBACK_VIEW, sens: 0.7 });
    // Another setting changed on this page does not write the shortened view over theirs.
    act(p, 'setVolume', 0.9);
    await settle(p);
    expect(await stored(p)).toMatchObject({ rd: 12, rdOwn: false, vol: 0.9 });
    expect(p.hud.shownSettings).toMatchObject({ rd: FALLBACK_VIEW, vol: 0.9 });
    expect(inner(p).look.sensitivity).toBeCloseTo(0.0022 * 0.7, 9);
  });

  it('settings that cannot be read are the defaults, and the game starts', async () => {
    const store = browserStore();
    await store.set('settings', new TextEncoder().encode('{{{'));
    const p = await openPage(store);
    expect(p.game.settings.sens).toBe(1);
    expect(p.in.booted).toBe(true);
  });

  it('a store that refuses the write does not stop the game', async () => {
    const store = browserStore();
    const p = await openPage(store);
    store.set = async () => { throw new Error('quota'); };
    act(p, 'setVolume', 0.1);
    await settle(p);
    expect(inner(p).sound.volume).toBe(0.1);
  });

  it('smooth edges are remembered where the page can read them before the picture is made', async () => {
    const local = fakeLocal();
    const store = browserStore();
    const a = await openPage(store);
    expect(local.get('hvb:hint:aa')).toBe('on');
    act(a, 'setAntialias', false);
    expect(local.get('hvb:hint:aa')).toBe('off');
    expect(a.hud.toasts.join(' ')).toMatch(/next time the page is opened/);
    // A browser that lost the hint (its site data half cleared) gets it back from the settings at the next start.
    await settle(a);
    local.clear();
    await openPage(store);
    expect(local.get('hvb:hint:aa')).toBe('off');
  });

  it('a test address’s view distance is used for that page and not kept', async () => {
    const store = browserStore();
    await store.set('settings', encodeSettings({ ...DEFAULT_SETTINGS, rd: 10, rdOwn: true }));
    const p = await openPage(store, memoryPending(), { renderChunks: 2 });
    expect(inner(p).streamer.radius).toBe(2);
    act(p, 'setVolume', 0.5);
    await settle(p);
    expect((await stored(p)).rd).toBe(10);
  });
});

describe('where the page builds the land itself (workers blocked)', () => {
  it('the view is kept short, and the player is told when play begins', async () => {
    const p = await openPage(browserStore(), memoryPending(), { renderChunks: undefined });
    expect(p.game.exec.kind).toBe('main-thread');
    expect(inner(p).streamer.radius).toBe(FALLBACK_VIEW);
    p.in.ready = true;
    p.in.resume();
    expect(p.hud.notices.join(' ')).toMatch(/view is kept short \(160 m\)/);
    // Shortening it for this page is not the player's choice: it is not written over their setting.
    await settle(p);
    expect(await p.store.get('settings')).toBeFalsy();
  });

  it('unless the player chose a view: then theirs is used and nothing is said', async () => {
    const store = browserStore();
    await store.set('settings', encodeSettings({ ...DEFAULT_SETTINGS, rd: 8, rdOwn: true }));
    const p = await openPage(store, memoryPending(), { renderChunks: undefined });
    expect(inner(p).streamer.radius).toBe(8);
    p.in.ready = true;
    p.in.resume();
    expect(p.hud.notices.join(' ')).not.toMatch(/kept short/);
  });
});

describe('the picture is made lighter by itself when the game runs slowly', () => {
  /** A page being played, the view the player's own choice; frames are fed straight to the watch. */
  async function playing(s: Partial<Settings> = {}): Promise<Page> {
    const store = browserStore();
    await store.set('settings', encodeSettings({ ...DEFAULT_SETTINGS, rd: 8, rdOwn: true, ...s }));
    const p = await openPage(store, memoryPending(), { renderChunks: undefined });
    inner(p).ready = true;
    inner(p).playing = true;
    return p;
  }
  const slowFor = (p: Page, seconds: number, fps = 12): void => { for (let i = 0; i < seconds * fps; i++) inner(p).watchFrames(1 / fps); };
  const step = GRACE_S + WINDOW_S * SLOW_WINDOWS + 1;

  it('at 12 frames a second: softer, then 224 m, then softer, then 160 m, then 128 m; each said, each kept', async () => {
    const p = await playing();
    const seen: string[] = [];
    for (let k = 0; k < 7; k++) {
      slowFor(p, step);
      seen.push(`${p.game.settings.scale}@${inner(p).streamer.radius}`);
    }
    expect(seen).toEqual(['0.75@8', '0.75@7', '0.5@7', '0.5@5', '0.5@4', '0.5@4', '0.5@4']);
    expect(p.hud.toasts.filter((t) => /Running slowly/.test(t)).length).toBe(5);
    expect(p.hud.shownSettings).toMatchObject({ scale: 0.5, rd: 4 });
    await settle(p);
    expect(await stored(p)).toMatchObject({ scale: 0.5, rd: 4 });
  });

  it('where the page keeps the view short by itself (workers blocked), a shorter view is for that page only (the fresh review, 2)', async () => {
    const store = browserStore();
    await store.set('settings', encodeSettings({ ...DEFAULT_SETTINGS, rd: 8 }));
    const p = await openPage(store, memoryPending(), { renderChunks: undefined });
    expect(p.game.exec.kind).toBe('main-thread');
    inner(p).ready = true;
    inner(p).playing = true;
    for (let k = 0; k < 4; k++) slowFor(p, step);
    expect(`${p.game.settings.scale}@${inner(p).streamer.radius}`).toBe('0.5@4');
    expect(p.hud.shownSettings).toMatchObject({ scale: 0.5, rd: 4 }); // the menu shows what is drawn
    await settle(p);
    expect(await stored(p)).toMatchObject({ scale: 0.5, rd: 8 }); // the softness is kept; the view kept is still theirs
  });

  it('at 60 frames a second nothing changes', async () => {
    const p = await playing();
    slowFor(p, 120, 60);
    expect(p.game.settings).toMatchObject({ scale: 1, rd: 8 });
    expect(p.hud.toasts.filter((t) => /Running slowly/.test(t))).toEqual([]);
  });

  it('turned off in Settings, nothing changes however slow', async () => {
    const p = await playing({ auto: false });
    slowFor(p, 200);
    expect(p.game.settings).toMatchObject({ scale: 1, rd: 8 });
  });

  it('not while paused or loading, and a change by the player starts the wait again', async () => {
    const p = await playing();
    inner(p).playing = false;
    slowFor(p, 100);
    expect(p.game.settings.scale).toBe(1);
    inner(p).playing = true;
    inner(p).ready = false;
    slowFor(p, 100);
    expect(p.game.settings.scale).toBe(1);
    inner(p).ready = true;
    slowFor(p, step - 3);
    act(p, 'setScale', 1); // the player touches the picture just before it would drop
    slowFor(p, step - 3);
    expect(p.game.settings.scale).toBe(1);
    slowFor(p, 4);
    expect(p.game.settings.scale).toBe(0.75);
  });

  it('never on a test address that fixes the view (the play-through draws 2–4 frames a second)', async () => {
    const p = await openPage(browserStore(), memoryPending(), { renderChunks: 4 });
    inner(p).ready = true; inner(p).playing = true;
    slowFor(p, 200, 3);
    expect(p.game.settings.scale).toBe(1);
    expect(inner(p).streamer.radius).toBe(4);
  });
});
