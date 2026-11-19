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
  iron_ore(c) { limestone(c); c.blobs(6, [hex('#a85a32'), hex('#c47643'), hex('#8a4526')], [1.1, 1.8], hex('#e09a63')); },
  flint_ore(c) { limestone(c); c.blobs(5, [hex('#2b2a2e'), hex('#3b3a40')], [1.1, 1.9], hex('#8b8a95')); },
  coal_ore(c) { limestone(c); c.blobs(7, [hex('#1d1c1c'), hex('#2a2828')], [1.0, 1.7], hex('#4a4848')); },
  copper_ore(c) { limestone(c); c.blobs(6, [hex('#3f9c84'), hex('#2f7f6a'), hex('#c06c3a')], [0.9, 1.6], hex('#7fd3bb')); },
  water(c) {
    c.noise(hex('#2e6f86'), 6, [hex('#2a6479'), hex('#3a8198')], 0.25);
    for (let k = 0; k < 5; k++) {
      const y = Math.floor(c.rng() * 16), x0 = Math.floor(c.rng() * 16);
      for (let x = 0; x < 4; x++) c.set(x0 + x, y, hex('#5aa3b8'));
    }
    for (let i = 3; i < c.px.length; i += 4) c.px[i] = 190;
  },
  falling_water(c) {
    // Mostly white water with blue-grey streaks between the sheets; scrolled downward in the shader.
    for (let x = 0; x < TEX; x++) {
      const base = [hex('#e4f3f8'), hex('#cfe8f1'), hex('#bcdbe8')][Math.floor(c.rng() * 3)];
      for (let y = 0; y < TEX; y++) c.set(x, y, base, 238);
      if (c.rng() < 0.45) {
        let y = Math.floor(c.rng() * 16);
        const len = 4 + Math.floor(c.rng() * 8);
        for (let k = 0; k < len; k++, y++) c.set(x, y, k % 5 === 0 ? hex('#ffffff') : hex('#7fb2c8'), 215);
      }
    }
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
  chest_side(c) {
    // Planked box with dark iron bands and a brass lock.
    c.noise(hex('#8a5e36'), 6, [hex('#7a5130'), hex('#9a6b40')], 0.15);
    for (const y of [0, 5, 10, 15]) for (let x = 0; x < TEX; x++) c.set(x, y, hex('#4a3220'));
    for (let y = 0; y < TEX; y++) { c.set(0, y, hex('#3a3a3a')); c.set(15, y, hex('#3a3a3a')); }
    for (let y = 5; y < 9; y++) for (let x = 7; x < 9; x++) c.set(x, y, hex('#c9a227'));
    c.set(7, 7, hex('#3a2a10'));
  },
  chest_top(c) {
    c.noise(hex('#8a5e36'), 6, [hex('#7a5130'), hex('#9a6b40')], 0.15);
    for (let k = 0; k < TEX; k++) { c.set(k, 0, hex('#3a3a3a')); c.set(k, 15, hex('#3a3a3a')); c.set(0, k, hex('#3a3a3a')); c.set(15, k, hex('#3a3a3a')); }
    for (const x of [5, 10]) for (let y = 1; y < 15; y++) c.set(x, y, hex('#4a3220'));
  },
  // ---- Furniture and the builder's things ----
  steel(c) { c.noise(hex('#8d949a'), 6, [hex('#7d848a'), hex('#9da4aa')], 0.2); for (const y of [0, 15]) for (let x = 0; x < TEX; x++) c.set(x, y, hex('#6d747a')); },
  steel_door(c) {
    c.noise(hex('#6f777e'), 5, [hex('#646b72')], 0.15);
    for (let k = 0; k < TEX; k++) { c.set(k, 0, hex('#4a5056')); c.set(k, 15, hex('#4a5056')); c.set(0, k, hex('#4a5056')); c.set(15, k, hex('#4a5056')); }
    for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13], [2, 7], [13, 7]]) c.set(x, y, hex('#b9c0c6'));
    for (let y = 6; y < 10; y++) c.set(12, y, hex('#c9a227'));
  },
  safe_front(c) {
    c.noise(hex('#5c636a'), 4);
    for (let k = 1; k < 15; k++) { c.set(k, 1, hex('#3e444a')); c.set(k, 14, hex('#3e444a')); c.set(1, k, hex('#3e444a')); c.set(14, k, hex('#3e444a')); }
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (x * x + y * y <= 5) c.set(8 + x, 8 + y, hex('#c9a227'));
    c.set(8, 8, hex('#3a2a10')); c.set(4, 4, hex('#7fd36f'));
  },
  bed_top(c) {
    c.noise(hex('#a8332b'), 6, [hex('#962c25'), hex('#b8403a')], 0.2);
    for (let y = 11; y < 16; y++) for (let x = 1; x < 15; x++) c.set(x, y, hex('#efe8d8'));
    for (let x = 0; x < TEX; x += 4) for (let y = 0; y < 10; y++) if ((x + y) % 8 === 0) c.set(x, y, hex('#e0b94a'));
  },
  bed_side(c) { c.noise(hex('#a8332b'), 5); for (let y = 10; y < TEX; y++) for (let x = 0; x < TEX; x++) c.set(x, y, hex('#7a5130')); },
  rug(c) {
    // A woven rug: bands of red, ochre and teal.
    for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
      const band = Math.floor(Math.abs(y - 7.5) / 2.5);
      const col = [hex('#b5452f'), hex('#d39b3a'), hex('#2f7f7a'), hex('#efe2c4')][band % 4];
      c.set(x, y, (x + y) % 4 === 0 ? [col[0] * 0.85, col[1] * 0.85, col[2] * 0.85] : col);
    }
  },
  anvil(c) { c.noise(hex('#3e4348'), 5, [hex('#33373b'), hex('#4a5056')], 0.25); },
  hide(c) { c.noise(hex('#b08a5e'), 8, [hex('#9a744a'), hex('#c49e70')], 0.25); },
  solar_panel(c) {
    c.noise(hex('#1d2f55'), 4);
    for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) if (x % 4 === 0 || y % 4 === 0) c.set(x, y, hex('#9aa6b8'));
    c.set(2, 2, hex('#6c88c4')); c.set(10, 6, hex('#6c88c4'));
  },
  computer_screen(c) {
    c.noise(hex('#2b2b2b'), 3);
    for (let y = 2; y < 12; y++) for (let x = 2; x < 14; x++) c.set(x, y, hex('#0e2238'));
    for (const [y, w] of [[4, 8], [6, 5], [8, 9]]) for (let x = 3; x < 3 + w; x++) c.set(x, y, hex('#5fd38a'));
    c.set(12, 4, hex('#f7931a'));
  },
  phone(c) { c.noise(hex('#222222'), 3); for (let y = 2; y < 8; y++) for (let x = 2; x < 14; x++) c.set(x, y, hex('#3d6b8f')); for (const x of [3, 6, 9, 12]) c.set(x, 11, hex('#888888')); },
  pipe(c) { c.noise(hex('#3a3a3c'), 5, [hex('#2e2e30')], 0.2); for (const y of [0, 8]) for (let x = 0; x < TEX; x++) c.set(x, y, hex('#555558')); },
  map_top(c) {
    c.noise(hex('#e2d6b4'), 5);
    for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
      const d = Math.hypot(x - 9, y - 8);
      if (d < 4.5 && d > 3.2) c.set(x, y, hex('#7a5130'));
      else if (d < 3.2) c.set(x, y, hex('#7fae5a'));
    }
    c.set(7, 8, hex('#3b6ea5')); c.set(12, 7, hex('#c0392b'));
    for (let x = 0; x < 6; x++) c.set(x, 8 + (x % 2), hex('#9a8a6a'));
  },
  bookshelf(c) {
    c.noise(hex('#7a5130'), 4);
    const spines = [hex('#8e2b25'), hex('#2d5a7a'), hex('#4f7a2c'), hex('#c9a227'), hex('#5a3a6a'), hex('#d8cfbe')];
    for (const y0 of [1, 9]) {
      for (let x = 1; x < 15; x++) {
        const col = spines[Math.floor(c.rng() * spines.length)];
        const h = 5 + Math.floor(c.rng() * 2);
        for (let y = y0 + (6 - h); y < y0 + 6; y++) c.set(x, y, col);
      }
      for (let x = 0; x < TEX; x++) c.set(x, y0 + 6, hex('#5e3c20'));
    }
  },
  fireplace_front(c) {
    c.noise(LIME, 6, [LIME_DARK], 0.15);
    for (let y = 5; y < 16; y++) for (let x = 3; x < 13; x++) c.set(x, y, hex('#1c1410'));
    for (let x = 4; x < 12; x++) { const h = 3 + Math.floor(c.rng() * 5); for (let y = 15 - h; y < 15; y++) c.set(x, y, y > 12 - (x % 3) ? hex('#ffb347') : hex('#ff7a2e')); }
    for (let x = 4; x < 12; x++) c.set(x, 15, hex('#5a3a20'));
  },
  stove_front(c) {
    c.noise(hex('#2e2e30'), 4);
    for (let y = 6; y < 13; y++) for (let x = 3; x < 13; x++) c.set(x, y, hex('#141414'));
    for (let x = 4; x < 12; x++) for (let y = 9; y < 12; y++) c.set(x, y, (x + y) % 3 ? hex('#ff7a2e') : hex('#ffb347'));
    for (let x = 2; x < 14; x++) c.set(x, 3, hex('#c9a227'));
  },
  stove_top(c) { c.noise(hex('#2e2e30'), 4); for (const [cx, cy] of [[5, 5], [11, 11]]) for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (Math.abs(x * x + y * y - 4) < 2) c.set(cx + x, cy + y, hex('#555558')); },
  stove_side(c) { c.noise(hex('#2e2e30'), 4); for (let y = 0; y < TEX; y += 5) for (let x = 0; x < TEX; x++) c.set(x, y, hex('#3e3e40')); },
  workbench_top(c) {
    c.noise(hex('#a8784a'), 6, [hex('#946840')], 0.2);
    for (let k = 0; k < TEX; k++) { c.set(k, 0, hex('#5e3c20')); c.set(k, 15, hex('#5e3c20')); c.set(0, k, hex('#5e3c20')); c.set(15, k, hex('#5e3c20')); }
    for (let k = 3; k < 10; k++) c.set(k, 4, hex('#7d8790'));
    for (let k = 9; k < 14; k++) c.set(11, k, hex('#7d8790'));
  },
  workbench_side(c) { c.noise(hex('#8a5e36'), 5); for (const y of [0, 4]) for (let x = 0; x < TEX; x++) c.set(x, y, hex('#5e3c20')); for (const x of [1, 14]) for (let y = 4; y < TEX; y++) c.set(x, y, hex('#5e3c20')); },
  smelter_front(c) {
    c.noise(hex('#6f6a60'), 6);
    for (let y = 7; y < 14; y++) for (let x = 4; x < 12; x++) c.set(x, y, hex('#1c1410'));
    for (let x = 5; x < 11; x++) for (let y = 11; y < 14; y++) c.set(x, y, (x + y) % 2 ? hex('#ff7a2e') : hex('#ffd36a'));
  },
  kiln_front(c) {
    c.noise(LIME, 5);
    for (let y = 4; y < 14; y++) for (let x = 5; x < 11; x++) if ((x - 8) ** 2 / 9 + (y - 10) ** 2 / 25 < 1) c.set(x, y, hex('#1c1410'));
    for (let x = 6; x < 10; x++) c.set(x, 13, hex('#ff7a2e'));
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
    // A rosette of broad, arching leaves around a red-orange flower spike.
    c.clearAlpha();
    const greens = [hex('#3f7f2c'), hex('#52973a'), hex('#66ab45')];
    for (let k = 0; k < 9; k++) {
      const a = Math.PI * (0.08 + (k / 8) * 0.84);
      const len = 6 + (k % 3);
      for (let t = 0; t < len; t++) {
        const x = Math.round(7.5 + Math.cos(a) * t), y = Math.round(15 - Math.sin(a) * t * 0.95 + (t > len - 3 ? 1 : 0));
        c.set(x, y, greens[(k + t) % 3]);
        c.set(x + (Math.cos(a) > 0 ? -1 : 1), y, greens[(k + t + 1) % 3]);
      }
    }
    for (let y = 3; y < 10; y++) for (let x = 6; x < 10; x++) if ((x + y) % 3 !== 0 || y > 6) c.set(x, y, y < 6 ? hex('#ff5a2e') : hex('#e8392a'));
    c.set(7, 2, hex('#ffd34a')); c.set(8, 3, hex('#ffd34a'));
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

// ---- Crops: one drawing routine, grown stage by stage ----

const CROP_LOOK: Record<string, { fruit: RGB; leaf: RGB; tall: number; style: 'stalk' | 'bush' | 'low' }> = {
  corn: { fruit: hex('#f2c94c'), leaf: hex('#5e9b3c'), tall: 15, style: 'stalk' },
  beans: { fruit: hex('#6aa843'), leaf: hex('#4f8f2f'), tall: 13, style: 'stalk' },
  squash: { fruit: hex('#e67e22'), leaf: hex('#4e8f34'), tall: 8, style: 'low' },
  tomato: { fruit: hex('#d63031'), leaf: hex('#3f7f2c'), tall: 12, style: 'bush' },
  pepper: { fruit: hex('#e55039'), leaf: hex('#3f7f2c'), tall: 10, style: 'bush' },
  potato: { fruit: hex('#b9874f'), leaf: hex('#5a9a3a'), tall: 8, style: 'low' },
  herbs: { fruit: hex('#9fd36a'), leaf: hex('#5daa42'), tall: 7, style: 'low' },
  // M2's new crops (docs/PHASE5.md): Marco's quinoa, its seed heads going rose-gold, and the apple slip
  // growing into a small tree that fruits again after picking.
  quinoa: { fruit: hex('#c86a5a'), leaf: hex('#6a9a3a'), tall: 13, style: 'stalk' },
  apple: { fruit: hex('#c0302a'), leaf: hex('#4f8a32'), tall: 15, style: 'bush' },
};

function cropTexture(c: Canvas16, kind: string, stage: number): void {
  c.clearAlpha();
  const look = CROP_LOOK[kind];
  const h = Math.round(look.tall * [0.25, 0.5, 0.8, 1][stage]);
  const leafDark: RGB = [look.leaf[0] * 0.75, look.leaf[1] * 0.75, look.leaf[2] * 0.75];
  if (look.style === 'stalk') {
    for (const sx of [4, 11]) {
      for (let y = 15; y > 15 - h; y--) c.set(sx, y, look.leaf);
      for (let y = 15 - h + 2; y < 15; y += 3) { c.set(sx - 1, y, leafDark); c.set(sx + 1, y + 1, look.leaf); c.set(sx - 2, y + 1, leafDark); }
      if (stage === 3) for (let y = 15 - h + 3; y < 15 - h + 7; y++) { c.set(sx + 1, y, look.fruit); c.set(sx + 2, y, look.fruit); }
      if (stage === 3 && kind === 'corn') c.set(sx, 15 - h, hex('#d9b26a'));
    }
  } else {
    // A bush or a low spread of leaves.
    const w = look.style === 'low' ? 6 : 4;
    for (let y = 15; y > 15 - h; y--) {
      const spread = Math.round(w * Math.sin(((15 - y) / Math.max(1, h)) * Math.PI) + 1);
      for (let x = 8 - spread; x <= 7 + spread; x++) if (c.rng() < 0.75) c.set(x, y, c.rng() < 0.5 ? look.leaf : leafDark);
    }
    if (stage === 3) {
      const n = look.style === 'low' ? 3 : 5;
      for (let k = 0; k < n; k++) {
        const x = 4 + Math.floor(c.rng() * 8), y = 15 - Math.floor(c.rng() * Math.max(2, h - 1));
        c.set(x, y, look.fruit); c.set(x + 1, y, look.fruit); if (look.style !== 'low') c.set(x, y - 1, look.fruit);
      }
    }
  }
}

function coffeeTexture(c: Canvas16, stage: number): void {
  // A glossy dark-leaved shrub; green cherries, then red when ripe.
  c.clearAlpha();
  const h = [8, 13, 14][stage];
  for (let y = 15; y > 15 - h; y--) {
    const spread = Math.round(5 * Math.sin(((15 - y) / h) * Math.PI) + 1);
    for (let x = 8 - spread; x <= 7 + spread; x++) if (c.rng() < 0.8) c.set(x, y, c.rng() < 0.5 ? hex('#2f6b2a') : hex('#24561f'));
  }
  if (stage > 0) for (let k = 0; k < 9; k++) {
    const x = 3 + Math.floor(c.rng() * 10), y = 15 - Math.floor(2 + c.rng() * (h - 3));
    c.set(x, y, stage === 2 ? hex('#c0392b') : hex('#7fae3a'));
  }
}

// ---- Phase 3: the gate, the road's places, traps and the lost pack ----

/** Mossy limestone with a small iron ring set in it: the gate's lever, easy to miss. */
DRAW.gate_lever = (c) => {
  DRAW.limestone_mossy(c);
  const ring = hex('#4a4440'), shine = hex('#8d8378');
  for (let a = 0; a < 16; a++) {
    const t = (a / 16) * Math.PI * 2;
    c.set(Math.round(8 + Math.cos(t) * 2.6), Math.round(10 + Math.sin(t) * 2.6), a < 5 ? shine : ring);
  }
  for (const [x, y] of [[7, 6], [8, 6], [7, 7], [8, 7]]) c.set(x, y, hex('#3a3430'));
  // A faint carved mark above it: the builder's sign.
  for (const [x, y] of [[5, 3], [6, 2], [7, 3], [9, 3], [10, 2], [11, 3]]) c.shade(x, y, 0.6);
};
/** A thick glass lens in a bronze rim, glowing warm. */
DRAW.sealed_lamp = (c) => {
  limestone(c);
  for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) {
    const d = Math.hypot(x - 7.5, y - 7.5);
    if (d < 5) c.set(x, y, d > 4 ? hex('#8a6a35') : d < 2 ? hex('#fff1c4') : hex('#ffd27a'));
  }
};
/** The painted face of a park ranger's sign, faded: green board, cream border, blocky letters. */
DRAW.ranger_sign = (c) => {
  c.noise(hex('#3f5b3a'), 6, [hex('#35503a'), hex('#4c6a45')], 0.25);
  for (let k = 0; k < TEX; k++) { c.set(k, 0, hex('#d8cfa8')); c.set(k, 15, hex('#d8cfa8')); c.set(0, k, hex('#d8cfa8')); c.set(15, k, hex('#d8cfa8')); }
  const letters = [hex('#e3d9b0'), hex('#cfc49a')];
  for (const row of [3, 7, 11]) for (let x = 2; x < 14; x++) if (c.rng() < (row === 3 ? 0.75 : 0.5)) { c.set(x, row, letters[x % 2]); if (row === 3) c.set(x, row + 1, letters[(x + 1) % 2]); }
  for (let k = 0; k < 14; k++) c.shade(Math.floor(c.rng() * 16), Math.floor(c.rng() * 16), 0.7); // weathering
};
/** Two stakes and a noose of cordage: the snare as it stands in the grass. */
DRAW.snare = (c) => {
  c.clearAlpha();
  for (const sx of [3, 12]) for (let y = 8; y < 16; y++) c.set(sx, y, hex('#6b4a2b'));
  for (let a = 0; a < 24; a++) { const t = (a / 24) * Math.PI * 2; c.set(Math.round(7.5 + Math.cos(t) * 3.5), Math.round(12 + Math.sin(t) * 2.2), hex('#c9b27a')); }
  for (let x = 4; x < 12; x++) c.set(x, 9, hex('#b39c66'));
};
DRAW.snare_caught = (c) => {
  DRAW.snare(c);
  const fur = [hex('#8a7560'), hex('#9c8670'), hex('#76624f')];
  for (let y = 9; y < 15; y++) for (let x = 4; x < 12; x++) if ((x - 7.5) ** 2 / 14 + (y - 12) ** 2 / 7 < 1) c.set(x, y, fur[(x + y) % 3]);
  for (const [x, y] of [[5, 6], [5, 7], [5, 8], [7, 6], [7, 7], [7, 8]]) c.set(x, y, fur[0]); // ears
  c.set(5, 11, hex('#1d1d1d'));
  c.set(11, 12, hex('#efe8dc'));
};
/** The hutch's front: a plank frame with wire mesh and straw. */
DRAW.hutch_side = (c) => {
  c.noise(hex('#a8784a'), 6, [hex('#946840')], 0.2);
  for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) c.set(x, y, y > 10 ? hex('#d9c27a') : hex('#3a2a1c'));
  for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) if ((x + y) % 3 === 0 || (x - y + 30) % 3 === 0) c.set(x, y, hex('#9aa3a8'));
};
/** A canvas pack, dropped: khaki with straps. */
DRAW.lost_pack = (c) => {
  c.noise(hex('#7d7451'), 7, [hex('#6c6445'), hex('#8c8460')], 0.2);
  for (const x of [4, 11]) for (let y = 0; y < TEX; y++) c.set(x, y, hex('#4d4530'));
  for (let x = 5; x < 11; x++) c.set(x, 6, hex('#4d4530'));
  c.set(7, 7, hex('#b8a76a')); c.set(8, 7, hex('#b8a76a'));
};

