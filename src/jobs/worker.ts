/// <reference lib="webworker" />
// Worker entry: runs generation and meshing jobs and posts the results back.

import { runJob, type Job } from './tasks.ts';

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (e: MessageEvent<{ id: number; job: Job }>) => {
  const { id, job } = e.data;
  try {
    const { result, transfer } = runJob(job);
    scope.postMessage({ id, result }, transfer);
  } catch (err) {
    scope.postMessage({ id, error: String(err instanceof Error ? err.stack ?? err.message : err) });
  }
};

scope.postMessage({ ready: true });
