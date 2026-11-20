// Keeps the valley safe in the browser's storage. It decides which stored copy to open at the start, keeps a
// backup, numbers every write, and refuses to write when that would put an older valley over a newer one.
// It knows nothing of the game: it is handed a store, a place for the close-time copy, and snapshots.
//
// What is kept, by key:
//   save:1       the valley
//   save:backup  the valley left behind by New game, a load or "Open the backup": written only by those, so the
//                next page load can never write over it
//   save:previous  the valley as this session found it, before anything wrote over it (opened by itself if the
//                save cannot be read)
//   save:bad     bytes that were under save:1 and could not be read, kept aside rather than written over
//   save:head    who wrote save:1 last: { session, id, seq }
// and, in localStorage, a copy made as the page closes (IndexedDB may not finish a write by then).

import { encodeSave, encodeSaveNow, parseSave, type SaveData, type Unreadable } from './save.ts';
import { normaliseSave } from './state.ts';
import type { Store, PendingIo } from '../platform/storage.ts';

export const SAVE_KEY = 'save:1';
export const BACKUP_KEY = 'save:backup';
export const PREVIOUS_KEY = 'save:previous';
/** A write that has not answered in this long counts as failed (a store that hangs must not stop saving silently). */
export const WRITE_WAIT_MS = 30_000;
export const BAD_KEY = 'save:bad';
export const HEAD_KEY = 'save:head';

/** What a load found. `data` null: nothing usable, start a new valley. `note`: a plain line the player must see. */
export interface Loaded {
  data: SaveData | null;
  from: 'store' | 'closing-copy' | 'previous' | 'backup' | 'nothing';
  /** The valley the store itself holds and the number of its last write (null: none that can be read). */
  storedId: string | null;
  storedSeq: number;
  /** The copy opened is not what save:1 holds: it must be written there. */
  unsaved: boolean;
  note: string | null;
}

/** Why this page has stopped saving, or null while it saves. */
export type Stopped = null | 'other-tab' | 'newer-build' | 'store-error';

export type SaveResult = 'ok' | 'failed' | 'stopped' | 'overtaken';

export const NOTES = {
  closingCopy: 'Your stored save could not be read. The copy made as the page last closed has been opened instead.',
  backup: (when: string) => `Your save could not be read, so the copy${when ? ` from ${when}` : ''} kept beside it has been opened instead. The unreadable save is kept aside.`,
  notKept: 'The valley you are in could not be kept as the backup (this browser’s storage may be full or blocked), so nothing was changed.',
  fresh: 'Your save could not be read, so a fresh valley has been started. The unreadable save is kept aside in this browser.',
  newer: 'This valley was saved by a newer build of the game than this page. Reload the page to get the new build. Your save is untouched, and this page will not save over it.',
  storeError: 'The browser could not read your saved valley just now. Nothing has been lost: reload the page to try again. This page will not save, so it cannot write over it.',
  otherTab: 'This valley has been saved more recently from another tab or window. This one has stopped saving so it cannot write over that. Close this tab, or reload it to pick up the newer save.',
} as const;

const text = (b: Uint8Array | null) => (b ? new TextDecoder().decode(b) : null);
const bytesOf = (s: string) => new TextEncoder().encode(s);

