// Failures that must not leave the player with a dead page (docs/REVIEW.md, N8): a worker that
// stops, a job that throws, a picture the browser takes away, a file that can't be read.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { WebGLGeometries } from 'three/src/renderers/webgl/WebGLGeometries.js';
import { createExecutor, type Executor, type WorkerLike } from '../src/jobs/pool.ts';
import { runJob, type Job, type JobResult, type GenJob, type GenResult, type MeshJob } from '../src/jobs/tasks.ts';
import { Streamer, GEN_RETRY_MS, MESH_TRIES, type ChunkSink } from '../src/world/streamer.ts';
import { World } from '../src/world/world.ts';
import { CS, CHUNKS_Y, COLS_X, PADDED_VOLUME, chunkKey } from '../src/world/constants.ts';
import { blockId, AIR } from '../src/world/blocks.ts';
import type { ChunkMesh } from '../src/mesh/mesher.ts';
import { watchContext } from '../src/platform/context.ts';
import { pickFile } from '../src/platform/fileio.ts';
import { disposeChunkGeometry } from '../src/render/chunkGeometry.ts';

afterEach(() => {
  // A replacement still starting holds a four-second timer: let each say it is ready, which clears it.
  for (const w of everyWorker.splice(0)) w.ready();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Lets every promise that is ready run its callbacks. */
const settle = (): Promise<void> => new Promise((r) => setImmediate(r));
const quiet = (): void => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
};

// ---- The worker pool --------------------------------------------------------------------------

/** A worker the test drives by hand: it answers, stops or stays silent when told to. */
class FakeWorker implements WorkerLike {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  onmessageerror: ((e: MessageEvent) => void) | null = null;
  sent: { id: number; job: Job }[] = [];
  terminated = false;
  refuseNext = false;

  postMessage(message: unknown, transfer: Transferable[]): void {
    if (this.refuseNext) { this.refuseNext = false; throw new Error('could not be sent'); }
    // As in a browser, what is transferred is gone from the sender.
    if (transfer.length) structuredClone(transfer, { transfer });
    this.sent.push(message as { id: number; job: Job });
  }
  terminate(): void { this.terminated = true; }

  say(data: unknown): void { this.onmessage?.({ data } as MessageEvent); }
  ready(): void { this.say({ ready: true }); }
  /** The last job it was sent, or undefined if it holds none. */
  get holding(): { id: number; job: Job } | undefined { return this.sent[this.sent.length - 1]; }
  answer(result: JobResult = { kind: 'gen', cx: 0, cz: 0, chunks: [] }): void { this.say({ id: this.holding!.id, result }); }
  crash(message = 'out of memory'): void { this.onerror?.({ message } as ErrorEvent); }
  garble(): void { this.onmessageerror?.({ data: null } as MessageEvent); }
}

const everyWorker: FakeWorker[] = [];

/** A pool of fake workers, all started. `made` lists every worker ever asked for, in order. */
async function fakePool(want: number, makeMore: (n: number) => boolean = () => true): Promise<{ exec: Executor; made: FakeWorker[] }> {
  const made: FakeWorker[] = [];
  const starting = createExecutor(() => 0, want, () => {
    if (!makeMore(made.length)) throw new Error('workers are blocked');
    const w = new FakeWorker();
    made.push(w);
    everyWorker.push(w);
    return w;
  });
  for (const w of made) w.ready();
  return { exec: await starting, made };
}

const gen = (cx: number, cz: number): GenJob => ({ kind: 'gen', cx, cz, edits: [] });
const meshJob = (key: number): MeshJob => ({ kind: 'mesh', key, version: 0, blocks: new Uint16Array(PADDED_VOLUME), light: new Uint8Array(PADDED_VOLUME) });
const outcome = (p: Promise<JobResult>): Promise<string> => p.then((r) => `done ${r.kind}`, (e: Error) => `failed: ${e.message}`);

describe('the worker pool when a worker stops (N8)', () => {
  it('uses the workers it was given', async () => {
    const { exec, made } = await fakePool(3);
    expect(exec.kind).toBe('workers');
    expect(exec.threads).toBe(3);
    const done = outcome(exec.submit(gen(1, 2)));
    const holder = made.find((w) => w.holding)!;
    expect(exec.queued).toBe(1);
    holder.answer({ kind: 'gen', cx: 1, cz: 2, chunks: [] });
    expect(await done).toBe('done gen');
    expect(exec.queued).toBe(0);
    expect(made.length).toBe(3); // nothing was replaced
  });

  it('a worker that dies mid-job: the job goes to another worker and still settles', async () => {
    quiet();
    const { exec, made } = await fakePool(2);
    const done = outcome(exec.submit(gen(5, 6)));
    const first = made.find((w) => w.holding)!;
    const other = made.find((w) => w !== first)!;
    first.crash();
    expect(first.terminated).toBe(true);
    expect(other.holding?.job).toEqual(gen(5, 6)); // passed on at once
    expect(made.length).toBe(3); // and a replacement was started for the one that stopped
    other.answer({ kind: 'gen', cx: 5, cz: 6, chunks: [] });
    expect(await done).toBe('done gen');
    // The replacement serves jobs once it has said it is ready, not before.
    const later = outcome(exec.submit(gen(7, 7))), later2 = outcome(exec.submit(gen(8, 8)));
    expect(made[2].holding).toBeUndefined();
    made[2].ready();
    expect(made[2].holding?.job).toEqual(gen(8, 8));
    other.answer(); made[2].answer();
    expect(await later).toBe('done gen');
    expect(await later2).toBe('done gen');
  });

  it('a job that fails twice is rejected, and the pool still serves later jobs', async () => {
    quiet();
    const { exec, made } = await fakePool(1);
    const done = outcome(exec.submit(gen(9, 9)));
    made[0].crash();
    expect(made.length).toBe(2);
    made[1].ready();
    expect(made[1].holding?.job).toEqual(gen(9, 9)); // its one second chance
    made[1].crash('gone again');
    expect(await done).toMatch(/^failed: a worker stopped during a gen job: gone again/);
    expect(made.length).toBe(3);
    made[2].ready();
    const next = outcome(exec.submit(gen(1, 1)));
    made[2].answer();
    expect(await next).toBe('done gen');
    expect(exec.kind).toBe('workers');
  });

  it('an answer that can’t be read counts as the worker stopping', async () => {
    quiet();
    const { exec, made } = await fakePool(2);
    const done = outcome(exec.submit(gen(3, 3)));
    const first = made.find((w) => w.holding)!;
    first.garble();
    const other = made.find((w) => w !== first && w.holding)!;
    other.answer();
    expect(await done).toBe('done gen');
  });

  it('a mesh job’s arrays went with the worker: it is rejected at once, for the streamer to build again', async () => {
    quiet();
    const { exec, made } = await fakePool(2);
    const job = meshJob(77);
    const done = outcome(exec.submit(job));
    expect(job.blocks.byteLength).toBe(0); // transferred away
    made.find((w) => w.holding)!.crash();
    expect(await done).toMatch(/^failed: a worker stopped during a mesh job/);
    expect(made.filter((w) => w.sent.length > 0).length).toBe(1); // never sent a second time, empty
  });

  it('a job the worker itself reports as failed is rejected and not run again', async () => {
    const { exec, made } = await fakePool(2);
    const done = outcome(exec.submit(gen(4, 4)));
    const holder = made.find((w) => w.holding)!;
    holder.say({ id: holder.holding!.id, error: 'Error: bad column' });
    expect(await done).toBe('failed: Error: bad column');
    expect(made.reduce((n, w) => n + w.sent.length, 0)).toBe(1);
    expect(made.length).toBe(2);
  });

  it('a job that can’t be sent is rejected and the worker stays free', async () => {
    const { exec, made } = await fakePool(1);
    made[0].refuseNext = true;
    const lost = outcome(exec.submit(gen(1, 1)));
    const kept = outcome(exec.submit(gen(2, 2)));
    expect(await lost).toBe('failed: could not be sent');
    made[0].answer();
    expect(await kept).toBe('done gen');
  });

  it('when every worker is gone the main thread takes over: waiting jobs still finish', async () => {
    quiet();
    const { exec, made } = await fakePool(2, (n) => n < 2); // no replacement can be started
    const a = exec.submit(gen(52, 32)), b = exec.submit(gen(53, 32)), c = exec.submit(gen(54, 32));
    for (const w of [...made]) w.crash();
    expect(exec.kind).toBe('main-thread');
    expect(exec.threads).toBe(1);
    expect(exec.queued).toBe(3);
    const late = exec.submit(gen(55, 32)); // asked for after the change-over
    for (let i = 0; i < 50 && exec.queued > 0; i++) exec.pump(50);
    const results = await Promise.all([a, b, c, late]);
    expect(results.map((r) => r.kind === 'gen' && r.cx)).toEqual([52, 53, 54, 55]);
    expect(results.every((r) => r.kind === 'gen' && r.chunks.length === CHUNKS_Y)).toBe(true);
  });

  it('replacements that never start are given up on: the pool does not wait for ever', async () => {
    quiet();
    const { exec, made } = await fakePool(1);
    vi.useFakeTimers();
    const done = exec.submit(gen(52, 32));
    made[0].crash();
    // Each replacement stays silent; after its four seconds it is let go and another is tried, a few times.
    for (let i = 0; i < 20 && exec.kind === 'workers'; i++) await vi.advanceTimersByTimeAsync(4000);
    expect(exec.kind).toBe('main-thread');
    expect(made.length).toBeLessThan(10);
    expect(made.every((w) => w.terminated)).toBe(true);
    const n = made.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(made.length).toBe(n); // and no more are started
    vi.useRealTimers();
    for (let i = 0; i < 50 && exec.queued > 0; i++) exec.pump(50);
    expect((await done).kind).toBe('gen');
  });

  it('with no workers at all (a sandboxed frame) the main thread runs the jobs, and a throwing job rejects', async () => {
    quiet();
    const exec = await createExecutor(() => 0, 2, () => { throw new Error('blocked'); });
    expect(exec.kind).toBe('main-thread');
    const bad = outcome(exec.submit({ kind: 'mesh', key: 1, version: 0, blocks: new Uint16Array(1), light: null as unknown as Uint8Array }));
    const good = exec.submit(meshJob(2));
    for (let i = 0; i < 10 && exec.queued > 0; i++) exec.pump(50);
    expect(await bad).toMatch(/^failed: /);
    expect((await good).kind).toBe('mesh');
  });
});

// ---- The streamer ---------------------------------------------------------------------------------

/** Flat land, quick to make: two chunks of limestone under open sky. The ground's top is chunk 1. */
const GROUND_CY = 1, GROUND_Y = 2 * CS - 1;
function flatColumn(cx: number, cz: number): GenResult {
  const stone = blockId('limestone');
  return { kind: 'gen', cx, cz, chunks: Array.from({ length: CHUNKS_Y }, (_, cy) => (cy <= GROUND_CY ? { blocks: stone, light: 0 } : { blocks: AIR, light: 0xf0 })) };
}

/** Runs each job the moment it is asked for; `fail` picks the ones that throw instead. */
class SyncExecutor implements Executor {
  readonly kind = 'main-thread' as const;
  readonly threads = 1;
  readonly queued = 0;
  asked: Job[] = [];
  fail: (job: Job) => boolean = () => false;
  /** Flat land instead of the real generator (meshing is always the real mesher). */
  flat: boolean;
  constructor(flat: boolean) { this.flat = flat; }
  submit(job: Job): Promise<JobResult> {
    this.asked.push(job);
    try {
      if (this.fail(job)) throw new Error('made to fail');
      return Promise.resolve(this.flat && job.kind === 'gen' ? flatColumn(job.cx, job.cz) : runJob(job).result);
    } catch (e) {
      return Promise.reject(e);
    }
  }
  pump(): void {}
  gens(cx: number, cz: number): number { return this.asked.filter((j) => j.kind === 'gen' && j.cx === cx && j.cz === cz).length; }
  meshes(key: number): number { return this.asked.filter((j) => j.kind === 'mesh' && j.key === key).length; }
}

/** Stands in for the renderer: remembers which chunks hold a mesh. */
class StubRenderer implements ChunkSink {
  meshes = new Map<number, ChunkMesh>();
  refuse: (key: number) => boolean = () => false;
  setChunkMesh(key: number, _cx: number, _cy: number, _cz: number, mesh: ChunkMesh): void {
    this.meshes.delete(key);
    if (this.refuse(key)) throw new Error(`chunk ${key} has too many quads`);
    this.meshes.set(key, mesh);
  }
  removeChunk(key: number): void { this.meshes.delete(key); }
}

function rig(radius = 1, flat = true): { world: World; exec: SyncExecutor; view: StubRenderer; s: Streamer; clock: { t: number } } {
  const world = new World(), exec = new SyncExecutor(flat), view = new StubRenderer();
  const s = new Streamer(world, exec, view);
  const clock = { t: 1000 };
  s.radius = radius;
  s.clock = () => clock.t;
  return { world, exec, view, s, clock };
}

/** Frames at one place (the clock standing still unless `stepMs` is given). */
async function frames(r: ReturnType<typeof rig>, x: number, z: number, n: number, stepMs = 0): Promise<void> {
  for (let i = 0; i < n; i++) {
    r.clock.t += stepMs;
    r.s.update(x, z, 1000, 1000); // (a budget for joining arrived columns too: with none, one is joined a frame)
    await settle();
  }
}

// The valley floor (when the land is real), at the middle of a column.
const PX = 53 * CS + 16, PZ = 32 * CS + 16;
const PCX = 53, PCZ = 32;

/** Every column near the player is in, and every chunk that can be drawn is. */
function drawnAround(r: ReturnType<typeof rig>, pcx: number, pcz: number): string[] {
  const missing: string[] = [];
  for (let dz = -r.s.radius; dz <= r.s.radius; dz++)
    for (let dx = -r.s.radius; dx <= r.s.radius; dx++) {
      if (Math.hypot(dx, dz) > r.s.radius) continue;
      const col = r.world.column(pcx + dx, pcz + dz);
      if (!col) { missing.push(`column ${pcx + dx},${pcz + dz}`); continue; }
      for (const ch of col.chunks) {
        if (!ch.hasMesh || ch.dirty) missing.push(`chunk ${ch.cx},${ch.cy},${ch.cz} not drawn`);
        else if (!ch.empty && !r.view.meshes.has(ch.key)) missing.push(`chunk ${ch.cx},${ch.cy},${ch.cz} has no mesh`);
      }
    }
  return missing;
}

describe('the streamer when a job fails (N8)', () => {
  it('a failing generation job is not asked for again every frame: it waits, longer each time, then stops', async () => {
    quiet();
    const r = rig();
    const bad = (j: Job): boolean => j.kind === 'gen' && j.cx === PCX + 1 && j.cz === PCZ;
    r.exec.fail = bad;
    await frames(r, PX, PZ, 60);
    expect(r.exec.gens(PCX + 1, PCZ)).toBe(1); // 60 frames, one try (it used to be 60)
    expect(r.world.column(PCX, PCZ)).not.toBeNull(); // the rest came in
    expect(r.s.settledAround(PX, PZ, 1)).toBe(false); // still hoping for it
    expect(r.s.stats.failed).toBe(0);

    // Each wait must pass in full before the next try.
    let tries = 1;
    for (const wait of GEN_RETRY_MS) {
      r.clock.t += wait - 1;
      await frames(r, PX, PZ, 5);
      expect(r.exec.gens(PCX + 1, PCZ)).toBe(tries);
      r.clock.t += 1;
      await frames(r, PX, PZ, 5);
      expect(r.exec.gens(PCX + 1, PCZ)).toBe(++tries);
    }
    // Then it is left out for good: nothing loops for ever.
    await frames(r, PX, PZ, 200, 60_000);
    expect(r.exec.gens(PCX + 1, PCZ)).toBe(GEN_RETRY_MS.length + 1);
    expect(r.s.stats.failed).toBe(1);
    expect(r.s.stats.genQueued).toBe(0);
    // The game does not wait at "loading" for a column that will never come.
    expect(r.s.settledAround(PX, PZ, 1)).toBe(true);
  });

  it('a column that fails once and then works comes in after the wait', async () => {
    quiet();
    const r = rig();
    let failures = 1;
    r.exec.fail = (j) => j.kind === 'gen' && j.cx === PCX && j.cz === PCZ && failures-- > 0;
    await frames(r, PX, PZ, 10);
    expect(r.world.column(PCX, PCZ)).toBeNull();
    await frames(r, PX, PZ, 10, GEN_RETRY_MS[0]);
    expect(r.exec.gens(PCX, PCZ)).toBe(2);
    expect(drawnAround(r, PCX, PCZ)).toEqual([]);
    expect(r.s.stats.failed).toBe(0);
  });

  it('reset() clears a column’s mark', async () => {
    quiet();
    const r = rig();
    let broken = true;
    r.exec.fail = (j) => broken && j.kind === 'gen' && j.cx === PCX + 1 && j.cz === PCZ;
    await frames(r, PX, PZ, 40, 10_000);
    expect(r.s.stats.failed).toBe(1);
    const tries = r.exec.gens(PCX + 1, PCZ);
    broken = false;
    await frames(r, PX, PZ, 20, 60_000);
    expect(r.exec.gens(PCX + 1, PCZ)).toBe(tries); // marked: not asked for, though it would work now

    r.s.reset();
    await frames(r, PX, PZ, 10);
    expect(r.exec.gens(PCX + 1, PCZ)).toBe(tries + 1);
    expect(r.s.stats.failed).toBe(0);
    expect(drawnAround(r, PCX, PCZ)).toEqual([]);
  });

  it('a column given up on is asked for afresh when the player comes back to it', async () => {
    quiet();
    const r = rig();
    let broken = true;
    r.exec.fail = (j) => broken && j.kind === 'gen' && j.cx === PCX + 1 && j.cz === PCZ;
    await frames(r, PX, PZ, 40, 10_000);
    expect(r.s.stats.failed).toBe(1);
    broken = false;
    await frames(r, PX - 12 * CS, PZ, 5); // far enough that the land here is let go
    expect(r.s.stats.failed).toBe(0);
    await frames(r, PX, PZ, 10);
    expect(drawnAround(r, PCX, PCZ)).toEqual([]);
  });

  it('a mesh job that fails once is asked for again and drawn', async () => {
    quiet();
    const r = rig();
    const key = chunkKey(PCX, GROUND_CY, PCZ);
    let failures = 1;
    r.exec.fail = (j) => j.kind === 'mesh' && j.key === key && failures-- > 0;
    await frames(r, PX, PZ, 12);
    expect(r.exec.meshes(key)).toBe(2);
    expect(r.view.meshes.get(key)!.solid.quads).toBeGreaterThan(0); // (it used to stay a hole until edited)
    expect(drawnAround(r, PCX, PCZ)).toEqual([]);
    expect(r.s.stats.failed).toBe(0);
  });

  it('a mesh job that keeps failing is asked for twice, then left until the chunk changes', async () => {
    quiet();
    const r = rig();
    const key = chunkKey(PCX, GROUND_CY, PCZ);
    let broken = true;
    r.exec.fail = (j) => broken && j.kind === 'mesh' && j.key === key;
    await frames(r, PX, PZ, 100, 1000);
    expect(r.exec.meshes(key)).toBe(MESH_TRIES);
    expect(r.view.meshes.has(key)).toBe(false);
    expect(r.s.stats.failed).toBe(1);
    expect(r.s.settledAround(PX, PZ, 1)).toBe(true); // not waited for

    // An edit in the chunk clears the mark: two more tries while it still fails…
    expect(r.world.setBlock(PX, GROUND_Y - 3, PZ, blockId('planks'))).toBe(true);
    await frames(r, PX, PZ, 50);
    expect(r.exec.meshes(key)).toBe(MESH_TRIES * 2);
    // …and once it works, the next change draws it.
    broken = false;
    expect(r.world.setBlock(PX, GROUND_Y, PZ, AIR)).toBe(true);
    await frames(r, PX, PZ, 10);
    expect(r.view.meshes.has(key)).toBe(true);
    expect(r.s.stats.failed).toBe(0);
    expect(drawnAround(r, PCX, PCZ)).toEqual([]);
  });

  it('a mesh the renderer refuses does not stop the frame, and is not handed over for ever', async () => {
    quiet();
    const r = rig();
    const key = chunkKey(PCX, GROUND_CY, PCZ);
    r.view.refuse = (k) => k === key;
    await frames(r, PX, PZ, 60); // update() throwing would fail here
    expect(r.exec.meshes(key)).toBe(MESH_TRIES);
    expect(r.s.stats.failed).toBe(1);
    // Everything else was still drawn.
    expect(drawnAround(r, PCX, PCZ)).toEqual([`chunk ${PCX},${GROUND_CY},${PCZ} not drawn`]);
  });

  /** Walks west from the start, checking on the way; returns the column the walk ends in. */
  async function walkWest(r: ReturnType<typeof rig>, columns: number): Promise<number> {
    const far = PX - columns * CS, steps = columns * 2;
    for (let i = 1; i <= steps; i++) {
      const x = PX + ((far - PX) * i) / steps;
      await frames(r, x, PZ, 2);
      if (i % 8 === 0) {
        await frames(r, x, PZ, 2); // stand a moment: what was just asked for arrives and is drawn
        expect(drawnAround(r, Math.floor(x / CS), PCZ), `at x=${x}`).toEqual([]);
      }
    }
    await frames(r, far, PZ, 3);
    const fcx = Math.floor(far / CS);
    expect(drawnAround(r, fcx, PCZ)).toEqual([]);
    // The land left behind is gone, and so are its meshes: every mesh belongs to a loaded column.
    expect(r.world.column(PCX, PCZ)).toBeNull();
    for (const col of r.world.columns) if (col) expect(Math.hypot(col.cx - fcx, col.cz - PCZ)).toBeLessThanOrEqual(r.s.radius + 3);
    expect(r.view.meshes.size).toBeGreaterThan(0);
    for (const key of r.view.meshes.keys()) {
      const col = r.world.column(Math.floor(key / CHUNKS_Y) % COLS_X, Math.floor(key / CHUNKS_Y / COLS_X));
      expect(col, `mesh ${key} outlived its column`).not.toBeNull();
    }
    // No column was asked for twice on the way out.
    const gens = new Map<string, number>();
    for (const j of r.exec.asked) if (j.kind === 'gen') gens.set(`${j.cx},${j.cz}`, (gens.get(`${j.cx},${j.cz}`) ?? 0) + 1);
    expect(Math.max(...gens.values())).toBe(1);
    expect(r.s.stats.failed).toBe(0);
    return fcx;
  }

  it('a healthy walk over real land draws every chunk, lets the land behind go, and keeps the player’s edits', async () => {
    const r = rig(1, false);
    const errors = vi.spyOn(console, 'error'), warns = vi.spyOn(console, 'warn');
    await frames(r, PX, PZ, 4);
    expect(drawnAround(r, PCX, PCZ)).toEqual([]);
    const mark: [number, number, number] = [PX, 2 * CS + 30, PZ];
    expect(r.world.setBlock(...mark, blockId('planks'))).toBe(true);
    await walkWest(r, 6);
    // Back home: the edit is still there, and drawn.
    await frames(r, PX, PZ, 4);
    expect(drawnAround(r, PCX, PCZ)).toEqual([]);
    expect(r.world.blockAt(...mark)).toBe(blockId('planks'));
    expect(errors).not.toHaveBeenCalled();
    expect(warns).not.toHaveBeenCalled();
  }, 60_000);

  it('a healthy walk of a kilometre over flat land: the same at length, and nothing piles up', async () => {
    const r = rig();
    const errors = vi.spyOn(console, 'error'), warns = vi.spyOn(console, 'warn');
    await frames(r, PX, PZ, 4);
    const fcx = await walkWest(r, 32);
    expect(fcx).toBe(PCX - 32);
    expect(r.exec.asked.filter((j) => j.kind === 'gen').length).toBeGreaterThan(150);
    // Nothing is left waiting but the chunks at the loaded edge, which can't be meshed yet.
    expect(r.s.stats.genQueued).toBe(0);
    expect(r.s.stats.meshQueued).toBeLessThanOrEqual(r.s.stats.columns * CHUNKS_Y);
    expect(r.s.settledAround(fcx * CS + 16, PZ, 1)).toBe(true);
    expect(errors).not.toHaveBeenCalled();
    expect(warns).not.toHaveBeenCalled();
  }, 60_000);
});

// ---- The picture ------------------------------------------------------------------------------------

describe('a lost WebGL context (N8)', () => {
  const lostEvent = (): Event => new Event('webglcontextlost', { cancelable: true });
  const restoredEvent = (): Event => new Event('webglcontextrestored');

  it('refuses the loss (so the browser may restore it), tells the game once, and tells it when it is back', () => {
    const canvas = new EventTarget();
    const heard: string[] = [];
    const w = watchContext(canvas, { onLost: () => heard.push('lost'), onRestored: () => heard.push('back'), onStuck: () => heard.push('stuck') });
    expect(w.lost).toBe(false);
    const e = lostEvent();
    canvas.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(w.lost).toBe(true);
    canvas.dispatchEvent(lostEvent());
    expect(heard).toEqual(['lost']);
    canvas.dispatchEvent(restoredEvent());
    expect(w.lost).toBe(false);
    expect(heard).toEqual(['lost', 'back']);
    canvas.dispatchEvent(lostEvent());
    canvas.dispatchEvent(restoredEvent());
    expect(heard).toEqual(['lost', 'back', 'lost', 'back']);
  });

  it('says so when the picture stays away, and not when it came back in time', async () => {
    vi.useFakeTimers();
    const canvas = new EventTarget();
    const heard: string[] = [];
    watchContext(canvas, { onLost: () => heard.push('lost'), onRestored: () => heard.push('back'), onStuck: () => heard.push('stuck') }, 5000);
    canvas.dispatchEvent(lostEvent());
    await vi.advanceTimersByTimeAsync(4000);
    canvas.dispatchEvent(restoredEvent());
    await vi.advanceTimersByTimeAsync(60_000);
    expect(heard).toEqual(['lost', 'back']);
    canvas.dispatchEvent(lostEvent());
    await vi.advanceTimersByTimeAsync(5000);
    expect(heard).toEqual(['lost', 'back', 'lost', 'stuck']);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(heard.filter((h) => h === 'stuck').length).toBe(1);
    canvas.dispatchEvent(restoredEvent()); // late, but it did come back
    expect(heard[heard.length - 1]).toBe('back');
  });

  it('a listener that throws is contained, and a canvas that can’t be listened to is no error', () => {
    quiet();
    const canvas = new EventTarget();
    const w = watchContext(canvas, { onLost: () => { throw new Error('the menu broke'); }, onRestored: () => {}, onStuck: () => {} });
    expect(() => canvas.dispatchEvent(lostEvent())).not.toThrow();
    expect(w.lost).toBe(true);
    const blocked = { addEventListener(): void { throw new Error('blocked'); } };
    expect(watchContext(blocked, { onLost: () => {}, onRestored: () => {}, onStuck: () => {} }).lost).toBe(false);
  });
});

// ---- The shared index buffer ----------------------------------------------------------------------

describe('the index buffer every chunk shares (N8)', () => {
  // three.js's own bookkeeping for geometries (r187), with the graphics card's side recorded.
  type Geometries = { get(object: unknown, g: THREE.BufferGeometry): THREE.BufferGeometry };
  function threeGeometries(): { geometries: Geometries; deleted: unknown[] } {
    const deleted: unknown[] = [];
    const attributes = { remove: (a: unknown) => deleted.push(a), update: () => {}, get: () => undefined };
    const info = { memory: { geometries: 0 } };
    const bindingStates = { releaseStatesOfGeometry: () => {} };
    const Make = WebGLGeometries as unknown as new (gl: unknown, attributes: unknown, info: unknown, bindingStates: unknown) => Geometries;
    return { geometries: new Make({}, attributes, info, bindingStates), deleted };
  }
  function chunkGeometry(index: THREE.BufferAttribute): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    g.setIndex(index);
    return g;
  }

  it('three.js deletes a disposed geometry’s index, shared or not; a chunk’s geometry leaves it alone', () => {
    const index = new THREE.BufferAttribute(new Uint32Array([0, 1, 2, 0, 2, 3]), 1);
    const { geometries, deleted } = threeGeometries();
    const a = chunkGeometry(index), b = chunkGeometry(index), c = chunkGeometry(index);
    for (const g of [a, b, c]) geometries.get(null, g); // as when each is first drawn

    disposeChunkGeometry(a);
    expect(deleted).toContain(a.getAttribute('position')); // its own buffers go
    expect(deleted).not.toContain(index); // the shared one stays on the card for b and c
    expect(b.index).toBe(index);

    b.dispose(); // what the renderer used to do
    expect(deleted).toContain(index);
  });

  it('the renderer disposes chunk geometry only that way', () => {
    const src = readFileSync(new URL('../src/render/renderer.ts', import.meta.url), 'utf8');
    expect(src).toContain('disposeChunkGeometry(m.geometry)');
    expect(src).not.toMatch(/geometry\.dispose\(\)/);
  });
});

