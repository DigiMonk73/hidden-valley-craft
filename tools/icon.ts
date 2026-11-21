// The game's icon, drawn by code: the falls pouring into the pool, with the warm lamp of the hidden
// tunnel glowing behind the white water, in the game's block-pixel style and palette (src/render/textures.ts).
// 48 px and up show the full 32×32 scene; 16 and 32 px (browser tabs) show the same picture hand-tuned clean:
// no stars, flecks or stone texture, flat sky and cliff, one moss line, a two-tone pool, the glowing doorway.
// (The owner chose this design over three simpler ones on 2026-11-21: docs/review/icon-options.png.)
// `node --experimental-strip-types --no-warnings tools/icon.ts` writes assets/icon/ (PNGs at every store size,
// icon.ico, icon.svg) and the favicon links in index.html.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { encodePng } from './png.ts';

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * t)) as RGB;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// ---- Palette (from the game's textures, the rock darkened for a night cliff) -------------------
const SKY = hex('#0b1424');
const STAR = hex('#c9d6e8');
const ROCK = [hex('#34332e'), hex('#3b3a34'), hex('#2e2d29')];
const ROCK_SEAM = hex('#272622');
const ROCK_LIGHT = hex('#4a4840');
const MOSS = [hex('#456d2b'), hex('#5d8a3a'), hex('#79a64a')];
const WATER = [hex('#e4f3f8'), hex('#cfe8f1'), hex('#bcdbe8')];
const WATER_EDGE = hex('#8fbfd3');
const STREAK = hex('#7fb2c8');
const WHITE = hex('#ffffff');
const LAMP = hex('#ffc65c');
const LAMP_PALE = hex('#ffd98a');
const LAMP_CORE = hex('#fff3c8');
const LAMP_DEEP = hex('#d9822b');
const WARM_WATER = hex('#ffe6b0');
const POOL = [hex('#2e6f86'), hex('#2a6479'), hex('#3a8198')];
const POOL_DEEP = hex('#1f5466');
const RIPPLE = hex('#5aa3b8');

/** A small seeded generator, so the icon is the same on every run. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Grid = { n: number; px: RGB[] };
const grid = (n: number, fill: RGB): Grid => ({ n, px: Array.from({ length: n * n }, () => [...fill] as RGB) });
const set = (g: Grid, x: number, y: number, c: RGB) => { if (x >= 0 && y >= 0 && x < g.n && y < g.n) g.px[y * g.n + x] = c; };
const get = (g: Grid, x: number, y: number): RGB => g.px[y * g.n + x];

/** The tunnel's arched mouth behind the water (32×32 grid): 8 wide, round-topped, standing on the pool. */
function inTunnel(x: number, y: number): boolean {
  const cx = 15.5, top = 15, bottom = 24, half = 4;
  if (y > bottom || Math.abs(x - cx) > half) return false;
  if (y >= top + half) return true;
  return Math.hypot(x - cx, y - (top + half)) <= half + 0.3;
}

/** The lamp seen through the falls at a cell of the doorway: a deep amber rim, then amber, pale and a bright core. */
function lampAt(x: number, y: number): RGB {
  const rim = !inTunnel(x - 1, y) || !inTunnel(x + 1, y) || !inTunnel(x, y - 1);
  const d = Math.hypot((x - 15.5) * 1.1, y - 20.5);
  return rim ? LAMP_DEEP : d < 2 ? LAMP_CORE : d < 3.6 ? LAMP_PALE : LAMP;
}

