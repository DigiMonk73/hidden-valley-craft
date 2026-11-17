// Getting a save out of the page and back in, whatever the sandbox allows: a file download, or a
// text "save code" to copy; a file picker, or pasting the code back.

import { toB64, fromB64 } from './storage.ts';

const CODE_PREFIX = 'HVB1:';

export function saveToCode(bytes: Uint8Array): string { return CODE_PREFIX + toB64(bytes); }

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

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

/** Opens a file picker and reads the chosen file. */
export function pickFile(): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.hvbsave,application/octet-stream';
      input.onchange = async () => {
        const f = input.files?.[0];
        resolve(f ? new Uint8Array(await f.arrayBuffer()) : null);
      };
      input.click();
    } catch {
      resolve(null);
    }
  });
}
