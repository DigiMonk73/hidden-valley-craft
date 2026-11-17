// Flood-fill lighting with two channels per block, packed as (sky << 4) | block, each 0–15.
// Sky light of 15 falls straight down without loss; everything else loses 1 per block plus the
// block's "filter" (leaves, water). Light never passes opaque blocks.
//
// Two users: the generator lights a fresh column on its own (workers), and the world keeps light
// right across columns as they load and as the player edits (main thread).

import { CS, WORLD_Y } from './constants.ts';
import { B_OPAQUE, B_FILTER, B_EMIT } from './blocks.ts';
import { COLUMN_VOLUME } from '../gen/terrain.ts';

export const SKY = 0;
export const BLOCK = 1;

export function skyOf(packed: number): number { return packed >> 4; }
export function blockOf(packed: number): number { return packed & 15; }

/** Growable queue of integers, reused to avoid allocating in hot paths. */
export class IntQueue {
  buf: Int32Array;
  head = 0;
  tail = 0;
  constructor(cap = 1 << 14) { this.buf = new Int32Array(cap); }
  push(v: number): void {
    if (this.tail === this.buf.length) {
      if (this.head > 0) {
        this.buf.copyWithin(0, this.head, this.tail);
        this.tail -= this.head;
        this.head = 0;
      }
      if (this.tail === this.buf.length) {
        const n = new Int32Array(this.buf.length * 2);
        n.set(this.buf);
        this.buf = n;
      }
    }
    this.buf[this.tail++] = v;
  }
  shift(): number { return this.buf[this.head++]; }
  get size(): number { return this.tail - this.head; }
  clear(): void { this.head = this.tail = 0; }
}

// ---- Lighting one column on its own (generator) -------------------------------------------

const ci = (x: number, y: number, z: number) => (y << 10) | (z << 5) | x;

/** Light for a freshly generated column, treating its sides as dark. Neighbours are joined later. */
export function lightColumn(col: Uint16Array): Uint8Array {
  const light = new Uint8Array(COLUMN_VOLUME);
  const q = new IntQueue(1 << 16);

  // Sunlight straight down each x, z.
  for (let z = 0; z < CS; z++)
    for (let x = 0; x < CS; x++) {
      let s = 15;
      for (let y = WORLD_Y - 1; y >= 0; y--) {
        const i = ci(x, y, z);
        const id = col[i];
        if (B_OPAQUE[id]) s = 0;
        else if (s > 0) {
          // Full sun passes clear blocks untouched; anything dimmer, or filtered, fades as it spreads.
          const f = B_FILTER[id];
          if (s < 15 || f > 0) s = Math.max(0, s - 1 - f);
        }
        light[i] = (s << 4) | B_EMIT[id];
      }
    }

  // Seed the flood from lit cells next to darker open cells, and from every light source.
  for (let y = 0; y < WORLD_Y; y++)
    for (let z = 0; z < CS; z++)
      for (let x = 0; x < CS; x++) {
        const i = ci(x, y, z);
        const v = light[i];
        if (v === 0) continue;
        if ((v & 15) > 1) { q.push(i); continue; }
        const s = v >> 4;
        if (s < 2) continue;
        if ((x > 0 && litBelow(col, light, i - 1, s)) || (x < CS - 1 && litBelow(col, light, i + 1, s)) ||
          (z > 0 && litBelow(col, light, i - 32, s)) || (z < CS - 1 && litBelow(col, light, i + 32, s)) ||
          (y > 0 && litBelow(col, light, i - 1024, s))) q.push(i);
      }

  while (q.size > 0) {
    const i = q.shift();
    const x = i & 31, z = (i >> 5) & 31, y = i >> 10;
    const v = light[i];
    const s = v >> 4, b = v & 15;
    if (x > 0) spreadLocal(col, light, q, i - 1, s, b, false);
    if (x < CS - 1) spreadLocal(col, light, q, i + 1, s, b, false);
    if (z > 0) spreadLocal(col, light, q, i - 32, s, b, false);
    if (z < CS - 1) spreadLocal(col, light, q, i + 32, s, b, false);
    if (y > 0) spreadLocal(col, light, q, i - 1024, s, b, true);
    if (y < WORLD_Y - 1) spreadLocal(col, light, q, i + 1024, s, b, false);
  }
  return light;
}

function litBelow(col: Uint16Array, light: Uint8Array, j: number, s: number): boolean {
  return !B_OPAQUE[col[j]] && (light[j] >> 4) < s - 1;
}

function spreadLocal(col: Uint16Array, light: Uint8Array, q: IntQueue, j: number, s: number, b: number, down: boolean): void {
  const id = col[j];
  if (B_OPAQUE[id]) return;
  const f = B_FILTER[id];
  const cur = light[j];
  let ns = down && s === 15 && f === 0 ? 15 : s - 1 - f;
  let nb = b - 1 - f;
  const cs = cur >> 4, cb = cur & 15;
  let changed = false;
  if (ns > cs) changed = true; else ns = cs;
  if (nb > cb) changed = true; else nb = cb;
  if (changed) {
    light[j] = (ns << 4) | nb;
    q.push(j);
  }
}