// ---- Zone-1's near band (docs/PHASE4.md) -------------------------------------------------

const RUST = [hex('#8a4a2a'), hex('#a35a30'), hex('#6e3a22'), hex('#b8703c')];
/** Corrugated tin, rusting: grey ridges with orange-brown bleeding through. */
DRAW.tin_roof = (c) => {
  c.noise(hex('#8d9196'), 8, RUST, 0.18);
  for (let x = 0; x < TEX; x += 3) for (let y = 0; y < TEX; y++) { c.shade(x, y, 1.18); c.shade(x + 1, y, 0.82); }
};
DRAW.tin_roof_edge = (c) => { DRAW.tin_roof(c); for (let x = 0; x < TEX; x++) c.shade(x, 0, 0.7); };
DRAW.tin_roof_under = (c) => { c.noise(hex('#5d5f62'), 6, RUST, 0.25); for (let x = 1; x < TEX; x += 3) for (let y = 0; y < TEX; y++) c.shade(x, y, 0.8); };
DRAW.fence_post = (c) => {
  c.noise(hex('#7a6247'), 8, [hex('#6a5440'), hex('#8c745a')], 0.25);
  for (let y = 0; y < TEX; y += 5) for (let x = 0; x < TEX; x++) c.shade(x, y, 0.85);
};
/** A blue bus-stop board: a white bus pictogram above two timetable rows, and a scratched number below. */
DRAW.bus_sign = (c) => {
  c.noise(hex('#2c5a8c'), 5, [hex('#26507e')], 0.2);
  for (let k = 0; k < TEX; k++) { c.set(k, 0, hex('#d9dde0')); c.set(k, 15, hex('#d9dde0')); c.set(0, k, hex('#d9dde0')); c.set(15, k, hex('#d9dde0')); }
  const W = hex('#f1f1ec');
  for (let y = 3; y < 8; y++) for (let x = 4; x < 12; x++) c.set(x, y, W); // the bus
  for (const x of [5, 7, 9]) c.set(x, 4, hex('#2c5a8c')); // windows
  c.set(5, 8, hex('#1d1d1d')); c.set(10, 8, hex('#1d1d1d')); // wheels
  for (const y of [10, 12]) for (let x = 3; x < 13; x++) if (x % 3 !== 0) c.set(x, y, hex('#c9d3dc'));
  for (let x = 4; x < 12; x++) if (x !== 7) c.set(x, 14, hex('#e8e0c0')); // the number, scratched in
};
function boardText(c: Canvas16, base: RGB, letters: RGB): void {
  c.noise(base, 7, [hex('#6a5038'), hex('#80664a')], 0.25);
  for (const y of [0, 15]) for (let x = 0; x < TEX; x++) c.set(x, y, hex('#4f3b29'));
  // Faded painted letters: blocky strokes on two lines.
  for (const row of [4, 9]) for (let x = 2; x < 14; x++) {
    if (x % 4 === 1) continue;
    if (c.rng() < 0.82) { c.set(x, row, letters); c.set(x, row + 1, letters); }
    if (c.rng() < 0.3) c.set(x, row + 2, letters);
  }
  for (let k = 0; k < 16; k++) c.shade(Math.floor(c.rng() * 16), Math.floor(c.rng() * 16), 0.75);
}
DRAW.farm_sign = (c) => boardText(c, hex('#8a6d4c'), hex('#ece2c4'));
DRAW.family_sign = (c) => boardText(c, hex('#a8483a'), hex('#f0e6cc'));
/** Iron bars over a dark pit. */
DRAW.cattle_grid = (c) => {
  c.noise(hex('#1c1a18'), 4);
  for (let x = 0; x < TEX; x += 4) for (let y = 0; y < TEX; y++) { c.set(x, y, RUST[y % 4]); c.set(x + 1, y, hex('#5a4a3e')); }
};
/** The scout from above, head to the west: dark hair, an olive jacket with a red armband, the wound and its stain. */
DRAW.scout_upper = (c) => {
  c.noise(hex('#4a5a7a'), 6, [hex('#3d4a66')], 0.2); // the road showing round him is drawn as shade
  c.clearAlpha();
  const jacket = [hex('#4f5a36'), hex('#465030'), hex('#5a663e')];
  for (let z = 3; z < 13; z++) for (let x = 5; x < 16; x++) c.set(x, z, jacket[(x * 3 + z) % 3]);
  for (let z = 1; z < 3; z++) for (let x = 7; x < 16; x++) c.set(x, z, jacket[x % 3]); // the arms, out to the side
  for (let z = 13; z < 15; z++) for (let x = 7; x < 16; x++) c.set(x, z, jacket[x % 3]);
  for (let x = 10; x < 13; x++) for (const z of [1, 2]) c.set(x, z, hex('#a3241c')); // the armband
  c.set(11, 1, hex('#e9e2d0'));
  for (let z = 5; z < 11; z++) for (let x = 0; x < 5; x++) if ((x - 2.5) ** 2 / 6.5 + (z - 7.5) ** 2 / 9 < 1) c.set(x, z, x < 2 ? hex('#2a1f17') : hex('#a9805e'));
  // The wound: a dark hole in the chest, a red-brown stain spreading.
  for (let z = 5; z < 11; z++) for (let x = 7; x < 13; x++) if ((x - 9.5) ** 2 + (z - 7.5) ** 2 < 7) c.set(x, z, hex('#5a1e16'));
  c.set(9, 7, hex('#140807')); c.set(10, 7, hex('#140807')); c.set(9, 8, hex('#140807')); c.set(10, 8, hex('#2a0d0a'));
};
DRAW.scout_lower = (c) => {
  c.clearAlpha();
  const trousers = [hex('#3a3a36'), hex('#33332f'), hex('#42423d')];
  for (let z = 4; z < 12; z++) for (let x = 0; x < 11; x++) if (z !== 8 || x < 2) c.set(x, z, trousers[(x + z) % 3]);
  for (const z0 of [4, 9]) for (let z = z0; z < z0 + 3; z++) for (let x = 11; x < 15; x++) c.set(x, z, hex('#2a1e14')); // boots
};
DRAW.scout_side = (c) => { c.noise(hex('#465030'), 6, [hex('#3a3a36')], 0.4); };
DRAW.scrap_heap = (c) => {
  c.noise(hex('#6b5a4c'), 10, [...RUST, hex('#7d8288'), hex('#4a4440'), hex('#9aa0a4')], 0.55);
  for (let k = 0; k < 5; k++) { const y = Math.floor(c.rng() * 16), x0 = Math.floor(c.rng() * 10); for (let x = x0; x < x0 + 6; x++) c.set(x, y, hex('#3a3632')); }
};
DRAW.truck_body = (c) => {
  c.noise(hex('#8c3a2c'), 8, RUST, 0.35); // faded red paint gone to rust
  for (let x = 0; x < TEX; x++) { c.shade(x, 5, 0.75); c.shade(x, 6, 1.15); }
  for (let k = 0; k < 6; k++) c.set(Math.floor(c.rng() * 16), Math.floor(c.rng() * 16), hex('#3b2a20'));
};
DRAW.truck_cab = (c) => {
  DRAW.truck_body(c);
  for (let y = 2; y < 8; y++) for (let x = 2; x < 14; x++) c.set(x, y, y === 2 || x === 2 || x === 13 ? hex('#2a2622') : hex('#3e4a52')); // the window, grimy
  c.set(5, 4, hex('#7c8e98')); c.set(6, 3, hex('#7c8e98'));
};
DRAW.truck_top = (c) => { c.noise(hex('#7a3a2a'), 9, RUST, 0.45); };
DRAW.truck_under = (c) => { c.noise(hex('#2a2420'), 6, [hex('#3a2a22')], 0.3); };
DRAW.truck_wheel = (c) => {
  DRAW.truck_body(c);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const d = Math.hypot(x - 7.5, y - 9.5);
    if (d < 6.5) c.set(x, y, d < 2.5 ? hex('#7d7a74') : d < 3.4 ? hex('#4a4744') : hex('#1c1b1a'));
  }
};
/** Strands of barbed wire, sagging, with the odd barb. */
DRAW.fence_wire = (c) => {
  c.clearAlpha();
  for (const y0 of [4, 9, 13]) for (let x = 0; x < TEX; x++) {
    const y = y0 + (x > 4 && x < 11 ? 1 : 0);
    c.set(x, y, hex('#8a8580'));
    if (x % 5 === 2) { c.set(x, y - 1, hex('#6e6a66')); c.set(x, y + 1, hex('#6e6a66')); }
  }
};
/** A sagging line with faded washing pegged to it. */
DRAW.laundry = (c) => {
  c.clearAlpha();
  for (let x = 0; x < TEX; x++) c.set(x, 2 + (x > 3 && x < 12 ? 1 : 0), hex('#cfc3a4'));
  for (let y = 4; y < 12; y++) for (let x = 3; x < 8; x++) c.set(x, y, hex('#b9c7d1'));
  for (let y = 4; y < 9; y++) for (let x = 9; x < 14; x++) c.set(x, y, hex('#c98e7a'));
};
/** The coop's front: plank frame, wire mesh, straw, and a small hen-door. */
DRAW.coop_side = (c) => {
  c.noise(hex('#a8784a'), 6, [hex('#946840')], 0.2);
  for (let y = 2; y < 10; y++) for (let x = 2; x < 14; x++) c.set(x, y, (x + y) % 3 === 0 || (x - y + 30) % 3 === 0 ? hex('#9aa3a8') : hex('#3a2a1c'));
  for (let y = 10; y < 15; y++) for (let x = 2; x < 14; x++) c.set(x, y, hex('#d9c27a'));
  for (let y = 11; y < 15; y++) for (let x = 6; x < 10; x++) c.set(x, y, hex('#2a1e14'));
};

