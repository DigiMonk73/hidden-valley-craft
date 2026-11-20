// Stand-ins for the parts of the game that need a browser (the picture, the screens, sound, the mouse), so the
// real `Game` class can be built and run in Node. A test file mocks each module with these:
//
//   vi.mock('../src/render/renderer.ts', async () => (await import('./game/stubs.ts')).rendererModule);
//   … (see tests/game/harness.ts for the list)

import type { Stack } from '../../src/sim/inventory.ts';

/** Any method not written out below does nothing. (Values that are read, not called, must be written out.) */
function blank<T extends object>(own: T): T {
  const nothing = () => undefined;
  return new Proxy(own, { get: (t, k, r) => (k in t ? Reflect.get(t, k, r) : nothing) });
}

export class FakeRenderer {
  camera = { position: { x: 0, y: 0, z: 0, set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; } }, rotation: { set() {} } };
  particles = blank({ fireflies: () => 0, morphos: () => 0 });
  creatures = blank({});
  stats = { chunks: 0, quads: 0 };
  gl = { info: { render: { calls: 0 } }, domElement: { width: 0, height: 0 } };
  contextLost = false;
  antialias = true;
  constructor() { return blank(this); }
}
export const rendererModule = { Renderer: FakeRenderer };

export interface Trade {
  title: string; say: string; wallet: string; sellHead?: string | null; buyHead?: string;
  buy: { label: string; price: string; can: boolean; act: () => string }[];
  sell: { label: string; price: string; can: boolean; act: () => string }[];
}

export class FakeHud {
  static last: FakeHud | null = null;
  toasts: string[] = [];
  status = '';
  statusWarn = false;
  blocked: string | null = null;
  backup: string | null = null;
  menuShown = true;
  loadingText = '';
  debugVisible = false;
  settingsInputs = { rd: { value: '8' }, sens: { value: '1' }, inv: { checked: false }, vol: { value: '0.8' } };
  actions: Record<string, (...a: never[]) => unknown>;
  constructor(_ui: unknown, actions: Record<string, (...a: never[]) => unknown>) {
    this.actions = actions;
    FakeHud.last = this;
    return blank(this);
  }
  toast(text: string) { this.toasts.push(text); }
  setSaveStatus(text: string, warn: boolean) { this.status = text; this.statusWarn = warn; }
  setBlocked(why: string | null) { this.blocked = why; }
  setBackup(when: string | null) { this.backup = when; }
  showMenu(show: boolean) { this.menuShown = show; }
  setLoadingText(t: string) { this.loadingText = t; }
  mode = '';
  canChooseMode = false;
  showMode(mode: string, canChoose: boolean) { this.mode = mode; this.canChooseMode = canChoose; }
  goal: string | null = null;
  setGoal(text: string | null) { this.goal = text; }
  introCards: string[] = [];
  /** The opening is read at once here: the cards are kept for the test to look at, and play begins. */
  showIntro(cards: string[], done: () => void) { this.introCards = cards; done(); }
  chipText = '';
  setChip(text: string) { this.chipText = text; }
  /** The settings as the menu was last told to show them. */
  shownSettings: Record<string, unknown> | null = null;
  showSettings(s: Record<string, unknown>) { this.shownSettings = { ...s }; }
  notices: string[] = [];
  notice(text: string | null) { if (text) this.notices.push(text); }
}
export const hudModule = { Hud: FakeHud, VIEW_CHUNKS: [4, 5, 7, 8, 10, 12], nearestViewChunks: (n: number) => n };

export class FakeScreen {
  isOpen = false;
  held: Stack | null = null;
  known: Set<string> = new Set();
  onChange: () => void = () => {};
  onMake: (r: unknown) => void = () => {};
  onFull: () => void = () => {};
  opened: unknown[] = [];
  constructor() { return blank(this); }
  open(...a: unknown[]) { this.isOpen = true; this.opened.push(a); }
  close() { this.isOpen = false; return true; }
}
export const screenModule = { InventoryScreen: FakeScreen };

export class FakePaper {
  static last: FakePaper | null = null;
  isOpen = false;
  /** The last trade screen shown: a function giving its rows as they are now. */
  tradeView: (() => Trade) | null = null;
  computerRows: [string, string, string?][] = [];
  phoneRows: { name: string; status: string; call?: () => string }[] = [];
  constructor() { FakePaper.last = this; return blank(this); }
  trade(view: () => Trade) { this.isOpen = true; this.tradeView = view; }
  computerActions: { label: string; act: () => void }[] = [];
  computer(rows: [string, string, string?][], _title?: string, actions: { label: string; act: () => void }[] = []) { this.isOpen = true; this.computerRows = rows; this.computerActions = actions; }
  /** The uplink page as last shown, and the closing card's button. */
  uplinkView: import('../../src/ui/uplinkScreen.ts').UplinkView | null = null;
  endingBack: (() => void) | null = null;
  shown: string[] = [];
  /** What putting the open screen down does (the uplink's first answer is read). */
  putDown: (() => void) | null = null;
  uplink(v: import('../../src/ui/uplinkScreen.ts').UplinkView) { this.isOpen = true; this.uplinkView = v; this.shown.push('uplink'); this.putDown = null; }
  ending(back: () => void) { this.isOpen = true; this.endingBack = back; this.shown.push('ending'); this.putDown = null; }
  phone(_title: string, rows: { name: string; status: string; call?: () => string }[]) { this.isOpen = true; this.phoneRows = rows; }
  journal() { this.isOpen = true; }
  map() { this.isOpen = true; }
  keypad() { this.isOpen = true; }
  close() { this.isOpen = false; const f = this.putDown; this.putDown = null; f?.(); }
}
export const paperModule = { PaperScreen: FakePaper };

export class FakeSound {
  started = false;
  muted = false;
  volume = 0.8;
  constructor() { return blank(this); }
}
export const audioModule = { Sound: FakeSound, materialOf: () => 'stone' };

export class FakeLook {
  mode: 'off' | 'locked' | 'free' = 'off';
  sensitivity = 0.0022;
  invertY = false;
  onDelta: (dx: number, dy: number) => void = () => {};
  onNotice: (t: string) => void = () => {};
  onModeChange: (m: string) => void = () => {};
  constructor() { return blank(this); }
  engage() { this.mode = 'locked'; }
  release() { this.mode = 'off'; }
}
export const lookModule = { Look: FakeLook };

export const iconsModule = { iconFor: () => '' };
export const mapModule = { drawMap: () => null, drawMapScrap: () => null };

/** What the next `tabLock` call answers, and the callbacks waiting for the other tab to go. */
export const tab = { answer: 'held' as 'held' | 'taken' | 'unsupported', freed: [] as (() => void)[] };
export const tablockModule = {
  tabLock: async (_name: string, onFreed: () => void) => { if (tab.answer === 'taken') tab.freed.push(onFreed); return tab.answer; },
};
