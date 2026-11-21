// The game's icon, drawn by code, in four designs for the owner to choose from (DESIGNS below). Each is the
// game's signature moment, the falls with the warm lamp of the hidden tunnel glowing behind the white water,
// in the game's own palette (src/render/textures.ts), with hand-tuned 16 and 32 px versions where needed.
//   scene    the first design: the full pixel scene (cliff, moss, stars, pool)
//   falls    flat: one white band of falling water, amber glow through its lower part, a pool line
//   doorway  a mark: the tunnel's amber arch with four thin lines of falling water across it
//   pixel    the scene in four flat colours on a 16×16 grid
// `node --experimental-strip-types --no-warnings tools/icon.ts <design>` writes assets/icon/ (PNGs at every
// store size, icon.ico, and icon.svg for the pixel designs) and the favicon links in index.html.
import { writeFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
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

/** The 32×32 design. */
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
  const tunnel = (x: number, y: number) => {
    // The tunnel's arched mouth behind the water: 8 wide, round-topped, standing on the pool.
    const cx = 15.5, top = 15, bottom = POOL_Y - 1, half = 4;
    if (y > bottom || Math.abs(x - cx) > half) return false;
    if (y >= top + half) return true;
    return Math.hypot(x - cx, y - (top + half)) <= half + 0.3;
  };
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
        const d = Math.hypot((x - 15.5) * 1.1, y - 20.5);
        const rim = !tunnel(x - 1, y) || !tunnel(x + 1, y) || !tunnel(x, y - 1);
        const glow = rim ? LAMP_DEEP : d < 2 ? LAMP_CORE : d < 3.6 ? LAMP_PALE : LAMP;
        c = mix(glow, WATER[0], rim ? 0.08 : thick[x - W0] ? 0.42 : 0.1);
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

/** The 16×16 version, placed by hand so it reads in a browser tab. */
export function draw16(): Grid {
  const S = SKY, R = ROCK[0], r = ROCK[2], E = ROCK_SEAM, M = MOSS[1], m = MOSS[0];
  const w = WATER[0], v = WATER[2], e = WATER_EDGE, t = STREAK, H = WARM_WATER;
  const L = LAMP, P = LAMP_PALE, C = LAMP_CORE, N = LAMP_DEEP, F = WHITE, f = WATER[1];
  const Q = POOL[0], q = POOL[1], D = POOL_DEEP, Z = RIPPLE;
  const o = mix(POOL[0], LAMP, 0.55), O = mix(POOL[0], LAMP, 0.3);
  const k = mix(ROCK[0], LAMP, 0.25);
  const rows: RGB[][] = [
    [S, S, S, S, S, S, S, S, S, S, S, S, S, S, S, S],
    [S, S, S, S, w, w, w, w, w, w, w, w, S, S, S, S],
    [M, M, M, M, e, w, f, w, w, f, w, e, M, M, M, M],
    [m, R, m, R, e, w, t, w, v, w, t, e, R, m, R, m],
    [R, r, R, E, e, f, t, w, v, w, w, e, E, R, r, R],
    [E, E, E, E, e, w, H, H, H, H, w, e, E, E, E, E],
    [R, R, r, R, e, H, H, N, N, H, H, e, R, R, r, R],
    [r, R, R, k, e, H, N, P, P, N, H, e, k, R, R, r],
    [M, M, R, k, e, N, P, C, C, P, N, e, k, R, R, R],
    [R, r, E, k, e, N, P, C, C, P, N, e, k, E, M, M],
    [E, E, E, E, e, N, L, P, P, L, N, e, E, E, E, E],
    [R, R, r, R, e, N, L, L, L, L, N, e, R, r, R, R],
    [Q, Q, f, F, F, F, F, F, F, F, F, F, F, f, Q, Q],
    [q, Z, Z, Q, v, Q, o, o, o, o, Q, v, Q, Z, Z, q],
    [Q, Q, Q, q, Q, Q, O, o, o, O, Q, Q, q, Q, Z, Q],
    [D, D, D, D, D, D, D, O, O, D, D, D, D, D, D, D],
  ];
  return { n: 16, px: rows.flat() };
}

/** Scales a grid to a size×size RGBA image, nearest-neighbour (whole blocks stay square where the size allows). */
export function render(g: Grid, size: number): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const c = get(g, Math.floor((x * g.n) / size), Math.floor((y * g.n) / size));
      out.set([c[0], c[1], c[2], 255], (y * size + x) * 4);
    }
  return out;
}

