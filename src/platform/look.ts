// Turning the camera with the mouse. Normally the page captures the mouse (pointer lock), as games
// do. If the sandbox blocks that, the game falls back to turning with plain mouse movement (the
// cursor is hidden) and the arrow keys, and says so once.

export type LookMode = 'captured' | 'free' | 'off';

export class Look {
  mode: LookMode = 'off';
  /** Set once capture has failed: from then on clicks enter free-look instead. */
  captureBlocked = false;
  /** Capture worked at least once, so a later refusal is the browser's short cool-down after Esc. */
  private everCaptured = false;
  sensitivity = 0.0022;
  invertY = false;
  onDelta: (dx: number, dy: number) => void = () => {};
  onModeChange: (m: LookMode) => void = () => {};
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === canvas) { this.everCaptured = true; this.setMode('captured'); }
      else if (this.mode === 'captured') this.setMode('off');
    });
    document.addEventListener('pointerlockerror', () => this.fallBack());
    document.addEventListener('mousemove', (e) => {
      if (this.mode === 'off') return;
      const k = this.sensitivity * (this.mode === 'free' ? 1.4 : 1);
      this.onDelta(e.movementX * k, (this.invertY ? -1 : 1) * e.movementY * k);
    });
  }

  private setMode(m: LookMode): void {
    if (m === this.mode) return;
    this.mode = m;
    this.canvas.style.cursor = m === 'off' ? 'default' : 'none';
    this.onModeChange(m);
  }

  /** Called from a click: capture the mouse, or use free-look where capture is blocked. */
  engage(): void {
    if (this.captureBlocked) { this.setMode('free'); return; }
    let settled = false;
    const done = () => { settled = true; };
    document.addEventListener('pointerlockchange', done, { once: true });
    try {
      const r = (this.canvas.requestPointerLock as () => unknown)();
      if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => this.fallBack());
    } catch {
      this.fallBack();
      return;
    }
    // Some browsers neither lock nor report an error inside a sandboxed frame.
    setTimeout(() => { if (!settled && this.mode !== 'captured') this.fallBack(); }, 700);
  }

  release(): void {
    if (document.pointerLockElement) document.exitPointerLock();
    this.setMode('off');
  }

  private fallBack(): void {
    if (this.mode === 'captured') return;
    if (this.everCaptured) { this.setMode('off'); return; } // try again in a moment, not a sandbox block
    this.captureBlocked = true;
    this.setMode('free');
  }
}
