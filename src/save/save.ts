// A save holds only what the player changed: their edits over the generated world, where they
// stand, what they carry and the time of day. Blocks are saved by name, so block ids may change
// between builds without breaking old saves. The bytes are gzipped JSON.

import { blockId, blockName, BLOCK_DEFS } from '../world/blocks.ts';
import type { World } from '../world/world.ts';
import { packPos } from '../world/light.ts';
import { itemId, itemName, hasItem } from '../world/items.ts';

export const SAVE_FORMAT = 'hidden-valley-blocks-save';
/**
 * The save's own version. A build opens its own version and every earlier one (`migrate` in src/save/state.ts
 * brings an older save up, one step at a time); a save from a later build is refused, and kept untouched.
 * 2: each valley has an id and each write a counter (docs/FIXES.md, N1).
 * 3: each valley has a mode, Survival or Builder's, chosen when it is begun (docs/FIXES.md, N2).
 * 4: the days are counted, and the uplink's last drawing and the lures and pots still running are kept (docs/PHASE8.md).
 * 5: the builder's handbooks are read or not (docs/PHASE9B.md, 6); a valley begun before has read them.
 */
export const SAVE_VERSION = 5;

/** How a valley is played: Survival is the game; Builder's mode adds flying, endless blocks and the sky's clock. */
export type Mode = 'survival' | 'builder';

/** Blocks and items renamed since a save was made: old name → new name. Empty until a build renames one. */
export const BLOCK_ALIASES: Record<string, string> = {};
export const ITEM_ALIASES: Record<string, string> = {};
/**
 * The designed world's layout, counted up when a change to it moves what a save points at (chests, the bed, rooms).
 * 2: the home rebuilt (docs/HOME.md). A save from an earlier layout is not opened: a fresh valley starts, and says so.
 * (Before version 1 saves are not carried across such changes; after it, a change ships with a map from old to new.)
 */
export const WORLD_LAYOUT = 2;

export interface Slot { name: string; count: number; wear?: number }

export interface SaveData {
  format: string;
  version: number;
  /** Which valley this is (made at New game) and how many times it has been written. Absent before version 2. */
  id?: string;
  seq?: number;
  /** The world layout the save was made in (absent: the first). */
  layout?: number;
  savedAt: string;
  /** Survival or Builder's mode (absent before version 3: Survival), and, in Builder's mode, whether blocks are endless now. */
  mode?: Mode;
  endless?: boolean;
  hour: number;
  player: { x: number; y: number; z: number; yaw: number; pitch: number; flying: boolean };
  hotbar: (Slot | null)[];
  /** What the pack could not hold when saved: an item on a screen's cursor with no room to put it down. */
  spill?: Slot[];
  selected: number;
  palette: string[];
  /** Per chunk: [chunkKey, [index, paletteIndex, index, paletteIndex, …]]. */
  edits: [number, number[]][];
  /** Chests that have been opened: [x, y, z, slots]. */
  containers?: [number, number, number, (Slot | null)[]][];
  vitals?: { hp: number; hunger: number; thirst: number };
  spawn?: { x: number; y: number; z: number; yaw: number };
  flags?: string[];
  explored?: number[];
  /** The hot wallet, in satoshis (Phase 4). */
  wallet?: number;
  /** What Marco has paid out since dawn, in satoshis (absent: nothing yet). */
  marcoPaid?: number;
  /** How many of the farmhouse den's dogs are alive (Phase 4). */
  den?: number;
  /** How many hens are left in the farm's feral flock (Phase 4). */
  flock?: number;
  /** Which of the outpost's raiders are alive, as bits: lookout 1, pistol 2, machete 4 (Phase 5). Absent: all three. */
  outpost?: number;
  /** Power at home: the banks' charge (kWh) and the rig's earnings (Phase 6). Absent: nothing built yet. */
  power?: { charge: number; satsTotal: number; satsToday: number; frac: number };
  /** The radiation dose, 0–100 (Phase 6). Absent: none. */
  dose?: number;
  /** Days since this valley was begun, counted at each midnight (Phase 8: the uplink's clock). Absent before version 4: 0. */
  day?: number;
  /** When the uplink last sent a drawing, in hours since the valley was begun (Phase 8); null: never. */
  lastPull?: number | null;
  /** Sonic lures and smoke pots still running (Phase 8): where, which, and the seconds left. */
  running?: { kind: 'lure' | 'pot'; x: number; y: number; z: number; left: number; call: number }[];
  /** Zone-2's men killed since dawn, as bits (Phase 6): they stay down across a reload. Absent: none. */
  factionDown?: number;
  /** Zone-3's Ashen put down since dawn, as bits (Phase 7): they stay down across a reload. Absent: none. */
  ashenDown?: number;
  /**
   * The solar arrays under open sky and the hydro generators at the water when saved (Phase 7): away from
   * home their land is not loaded, and they count as last seen. Absent (an older save): none count until seen.
   */
  live?: { solar: [number, number, number][]; hydro: [number, number, number][] };
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
      const name = s ? ITEM_ALIASES[s.name] ?? s.name : '';
      if (!s || !hasItem(name)) return null;
      return { id: itemId(name), count: s.count, ...(s.wear ? { wear: s.wear } : {}) };
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
  const ids = data.palette.map((n) => BLOCK_ALIASES[n] ?? n).map((n) => (known.has(n) ? blockId(n) : 0));
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

/** Why some bytes are not a save this build can open. */
export type Unreadable = 'empty' | 'not-a-save' | 'newer' | 'damaged';
export type Parsed = { ok: true; data: SaveData } | { ok: false; why: Unreadable };

/**
 * Reads bytes into a save, checked and made whole by `check` (src/save/state.ts: `normaliseSave`), or says why not:
 * nothing there, not a Hidden Valley save, made by a newer build, or damaged.
 */
export async function parseSave(bytes: Uint8Array | null, check: (raw: unknown) => SaveData | null): Promise<Parsed> {
  if (!bytes || bytes.length === 0) return { ok: false, why: 'empty' };
  const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
  const raw = isGzip ? await gzip(bytes, 'decompress') : bytes;
  if (!raw) return { ok: false, why: 'damaged' };
  let d: unknown;
  try { d = JSON.parse(new TextDecoder().decode(raw)); } catch { return { ok: false, why: isGzip ? 'damaged' : 'not-a-save' }; }
  const o = d as { format?: unknown; version?: unknown } | null;
  if (!o || typeof o !== 'object' || o.format !== SAVE_FORMAT) return { ok: false, why: 'not-a-save' };
  if (typeof o.version !== 'number') return { ok: false, why: 'damaged' };
  if (o.version > SAVE_VERSION) return { ok: false, why: 'newer' };
  const data = check(d);
  return data ? { ok: true, data } : { ok: false, why: 'damaged' };
}

/** The header check only: bytes into whatever the save holds, unchecked. Prefer `parseSave` with `normaliseSave`. */
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

/** Was this save made in an earlier layout of the world (before the home was rebuilt)? Such a save is not opened. */
export function fromEarlierLayout(d: SaveData): boolean {
  return (Number.isFinite(d.layout) ? d.layout! : 1) < WORLD_LAYOUT;
}
