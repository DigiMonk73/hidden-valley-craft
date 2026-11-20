// The page's keys, mouse buttons and wheel, and the page being hidden or left: the browser's events, turned into
// plain calls. What each key does is the game's (src/game.ts); this is only where the page is listened to, so
// that the game no longer touches `window` and `document` for its input (docs/FIXES.md, 8, item 4; PHASE9B.md, 8).

export interface InputHandlers {
  /** A key went down (`repeat`: held, not a fresh press). Not called while typing in a text field. */
  key(code: string, repeat: boolean): void;
  keyUp(code: string): void;
  /** The page lost the keyboard: every key counts as let go. */
  blur(): void;
  /** A mouse button went down over the picture (0 left, 2 right). */
  press(button: number): void;
  /** A mouse button went up anywhere. */
  release(button: number): void;
  /** The wheel turned over the picture; true if it was used (the page then does not scroll). */
  wheel(down: boolean): boolean;
  /** The page went out of sight, or came back. */
  hidden(): void;
  shown(): void;
  /** The page is being left (closed, reloaded, navigated away). */
  leaving(): void;
}

/** Keys whose browser meaning (scrolling, moving focus, the F3 search) is never wanted while the game has the page. */
const KEPT = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'F3'];

export function listenInput(canvas: HTMLCanvasElement, h: InputHandlers): void {
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
    if (KEPT.includes(e.code)) e.preventDefault();
    h.key(e.code, e.repeat === true);
  });
  window.addEventListener('keyup', (e) => h.keyUp(e.code));
  window.addEventListener('blur', () => h.blur());
  canvas.addEventListener('mousedown', (e) => h.press(e.button));
  window.addEventListener('mouseup', (e) => h.release(e.button));
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => { if (h.wheel(e.deltaY > 0)) e.preventDefault(); }, { passive: false });
  document.addEventListener('visibilitychange', () => (document.hidden ? h.hidden() : h.shown()));
  window.addEventListener('pagehide', () => h.leaving());
}