// ---- The three simpler designs (the owner, 2026-11-21: "a little busy … we want a professional look") ----
type RGBA = [number, number, number, number];
const NONE: RGBA = [0, 0, 0, 0];
const rgba = (c: RGB, a = 255): RGBA => [c[0], c[1], c[2], a];

/** Inside a rounded square of side n with corner radius r (the app-store safe shape)? */
const inRounded = (u: number, v: number, n: number, r: number) => {
  const cx = Math.max(r, Math.min(n - r, u)), cy = Math.max(r, Math.min(n - r, v));
  return u >= 0 && v >= 0 && u < n && v < n && Math.hypot(u - cx, v - cy) <= r;
};

/** Draws a shape given in 32 units at any size, 4×4 samples a pixel so curves are smooth. */
function sampled(size: number, f: (u: number, v: number) => RGBA): Uint8Array {
  const out = new Uint8Array(size * size * 4), k = 32 / size, S = 4;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let j = 0; j < S; j++)
        for (let i = 0; i < S; i++) {
          const c = f((x + (i + 0.5) / S) * k, (y + (j + 0.5) / S) * k);
          r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3];
        }
      const o = (y * size + x) * 4;
      if (a > 0) out.set([Math.round(r / a), Math.round(g / a), Math.round(b / a), Math.round(a / (S * S))], o);
    }
  return out;
}

/** A hand-placed 16×16 picture (RGBA cells) scaled to size, nearest-neighbour. */
function cells(px: RGBA[], size: number): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) out.set(px[Math.floor((y * 16) / size) * 16 + Math.floor((x * 16) / size)], (y * size + x) * 4);
  return out;
}
/** Clears the corner cells of a 16×16 picture, the pixel version of the rounded square. */
const roundCells = (px: RGBA[]) => { for (const [x, y] of [[0, 0], [1, 0], [0, 1]]) for (const [mx, my] of [[x, y], [15 - x, y], [x, 15 - y], [15 - x, 15 - y]]) px[my * 16 + mx] = NONE; return px; };

// Option 1, "falls": night teal, a stone lip, one crisp white sheet of water falling from it to a pool line,
// the tunnel's amber glow showing through its lower part.
const F_BG = hex('#0c2330'), F_LIP = hex('#36586a'), F_WATER = hex('#f4fafc'), F_STREAK = hex('#bfdfeb');
const F_AMBER = hex('#ffaa33'), F_AMBER_LIGHT = hex('#ffdb8f'), F_POOL = hex('#2f86a0');
const fallsGlow = (u: number, v: number) => clamp01(1 - Math.hypot((u - 16) * 1.25, v - 21.5) / 7.5);
function falls(u: number, v: number): RGBA {
  if (!inRounded(u, v, 32, 6)) return NONE;
  if (v >= 6 && v < 8 && u >= 5 && u < 27) return rgba(F_LIP);
  const g = fallsGlow(u, v);
  if (v >= 8 && v < 25 && u >= 10 && u < 22) {
    // The sheet: two faint streaks high up, then the lamp behind it, brightest in the middle.
    let c = (u >= 12 && u < 13 && v < 15) || (u >= 19 && u < 20 && v < 13) ? F_STREAK : F_WATER;
    if (g > 0) c = g > 0.45 ? mix(F_AMBER, F_AMBER_LIGHT, clamp01((g - 0.45) / 0.45)) : mix(c, F_AMBER, g / 0.45);
    return rgba(c);
  }
  if (v >= 25 && v < 27 && u >= 5 && u < 27) return rgba(u >= 9 && u < 23 && v < 26 ? F_WATER : F_POOL);
  return rgba(mix(F_BG, F_AMBER, clamp01(1 - Math.hypot((u - 16) * 1.1, v - 21) / 11) ** 2 * 0.35));
}
function falls16(): RGBA[] {
  const rows = [
    '................',
    '................',
    '................',
    '..LLLLLLLLLLLL..',
    '.....WSWWSW.....',
    '.....WSWWWW.....',
    '.....WWWWWW.....',
    '.....WWhhWW.....',
    '.....WhAAhW.....',
    '.....WACCAW.....',
    '.....WACCAW.....',
    '.....WAAAAW.....',
    '..PPWWWWWWWWPP..',
    '..PPPPPPPPPPPP..',
    '................',
    '................',
  ];
  const map: Record<string, RGBA> = {
    '.': rgba(F_BG), L: rgba(F_LIP), W: rgba(F_WATER), S: rgba(F_STREAK), h: rgba(mix(F_WATER, F_AMBER, 0.5)),
    A: rgba(F_AMBER), C: rgba(F_AMBER_LIGHT), P: rgba(F_POOL),
  };
  return roundCells(rows.join('').split('').map((ch) => map[ch]));
}

