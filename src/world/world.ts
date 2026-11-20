// The loaded world on the main thread: columns of chunks, the player's edits, and light kept right
// as columns arrive and blocks change. Physics, raycasts and AI read blocks from here directly.

import {
  CS, CHUNKS_Y, COLS_X, COLS_Z, WORLD_X, WORLD_Y, WORLD_Z, CHUNK_VOLUME, PS, PADDED_VOLUME, chunkKey, columnKey,
} from './constants.ts';
import { AIR, BEDROCK, B_OPAQUE } from './blocks.ts';
import { joinSeams, relightBlock, packPos, type LightHost } from './light.ts';
import { BLOCK_DEFS } from './blocks.ts';
import { initialContents } from '../gen/inheritance.ts';
import type { Stack } from '../sim/inventory.ts';


export class Chunk {
  blocks: Uint16Array | null = null;
  uniformBlock = 0;
  light: Uint8Array | null = null;
  uniformLight = 0;
  /** Changed since its mesh was last requested. */
  dirty = true;
  /** Bumped on every change; a mesh built from an older version is stale. */
  version = 0;
  /** Has been drawn at least once (a mesh, or found to need none). */
  hasMesh = false;

  cx: number;
  cy: number;
  cz: number;
  constructor(cx: number, cy: number, cz: number) {
    this.cx = cx; this.cy = cy; this.cz = cz;
  }

  get key(): number { return chunkKey(this.cx, this.cy, this.cz); }

  block(i: number): number { return this.blocks ? this.blocks[i] : this.uniformBlock; }
  lightAt(i: number): number { return this.light ? this.light[i] : this.uniformLight; }

  /** True when the chunk holds nothing to draw (all air) — no mesh needed. */
  get empty(): boolean { return !this.blocks && this.uniformBlock === AIR; }

  materialize(): Uint16Array {
    if (!this.blocks) this.blocks = new Uint16Array(CHUNK_VOLUME).fill(this.uniformBlock);
    return this.blocks;
  }

  materializeLight(): Uint8Array {
    if (!this.light) this.light = new Uint8Array(CHUNK_VOLUME).fill(this.uniformLight);
    return this.light;
  }
}

export class Column {
  chunks: Chunk[] = [];
  cx: number;
  cz: number;
  constructor(cx: number, cz: number) {
    this.cx = cx; this.cz = cz;
    for (let cy = 0; cy < CHUNKS_Y; cy++) this.chunks.push(new Chunk(cx, cy, cz));
  }
}

/** A chunk's data as it travels from a worker: an array, or one number when uniform. */
export type ChunkPayload = { blocks: Uint16Array | number; light: Uint8Array | number };

export class World implements LightHost {
  columns: (Column | null)[] = new Array(COLS_X * COLS_Z).fill(null);
  /** Player edits by chunk: index within chunk → block id. Survives columns unloading. */
  edits = new Map<number, Map<number, number>>();
  onChunkDirty: ((c: Chunk) => void) | null = null;
  /** Chest contents by position, once opened (until then a chest holds its initial contents). */
  containers = new Map<number, (Stack | null)[]>();

  /** The contents of the chest at a position, or null if there is no chest there. */
  containerAt(x: number, y: number, z: number): (Stack | null)[] | null {
    const size = BLOCK_DEFS[this.blockAt(x, y, z)]?.container;
    if (!size) return null;
    const key = packPos(x, y, z);
    let c = this.containers.get(key);
    if (!c) { c = initialContents(x, y, z, size); this.containers.set(key, c); }
    return c;
  }

  column(cx: number, cz: number): Column | null {
    if (cx < 0 || cz < 0 || cx >= COLS_X || cz >= COLS_Z) return null;
    return this.columns[columnKey(cx, cz)];
  }

