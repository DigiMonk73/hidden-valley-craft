// Turns dist/index.html into the form claude.ai publishes: the page's content without the
// <!doctype>, <html>, <head> and <body> wrapper (claude.ai adds its own). Title and styles first,
// then the canvas and UI, then the inlined game script. Writes out/page/hidden-valley.html.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const take = (re, what) => {
  const m = html.match(re);
  if (!m) throw new Error(`dist/index.html has no ${what}`);
  return m;
};
const title = take(/<title>[\s\S]*?<\/title>/, 'title')[0];
const styles = [...html.matchAll(/<style>[\s\S]*?<\/style>/g)].map((m) => m[0]);
const scripts = [...html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/g)].map((m) => m[0].replace(' crossorigin', ''));
const body = take(/<body>([\s\S]*?)<\/body>/, 'body')[1].trim();
if (!scripts.length) throw new Error('no inlined script found');

const page = [title, ...styles, body, ...scripts].join('\n') + '\n';
mkdirSync('out/page', { recursive: true });
writeFileSync('out/page/hidden-valley.html', page);
console.log(`out/page/hidden-valley.html: ${(page.length / 1024 / 1024).toFixed(2)} MB`);
