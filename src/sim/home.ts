// The way home if you get lost (the lead, for the owner, 2026-11-18): hold H for two seconds and you are
// back where you wake (the bed if you slept, else the balcony). Letting go or being hurt cancels it, and it
// won't start within ten seconds of being hurt, so it is never a way out of a fight. Nothing is lost and the
// time of day stays as it is. In builder's mode, flying, it is at once. Pure: the game feeds it time.

export const HOME_HOLD = 2;
export const HOME_DANGER = 10;

export type HomeEvent = 'started' | 'danger' | 'go' | 'cancelled';

export class HomeKey {
  /** Seconds H has been held toward going home, or null when not heading home. */
  held: number | null = null;

  /** 0–1 for the bar while heading home, else null. */
  get progress(): number | null { return this.held === null ? null : Math.min(1, this.held / HOME_HOLD); }

  /**
   * H pressed. `sinceHurt`: seconds since the player last took damage. `instant`: flying in builder's mode.
   * Returns 'go' (at once), 'started', or 'danger' (refused: hurt too recently).
   */
  press(sinceHurt: number, instant: boolean): HomeEvent {
    if (instant) { this.held = null; return 'go'; }
    if (sinceHurt < HOME_DANGER) { this.held = null; return 'danger'; }
    if (this.held === null) this.held = 0;
    return 'started';
  }

  /** A step while heading home: H still down? hurt this step? Returns 'go' when the hold is done. */
  update(dt: number, down: boolean, hurt: boolean): HomeEvent | null {
    if (this.held === null) return null;
    if (!down || hurt) { this.held = null; return 'cancelled'; }
    this.held += dt;
    if (this.held >= HOME_HOLD) { this.held = null; return 'go'; }
    return null;
  }

  cancel(): void { this.held = null; }
}