// ---- Reading a file -----------------------------------------------------------------------------------

describe('the file picker (N8)', () => {
  type FakeInput = { type: string; accept: string; files: { arrayBuffer(): Promise<ArrayBuffer> }[]; onchange: (() => Promise<void>) | null; click(): void };
  function withInput(file: { arrayBuffer(): Promise<ArrayBuffer> }): FakeInput {
    const input: FakeInput = { type: '', accept: '', files: [file], onchange: null, click: () => {} };
    vi.stubGlobal('document', { createElement: () => input });
    return input;
  }
  const orHung = <T>(p: Promise<T>): Promise<T | 'hung'> => Promise.race([p, new Promise<'hung'>((r) => setTimeout(() => r('hung'), 100))]);

  it('a file that can’t be read is answered with "no file", not with silence', async () => {
    const input = withInput({ arrayBuffer: () => Promise.reject(new Error('the file has gone')) });
    const picked = pickFile();
    await input.onchange!().catch(() => {});
    expect(await orHung(picked)).toBeNull();
  });

  it('a readable file comes back as its bytes', async () => {
    const input = withInput({ arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer) });
    const picked = pickFile();
    await input.onchange!();
    expect(await orHung(picked)).toEqual(new Uint8Array([1, 2, 3]));
  });
});
