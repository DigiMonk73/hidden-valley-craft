// Packs every tracked text file into one JSON file (out/source-bundle.json), published beside each
// build so the source survives even if the machine it was built on is wiped.
// Restore with: node tools/restore-source.mjs out/source-bundle.json some-dir
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const files = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
const out = { format: 'hidden-valley-blocks-source', commit: execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(), created: new Date().toISOString(), files: {} };
for (const f of files) {
  const buf = readFileSync(f);
  if (buf.includes(0)) continue; // binary: not kept in the bundle
  out.files[f] = buf.toString('utf8');
}
mkdirSync('out', { recursive: true });
writeFileSync('out/source-bundle.json', JSON.stringify(out));
console.log(`out/source-bundle.json: ${Object.keys(out.files).length} files from ${out.commit.slice(0, 7)}`);