// Option 2, "doorway": the tunnel's amber arch, four thin lines of falling water across it, on a dark ground.
// The lines start at different heights and break, so they read as falling water, not bars.
const D_BG = hex('#111821'), D_EDGE = hex('#e8862a'), D_MID = hex('#ffb447'), D_CORE = hex('#ffe2a0'), D_LINE = hex('#f4fafc');
const D_LINES: [number, number, number, number][] = [[9, 6, 17, 19], [13, 3, 11, 13], [18, 5, 20, 22], [22, 8, 14, 16]]; // column, top, gap from, gap to
function doorArch(u: number, v: number): boolean {
  if (v >= 26 || u < 7 || u >= 25) return false;
  return v >= 15 || Math.hypot(u - 16, v - 15) <= 9;
}
function doorway(u: number, v: number): RGBA {
  if (!inRounded(u, v, 32, 6)) return NONE;
  if (v < 27 && D_LINES.some(([c, top, g0, g1]) => u >= c && u < c + 1 && v >= top && !(v >= g0 && v < g1))) return rgba(D_LINE);
  if (doorArch(u, v)) {
    const d = Math.hypot(u - 16, (v - 19) * 0.8) / 9;
    return rgba(d < 0.5 ? mix(D_CORE, D_MID, d / 0.5) : mix(D_MID, D_EDGE, clamp01((d - 0.5) / 0.5)));
  }
  if (v >= 26 && v < 27 && u >= 5 && u < 27) return rgba(D_LINE);
  return rgba(D_BG);
}
function doorway16(): RGBA[] {
  // Two of the four lines, so the arch still reads in a browser tab: column, first row, the rows of their break.
  const lines: [number, number, number[]][] = [[6, 1, [6]], [9, 2, [9]]];
  const px: RGBA[] = [];
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const arch = y >= 3 && y <= 11 && (y === 3 ? x >= 6 && x <= 9 : y === 4 ? x >= 4 && x <= 11 : x >= 3 && x <= 12);
      const line = y <= 11 && lines.some(([c, top, gap]) => x === c && y >= top && !gap.includes(y));
      const d = Math.hypot(x + 0.5 - 8, (y + 0.5 - 9) * 0.8) / 5;
      px.push(rgba(line || (y === 12 && x >= 2 && x <= 13) ? D_LINE : arch ? (d < 0.45 ? D_CORE : d < 0.8 ? D_MID : D_EDGE) : D_BG));
    }
  return roundCells(px);
}

// Option 3, "pixel": the scene in four flat colours on a 16×16 grid.
function pixel16(): RGBA[] {
  const K = rgba(hex('#13202b')), W = rgba(hex('#eef7fa')), A = rgba(hex('#ffb547')), T = rgba(hex('#2f7f98'));
  const rows = [
    'KKKKWWWWWWWWKKKK',
    'KKKKWWWWWWWWKKKK',
    'KKKKWWWWWWWWKKKK',
    'KKKKWWWWWWWWKKKK',
    'KKKKWWWWWWWWKKKK',
    'KKKKWWWAAWWWKKKK',
    'KKKKWWAAAAWWKKKK',
    'KKKKWAAAAAAWKKKK',
    'KKKKWAAAAAAWKKKK',
    'KKKKWAAAAAAWKKKK',
    'KKKKWAAAAAAWKKKK',
    'KKWWWWWWWWWWWWKK',
    'TTTTTTTTTTTTTTTT',
    'TTTTTTTTTTTTTTTT',
    'TTTTTTTTTTTTTTTT',
    'TTTTTTTTTTTTTTTT',
  ];
  return roundCells(rows.join('').split('').map((ch) => ({ K, W, A, T })[ch as 'K']!));
}

