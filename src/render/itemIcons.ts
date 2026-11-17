// 16×16 pixel-art icons for items that are not blocks, drawn by code like the block textures.
// Row 0 is the top. Each icon is a few strokes in a small palette.

import { makeRng } from '../core/noise.ts';

const S = 16;
type C = string;

class Icon {
  px = new Uint8ClampedArray(S * S * 4);
  set(x: number, y: number, c: C): void {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = (y * S + x) * 4;
    this.px[i] = parseInt(c.slice(1, 3), 16); this.px[i + 1] = parseInt(c.slice(3, 5), 16); this.px[i + 2] = parseInt(c.slice(5, 7), 16); this.px[i + 3] = 255;
  }
  rect(x0: number, y0: number, w: number, h: number, c: C): void { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c); }
  line(x0: number, y0: number, x1: number, y1: number, c: C, w = 1): void {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let k = 0; k <= n; k++) {
      const x = x0 + ((x1 - x0) * k) / n, y = y0 + ((y1 - y0) * k) / n;
      for (let d = 0; d < w; d++) this.set(x + d, y, c);
    }
  }
  disc(cx: number, cy: number, r: number, c: C): void { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + 0.5) this.set(cx + x, cy + y, c); }
}

const WOOD = '#8a5a32', WOOD_D = '#5e3c20', STEEL = '#c9d0d6', STEEL_D = '#7d8790', IRON = '#a9a29a', STONE = '#9d978a';

/** A tool: a wooden handle from bottom-left, and a head drawn by `head`. */
function tool(i: Icon, head: (i: Icon) => void): void {
  i.line(3, 13, 10, 6, WOOD_D);
  i.line(4, 13, 11, 6, WOOD);
  head(i);
}