/** The full 32×32 scene, for 48 px and up. */
export function draw32(): Grid {
  const r = rng(73);
  const g = grid(32, SKY);
  const W0 = 10, W1 = 21; // the falls' columns
  const LIP = 4; // the cliff's mossy top
  const POOL_Y = 25; // the pool's surface
  // A few stars in the night sky.
  for (const [x, y] of [[3, 1], [7, 3], [26, 1], [29, 3], [17, 0]] as const) set(g, x, y, STAR);
  // The cliff: dark limestone blocks with seams, either side of the falls.
  for (let y = LIP; y < POOL_Y; y++)
    for (let x = 0; x < 32; x++) {
      if (x >= W0 && x <= W1) continue;
      const seam = (y % 7 === 3 && r() < 0.8) || ((x + (Math.floor((y + 4) / 7) % 2) * 4) % 8 === 0 && y % 7 !== 3 && r() < 0.7);
      set(g, x, y, seam ? ROCK_SEAM : r() < 0.12 ? ROCK_LIGHT : ROCK[Math.floor(r() * 3)]);
    }
  // Moss along the lip and hanging down on the ledges.
  for (let x = 0; x < 32; x++) {
    if (x >= W0 && x <= W1) continue;
    set(g, x, LIP, MOSS[Math.floor(r() * 3)]);
    if (r() < 0.55) set(g, x, LIP + 1, MOSS[Math.floor(r() * 2)]);
    if (r() < 0.18) set(g, x, LIP + 2, MOSS[0]);
  }
  for (const [x0, x1, y] of [[1, 6, 17], [24, 30, 11], [25, 29, 20]] as const)
    for (let x = x0; x <= x1; x++) { set(g, x, y, MOSS[1 + (x % 2)]); if (r() < 0.4) set(g, x, y + 1, MOSS[0]); }
  // The falls: white water in vertical sheets, blue-grey streaks between, from the lip to the pool.
  const tunnel = inTunnel;
  // Which columns carry a thick sheet of water (the lamp shows dimmer through them) and which a thin one.
  const thick = [0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1];
  for (let x = W0; x <= W1; x++) {
    const base = WATER[Math.floor(r() * 3)];
    const streaks: [number, number][] = [];
    for (let k = 0; k < 2; k++) if (r() < 0.75) streaks.push([LIP - 1 + Math.floor(r() * 12), 3 + Math.floor(r() * 5)]);
    for (let y = LIP - 1; y < POOL_Y; y++) {
      const inStreak = streaks.some(([s, len]) => y >= s && y < s + len);
      const edge = x === W0 || x === W1;
      let c: RGB = edge ? WATER_EDGE : inStreak ? ((y - streaks[0]?.[0]) % 5 === 0 ? WHITE : STREAK) : base;
      if (!edge && tunnel(x, y)) {
        // The lamp behind the falls: a bright core fading to deep amber at the arch's rim,
        // seen through the falling sheets (thick ones veil it more than thin ones).
        const rim = !tunnel(x - 1, y) || !tunnel(x + 1, y) || !tunnel(x, y - 1);
        c = mix(lampAt(x, y), WATER[0], rim ? 0.08 : thick[x - W0] ? 0.42 : 0.1);
      } else if (!edge) {
        // A soft warm halo on the water just outside the arch.
        const d = Math.hypot(x - 15.5, y - 19.5);
        if (d < 8) c = mix(c, WARM_WATER, clamp01((8 - d) / 4) * 0.4);
      }
      set(g, x, y, c);
    }
    // The spill over the lip: the top row bulges out a pixel.
    set(g, x, LIP - 1, x === W0 || x === W1 ? SKY : WATER[0]);
  }
  // Lamplight on the rock either side of the falls.
  for (let y = 14; y < POOL_Y; y++)
    for (const x of [W0 - 2, W0 - 1, W1 + 1, W1 + 2]) {
      const near = x === W0 - 1 || x === W1 + 1 ? 0.28 : 0.14;
      set(g, x, y, mix(get(g, x, y), LAMP, near * clamp01(1 - Math.abs(y - 20) / 7)));
    }
  // The pool: deep teal, foam where the falls land, ripples, and the lamp's reflection.
  for (let y = POOL_Y; y < 32; y++)
    for (let x = 0; x < 32; x++) set(g, x, y, y >= 30 ? POOL_DEEP : POOL[Math.floor(r() * 3)]);
  for (let x = W0 - 2; x <= W1 + 2; x++) {
    set(g, x, POOL_Y, x < W0 || x > W1 ? WATER[1] : WHITE);
    if (x >= W0 - 1 && x <= W1 + 1) set(g, x, POOL_Y + 1, r() < 0.6 ? WATER[2] : RIPPLE);
  }
  for (const [x0, len, y] of [[2, 4, 27], [24, 5, 28], [5, 3, 29], [26, 3, 30]] as const)
    for (let x = x0; x < x0 + len; x++) set(g, x, y, RIPPLE);
  for (let y = 27; y < 32; y++)
    for (let x = 13; x <= 18; x++) {
      const t = clamp01(1 - Math.abs(x - 15.5) / 3.2) * clamp01(1 - (y - 27) / 5.5);
      if (y === 27 || (x + (y >> 1)) % 3 !== 0) set(g, x, y, mix(get(g, x, y), LAMP, t * 0.75));
    }
  return g;
}

