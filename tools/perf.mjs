// Measures the load at a fixed viewpoint (the balcony, looking west over the valley) in headless Chromium:
// how long the land takes to come in, what is drawn (draw calls, triangles), what memory the picture holds
// (vertex data kept on the page as well as on the card), frame time, and how long the main thread is held
// by the streamer while the camera moves. For comparing before and after a change (docs/PHASE9B.md, 1).
//
// Usage: node tools/perf.mjs            (RD=8, 960×540; serve dist/ first: npx vite preview --port 4173)
//   RD=12 node tools/perf.mjs           another view distance (chunks)
//   SET='{"scale":0.5}' node tools/perf.mjs   picture settings applied before measuring (game.setPicture)
//   NOWORKERS=1 node tools/perf.mjs     workers refused, as in a sandboxed frame: the main-thread fallback
//
// This machine draws in software: draw calls, triangles, bytes and the main thread's times are fair; frames
// a second are not (2–4 here where a laptop draws 60).
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { execSync } from 'node:child_process';

const BASE = process.env.BASE || 'http://localhost:4173/';
const RD = process.env.RD || '8';
const W = Number(process.env.W || 960), H = Number(process.env.H || 540);
const CAM = process.env.CAM || '1796.5,83.62,1024.5,90,-6';
const [x, y, z, yaw, pitch] = CAM.split(',').map(Number);
const cam = [x, y, z, (yaw * Math.PI) / 180, (pitch * Math.PI) / 180].join(',');

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: Number(process.env.DSF || 1) });
const page = await ctx.newPage();
if (process.env.NOWORKERS) await page.addInitScript(() => { window.Worker = function () { throw new Error('workers are blocked here'); }; });
page.on('pageerror', (e) => console.log('[page error]', e.message));
const cdp = await ctx.newCDPSession(page);
const mb = (v) => Math.round((v ?? 0) / 1048576);

const t0 = Date.now();
await page.goto(`${BASE}?test&rd=${RD}&hour=12&cam=${cam}`);
await page.waitForFunction(() => window.__hv && window.__hv.idle(), null, { timeout: 900_000, polling: 250 });
const tIdle = Date.now() - t0;
// The whole view in: no column drawn for four seconds.
await page.evaluate(() => new Promise((done) => {
  const s = window.__hv.game.streamer;
  const count = () => s.drawn.reduce((n, v) => n + v, 0) * 1000 + s.meshing.size + s.uploads.length + (s.arrived?.length ?? 0);
  let last = count(), since = performance.now();
  const t = setInterval(() => {
    const now = count();
    if (now !== last) { last = now; since = performance.now(); }
    else if (performance.now() - since > 4000) { clearInterval(t); done(); }
  }, 250);
}));
const tAll = Date.now() - t0 - 4000;
if (process.env.SET) await page.evaluate((s) => window.__hv.game.setPicture?.(JSON.parse(s)), process.env.SET);

// What is drawn, and what it holds.
const drawn = await page.evaluate(async () => {
  const gm = window.__hv.game, r = gm.renderer;
  const frames = [];
  await new Promise((done) => { let last = performance.now(), n = 0; const f = (t) => { frames.push(t - last); last = t; if (++n < 12) requestAnimationFrame(f); else done(); }; requestAnimationFrame(f); });
  frames.shift();
  frames.sort((a, b) => a - b);
  let cpu = 0, card = 0;
  for (const m of r.meshes.values()) for (const part of [m.solid, m.water]) {
    if (!part) continue;
    const quads = part.geometry.drawRange.count / 6;
    card += quads * 4 * (12 + 4 + 1 + 2); // positions (3 floats), pack (4 bytes), layer (1), uv (2) per corner
    for (const a of Object.values(part.geometry.attributes)) cpu += a.array ? a.array.byteLength : 0;
  }
  const canvas = r.gl.domElement;
  return {
    executor: `${gm.exec.kind} ×${gm.exec.threads}`, columns: gm.streamer.stats.columns, chunks: r.stats.chunks, quads: r.stats.quads,
    calls: r.gl.info.render.calls, triangles: r.gl.info.render.triangles, geometries: r.gl.info.memory.geometries,
    frameMs: frames[Math.floor(frames.length / 2)], cpuVertexBytes: cpu, cardVertexBytes: card, pixels: `${canvas.width}×${canvas.height}`,
    antialias: r.gl.getContextAttributes().antialias,
  };
});
const heap = await cdp.send('Runtime.getHeapUsage');
let rss = '';
try { rss = execSync("ps -eo rss,args --sort=-rss | grep -E 'type=(renderer|gpu-process)' | grep -v grep | awk '{printf \"%s%d \", ($0 ~ /gpu-process/ ? \"gpu \" : \"renderer \"), $1/1024}'").toString().trim(); } catch { /* no ps */ }

