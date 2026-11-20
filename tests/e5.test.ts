// The tests the review asked for before version 1 (docs/REVIEW.md, E5; docs/PHASE9B.md, 7): a long streamer walk on
// an executor that answers late, out of order and sometimes not at all; seeded random edits against light lit from
// scratch; and a budget of quads at fixed viewpoints. (The sandboxed-frame smoke test is tests/e2e/engine.mjs.)
import { describe, it, expect, vi } from 'vitest';
import { World } from '../src/world/world.ts';
import { Streamer, GEN_RETRY_MS, type ChunkSink } from '../src/world/streamer.ts';
import type { Executor } from '../src/jobs/pool.ts';
import { runJob, type Job, type JobResult, type GenResult } from '../src/jobs/tasks.ts';
import { CS, CHUNKS_Y, COLS_X, WORLD_Y } from '../src/world/constants.ts';
import { blockId, AIR, B_EMIT } from '../src/world/blocks.ts';
import { meshChunk, type ChunkMesh } from '../src/mesh/mesher.ts';
import { makeRng } from '../src/core/noise.ts';

vi.setConfig({ testTimeout: 300_000 });

// ---- 1. The streamer, walked two kilometres on an awkward executor ------------------------------------------

/** Flat land, quick to make: two chunks of limestone under open sky. */
function flatColumn(cx: number, cz: number): GenResult {
  const stone = blockId('limestone');
  return { kind: 'gen', cx, cz, chunks: Array.from({ length: CHUNKS_Y }, (_, cy) => (cy <= 1 ? { blocks: stone, light: 0 } : { blocks: AIR, light: 0xf0 })) };
}

/**
 * Answers nothing at once. Each job waits one to four frames, and those that come due in a frame are answered in a
 * shuffled order, as a pool of workers does. A share of jobs fail (seeded), each at most `failsPerJob` times.
 */
class LateExecutor implements Executor {
  readonly kind = 'workers' as const;
  readonly threads = 3;
  private waiting: { job: Job; due: number; resolve: (r: JobResult) => void; reject: (e: Error) => void }[] = [];
  private frame = 0;
  asked = new Map<string, number>();
  failed = new Map<string, number>();
  failShare = 0;
  failsPerJob = 1;
  /** Columns that never build, whatever is asked. */
  dead = new Set<string>();
  private rand: () => number;
  constructor(seed: number) { this.rand = makeRng(seed); }
  get queued(): number { return this.waiting.length; }
  private name(job: Job): string { return job.kind === 'gen' ? `gen ${job.cx},${job.cz}` : job.kind === 'mesh' ? `mesh ${job.key}` : 'far'; }
  submit(job: Job): Promise<JobResult> {
    const n = this.name(job);
    this.asked.set(n, (this.asked.get(n) ?? 0) + 1);
    return new Promise((resolve, reject) => this.waiting.push({ job, due: this.frame + 1 + Math.floor(this.rand() * 4), resolve, reject }));
  }
  pump(): void {}
  /** One frame passes: what is due is answered, in no particular order. */
  tick(): void {
    this.frame++;
    const due = this.waiting.filter((w) => w.due <= this.frame);
    this.waiting = this.waiting.filter((w) => w.due > this.frame);
    for (let i = due.length - 1; i > 0; i--) { const j = Math.floor(this.rand() * (i + 1)); [due[i], due[j]] = [due[j], due[i]]; }
    for (const w of due) {
      const n = this.name(w.job), f = this.failed.get(n) ?? 0;
      const dead = w.job.kind === 'gen' && this.dead.has(`${w.job.cx},${w.job.cz}`);
      if (dead || (f < this.failsPerJob && this.rand() < this.failShare)) { this.failed.set(n, f + 1); w.reject(new Error('made to fail')); continue; }
      try { w.resolve(w.job.kind === 'gen' ? flatColumn(w.job.cx, w.job.cz) : runJob(w.job).result); } catch (e) { w.reject(e as Error); }
    }
  }
}

class View implements ChunkSink {
  meshes = new Map<number, ChunkMesh>();
  sets = 0;
  removes = 0;
  setChunkMesh(key: number, _x: number, _y: number, _z: number, m: ChunkMesh): void { this.meshes.set(key, m); this.sets++; }
  removeChunk(key: number): void { if (this.meshes.delete(key)) this.removes++; }
}

const settle = (): Promise<void> => new Promise((r) => setImmediate(r));

function rig(seed: number, radius = 2) {
  const world = new World(), exec = new LateExecutor(seed), view = new View();
  const s = new Streamer(world, exec, view);
  const clock = { t: 1000 };
  s.radius = radius;
  s.clock = () => clock.t;
  /** One frame as the game runs it while playing: workers answer, the streamer joins one column and hands meshes over. */
  const frame = async (x: number, z: number, joinMs = 0): Promise<void> => {
    clock.t += 16;
    exec.tick();
    await settle();
    s.update(x, z, 1000, joinMs);
    await settle();
  };
  return { world, exec, view, s, clock, frame };
}

