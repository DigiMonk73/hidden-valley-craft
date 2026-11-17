// Runs jobs on a pool of workers, nearest-to-the-player first. If workers can't start (the page's
// sandbox may block them), the same jobs run on the main thread a few at a time per frame.

import JobWorker from './worker.ts?worker&inline';
import { runJob, type Job, type JobResult } from './tasks.ts';

type Pending = { id: number; job: Job; resolve: (r: JobResult) => void; reject: (e: Error) => void };

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

class WorkerExecutor implements Executor {
  readonly kind = 'workers' as const;
  private workers: Worker[];
  private busy: (Pending | null)[];
  private waiting: Pending[] = [];
  private nextId = 1;
  priority: Priority;

  constructor(workers: Worker[], priority: Priority) {
    this.workers = workers;
    this.priority = priority;
    this.busy = workers.map(() => null);
    workers.forEach((w, wi) => {
      w.onmessage = (e) => {
        const d = e.data as { id?: number; result?: JobResult; error?: string };
        if (d.id === undefined) return;
        const p = this.busy[wi];
        this.busy[wi] = null;
        if (p) {
          if (d.error) p.reject(new Error(d.error)); else p.resolve(d.result!);
        }
        this.dispatch();
      };
    });
  }

  get threads(): number { return this.workers.length; }
  get queued(): number { return this.waiting.length + this.busy.filter(Boolean).length; }

  submit(job: Job): Promise<JobResult> {
    return new Promise((resolve, reject) => {
      this.waiting.push({ id: this.nextId++, job, resolve, reject });
      this.dispatch();
    });
  }

  private dispatch(): void {
    for (let wi = 0; wi < this.workers.length; wi++) {
      if (this.busy[wi]) continue;
      const p = takeBest(this.waiting, this.priority);
      if (!p) return;
      this.busy[wi] = p;
      const transfer: Transferable[] = p.job.kind === 'mesh' ? [p.job.blocks.buffer, p.job.light.buffer] : [];
      this.workers[wi].postMessage({ id: p.id, job: p.job }, transfer);
    }
  }

  pump(): void { /* workers run on their own */ }
}

class MainThreadExecutor implements Executor {
  readonly kind = 'main-thread' as const;
  readonly threads = 1;
  private waiting: Pending[] = [];
  private nextId = 1;
  priority: Priority;
  constructor(priority: Priority) { this.priority = priority; }
  get queued(): number { return this.waiting.length; }

  submit(job: Job): Promise<JobResult> {
    return new Promise((resolve, reject) => this.waiting.push({ id: this.nextId++, job, resolve, reject }));
  }

  pump(budgetMs: number): void {
    const end = performance.now() + budgetMs;
    do {
      const p = takeBest(this.waiting, this.priority);
      if (!p) return;
      try { p.resolve(runJob(p.job).result); } catch (e) { p.reject(e as Error); }
    } while (performance.now() < end);
  }
}

/** Starts workers and waits for each to say it is ready; falls back to the main thread. */
export async function createExecutor(priority: Priority, want: number): Promise<Executor> {
  const started: Worker[] = [];
  try {
    for (let i = 0; i < want; i++) started.push(new JobWorker());
    await Promise.all(started.map((w) => new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('worker did not start')), 4000);
      w.onmessage = (e) => { if (e.data?.ready) { clearTimeout(t); resolve(); } };
      w.onerror = (e) => { clearTimeout(t); reject(new Error(e.message || 'worker error')); };
    })));
    return new WorkerExecutor(started, priority);
  } catch (err) {
    console.warn('Workers unavailable, running on the main thread:', err);
    for (const w of started) w.terminate();
    return new MainThreadExecutor(priority);
  }
}
