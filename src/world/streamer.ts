// Keeps the world loaded around the player: asks workers for nearby columns, joins them into the
// world, meshes chunks once their neighbours are in, and lets far columns go (their edits stay).
//
// A job can fail. A column that fails is asked for again after a wait that grows, a few times, and
// is then left out; a mesh that fails is asked for once more and then left until the chunk changes.
// Neither is ever asked for again on every frame.

import { CS, CHUNKS_Y, COLS_X, COLS_Z, chunkKey } from './constants.ts';
import type { World, Chunk } from './world.ts';
import type { Executor } from '../jobs/pool.ts';
import type { Job, GenResult, MeshResult } from '../jobs/tasks.ts';
import type { Renderer } from '../render/renderer.ts';

/** After a column fails: how long to wait before each new try. When these run out it is left out. */
export const GEN_RETRY_MS = [500, 2000, 8000];
/** How often a chunk's mesh is asked for before it is left until the chunk changes. */
export const MESH_TRIES = 2;

/** The part of the renderer the streamer talks to. */
export type ChunkSink = Pick<Renderer, 'setChunkMesh' | 'removeChunk'>;

export class Streamer {
  private world: World;
  private exec: Executor;
  private renderer: ChunkSink;
  private pendingCols = new Set<number>();
  private dirty = new Set<Chunk>();
  private meshing = new Map<number, number>(); // chunk key → version being meshed
  private urgent = new Set<number>(); // chunk keys changed by the player: mesh first
  private uploads: { key: number; result: MeshResult }[] = [];
  /** Columns that failed to generate: how often, and when to ask again (Infinity: left out). */
  private genFails = new Map<number, { tries: number; retryAt: number }>();
  /** Chunks whose mesh failed, and how often. At MESH_TRIES the chunk waits for a change. */
  private meshFails = new Map<number, number>();
  /** The time in milliseconds. The checks set their own clock. */
  clock: () => number = () => performance.now();
  /** Bumped by reset(): results of jobs sent before it are dropped. */
  private epoch = 0;
  private px = 0;
  private pz = 0;
  radius = 8; // columns
  /** One byte per column: 1 where the real blocks are drawn, so the distant land hides there. */
  readonly drawn = new Uint8Array(COLS_X * COLS_Z);
  private drawnDirty = true;
  onDrawnChange: ((mask: Uint8Array) => void) | null = null;
  stats = { columns: 0, genQueued: 0, meshQueued: 0, failed: 0 };

  constructor(world: World, exec: Executor, renderer: ChunkSink) {
    this.world = world;
    this.exec = exec;
    this.renderer = renderer;
    // A chunk that changed gets a fresh start, even if its mesh failed before.
    world.onChunkDirty = (c) => { this.meshFails.delete(c.key); this.dirty.add(c); };
  }

  /** Lower runs sooner: nearest first, the player's own edits before anything. */
  priority = (job: Job): number => {
    if (job.kind === 'far') return 6; // after the nearest columns, before the distant ones
    if (job.kind === 'gen') return Math.hypot(job.cx * CS + 16 - this.px, job.cz * CS + 16 - this.pz) / CS + 1.5;
    const cz = Math.floor(job.key / CHUNKS_Y / COLS_X);
    const cx = Math.floor(job.key / CHUNKS_Y) % COLS_X;
    const d = Math.hypot(cx * CS + 16 - this.px, cz * CS + 16 - this.pz) / CS;
    return this.urgent.has(job.key) ? d - 1000 : d;
  };

