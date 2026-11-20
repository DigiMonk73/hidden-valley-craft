// The path for weaker computers (docs/PHASE9B.md, 1): the engine's parts of it.
import { describe, it, expect } from 'vitest';
import { World, type Chunk } from '../src/world/world.ts';
import { Streamer, type ChunkSink } from '../src/world/streamer.ts';
import { createExecutor, type Executor } from '../src/jobs/pool.ts';
import { runJob, stepJob, type Job, type JobResult, type GenResult } from '../src/jobs/tasks.ts';
import { generateColumn, generateColumnSteps } from '../src/gen/terrain.ts';
import { CS, CHUNKS_Y, COLS_X, PS, PADDED_VOLUME, WORLD_Y } from '../src/world/constants.ts';
import { B_OPAQUE, blockId, AIR } from '../src/world/blocks.ts';
import type { ChunkMesh } from '../src/mesh/mesher.ts';
import { load } from './load.ts';

/** padded() as it was before it copied rows: one look-up a cell. The new one must give the same, cell for cell. */
function paddedSlow(w: World, c: Chunk): { blocks: Uint16Array; light: Uint8Array } {
  const blocks = new Uint16Array(PADDED_VOLUME), light = new Uint8Array(PADDED_VOLUME);
  const bx = c.cx * CS - 1, by = c.cy * CS - 1, bz = c.cz * CS - 1;
  let i = 0;
  for (let py = 0; py < PS; py++) for (let pz = 0; pz < PS; pz++) for (let px = 0; px < PS; px++, i++) {
    const id = w.blockAt(bx + px, by + py, bz + pz);
    blocks[i] = id;
    light[i] = B_OPAQUE[id] ? 0 : w.lightAt(bx + px, by + py, bz + pz);
  }
  return { blocks, light };
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

describe('the padded chunk handed to the mesher', () => {
  it('is the same, cell for cell, as looking every cell up: on the valley’s land, at unloaded edges, after edits', () => {
    // The home's cliff and the balcony (lamps, glass, water near by), three columns by three; the ring outside is not loaded.
    const w = load(55 * CS, 31 * CS, 57 * CS + 31, 33 * CS + 31);
    const r = rng(9), ids = [AIR, blockId('lantern'), blockId('glass'), blockId('water'), blockId('limestone'), blockId('leaves')];
    for (let k = 0; k < 400; k++) w.setBlock(55 * CS + Math.floor(r() * 96), 60 + Math.floor(r() * 70), 31 * CS + Math.floor(r() * 96), ids[Math.floor(r() * ids.length)]);
    let chunks = 0;
    for (const col of w.columns) {
      if (!col) continue;
      for (const ch of col.chunks) {
        const a = w.padded(ch), b = paddedSlow(w, ch);
        expect(Buffer.compare(Buffer.from(a.blocks.buffer), Buffer.from(b.blocks.buffer)), `blocks of ${ch.cx},${ch.cy},${ch.cz}`).toBe(0);
        expect(Buffer.compare(Buffer.from(a.light.buffer), Buffer.from(b.light.buffer)), `light of ${ch.cx},${ch.cy},${ch.cz}`).toBe(0);
        chunks++;
      }
    }
    expect(chunks).toBe(9 * CHUNKS_Y);
  });

  it('and at the world’s own corner, where two sides are off the map', () => {
    const w = load(0, 0, 31, 31);
    for (const ch of w.column(0, 0)!.chunks) {
      const a = w.padded(ch), b = paddedSlow(w, ch);
      expect(Buffer.compare(Buffer.from(a.blocks.buffer), Buffer.from(b.blocks.buffer))).toBe(0);
      expect(Buffer.compare(Buffer.from(a.light.buffer), Buffer.from(b.light.buffer))).toBe(0);
    }
  });
});

describe('a column built a part at a time (workers blocked)', () => {
  it('is the same column as one built in one go', () => {
    for (const [cx, cz] of [[56, 31], [49, 35], [20, 20]]) {
      const steps = generateColumnSteps(cx, cz);
      let parts = 0, out: Uint16Array | null = null;
      for (;;) { const s = steps.next(); parts++; if (s.done) { out = s.value; break; } }
      expect(parts).toBeGreaterThanOrEqual(5);
      expect(Buffer.compare(Buffer.from(out!.buffer), Buffer.from(generateColumn(cx, cz).buffer))).toBe(0);
    }
  });

  it('the job in parts gives what the job in one go gives, the player’s edits lit', () => {
    const job: Job = { kind: 'gen', cx: 56, cz: 31, edits: [2, 5 * 1024 + 5 * 32 + 5, blockId('lantern')] };
    const steps = stepJob(job);
    let done: JobResult | null = null, parts = 0;
    for (;;) { const s = steps.next(); parts++; if (s.done) { done = s.value.result; break; } }
    expect(parts).toBeGreaterThanOrEqual(7);
    expect(done).toEqual(runJob(job).result);
  });

  it('the main-thread fallback does a part a frame, not a column a frame, and still finishes every job', async () => {
    // No worker can start here (as in a sandboxed frame): the fallback takes over.
    const exec = await createExecutor(() => 0, 2, () => { throw new Error('workers are blocked'); });
    expect(exec.kind).toBe('main-thread');
    let got: JobResult | null = null;
    void exec.submit({ kind: 'gen', cx: 56, cz: 31, edits: [] }).then((r) => { got = r; });
    let second: JobResult | null = null;
    void exec.submit({ kind: 'gen', cx: 57, cz: 31, edits: [] }).then((r) => { second = r; });
    expect(exec.queued).toBe(2);
    let pumps = 0;
    while (!got && pumps < 100) { exec.pump(0); pumps++; await Promise.resolve(); }
    expect(got).not.toBeNull();
    expect(pumps).toBeGreaterThanOrEqual(7); // a frame with no budget does one part: the column takes several frames
    expect(second).toBeNull();
    expect(exec.queued).toBe(1);
    // With a budget, a frame does as many parts as fit.
    exec.pump(10_000);
    await Promise.resolve();
    expect(second).not.toBeNull();
    expect(exec.queued).toBe(0);
    expect((got as unknown as GenResult).chunks).toEqual((runJob({ kind: 'gen', cx: 56, cz: 31, edits: [] }).result as GenResult).chunks);
  });

  it('a job that throws part-way is rejected and the next one still runs', async () => {
    const exec = await createExecutor(() => 0, 1, () => { throw new Error('workers are blocked'); });
    const bad = exec.submit({ kind: 'mesh', key: 1, version: 0, blocks: null as unknown as Uint16Array, light: null as unknown as Uint8Array });
    let failed = '';
    bad.catch((e: Error) => { failed = e.message || 'failed'; });
    let ok = false;
    void exec.submit({ kind: 'gen', cx: 56, cz: 31, edits: [] }).then(() => { ok = true; });
    exec.pump(10_000);
    await Promise.resolve(); await Promise.resolve();
    expect(failed).not.toBe('');
    expect(ok).toBe(true);
  });
});

/** Answers each job at once (flat land), as the pool does when its workers are quick. */
class Sync implements Executor {
  readonly kind = 'main-thread' as const;
  readonly threads = 1;
  readonly queued = 0;
  submit(job: Job): Promise<JobResult> {
    if (job.kind === 'gen') {
      const stone = blockId('limestone');
      return Promise.resolve({ kind: 'gen', cx: job.cx, cz: job.cz, chunks: Array.from({ length: CHUNKS_Y }, (_, cy) => (cy <= 1 ? { blocks: stone, light: 0 } : { blocks: AIR, light: 0xf0 })) });
    }
    return Promise.resolve(runJob(job).result);
  }
  pump(): void {}
}
class View implements ChunkSink {
  meshes = new Map<number, ChunkMesh>();
  sets = 0;
  setChunkMesh(key: number, _x: number, _y: number, _z: number, m: ChunkMesh): void { this.meshes.set(key, m); this.sets++; }
  removeChunk(key: number): void { this.meshes.delete(key); }
}
const settle = (): Promise<void> => new Promise((r) => setImmediate(r));
const loaded = (w: World): number => w.columns.reduce((n, c) => n + (c ? 1 : 0), 0);

describe('columns are joined to the world one a frame', () => {
  const PX = 30 * CS + 16, PZ = 30 * CS + 16;

  it('with no budget a frame joins exactly one, the nearest first; the rest wait their turn', async () => {
    const world = new World(), view = new View(), s = new Streamer(world, new Sync(), view);
    s.radius = 3;
    s.update(PX, PZ); // asks for every column in view: all answer at once
    await settle();
    expect(loaded(world)).toBe(0);
    const order: number[] = [];
    let before = 0;
    for (let f = 0; f < 12; f++) {
      s.update(PX, PZ, 4, 0);
      await settle();
      expect(loaded(world) - before, `frame ${f}`).toBe(1);
      before = loaded(world);
      const fresh = world.columns.find((c) => c && !order.includes(c.cz * COLS_X + c.cx))!;
      order.push(fresh.cz * COLS_X + fresh.cx);
    }
    // Nearest first: the player's own column, then outward.
    expect(order[0]).toBe(30 * COLS_X + 30);
    const dist = order.map((k) => Math.hypot((k % COLS_X) - 30, Math.floor(k / COLS_X) - 30));
    for (let i = 1; i < dist.length; i++) expect(dist[i]).toBeGreaterThanOrEqual(dist[i - 1] - 1e-9);
    // And none is asked for twice while it waits.
    expect(s.stats.genQueued).toBeGreaterThan(0);
  });

  it('with a budget a frame joins as many as fit, and everything is drawn in the end', async () => {
    const world = new World(), view = new View(), s = new Streamer(world, new Sync(), view);
    s.radius = 2;
    for (let f = 0; f < 8; f++) { s.update(PX, PZ, 1000, 1000); await settle(); }
    expect(s.stats.genQueued).toBe(0);
    expect(s.settledAround(PX, PZ, 2)).toBe(true);
    expect(view.meshes.size).toBeGreaterThan(0);
  });

  it('the game is not "settled" while a column near the player still waits to be joined', async () => {
    const world = new World(), s = new Streamer(world, new Sync(), new View());
    s.radius = 2;
    s.update(PX, PZ);
    await settle();
    s.update(PX, PZ, 4, 0);
    expect(s.settledAround(PX, PZ, 1)).toBe(false);
  });

  it('reset() forgets the columns waiting to be joined (a save was loaded)', async () => {
    const world = new World(), s = new Streamer(world, new Sync(), new View());
    s.radius = 2;
    s.update(PX, PZ);
    await settle();
    s.reset();
    s.update(PX + 600, PZ, 1000, 1000); // somewhere else: none of the old answers may land there or here
    await settle();
    expect(world.column(30, 30)).toBeNull();
  });
});

describe('after the picture was lost and came back', () => {
  it('remeshAll() has every drawn chunk meshed and handed over again, and the land counts as undrawn meanwhile', async () => {
    const PX = 30 * CS + 16, PZ = 30 * CS + 16;
    const world = new World(), view = new View(), s = new Streamer(world, new Sync(), view);
    s.radius = 2;
    for (let f = 0; f < 8; f++) { s.update(PX, PZ, 1000, 1000); await settle(); }
    const had = [...view.meshes.keys()].sort((a, b) => a - b);
    expect(had.length).toBeGreaterThan(0);
    const setsBefore = view.sets;
    let masks = 0, lastSum = -1;
    s.onDrawnChange = (m) => { masks++; lastSum = m.reduce((n, v) => n + v, 0); };
    s.remeshAll();
    expect(view.meshes.size).toBe(0); // the old picture's meshes are let go
    s.update(PX, PZ, 1000, 1000);
    expect(lastSum).toBe(0); // the distant land shows where nothing real is drawn yet
    for (let f = 0; f < 8; f++) { await settle(); s.update(PX, PZ, 1000, 1000); }
    expect([...view.meshes.keys()].sort((a, b) => a - b)).toEqual(had);
    expect(view.sets - setsBefore).toBeGreaterThanOrEqual(had.length);
    expect(lastSum).toBeGreaterThan(0);
    expect(masks).toBeGreaterThanOrEqual(2);
    expect(s.settledAround(PX, PZ, 2)).toBe(true);
    void WORLD_Y;
  });
});
