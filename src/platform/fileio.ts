// Getting a save out of the page and back in, whatever the sandbox allows: a file download, or a
// text "save code" to copy; a file picker, or pasting the code back.

import { toB64, fromB64 } from './storage.ts';

const CODE_PREFIX = 'HVB1:';

export function saveToCode(bytes: Uint8Array): string { return CODE_PREFIX + toB64(bytes); }

export function inFrame(): boolean {
  try { return window.self !== window.top; } catch { return true; }
}

/** The claude.ai "downloads" capability, when the page runs there and declares it; null otherwise. */
export type Downloads = { save(r: { filename: string; data: string | Blob }): Promise<{ status: string }> };
export async function claudeDownloads(): Promise<Downloads | null> {
  try {
    const api = (window as unknown as { claude?: { use?: (n: string) => Promise<unknown> } }).claude;
    return api?.use ? ((await api.use('downloads')) as Downloads | null) : null;
  } catch {
    return null;
  }
}

/** A save file is plain text holding the save code, so it travels and loads like a pasted code. */
export function fileToSave(bytes: Uint8Array): Uint8Array | null {
  const head = new TextDecoder().decode(bytes.subarray(0, 8));
  if (head.startsWith(CODE_PREFIX)) return codeToSave(new TextDecoder().decode(bytes));
  return bytes; // an older binary save
}

export function codeToSave(code: string): Uint8Array | null {
  const t = code.trim();
  if (!t.startsWith(CODE_PREFIX)) return null;
  try { return fromB64(t.slice(CODE_PREFIX.length)); } catch { return null; }
}

/** Starts a download; returns false if the page could not even try. */
export function downloadFile(name: string, bytes: Uint8Array): boolean {
  try {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/octet-stream' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return true;
  } catch {
    return false;
  }
}

/** Opens a file picker and reads the chosen file. */
export function pickFile(): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.txt,.hvbsave,text/plain,application/octet-stream';
      input.onchange = async () => {
        const f = input.files?.[0];
        // A file that can't be read is "no file": the caller says so, where it used to wait for ever.
        try { resolve(f ? new Uint8Array(await f.arrayBuffer()) : null); } catch { resolve(null); }
      };
      input.click();
    } catch {
      resolve(null);
    }
  });
}