/** The 32×32 scene hand-tuned clean, for 32 px tabs: the same picture with the noise taken out. */
export function drawClean32(): Grid {
  const g = grid(32, SKY);
  for (let y = 4; y < 25; y++) for (let x = 0; x < 32; x++) set(g, x, y, ROCK[0]);
  for (let x = 0; x < 32; x++) set(g, x, 4, MOSS[1]);
  for (let x = 10; x <= 21; x++) {
    const edge = x === 10 || x === 21;
    set(g, x, 3, edge ? SKY : WATER[0]);
    for (let y = 4; y < 25; y++) {
      let c: RGB = edge ? WATER_EDGE : WATER[0];
      if (!edge && inTunnel(x, y)) c = lampAt(x, y);
      else if (!edge) { const d = Math.hypot(x - 15.5, y - 19.5); if (d < 7) c = mix(c, WARM_WATER, clamp01((7 - d) / 3) * 0.6); }
      set(g, x, y, c);
    }
  }
  for (let y = 25; y < 32; y++) for (let x = 0; x < 32; x++) set(g, x, y, y >= 30 ? POOL_DEEP : POOL[0]);
  for (let x = 8; x <= 23; x++) set(g, x, 25, WHITE);
  return g;
}

/** The 16×16 version, placed by hand so it reads in a browser tab: the same picture, clean. */
export function draw16(): Grid {
  const S = SKY, R = ROCK[0], M = MOSS[1], w = WATER[0], e = WATER_EDGE, H = WARM_WATER;
  const L = LAMP, P = LAMP_PALE, C = LAMP_CORE, N = LAMP_DEEP, F = WHITE, Q = POOL[0], D = POOL_DEEP;
  const rows: RGB[][] = [
    [S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S],
    [S, S, S, S, w, w, w, w, w, w, w, w, S, S, S, S],
    [M, M, M, M, e, w, w, w, w, w, w, e, M, M, M, M],
    [R, R, R, R, e, w, w, w, w, w, w, e, R, R, R, R],
    [R, R, R, R, e, w, w, w, w, w, w, e, R, R, R, R],
    [R, R, R, R, e, w, H, H, H, H, w, e, R, R, R, R],
    [R, R, R, R, e, H, H, N, N, H, H, e, R, R, R, R],
    [R, R, R, R, e, H, N, P, P, N, H, e, R, R, R, R],
    [R, R, R, R, e, N, P, C, C, P, N, e, R, R, R, R],
    [R, R, R, R, e, N, P, C, C, P, N, e, R, R, R, R],
    [R, R, R, R, e, N, L, P, P, L, N, e, R, R, R, R],
    [R, R, R, R, e, N, L, L, L, L, N, e, R, R, R, R],
    [Q, Q, Q, F, F, F, F, F, F, F, F, F, F, Q, Q, Q],
    [Q, Q, Q, Q, Q, Q, Q, Q, Q, Q, Q, Q, Q, Q, Q, Q],
    [Q, Q, Q, Q, Q, Q, Q, Q, Q, Q, Q, Q, Q, Q, Q, Q],
    [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
  ];
  return { n: 16, px: rows.flat() };
}

/** Scales a grid to a size×size RGBA image: whole blocks where the size is a multiple, else 4×4 samples a pixel. */
export function render(g: Grid, size: number): Uint8Array {
  const out = new Uint8Array(size * size * 4), S = size % g.n === 0 ? 1 : 4;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const sum = [0, 0, 0];
      for (let j = 0; j < S; j++)
        for (let i = 0; i < S; i++) {
          const c = get(g, Math.floor(((x + (i + 0.5) / S) * g.n) / size), Math.floor(((y + (j + 0.5) / S) * g.n) / size));
          for (let k = 0; k < 3; k++) sum[k] += c[k];
        }
      out.set([Math.round(sum[0] / (S * S)), Math.round(sum[1] / (S * S)), Math.round(sum[2] / (S * S)), 255], (y * size + x) * 4);
    }
  return out;
}