DRAW.farmland = (c) => {
  c.noise(hex('#4a3322'), 6, [hex('#3e2a1b'), hex('#5a3e28')], 0.2);
  for (const y of [1, 5, 9, 13]) for (let x = 0; x < TEX; x++) { c.set(x, y, hex('#2f2015')); c.set(x, y + 1, hex('#5e4430')); }
};

// ---- Zone-1's mid and deep bands, and M2 (docs/PHASE5.md) ---------------------------------

/** Grey hollow-core blocks in a running bond, with dark mortar and grime. */
DRAW.cinder_block = (c) => {
  c.noise(hex('#9a9890'), 7, [hex('#8a8880'), hex('#a8a69e')], 0.25);
  for (const y of [0, 8]) for (let x = 0; x < TEX; x++) c.set(x, y, hex('#5e5c56'));
  for (let y = 0; y < TEX; y++) { c.set(y < 8 ? 0 : 8, y, hex('#5e5c56')); }
  for (let k = 0; k < 10; k++) c.shade(Math.floor(c.rng() * 16), 9 + Math.floor(c.rng() * 7), 0.8);
};
/** A shop sign, blue paint gone chalky, white letters on two lines. */
DRAW.tienda_sign = (c) => boardText(c, hex('#4a7090'), hex('#efe9da'));
DRAW.sandbags = (c) => {
  c.noise(hex('#a8956a'), 8, [hex('#988560'), hex('#b8a57a')], 0.2);
  for (const y of [5, 11]) for (let x = 0; x < TEX; x++) { c.shade(x, y, 0.65); c.shade(x, y - 1, 0.85); }
  for (let y = 0; y < TEX; y++) c.shade(y < 6 ? 7 : y < 12 ? 3 : 11, y, 0.7);
};
DRAW.sandbags_top = (c) => { c.noise(hex('#b0a074'), 8, [hex('#9a8a62')], 0.2); for (let x = 0; x < TEX; x++) c.shade(x, 8, 0.75); };
DRAW.oil_drum = (c) => {
  c.noise(hex('#3c5a4a'), 6, RUST, 0.25);
  for (const y of [3, 12]) for (let x = 0; x < TEX; x++) { c.set(x, y, hex('#2c4236')); c.set(x, y + 1, hex('#5a7a68')); }
};
DRAW.oil_drum_top = (c) => { c.noise(hex('#3a3a36'), 5, RUST, 0.3); for (let k = 0; k < TEX; k++) { c.set(k, 0, hex('#2c4236')); c.set(k, 15, hex('#2c4236')); c.set(0, k, hex('#2c4236')); c.set(15, k, hex('#2c4236')); } };
/** Flames and embers in the drum's open top. */
DRAW.drum_fire = (c) => {
  c.noise(hex('#2a1a12'), 6);
  for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) { const r = c.rng(); c.set(x, y, r < 0.35 ? hex('#ffb030') : r < 0.65 ? hex('#e8641c') : r < 0.85 ? hex('#a82a10') : hex('#ffe08a')); }
  for (let k = 0; k < TEX; k++) { c.set(k, 0, hex('#2c4236')); c.set(k, 15, hex('#2c4236')); c.set(0, k, hex('#2c4236')); c.set(15, k, hex('#2c4236')); }
};
/** The raiders' flag: red cloth, the white broken circle of the scout's armband. */
DRAW.faction_flag = (c) => {
  c.noise(hex('#a3241c'), 8, [hex('#8a1c16')], 0.2);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const d = Math.hypot(x - 7.5, y - 7.5), a = Math.atan2(y - 7.5, x - 7.5);
    if (d > 3.2 && d < 5.2 && !(a > 0.3 && a < 1.0)) c.set(x, y, hex('#e9e2d0'));
  }
  for (let y = 0; y < TEX; y++) if (c.rng() < 0.3) c.set(15, y, hex('#000000'), 0); // a frayed edge
};
DRAW.supply_crate = (c) => {
  c.noise(hex('#7a6a48'), 7, [hex('#6a5c3e')], 0.2);
  for (let k = 0; k < TEX; k++) { c.set(k, 0, hex('#4a3e28')); c.set(k, 15, hex('#4a3e28')); c.set(0, k, hex('#4a3e28')); c.set(15, k, hex('#4a3e28')); c.set(k, k, hex('#5a4c32')); }
};
DRAW.supply_crate_top = (c) => { c.noise(hex('#7a6a48'), 7, [hex('#6a5c3e')], 0.2); for (let y = 0; y < TEX; y += 4) for (let x = 0; x < TEX; x++) c.shade(x, y, 0.7); };
/** The raiders' crate: a supply crate with the broken circle sprayed on it in red. */
DRAW.raiders_crate = (c) => {
  DRAW.supply_crate(c);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) { const d = Math.hypot(x - 7.5, y - 7.5), a = Math.atan2(y - 7.5, x - 7.5); if (d > 3 && d < 4.6 && !(a > 0.3 && a < 1.0)) c.set(x, y, hex('#b0281e')); }
};
DRAW.bedroll = (c) => { c.noise(hex('#4a5a3a'), 6, [hex('#3e4c30')], 0.2); for (let y = 0; y < 4; y++) for (let x = 2; x < 14; x++) c.set(x, y, hex('#8a7a5a')); };
DRAW.bedroll_side = (c) => { c.noise(hex('#3e4c30'), 5); };
/** A hand-crank forge: a firebrick hearth, a blower's drum on the side, its crank. */
DRAW.raider_forge = (c) => {
  c.noise(hex('#8a3a2a'), 8, [hex('#a8483a'), hex('#6e2e22')], 0.3);
  for (const y of [4, 8, 12]) for (let x = 0; x < TEX; x++) c.set(x, y, hex('#4a2a20'));
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) if (Math.hypot(x - 11, y - 6) < 3.5) c.set(x, y, hex('#5d5f62'));
  c.set(11, 6, hex('#1c1c1c')); for (let k = 0; k < 4; k++) c.set(11 + k, 2 - (k >> 1), hex('#3a3a3a'));
};
DRAW.forge_coals = (c) => { c.noise(hex('#2a1e18'), 6); for (let k = 0; k < 40; k++) c.set(3 + Math.floor(c.rng() * 10), 3 + Math.floor(c.rng() * 10), c.rng() < 0.5 ? hex('#e8641c') : hex('#ffb030')); };
DRAW.mina_sign = (c) => boardText(c, hex('#5a4a3a'), hex('#e8d8a8'));
DRAW.camp_sign = (c) => boardText(c, hex('#3e5a2e'), hex('#f0e6c8'));
/** A pair of antlers, bleached, for the trail head's post. */
DRAW.antlers = (c) => {
  c.clearAlpha();
  const B = hex('#e8e0cc'), D = hex('#bdb39c');
  for (const s of [-1, 1]) {
    for (let k = 0; k < 7; k++) c.set(8 + s * (1 + k), 12 - k, k % 2 ? D : B);
    for (let k = 0; k < 3; k++) { c.set(8 + s * 3, 9 - k - 1, B); c.set(8 + s * 6, 6 - k - 1, B); }
  }
  for (let y = 11; y < 15; y++) { c.set(7, y, D); c.set(8, y, B); }
};
/** The last clients: four small figures in hunting clothes by a buck, faded, the glass cracked. */
DRAW.photo = (c) => {
  c.noise(hex('#5a3a22'), 4);
  for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) c.set(x, y, y < 8 ? hex('#a8b8a0') : hex('#8a9a6a'));
  for (const x of [4, 6, 9, 11]) { c.set(x, 6, hex('#d8b890')); for (let y = 7; y < 11; y++) c.set(x, y, x === 9 ? hex('#a86a2a') : hex('#4a5a3a')); }
  for (let x = 6; x < 10; x++) c.set(x, 11, hex('#6a4a2a')); c.set(10, 9, hex('#e8dcc0'));
  for (let k = 0; k < 7; k++) c.set(3 + k, 3 + Math.round(k * 0.8), hex('#e8eef0')); // the crack
};
/** A cured hide stretched on a pole frame. */
DRAW.hide_rack = (c) => {
  c.clearAlpha();
  for (let y = 0; y < TEX; y++) { c.set(1, y, hex('#6e4a2a')); c.set(14, y, hex('#6e4a2a')); }
  for (let x = 1; x < 15; x++) c.set(x, 1, hex('#6e4a2a'));
  for (let y = 3; y < 13; y++) for (let x = 3 + (y < 5 || y > 10 ? 1 : 0); x < 13 - (y < 5 || y > 10 ? 1 : 0); x++) c.set(x, y, c.rng() < 0.2 ? hex('#a87a4a') : hex('#c09060'));
};
DRAW.meat_frame = (c) => {
  c.clearAlpha();
  for (let y = 0; y < TEX; y++) { c.set(2, y, hex('#6e4a2a')); c.set(13, y, hex('#6e4a2a')); }
  for (const y of [2, 7]) for (let x = 2; x < 14; x++) c.set(x, y, hex('#7a5a36'));
  for (const x of [5, 8, 11]) { c.set(x, 3, hex('#9a9a9a')); c.set(x, 8, hex('#9a9a9a')); }
};
DRAW.skinning_rack = (c) => {
  c.clearAlpha();
  for (let k = 0; k < TEX; k++) { c.set(k, 15 - k, hex('#6e4a2a')); c.set(15 - k, 15 - k, hex('#6e4a2a')); }
  for (let x = 3; x < 13; x++) c.set(x, 4, hex('#7a5a36'));
};
DRAW.straw = (c) => { c.noise(hex('#d9c27a'), 10, [hex('#c4ac62'), hex('#e8d48e')], 0.3); };
/** A straw-stuffed sack target: rings painted on, arrow holes. */
DRAW.archery_butt = (c) => {
  DRAW.straw(c);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const d = Math.hypot(x - 7.5, y - 7.5);
    if (d < 1.6) c.set(x, y, hex('#c0302a')); else if (d > 3 && d < 4) c.set(x, y, hex('#c0302a')); else if (d > 5.5 && d < 6.5) c.set(x, y, hex('#3a3a3a'));
  }
  for (let k = 0; k < 5; k++) c.set(3 + Math.floor(c.rng() * 10), 3 + Math.floor(c.rng() * 10), hex('#2a1e14'));
};
/** A rusted leghold trap: two jaws, a spring, the pan, its chain. */
DRAW.leghold = (c) => {
  c.clearAlpha();
  for (let a = 0; a < 40; a++) { const t = (a / 40) * Math.PI * 2; c.set(8 + Math.cos(t) * 5.5, 8 + Math.sin(t) * 4, RUST[a % 4]); }
  for (let x = 2; x < 14; x++) c.set(x, 8, hex('#5a4a3e'));
  for (let y = 6; y < 11; y++) for (let x = 6; x < 10; x++) c.set(x, y, hex('#6e5a4a'));
  for (let k = 0; k < 4; k++) c.set(13 + (k & 1), 12 + k, hex('#7a7068'));
};
/** Big cat's prints pressed into the mud: four toes and a broad pad, no claw marks. */
DRAW.jaguar_tracks = (c) => {
  c.clearAlpha();
  const P = hex('#2e2014');
  for (const [px, py] of [[4, 4], [11, 10]]) {
    for (let y = -1; y <= 1; y++) for (let x = -2; x <= 2; x++) if (x * x + y * y * 2 < 6) c.set(px + x, py + y + 2, P, 200);
    for (const [tx, ty] of [[-2, -1], [-1, -2], [1, -2], [2, -1]]) c.set(px + tx, py + ty, P, 200);
  }
};
DRAW.concrete = (c) => {
  c.noise(hex('#a8a59c'), 8, [hex('#8e8b82'), hex('#bab7ae'), hex('#6e6c66')], 0.2);
  for (let k = 0; k < 3; k++) { let x = Math.floor(c.rng() * 16), y = 0; while (y < 16) { c.set(x, y, hex('#6e6c66')); y++; x += Math.floor(c.rng() * 3) - 1; } }
  for (let k = 0; k < 6; k++) c.set(Math.floor(c.rng() * 16), Math.floor(c.rng() * 16), RUST[k % 4]); // rust weeping from the steel inside
};
/** Rebar: bent rust-brown rods hanging from broken concrete. */
DRAW.rebar = (c) => {
  c.clearAlpha();
  for (const [x0, bend] of [[3, 2], [8, -2], [12, 1]]) for (let y = 0; y < TEX; y++) { const x = x0 + Math.round((bend * y * y) / 225); c.set(x, y, RUST[(y + x0) % 4]); if (y % 3 === 0) c.set(x + 1, y, hex('#5a3a22')); }
};
/** Two-legged prints, long and narrow, with toes splayed: not a boot, not a paw. Leaf litter half over them. */
DRAW.odd_tracks = (c) => {
  c.clearAlpha();
  const P = hex('#241a10');
  for (const [px, py] of [[5, 3], [10, 10]]) {
    for (let y = 0; y < 6; y++) for (let x = 0; x < 2; x++) c.set(px + x, py + y, P, 210);
    for (const [tx, ty] of [[-1, -1], [0, -2], [1, -2], [2, -1], [3, 0]]) c.set(px + tx, py + ty, P, 210);
  }
  for (let k = 0; k < 9; k++) { const x = Math.floor(c.rng() * 16), y = Math.floor(c.rng() * 16); c.set(x, y, k % 2 ? hex('#6a5a2a') : hex('#8a6a30')); c.set(x + 1, y, hex('#6a5a2a')); }
};
/** The body from above, head to the west: pale clothes, one arm thrown out bone-white, twisted, no wound. */
DRAW.pale_upper = (c) => {
  c.clearAlpha();
  const cloth = [hex('#d8d4c8'), hex('#cac6b8'), hex('#e4e0d4')];
  for (let z = 4; z < 12; z++) for (let x = 5; x < 16; x++) c.set(x, (z + Math.round((x - 10) / 5)) & 15, cloth[(x + z) % 3]);
  for (let x = 6; x < 13; x++) c.set(x, 1 + (x > 9 ? 1 : 0), hex('#f0ece0')); // the arm thrown out, bone-white
  for (let x = 8; x < 12; x++) c.set(x, 13 + (x & 1), hex('#e8e4d8')); // the other, twisted under
  for (let z = 6; z < 11; z++) for (let x = 0; x < 5; x++) if ((x - 2.5) ** 2 / 6.5 + (z - 8) ** 2 / 8 < 1) c.set(x, z, x < 2 ? hex('#5a4a3a') : hex('#c8b8a0'));
};
DRAW.pale_lower = (c) => {
  c.clearAlpha();
  for (let z = 3; z < 8; z++) for (let x = 0; x < 13; x++) c.set(x, z, hex('#c8c4b8'));
  for (let z = 9; z < 13; z++) for (let x = 0; x < 9; x++) c.set(x + Math.floor(z / 4), z, hex('#bcb8ac')); // one leg bent back
  for (let z = 3; z < 7; z++) for (let x = 13; x < 16; x++) c.set(x, z, hex('#e8e4d8')); // a bare foot
};
DRAW.pale_side = (c) => { c.noise(hex('#cfcbbf'), 5); };
/** A wide, patchy pale stain on the ground: too wide and too pale to be blood. */
DRAW.pale_stain = (c) => {
  c.clearAlpha();
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) if (c.rng() < 0.5) c.set(x, y, c.rng() < 0.5 ? hex('#c8c8b0') : hex('#b4baa0'), 190);
};
DRAW.smoker_top = (c) => { c.noise(hex('#5a5852'), 6, [hex('#3a3a36')], 0.3); for (let y = 5; y < 11; y++) for (let x = 5; x < 11; x++) c.set(x, y, hex('#2a2a28')); };
/** A smoker: a stone firebox below, a plank chamber with a door above. */
DRAW.smoker_side = (c) => {
  c.noise(hex('#8a6a46'), 6, [hex('#7a5c3c')], 0.2);
  for (let y = 10; y < 16; y++) for (let x = 0; x < TEX; x++) c.set(x, y, (x + y) % 5 === 0 ? hex('#6e6a62') : hex('#9d978a'));
  for (let y = 12; y < 15; y++) for (let x = 5; x < 11; x++) c.set(x, y, y === 12 ? hex('#3a3a36') : hex('#e8641c'));
  for (let y = 2; y < 9; y++) { c.set(3, y, hex('#4a3a28')); c.set(12, y, hex('#4a3a28')); }
};
/** A jerky rack: strips of meat hanging on lines between the posts. */
DRAW.jerky_rack = (c) => {
  c.clearAlpha();
  for (const y of [3, 9]) for (let x = 0; x < TEX; x++) c.set(x, y, hex('#c8b98f'));
  for (const y of [3, 9]) for (let x = 1; x < 15; x += 3) for (let k = 1; k < 5; k++) c.set(x, y + k, k < 4 ? hex('#7a3a22') : hex('#5a2a18'));
};
DRAW.forge_top = (c) => { c.noise(hex('#7a7468'), 6); for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) c.set(x, y, c.rng() < 0.5 ? hex('#e8641c') : hex('#3a2a20')); };
/** The workshop's new forge: dressed stone, a firebrick mouth glowing, the raiders' blower bolted on. */
DRAW.forge_side = (c) => {
  c.noise(hex('#9d978a'), 6, [hex('#8a8478')], 0.2);
  for (const y of [5, 10]) for (let x = 0; x < TEX; x++) c.set(x, y, hex('#6e6a62'));
  for (let y = 7; y < 14; y++) for (let x = 4; x < 12; x++) c.set(x, y, y < 9 ? hex('#a8483a') : c.rng() < 0.6 ? hex('#ffb030') : hex('#e8641c'));
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) if (Math.hypot(x - 13, y - 3) < 2.2) c.set(x, y, hex('#5d5f62'));
};
/** A tool rack: pegs on a plank back, the shapes of tools hung on them. */
DRAW.tool_rack = (c) => {
  c.noise(hex('#9a7048'), 6, [hex('#8a623e')], 0.2);
  for (const x of [3, 8, 12]) { for (let y = 2; y < 13; y++) c.set(x, y, hex('#5a5a5a')); c.set(x - 1, 2, hex('#7d8790')); c.set(x + 1, 2, hex('#7d8790')); }
  for (let x = 0; x < TEX; x++) c.set(x, 14, hex('#5e3c20'));
};
DRAW.raised_bed_side = (c) => { c.noise(hex('#a8784a'), 6, [hex('#946840')], 0.2); for (let x = 0; x < TEX; x++) { c.set(x, 0, hex('#4a3322')); c.set(x, 8, hex('#7a5232')); } };
DRAW.apple_trunk = (c) => {
  c.noise(hex('#5a4a3a'), 8, [hex('#4a3c2e'), hex('#6e5c48')], 0.3);
  for (let k = 0; k < 4; k++) { const x = Math.floor(c.rng() * 16); for (let y = 0; y < TEX; y++) if (c.rng() < 0.7) c.set(x, y, hex('#3a2e22')); }
  for (let k = 0; k < 5; k++) c.set(Math.floor(c.rng() * 16), Math.floor(c.rng() * 16), hex('#8a9a5a')); // lichen
};
DRAW.apple_leaves = (c) => {
  leafy(c, [hex('#3f7a2c'), hex('#4f8a32'), hex('#5a9a3a')], 0.18);
  for (let k = 0; k < 4; k++) { const x = 1 + Math.floor(c.rng() * 14), y = 1 + Math.floor(c.rng() * 14); c.set(x, y, hex('#c0302a')); c.set(x + 1, y, hex('#a82820')); }
};

