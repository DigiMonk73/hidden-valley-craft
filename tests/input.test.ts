// The page's input, listened to in src/platform/input.ts (docs/PHASE9B.md, 8): the browser's events become plain
// calls, and the page's own meaning of a key or the wheel is stopped only where the game uses it.
import { describe, it, expect, afterEach } from 'vitest';
import { listenInput, type InputHandlers } from '../src/platform/input.ts';

type L = (e: Record<string, unknown>) => void;
const g = globalThis as unknown as Record<string, unknown>;
const had = { window: g.window, document: g.document, HTMLTextAreaElement: g.HTMLTextAreaElement, HTMLInputElement: g.HTMLInputElement };
afterEach(() => { Object.assign(g, had); });

function page() {
  const on = { window: new Map<string, L>(), document: new Map<string, L>(), canvas: new Map<string, L>() };
  const doc = { hidden: false, addEventListener: (t: string, f: L) => on.document.set(t, f) };
  class TextArea {}
  class Input {}
  Object.assign(g, { window: { addEventListener: (t: string, f: L) => on.window.set(t, f) }, document: doc, HTMLTextAreaElement: TextArea, HTMLInputElement: Input });
  const canvas = { addEventListener: (t: string, f: L) => on.canvas.set(t, f) } as unknown as HTMLCanvasElement;
  const calls: string[] = [];
  let playing = true;
  const h: InputHandlers = {
    key: (c, r) => calls.push(`key ${c}${r ? ' repeat' : ''}`), keyUp: (c) => calls.push(`up ${c}`), blur: () => calls.push('blur'),
    press: (b) => calls.push(`press ${b}`), release: (b) => calls.push(`release ${b}`),
    wheel: (down) => { calls.push(`wheel ${down ? 'down' : 'up'}`); return playing; },
    hidden: () => calls.push('hidden'), shown: () => calls.push('shown'), leaving: () => calls.push('leaving'),
  };
  listenInput(canvas, h);
  const ev = (more: Record<string, unknown> = {}) => { const e = { prevented: false, preventDefault() { e.prevented = true; }, ...more }; return e; };
  return { on, doc, calls, ev, TextArea, setPlaying: (v: boolean) => { playing = v; } };
}

describe('the page’s input', () => {
  it('keys become calls; the page’s own Space, arrows, Tab and F3 are stopped, other keys are not; typing in a field is left alone', () => {
    const p = page();
    const space = p.ev({ code: 'Space' }), w = p.ev({ code: 'KeyW', repeat: true });
    p.on.window.get('keydown')!(space);
    p.on.window.get('keydown')!(w);
    p.on.window.get('keydown')!(p.ev({ code: 'KeyE', target: new p.TextArea() }));
    p.on.window.get('keyup')!({ code: 'KeyW' });
    expect([space.prevented, w.prevented]).toEqual([true, false]);
    expect(p.calls).toEqual(['key Space', 'key KeyW repeat', 'up KeyW']);
  });

  it('the wheel scrolls the page only when the game did not use it; the right button never opens the page’s menu', () => {
    const p = page();
    const used = p.ev({ deltaY: 3 });
    p.on.canvas.get('wheel')!(used);
    p.setPlaying(false);
    const unused = p.ev({ deltaY: -3 });
    p.on.canvas.get('wheel')!(unused);
    const menu = p.ev();
    p.on.canvas.get('contextmenu')!(menu);
    expect([used.prevented, unused.prevented, menu.prevented]).toEqual([true, false, true]);
    expect(p.calls).toEqual(['wheel down', 'wheel up']);
  });

  it('buttons, the page hidden and shown, the keyboard lost, the page left', () => {
    const p = page();
    p.on.canvas.get('mousedown')!({ button: 2 });
    p.on.window.get('mouseup')!({ button: 0 });
    p.doc.hidden = true; p.on.document.get('visibilitychange')!({});
    p.doc.hidden = false; p.on.document.get('visibilitychange')!({});
    p.on.window.get('blur')!({});
    p.on.window.get('pagehide')!({});
    expect(p.calls).toEqual(['press 2', 'release 0', 'hidden', 'shown', 'blur', 'leaving']);
  });
});