const FALLS16 = falls16(), DOOR16 = doorway16(), PIXEL16 = pixel16();

/** The designs, each drawing itself at any size as RGBA. */
export const DESIGNS = {
  scene: (size: number) => render(size === 16 || size === 48 ? draw16() : draw32(), size),
  falls: (size: number) => (size === 16 ? cells(FALLS16, 16) : sampled(size, falls)),
  doorway: (size: number) => (size === 16 ? cells(DOOR16, 16) : sampled(size, doorway)),
  pixel: (size: number) => cells(PIXEL16, size),
} as const;
export type Design = keyof typeof DESIGNS;

/** The sizes the stores and browsers ask for. */
export const SIZES = [16, 32, 48, 180, 192, 256, 512, 1024] as const;
export const pngFor = (design: Design, size: number): Buffer => encodePng(size, size, DESIGNS[design](size), 4);

/** A .ico holding PNG images (Windows Vista and later, and every browser, read these). */
export function ico(design: Design, sizes: number[]): Buffer {
  const pngs = sizes.map((s) => pngFor(design, s));
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

/** A pixel design as an SVG of square cells (the smooth designs get a drawn SVG once one is chosen). */
export function svg(design: 'scene' | 'pixel'): string {
  const n = design === 'scene' ? 32 : 16, px = DESIGNS[design](n), cellsOut: string[] = [];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const o = (y * n + x) * 4;
      if (!px[o + 3]) continue;
      cellsOut.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="#${((1 << 24) | (px[o] << 16) | (px[o + 1] << 8) | px[o + 2]).toString(16).slice(1)}"/>`);
    }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges">${cellsOut.join('')}</svg>\n`;
}

/** The favicon links index.html carries, inline so the page stays one file. */
export function faviconLinks(design: Design): string {
  const uri = (s: number) => `data:image/png;base64,${pngFor(design, s).toString('base64')}`;
  return [
    `<link rel="icon" type="image/png" sizes="16x16" href="${uri(16)}" />`,
    `<link rel="icon" type="image/png" sizes="32x32" href="${uri(32)}" />`,
    `<link rel="apple-touch-icon" sizes="180x180" href="${uri(180)}" />`,
  ].map((l) => `    ${l}`).join('\n');
}

const MARK = /    <!-- icon: written by tools\/icon\.ts[^>]*-->\n[\s\S]*?    <!-- \/icon -->\n/;

if (process.argv[1]?.endsWith('icon.ts')) {
  const design = process.argv[2] as Design;
  if (!(design in DESIGNS)) throw new Error(`usage: tools/icon.ts <${Object.keys(DESIGNS).join('|')}>`);
  mkdirSync('assets/icon', { recursive: true });
  for (const s of SIZES) writeFileSync(`assets/icon/icon-${s}.png`, pngFor(design, s));
  writeFileSync('assets/icon/icon.ico', ico(design, [16, 32, 48]));
  if (design === 'scene' || design === 'pixel') writeFileSync('assets/icon/icon.svg', svg(design));
  else rmSync('assets/icon/icon.svg', { force: true }); // never leave another design's vector file behind
  const html = readFileSync('index.html', 'utf8');
  const block = `    <!-- icon: written by tools/icon.ts (${design}) -->\n${faviconLinks(design)}\n    <!-- /icon -->\n`;
  const next = MARK.test(html) ? html.replace(MARK, block) : html.replace(/    <link rel="icon" href="data:," \/>\n/, block);
  if (next === html && !MARK.test(html)) throw new Error('index.html: no favicon line to replace');
  writeFileSync('index.html', next);
  console.log(`assets/icon (${design}): ${SIZES.join(', ')} px and icon.ico; index.html links updated`);
}
