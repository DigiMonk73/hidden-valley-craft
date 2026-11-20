// Everything a save holds, in one place: what a new game starts with (`newSave`), and the check every save goes
// through before the game touches it (`normaliseSave`). Loading, New game and the hand-over between page versions
// all go through these, so they cannot drift apart: a new game is simply a fresh save applied.
//
// A save that reaches the game is whole: every number finite, the player inside the world, every list a list.
// One that cannot be made whole is refused (null) and the caller says so; it never throws.

import { SAVE_FORMAT, SAVE_VERSION, WORLD_LAYOUT, ITEM_ALIASES, type SaveData, type Slot, type Mode } from './save.ts';
import { Inventory, BASE_SLOTS, BACKPACK_SLOTS } from '../sim/inventory.ts';
import { hasItem } from '../world/items.ts';
import { HOME } from '../gen/layout.ts';
import { WORLD_X, WORLD_Y, WORLD_Z, COLS_X, COLS_Z, CHUNKS_Y, CHUNK_VOLUME } from '../world/constants.ts';
import { START_WALLET } from '../sim/trade.ts';
import { FLOCK_SIZE } from '../entity/spawner.ts';
import { ALL_RAIDERS } from '../entity/outpost.ts';
import { ALL_ASHEN } from '../entity/ashen.ts';
import { devicesFromSave } from '../sim/countermeasures.ts';

/** Where a new game begins: on the balcony, looking west over the valley. */
export const START = { x: HOME.wallX - 3.5, y: HOME.floor, z: 1024.5, yaw: Math.PI / 2, pitch: -0.06 };
export const START_HOUR = 16.5;
/** How you arrive: unhurt, but hungry and thirsty after the canyon, so the first things to learn are to eat and to drink. */
export const ARRIVAL = { hp: 100, hunger: 55, thirst: 45 };

/** A name for a valley, so a copy of one valley is never mistaken for a newer save of another. */
export function newValleyId(): string {
  const r = () => Math.floor(Math.random() * 0x100000000).toString(36);
  return `v-${Date.now().toString(36)}-${r()}${r()}`;
}

/** The flag a valley gets when play first begins in it: until then its mode can still be chosen. */
export const BEGUN = 'begun';
/** The flag for having read the builder's handbooks on the bookshelves: the workshop's stations show their recipes. */
export const BOOKS_READ = 'books_read';

/** A steady name for a valley saved before valleys had names: the same for the same save, however often it is read. */
function oldValleyId(d: Record<string, unknown>): string {
  const p = (d.player ?? {}) as Record<string, unknown>;
  const text = [d.savedAt, p.x, p.y, p.z, d.hour, Array.isArray(d.edits) ? d.edits.length : 0].map(String).join('|');
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return `v-old-${(h >>> 0).toString(36)}`;
}

/** A new game, as a save. */
export function newSave(mode: Mode = 'survival'): SaveData {
  return {
    format: SAVE_FORMAT, version: SAVE_VERSION, layout: WORLD_LAYOUT, id: newValleyId(), seq: 0, savedAt: new Date().toISOString(), mode, endless: mode === 'builder', hour: START_HOUR,
    player: { x: START.x, y: START.y, z: START.z, yaw: START.yaw, pitch: START.pitch, flying: false },
    hotbar: Inventory.starter().toSave(), spill: [], selected: 0, palette: [], edits: [], containers: [],
    vitals: { ...ARRIVAL }, spawn: { x: START.x, y: START.y, z: START.z, yaw: START.yaw },
    flags: [], explored: [], wallet: START_WALLET, marcoPaid: 0, den: 3, flock: FLOCK_SIZE, outpost: ALL_RAIDERS,
    dose: 0, factionDown: 0, ashenDown: 0, live: { solar: [], hydro: [] }, day: 0, lastPull: null, running: [],
  };
}

// ---- Upgrades ---------------------------------------------------------------------------------

/** One step each: MIGRATIONS[n] turns a version-n save into version n + 1. Add a step whenever SAVE_VERSION goes up. */
const MIGRATIONS: Record<number, (d: Record<string, unknown>) => void> = {
  // 1 → 2: every valley gets an id, and its writes a counter.
  // (The id is made from the save itself, so the same old save read twice is the same valley: a random one each
  // read meant its own close-time copy never matched it.)
  1: (d) => { d.id = oldValleyId(d); d.seq = 0; },
  // 2 → 3: a valley has a mode. One made before the choice existed is Survival, and already begun.
  2: (d) => { d.mode = 'survival'; d.flags = [...(Array.isArray(d.flags) ? d.flags : []), BEGUN]; },
  // 3 → 4: the days are counted from here on; no drawing has been sent, and nothing is running.
  3: (d) => { d.day = 0; d.lastPull = null; d.running = []; },
  // 4 → 5 (docs/PHASE9B.md, 6): the workshop's recipes are learned from the builder's handbooks now. A valley begun
  // before that has been making them all along: it has read the handbooks.
  4: (d) => { const f = Array.isArray(d.flags) ? d.flags : []; if (f.includes(BEGUN) && !f.includes(BOOKS_READ)) d.flags = [...f, BOOKS_READ]; },
};

