// The play-through: runs each part one after another, each in its own browser, and sums the checks
// (docs/PHASE6.md, 11). Needs the build served: npx vite preview --port 4173. Run: node tests/e2e/play.mjs
// One part alone: node tests/e2e/play-valley.mjs (or play-near, play-mid, play-zone2, play-zone3). PARTS=valley,zone3 picks some.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const all = ['valley', 'near', 'mid', 'zone2', 'zone3'];
const parts = process.env.PARTS ? process.env.PARTS.split(',') : all;
let passed = 0, total = 0;
const failedParts = [];
for (const part of parts) {
  const t0 = Date.now();
  console.log(`==== play-${part} ====`);
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [join(here, `play-${part}.mjs`)], { stdio: ['ignore', 'pipe', 'inherit'] });
    child.stdout.on('data', (d) => {
      process.stdout.write(d);
      const m = String(d).match(/CHECKS (\d+)\/(\d+)/);
      if (m) { passed += Number(m[1]); total += Number(m[2]); }
    });
    child.on('close', resolve);
  });
  console.log(`==== play-${part}: ${code === 0 ? 'passed' : 'FAILED'} in ${((Date.now() - t0) / 60000).toFixed(1)} min ====`);
  if (code !== 0) failedParts.push(part);
}
console.log(`${passed} of ${total} checks passed${failedParts.length ? `; failed parts: ${failedParts.join(', ')}` : ''}`);
process.exit(failedParts.length ? 1 : 0);
