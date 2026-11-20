// Keeping the game smooth on a weaker computer (docs/REVIEW.md, E1; docs/PHASE9B.md, 1): a watch on the frame
// rate, and the ladder of lighter pictures it steps down. Pure: the game feeds it frames and applies what it says.

import { SCALES } from './settings.ts';

/** What the ladder changes: the render scale and the view distance (chunks). */
export interface Picture { scale: number; view: number }

/**
 * The next lighter picture, or null when there is none. Softness first (it costs least to look at), then the
 * view down to 224 m (the whole valley still at full detail), then softer again, then the short views.
 */
export function lighter(p: Picture): Picture | null {
  if (p.scale > SCALES[1]) return { ...p, scale: SCALES[1] };
  if (p.view > 7) return { ...p, view: 7 };
  if (p.scale > SCALES[2]) return { ...p, scale: SCALES[2] };
  if (p.view > 5) return { ...p, view: 5 };
  if (p.view > 4) return { ...p, view: 4 };
  return null;
}

/** Said when the picture is made lighter by itself. */
export function lighterLine(from: Picture, to: Picture): string {
  const what = to.scale < from.scale ? 'the picture is a little softer' : `the view is shorter (${to.view * 32} m)`;
  return `Running slowly, so ${what} now. Settings (Esc) can put it back, or stop this.`;
}

/** Below this many frames a second the game is "running slowly". (Not 30: a screen held at 30 must not trip it.) */
export const SLOW_FPS = 27;
/** The rate is judged over windows this long; this many slow ones in a row make the picture lighter. */
export const WINDOW_S = 4;
export const SLOW_WINDOWS = 2;
/** After a change (the watch's own, or the player's), frames are not judged for this long: the change itself costs frames. */
export const GRACE_S = 6;
/** A gap this long between frames is not slowness: the tab was hidden, or the page stalled once. The window starts again. */
export const STALL_S = 2;

export class FrameWatch {
  private t = 0;
  private frames = 0;
  private slow = 0;
  private grace = GRACE_S;

  /** Start over, with a grace period: after the player changes the picture, after play begins. */
  reset(): void { this.t = 0; this.frames = 0; this.slow = 0; this.grace = GRACE_S; }

  /**
   * One frame of play, `dt` seconds after the last (not clamped). True when the game has run slowly long enough
   * that the picture should be made lighter; the watch then starts over by itself.
   */
  frame(dt: number): boolean {
    if (!(dt > 0)) return false;
    if (dt > STALL_S) { this.t = 0; this.frames = 0; return false; }
    if (this.grace > 0) { this.grace -= dt; return false; }
    this.t += dt;
    this.frames++;
    if (this.t < WINDOW_S) return false;
    const fps = this.frames / this.t;
    this.t = 0; this.frames = 0;
    if (fps >= SLOW_FPS) { this.slow = 0; return false; }
    if (++this.slow < SLOW_WINDOWS) return false;
    this.reset();
    return true;
  }
}
