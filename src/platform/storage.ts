// Key-value storage that never throws: IndexedDB if the page may use it, else localStorage, else
// memory only (the game then says saves must go to a file). The published page runs in a sandboxed
// frame where any of these can be blocked or wiped.

export interface Store {
  readonly kind: 'indexeddb' | 'localstorage' | 'memory';
  /**
   * True when this is a stand-in: the browser's main storage (IndexedDB) held the valley last time and could
   * not be opened now. The saved valley is untouched there; the game must say so, and never write over it.
   */
  degraded?: boolean;
  get(key: string): Promise<Uint8Array | null>;
  set(key: string, value: Uint8Array): Promise<boolean>;
  /** Like `get`, but tells a read that failed ('error') from a key that holds nothing (null). */
  getChecked?(key: string): Promise<Uint8Array | null | 'error'>;
}

export class MemoryStore implements Store {
  readonly kind = 'memory' as const;
  private m = new Map<string, Uint8Array>();
  async get(key: string) { return this.m.get(key) ?? null; }
  async set(key: string, value: Uint8Array) { this.m.set(key, value); return true; }
}

function toB64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export { toB64, fromB64 };

class LocalStore implements Store {
  readonly kind = 'localstorage' as const;
  async get(key: string) {
    try { const v = localStorage.getItem('hvb:' + key); return v ? fromB64(v) : null; } catch { return null; }
  }
  async set(key: string, value: Uint8Array) {
    try { localStorage.setItem('hvb:' + key, toB64(value)); return true; } catch { return false; }
  }
}

class IdbStore implements Store {
  readonly kind = 'indexeddb' as const;
  private db: IDBDatabase;
  constructor(db: IDBDatabase) { this.db = db; }
  getChecked(key: string): Promise<Uint8Array | null | 'error'> {
    return new Promise((resolve) => {
      try {
        const r = this.db.transaction('kv', 'readonly').objectStore('kv').get(key);
        r.onsuccess = () => resolve(r.result instanceof Uint8Array ? r.result : r.result ? new Uint8Array(r.result) : null);
        r.onerror = () => resolve('error');
      } catch { resolve('error'); }
    });
  }
  async get(key: string): Promise<Uint8Array | null> {
    const v = await this.getChecked(key);
    return v === 'error' ? null : v;
  }
  set(key: string, value: Uint8Array): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(value, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch { resolve(false); }
    });
  }
}

/** How long to wait for IndexedDB when nothing says a valley is kept there (a sandboxed frame may never answer). */
export const OPEN_WAIT_MS = 1500;
/** How long to wait when a valley IS kept there: a slow disk must not turn into a new game. */
export const OPEN_WAIT_KNOWN_MS = 20000;
/** Which storage the game last opened and could write to: read before the next open. */
const HOME_MARK = 'hvb:home';

function homeMark(): string | null {
  try { return localStorage.getItem(HOME_MARK); } catch { return null; }
}
/** Notes which kind of storage the valley is kept in, so a later slow or failed open is recognised for what it is. */
export function markHome(kind: Store['kind']): void {
  try { localStorage.setItem(HOME_MARK, kind); } catch { /* blocked */ }
}

function openIdb(waitMs: number): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (db: IDBDatabase | null) => { if (done) { db?.close(); return; } done = true; clearTimeout(timer); resolve(db); };
    const timer = setTimeout(() => finish(null), waitMs);
    try {
      const req = indexedDB.open('hidden-valley-blocks', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => finish(req.result);
      req.onerror = () => finish(null);
      // "blocked" only means another tab still has it open during an upgrade: keep waiting.
    } catch { finish(null); }
  });
}

/**
 * Opens the best storage this page is allowed, after checking a write actually sticks.
 * If the valley was last kept in IndexedDB, the open is given a long wait (`onSlow` fires after a moment, to
 * say "opening your save…"); if it still fails, the stand-in store is marked `degraded`.
 */
export async function openStore(onSlow?: () => void): Promise<Store> {
  const known = homeMark() === 'indexeddb';
  const slow = known && onSlow ? setTimeout(onSlow, 1200) : undefined;
  const db = await openIdb(known ? OPEN_WAIT_KNOWN_MS : OPEN_WAIT_MS);
  clearTimeout(slow);
  if (db) {
    const s = new IdbStore(db);
    // It opened and holds a write: from now on a slow open here is waited for, not taken for "no save".
    if (await s.set('probe', new Uint8Array([1]))) { markHome('indexeddb'); return s; }
  }
  let store: Store = new MemoryStore();
  try {
    localStorage.setItem('hvb:probe', '1');
    if (localStorage.getItem('hvb:probe') === '1') store = new LocalStore();
  } catch { /* blocked */ }
  if (known) store.degraded = true;
  return store;
}

// A last-moment copy for when the page closes: localStorage writes finish before the call returns,
// unlike IndexedDB's, so this survives a tab being closed mid-save. Read back at the next start.
// Each kind of store has its own copy, so a copy made beside one store can never replace a save in another.
const PENDING = 'hvb:pending-save';

export interface PendingIo {
  read(): Uint8Array | null;
  write(bytes: Uint8Array): boolean;
  clear(): void;
}

export function pendingFor(kind: Store['kind']): PendingIo {
  const key = `${PENDING}:${kind}`;
  // A page with no storage at all has nowhere to keep a copy.
  if (kind === 'memory') return { read: () => null, write: () => false, clear: () => {} };
  return {
    read() { try { const v = localStorage.getItem(key); return v ? fromB64(v) : null; } catch { return null; } },
    write(bytes) { try { localStorage.setItem(key, toB64(bytes)); return true; } catch { return false; } },
    clear() {
      try { localStorage.removeItem(key); localStorage.removeItem(PENDING); /* and the copy older builds left */ } catch { /* blocked */ }
    },
  };
}
