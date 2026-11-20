// Phase 9A's pictures (docs/PHASE9A.md): the same cameras before and after each change, many to a page load.
// tools/shot.mjs loads the page afresh for every picture (six minutes each here); this one loads it once per
// set and moves the camera, so a set of ten costs little more than one.
// Needs the build served: npx vite preview --port 4173.
// Usage: node tools/shots9a.mjs <tag> [set ...] [name=x,y,z,yawDeg,pitchDeg,hour ...]
//   writes out/9a/<tag>-<name>.png. Sets: valley, water, road, far, life, hand (see below).
// A shot may carry a script to run in the page once the land is in ({ run }), and `play: true` to set the game
// playing (the hand and what it holds are drawn only in play).
// For checking the look by eye; not a pass/fail test.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');

/** After the wait: stands the camera `dist` from the first bird of a kind, `up` above it, looking at it (and says how many there are). */
const closeTo = (kind, dist, up, zoom = 1) => `(() => { const g = window.__hv.game, all = g.renderer.birds.flock.birds, b = all.find((q) => q.kind === '${kind}' && q.mode !== 'leave');
  console.log('BIRDS ' + all.map((q) => q.kind + ':' + q.mode).join(' '));
  if (!b) return; g.renderer.setZoom(${zoom}); const a = b.yaw + 2.2, x = b.x + Math.sin(a) * ${dist}, z = b.z + Math.cos(a) * ${dist}, y = b.y + ${up};
  window.__hv.setCamera(x, y, z, Math.atan2(-(b.x - x), -(b.z - z)), Math.atan2(b.y + 0.1 - y, Math.hypot(b.x - x, b.z - z))); })()`;
const hold = (name) => `(() => { const g = window.__hv.game, id = window.__hv.itemId('${name}'); g.hotbar.slots[0] = { id, count: 1 }; g.hotbar.selected = 0; })()`;
const SETS = {
  // The valley at 256 m: the owner's sunset, the home by night, the pool and falls, the cliffs.
  valley: { rd: 8, shots: {
    balcony_sunset: '1796.5,83.62,1024.5,90,-6,17.6',
    balcony_noon: '1796.5,83.62,1024.5,90,-8,12',
    balcony_night: '1796.5,83.62,1024.5,90,-6,21.5',
    living_night: '1812,83.62,1024.5,-90,-5,20',
    hearth_night: '1806,83.62,1027,-140,-4,21',
    home_from_floor_night: '1738,73,1024,-90,12,21.5',
    home_from_pool_night: '1640,73,1024,-90,5,21.5',
    home_from_garden_day: '1745,73,1030,-75,14,15',
    valley_floor: '1690,72,1040,60,2,16.5',
    pool_falls: '1640,72.5,1030,80,6,15',
    south_cliff: '1700,78,1085,180,12,13',
    rim_overview: '1700,150,1180,0,-32,15',
  } },
  // Under water: the pool, the tunnel's mouth under the curtain, the tunnel itself.
  water: { rd: 4, shots: {
    pool_under: '1622,67.2,1024,90,8,13',
    tunnel_mouth: '1604.5,67.6,1024.5,90,0,13',
    tunnel_inside: '1596,67.6,1024.5,90,0,13',
    pool_surface: '1626,70.2,1036,110,-12,13',
  } },
  // The old road through the buffer, and the saddle: tree shapes, and hills far off.
  road: { rd: 6, shots: {
    road_start: '1528,105.7,1051.7,90,-3,15',
    road_forest: '1470,97.5,1043,80,4,10',
    morpho_tree: '1348,104,1024,55,6,14',
    saddle: '1168,119,1024.4,90,-6,15',
    canyon_falls: '1558,74,1040,-60,14,14',
  } },
  // The far land as itself: a short view distance, so the valley's far wall is the coarse distant land.
  far: { rd: 3, shots: {
    far_wall_garden: '1750,72.6,1030,90,8,12',
    far_wall_balcony: '1796.5,83.62,1024.5,90,-6,17.6',
    far_wall_morning: '1750,72.6,1030,60,10,9',
  } },
  // The valley's birds (they need a little time to arrive: `wait`, in milliseconds of the page's own clock).
  life: { rd: 4, shots: {
    hummingbirds: { cam: '1746.5,71.9,1031.5,60,-8,9', wait: 45000, run: closeTo('hummingbird', 2.4, 0.3, 3) },
    doves: { cam: '1722,72.2,1062,40,-6,9', wait: 30000, run: closeTo('dove', 8, 1.2, 4) },
    quetzal: { cam: '1742,72.6,1054,56,14,7', pre: `window.__hv.game.day = 1`, wait: 20000, run: closeTo('quetzal', 17, -5, 5) },
    quetzal_from_path: { cam: '1752,73,1052,72,8,7', pre: `window.__hv.game.day = 1`, wait: 12000 },
  } },
  // In hand (drawn only in play).
  hand: { rd: 4, shots: {
    hand_empty: { cam: '1790,83.62,1024.5,90,-6,15', play: true, run: `(() => { const g = window.__hv.game; g.hotbar.slots[0] = null; g.hotbar.selected = 0; })()` },
    hand_pickaxe: { cam: '1790,83.62,1024.5,90,-6,15', play: true, run: hold('steel_pickaxe') },
    hand_rifle: { cam: '1790,83.62,1024.5,90,-6,15', play: true, run: hold('hunting_rifle') },
  } },
};

