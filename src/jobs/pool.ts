// Runs jobs on a pool of workers, nearest-to-the-player first. If workers can't start (the page's
// sandbox may block them), the same jobs run on the main thread a few at a time per frame.
//
// A worker can also stop after it has started. Its job is then given once more to another worker
// (a replacement is started for the one that stopped); a job lost twice is rejected, so whoever
// asked can wait before asking again. If no worker is left, the main thread takes over.

import JobWorker from './worker.ts?worker&inline';
import { stepJob, type Job, type JobResult, type Done } from './tasks.ts';

type Pending = {
  id: number; job: Job; resolve: (r: JobResult) => void; reject: (e: Error) => void;
  /** How many workers have stopped while holding this job. */
  lost: number;
};

export interface Executor {
  readonly kind: 'workers' | 'main-thread';
  readonly threads: number;
  submit(job: Job): Promise<JobResult>;
  /** Called every frame; the main-thread executor does its work here. */
  pump(budgetMs: number): void;
  get queued(): number;
}

/** Picks which waiting job runs next; lower is sooner. Set by the streamer. */
export type Priority = (job: Job) => number;

/** The part of a Worker the pool uses, so the checks can hand it one that fails on purpose. */
export interface WorkerLike {
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
  onmessageerror: ((e: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
  terminate(): void;
}
export type WorkerMaker = () => WorkerLike;

/** How long a worker has to say it is ready. */
const START_MS = 4000;

function takeBest(list: Pending[], priority: Priority): Pending | undefined {
  if (list.length === 0) return undefined;
  let bi = 0, bp = Infinity;
  for (let i = 0; i < list.length; i++) {
    const p = priority(list[i].job);
    if (p < bp) { bp = p; bi = i; }
  }
  const [best] = list.splice(bi, 1);
  return best;
}

/** A mesh job's arrays travel to the worker and are gone from here: it can't be sent a second time. */
function canResend(job: Job): boolean {
  return job.kind !== 'mesh' || (job.blocks.buffer.byteLength > 0 && job.light.buffer.byteLength > 0);
}

const asError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

type Slot = { worker: WorkerLike; job: Pending | null; ready: boolean; startTimer: ReturnType<typeof setTimeout> | null };

class WorkerExecutor implements Executor {
  private slots: Slot[] = [];
  private waiting: Pending[] = [];
  private nextId = 1;
  private make: WorkerMaker;
  /** How many more replacements may be started. When it runs out the pool only shrinks. */
  private spares: number;
  /** Set once every worker is gone: the main thread does the work from then on. */
  private fallback: MainThreadExecutor | null = null;
  priority: Priority;

  constructor(workers: WorkerLike[], priority: Priority, make: WorkerMaker) {
    this.priority = priority;
    this.make = make;
    this.spares = Math.max(4, workers.length * 2);
    for (const w of workers) this.adopt(w, true);
  }

  get kind(): 'workers' | 'main-thread' { return this.fallback ? 'main-thread' : 'workers'; }
  get threads(): number { return this.fallback ? 1 : this.slots.length; }
  get queued(): number {
    if (this.fallback) return this.fallback.queued;
    return this.waiting.length + this.slots.reduce((n, s) => n + (s.job ? 1 : 0), 0);
  }

  submit(job: Job): Promise<JobResult> {
    if (this.fallback) return this.fallback.submit(job);
    return new Promise((resolve, reject) => {
      this.waiting.push({ id: this.nextId++, job, resolve, reject, lost: 0 });
      this.dispatch();
    });
  }

  private adopt(worker: WorkerLike, ready: boolean): void {
    const slot: Slot = { worker, job: null, ready, startTimer: null };
    this.slots.push(slot);
    worker.onmessage = (e) => this.heard(slot, e.data);
    worker.onerror = (e) => this.stopped(slot, e.message || 'worker error');
    worker.onmessageerror = () => this.stopped(slot, 'a worker’s answer could not be read');
    if (!ready) slot.startTimer = setTimeout(() => this.stopped(slot, 'worker did not start'), START_MS);
  }

  private heard(slot: Slot, data: unknown): void {
    const d = (data ?? {}) as { ready?: boolean; id?: number; result?: JobResult; error?: string };
    if (d.ready) {
      slot.ready = true;
      if (slot.startTimer !== null) { clearTimeout(slot.startTimer); slot.startTimer = null; }
      this.dispatch();
      return;
    }
    const p = slot.job;
    if (d.id === undefined || !p || p.id !== d.id) return;
    slot.job = null;
    if (d.error !== undefined) p.reject(new Error(d.error));
    else if (d.result) p.resolve(d.result);
    else p.reject(new Error('a worker answered with nothing'));
    this.dispatch();
  }

  /** A worker has failed: let it go, pass its job on once, and start another in its place. */
  private stopped(slot: Slot, why: string): void {
    const at = this.slots.indexOf(slot);
    if (at < 0) return;
    this.slots.splice(at, 1);
    if (slot.startTimer !== null) clearTimeout(slot.startTimer);
    slot.worker.onmessage = slot.worker.onerror = slot.worker.onmessageerror = null;
    try { slot.worker.terminate(); } catch { /* already gone */ }
    console.warn('A worker stopped:', why);
    const p = slot.job;
    slot.job = null;
    if (p) {
      if (p.lost === 0 && canResend(p.job)) { p.lost = 1; this.waiting.push(p); }
      else p.reject(new Error(`a worker stopped during a ${p.job.kind} job: ${why}`));
    }
    if (this.spares > 0) {
      this.spares--;
      try { this.adopt(this.make(), false); } catch (e) { console.warn('No new worker could be started:', e); }
    }
    if (this.slots.length === 0) this.toMainThread();
    else this.dispatch();
  }

  private toMainThread(): void {
    console.warn('Every worker has stopped: running on the main thread from here.');
    const main = new MainThreadExecutor((job) => this.priority(job));
    for (const p of this.waiting.splice(0)) main.take(p);
    this.fallback = main;
  }

  private dispatch(): void {
    for (const slot of this.slots) {
      while (slot.ready && !slot.job) {
        const p = takeBest(this.waiting, this.priority);
        if (!p) return;
        const transfer: Transferable[] = p.job.kind === 'mesh' ? [p.job.blocks.buffer, p.job.light.buffer] : [];
        try {
          slot.worker.postMessage({ id: p.id, job: p.job }, transfer);
          slot.job = p;
        } catch (e) {
          p.reject(asError(e)); // it could not be sent at all; the worker is still free
        }
      }
    }
  }

  pump(budgetMs: number): void {
    this.fallback?.pump(budgetMs); // workers run on their own
  }
}

class MainThreadExecutor implements Executor {
  readonly kind = 'main-thread' as const;
  readonly threads = 1;
  private waiting: Pending[] = [];
  private nextId = 1;
  /** The job being done, a part at a time (src/jobs/tasks.ts, stepJob). */
  private current: { p: Pending; steps: Generator<void, Done, void> } | null = null;
  priority: Priority;
  constructor(priority: Priority) { this.priority = priority; }
  get queued(): number { return this.waiting.length + (this.current ? 1 : 0); }

  submit(job: Job): Promise<JobResult> {
    return new Promise((resolve, reject) => this.waiting.push({ id: this.nextId++, job, resolve, reject, lost: 0 }));
  }

  /** Takes over a job that was waiting for a worker. */
  take(p: Pending): void { this.waiting.push(p); }

  /**
   * Does parts of jobs until the budget is spent: always at least one part, so the work moves on however small
   * the budget. A job begun is finished before the next is chosen.
   */
  pump(budgetMs: number): void {
    const end = performance.now() + budgetMs;
    do {
      if (!this.current) {
        const p = takeBest(this.waiting, this.priority);
        if (!p) return;
        this.current = { p, steps: stepJob(p.job) };
      }
      const { p, steps } = this.current;
      try {
        const r = steps.next();
        if (r.done) { this.current = null; p.resolve(r.value.result); }
      } catch (e) { this.current = null; p.reject(asError(e)); }
    } while (performance.now() < end);
  }
}

/**
 * Starts workers and waits for each to say it is ready; falls back to the main thread.
 * `make` is how a worker is started: the checks pass their own.
 */
export async function createExecutor(priority: Priority, want: number, make: WorkerMaker = () => new JobWorker()): Promise<Executor> {
  const started: WorkerLike[] = [];
  try {
    for (let i = 0; i < want; i++) started.push(make());
    await Promise.all(started.map((w) => new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('worker did not start')), START_MS);
      w.onmessage = (e) => { if (e.data?.ready) { clearTimeout(t); resolve(); } };
      w.onerror = (e) => { clearTimeout(t); reject(new Error(e.message || 'worker error')); };
    })));
    return new WorkerExecutor(started, priority, make);
  } catch (err) {
    console.warn('Workers unavailable, running on the main thread:', err);
    for (const w of started) {
      w.onmessage = w.onerror = null;
      try { w.terminate(); } catch { /* already gone */ }
    }
    return new MainThreadExecutor(priority);
  }
}
