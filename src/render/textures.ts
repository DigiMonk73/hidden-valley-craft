// Original 16×16 pixel-art textures, drawn by code in a cloud-forest palette: pale karst limestone,
// red-brown soil, deep greens. Pure (no DOM), so Node can draw a contact sheet for review.
// Each texture is RGBA, row 0 at the top.

import { makeRng } from '../core/noise.ts';

export const TEX = 16;
type RGB = [number, number, number];
type Px = Uint8ClampedArray;

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function seedOf(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return h >>> 0;
}

class Canvas16 {
  px: Px = new Uint8ClampedArray(TEX * TEX * 4);
  rng: () => number;
  constructor(name: string) { this.rng = makeRng(seedOf(name)); }

  set(x: number, y: number, c: RGB, a = 255): void {
    x &= 15; y &= 15;
    const i = (y * TEX + x) * 4;
    this.px[i] = c[0]; this.px[i + 1] = c[1]; this.px[i + 2] = c[2]; this.px[i + 3] = a;
  }
  get(x: number, y: number): RGB {
    const i = ((y & 15) * TEX + (x & 15)) * 4;
    return [this.px[i], this.px[i + 1], this.px[i + 2]];
  }
  alpha(x: number, y: number): number { return this.px[((y & 15) * TEX + (x & 15)) * 4 + 3]; }
  clearAlpha(): void { for (let i = 3; i < this.px.length; i += 4) this.px[i] = 0; }

  /** Fill with a base colour jittered per pixel, so flat areas still read as material. */
  noise(base: RGB, amount: number, palette?: RGB[], paletteChance = 0): void {
    for (let y = 0; y < TEX; y++)
      for (let x = 0; x < TEX; x++) {
        if (palette && this.rng() < paletteChance) { this.set(x, y, palette[Math.floor(this.rng() * palette.length)]); continue; }
        const j = (this.rng() - 0.5) * 2 * amount;
        this.set(x, y, [base[0] + j, base[1] + j, base[2] + j * 0.9]);
      }
  }
  /** Scatter small blobs of colour (ore, pebbles). */
  blobs(count: number, colors: RGB[], size: [number, number], highlight?: RGB): void {
    for (let n = 0; n < count; n++) {
      const cx = Math.floor(this.rng() * 14) + 1, cy = Math.floor(this.rng() * 14) + 1;
      const r = size[0] + this.rng() * (size[1] - size[0]);
      const c = colors[Math.floor(this.rng() * colors.length)];
      for (let y = -2; y <= 2; y++)
        for (let x = -2; x <= 2; x++) {
          if (x * x + y * y > r * r) continue;
          this.set(cx + x, cy + y, c);
        }
      if (highlight) this.set(cx - 1, cy - 1, highlight);
    }
  }
  shade(x: number, y: number, k: number): void {
    const c = this.get(x, y);
    this.set(x, y, [c[0] * k, c[1] * k, c[2] * k], this.alpha(x, y));
  }
}

// ---- Palette ------------------------------------------------------------------------------
const LIME = hex('#bdb6a3');
const LIME_DARK = hex('#9c9583');
const LIME_LIGHT = hex('#d2ccb9');
const MOSS = hex('#5d8a3a');
const MOSS_DARK = hex('#456d2b');
const MOSS_LIGHT = hex('#79a64a');
const DIRT = hex('#6e4b31');
const DIRT_DARK = hex('#553824');
const DIRT_LIGHT = hex('#86603f');
const GRASS = hex('#5e9b3c');
const GRASS_DARK = hex('#4a8230');
const GRASS_LIGHT = hex('#76b24c');

function limestone(c: Canvas16): void {
  c.noise(LIME, 10, [LIME_DARK, LIME_LIGHT], 0.12);
  // Bedding planes: faint horizontal layers, the look of karst limestone.
  for (const y of [4, 11]) for (let x = 0; x < TEX; x++) if (c.rng() < 0.7) c.shade(x, y, 0.9);
  // A hairline crack.
  let x = Math.floor(c.rng() * 16), y = 0;
  for (let k = 0; k < 6; k++) { c.shade(x, y, 0.78); y++; x += c.rng() < 0.5 ? 0 : (c.rng() < 0.5 ? 1 : -1); }
}

function soilNoise(c: Canvas16): void {
  c.noise(DIRT, 9, [DIRT_DARK, DIRT_LIGHT, hex('#7a6a5a')], 0.18);
}

function grassFringe(c: Canvas16, top: RGB[], depthMin: number, depthMax: number): void {
  for (let x = 0; x < TEX; x++) {
    const d = depthMin + Math.floor(c.rng() * (depthMax - depthMin + 1));
    for (let y = 0; y < d; y++) c.set(x, y, top[Math.floor(c.rng() * top.length)]);
  }
}

