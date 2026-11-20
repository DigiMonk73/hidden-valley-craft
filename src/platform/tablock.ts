// One tab plays a valley at a time: the browser's Web Locks tell a second tab that the first is open.
// Where the page may not use them (an older browser, a sandboxed frame) the answer is "unsupported", and the
// save's own counter (src/save/keeper.ts) stops a stale tab from writing over a newer save instead.

export type TabLock = 'held' | 'taken' | 'unsupported';

type Locks = { request(name: string, opts: { ifAvailable?: boolean }, cb: (lock: unknown) => Promise<unknown> | void): Promise<unknown> };

/**
 * Takes the lock if it is free and holds it for as long as the page lives. If another tab has it, answers
 * "taken" and calls `onFreed` once that tab has gone and the lock is ours.
 */
export function tabLock(name: string, onFreed: () => void): Promise<TabLock> {
  return new Promise((resolve) => {
    try {
      const locks = (navigator as unknown as { locks?: Locks }).locks;
      if (!locks) { resolve('unsupported'); return; }
      const forever = () => new Promise<void>(() => {});
      locks.request(name, { ifAvailable: true }, (lock) => {
        if (lock) { resolve('held'); return forever(); }
        resolve('taken');
        locks.request(name, {}, () => { onFreed(); return forever(); }).catch(() => {});
      }).catch(() => resolve('unsupported'));
    } catch { resolve('unsupported'); }
  });
}