/** Brings an older save up to this build's version, in place. False if a step is missing (a version never made). */
export function migrate(d: Record<string, unknown>): boolean {
  let v = d.version as number;
  if (!Number.isInteger(v) || v < 1) return false;
  while (v < SAVE_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) return false;
    step(d);
    d.version = ++v;
  }
  return true;
}

// ---- The check --------------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const num = (v: unknown, otherwise: number): number => (fin(v) ? v : otherwise);
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const int = (v: unknown, lo: number, hi: number, otherwise: number): number => clamp(Math.floor(num(v, otherwise)), lo, hi);

function slot(v: unknown): Slot | null {
  if (!isObj(v) || typeof v.name !== 'string') return null;
  const name = ITEM_ALIASES[v.name] ?? v.name;
  if (!hasItem(name)) return null; // an item that no longer exists
  const count = Math.floor(num(v.count, 0));
  if (count < 1) return null;
  const wear = Math.floor(num(v.wear, 0));
  return { name, count: Math.min(count, 9999), ...(wear > 0 ? { wear } : {}) };
}

const spot = (v: unknown): [number, number, number] | null =>
  Array.isArray(v) && fin(v[0]) && fin(v[1]) && fin(v[2]) ? [Math.floor(v[0]), Math.floor(v[1]), Math.floor(v[2])] : null;
const spots = (v: unknown): [number, number, number][] => (Array.isArray(v) ? v.map(spot).filter((s): s is [number, number, number] => !!s) : []);

/**
 * Checks a parsed save and makes it whole. The parts no valley can do without (the player, the pack, the edits)
 * must be there in the right shape, or the save is refused; everything else falls back to what a new game has.
 * Numbers are made finite and kept in range, the player is kept inside the world, and anything unknown is dropped.
 */