// ---- Keeping light right across the loaded world (main thread) ----------------------------

/** What the world-level light code needs from the world. Coordinates are world blocks. */
export interface LightHost {
  blockAt(x: number, y: number, z: number): number; // unloaded counts as opaque bedrock
  lightAt(x: number, y: number, z: number): number; // unloaded counts as 0
  setLightAt(x: number, y: number, z: number, v: number): void;
}

// Positions are packed into one integer: x and z need 11 bits, y 8.
export const packPos = (x: number, y: number, z: number) => (y << 22) | (z << 11) | x;
const PX = (p: number) => p & 2047;
const PZ = (p: number) => (p >> 11) & 2047;
const PY = (p: number) => p >>> 22;

const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]] as const;

const addQ = new IntQueue();
const remQ = new IntQueue();
const remLevel = new IntQueue();

function chan(v: number, c: number): number { return c === SKY ? v >> 4 : v & 15; }
function withChan(v: number, c: number, level: number): number {
  return c === SKY ? (level << 4) | (v & 15) : (v & 0xf0) | level;
}

/** Spreads light outward from the queued positions until nothing brightens. */
function flood(host: LightHost, c: number): void {
  while (addQ.size > 0) {
    const p = addQ.shift();
    const x = PX(p), y = PY(p), z = PZ(p);
    const level = chan(host.lightAt(x, y, z), c);
    if (level <= 1) continue;
    for (const [dx, dy, dz] of DIRS) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      if (ny < 0 || ny >= WORLD_Y) continue;
      const id = host.blockAt(nx, ny, nz);
      if (B_OPAQUE[id]) continue;
      const f = B_FILTER[id];
      const want = c === SKY && dy === -1 && level === 15 && f === 0 ? 15 : level - 1 - f;
      const cur = host.lightAt(nx, ny, nz);
      if (want > chan(cur, c)) {
        host.setLightAt(nx, ny, nz, withChan(cur, c, want));
        addQ.push(packPos(nx, ny, nz));
      }
    }
  }
}

/** Joins a newly loaded column's light with its loaded neighbours by flooding across the seams. */
export function joinSeams(host: LightHost, seeds: number[]): void {
  for (const c of [SKY, BLOCK]) {
    addQ.clear();
    for (const p of seeds) addQ.push(p);
    flood(host, c);
  }
}

/** Re-lights around a block that changed from oldId to newId at (x, y, z). */
export function relightBlock(host: LightHost, x: number, y: number, z: number, newId: number): void {
  for (const c of [SKY, BLOCK]) {
    addQ.clear();
    remQ.clear();
    remLevel.clear();
    const old = chan(host.lightAt(x, y, z), c);
    // 1. Take away whatever light this cell was passing on.
    host.setLightAt(x, y, z, withChan(host.lightAt(x, y, z), c, 0));
    if (old > 0) { remQ.push(packPos(x, y, z)); remLevel.push(old); }
    while (remQ.size > 0) {
      const p = remQ.shift();
      const level = remLevel.shift();
      const px = PX(p), py = PY(p), pz = PZ(p);
      for (const [dx, dy, dz] of DIRS) {
        const nx = px + dx, ny = py + dy, nz = pz + dz;
        if (ny < 0 || ny >= WORLD_Y) continue;
        const nv = host.lightAt(nx, ny, nz);
        const nl = chan(nv, c);
        if (nl === 0) continue;
        const fedByUs = nl < level || (c === SKY && dy === -1 && level === 15 && nl === 15);
        if (fedByUs) {
          host.setLightAt(nx, ny, nz, withChan(nv, c, 0));
          remQ.push(packPos(nx, ny, nz));
          remLevel.push(nl);
        } else {
          addQ.push(packPos(nx, ny, nz));
        }
      }
    }
    // 2. Light the cell itself from its own glow and its neighbours.
    if (!B_OPAQUE[newId]) {
      const f = B_FILTER[newId];
      let best = c === BLOCK ? B_EMIT[newId] : 0;
      for (const [dx, dy, dz] of DIRS) {
        const ny = y + dy;
        if (ny >= WORLD_Y) { if (c === SKY && dy === 1) best = 15; continue; }
        if (ny < 0) continue;
        const nl = chan(host.lightAt(x + dx, ny, z + dz), c);
        const v = c === SKY && dy === 1 && nl === 15 && f === 0 ? 15 : nl - 1 - f;
        if (v > best) best = v;
      }
      if (best > 0) {
        host.setLightAt(x, y, z, withChan(host.lightAt(x, y, z), c, best));
        addQ.push(packPos(x, y, z));
      }
    } else if (c === BLOCK && B_EMIT[newId] > 0) {
      host.setLightAt(x, y, z, withChan(host.lightAt(x, y, z), c, B_EMIT[newId]));
      addQ.push(packPos(x, y, z));
    }
    // 3. Spread it all back out.
    flood(host, c);
  }
}
