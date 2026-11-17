import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Look } from '../src/platform/look.ts';

// A stand-in for the browser's document and canvas, enough for mouse capture.
class FakeDoc extends EventTarget {
  pointerLockElement: unknown = null;
  exitPointerLock(): void { this.pointerLockElement = null; this.dispatchEvent(new Event('pointerlockchange')); }
}

let doc: FakeDoc;
beforeEach(() => {
  vi.useFakeTimers();
  doc = new FakeDoc();
  (globalThis as unknown as { document: FakeDoc }).document = doc;
});
afterEach(() => vi.useRealTimers());

function canvas(onRequest: () => unknown) {
  return { style: {} as Record<string, string>, requestPointerLock: vi.fn(onRequest) } as unknown as HTMLCanvasElement & { requestPointerLock: ReturnType<typeof vi.fn> };
}

describe('mouse capture', () => {
  it('a capture that arrives late does not block capture for the rest of the session', () => {
    const c = canvas(() => undefined);
    const look = new Look(c);
    look.engage();
    vi.advanceTimersByTime(800);
    expect(look.mode).toBe('free'); // nothing answered in time: look freely meanwhile
    doc.pointerLockElement = c;
    doc.dispatchEvent(new Event('pointerlockchange'));
    expect(look.mode).toBe('captured');
    doc.exitPointerLock();
    look.engage();
    expect(c.requestPointerLock).toHaveBeenCalledTimes(2);
  });

  it('a refusal right after Esc asks for a click instead of switching to free-look', () => {
    const c = canvas(() => undefined);
    const look = new Look(c);
    const notices: string[] = [];
    look.onNotice = (t) => notices.push(t);
    look.engage();
    doc.pointerLockElement = c;
    doc.dispatchEvent(new Event('pointerlockchange'));
    doc.exitPointerLock();
    look.engage();
    doc.dispatchEvent(new Event('pointerlockerror'));
    expect(look.mode).toBe('off');
    expect(look.captureBlocked).toBe(false);
    expect(notices.length).toBe(1);
  });

  it('a page that refuses capture outright falls back to free-look', () => {
    const c = canvas(() => { throw new Error('blocked'); });
    const look = new Look(c);
    look.engage();
    expect(look.mode).toBe('free');
    expect(look.captureBlocked).toBe(true);
  });
});