const DRAW: Record<string, (i: Icon) => void> = {
  pickaxe: (i) => tool(i, (i) => { i.line(5, 3, 13, 9, STEEL, 2); i.line(6, 2, 14, 8, STEEL_D); }),
  pickaxe_stone: (i) => tool(i, (i) => { i.line(5, 3, 13, 9, STONE, 2); i.line(6, 2, 14, 8, '#6f6a60'); }),
  pickaxe_iron: (i) => tool(i, (i) => { i.line(5, 3, 13, 9, IRON, 2); i.line(6, 2, 14, 8, '#6b655e'); }),
  axe: (i) => tool(i, (i) => { i.rect(9, 2, 4, 5, STEEL); i.line(13, 2, 13, 7, STEEL_D); }),
  shovel: (i) => { i.line(3, 13, 9, 7, WOOD); i.rect(9, 2, 5, 5, STEEL); i.line(9, 7, 13, 3, STEEL_D); },
  hoe: (i) => tool(i, (i) => { i.rect(10, 4, 4, 2, STEEL); i.line(13, 4, 13, 7, STEEL_D); }),
  machete: (i) => { i.rect(2, 12, 4, 2, '#2b2b2b'); i.line(5, 11, 13, 3, STEEL, 2); i.line(6, 12, 14, 4, STEEL_D); },
  knife: (i) => { i.rect(3, 11, 3, 3, '#3b2a1c'); i.line(6, 10, 12, 4, STEEL, 2); },
  hammer: (i) => { i.line(4, 13, 9, 6, WOOD); i.rect(7, 3, 6, 3, STEEL_D); i.rect(8, 3, 4, 2, STEEL); },
  saw: (i) => { i.rect(2, 9, 4, 4, WOOD); i.rect(6, 7, 8, 4, STEEL); for (let x = 6; x < 14; x += 2) i.set(x, 11, STEEL_D); },
  shears: (i) => { i.line(4, 12, 11, 4, STEEL); i.line(11, 12, 4, 4, STEEL); i.disc(4, 12, 1, '#c0392b'); i.disc(11, 12, 1, '#c0392b'); },
  rod: (i) => { i.line(2, 14, 12, 2, WOOD); i.line(12, 2, 13, 10, '#dddddd'); i.disc(13, 11, 1, '#e74c3c'); },
  spear: (i) => { i.line(2, 14, 11, 5, WOOD); i.line(11, 5, 14, 2, '#3a3a3a', 2); },
  rifle: (i) => { i.rect(1, 9, 5, 3, '#6b4423'); i.rect(5, 8, 10, 2, '#3c3c3c'); i.rect(7, 6, 5, 1, '#1f1f1f'); i.rect(8, 5, 3, 1, '#4a4a4a'); i.set(6, 10, '#3c3c3c'); },
  rounds: (i) => { for (const x of [3, 7, 11]) { i.rect(x, 6, 3, 7, '#c9a227'); i.rect(x, 4, 3, 2, '#b06b3a'); } },
  bow: (i) => { for (let y = 1; y < 15; y++) i.set(4 + Math.round(4 * Math.sin((y / 14) * Math.PI)), y, '#2d2d2d'); i.line(4, 1, 4, 14, '#e8e8e8'); i.rect(7, 7, 2, 2, '#4a6b3a'); },
  arrow: (i) => { i.line(2, 14, 13, 3, WOOD); i.line(12, 2, 14, 4, STEEL_D, 2); i.set(2, 12, '#e9e9e9'); i.set(4, 14, '#e9e9e9'); },
  vest: (i) => { i.rect(3, 4, 3, 10, '#4b5320'); i.rect(10, 4, 3, 10, '#4b5320'); i.rect(6, 7, 4, 7, '#4b5320'); i.rect(4, 9, 8, 2, '#3a4119'); },
  can: (i) => { i.rect(4, 3, 8, 11, '#b8bec4'); i.rect(4, 6, 8, 5, '#c0392b'); i.rect(4, 3, 8, 1, '#8d949a'); },
  rice: (i) => { i.rect(3, 8, 10, 5, '#d8d2c4'); i.disc(8, 8, 4, '#f4f1e8'); i.rect(3, 12, 10, 1, '#a99f8c'); },
  beans_bowl: (i) => { i.rect(3, 8, 10, 5, '#d8d2c4'); i.disc(8, 8, 4, '#2d1f2a'); i.set(6, 7, '#5a3a4a'); i.set(9, 8, '#5a3a4a'); },
  honey: (i) => { i.rect(4, 5, 8, 9, '#e0a526'); i.rect(4, 3, 8, 2, '#b58a52'); i.rect(5, 7, 2, 4, '#f4cf6a'); },
  coffee: (i) => { i.rect(3, 6, 8, 8, '#f2f2f2'); i.rect(4, 6, 6, 2, '#4a2c1a'); i.line(11, 8, 13, 9, '#f2f2f2'); i.line(13, 9, 11, 11, '#f2f2f2'); i.line(5, 2, 6, 4, '#cccccc'); i.line(8, 2, 7, 4, '#cccccc'); },
  coffee_beans: (i) => { for (const [x, y] of [[5, 5], [10, 6], [6, 10], [11, 11]]) { i.disc(x, y, 2, '#5a3519'); i.line(x - 1, y, x + 1, y, '#2e1a0c'); } },
  salt: (i) => { i.rect(4, 4, 8, 10, '#e8e8e8'); i.rect(4, 4, 8, 2, '#3b6ea5'); },
  jug: (i) => { i.rect(4, 5, 8, 9, '#7fb2c8'); i.rect(6, 2, 4, 3, '#d0d6da'); i.rect(4, 5, 8, 2, '#a6cad9'); },
  jug_empty: (i) => { i.rect(4, 5, 8, 9, '#d0d6da'); i.rect(6, 2, 4, 3, '#d0d6da'); i.rect(5, 6, 6, 7, '#eef1f3'); },
  corn: (i) => { i.rect(6, 3, 4, 10, '#f2c94c'); for (let y = 3; y < 13; y += 2) i.line(6, y, 9, y, '#d4a62a'); i.line(4, 13, 7, 6, '#5e9b3c'); i.line(11, 13, 9, 6, '#5e9b3c'); },
  bean_pod: (i) => { i.line(3, 12, 12, 3, '#4f8f2f', 2); for (const k of [0, 3, 6]) i.disc(5 + k, 10 - k, 1, '#6aa843'); },
  squash: (i) => { i.disc(8, 9, 5, '#e67e22'); i.line(4, 9, 12, 9, '#c96a14'); i.rect(7, 2, 2, 3, '#4f8f2f'); },
  tomato: (i) => { i.disc(8, 9, 5, '#d63031'); i.disc(6, 7, 1, '#ff7675'); i.rect(7, 3, 2, 2, '#2d8a34'); },
  pepper: (i) => { i.line(6, 4, 10, 13, '#e55039', 3); i.rect(6, 2, 3, 2, '#2d8a34'); },
  potato: (i) => { i.disc(8, 9, 5, '#b9874f'); i.set(6, 8, '#7a5530'); i.set(10, 10, '#7a5530'); i.set(8, 12, '#7a5530'); },
  herbs: (i) => { i.line(8, 14, 8, 6, '#3f7a2c'); for (const [x, y] of [[5, 5], [11, 6], [6, 9], [10, 10], [8, 3]]) i.disc(x, y, 1, '#5daa42'); },
  banana: (i) => { for (let k = 0; k < 10; k++) i.set(4 + k, 4 + Math.round(6 * Math.sin((k / 9) * Math.PI)), '#f9ca24'); for (let k = 0; k < 10; k++) i.set(4 + k, 5 + Math.round(6 * Math.sin((k / 9) * Math.PI)), '#f0b510'); },
  avocado: (i) => { i.disc(8, 9, 5, '#2f5d24'); i.disc(8, 9, 3, '#b8d36b'); i.disc(8, 10, 1, '#7a4b2a'); },
  papaya: (i) => { i.disc(8, 9, 5, '#f39c12'); i.disc(8, 9, 2, '#e17055'); for (const [x, y] of [[7, 9], [9, 8], [8, 10]]) i.set(x, y, '#2d1f1f'); },
  trout: (i) => { i.disc(7, 8, 3, '#8fa9a1'); i.line(4, 8, 11, 8, '#d98c8c'); i.line(11, 8, 14, 5, '#7c958e'); i.line(11, 8, 14, 11, '#7c958e'); i.set(5, 7, '#1d1d1d'); },
  trout_cooked: (i) => { i.disc(7, 8, 3, '#b07d4f'); i.line(4, 8, 11, 8, '#8a5a32'); i.line(11, 8, 14, 5, '#9a6a3f'); i.line(11, 8, 14, 11, '#9a6a3f'); },
  stew: (i) => { i.rect(3, 8, 10, 5, '#8a5a32'); i.disc(8, 8, 4, '#c96a2b'); i.set(6, 7, '#f2c94c'); i.set(9, 8, '#5e9b3c'); i.set(7, 9, '#d63031'); },
  seeds: (i) => { const r = makeRng(7); for (let k = 0; k < 7; k++) i.disc(3 + Math.floor(r() * 10), 4 + Math.floor(r() * 9), 0, '#c8a96a'); i.rect(4, 10, 8, 4, '#d9c39a'); },
  medkit: (i) => { i.rect(2, 4, 12, 10, '#f2f2f2'); i.rect(7, 6, 2, 6, '#d63031'); i.rect(5, 8, 6, 2, '#d63031'); i.rect(6, 2, 4, 2, '#7d8790'); },
  bandage: (i) => { i.disc(8, 8, 5, '#f2ece0'); i.disc(8, 8, 2, '#d8cfbe'); },
  poultice: (i) => { i.disc(8, 9, 5, '#6b8f3a'); i.disc(7, 8, 2, '#8db55a'); },
  ingot: (i) => { i.rect(3, 7, 10, 5, IRON); i.rect(4, 6, 8, 1, '#c9c3bb'); i.rect(3, 11, 10, 1, '#7d776f'); },
  flint: (i) => { i.disc(8, 8, 5, '#3b3a40'); i.disc(6, 6, 1, '#8b8a95'); },
  coal: (i) => { i.disc(8, 9, 5, '#1f1e1e'); i.disc(6, 7, 1, '#4a4848'); },
  charcoal: (i) => { i.rect(4, 5, 8, 8, '#2a2522'); i.line(4, 8, 11, 8, '#4a403a'); },
  stick: (i) => i.line(4, 13, 12, 3, WOOD, 2),
  fiber: (i) => { for (const x of [4, 6, 8, 10, 12]) i.line(x, 13, x + 1, 3, '#9bb35a'); },
  cordage: (i) => { for (let y = 3; y < 14; y++) i.set(8 + Math.round(2 * Math.sin(y)), y, '#c8a96a'); for (let y = 3; y < 14; y++) i.set(7 + Math.round(2 * Math.sin(y + 2)), y, '#a88a4a'); },
  nails: (i) => { for (const x of [4, 8, 12]) { i.line(x, 4, x, 13, STEEL_D); i.rect(x - 1, 3, 3, 1, STEEL); } },
  copper: (i) => { i.disc(8, 9, 4, '#c06c3a'); i.disc(7, 8, 1, '#e8a06a'); },
  filter: (i) => { i.rect(5, 2, 6, 12, '#3b6ea5'); i.rect(5, 5, 6, 5, '#e8e8e8'); i.rect(7, 13, 2, 2, '#7d8790'); },
  binoculars: (i) => { i.rect(2, 5, 5, 8, '#2d2d2d'); i.rect(9, 5, 5, 8, '#2d2d2d'); i.rect(6, 7, 4, 2, '#444444'); i.rect(3, 11, 3, 2, '#5a8db0'); i.rect(10, 11, 3, 2, '#5a8db0'); },
  headlamp: (i) => { i.line(1, 9, 15, 9, '#2d2d2d', 1); i.rect(5, 6, 6, 5, '#3c3c3c'); i.disc(8, 8, 1, '#fff3c8'); },
  backpack: (i) => { i.rect(3, 3, 10, 11, '#6d5a3a'); i.rect(5, 8, 6, 4, '#5a4a2e'); i.rect(6, 1, 4, 2, '#4a3c24'); },
  wallet: (i) => { i.rect(4, 2, 8, 12, '#1f1f1f'); i.rect(5, 3, 6, 5, '#5a8db0'); i.rect(6, 10, 2, 2, '#f7931a'); i.rect(9, 10, 2, 2, '#7d8790'); },
  journal: (i) => { i.rect(3, 2, 10, 12, '#6b3e26'); i.rect(4, 3, 8, 10, '#7d4a2e'); i.rect(12, 2, 1, 12, '#e8dcc0'); i.line(5, 6, 10, 6, '#c9a227'); },
};

export function hasIcon(name: string): boolean { return name in DRAW; }

/** The icon's RGBA pixels; an unknown icon is a magenta check, so it is noticed. */
export function drawItemIcon(name: string): Uint8ClampedArray {
  const i = new Icon();
  const fn = DRAW[name];
  if (fn) fn(i);
  else for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) i.set(x, y, (x >> 2) % 2 === (y >> 2) % 2 ? '#ff00ff' : '#000000');
  return i.px;
}
