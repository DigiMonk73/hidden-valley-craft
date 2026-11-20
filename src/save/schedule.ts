// When to save automatically: a few seconds after the player stops changing things, at least once
// a minute while there are changes or the game is simply being played (where you stand, your health and
// the hour are worth keeping too), and never again straight after a failed write.

export interface SaveClock {
  unsaved: boolean;
  /** Has the game been played since the last save, with or without an edit? */
  played?: boolean;
  saving: boolean;
  now: number; // seconds of play
  lastEdit: number;
  lastSave: number;
  lastFailure: number;
}

export const QUIET_SECONDS = 2.5;
export const MAX_GAP_SECONDS = 60;
export const RETRY_SECONDS = 60;

export function shouldAutosave(c: SaveClock): boolean {
  if (c.saving || (!c.unsaved && !c.played)) return false;
  if (c.now - c.lastFailure < RETRY_SECONDS) return false;
  if (!c.unsaved) return c.now - c.lastSave > MAX_GAP_SECONDS;
  return c.now - c.lastEdit > QUIET_SECONDS || c.now - c.lastSave > MAX_GAP_SECONDS;
}