const [tag, ...rest] = process.argv.slice(2);
if (!tag) { console.log('usage: node tools/shots9a.mjs <tag> [set ...] [name=x,y,z,yaw,pitch,hour ...]'); process.exit(1); }
const jobs = [];
const loose = {};
for (const a of rest) {
  if (a.includes('=')) { const [n, s] = a.split('='); loose[n] = s; }
  else if (SETS[a]) jobs.push({ ...SETS[a], name: a });
  else { console.log(`no set "${a}" (${Object.keys(SETS).join(', ')})`); process.exit(1); }
}
if (Object.keys(loose).length) jobs.push({ rd: Number(process.env.RD || 8), shots: loose, name: 'loose' });
if (process.env.RD) for (const j of jobs) j.rd = Number(process.env.RD);
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;

const BASE = process.env.BASE || 'http://localhost:4173/';
const W = Number(process.env.W || 960), H = Number(process.env.H || 540);
mkdirSync('out/9a', { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const rad = (d) => (d * Math.PI) / 180;

/** Waits until no more columns have been drawn for `quiet` ms: the whole view is in. */
const settle = (page, quiet = 4000) => page.evaluate((quiet) => new Promise((done) => {
  const s = window.__hv.game.streamer;
  const count = () => s.drawn.reduce((n, v) => n + v, 0) * 1000 + s.meshing.size + s.uploads.length + s.stats.genQueued;
  let last = count(), since = performance.now();
  const t = setInterval(() => {
    const now = count();
    if (now !== last) { last = now; since = performance.now(); }
    else if (performance.now() - since > quiet && window.__hv.idle()) { clearInterval(t); done(); }
  }, 250);
}), quiet);

for (const job of jobs) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: Number(process.env.DSF || 1) });
  await page.addInitScript(() => { Element.prototype.requestPointerLock = function () { return Promise.reject(new Error('no')); }; });
  page.on('pageerror', (e) => console.log('[page error]', e.message));
  page.on('console', (m) => { if ((m.type() === 'error' && !/GPU stall/.test(m.text())) || m.text().startsWith('BIRDS')) console.log('[page]', m.text()); });
  const entries = Object.entries(job.shots).filter(([n]) => !only || only.has(n)).map(([n, s]) => [n, typeof s === 'string' ? { cam: s } : s]);
  if (!entries.length) { await page.close(); continue; }
  const first = entries[0][1].cam.split(',').map(Number);
  const t0 = Date.now();
  await page.goto(`${BASE}?test&fx&rd=${job.rd}&hour=${first[5]}&cam=${[first[0], first[1], first[2], rad(first[3]), -1.55].join(',')}`);
  await page.waitForFunction(() => window.__hv && window.__hv.idle(), null, { timeout: 900_000, polling: 500 });
  for (const [name, shot] of entries) {
    const [x, y, z, yaw, pitch, hour] = shot.cam.split(',').map(Number);
    // The land loads a little each frame, and a frame of the whole valley takes seconds here: so while it loads the
    // camera looks straight down (little in view, quick frames), and turns to the view once everything is in.
    await page.evaluate(([x, y, z, yaw, hour, play]) => {
      const g = window.__hv.game;
      window.__hv.setCamera(x, y, z, yaw, -1.55);
      g.renderer.setZoom(1);
      g.hour = hour;
      g.playing = !!play;
    }, [x, y, z, rad(yaw), hour, shot.play]);
    await settle(page, 2500);
    await page.evaluate(([x, y, z, yaw, pitch]) => new Promise((done) => {
      window.__hv.setCamera(x, y, z, yaw, pitch);
      let n = 0;
      const tick = () => (++n >= 3 ? done() : requestAnimationFrame(tick));
      requestAnimationFrame(tick);
    }), [x, y, z, rad(yaw), rad(pitch)]);
    if (shot.pre) await page.evaluate(shot.pre);
    if (shot.wait) await page.waitForTimeout(shot.wait);
    if (shot.run) await page.evaluate(shot.run);
    if (process.env.EVAL) await page.evaluate(process.env.EVAL);
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    await page.screenshot({ path: `out/9a/${tag}-${name}.png`, timeout: 180_000 });
    const stats = await page.evaluate(() => { const g = window.__hv.game, i = g.renderer.gl.info.render; return `${i.calls} draw calls, ${Math.round(i.triangles / 1000)}k triangles`; });
    console.log(`${tag}-${name}: ${((Date.now() - t0) / 1000).toFixed(0)} s · ${stats}`);
  }
  await page.close();
}
await browser.close();
