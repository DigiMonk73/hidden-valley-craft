// A few small choices the page must know before anything else is opened: whether the picture is made with
// smoothed edges is fixed when the picture is first made, before the saved settings (which may sit in a store
// that opens slowly) can be read. They are kept in the browser's simplest storage, read at once.
//
// Where that storage is blocked (a sandboxed frame), nothing is kept and the default is used: the game works the same.

const PREFIX = 'hvb:hint:';

export function readHint(name: string): string | null {
  try { return globalThis.localStorage?.getItem(PREFIX + name) ?? null; } catch { return null; }
}

export function writeHint(name: string, value: string): void {
  try { globalThis.localStorage?.setItem(PREFIX + name, value); } catch { /* not kept here */ }
}