// ---- Zone-2 and power (docs/PHASE6.md) -------------------------------------------------------
const frame = (c: Canvas16, col: RGB) => { for (let k = 0; k < TEX; k++) { c.set(k, 0, col); c.set(k, 15, col); c.set(0, k, col); c.set(15, k, col); } };
/** The broken circle of the scout's armband, white (or `col`), centred, radius r. */
const brokenCircle = (c: Canvas16, col: RGB, r0 = 3.2, r1 = 5.2) => {
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const d = Math.hypot(x - 7.5, y - 7.5), a = Math.atan2(y - 7.5, x - 7.5);
    if (d > r0 && d < r1 && !(a > 0.3 && a < 1.0)) c.set(x, y, col);
  }
};
/** Photovoltaic cells: dark blue squares in a silver grid, a glint in one corner. */
DRAW.pv_cells = (c) => {
  c.noise(hex('#1d3354'), 6, [hex('#223c63'), hex('#18304d')], 0.3);
  for (const k of [0, 5, 10, 15]) for (let j = 0; j < TEX; j++) { c.set(k, j, hex('#b9c2c9')); c.set(j, k, hex('#b9c2c9')); }
  for (let k = 0; k < 4; k++) c.set(2 + k, 2 + k, hex('#6f8fb8'));
};
DRAW.battery_bank = (c) => {
  c.noise(hex('#5b6066'), 5);
  frame(c, hex('#3a3e42'));
  for (const y of [3, 7, 11]) for (let x = 2; x < 14; x++) c.set(x, y, hex('#2c2f33'));
  for (const [x, y] of [[3, 2], [3, 6], [3, 10]]) c.set(x, y, hex('#3ee05a'));
  for (let x = 6; x < 13; x++) c.set(x, 14, x < 11 ? hex('#3ee05a') : hex('#2c2f33')); // the charge gauge
};
DRAW.rig_top = (c) => { c.noise(hex('#2a2c2e'), 4); for (const x of [2, 6, 10]) for (let y = 2; y < 14; y++) c.set(x, y, hex('#4d5258')); };
/** Graphics cards side by side on an open frame, each with two fans, one LED lit. */
DRAW.mining_rig = (c) => {
  c.noise(hex('#26282b'), 4);
  for (const x0 of [1, 9]) {
    for (let y = 3; y < 13; y++) for (let x = x0; x < x0 + 6; x++) c.set(x, y, hex('#3a3d42'));
    for (const cy of [5, 10]) for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (x * x + y * y <= 5) c.set(x0 + 3 + x, cy + y, (x + y) & 1 ? hex('#16181a') : hex('#55595e'));
    c.set(x0 + 5, 3, hex('#39ff6a'));
  }
};
DRAW.fridge_side = (c) => { c.noise(hex('#dfe2e4'), 4); for (let y = 0; y < TEX; y++) c.set(15, y, hex('#b8bcc0')); };
DRAW.fridge_front = (c) => { c.noise(hex('#e8eaec'), 3); for (let x = 0; x < TEX; x++) c.set(x, 6, hex('#9aa0a6')); for (const y of [2, 3, 4, 9, 10, 11, 12]) c.set(13, y, hex('#7d8790')); };
DRAW.pump_top = (c) => { c.noise(hex('#2d6a9a'), 5); c.set(7, 7, hex('#cfd6dc')); c.set(8, 8, hex('#cfd6dc')); };
DRAW.pump_side = (c) => {
  c.noise(hex('#2d6a9a'), 5);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) if (Math.hypot(x - 7.5, y - 9) < 4) c.set(x, y, hex('#24597f'));
  for (let x = 0; x < TEX; x++) c.set(x, 2, hex('#c06c3a'));
  c.set(12, 4, hex('#3ee05a'));
};
DRAW.powder_mill_top = (c) => {
  c.noise(hex('#8f897c'), 6);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) { const d = Math.hypot(x - 7.5, y - 7.5); if (d < 5) c.set(x, y, d < 3 ? hex('#2e2a26') : hex('#6d665b')); }
  c.set(7, 7, hex('#d8d0b8')); c.set(8, 6, hex('#e6c84a'));
};
DRAW.powder_mill = (c) => { c.noise(hex('#9d978a'), 6); for (const y of [4, 10]) for (let x = 0; x < TEX; x++) c.set(x, y, hex('#5e5a52')); for (let x = 3; x < 13; x++) c.set(x, 7, hex('#6b4423')); };
DRAW.awning = (c) => { c.noise(hex('#c9b98a'), 6); for (let x = 0; x < TEX; x += 4) for (let y = 0; y < TEX; y++) { c.set(x, y, hex('#3e7a6a')); c.set(x + 1, y, hex('#3e7a6a')); } };
/** Asphalt with a dashed yellow centre line down the middle. */
DRAW.road_line = (c) => { DRAW.road(c); for (let y = 0; y < 10; y++) for (const x of [7, 8]) c.set(x, y, c.rng() < 0.85 ? hex('#d9b43a') : hex('#a88c34')); };
/** A concrete barrier painted with the faction's broken circle, in red. */
DRAW.barrier_mark = (c) => { DRAW.concrete(c); brokenCircle(c, hex('#b0281e'), 3, 5.3); };
/** The green highway sign: a white border, an arrow up, two lines of white letters. */
DRAW.highway_sign = (c) => {
  c.noise(hex('#1f6b3a'), 4);
  frame(c, hex('#e8efe8'));
  const W = hex('#f2f5f2');
  for (let y = 2; y < 7; y++) c.set(7, y, W), c.set(8, y, W);
  c.set(6, 3, W); c.set(9, 3, W); c.set(5, 4, W); c.set(10, 4, W);
  for (const row of [9, 12]) for (let x = 2; x < 14; x++) if (x % 4 !== 1 && c.rng() < 0.9) { c.set(x, row, W); c.set(x, row + 1, W); }
};
DRAW.cruces_board = (c) => { boardText(c, hex('#8a6a42'), hex('#f0e8d0')); for (let y = 2; y < 6; y++) { c.set(13, y, hex('#f0e8d0')); } c.set(12, 3, hex('#f0e8d0')); c.set(14, 3, hex('#f0e8d0')); };
DRAW.guard_rail = (c) => { c.noise(hex('#a9b0b5'), 6, RUST, 0.15); for (let x = 0; x < TEX; x++) { c.shade(x, 7, 0.75); c.shade(x, 8, 1.15); } };
/** A cable tray: a perforated steel channel carrying bundled copper cable. */
DRAW.cable_tray = (c) => {
  c.noise(hex('#8e969c'), 5);
  for (let y = 2; y < 14; y += 3) for (let x = 0; x < TEX; x++) { c.set(x, y, hex('#c06c3a')); c.set(x, y + 1, hex('#e08a4e')); }
  for (let x = 1; x < TEX; x += 4) c.set(x, 0, hex('#5a6066'));
};
DRAW.copper_pipe = (c) => { c.noise(hex('#b8683a'), 7, [hex('#3e8a6a')], 0.08); for (let y = 0; y < TEX; y++) { c.shade(4, y, 1.25); c.shade(11, y, 1.25); } for (const y of [5, 12]) for (let x = 0; x < TEX; x++) c.shade(x, y, 0.7); };
DRAW.car_battery = (c) => { c.noise(hex('#2b2b2b'), 4); for (let x = 1; x < 15; x++) c.set(x, 4, hex('#c0392b')); for (let x = 3; x < 7; x++) c.set(x, 8, hex('#d9d9d9')); };
DRAW.car_battery_top = (c) => { c.noise(hex('#333333'), 4); c.set(3, 3, hex('#c0392b')); c.set(4, 3, hex('#c0392b')); c.set(11, 3, hex('#9aa0a6')); c.set(12, 3, hex('#9aa0a6')); };
/** A supermarket display fridge: glass doors, dark and empty behind, a dead price strip. */
DRAW.display_fridge = (c) => {
  c.noise(hex('#d8dcdf'), 3);
  for (const x0 of [1, 8]) for (let y = 2; y < 15; y++) for (let x = x0; x < x0 + 6; x++) c.set(x, y, (x + y) % 7 === 0 ? hex('#6f8794') : hex('#2b3a42'));
  for (let x = 0; x < TEX; x++) c.set(x, 1, hex('#3b6ea5'));
};
DRAW.shop_shelf = (c) => { c.noise(hex('#a9aeb2'), 5, RUST, 0.06); for (const y of [0, 5, 10, 15]) for (let x = 0; x < TEX; x++) c.set(x, y, hex('#6f767c')); };
DRAW.counter = (c) => { c.noise(hex('#e6e2d6'), 4); for (let x = 0; x < TEX; x++) c.set(x, 2, hex('#2e8a4a')); };
/** The counter's top: and on it, Doc's white card. */
DRAW.counter_top = (c) => { c.noise(hex('#cfc8b6'), 4); for (let y = 6; y < 10; y++) for (let x = 5; x < 11; x++) c.set(x, y, hex('#fbfbf6')); c.set(6, 7, hex('#2e8a4a')); for (let x = 7; x < 10; x++) c.set(x, 8, hex('#7a7a7a')); };
DRAW.counter_top_plain = (c) => { c.noise(hex('#cfc8b6'), 4); };
/** A green cross on white: a pharmacy anywhere. */
DRAW.pharmacy_sign = (c) => { c.noise(hex('#f2f2ee'), 3); frame(c, hex('#2e8a4a')); for (let y = 3; y < 13; y++) for (let x = 6; x < 10; x++) { c.set(x, y, hex('#1fb34a')); c.set(y, x, hex('#1fb34a')); } };
/** A spanner and a hammer crossed, white on orange. */
DRAW.hardware_sign = (c) => { c.noise(hex('#c8641e'), 5); frame(c, hex('#7a3a10')); for (let k = 3; k < 13; k++) { c.set(k, k, hex('#fbf3e8')); c.set(15 - k, k, hex('#fbf3e8')); } c.set(3, 2, hex('#fbf3e8')); c.set(2, 3, hex('#fbf3e8')); c.set(11, 2, hex('#fbf3e8')); c.set(13, 2, hex('#fbf3e8')); c.set(12, 2, hex('#fbf3e8')); };
/** A shopping cart, white on blue. */
DRAW.market_sign = (c) => {
  c.noise(hex('#2c5a9c'), 4); frame(c, hex('#1c3c6c'));
  const W = hex('#f5f7fa');
  for (let x = 4; x < 13; x++) { c.set(x, 5, W); c.set(x, 9, W); }
  for (let y = 5; y < 10; y++) { c.set(4 + ((y - 5) >> 1), y, W); c.set(12, y, W); }
  c.set(2, 4, W); c.set(3, 4, W); c.set(5, 11, W); c.set(11, 11, W);
};
/** A telephone handset, white on grey-blue. */
DRAW.exchange_sign = (c) => {
  c.noise(hex('#4a5a6a'), 4); frame(c, hex('#2c3640'));
  const W = hex('#eef2f5');
  for (let x = 4; x < 12; x++) c.set(x, 5, W);
  for (const x of [3, 4, 11, 12]) for (let y = 6; y < 9; y++) c.set(x, y, W);
  for (let y = 9; y < 12; y++) for (let x = 6; x < 10; x++) c.set(x, y, W);
};
/** A server rack's front: rows of 1U servers, little green and amber lights. */
DRAW.server_rack = (c) => {
  c.noise(hex('#1c1d20'), 3);
  frame(c, hex('#3a3c40'));
  for (let y = 2; y < 14; y += 2) { for (let x = 2; x < 14; x++) c.set(x, y, hex('#2c2e33')); c.set(12, y, c.rng() < 0.6 ? hex('#3ee05a') : hex('#e0a526')); }
};
DRAW.ups_cabinet = (c) => { c.noise(hex('#3c4148'), 4); frame(c, hex('#24282d')); for (let y = 3; y < 13; y += 3) for (let x = 3; x < 13; x++) c.set(x, y, hex('#2a2e33')); for (let x = 3; x < 8; x++) c.set(x, 14, hex('#e0a526')); c.set(12, 14, hex('#c0392b')); };
DRAW.mast = (c) => { c.clearAlpha(); for (let y = 0; y < TEX; y++) { c.set(0, y, hex('#9aa0a6')); c.set(15, y, hex('#9aa0a6')); c.set(y, y, hex('#7d8790')); c.set(15 - y, y, hex('#7d8790')); } for (let x = 0; x < TEX; x++) c.set(x, 0, hex('#9aa0a6')); };
DRAW.red_beacon = (c) => { c.noise(hex('#ff3b2e'), 10); c.set(6, 6, hex('#ffd0c8')); c.set(7, 6, hex('#ffd0c8')); };
DRAW.street_light = (c) => { c.noise(hex('#4a4d50'), 4); for (let x = 3; x < 13; x++) for (let y = 10; y < 15; y++) c.set(x, y, hex('#fff3c8')); };
/** A white van gone grey, a faded red cross on the side, rust at the seams. */
DRAW.van_body = (c) => {
  c.noise(hex('#cfd2cf'), 6, RUST, 0.06);
  for (let y = 5; y < 11; y++) for (let x = 6; x < 10; x++) { c.set(x, y, hex('#b84a42')); c.set(y, x, hex('#b84a42')); }
  for (let x = 0; x < TEX; x++) c.shade(x, 15, 0.7);
};
DRAW.lead_casket = (c) => { c.noise(hex('#5e646a'), 6); for (let y = 0; y < TEX; y++) c.set(y, 7 + ((y * 3) % 3), hex('#2a2d30')); };
DRAW.lead_casket_top = (c) => { c.noise(hex('#666c72'), 6); DRAW.rad_sign_mark(c); };
/** The trefoil in black on yellow. */
DRAW.rad_sign_mark = (c) => {
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const d = Math.hypot(x - 7.5, y - 7.5), a = (Math.atan2(y - 7.5, x - 7.5) + Math.PI * 2) % ((Math.PI * 2) / 3);
    if (d < 1.4 || (d > 2.4 && d < 6 && a > 0.35 && a < 1.75)) c.set(x, y, hex('#141414'));
  }
};
DRAW.rad_sign = (c) => { c.noise(hex('#f2c81c'), 6); frame(c, hex('#141414')); DRAW.rad_sign_mark(c); };
DRAW.hazard_tape = (c) => {
  c.clearAlpha();
  for (const y of [6, 7, 8]) for (let x = 0; x < TEX; x++) c.set(x, y, ((x + y) >> 1) % 2 ? hex('#f2c81c') : hex('#1a1a1a'));
};
/** Grey, dead ground: ash and a few dry stalks, no green. */
DRAW.dead_soil = (c) => { c.noise(hex('#7a7468'), 9, [hex('#8a8476'), hex('#5e5a52'), hex('#9c9688')], 0.3); for (let k = 0; k < 4; k++) c.set(Math.floor(c.rng() * 16), Math.floor(c.rng() * 16), hex('#b8a878')); };
/** Saltpeter: white, fuzzy crystals crusting the limestone. */
DRAW.saltpeter_crust = (c) => { limestone(c); c.blobs(9, [hex('#f6f4ee'), hex('#ecebe4'), hex('#ffffff')], [1, 2.4], hex('#ffffff')); };
/** Sulfur: bright yellow crust, a little green, on dark wet rock. */
DRAW.sulfur_crust = (c) => { c.noise(hex('#5a5448'), 7); c.blobs(10, [hex('#e8d23a'), hex('#d4bc2a'), hex('#f2e66a')], [1, 2.6], hex('#fff69a')); };
/** Grey, smooth, poured in place: shuttering lines and tie holes. */
DRAW.reinforced_concrete = (c) => {
  c.noise(hex('#8c8c88'), 5, [hex('#7c7c78'), hex('#9a9a96')], 0.2);
  for (let x = 0; x < TEX; x++) c.shade(x, 0, 0.8);
  for (const [x, y] of [[3, 4], [12, 4], [3, 11], [12, 11]]) c.set(x, y, hex('#4a4a46'));
};
DRAW.wall_mark = (c) => { DRAW.reinforced_concrete(c); brokenCircle(c, hex('#ece6d8'), 3.6, 6.4); };
DRAW.steel_gate = (c) => { c.noise(hex('#5a5f64'), 5, RUST, 0.12); for (let x = 0; x < TEX; x += 4) for (let y = 0; y < TEX; y++) c.shade(x, y, 0.7); for (const y of [3, 12]) for (let x = 0; x < TEX; x++) c.shade(x, y, 1.2); };
DRAW.searchlight = (c) => { c.noise(hex('#3a3d40'), 4); for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) if (Math.hypot(x - 7.5, y - 7.5) < 5) c.set(x, y, hex('#fffbe6')); };