  chunkAtBlock(x: number, y: number, z: number): Chunk | null {
    if (y < 0 || y >= WORLD_Y || x < 0 || z < 0 || x >= WORLD_X || z >= WORLD_Z) return null;
    const col = this.columns[(z >> 5) * COLS_X + (x >> 5)];
    return col ? col.chunks[y >> 5] : null;
  }

  // ---- Blocks ------------------------------------------------------------------------------

  /** Block id; outside the world or in an unloaded column it is bedrock (solid, opaque). */
  blockAt(x: number, y: number, z: number): number {
    if (y < 0) return BEDROCK;
    if (y >= WORLD_Y) return AIR;
    if (x < 0 || z < 0 || x >= WORLD_X || z >= WORLD_Z) return BEDROCK;
    const col = this.columns[(z >> 5) * COLS_X + (x >> 5)];
    if (!col) return BEDROCK;
    const ch = col.chunks[y >> 5];
    return ch.blocks ? ch.blocks[((y & 31) << 10) | ((z & 31) << 5) | (x & 31)] : ch.uniformBlock;
  }

  /**
   * The block at a position even where the land is not loaded: there, what the player put (their edits
   * outlive unloading), or −1 if they changed nothing at that spot. A hutch, a coop, a smoker are all things
   * the player placed, so they can be found, and keep working, while the player is away.
   */
  blockKnown(x: number, y: number, z: number): number {
    if (this.isLoaded(x, z)) return this.blockAt(x, y, z);
    if (y < 0 || y >= WORLD_Y || x < 0 || z < 0 || x >= WORLD_X || z >= WORLD_Z) return -1;
    const id = this.edits.get(chunkKey(x >> 5, y >> 5, z >> 5))?.get(((y & 31) << 10) | ((z & 31) << 5) | (x & 31));
    return id === undefined ? -1 : id;
  }

  isLoaded(x: number, z: number): boolean {
    if (x < 0 || z < 0 || x >= WORLD_X || z >= WORLD_Z) return false;
    return this.columns[(z >> 5) * COLS_X + (x >> 5)] !== null;
  }

  /** Sets a block as the player's edit: records it, re-lights around it and marks meshes stale. */
  setBlock(x: number, y: number, z: number, id: number): boolean {
    const ch = this.chunkAtBlock(x, y, z);
    if (!ch) return false;
    const i = ((y & 31) << 10) | ((z & 31) << 5) | (x & 31);
    if (ch.block(i) === id) return false;
    ch.materialize()[i] = id;
    let e = this.edits.get(ch.key);
    if (!e) { e = new Map(); this.edits.set(ch.key, e); }
    e.set(i, id);
    this.markDirtyAround(x, y, z);
    relightBlock(this, x, y, z, id);
    return true;
  }

  // ---- Light (LightHost) ---------------------------------------------------------------------

  lightAt(x: number, y: number, z: number): number {
    if (y >= WORLD_Y) return 0xf0;
    const ch = this.chunkAtBlock(x, y, z);
    if (!ch) return 0;
    return ch.lightAt(((y & 31) << 10) | ((z & 31) << 5) | (x & 31));
  }

  setLightAt(x: number, y: number, z: number, v: number): void {
    const ch = this.chunkAtBlock(x, y, z);
    if (!ch) return;
    const i = ((y & 31) << 10) | ((z & 31) << 5) | (x & 31);
    const arr = ch.light;
    if (arr ? arr[i] === v : ch.uniformLight === v) return;
    ch.materializeLight()[i] = v;
    this.markDirtyAround(x, y, z);
  }

  /** A change at a block can show in its own chunk and, at a chunk edge, in the neighbours' meshes. */
  private markDirtyAround(x: number, y: number, z: number): void {
    const lx = x & 31, ly = y & 31, lz = z & 31;
    const xs = lx === 0 ? [-1, 0] : lx === 31 ? [0, 1] : [0];
    const ys = ly === 0 ? [-1, 0] : ly === 31 ? [0, 1] : [0];
    const zs = lz === 0 ? [-1, 0] : lz === 31 ? [0, 1] : [0];
    for (const dx of xs) for (const dy of ys) for (const dz of zs) {
      const c = this.chunkAtBlock(x + dx, y + dy, z + dz);
      if (c) this.markDirty(c);
    }
  }

