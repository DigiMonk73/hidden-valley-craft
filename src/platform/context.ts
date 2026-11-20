// The browser can take the picture away: the graphics driver restarts, the machine wakes from
// sleep, or too many pages draw at once. The canvas is then told its WebGL context is lost, and
// later, if the loss was not refused, that it is back. Nothing can be drawn in between.
//
// This watches for both, and for a loss that lasts. Where the events never come (or the canvas
// can't be listened to), nothing happens and the game goes on as before.

export interface ContextWatch {
  /** True from the loss until the context is back. */
  readonly lost: boolean;
}

export interface ContextEvents {
  onLost: () => void;
  onRestored: () => void;
  /** The context has stayed lost for `stuckMs`: it may never come back by itself. */
  onStuck: () => void;
}

type Listenable = { addEventListener(type: string, listener: (e: Event) => void): void };

/** How long a loss may last before it is called stuck. A restore usually takes a second or two. */
export const STUCK_MS = 15_000;

export function watchContext(canvas: Listenable, events: ContextEvents, stuckMs = STUCK_MS): ContextWatch {
  const state = { lost: false };
  let timer: ReturnType<typeof setTimeout> | null = null;
  // One failing listener must not keep the other handlers of the same event from running.
  const tell = (fn: () => void): void => { try { fn(); } catch (e) { console.error(e); } };
  try {
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault(); // without this the browser never gives the context back
      if (state.lost) return;
      state.lost = true;
      timer = setTimeout(() => { timer = null; if (state.lost) tell(events.onStuck); }, stuckMs);
      tell(events.onLost);
    });
    canvas.addEventListener('webglcontextrestored', () => {
      state.lost = false;
      if (timer !== null) { clearTimeout(timer); timer = null; }
      tell(events.onRestored);
    });
  } catch (e) {
    console.warn('The picture can’t be watched for loss here:', e);
  }
  return state;
}