/** Every column within the view is in and every chunk of it drawn; what is missing, in words. */
function missing(r: ReturnType<typeof rig>, x: number, z: number, but: Set<string> = new Set()): string[] {
  const out: string[] = [];
  const pcx = Math.floor(x / CS), pcz = Math.floor(z / CS);
  for (let dz = -r.s.radius; dz <= r.s.radius; dz++) for (let dx = -r.s.radius; dx <= r.s.radius; dx++) {
    if (Math.hypot(dx, dz) > r.s.radius) continue;
    const cx = pcx + dx, cz = pcz + dz;
    if (cx < 0 || cz < 0 || cx >= COLS_X) continue;
    if ([...but].some((k) => { const [bx, bz] = k.split(',').map(Number); return Math.abs(bx - cx) <= 1 && Math.abs(bz - cz) <= 1; })) continue; // a dead column and those beside it
    const col = r.world.column(cx, cz);
    if (!col) { out.push(`column ${cx},${cz}`); continue; }
    for (const ch of col.chunks) {
      if (!ch.hasMesh || ch.dirty) out.push(`chunk ${ch.cx},${ch.cy},${ch.cz} not drawn`);
      else if (!ch.empty && !r.view.meshes.has(ch.key)) out.push(`chunk ${ch.cx},${ch.cy},${ch.cz} has no mesh`);
    }
  }
  return out;
}

describe('the streamer, walked two kilometres (E5, 1)', () => {
  const Z = 32 * CS + 16, X0 = 63 * CS + 16; // from the world's east edge to its west

  it('workers answering late and out of order: every chunk is drawn, the land behind is let go, nothing is asked for twice, nothing piles up', async () => {
    const r = rig(11);
    const errors = vi.spyOn(console, 'error'), warns = vi.spyOn(console, 'warn');
    let worstColumns = 0, checks = 0;
    for (let x = X0; x >= 16; x -= 2) { // 2 m a frame: a sprint
      await r.frame(x, Z);
      worstColumns = Math.max(worstColumns, r.s.stats.columns);
      if ((X0 - x) % 256 === 0 && x < X0) {
        for (let k = 0; k < 40 && missing(r, x, Z).length; k++) await r.frame(x, Z); // stand a moment
        expect(missing(r, x, Z), `at x ${x}`).toEqual([]);
        // Every mesh belongs to a loaded column near the player.
        for (const key of r.view.meshes.keys()) {
          const cx = Math.floor(key / CHUNKS_Y) % COLS_X, cz = Math.floor(key / CHUNKS_Y / COLS_X);
          expect(r.world.column(cx, cz), `mesh ${key} outlived its column`).not.toBeNull();
          expect(Math.hypot(cx - Math.floor(x / CS), cz - Math.floor(Z / CS))).toBeLessThanOrEqual(r.s.radius + 3.01);
        }
        checks++;
      }
    }
    expect(checks).toBeGreaterThanOrEqual(7); // 2,016 m walked
    // The loaded land never grew past what the view keeps (a disc of radius + 3 columns).
    expect(worstColumns).toBeLessThanOrEqual(Math.ceil(Math.PI * (r.s.radius + 3.5) ** 2));
    // No column was built twice, and no healthy mesh job was repeated without the chunk having changed since.
    for (const [name, n] of r.exec.asked) if (name.startsWith('gen')) expect(n, name).toBe(1);
    expect(r.view.removes).toBeGreaterThan(200); // the land behind really was let go
    expect(r.s.stats.failed).toBe(0);
    expect(errors).not.toHaveBeenCalled();
    expect(warns).not.toHaveBeenCalled();
  });

  it('one job in ten failing once: every one is asked for again, none more than that, and no hole is left', async () => {
    const r = rig(23);
    r.exec.failShare = 0.1;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (let x = X0; x >= X0 - 640; x -= 2) {
      await r.frame(x, Z);
      r.clock.t += 40; // (so the waits before a column is asked for again pass as the walk goes on)
    }
    const end = X0 - 640;
    for (let k = 0; k < 300 && missing(r, end, Z).length; k++) { r.clock.t += 200; await r.frame(end, Z); }
    expect(missing(r, end, Z)).toEqual([]);
    expect(r.exec.failed.size).toBeGreaterThan(20); // the failures happened
    for (const [name, n] of r.exec.asked) if (name.startsWith('gen')) expect(n, name).toBeLessThanOrEqual(2);
    expect(r.s.stats.failed).toBe(0);
  });

  it('a column that never builds: asked for a few times, then left; it does not loop, the rest is drawn, and the game still counts the place as settled', async () => {
    const r = rig(5);
    const dead = `${Math.floor(X0 / CS) - 1},${Math.floor(Z / CS)}`;
    r.exec.dead.add(dead);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (let k = 0; k < 400; k++) { r.clock.t += 100; await r.frame(X0, Z); }
    expect(r.exec.asked.get(`gen ${dead}`)).toBe(GEN_RETRY_MS.length + 1); // each wait once, then no more
    expect(r.s.stats.failed).toBe(1);
    expect(missing(r, X0, Z, new Set([dead]))).toEqual([]);
    expect(r.s.settledAround(X0, Z, 1)).toBe(true); // (a hole the streamer has given up on must not hold the loading screen for ever)
    const asked = r.exec.asked.get(`gen ${dead}`);
    for (let k = 0; k < 200; k++) { r.clock.t += 100; await r.frame(X0, Z); }
    expect(r.exec.asked.get(`gen ${dead}`)).toBe(asked);
  });

  it('the player’s edits outlive the land being let go and built again', async () => {
    const r = rig(7);
    for (let k = 0; k < 60; k++) await r.frame(X0, Z);
    const mark: [number, number, number] = [X0, 2 * CS + 3, Z];
    expect(r.world.setBlock(...mark, blockId('planks'))).toBe(true);
    for (let x = X0; x >= X0 - 480; x -= 4) await r.frame(x, Z);
    expect(r.world.column(Math.floor(X0 / CS), Math.floor(Z / CS))).toBeNull(); // let go
    expect(r.world.blockKnown(...mark)).toBe(blockId('planks')); // and still known
    // Home again: the generator is handed the edit with the job.
    const before = r.exec.asked.get(`gen ${Math.floor(X0 / CS)},${Math.floor(Z / CS)}`);
    for (let k = 0; k < 80; k++) await r.frame(X0, Z);
    expect(r.exec.asked.get(`gen ${Math.floor(X0 / CS)},${Math.floor(Z / CS)}`)).toBe((before ?? 0) + 1);
    expect(r.world.edits.size).toBe(1);
  });
});