  markUrgentAround(x: number, y: number, z: number): void {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const c = this.world.chunkAtBlock(x + dx, y + dy, z + dz);
      if (c) this.urgent.add(c.key);
    }
  }

  /** Columns wanted around (x, z), nearest first. */
  private wanted(x: number, z: number): [number, number][] {
    const pcx = Math.floor(x / CS), pcz = Math.floor(z / CS);
    const out: [number, number, number][] = [];
    // One ring beyond the drawn radius is generated too, so every column inside it can be meshed
    // and the fog line falls on finished ground instead of a cut edge.
    const r = this.radius + 1;
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.hypot(dx, dz);
        if (d > r + 0.5) continue;
        const cx = pcx + dx, cz = pcz + dz;
        if (cx < 0 || cz < 0 || cx >= COLS_X || cz >= COLS_Z) continue;
        out.push([cx, cz, d]);
      }
    out.sort((a, b) => a[2] - b[2]);
    return out.map(([cx, cz]) => [cx, cz]);
  }

  update(x: number, z: number, uploadBudgetMs = 4): void {
    this.px = x;
    this.pz = z;
    // 1. Ask for missing columns.
    const now = this.clock();
    for (const [cx, cz] of this.wanted(x, z)) {
      const key = cz * COLS_X + cx;
      if (this.world.column(cx, cz) || this.pendingCols.has(key)) continue;
      const failed = this.genFails.get(key);
      if (failed && now < failed.retryAt) continue; // it failed: wait before asking again
      this.pendingCols.add(key);
      const job: Job = { kind: 'gen', cx, cz, edits: this.world.columnEdits(cx, cz) };
      const epoch = this.epoch;
      this.exec.submit(job).then((r) => {
        if (epoch !== this.epoch) return;
        try {
          this.onColumn(r as GenResult);
        } catch (e) {
          this.pendingCols.delete(key);
          const col = this.world.column(cx, cz);
          // If it got in before the failure, draw what is there; otherwise it counts as a failed job.
          if (col) for (const ch of col.chunks) { ch.dirty = true; this.dirty.add(ch); }
          else this.genFailed(key, cx, cz, e);
        }
      }, (e) => {
        if (epoch !== this.epoch) return;
        this.pendingCols.delete(key);
        this.genFailed(key, cx, cz, e);
      });
    }
    // 2. Let far columns go.
    const pcx = Math.floor(x / CS), pcz = Math.floor(z / CS);
    const keep = this.radius + 3;
    for (const col of this.world.columns) {
      if (!col) continue;
      if (Math.hypot(col.cx - pcx, col.cz - pcz) <= keep) continue;
      for (const ch of col.chunks) { this.renderer.removeChunk(ch.key); this.dirty.delete(ch); this.meshFails.delete(ch.key); }
      this.world.removeColumn(col.cx, col.cz);
      this.drawnDirty = true;
    }
    // A failed column the player has left behind is forgotten: coming back asks for it afresh.
    for (const key of this.genFails.keys()) {
      if (Math.hypot((key % COLS_X) - pcx, Math.floor(key / COLS_X) - pcz) > keep) this.genFails.delete(key);
    }
    // 3. Mesh chunks that changed, once their neighbourhood is loaded.
    const start = performance.now();
    for (const ch of this.dirty) {
      if (this.meshing.has(ch.key)) continue;
      if (!this.world.column(ch.cx, ch.cz)) { this.dirty.delete(ch); continue; }
      if (!this.world.canMesh(ch.cx, ch.cz)) continue;
      if (Math.hypot(ch.cx * CS + 16 - x, ch.cz * CS + 16 - z) / CS > this.radius + 0.75) continue; // beyond the fog
      this.dirty.delete(ch);
      ch.dirty = false;
      if (ch.empty) { this.renderer.removeChunk(ch.key); ch.hasMesh = true; this.drawnDirty = true; continue; }
      const { blocks, light } = this.world.padded(ch);
      const key = ch.key, version = ch.version;
      this.meshing.set(key, version);
      const epoch = this.epoch;
      this.exec.submit({ kind: 'mesh', key, version, blocks, light }).then((r) => {
        if (epoch !== this.epoch) return;
        this.meshing.delete(key);
        this.uploads.push({ key, result: r as MeshResult });
      }, (e) => {
        if (epoch !== this.epoch) return;
        this.meshing.delete(key);
        this.meshFailed(key, e);
      });
      if (performance.now() - start > uploadBudgetMs) break;
    }
    // 4. Hand finished meshes to the renderer (a few per frame keeps frames smooth).
    const upStart = performance.now();
    while (this.uploads.length && performance.now() - upStart < uploadBudgetMs) {
      const { key, result } = this.uploads.shift()!;
      const cy = key % CHUNKS_Y;
      const cx = Math.floor(key / CHUNKS_Y) % COLS_X;
      const cz = Math.floor(key / CHUNKS_Y / COLS_X);
      const col = this.world.column(cx, cz);
      if (!col) continue;
      const ch = col.chunks[cy];
      // A mesh the renderer refuses must not stop the frame (and every frame after it).
      try { this.renderer.setChunkMesh(key, cx, cy, cz, result.mesh); } catch (e) { this.meshFailed(key, e); continue; }
      this.meshFails.delete(key);
      if (!ch.hasMesh) { ch.hasMesh = true; this.drawnDirty = true; }
      if (ch.version !== result.version) { ch.dirty = true; this.dirty.add(ch); } // changed while meshing
      else this.urgent.delete(key);
    }
    if (this.drawnDirty) {
      this.drawnDirty = false;
      for (let i = 0; i < this.drawn.length; i++) {
        const col = this.world.columns[i];
        this.drawn[i] = col && col.chunks.every((c) => c.hasMesh) ? 1 : 0;
      }
      this.onDrawnChange?.(this.drawn);
    }
    this.stats.columns = this.world.columns.reduce((n, c) => n + (c ? 1 : 0), 0);
    this.stats.genQueued = this.pendingCols.size;
    this.stats.meshQueued = this.meshing.size + this.dirty.size;
    let failed = 0;
    for (const f of this.genFails.values()) if (f.retryAt === Infinity) failed++;
    for (const n of this.meshFails.values()) if (n >= MESH_TRIES) failed++;
    this.stats.failed = failed;
  }

  /** A column could not be generated: wait, longer each time, before asking again; in the end leave it out. */
  private genFailed(key: number, cx: number, cz: number, e: unknown): void {
    const f = this.genFails.get(key) ?? { tries: 0, retryAt: 0 };
    const wait = GEN_RETRY_MS[f.tries];
    f.tries++;
    f.retryAt = wait === undefined ? Infinity : this.clock() + wait;
    this.genFails.set(key, f);
    if (wait === undefined) console.error(`column ${cx},${cz} failed ${f.tries} times: left out until the player comes back to it`, e);
    else console.warn(`column ${cx},${cz} failed: asking again in ${wait} ms`, e);
  }

  /** A chunk's mesh could not be built or drawn: ask once more, then leave it until the chunk changes. */
  private meshFailed(key: number, e: unknown): void {
    const col = this.world.column(Math.floor(key / CHUNKS_Y) % COLS_X, Math.floor(key / CHUNKS_Y / COLS_X));
    const ch = col?.chunks[key % CHUNKS_Y];
    if (!ch) { this.meshFails.delete(key); return; } // its column has gone: nothing to draw
    const n = (this.meshFails.get(key) ?? 0) + 1;
    this.meshFails.set(key, n);
    if (n < MESH_TRIES) {
      console.warn('meshing failed: asking again', key, e);
      ch.dirty = true;
      this.dirty.add(ch);
    } else console.error(`meshing failed ${n} times: chunk ${key} stays undrawn until it changes`, e);
  }

  /** Drops the whole loaded world (for loading a save or starting over); it streams back in. */
  reset(): void {
    this.epoch++;
    for (const col of this.world.columns) {
      if (!col) continue;
      for (const ch of col.chunks) this.renderer.removeChunk(ch.key);
      this.world.removeColumn(col.cx, col.cz);
    }
    this.pendingCols.clear();
    this.genFails.clear();
    this.meshFails.clear();
    this.dirty.clear();
    this.meshing.clear();
    this.urgent.clear();
    this.uploads = [];
    this.drawnDirty = true;
  }

  private onColumn(r: GenResult): void {
    const key = r.cz * COLS_X + r.cx;
    this.pendingCols.delete(key);
    this.genFails.delete(key);
    const pcx = Math.floor(this.px / CS), pcz = Math.floor(this.pz / CS);
    if (Math.hypot(r.cx - pcx, r.cz - pcz) > this.radius + 3) return; // the player has moved on
    if (this.world.column(r.cx, r.cz)) return;
    const col = this.world.addColumn(r.cx, r.cz, r.chunks);
    for (const ch of col.chunks) { ch.dirty = true; this.dirty.add(ch); }
    // Neighbours may now have their full neighbourhood: queue any that were waiting.
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const n = this.world.column(r.cx + dx, r.cz + dz);
        if (!n || n === col) continue;
        for (const ch of n.chunks) if (ch.dirty) this.dirty.add(ch);
      }
  }

  /** True when nothing near the player is waiting to load or mesh. */
  settledAround(x: number, z: number, cols: number): boolean {
    const pcx = Math.floor(x / CS), pcz = Math.floor(z / CS);
    for (let dz = -cols; dz <= cols; dz++)
      for (let dx = -cols; dx <= cols; dx++) {
        const cx = pcx + dx, cz = pcz + dz;
        if (cx < 0 || cz < 0 || cx >= COLS_X || cz >= COLS_Z) continue;
        const col = this.world.column(cx, cz);
        if (!col) {
          // A column given up on is not waiting on work: the game must not wait for it for ever.
          if (this.genFails.get(cz * COLS_X + cx)?.retryAt === Infinity) continue;
          return false;
        }
        // A column at the edge of what is loaded can't be meshed yet; it isn't waiting on work.
        if (!this.world.canMesh(cx, cz)) continue;
        for (const ch of col.chunks) if ((ch.dirty && !ch.empty) || this.meshing.has(chunkKey(ch.cx, ch.cy, ch.cz))) return false;
      }
    return this.uploads.length === 0;
  }
}