export function normaliseSave(raw: unknown): SaveData | null {
  if (!isObj(raw) || raw.format !== SAVE_FORMAT || !fin(raw.version) || raw.version > SAVE_VERSION) return null;
  let d: Record<string, unknown>;
  // (A browser without structuredClone, Safari before 15.4, copies the save as the text it is: without this every
  // save was refused there, and each reload began a fresh valley. docs/PHASE9B.md, 5.)
  try { d = typeof structuredClone === 'function' ? structuredClone(raw) : JSON.parse(JSON.stringify(raw)); } catch { return null; }
  if (!migrate(d)) return null;
  const p = d.player;
  if (!isObj(p) || !fin(p.x) || !fin(p.y) || !fin(p.z)) return null;
  if (!Array.isArray(d.hotbar) || !Array.isArray(d.palette) || !Array.isArray(d.edits)) return null;
  if (!d.palette.every((n) => typeof n === 'string')) return null;
  const fresh = newSave();
  const palette = d.palette as string[];

  // The pack: 36 slots, or 45 with the backpack. Anything past that is spill, to be put down where the player stands.
  const all = (d.hotbar as unknown[]).map(slot);
  const size = all.length > BASE_SLOTS ? BACKPACK_SLOTS : BASE_SLOTS;
  const hotbar = all.slice(0, size);
  while (hotbar.length < size) hotbar.push(null);
  const spill = [...all.slice(size), ...(Array.isArray(d.spill) ? d.spill.map(slot) : [])].filter((s): s is Slot => !!s);

  const edits: [number, number[]][] = [];
  for (const e of d.edits as unknown[]) {
    if (!Array.isArray(e) || !Number.isInteger(e[0]) || e[0] < 0 || e[0] >= COLS_X * COLS_Z * CHUNKS_Y || !Array.isArray(e[1])) continue;
    const flat: number[] = [];
    const src = e[1] as unknown[];
    for (let k = 0; k + 1 < src.length; k += 2) {
      const i = src[k], pi = src[k + 1];
      if (Number.isInteger(i) && Number.isInteger(pi) && (i as number) >= 0 && (i as number) < CHUNK_VOLUME && (pi as number) >= 0 && (pi as number) < palette.length) flat.push(i as number, pi as number);
    }
    if (flat.length) edits.push([e[0] as number, flat]);
  }

  const containers: NonNullable<SaveData['containers']> = [];
  for (const c of Array.isArray(d.containers) ? d.containers : []) {
    const at = spot(c);
    if (!at || !Array.isArray(c[3]) || at[0] < 0 || at[0] >= WORLD_X || at[1] < 0 || at[1] >= WORLD_Y || at[2] < 0 || at[2] >= WORLD_Z) continue;
    containers.push([at[0], at[1], at[2], (c[3] as unknown[]).slice(0, 64).map(slot)]);
  }

  const v = isObj(d.vitals) ? d.vitals : {};
  const s = isObj(d.spawn) && fin(d.spawn.x) && fin(d.spawn.y) && fin(d.spawn.z) ? d.spawn : null;
  const power = isObj(d.power) ? d.power : null;
  const live = isObj(d.live) ? d.live : {};
  return {
    format: SAVE_FORMAT, version: SAVE_VERSION,
    // The layout of the world the save was made in. One without the mark is from the first layout (src/save/save.ts).
    layout: int(d.layout, 1, Number.MAX_SAFE_INTEGER, 1),
    id: typeof d.id === 'string' && d.id ? d.id.slice(0, 64) : fresh.id,
    seq: int(d.seq, 0, Number.MAX_SAFE_INTEGER, 0),
    savedAt: typeof d.savedAt === 'string' ? d.savedAt : fresh.savedAt,
    mode: d.mode === 'builder' ? 'builder' : 'survival', endless: d.mode === 'builder' && d.endless !== false,
    hour: ((num(d.hour, START_HOUR) % 24) + 24) % 24,
    player: {
      x: clamp(p.x, 0.5, WORLD_X - 0.5), y: clamp(p.y, 1, WORLD_Y + 16), z: clamp(p.z, 0.5, WORLD_Z - 0.5),
      yaw: num(p.yaw, 0), pitch: clamp(num(p.pitch, 0), -1.55, 1.55), flying: p.flying === true,
    },
    hotbar, spill, selected: int(d.selected, 0, 8, 0), palette, edits, containers,
    vitals: { hp: clamp(num(v.hp, 100), 0, 100), hunger: clamp(num(v.hunger, 100), 0, 100), thirst: clamp(num(v.thirst, 100), 0, 100) },
    spawn: s
      ? { x: clamp(s.x as number, 0.5, WORLD_X - 0.5), y: clamp(s.y as number, 1, WORLD_Y), z: clamp(s.z as number, 0.5, WORLD_Z - 0.5), yaw: num(s.yaw, 0) }
      : fresh.spawn,
    flags: Array.isArray(d.flags) ? [...new Set(d.flags.filter((f): f is string => typeof f === 'string' && f.length < 64))].slice(0, 4000) : [],
    explored: Array.isArray(d.explored) ? d.explored.filter((i): i is number => Number.isInteger(i) && i >= 0 && i < 64 * 64) : [],
    wallet: Math.floor(clamp(num(d.wallet, START_WALLET), 0, Number.MAX_SAFE_INTEGER)),
    marcoPaid: Math.floor(clamp(num(d.marcoPaid, 0), 0, Number.MAX_SAFE_INTEGER)),
    den: int(d.den, 0, 3, 3), flock: int(d.flock, 0, FLOCK_SIZE, FLOCK_SIZE), outpost: int(d.outpost, 0, ALL_RAIDERS, ALL_RAIDERS),
    ...(power ? { power: { charge: Math.max(0, num(power.charge, 0)), satsTotal: Math.max(0, num(power.satsTotal, 0)), satsToday: Math.max(0, num(power.satsToday, 0)), frac: clamp(num(power.frac, 0), 0, 1) } } : {}),
    dose: clamp(num(d.dose, 0), 0, 100),
    factionDown: int(d.factionDown, 0, 31, 0), ashenDown: int(d.ashenDown, 0, ALL_ASHEN, 0) & ALL_ASHEN,
    live: { solar: spots(live.solar), hydro: spots(live.hydro) },
    day: int(d.day, 0, 1e7, 0),
    lastPull: fin(d.lastPull) && d.lastPull >= 0 ? d.lastPull : null,
    running: devicesFromSave(d.running).filter((r) => r.x >= 0 && r.x < WORLD_X && r.y >= 0 && r.y < WORLD_Y && r.z >= 0 && r.z < WORLD_Z).slice(0, 64),
  };
}
