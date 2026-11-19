// A world with the generated columns covering [x0, x1] × [z0, z1], lit, for tests.
import { World } from '../src/world/world.ts';
import { runJob, type GenResult } from '../src/jobs/tasks.ts';
import { CS } from '../src/world/constants.ts';

export function load(x0: number, z0: number, x1: number, z1: number): World {
  const w = new World();
  for (let cz = Math.floor(z0 / CS); cz <= Math.floor(z1 / CS); cz++)
    for (let cx = Math.floor(x0 / CS); cx <= Math.floor(x1 / CS); cx++)
      w.addColumn(cx, cz, (runJob({ kind: 'gen', cx, cz, edits: [] }).result as GenResult).chunks);
  return w;
}