  markDirty(c: Chunk): void {
    c.version++;
    if (!c.dirty) {
      c.dirty = true;
      this.onChunkDirty?.(c);
    }
  }

  // ---- Columns arriving and leaving ------------------------------------------------------------

  /** Edits for a column, as [chunk y, index, id] triples, for the generator to apply before lighting. */
  columnEdits(cx: number, cz: number): number[] {
    const out: number[] = [];
    for (let cy = 0; cy < CHUNKS_Y; cy++) {
      const e = this.edits.get(chunkKey(cx, cy, cz));
      if (e) for (const [i, id] of e) out.push(cy, i, id);
    }
    return out;
  }

  addColumn(cx: number, cz: number, chunks: ChunkPayload[]): Column {
    const col = new Column(cx, cz);
    chunks.forEach((p, cy) => {
      const ch = col.chunks[cy];
      if (typeof p.blocks === 'number') ch.uniformBlock = p.blocks; else ch.blocks = p.blocks;
      if (typeof p.light === 'number') ch.uniformLight = p.light; else ch.light = p.light;
    });
    this.columns[columnKey(cx, cz)] = col;
    this.joinColumnLight(cx, cz);
    return col;
  }

  removeColumn(cx: number, cz: number): void {
    this.columns[columnKey(cx, cz)] = null;
  }

  /** Floods light across the seams between a new column and its loaded neighbours. */
  private joinColumnLight(cx: number, cz: number): void {
    const seeds: number[] = [];
    const x0 = cx * CS, z0 = cz * CS;
    const sides: [number, number, number, number][] = [
      [-1, 0, x0 - 1, x0], [1, 0, x0 + CS, x0 + CS - 1], [0, -1, z0 - 1, z0], [0, 1, z0 + CS, z0 + CS - 1],
    ];
    for (const [dx, dz, outer, inner] of sides) {
      if (!this.column(cx + dx, cz + dz)) continue;
      for (let y = 0; y < WORLD_Y; y++)
        for (let t = 0; t < CS; t++) {
          for (const edge of [outer, inner]) {
            const x = dx !== 0 ? edge : x0 + t;
            const z = dz !== 0 ? edge : z0 + t;
            const v = this.lightAt(x, y, z);
            if ((v >> 4) > 1 || (v & 15) > 1) seeds.push(packPos(x, y, z));
          }
        }
    }
    if (seeds.length) joinSeams(this, seeds);
  }

  /** True once a chunk's column and all eight neighbouring columns are loaded (it can be meshed). */
  canMesh(cx: number, cz: number): boolean {
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= COLS_X || nz >= COLS_Z) continue; // the world's edge counts as loaded
        if (!this.columns[columnKey(nx, nz)]) return false;
      }
    return true;
  }

  /** The chunk plus a one-block border, blocks and light, as the mesher wants them. */
  padded(c: Chunk): { blocks: Uint16Array; light: Uint8Array } {
    const blocks = new Uint16Array(PADDED_VOLUME);
    const light = new Uint8Array(PADDED_VOLUME);
    const bx = c.cx * CS - 1, by = c.cy * CS - 1, bz = c.cz * CS - 1;
    let i = 0;
    for (let py = 0; py < PS; py++)
      for (let pz = 0; pz < PS; pz++)
        for (let px = 0; px < PS; px++, i++) {
          const x = bx + px, y = by + py, z = bz + pz;
          const id = this.blockAt(x, y, z);
          blocks[i] = id;
          light[i] = B_OPAQUE[id] ? 0 : this.lightAt(x, y, z);
        }
    return { blocks, light };
  }
}