function leafy(c: Canvas16, colors: RGB[], holes: number): void {
  for (let y = 0; y < TEX; y++)
    for (let x = 0; x < TEX; x++) {
      const r = c.rng();
      if (r < holes) { c.set(x, y, colors[0], 0); continue; }
      c.set(x, y, colors[Math.floor(c.rng() * colors.length)]);
    }
  // Leaf highlights: small bright clusters.
  for (let k = 0; k < 6; k++) {
    const x = Math.floor(c.rng() * 16), y = Math.floor(c.rng() * 16);
    if (c.alpha(x, y)) c.set(x, y, [colors[2][0] + 25, colors[2][1] + 30, colors[2][2] + 15]);
  }
}

const DRAW: Record<string, (c: Canvas16) => void> = {
  bedrock(c) { c.noise(hex('#2f2e33'), 10, [hex('#1f1e22'), hex('#45434a')], 0.3); },
  limestone,
  limestone_mossy(c) {
    limestone(c);
    for (let y = 0; y < TEX; y++)
      for (let x = 0; x < TEX; x++) {
        const edge = y < 3 + Math.floor(c.rng() * 4) || c.rng() < 0.12;
        if (edge) c.set(x, y, [MOSS, MOSS_DARK, MOSS_LIGHT][Math.floor(c.rng() * 3)]);
      }
  },
  dirt(c) { soilNoise(c); c.blobs(3, [hex('#8d7b68'), hex('#5f4a37')], [0.5, 0.9]); },
  grass_top(c) { c.noise(GRASS, 12, [GRASS_DARK, GRASS_LIGHT, hex('#6aa843')], 0.35); },
  grass_side(c) { soilNoise(c); grassFringe(c, [GRASS, GRASS_DARK, GRASS_LIGHT], 2, 5); },
  forest_floor_top(c) {
    c.noise(hex('#4d3b28'), 12, [hex('#3e5a2a'), hex('#6b4f30'), hex('#8a5a2c'), hex('#2f2418'), hex('#556b2f')], 0.55);
  },
  forest_floor_side(c) { soilNoise(c); grassFringe(c, [hex('#4d3b28'), hex('#3e5a2a'), hex('#6b4f30')], 2, 4); },
  clay(c) {
    c.noise(hex('#a48572'), 7, [hex('#97786a'), hex('#b0917c')], 0.15);
    for (const y of [3, 8, 13]) for (let x = 0; x < TEX; x++) c.shade(x, y, 0.94);
  },
  sand(c) { c.noise(hex('#d8c99d'), 10, [hex('#c9b98c'), hex('#e6d8ad'), hex('#b8a77e')], 0.2); },
  gravel(c) {
    c.noise(hex('#8a857c'), 8);
    c.blobs(9, [hex('#a39e94'), hex('#6d6860'), hex('#bcb6aa'), hex('#7d6f62')], [0.8, 1.5], hex('#d0cabe'));
  },
  mud(c) { c.noise(hex('#4c3b2b'), 7, [hex('#3e2f22'), hex('#5a4734')], 0.2); for (let k = 0; k < 4; k++) c.set(Math.floor(c.rng() * 16), Math.floor(c.rng() * 16), hex('#7d6a55')); },
  iron_ore(c) { limestone(c); c.blobs(5, [hex('#a85a32'), hex('#c47643'), hex('#8a4526')], [0.8, 1.4], hex('#e09a63')); },
  flint_ore(c) { limestone(c); c.blobs(4, [hex('#2b2a2e'), hex('#3b3a40')], [0.9, 1.6], hex('#8b8a95')); },
  coal_ore(c) { limestone(c); c.blobs(6, [hex('#1d1c1c'), hex('#2a2828')], [0.7, 1.3], hex('#4a4848')); },
  copper_ore(c) { limestone(c); c.blobs(5, [hex('#3f9c84'), hex('#2f7f6a'), hex('#c06c3a')], [0.6, 1.2], hex('#7fd3bb')); },
  water(c) {
    c.noise(hex('#2e6f86'), 6, [hex('#2a6479'), hex('#3a8198')], 0.25);
    for (let k = 0; k < 5; k++) {
      const y = Math.floor(c.rng() * 16), x0 = Math.floor(c.rng() * 16);
      for (let x = 0; x < 4; x++) c.set(x0 + x, y, hex('#5aa3b8'));
    }
    for (let i = 3; i < c.px.length; i += 4) c.px[i] = 190;
  },
  log_side(c) {
    c.noise(hex('#4f3d2c'), 8);
    for (let x = 0; x < TEX; x += 3) for (let y = 0; y < TEX; y++) if (c.rng() < 0.75) c.shade(x + (y % 5 === 0 ? 1 : 0), y, 0.72);
    for (let k = 0; k < 8; k++) c.set(Math.floor(c.rng() * 16), Math.floor(c.rng() * 16), c.rng() < 0.5 ? MOSS : MOSS_DARK);
  },
  log_top(c) {
    for (let y = 0; y < TEX; y++)
      for (let x = 0; x < TEX; x++) {
        const d = Math.hypot(x - 7.5, y - 7.5);
        const ring = Math.floor(d) % 2 === 0;
        c.set(x, y, d > 6.6 ? hex('#4f3d2c') : ring ? hex('#a98258') : hex('#94704a'));
      }
  },
  leaves(c) { leafy(c, [hex('#2e6a2b'), hex('#24561f'), hex('#3b7d33'), hex('#2a6127')], 0.16); },
  tree_fern_side(c) {
    c.noise(hex('#4a3826'), 8);
    for (let y = 0; y < TEX; y += 4) for (let x = 0; x < TEX; x++) c.shade(x, (y + (x >> 2)) & 15, 0.7);
    for (let k = 0; k < 6; k++) c.set(Math.floor(c.rng() * 16), Math.floor(c.rng() * 16), hex('#6b5034'));
  },
  tree_fern_top(c) { c.noise(hex('#3c2c1d'), 8); for (let y = 5; y < 11; y++) for (let x = 5; x < 11; x++) c.set(x, y, hex('#5b7a2c')); },
  fern_fronds(c) {
    c.clearAlpha();
    const greens = [hex('#4e9a37'), hex('#3f8530'), hex('#5daa42')];
    for (let y = 0; y < TEX; y += 3) {
      for (let x = 0; x < TEX; x++) {
        c.set(x, y, greens[Math.floor(c.rng() * 3)]);
        if (x % 2 === 0) c.set(x, y + 1, greens[Math.floor(c.rng() * 3)]);
      }
    }
    for (let y = 0; y < TEX; y++) if (c.rng() < 0.8) c.set(7, y, hex('#3a6b25'));
  },
  planks(c) {
    c.noise(hex('#9b6c40'), 7, [hex('#8a5e36'), hex('#a8784a')], 0.15);
    for (const y of [3, 7, 11, 15]) for (let x = 0; x < TEX; x++) c.set(x, y, hex('#5e3f22'));
    for (const [x, y] of [[2, 1], [13, 5], [6, 9], [10, 13]]) c.set(x, y, hex('#6b4a2b'));
    for (const y of [0, 4, 8, 12]) c.set((y * 5 + 3) & 15, y + 1, hex('#5e3f22'));
  },
  cobble(c) {
    c.noise(hex('#6f6a60'), 5);
    for (let n = 0; n < 9; n++) {
      const cx = Math.floor(c.rng() * 16), cy = Math.floor(c.rng() * 16), r = 1.6 + c.rng() * 1.4;
      const tone = [LIME, LIME_DARK, LIME_LIGHT, hex('#aaa290')][Math.floor(c.rng() * 4)];
      for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) if (x * x + y * y < r * r) c.set(cx + x, cy + y, [tone[0] + (c.rng() - 0.5) * 12, tone[1] + (c.rng() - 0.5) * 12, tone[2] + (c.rng() - 0.5) * 10]);
    }
  },
  stone_bricks(c) {
    c.noise(LIME, 6, [LIME_LIGHT], 0.1);
    for (let y = 0; y < TEX; y++)
      for (let x = 0; x < TEX; x++) {
        const row = y >> 2;
        const off = row % 2 === 0 ? 0 : 4;
        if (y % 4 === 3 || (x + off) % 8 === 7) c.set(x, y, hex('#857e6e'));
        else if (y % 4 === 0 || (x + off) % 8 === 0) c.shade(x, y, 1.06);
      }
  },
  glass(c) {
    c.clearAlpha();
    for (let k = 0; k < TEX; k++) { c.set(k, 0, hex('#d9eef0'), 220); c.set(k, 15, hex('#d9eef0'), 220); c.set(0, k, hex('#d9eef0'), 220); c.set(15, k, hex('#d9eef0'), 220); }
    for (let k = 3; k < 7; k++) c.set(k, 10 - k, hex('#ffffff'), 200);
  },
  lantern(c) {
    c.clearAlpha();
    for (let y = 2; y < 15; y++) for (let x = 3; x < 13; x++) {
      const frame = x === 3 || x === 12 || y === 2 || y === 14 || y === 7;
      c.set(x, y, frame ? hex('#2c2a27') : y < 7 ? hex('#ffd98a') : hex('#ffc65c'));
    }
    for (let x = 6; x < 10; x++) { c.set(x, 1, hex('#2c2a27')); c.set(x, 0, hex('#2c2a27')); }
    c.set(7, 10, hex('#fff3c8')); c.set(8, 10, hex('#fff3c8')); c.set(7, 11, hex('#fff3c8'));
  },
  fern(c) {
    c.clearAlpha();
    const greens = [hex('#4f9c36'), hex('#3e862c'), hex('#62b045')];
    for (const [sx, lean] of [[3, -0.35], [8, 0.05], [12, 0.4]] as [number, number][]) {
      for (let y = 15; y > 2; y--) {
        const x = Math.round(sx + (15 - y) * lean);
        c.set(x, y, greens[1]);
        if (y % 2 === 0) { c.set(x - 1, y, greens[0]); c.set(x + 1, y, greens[2]); }
      }
    }
  },
  tall_grass(c) {
    c.clearAlpha();
    for (let k = 0; k < 9; k++) {
      let x = 1 + Math.floor(c.rng() * 14);
      const h = 6 + Math.floor(c.rng() * 9);
      for (let y = 15; y > 15 - h; y--) {
        c.set(x, y, [GRASS, GRASS_DARK, GRASS_LIGHT][Math.floor(c.rng() * 3)]);
        if (c.rng() < 0.2) x += c.rng() < 0.5 ? 1 : -1;
      }
    }
  },
  bromeliad(c) {
    c.clearAlpha();
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI;
      for (let t = 0; t < 7; t++) c.set(Math.round(7.5 + Math.cos(a) * t), Math.round(15 - Math.sin(a) * t * 0.9), k % 2 ? hex('#4d8c32') : hex('#5fa23e'));
    }
    for (let y = 6; y < 11; y++) for (let x = 6; x < 10; x++) c.set(x, y, y < 8 ? hex('#e8452c') : hex('#f07a2a'));
  },
  orchid(c) {
    c.clearAlpha();
    for (let y = 6; y < 16; y++) c.set(7 + (y > 11 ? 0 : 1), y, hex('#3f7a2c'));
    for (let y = 12; y < 16; y++) { c.set(5, y, hex('#4a8a33')); c.set(10, y, hex('#4a8a33')); }
    for (const [fx, fy] of [[8, 4], [5, 7], [11, 7]]) {
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) c.set(fx + dx, fy + dy, dx === 0 && dy === 0 ? hex('#f6e27a') : hex('#c770c9'));
    }
  },
  bamboo(c) {
    c.clearAlpha();
    for (const sx of [4, 10]) {
      for (let y = 0; y < TEX; y++) {
        const node = (y + sx) % 6 === 0;
        c.set(sx, y, node ? hex('#56742a') : hex('#7aa83c'));
        c.set(sx + 1, y, node ? hex('#4a6624') : hex('#8cbb48'));
      }
      c.set(sx + 2, (sx * 3) & 15, hex('#6aa13a'));
      c.set(sx + 3, ((sx * 3) & 15) - 1, hex('#6aa13a'));
    }
  },
  moss(c) { c.noise(MOSS, 12, [MOSS_DARK, MOSS_LIGHT, hex('#6d9940')], 0.4); },
  road(c) {
    c.noise(hex('#3d3d3f'), 8, [hex('#333335'), hex('#4a4a4c')], 0.25);
    let x = 2 + Math.floor(c.rng() * 10), y = 0;
    for (let k = 0; k < 12; k++) { c.set(x, y, hex('#262628')); y++; x += c.rng() < 0.5 ? 0 : 1; }
  },
};

/** Draws one texture by name; unknown names get a loud magenta check so they are noticed. */
export function drawTexture(name: string): Uint8ClampedArray {
  const c = new Canvas16(name);
  const fn = DRAW[name];
  if (fn) fn(c);
  else for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) c.set(x, y, (x >> 2) % 2 === (y >> 2) % 2 ? [255, 0, 255] : [0, 0, 0]);
  return c.px;
}

export function hasTexture(name: string): boolean { return name in DRAW; }

/** All textures stacked into one RGBA array, layer after layer, for a texture array. */
export function buildTextureStack(names: string[]): Uint8Array {
  const out = new Uint8Array(names.length * TEX * TEX * 4);
  names.forEach((n, i) => out.set(drawTexture(n), i * TEX * TEX * 4));
  return out;
}