// ---- 2. Light after seeded random edits equals light lit from scratch ------------------------------------------

const COLS: [number, number][] = [];
for (let cz = 30; cz <= 32; cz++) for (let cx = 55; cx <= 57; cx++) COLS.push([cx, cz]);
/** The home's cliff, the balcony and the plateau above them, three columns by three (lamps, glass, water, caves). */
function build(edits: World['edits'] = new Map()): World {
  const w = new World();
  w.edits = edits;
  for (const [cx, cz] of COLS) w.addColumn(cx, cz, (runJob({ kind: 'gen', cx, cz, edits: w.columnEdits(cx, cz) }).result as GenResult).chunks);
  return w;
}
/** Cells of the middle column, and one block into each neighbour, whose light differs from a fresh build's. */
function wrong(edited: World): string[] {
  const fresh = build(new Map([...edited.edits].map(([k, m]) => [k, new Map(m)])));
  const out: string[] = [];
  for (let y = 0; y < WORLD_Y; y++) for (let z = 31 * CS - 1; z <= 32 * CS; z++) for (let x = 56 * CS - 1; x <= 57 * CS; x++) {
    const a = edited.lightAt(x, y, z), b = fresh.lightAt(x, y, z);
    if (a !== b && out.length < 6) out.push(`(${x}, ${y}, ${z}): sky ${a >> 4} block ${a & 15}, lit from scratch sky ${b >> 4} block ${b & 15}`);
    else if (a !== b) out.push('…');
  }
  return out;
}