// ---- The builder's home, rebuilt (docs/HOME.md) ---------------------------------------------------------
// Furniture is made of several boxes, each with its own texture, and a box shows the part of its texture that
// matches where it sits in the block. So the fronts below are drawn where their box is, not centred on the tile.
const WALNUT = hex('#5b3a21'), WALNUT_D = hex('#40281a'), WALNUT_L = hex('#74502f');
const BRASS = hex('#c9a227'), BRASS_L = hex('#f0d264'), BRASS_D = hex('#8a6d17');
const IRON_C = hex('#2b2b2e'), IRON_L = hex('#45454a'), IRON_D = hex('#1b1b1d');
const CREAM = hex('#d8ccb0');
const rect = (c: Canvas16, x0: number, y0: number, x1: number, y1: number, col: RGB, a = 255) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) c.set(x, y, col, a); };
const box = (c: Canvas16, x0: number, y0: number, x1: number, y1: number, col: RGB) => { for (let x = x0; x <= x1; x++) { c.set(x, y0, col); c.set(x, y1, col); } for (let y = y0; y <= y1; y++) { c.set(x0, y, col); c.set(x1, y, col); } };
/** Wood with the grain running across the tile: a base, a few long darker streaks, a knot or two. */
function wood(c: Canvas16, base: RGB, dark: RGB, light: RGB, amount = 5): void {
  c.noise(base, amount);
  for (const y of [2, 6, 9, 13]) { let x = Math.floor(c.rng() * 6); while (x < TEX) { const n = 3 + Math.floor(c.rng() * 6); for (let k = 0; k < n && x < TEX; k++, x++) c.set(x, y, dark); x += 1 + Math.floor(c.rng() * 4); } }
  for (const y of [4, 11]) for (let x = 0; x < TEX; x++) if (c.rng() < 0.3) c.set(x, y, light);
}
DRAW.walnut = (c) => wood(c, WALNUT, WALNUT_D, WALNUT_L);
DRAW.teak = (c) => wood(c, hex('#a07a4c'), hex('#836039'), hex('#b58f60'), 6);
DRAW.teak_slats = (c) => { wood(c, hex('#a07a4c'), hex('#836039'), hex('#b58f60'), 6); for (const y of [0, 5, 10, 15]) for (let x = 0; x < TEX; x++) c.set(x, y, [0, 0, 0], 0); for (const y of [1, 6, 11]) for (let x = 0; x < TEX; x++) c.shade(x, y, 1.12); for (const y of [4, 9, 14]) for (let x = 0; x < TEX; x++) c.shade(x, y, 0.82); };
DRAW.beam = (c) => { wood(c, hex('#5e4127'), hex('#3f2a18'), hex('#765536'), 7); for (let k = 0; k < 5; k++) { const x = Math.floor(c.rng() * 14), y = Math.floor(c.rng() * 16); c.shade(x, y, 0.75); c.shade(x + 1, y, 0.8); } for (let x = 0; x < TEX; x++) { c.shade(x, 0, 0.8); c.shade(x, 15, 0.72); } };
DRAW.beam_t = (c) => { const b = new Canvas16('beam'); DRAW.beam(b); for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) c.set(x, y, b.get(y, x)); };
DRAW.linen = (c) => { c.noise(CREAM, 5, [hex('#cbbf9f'), hex('#e2d8bf')], 0.25); for (let y = 0; y < TEX; y += 2) for (let x = (y >> 1) % 2; x < TEX; x += 2) c.shade(x, y, 0.96); };
DRAW.sheet = (c) => { c.noise(hex('#ebe4d2'), 3, [hex('#dfd7c2')], 0.12); };
DRAW.pillow = (c) => { c.noise(hex('#f4efe4'), 3); for (let k = 0; k < TEX; k++) { c.shade(k, 15, 0.9); c.shade(15, k, 0.93); } };
DRAW.leather = (c) => { c.noise(hex('#8a4a2a'), 6, [hex('#7a3f23'), hex('#9a5632')], 0.3); for (let k = 0; k < 6; k++) { let x = Math.floor(c.rng() * 16), y = Math.floor(c.rng() * 16); for (let n = 0; n < 4; n++) { c.shade(x, y, 0.8); x += 1; y += c.rng() < 0.5 ? 1 : 0; } } for (const [x, y] of [[4, 4], [11, 4], [4, 11], [11, 11]]) c.set(x, y, hex('#5a2e18')); };
DRAW.blanket = (c) => {
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const band = y % 8;
    const col = band === 1 ? hex('#d39b3a') : band === 2 ? hex('#efe2c4') : band === 3 ? hex('#2f7f7a') : hex('#a8332b');
    c.set(x, y, (x + y) % 3 === 0 ? [col[0] * 0.88, col[1] * 0.88, col[2] * 0.88] : col);
  }
};
DRAW.throw_pillow = (c) => { c.noise(hex('#2f7f7a'), 5, [hex('#276b66')], 0.2); for (let k = 0; k < TEX; k += 2) { c.set(k, k, hex('#d39b3a')); c.set(15 - k, k, hex('#d39b3a')); } };
DRAW.seat_cushion = (c) => { c.noise(hex('#5d7f8a'), 5, [hex('#51717c'), hex('#6b8f9a')], 0.25); for (const [x, y] of [[3, 3], [11, 3], [7, 8], [3, 12], [11, 12]]) { c.set(x, y, hex('#3c545c')); c.set(x + 1, y, hex('#86a8b3')); } for (let k = 0; k < TEX; k++) { c.shade(k, 0, 0.85); c.shade(k, 15, 0.85); } };
DRAW.brass = (c) => { c.noise(BRASS, 5); for (let k = 0; k < TEX; k++) { c.set(k, (k * 3) & 15, BRASS_L); if (k % 5 === 0) c.set(k, (k * 7 + 5) & 15, BRASS_D); } };
DRAW.cast_iron = (c) => { c.noise(IRON_C, 4, [IRON_D, hex('#333336')], 0.25); for (let x = 0; x < TEX; x++) { c.set(x, 0, IRON_L); c.set(x, 15, IRON_D); } };
/** The range's fronts are seen through its body (rows 2 to 13 of the tile). */
function rangeFront(c: Canvas16): void { DRAW.cast_iron(c); for (let x = 0; x < TEX; x++) { c.set(x, 2, IRON_L); c.set(x, 13, IRON_D); } for (let y = 2; y < 14; y++) { c.set(0, y, IRON_D); c.set(15, y, IRON_D); } }
DRAW.range_oven_front = (c) => {
  rangeFront(c);
  box(c, 2, 4, 13, 12, IRON_L); rect(c, 3, 5, 12, 11, hex('#232326'));
  rect(c, 4, 9, 11, 9, IRON_L); // a vent slit
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx * dx + dy * dy <= 1) c.set(8 + dx, 7 + dy, hex('#e9e2cf')); // the thermometer
  c.set(8, 7, hex('#b5452f'));
  c.set(3, 5, BRASS); c.set(3, 11, BRASS); // hinges
};
DRAW.range_fire_front = (c) => {
  rangeFront(c);
  box(c, 3, 3, 12, 8, IRON_L); rect(c, 4, 4, 11, 7, hex('#1a1210'));
  for (let x = 4; x <= 11; x++) for (let y = 4; y <= 7; y++) if (x % 2 === 0) c.set(x, y, y >= 6 ? hex('#ffb347') : hex('#ff7a2e')); // the glow through the grate
  box(c, 4, 10, 11, 12, IRON_L); c.set(7, 11, BRASS); c.set(8, 11, BRASS_L); // the ash door and its knob
};
DRAW.range_tank_front = (c) => {
  rangeFront(c);
  box(c, 2, 3, 7, 8, IRON_L); box(c, 9, 3, 13, 8, IRON_L); c.set(6, 6, BRASS); c.set(10, 6, BRASS);
  rect(c, 2, 10, 13, 10, IRON_L);
  c.set(7, 11, BRASS); c.set(8, 11, BRASS_L); c.set(8, 12, BRASS); // the tap
};
DRAW.range_top = (c) => {
  c.noise(hex('#252528'), 3);
  for (let k = 0; k < TEX; k++) { c.set(k, 0, IRON_L); c.set(k, 15, IRON_L); c.set(0, k, IRON_L); c.set(15, k, IRON_L); }
  for (const [cx, cy] of [[4.5, 5.5], [10.5, 9.5]]) for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) { const d = Math.hypot(x - cx, y - cy); if (d > 2.4 && d < 3.4) c.set(x, y, IRON_L); else if (d < 1) c.set(x, y, hex('#5a3a2a')); }
};
DRAW.range_top_plain = (c) => {
  c.noise(hex('#252528'), 3);
  for (let k = 0; k < TEX; k++) { c.set(k, 0, IRON_L); c.set(k, 15, IRON_L); c.set(0, k, IRON_L); c.set(15, k, IRON_L); }
  box(c, 4, 5, 11, 12, hex('#38383c')); c.set(7, 8, IRON_L); c.set(8, 8, IRON_L);
};
DRAW.copper = (c) => {
  c.noise(hex('#b4683a'), 8, [hex('#c97b48'), hex('#9d5630'), hex('#d68f5c')], 0.3);
  for (let x = 0; x < TEX; x++) { c.set(x, 15, hex('#7d4526')); c.set(x, 14, hex('#955330')); if (x % 4 === 1) c.set(x, 13, hex('#e6a877')); c.set(x, 6, hex('#955330')); }
};
DRAW.firebrick = (c) => {
  c.noise(hex('#7d4631'), 8, [hex('#6a3a28'), hex('#8f5238'), hex('#5a3124')], 0.3);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) { const off = (y >> 2) % 2 === 0 ? 0 : 4; if (y % 4 === 3 || (x + off) % 8 === 7) c.set(x, y, hex('#3a2620')); }
  for (let k = 0; k < 10; k++) c.shade(Math.floor(c.rng() * 16), Math.floor(c.rng() * 16), 0.7); // soot
};
DRAW.lit_embers = (c) => {
  const cols = [hex('#ff7a2e'), hex('#ffb347'), hex('#e0461c'), hex('#ffd98a'), hex('#b02e12'), hex('#3a1a10')];
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) c.set(x, y, cols[Math.floor(c.rng() * cols.length)]);
  for (let k = 0; k < 10; k++) { const x = Math.floor(c.rng() * 15), y = Math.floor(c.rng() * 15); c.set(x, y, hex('#2a1510')); c.set(x + 1, y, hex('#2a1510')); }
};
DRAW.char_log = (c) => {
  c.noise(hex('#2c1e16'), 6, [hex('#1c120d'), hex('#3d2a1e')], 0.3);
  for (let k = 0; k < 9; k++) c.set(Math.floor(c.rng() * 16), Math.floor(c.rng() * 16), k % 3 ? hex('#ff7a2e') : hex('#ffb347'));
  for (const y of [3, 9, 13]) for (let x = 0; x < TEX; x++) if (c.rng() < 0.5) c.set(x, y, hex('#140c08'));
};
/** A flame as a sheet: tongues rising from row `foot` of the tile to row `top`, between two columns. */
function flame(c: Canvas16, x0: number, x1: number, top: number, tongues: number, foot = 15): void {
  c.clearAlpha();
  const mid = (x0 + x1) / 2, half = (x1 - x0) / 2;
  for (let t = 0; t < tongues; t++) {
    const cx = x0 + ((t + 0.5) / tongues) * (x1 - x0) + (c.rng() - 0.5) * 1.5;
    const reach = 1 - Math.abs(cx - mid) / (half + 1.5); // the middle tongues stand tallest
    const tip = Math.round(foot - (foot - top) * (0.55 + 0.45 * reach) * (0.8 + 0.2 * c.rng()));
    const lean = (c.rng() - 0.5) * 0.3;
    for (let y = foot; y >= tip; y--) {
      const h = (foot - y) / Math.max(1, foot - tip); // 0 at the foot, 1 at the tip
      const w = (1 - h) * (1 - h) * (1.2 + (foot - top) / 13) + 0.4;
      const px = cx + lean * (foot - y) + Math.sin(y * 1.3 + t) * 0.5;
      for (let x = Math.round(px - w); x <= Math.round(px + w); x++) {
        if (x < x0 || x > x1) continue;
        const core = Math.abs(x - px) / (w + 0.01);
        c.set(x, y, h < 0.35 && core < 0.45 ? hex('#fff1b8') : h < 0.65 && core < 0.7 ? hex('#ffc04d') : h > 0.85 ? hex('#e8501c') : hex('#ff8a2e'));
      }
    }
  }
}
DRAW.flame_a = (c) => flame(c, 1, 14, 0, 6);
DRAW.flame_b = (c) => flame(c, 2, 13, 3, 4);
DRAW.flame_c = (c) => flame(c, 2, 13, 6, 4);
DRAW.flame_low = (c) => flame(c, 3, 12, 0, 3, 5);
DRAW.flame_candle = (c) => { c.clearAlpha(); for (const [x, y, col] of [[7, 5, '#ffc04d'], [8, 5, '#ffc04d'], [7, 4, '#fff1b8'], [8, 4, '#ffc04d'], [7, 3, '#ff8a2e'], [8, 2, '#ff8a2e'], [8, 3, '#ffc04d']] as [number, number, string][]) c.set(x, y, hex(col)); };
DRAW.candle = (c) => { c.noise(hex('#efe6cc'), 3); };
DRAW.log_pile_end = (c) => {
  // Split logs stacked end-on: pale cut faces, each ringed with bark, dark gaps between.
  c.noise(hex('#24170f'), 4);
  for (const [cx, cy, r] of [[2.5, 2.5, 2.6], [8, 2.5, 2.6], [13.5, 2.5, 2.6], [5, 7.5, 2.6], [10.5, 7.5, 2.6], [0, 7.5, 2.2], [15.5, 7.5, 2.2], [2.5, 12.8, 2.7], [8, 12.8, 2.7], [13.5, 12.8, 2.7]] as [number, number, number][])
    for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) { const d = Math.hypot(x - cx, y - cy); if (d < r) c.set(x, y, d > r - 0.9 ? hex('#6b4a2b') : d < 0.7 ? hex('#9a7242') : hex('#c9a36b')); }
};
DRAW.log_pile_side = (c) => {
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) { const r = y % 5; const base = r === 4 ? hex('#2a1c12') : r === 0 ? hex('#6b4a2b') : hex('#5a3d22'); const j = (c.rng() - 0.5) * 14; c.set(x, y, [base[0] + j, base[1] + j, base[2] + j]); }
  for (let k = 0; k < 8; k++) { const x = Math.floor(c.rng() * 14), y = Math.floor(c.rng() * 16); c.shade(x, y, 0.7); c.shade(x + 1, y, 0.7); c.shade(x + 2, y, 0.75); }
};
DRAW.counter_top = (c) => { c.noise(hex('#cdc6b2'), 5, [hex('#bfb8a4'), hex('#dad4c2')], 0.15); for (let k = 0; k < TEX; k++) { c.shade(k, 15, 0.82); c.shade(k, 14, 0.92); } for (let k = 0; k < 4; k++) c.shade(3 + k * 3, 5 + k, 0.9); };
DRAW.counter_front = (c) => {
  wood(c, hex('#8a5e36'), hex('#6b4627'), hex('#9d7044'));
  for (let y = 2; y < TEX; y++) { c.set(0, y, hex('#4a3220')); c.set(7, y, hex('#4a3220')); c.set(8, y, hex('#4a3220')); c.set(15, y, hex('#4a3220')); }
  for (let x = 0; x < TEX; x++) { c.set(x, 2, hex('#4a3220')); c.set(x, 15, hex('#4a3220')); }
  box(c, 2, 4, 5, 13, hex('#75502e')); box(c, 10, 4, 13, 13, hex('#75502e'));
  c.set(6, 8, BRASS); c.set(9, 8, BRASS);
};
DRAW.basin = (c) => { c.noise(hex('#7fb2c8'), 4, [hex('#a6cad9'), hex('#6da3ba')], 0.3); for (let k = 3; k < 13; k++) { c.set(k, 3, hex('#e6ecea')); c.set(k, 12, hex('#e6ecea')); c.set(3, k, hex('#e6ecea')); c.set(12, k, hex('#e6ecea')); } c.set(6, 6, hex('#dff0f5')); c.set(7, 5, hex('#dff0f5')); };
DRAW.enamel = (c) => { c.noise(hex('#eef0ec'), 3); for (let x = 0; x < TEX; x++) { c.set(x, 0, hex('#3b6ea5')); c.set(x, 4, hex('#3b6ea5')); } };
function panelDoors(c: Canvas16, top: number, bottom: number): void {
  wood(c, WALNUT, WALNUT_D, WALNUT_L, 4);
  for (let y = 0; y < TEX; y++) { c.set(0, y, WALNUT_D); c.set(15, y, WALNUT_D); c.set(7, y, WALNUT_D); c.set(8, y, hex('#35211a')); }
  box(c, 2, top, 5, bottom, WALNUT_L); box(c, 10, top, 13, bottom, WALNUT_L);
  for (let y = top + 1; y < bottom; y++) { c.shade(3, y, 0.86); c.shade(4, y, 0.86); c.shade(11, y, 0.86); c.shade(12, y, 0.86); }
}
DRAW.wardrobe_lower = (c) => { panelDoors(c, 5, 12); for (const y of [1, 2]) { c.set(6, y, BRASS); c.set(9, y, BRASS); } c.set(6, 1, BRASS_L); for (let x = 0; x < TEX; x++) { c.set(x, 14, WALNUT_D); c.set(x, 15, hex('#35211a')); } };
DRAW.wardrobe_upper = (c) => { panelDoors(c, 4, 13); for (let x = 0; x < TEX; x++) { c.set(x, 0, WALNUT_L); c.set(x, 1, WALNUT_D); c.set(x, 2, WALNUT_L); } c.set(6, 14, BRASS); c.set(9, 14, BRASS); };
DRAW.nightstand_front = (c) => {
  wood(c, WALNUT, WALNUT_D, WALNUT_L, 4);
  box(c, 2, 5, 13, 9, WALNUT_D); box(c, 2, 10, 13, 15, WALNUT_D);
  rect(c, 3, 6, 12, 8, WALNUT_L); rect(c, 3, 11, 12, 14, WALNUT_L);
  for (const y of [7, 12]) { c.set(7, y, BRASS); c.set(8, y, BRASS_L); }
};
DRAW.desk_front = (c) => {
  wood(c, WALNUT, WALNUT_D, WALNUT_L, 4);
  for (const [y0, y1] of [[3, 6], [7, 10], [11, 15]]) { box(c, 1, y0, 14, y1, WALNUT_D); rect(c, 2, y0 + 1, 13, y1 - 1, WALNUT_L); c.set(7, (y0 + y1) >> 1, BRASS); c.set(8, (y0 + y1) >> 1, BRASS_L); }
};
DRAW.lit_shade = (c) => {
  // A parchment shade with the lamp behind it: brightest across the middle, pleated, a darker hem top and bottom.
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) { const glow = 1 - Math.abs(((y + 8) % 8) - 3.5) / 9; const col = x % 3 === 0 ? hex('#e9b25e') : hex('#f7c873'); c.set(x, y, [col[0] * glow, col[1] * glow, col[2] * glow * 0.95]); }
};
DRAW.door_wood = (c) => {
  wood(c, hex('#7a5130'), hex('#5e3c20'), hex('#8f6540'), 5);
  for (const x of [0, 5, 10, 15]) for (let y = 0; y < TEX; y++) c.set(x, y, hex('#4a3220'));
  for (const y of [3, 12]) { for (let x = 0; x < 13; x++) c.set(x, y, hex('#2c2a27')); c.set(2, y - 1, hex('#55524c')); c.set(7, y - 1, hex('#55524c')); c.set(12, y - 1, hex('#55524c')); }
  for (const [x, y] of [[12, 7], [13, 7], [12, 9], [13, 9], [11, 8], [14, 8]]) c.set(x, y, hex('#2c2a27')); // the ring handle
  for (let y = 0; y < TEX; y++) { c.shade(1, y, 1.06); }
};
DRAW.mirror = (c) => {
  wood(c, WALNUT, WALNUT_D, WALNUT_L, 4);
  for (let y = 2; y <= 13; y++) for (let x = 4; x <= 11; x++) { const t = (y - 2) / 11; c.set(x, y, [150 + 60 * t, 178 + 50 * t, 196 + 40 * t]); }
  for (let k = 0; k < 5; k++) { c.set(5 + k, 9 - k, hex('#f4fbff')); c.set(6 + k, 12 - k, hex('#dcebf2')); }
};
DRAW.clock_face = (c) => {
  wood(c, WALNUT, WALNUT_D, WALNUT_L, 4);
  for (let y = 7; y < TEX; y++) for (let x = 4; x < 12; x++) { const d = Math.hypot(x - 7.5, y - 11); if (d < 3.3) c.set(x, y, d > 2.5 ? BRASS : hex('#efe6cc')); }
  c.set(7, 11, hex('#2c2a27')); c.set(7, 10, hex('#2c2a27')); c.set(7, 9, hex('#2c2a27')); c.set(8, 11, hex('#2c2a27')); c.set(9, 12, hex('#2c2a27'));
};
DRAW.book_red = (c) => { c.noise(hex('#8e2b25'), 4); for (let x = 0; x < TEX; x++) { c.set(x, 6, hex('#e8dfc6')); c.set(x, 0, hex('#c9a227')); } };
DRAW.painting = (c) => {
  wood(c, WALNUT, WALNUT_D, WALNUT_L, 4);
  for (let y = 3; y <= 12; y++) for (let x = 2; x <= 13; x++) {
    const sky = y <= 6, cliffL = x <= 4 && y <= 10, cliffR = x >= 11 && y <= 10, far = y === 7 || (y === 6 && x > 5 && x < 10);
    let col = sky ? [236 - (y - 3) * 6, 170 + (y - 3) * 12, 130 + (y - 3) * 22] as RGB : hex('#4f8a3a');
    if (far) col = hex('#b9a888');
    if (cliffL || cliffR) col = (x + y) % 3 ? hex('#a08a68') : hex('#8a7556');
    if (y >= 11) col = (x + y) % 2 ? hex('#3f7a30') : hex('#5a9a42');
    if (x === 7 && y >= 6 && y <= 9) col = hex('#eef6f8'); // the falls
    if (y === 10 && x >= 6 && x <= 9) col = hex('#5aa0c0'); // the pool
    c.set(x, y, col);
  }
  c.set(9, 4, hex('#fff1b8')); c.set(10, 4, hex('#ffd98a'));
};
DRAW.plaster = (c) => { c.noise(hex('#d6ccb4'), 4, [hex('#cbc1a8'), hex('#dfd6c0')], 0.2); for (let k = 0; k < 5; k++) { const x = Math.floor(c.rng() * 12), y = Math.floor(c.rng() * 16); for (let n = 0; n < 4; n++) c.shade(x + n, y, 0.95); } };
DRAW.chain = (c) => { c.clearAlpha(); for (let y = 0; y < TEX; y++) { const k = y % 4; c.set(7, y, k < 2 ? hex('#3a3a3c') : hex('#55524c')); c.set(8, y, k >= 2 ? hex('#3a3a3c') : hex('#6a665e')); } };
DRAW.clay_pot = (c) => { c.noise(hex('#b2633a'), 7, [hex('#9a5230'), hex('#c47446')], 0.25); for (let x = 0; x < TEX; x++) { c.set(x, 4, hex('#7d4226')); c.set(x, 5, hex('#c98356')); c.set(x, 0, hex('#2a1c18')); } };
/** A fitted rug, nine pieces: a patterned field, and a border on the sides its letters name (n, e, s, w). */
function fittedRug(c: Canvas16, sides: string, field: RGB, motif: RGB, band: RGB, line: RGB, edge: RGB): void {
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const d = (Math.abs(((x + 4) % 8) - 4) + Math.abs(((y + 4) % 8) - 4)); // a lattice of small diamonds
    const col = d === 0 ? line : d <= 1 ? motif : field;
    c.set(x, y, (x * 3 + y * 5) % 7 === 0 ? [col[0] * 0.9, col[1] * 0.9, col[2] * 0.9] : col);
  }
  const depth = (x: number, y: number) => Math.min(sides.includes('n') ? y : 99, sides.includes('s') ? 15 - y : 99, sides.includes('w') ? x : 99, sides.includes('e') ? 15 - x : 99);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const k = depth(x, y);
    if (k === 0) c.set(x, y, (x + y) % 2 ? edge : [edge[0] * 0.8, edge[1] * 0.8, edge[2] * 0.8]); // the fringe
    else if (k === 1 || k === 4) c.set(x, y, line);
    else if (k === 2 || k === 3) c.set(x, y, (x + y) % 4 === 0 ? motif : band);
  }
}
for (const k of ['nw', 'n', 'ne', 'w', 'c', 'e', 'sw', 's', 'se']) {
  const sides = k === 'c' ? '' : k;
  DRAW[`rug_red_${k}`] = (c) => fittedRug(c, sides, hex('#8e2b25'), hex('#b5452f'), hex('#2f6f6a'), hex('#e8dcbc'), hex('#d39b3a'));
  DRAW[`rug_blue_${k}`] = (c) => fittedRug(c, sides, hex('#2f4a6a'), hex('#45688f'), hex('#9a3a2c'), hex('#e8dcbc'), hex('#c9a55a'));
}