// A walk: the camera carried 96 m west, 2 m a frame, and for each frame the time the main thread was held by
// bringing land in: joining arrived columns' light (wherever in the frame that happens), asking for meshes,
// handing them to the card.
const walk = await page.evaluate(async () => {
  const gm = window.__hv.game, s = gm.streamer, w = gm.world;
  const frames = [], joins = [];
  let inUpdate = false, loose = 0, looseN = 0, inN = 0;
  const update = s.update.bind(s), add = w.addColumn.bind(w);
  s.update = (...a) => {
    inUpdate = true; inN = 0;
    const t = performance.now(); update(...a); const dt = performance.now() - t;
    inUpdate = false;
    frames.push({ ms: dt + loose, joins: inN + looseN });
    loose = 0; looseN = 0;
  };
  w.addColumn = (...a) => { const t = performance.now(); const r = add(...a); const dt = performance.now() - t; joins.push(dt); if (inUpdate) inN++; else { loose += dt; looseN++; } return r; };
  const p = gm.player, x0 = p.x;
  const t0 = performance.now();
  await new Promise((done) => { let n = 0; const f = () => { p.setPosition(x0 - 2 * ++n, p.y, p.z); if (n < 48) requestAnimationFrame(f); else done(); }; requestAnimationFrame(f); });
  const walkMs = performance.now() - t0;
  // And until what that asked for has come in.
  await new Promise((done) => { const t = setInterval(() => { if (!s.stats.genQueued && !(s.arrived?.length)) { clearInterval(t); done(); } }, 100); setTimeout(() => { clearInterval(t); done(); }, 120_000); });
  s.update = update; w.addColumn = add;
  const pct = (a, q) => { const b = [...a].sort((u, v) => u - v); return b.length ? Math.round(b[Math.min(b.length - 1, Math.floor(b.length * q))] * 10) / 10 : 0; };
  const ms = frames.map((f) => f.ms);
  return { frames: frames.length, fpsWhileWalking: Math.round(48000 / walkMs * 10) / 10, heldMedianMs: pct(ms, 0.5), held95Ms: pct(ms, 0.95), heldMaxMs: pct(ms, 1),
    columnsJoined: joins.length, mostJoinedInOneFrame: Math.max(0, ...frames.map((f) => f.joins)), joinMedianMs: pct(joins, 0.5), join95Ms: pct(joins, 0.95), joinMaxMs: pct(joins, 1) };
});

console.log(JSON.stringify({
  view: `${RD} chunks (${RD * 32} m)`, loadToPlayS: Math.round(tIdle / 100) / 10, loadAllS: Math.round(tAll / 100) / 10, ...drawn,
  cpuVertexMB: mb(drawn.cpuVertexBytes), cardVertexMB: mb(drawn.cardVertexBytes), heapUsedMB: mb(heap.usedSize), buffersMB: mb(heap.backingStorageSize), rssMB: rss, walk,
}, null, 1));
await browser.close();
