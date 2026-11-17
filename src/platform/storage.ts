// Key-value storage that never throws: IndexedDB if the page may use it, else localStorage, else
// memory only (the game then says saves must go to a file). The published page runs in a sandboxed
// frame where any of these can be blocked or wiped.

export interface Store {
  readonly kind: 'indexeddb' | 'localstorage' | 'memory';
  get(key: string): Promise<Uint8Array | null>;
  set(key: string, value: Uint8Array): Promise<boolean>;
}

class MemoryStore implements Store {
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
  get(key: string): Promise<Uint8Array | null> {
    return new Promise((resolve) => {
      try {
        const r = this.db.transaction('kv', 'readonly').objectStore('kv').get(key);
        r.onsuccess = () => resolve(r.result instanceof Uint8Array ? r.result : r.result ? new Uint8Array(r.result) : null);
        r.onerror = () => resolve(null);
      } catch { resolve(null); }
    });
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

function openIdb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 1500);
    try {
      const req = indexedDB.open('hidden-valley-blocks', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => { clearTimeout(timer); resolve(req.result); };
      req.onerror = () => { clearTimeout(timer); resolve(null); };
      req.onblocked = () => { clearTimeout(timer); resolve(null); };
    } catch { clearTimeout(timer); resolve(null); }
  });
}

/** Opens the best storage this page is allowed, after checking a write actually sticks. */
export async function openStore(): Promise<Store> {
  const db = await openIdb();
  if (db) {
    const s = new IdbStore(db);
    if (await s.set('probe', new Uint8Array([1]))) return s;
  }
  try {
    localStorage.setItem('hvb:probe', '1');
    if (localStorage.getItem('hvb:probe') === '1') return new LocalStore();
  } catch { /* blocked */ }
  return new MemoryStore();
}

// A last-moment copy for when the page closes: localStorage writes finish before the call returns,
// unlike IndexedDB's, so this survives a tab being closed mid-save. Read back at the next start.
const PENDING = 'hvb:pending-save';

export function writePending(bytes: Uint8Array): boolean {
  try { localStorage.setItem(PENDING, toB64(bytes)); return true; } catch { return false; }
}

export function readPending(): Uint8Array | null {
  try { const v = localStorage.getItem(PENDING); return v ? fromB64(v) : null; } catch { return null; }
}

export function clearPending(): void {
  try { localStorage.removeItem(PENDING); } catch { /* blocked */ }
}
