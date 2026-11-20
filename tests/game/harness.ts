// Builds the real `Game` in Node, with the browser's parts stubbed (tests/game/stubs.ts), a store in memory and a
// close-time copy in memory. The test file must mock the browser modules first: copy the block below into it.
//
//   vi.mock('../src/render/renderer.ts', async () => (await import('./game/stubs.ts')).rendererModule);
//   vi.mock('../src/ui/hud.ts', async () => (await import('./game/stubs.ts')).hudModule);
//   vi.mock('../src/ui/inventoryScreen.ts', async () => (await import('./game/stubs.ts')).screenModule);
//   vi.mock('../src/ui/paperScreen.ts', async () => (await import('./game/stubs.ts')).paperModule);
//   vi.mock('../src/audio/audio.ts', async () => (await import('./game/stubs.ts')).audioModule);
//   vi.mock('../src/platform/look.ts', async () => (await import('./game/stubs.ts')).lookModule);
//   vi.mock('../src/ui/icons.ts', async () => (await import('./game/stubs.ts')).iconsModule);
//   vi.mock('../src/ui/mapView.ts', async () => (await import('./game/stubs.ts')).mapModule);
//   vi.mock('../src/platform/tablock.ts', async () => (await import('./game/stubs.ts')).tablockModule);

import { Game, type BootOptions } from '../../src/game.ts';
import { MemoryStore, type PendingIo, type Store } from '../../src/platform/storage.ts';
import type { FakeHud, FakePaper, FakeScreen } from './stubs.ts';

type Listener = (e: Record<string, unknown>) => void;
const listeners = { window: new Map<string, Listener[]>(), document: new Map<string, Listener[]>() };
const doc = { hidden: false, addEventListener: (t: string, f: Listener) => { listeners.document.set(t, [...(listeners.document.get(t) ?? []), f]); } };

/** The globals `Game` reaches for. Safe to call more than once. */
export function fakeBrowser(): void {
  const g = globalThis as Record<string, unknown>;
  listeners.window.clear();
  listeners.document.clear();
  doc.hidden = false;
  g.window = {
    addEventListener: (t: string, f: Listener) => { listeners.window.set(t, [...(listeners.window.get(t) ?? []), f]); },
    setTimeout: (f: () => void, ms: number) => setTimeout(f, ms),
    self: null, top: null,
  };
  (g.window as Record<string, unknown>).self = (g.window as Record<string, unknown>).top = g.window;
  g.document = doc;
  g.requestAnimationFrame = () => 0;
}

/** Fires a browser event at the game's listeners (`'pagehide'`, `'visibilitychange'`, `'keydown'`…). */
export function fire(target: 'window' | 'document', type: string, e: Record<string, unknown> = {}): void {
  for (const f of listeners[target].get(type) ?? []) f({ preventDefault() {}, target: null, ...e });
}

/** The page is hidden (or shown again): what a browser does when the tab is closed or switched away from. */
export function hide(hidden = true): void {
  doc.hidden = hidden;
  fire('document', 'visibilitychange');
}

/** A place for the close-time copy that lives as long as the test wants: shared between "page loads". */
export function memoryPending(): PendingIo & { bytes: Uint8Array | null } {
  return {
    bytes: null,
    read() { return this.bytes; },
    write(b: Uint8Array) { this.bytes = b; return true; },
    clear() { this.bytes = null; },
  };
}

/** The game's private parts a test reaches into. */
export interface Inside {
  frame(now: number): void;
  tick(dt: number): void;
  resume(): void;
  pause(): void;
  save(announce: boolean): Promise<void>;
  saveNow(): void;
  newGame(): Promise<void>;
  openBackup(): Promise<void>;
  loadBytes(b: Uint8Array | null): Promise<void>;
  loadFromCode(code: string): Promise<void>;
  refreshCode(): Promise<void>;
  tickPlaces(): void;
  die(): void;
  edited(): void;
  playing: boolean;
  ready: boolean;
  booted: boolean;
  time: number;
  last: number;
  playTime: number;
  lastSave: number;
  cachedCode: string | null;
  unsaved: boolean;
  saving: boolean;
  keys: Set<string>;
  hud: FakeHud;
  paper: FakePaper;
  screen: FakeScreen;
}

export interface Page { game: Game; in: Inside; hud: FakeHud; store: Store; pending: ReturnType<typeof memoryPending> }

/** One "page load": a new Game on the given storage, booted. `test: false` by default, so it saves like the real page. */
export async function openPage(store: Store = browserStore(), pending = memoryPending(), opts: BootOptions = {}): Promise<Page> {
  fakeBrowser();
  const canvas = { clientWidth: 800, clientHeight: 600, addEventListener() {} };
  const game = new Game(canvas as unknown as HTMLCanvasElement, {} as HTMLElement, { renderChunks: 2, store, pending, ...opts });
  await game.boot();
  const inside = game as unknown as Inside;
  // The game took the real clock as its last frame: move the frames' clock past it, so time never runs backwards.
  clock = Math.max(clock, performance.now()) + 16;
  inside.last = clock;
  return { game, in: inside, hud: inside.hud, store, pending };
}

/** The frames' clock: it only ever goes forward, across every page a test opens. */
let clock = performance.now() + 1000;

/** Runs frames until the land round the player is in (generation runs on the main thread here). */
export async function loadLand(p: Page, limit = 4000): Promise<void> {
  for (let i = 0; i < limit && !p.in.ready; i++) {
    p.in.frame((clock += 16));
    await new Promise((r) => setImmediate(r)); // let the finished jobs' results arrive
  }
  if (!p.in.ready) throw new Error('the land never finished loading');
}

/** Plays for some seconds of game time: fixed steps, as the loop does. `frames` also runs the frame's own work (autosave). */
export function play(p: Page, seconds: number): void {
  p.in.playing = true;
  const frames = Math.ceil(seconds / 0.1);
  for (let i = 0; i < frames; i++) p.in.frame((clock += 100));
}

/** Lets pending promises (a save's compression, a store write) finish: waits until no save is under way. */
export async function settle(p?: Page): Promise<void> {
  for (let i = 0; i < 200; i++) {
    await new Promise((r) => setTimeout(r, 25));
    if (i >= 3 && !p?.in.saving) return;
  }
}

/** A store in memory that calls itself the browser's own, so the game treats it as a place that keeps saves. */
export function browserStore(): Store {
  const m = new MemoryStore();
  return { kind: 'indexeddb', get: (k) => m.get(k), set: (k, v) => m.set(k, v) };
}
