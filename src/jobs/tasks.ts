// The work done off the main thread: generating a column and meshing a chunk. Shared by the
// worker and by the main-thread fallback so both give identical results.

import { CS, CHUNKS_Y } from '../world/constants.ts';
import { generateColumn } from '../gen/terrain.ts';
import { lightColumn } from '../world/light.ts';
import { meshChunk, type ChunkMesh } from '../mesh/mesher.ts';
import { buildFarLand, type FarMesh } from '../gen/farland.ts';
import type { ChunkPayload } from '../world/world.ts';

export type GenJob = { kind: 'gen'; cx: number; cz: number; edits: number[] };
export type MeshJob = { kind: 'mesh'; key: number; version: number; blocks: Uint16Array; light: Uint8Array };
export type FarJob = { kind: 'far' };
export type Job = GenJob | MeshJob | FarJob;

export type GenResult = { kind: 'gen'; cx: number; cz: number; chunks: ChunkPayload[] };
export type MeshResult = { kind: 'mesh'; key: number; version: number; mesh: ChunkMesh };
export type FarResult = { kind: 'far'; mesh: FarMesh };
export type JobResult = GenResult | MeshResult | FarResult;

const V = CS * CS * CS;

function uniformOf<T extends Uint16Array | Uint8Array>(a: T): number | null {
  const first = a[0];
  for (let i = 1; i < a.length; i++) if (a[i] !== first) return null;
  return first;
}

export function runJob(job: Job): { result: JobResult; transfer: ArrayBuffer[] } {
  if (job.kind === 'gen') {
    const col = generateColumn(job.cx, job.cz);
    // The player's edits go in before lighting, so a rebuilt column is lit as the player left it.
    for (let k = 0; k < job.edits.length; k += 3) col[job.edits[k] * V + job.edits[k + 1]] = job.edits[k + 2];
    const light = lightColumn(col);
    const chunks: ChunkPayload[] = [];
    const transfer: ArrayBuffer[] = [];
    for (let cy = 0; cy < CHUNKS_Y; cy++) {
      const b = col.slice(cy * V, (cy + 1) * V);
      const l = light.slice(cy * V, (cy + 1) * V);
      const ub = uniformOf(b), ul = uniformOf(l);
      const payload: ChunkPayload = { blocks: ub ?? b, light: ul ?? l };
      if (ub === null) transfer.push(b.buffer);
      if (ul === null) transfer.push(l.buffer);
      chunks.push(payload);
    }
    return { result: { kind: 'gen', cx: job.cx, cz: job.cz, chunks }, transfer };
  }
  if (job.kind === 'far') {
    const mesh = buildFarLand();
    return { result: { kind: 'far', mesh }, transfer: [mesh.positions.buffer, mesh.colors.buffer, mesh.mats.buffer, mesh.index.buffer] as ArrayBuffer[] };
  }
  const mesh = meshChunk(job.blocks, job.light);
  const transfer: ArrayBuffer[] = [];
  for (const part of [mesh.solid, mesh.water]) transfer.push(part.positions.buffer as ArrayBuffer, part.pack.buffer as ArrayBuffer, part.layers.buffer as ArrayBuffer);
  return { result: { kind: 'mesh', key: job.key, version: job.version, mesh }, transfer };
}