function when(savedAt: string): string {
  const t = new Date(savedAt);
  return Number.isNaN(t.getTime()) ? '' : t.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export class Keeper {
  /** The valley open now, and the number of its last write. */
  id = '';
  seq = 0;
  stopped: Stopped = null;
  /** When the backup was saved (for the menu), or null if there is none. */
  backupWhen: string | null = null;
  private session = `${Date.now().toString(36)}-${Math.floor(Math.random() * 0x100000000).toString(36)}`;
  /** The head as this session found it. A head that differs, written by another session, means another tab is saving. */
  private seenHead: string | null = null;
  /** How long a write may take to answer before it counts as failed. */
  writeWaitMs = WRITE_WAIT_MS;
  /** False if the head could not be read at the start: the first one read later is then taken as found, not as another tab's. */
  private headKnown = true;
  /** Bumped by every write; an async save that finds it changed was overtaken by a close-time one. */
  private token = 0;
  store: Store;
  private pending: PendingIo;

  constructor(store: Store, pending: PendingIo) {
    this.store = store;
    this.pending = pending;
  }

  private read(key: string) { return this.store.get(key).then((b) => parseSave(b, normaliseSave)); }

  /** A write, given only so long to answer. */
  private put(key: string, bytes: Uint8Array): Promise<boolean> {
    return new Promise((resolve) => {
      const t = setTimeout(() => resolve(false), this.writeWaitMs);
      this.store.set(key, bytes).then((ok) => { clearTimeout(t); resolve(ok); }, () => { clearTimeout(t); resolve(false); });
    });
  }

  /** Chooses what to open: the stored save, the close-time copy if it is a later write of the same valley, or a copy kept beside it. */
  async load(): Promise<Loaded> {
    const checked = (key: string) => (this.store.getChecked ? this.store.getChecked(key) : this.store.get(key));
    const head = await checked(HEAD_KEY);
    this.headKnown = head !== 'error';
    this.seenHead = head === 'error' ? null : text(head);
    // A read that fails is not "no save": try once more, then stop, so nothing is written over what could not be read.
    let got = await checked(SAVE_KEY);
    if (got === 'error') got = await checked(SAVE_KEY);
    if (got === 'error') {
      this.stopped = 'store-error';
      return { data: null, from: 'nothing', unsaved: false, note: NOTES.storeError, storedId: null, storedSeq: 0 };
    }
    const storedBytes = got;
    const stored = await parseSave(storedBytes, normaliseSave);
    // A save this keeper wrote has a head beside it. None found beside one means the read failed quietly (some
    // stores answer "nothing" on an error): unknown, not "no other tab".
    if (this.seenHead === null && stored.ok && (stored.data.seq ?? 0) > 0) this.headKnown = false;
    const closing = await parseSave(this.pending.read(), normaliseSave);
    const backup = await this.read(BACKUP_KEY);
    this.backupWhen = backup.ok ? when(backup.data.savedAt) || 'earlier' : null;
    const none = { storedId: null, storedSeq: 0 };

    if (stored.ok) {
      const mine = { storedId: stored.data.id ?? null, storedSeq: stored.data.seq ?? 0 };
      // The close-time copy wins only as a later write of this same valley. A copy of some other valley (a fresh one
      // started while the real save could not be reached, say) is never put over it.
      const later = closing.ok && closing.data.id === stored.data.id && closing.data.seq! > stored.data.seq!;
      if (!later) this.pending.clear();
      // The save as it was found, before anything writes over it. (Its own key: the backup is never touched here.)
      if (storedBytes) await this.put(PREVIOUS_KEY, storedBytes);
      return later ? { data: closing.data, from: 'closing-copy', unsaved: true, note: null, ...mine } : { data: stored.data, from: 'store', unsaved: false, note: null, ...mine };
    }
    const why: Unreadable = stored.why;
    if (why === 'newer') {
      this.stopped = 'newer-build';
      return { data: null, from: 'nothing', unsaved: false, note: NOTES.newer, ...none };
    }
    if (why === 'empty') {
      if (closing.ok) return { data: closing.data, from: 'closing-copy', unsaved: true, note: null, ...none };
      this.pending.clear();
      return { data: null, from: 'nothing', unsaved: false, note: null, ...none };
    }
    // Something is stored and cannot be read: keep it aside, then fall back.
    await this.setAside(storedBytes);
    if (closing.ok) return { data: closing.data, from: 'closing-copy', unsaved: true, note: NOTES.closingCopy, ...none };
    this.pending.clear();
    const previous = await this.read(PREVIOUS_KEY);
    if (previous.ok) return { data: previous.data, from: 'previous', unsaved: true, note: NOTES.backup(when(previous.data.savedAt)), ...none };
    if (backup.ok) return { data: backup.data, from: 'backup', unsaved: true, note: NOTES.backup(when(backup.data.savedAt)), ...none };
    return { data: null, from: 'nothing', unsaved: true, note: NOTES.fresh, ...none };
  }

  /** Keeps unreadable bytes under a second key, so the next write to save:1 destroys nothing. */
  async setAside(bytes: Uint8Array | null): Promise<void> {
    if (bytes && bytes.length) await this.store.set(BAD_KEY, bytes);
  }

  /** The save being opened: later writes carry its id and count on from its number. */
  adopt(d: SaveData): void {
    this.id = d.id ?? '';
    this.seq = d.seq ?? 0;
  }

  private stamp(d: SaveData): SaveData {
    d.id = this.id;
    d.seq = ++this.seq;
    return d;
  }

  /** Has another tab or window written since this one opened the valley? Stops this page's saving if so. */
  async check(): Promise<boolean> {
    if (this.stopped) return true;
    const got = this.store.getChecked ? await this.store.getChecked(HEAD_KEY) : await this.store.get(HEAD_KEY);
    if (got === 'error') return false; // not known: say nothing rather than blame another tab
    const head = text(got);
    // The head could not be read at the start: what is there now is what this session found.
    if (!this.headKnown) { this.headKnown = true; this.seenHead = head; return false; }
    if (head === null || head === this.seenHead) return false;
    let session: unknown = null;
    try { session = (JSON.parse(head) as { session?: unknown }).session; } catch { /* an unreadable head is not another tab */ }
    if (session === null || session === this.session) return false;
    this.stopped = 'other-tab';
    return true;
  }

  private async writeHead(): Promise<void> {
    const head = JSON.stringify({ session: this.session, id: this.id, seq: this.seq });
    if (await this.put(HEAD_KEY, bytesOf(head))) { this.seenHead = head; this.headKnown = true; }
  }

  /** The ordinary save: compressed, and only if no other tab has written since. */
  async save(snapshot: () => SaveData): Promise<SaveResult> {
    if (await this.check()) return 'stopped';
    const token = ++this.token;
    const bytes = await encodeSave(this.stamp(snapshot()));
    if (token !== this.token) return 'overtaken'; // a close-time save wrote newer state meanwhile
    if (!(await this.put(SAVE_KEY, bytes))) return 'failed';
    await this.writeHead();
    if (token === this.token) this.pending.clear();
    return 'ok';
  }

  /**
   * Saves at once, uncompressed, without waiting: for when the page is being hidden or closed. The copy in
   * localStorage is complete before this returns; the store's own write may or may not finish.
   */
  saveNow(snapshot: () => SaveData): { kept: boolean; stored: Promise<boolean> } | null {
    if (this.stopped) return null;
    this.token++;
    const bytes = encodeSaveNow(this.stamp(snapshot()));
    const kept = this.pending.write(bytes);
    const stored = this.store.set(SAVE_KEY, bytes).then(async (ok) => { if (ok) await this.writeHead(); return ok; });
    return { kept, stored };
  }

  /**
   * New game, a save loaded from a file or code, or the backup opened: `current` (the valley being left) becomes
   * the backup, and only then is `next` written in its place. If the valley being left cannot be kept, nothing is
   * written and the answer is 'not-kept': a swap must never leave a real valley nowhere. A valley not yet begun
   * (`keep` false) is not worth the one backup slot, and leaves the backup as it is.
   */
  async replace(next: SaveData, current: SaveData | null, keep = true): Promise<'ok' | 'not-kept' | 'failed' | 'stopped'> {
    if (this.stopped === 'newer-build' || this.stopped === 'store-error') return 'stopped';
    if (current && keep) {
      if (!(await this.put(BACKUP_KEY, await encodeSave(current)))) return 'not-kept';
      this.backupWhen = when(current.savedAt) || 'just now';
    }
    this.stopped = null; // the player has chosen this valley over whatever another tab holds
    this.token++;
    this.pending.clear();
    this.adopt(next);
    const ok = await this.put(SAVE_KEY, await encodeSave(this.stamp(next)));
    if (ok) await this.writeHead();
    return ok ? 'ok' : 'failed';
  }

  /** The backup, if there is one that can be read. */
  async backup(): Promise<SaveData | null> {
    const b = await this.read(BACKUP_KEY);
    return b.ok ? b.data : null;
  }
}
