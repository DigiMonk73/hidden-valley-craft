// Rebuilds a source tree from a bundle written by tools/bundle-source.mjs.
// Usage: node tools/restore-source.mjs source-bundle.json target-dir
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

const [bundlePath, target] = process.argv.slice(2);
if (!bundlePath || !target) { console.error('usage: node tools/restore-source.mjs bundle.json target-dir'); process.exit(2); }
if (existsSync(target) && readdirSync(target).length) { console.error(`${target} is not empty`); process.exit(1); }
const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
if (bundle.format !== 'hidden-valley-blocks-source') { console.error('not a source bundle'); process.exit(1); }
const root = resolve(target);
for (const [path, content] of Object.entries(bundle.files)) {
  const dest = resolve(join(root, path));
  if (!dest.startsWith(root + sep)) { console.error(`skipping unsafe path ${path}`); continue; }
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, content);
}
console.log(`restored ${Object.keys(bundle.files).length} files from commit ${bundle.commit} into ${target}`);
