// A save holds only what the player changed: their edits over the generated world, where they
// stand, what they carry and the time of day. Blocks are saved by name, so block ids may change
// between builds without breaking old saves. The bytes are gzipped JSON.

import { blockId, blockName, BLOCK_DEFS } from '../world/blocks.ts';
import type { World } from '../world/world.ts';
import { packPos } from '../world/light.ts';
import { itemId, itemName, hasItem } from '../world/items.ts';

export const SAVE_FORMAT = 'hidden-valley-blocks-save';
export const SAVE_VERSION = 1;

export interface Slot { name: string; count: number; wear?: number }

export interface SaveData {
  format: string;
  version: number;
  savedAt: string;
  hour: number;
  player: { x: number; y: number; z: number; yaw: number; pitch: number; flying: boolean };
  hotbar: (Slot | null)[];
  selected: number;
  palette: string[];
  /** Per chunk: [chunkKey, [index, paletteIndex, index, paletteIndex, …]]. */
  edits: [number, number[]][];
  /** Chests that have been opened: [x, y, z, slots]. */
  containers?: [number, number, number, (Slot | null)[]][];
  vitals?: { hp: number; hunger: number; thirst: number };
  spawn?: { x: number; y: number; z: number; yaw: number };
}

export function collectContainers(world: World): NonNullable<SaveData['containers']> {
  const out: NonNullable<SaveData['containers']> = [];
  for (const [key, slots] of world.containers) {
    const x = key & 2047, z = (key >> 11) & 2047, y = key >>> 22;
    out.push([x, y, z, slots.map((s) => (s ? { name: itemName(s.id), count: s.count, ...(s.wear ? { wear: s.wear } : {}) } : null))]);
  }
  return out;
}

export function restoreContainers(world: World, data: SaveData): void {
  world.containers.clear();
  for (const [x, y, z, slots] of data.containers ?? []) {
    world.containers.set(packPos(x, y, z), slots.map((s) => {
      if (!s || !hasItem(s.name)) return null;
      return { id: itemId(s.name), count: s.count, ...(s.wear ? { wear: s.wear } : {}) };
    }));
  }
}

export function collectEdits(world: World): { palette: string[]; edits: [number, number[]][] } {
  const palette: string[] = [];
  const pIndex = new Map<number, number>();
  const edits: [number, number[]][] = [];
  for (const [key, m] of world.edits) {
    const flat: number[] = [];
    for (const [i, id] of m) {
      let p = pIndex.get(id);
      if (p === undefined) { p = palette.length; palette.push(blockName(id)); pIndex.set(id, p); }
      flat.push(i, p);
    }
    edits.push([key, flat]);
  }
  return { palette, edits };
}

/** Loads saved edits into the world (before any column is generated). Unknown block names become air. */
export function restoreEdits(world: World, data: SaveData): void {
  const known = new Set(BLOCK_DEFS.map((d) => d.name));
  const ids = data.palette.map((n) => (known.has(n) ? blockId(n) : 0));
  world.edits.clear();
  for (const [key, flat] of data.edits) {
    const m = new Map<number, number>();
    for (let k = 0; k < flat.length; k += 2) m.set(flat[k], ids[flat[k + 1]] ?? 0);
    world.edits.set(key, m);
  }
}

async function gzip(bytes: Uint8Array, mode: 'compress' | 'decompress'): Promise<Uint8Array | null> {
  try {
    const Stream = mode === 'compress' ? CompressionStream : DecompressionStream;
    const s = new Blob([bytes as BlobPart]).stream().pipeThrough(new Stream('gzip'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  } catch {
    return null;
  }
}

/** Uncompressed and synchronous: for saving while the page is closing, when there is no time to wait. */
export function encodeSaveNow(data: SaveData): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(data));
}

export async function encodeSave(data: SaveData): Promise<Uint8Array> {
  const json = new TextEncoder().encode(JSON.stringify(data));
  return (await gzip(json, 'compress')) ?? json; // plain JSON if the browser can't compress
}

export async function decodeSave(bytes: Uint8Array): Promise<SaveData | null> {
  const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
  const raw = isGzip ? await gzip(bytes, 'decompress') : bytes;
  if (!raw) return null;
  try {
    const d = JSON.parse(new TextDecoder().decode(raw)) as SaveData;
    if (d.format !== SAVE_FORMAT || typeof d.version !== 'number' || d.version > SAVE_VERSION) return null;
    return d;
  } catch {
    return null;
  }
}