describe('light after random edits is light lit from scratch (E5, 2)', () => {
  // Lights of every strength the game has, things that pass light, filter it and stop it, and taking each away again.
  const names = ['lantern', 'smelter', 'kiln', 'hearth_fire', 'sealed_lamp', 'glass', 'leaves', 'water', 'limestone', 'planks', 'slab_stone_bricks', 'air', 'air', 'air'];
  const ids = names.map((n) => (n === 'air' ? AIR : blockId(n)));

  it('the lights used really are of different strengths', () => {
    const strengths = new Set(ids.map((id) => B_EMIT[id]).filter((e) => e > 0));
    expect(strengths.size).toBeGreaterThanOrEqual(3);
  });

  for (const seed of [1, 2, 3]) {
    it(`seed ${seed}: 240 edits at and across the middle column's seams, on the surface, in the cliff and in the home, checked every 40`, () => {
      const rand = makeRng(seed * 7919);
      const w = build();
      // Near a seam between columns (x or z within two blocks of a multiple of 32) as often as not, and near the
      // seams between chunks in height (y 96 and 128 run through the cliff and the plateau).
      const near = (lo: number) => (rand() < 0.5 ? lo + (rand() < 0.5 ? 0 : CS) + Math.floor(rand() * 5) - 2 : lo + Math.floor(rand() * CS));
      const ys = () => (rand() < 0.35 ? [96, 128][Math.floor(rand() * 2)] + Math.floor(rand() * 5) - 2 : 70 + Math.floor(rand() * 60));
      const placed: [number, number, number][] = [];
      for (let k = 1; k <= 240; k++) {
        // One edit in four undoes an earlier one (a lamp taken away, a wall mined out again).
        if (placed.length && rand() < 0.25) {
          const [x, y, z] = placed.splice(Math.floor(rand() * placed.length), 1)[0];
          w.setBlock(x, y, z, AIR);
        } else {
          const x = near(56 * CS), y = ys(), z = near(31 * CS), id = ids[Math.floor(rand() * ids.length)];
          if (w.setBlock(x, y, z, id) && id !== AIR) placed.push([x, y, z]);
        }
        if (k % 40 === 0) expect(wrong(w), `after ${k} edits`).toEqual([]);
      }
    });
  }

  it('a dim lamp beside a bright one, across a seam, with the bright one taken away (the case N5i hid in)', () => {
    const w = build();
    const x = 57 * CS, y = 118, z = 31 * CS + 10; // the seam between columns 56 and 57, on the plateau
    for (let dx = -3; dx <= 3; dx++) for (let dy = 0; dy < 3; dy++) w.setBlock(x + dx, y + dy, z, AIR);
    w.setBlock(x - 1, y, z, blockId('smelter'));
    w.setBlock(x, y, z, blockId('lantern'));
    expect(wrong(w)).toEqual([]);
    w.setBlock(x, y, z, AIR);
    expect(wrong(w)).toEqual([]);
    w.setBlock(x - 1, y, z, AIR);
    expect(wrong(w)).toEqual([]);
  });
});

// ---- 4. A budget of quads at fixed viewpoints --------------------------------------------------------------------

/** Every chunk within `radius` columns of (x, z), generated, lit and meshed as the game does it: the quads drawn. */
function quadsAround(x: number, z: number, radius: number): { quads: number; water: number; columns: number } {
  const w = new World();
  const pcx = Math.floor(x / CS), pcz = Math.floor(z / CS);
  for (let dz = -radius - 1; dz <= radius + 1; dz++) for (let dx = -radius - 1; dx <= radius + 1; dx++) {
    const cx = pcx + dx, cz = pcz + dz;
    if (cx < 0 || cz < 0 || cx >= COLS_X || cz >= COLS_X) continue;
    w.addColumn(cx, cz, (runJob({ kind: 'gen', cx, cz, edits: [] }).result as GenResult).chunks);
  }
  let quads = 0, water = 0, columns = 0;
  for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
    if (Math.hypot(dx, dz) > radius + 0.75) continue;
    const col = w.column(pcx + dx, pcz + dz);
    if (!col) continue;
    columns++;
    for (const ch of col.chunks) {
      if (ch.empty) continue;
      const { blocks, light } = w.padded(ch);
      const m = meshChunk(blocks, light);
      quads += m.solid.quads; water += m.water.quads;
    }
  }
  return { quads, water, columns };
}

describe('a budget of quads at fixed viewpoints (E5, 4)', () => {
  // What is drawn within 96 m (three columns) of each place, as measured when this was written (version 13's land with
  // Phase 9B's two cliff mends and taller brush). A change to the land or the mesher that moves any of them by more
  // than a tenth fails here: look at why, and if it is meant, write the new number down with the reason.
  const BUDGET: [string, number, number, number][] = [
    ['the balcony', 1796, 1024, 424_000],
    ['the valley floor’s middle', 1700, 1024, 359_000],
    ['the outpost', 860, 1036, 390_000],
    ['the dam’s crest', 635, 752, 332_000],
    ['the relay tower’s yard', 367, 386, 330_000],
  ];

  for (const [name, x, z, want] of BUDGET) {
    it(`${name}: within a tenth of ${want.toLocaleString('en')} quads`, () => {
      const got = quadsAround(x, z, 3);
      console.info(`BUDGET ${name} (${x}, ${z}): ${got.quads} quads of blocks, ${got.water} of water, in ${got.columns} columns`);
      expect(got.columns).toBeGreaterThan(20);
      expect(got.quads + got.water, `${name}: ${got.quads + got.water} quads, budget ${want}`).toBeGreaterThan(want * 0.9);
      expect(got.quads + got.water, `${name}: ${got.quads + got.water} quads, budget ${want}`).toBeLessThan(want * 1.1);
    });
  }
});