/** The sizes the stores and browsers ask for: 16 and 32 px are the clean tab versions, the rest the full scene. */
export const SIZES = [16, 32, 48, 180, 192, 256, 512, 1024] as const;
export const gridFor = (size: number): Grid => (size === 16 ? draw16() : size === 32 ? drawClean32() : draw32());
export const pngFor = (size: number): Buffer => encodePng(size, size, render(gridFor(size), size), 4);

/** A .ico holding PNG images (Windows Vista and later, and every browser, read these). */
export function ico(sizes: number[]): Buffer {
  const pngs = sizes.map(pngFor);
  const head = Buffer.alloc(6 + 16 * sizes.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
  let offset = head.length;
  sizes.forEach((s, i) => {
    const e = 6 + 16 * i;
    head[e] = s >= 256 ? 0 : s; head[e + 1] = s >= 256 ? 0 : s;
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(pngs[i].length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += pngs[i].length;
  });
  return Buffer.concat([head, ...pngs]);
}

/** The full scene as an SVG of square cells, for anywhere that wants a vector file. */
export function svg(): string {
  const g = draw32();
  const cells: string[] = [];
  for (let y = 0; y < g.n; y++)
    for (let x = 0; x < g.n; x++) {
      const [r, gg, b] = get(g, x, y);
      cells.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="#${((1 << 24) | (r << 16) | (gg << 8) | b).toString(16).slice(1)}"/>`);
    }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges">${cells.join('')}</svg>\n`;
}

/** The favicon links index.html carries, inline so the page stays one file. */
export function faviconLinks(): string {
  const uri = (s: number) => `data:image/png;base64,${pngFor(s).toString('base64')}`;
  return [
    `<link rel="icon" type="image/png" sizes="16x16" href="${uri(16)}" />`,
    `<link rel="icon" type="image/png" sizes="32x32" href="${uri(32)}" />`,
    `<link rel="apple-touch-icon" sizes="180x180" href="${uri(180)}" />`,
  ].map((l) => `    ${l}`).join('\n');
}

const MARK = /    <!-- icon: written by tools\/icon\.ts -->\n[\s\S]*?    <!-- \/icon -->\n/;

if (process.argv[1]?.endsWith('icon.ts')) {
  mkdirSync('assets/icon', { recursive: true });
  for (const s of SIZES) writeFileSync(`assets/icon/icon-${s}.png`, pngFor(s));
  writeFileSync('assets/icon/icon.ico', ico([16, 32, 48]));
  writeFileSync('assets/icon/icon.svg', svg());
  const html = readFileSync('index.html', 'utf8');
  const block = `    <!-- icon: written by tools/icon.ts -->\n${faviconLinks()}\n    <!-- /icon -->\n`;
  const next = MARK.test(html) ? html.replace(MARK, block) : html.replace(/    <link rel="icon" href="data:," \/>\n/, block);
  if (next === html && !MARK.test(html)) throw new Error('index.html: no favicon line to replace');
  writeFileSync('index.html', next);
  console.log(`assets/icon: ${SIZES.join(', ')} px, icon.ico (16/32/48), icon.svg; index.html links updated`);
}
