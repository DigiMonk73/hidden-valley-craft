// Focus mode (docs/PHASE5.md, step 4): DESIGN.md's optional "time-slow, pick shots". With a gun or bow in
// hand, press Q: for up to four seconds the world runs at a quarter speed while you aim at full speed.
// Then it needs twelve seconds to come back. Pure: the game feeds it real seconds and reads its scale.

export const FOCUS_SECONDS = 4;
export const FOCUS_RECHARGE = 12;
export const FOCUS_SCALE = 0.25;

export class Focus {
  /** Seconds of focus left to use (full when rested). */
  left = FOCUS_SECONDS;
  active = false;

  /** How fast the world runs now: a quarter while focused, else full. */
  get scale(): number { return this.active ? FOCUS_SCALE : 1; }
  /** 0 … 1: what is left while focused, or how far it has come back. */
  get level(): number { return this.left / FOCUS_SECONDS; }
  get ready(): boolean { return !this.active && this.left >= FOCUS_SECONDS; }

  /** Q pressed: start (if rested), or end early. Returns true if focus is now on. */
  toggle(): boolean {
    if (this.active) { this.active = false; return false; }
    if (!this.ready) return false;
    this.active = true;
    return true;
  }

  /** Real seconds pass. Returns 'ended' the step focus runs out. */
  update(dt: number): 'ended' | null {
    if (this.active) {
      this.left = Math.max(0, this.left - dt);
      if (this.left <= 0) { this.active = false; return 'ended'; }
      return null;
    }
    this.left = Math.min(FOCUS_SECONDS, this.left + (dt * FOCUS_SECONDS) / FOCUS_RECHARGE);
    return null;
  }

  /** A shot of adrenaline (docs/PHASE8.md, 4): the meter is full again at once. */
  refill(): void { this.left = FOCUS_SECONDS; }

  /** Put the gun away, open a screen, die: focus ends at once. */
  stop(): void { this.active = false; }
}
