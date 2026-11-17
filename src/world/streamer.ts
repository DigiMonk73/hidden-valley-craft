// Keeps the world loaded around the player: asks workers for nearby columns, joins them into the
// world, meshes chunks once their neighbours are in, and lets far columns go (their edits stay).

import { CS, CHUNKS_Y, COLS_X, COLS_Z, chunkKey } from './constants.ts';
import type { World, Chunk } from './world.ts';
import type { Executor } from '../jobs/pool.ts';
import type { Job, GenResult, MeshResult } from '../jobs/tasks.ts';
import type { Renderer } from '../render/renderer.ts';

export class Streamer {
  private world: World;
  private exec: Executor;
  private renderer: Renderer;
  private pendingCols = new Set<number>();
  private dirty = new Set<Chunk>();
  private meshing = new Map<number, number>(); // chunk key → version being meshed
  private urgent = new Set<number>(); // chunk keys changed by the player: mesh first
  private uploads: { key: number; result: MeshResult }[] = [];
  /** Bumped by reset(): results of jobs sent before it are dropped. */
  private epoch = 0;
  private px = 0;
  private pz = 0;
  radius = 8; // columns
  stats = { columns: 0, genQueued: 0, meshQueued: 0 };

  constructor(world: World, exec: Executor, renderer: Renderer) {
    this.world = world;
    this.exec = exec;
    this.renderer = renderer;
    world.onChunkDirty = (c) => this.dirty.add(c);
  }

  /** Lower runs sooner: nearest first, the player's own edits before anything. */
  priority = (job: Job): number => {
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
    const r = this.radius;
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
    for (const [cx, cz] of this.wanted(x, z)) {
      const key = cz * COLS_X + cx;
      if (this.world.column(cx, cz) || this.pendingCols.has(key)) continue;
      this.pendingCols.add(key);
      const job: Job = { kind: 'gen', cx, cz, edits: this.world.columnEdits(cx, cz) };
      const epoch = this.epoch;
      this.exec.submit(job).then((r) => { if (epoch === this.epoch) this.onColumn(r as GenResult); }, (e) => {
        if (epoch !== this.epoch) return;
        this.pendingCols.delete(key);
        console.error('column generation failed', cx, cz, e);
      });
    }
    // 2. Let far columns go.
    const pcx = Math.floor(x / CS), pcz = Math.floor(z / CS);
    const keep = this.radius + 2;
    for (const col of this.world.columns) {
      if (!col) continue;
      if (Math.hypot(col.cx - pcx, col.cz - pcz) <= keep) continue;
      for (const ch of col.chunks) { this.renderer.removeChunk(ch.key); this.dirty.delete(ch); }
      this.world.removeColumn(col.cx, col.cz);
    }
    // 3. Mesh chunks that changed, once their neighbourhood is loaded.
    const start = performance.now();
    for (const ch of this.dirty) {
      if (this.meshing.has(ch.key)) continue;
      if (!this.world.column(ch.cx, ch.cz)) { this.dirty.delete(ch); continue; }
      if (!this.world.canMesh(ch.cx, ch.cz)) continue;
      this.dirty.delete(ch);
      ch.dirty = false;
      if (ch.empty) { this.renderer.removeChunk(ch.key); continue; }
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
        console.error('meshing failed', key, e);
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
      this.renderer.setChunkMesh(key, cx, cy, cz, result.mesh);
      if (ch.version !== result.version) { ch.dirty = true; this.dirty.add(ch); } // changed while meshing
      else this.urgent.delete(key);
    }
    this.stats.columns = this.world.columns.reduce((n, c) => n + (c ? 1 : 0), 0);
    this.stats.genQueued = this.pendingCols.size;
    this.stats.meshQueued = this.meshing.size + this.dirty.size;
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
    this.dirty.clear();
    this.meshing.clear();
    this.urgent.clear();
    this.uploads = [];
  }

  private onColumn(r: GenResult): void {
    const key = r.cz * COLS_X + r.cx;
    this.pendingCols.delete(key);
    const pcx = Math.floor(this.px / CS), pcz = Math.floor(this.pz / CS);
    if (Math.hypot(r.cx - pcx, r.cz - pcz) > this.radius + 2) return; // the player has moved on
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
        if (!col) return false;
        // A column at the edge of what is loaded can't be meshed yet; it isn't waiting on work.
        if (!this.world.canMesh(cx, cz)) continue;
        for (const ch of col.chunks) if ((ch.dirty && !ch.empty) || this.meshing.has(chunkKey(ch.cx, ch.cy, ch.cz))) return false;
      }
    return this.uploads.length === 0;
  }
}