/** Draws one texture by name; unknown names get a loud magenta check so they are noticed. */
export function drawTexture(name: string): Uint8ClampedArray {
  const c = new Canvas16(name);
  const fn = DRAW[name];
  const crop = name.match(/^crop_(\w+)_(\d)$/);
  const coffee = name.match(/^coffee_bush_(\d)$/);
  if (crop && CROP_LOOK[crop[1]]) cropTexture(c, crop[1], Number(crop[2]));
  else if (coffee) coffeeTexture(c, Number(coffee[1]));
  else if (fn) fn(c);
  else for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) c.set(x, y, (x >> 2) % 2 === (y >> 2) % 2 ? [255, 0, 255] : [0, 0, 0]);
  return c.px;
}

export function hasTexture(name: string): boolean { return name in DRAW || /^crop_\w+_\d$|^coffee_bush_\d$/.test(name); }

/** All textures stacked into one RGBA array, layer after layer, for a texture array. */
export function buildTextureStack(names: string[]): Uint8Array {
  const out = new Uint8Array(names.length * TEX * TEX * 4);
  names.forEach((n, i) => out.set(drawTexture(n), i * TEX * TEX * 4));
  return out;
}

/** Ten stages of cracks for a block being mined, as dark strokes on transparent; stage 9 is nearly broken. */
export function buildCrackStages(): Uint8Array {
  const STAGES = 10;
  const rng = makeRng(4242);
  // Strokes wander out from the middle; each stage draws a few more of them.
  const strokes: [number, number][][] = [];
  for (let s = 0; s < 22; s++) {
    let x = 6 + rng() * 4, y = 6 + rng() * 4;
    const a = rng() * Math.PI * 2;
    const pts: [number, number][] = [];
    for (let k = 0; k < 6 + rng() * 6; k++) {
      pts.push([Math.floor(x), Math.floor(y)]);
      x += Math.cos(a + (rng() - 0.5) * 1.6) * 1.1;
      y += Math.sin(a + (rng() - 0.5) * 1.6) * 1.1;
    }
    strokes.push(pts);
  }
  const out = new Uint8Array(STAGES * TEX * TEX * 4);
  for (let st = 0; st < STAGES; st++) {
    const n = Math.round(((st + 1) / STAGES) * strokes.length);
    for (let s = 0; s < n; s++)
      for (const [x, y] of strokes[s]) {
        if (x < 0 || y < 0 || x > 15 || y > 15) continue;
        const i = (st * TEX * TEX + y * TEX + x) * 4;
        out[i] = 20; out[i + 1] = 18; out[i + 2] = 16; out[i + 3] = 200;
      }
  }
  return out;
}
