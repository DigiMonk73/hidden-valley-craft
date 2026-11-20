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
  hide: (i) => { i.rect(3, 4, 10, 9, '#a07a52'); i.rect(2, 3, 2, 2, '#a07a52'); i.rect(12, 3, 2, 2, '#a07a52'); i.rect(2, 12, 2, 2, '#a07a52'); i.rect(12, 12, 2, 2, '#a07a52'); i.rect(5, 6, 6, 5, '#b98f63'); },
  pelt: (i) => { i.rect(3, 4, 10, 9, '#c49a5c'); i.rect(2, 3, 2, 2, '#c49a5c'); i.rect(12, 3, 2, 2, '#c49a5c'); i.rect(2, 12, 2, 2, '#c49a5c'); i.rect(12, 12, 2, 2, '#c49a5c'); i.rect(6, 1, 4, 3, '#b0884c'); i.rect(5, 6, 6, 5, '#d8b37a'); },
  leather: (i) => { i.rect(3, 4, 10, 9, '#7a4a26'); i.rect(4, 5, 8, 2, '#8f5a30'); i.line(3, 12, 12, 12, '#5a3418'); i.line(5, 9, 10, 9, '#6a3d1f'); },
  bone: (i) => { i.line(4, 12, 11, 5, '#ece6d6', 2); i.disc(4, 12, 1, '#ece6d6'); i.disc(3, 11, 1, '#ece6d6'); i.disc(12, 4, 1, '#ece6d6'); i.disc(13, 5, 1, '#ece6d6'); i.line(5, 12, 12, 5, '#c8c0aa'); },
  arrowhead: (i) => { i.line(8, 2, 3, 11, STEEL, 1); i.line(8, 2, 13, 11, STEEL, 1); i.line(3, 11, 13, 11, STEEL_D); i.rect(6, 6, 5, 5, STEEL); i.rect(7, 11, 3, 3, WOOD_D); },
  leather_armor: (i) => { i.rect(3, 4, 3, 10, '#7a4a26'); i.rect(10, 4, 3, 10, '#7a4a26'); i.rect(6, 7, 4, 7, '#7a4a26'); i.rect(4, 9, 8, 2, '#5a3418'); i.set(7, 11, '#c9a227'); i.set(8, 13, '#c9a227'); },
  rabbit: (i) => { i.disc(8, 10, 4, '#9c8c78'); i.disc(4, 8, 2, '#9c8c78'); i.rect(3, 2, 1, 5, '#8a7a66'); i.rect(5, 2, 1, 5, '#8a7a66'); i.set(3, 8, '#1d1d1d'); i.disc(12, 9, 1, '#efe9df'); i.rect(6, 13, 2, 1, '#8a7a66'); i.rect(10, 13, 2, 1, '#8a7a66'); },
  meat_small: (i) => { i.disc(7, 9, 4, '#c45a5a'); i.disc(7, 9, 2, '#d97a7a'); i.line(10, 7, 14, 3, '#ece6d6', 1); },
  meat_small_cooked: (i) => { i.disc(7, 9, 4, '#9a5a2e'); i.disc(7, 9, 2, '#b8743e'); i.line(10, 7, 14, 3, '#ece6d6', 1); },
  steak: (i) => { i.disc(8, 8, 5, '#9e2b2b'); i.disc(7, 7, 2, '#b84444'); i.disc(10, 10, 1, '#efe1d0'); },
  steak_cooked: (i) => { i.disc(8, 8, 5, '#6e3a1e'); i.disc(7, 7, 2, '#8a4d28'); for (const y of [5, 8, 11]) i.line(4, y, 12, y - 2, '#3e2010'); },
  pork: (i) => { i.disc(8, 8, 5, '#e09a9a'); i.disc(8, 8, 3, '#eeb8b8'); i.line(3, 8, 13, 8, '#f6e6e0'); },
  pork_cooked: (i) => { i.disc(8, 8, 5, '#b8743e'); i.disc(8, 8, 3, '#cf8d52'); i.line(3, 8, 13, 8, '#e8c89a'); },
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
  // Zone-1's near band (docs/PHASE4.md).
  pistol: (i) => { i.rect(3, 5, 10, 3, '#2f3133'); i.rect(4, 4, 8, 1, '#4a4d50'); i.rect(4, 8, 3, 6, '#3a2c22'); i.rect(5, 9, 1, 4, '#4f3c2c'); i.set(8, 9, '#2f3133'); i.set(9, 9, '#2f3133'); i.set(12, 4, '#1c1d1e'); },
  rounds_pistol: (i) => { for (const x of [3, 7, 11]) { i.rect(x, 7, 3, 6, '#c9a227'); i.rect(x, 5, 3, 2, '#9a9fa4'); } },
  map_scrap: (i) => { i.rect(2, 3, 12, 10, '#e6dab8'); i.line(2, 3, 5, 5, '#c8b98f'); i.line(3, 11, 9, 6, '#7a6a4a'); i.line(9, 6, 13, 7, '#7a6a4a'); i.line(4, 5, 9, 4, '#4a6a3a'); i.line(10, 10, 12, 9, '#a3241c'); i.set(12, 8, '#a3241c'); i.set(11, 8, '#a3241c'); },
  armband: (i) => { i.rect(2, 6, 12, 5, '#a3241c'); i.rect(2, 6, 12, 1, '#7d1a14'); i.disc(8, 8, 1, '#e9e2d0'); i.set(8, 8, '#a3241c'); i.set(7, 7, '#a3241c'); },
  wire_mesh: (i) => { for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) if ((x + y) % 3 === 0 || (x - y + 30) % 3 === 0) i.set(x, y, '#9aa3a8'); },
  canvas: (i) => { i.rect(2, 4, 12, 9, '#c9b98a'); i.rect(2, 4, 12, 2, '#b3a275'); for (let x = 3; x < 14; x += 3) i.line(x, 6, x, 12, '#b8a87a'); },
  scrap: (i) => { i.rect(3, 7, 7, 5, '#8a4a2a'); i.rect(6, 4, 7, 4, '#7d8288'); i.line(4, 12, 12, 10, '#5a4a3e'); i.set(8, 8, '#b8703c'); },
  wire: (i) => { for (let k = 0; k < 3; k++) for (let a = 0; a < 20; a++) { const t = (a / 20) * Math.PI * 2; i.set(8 + Math.cos(t) * (5 - k), 8 + Math.sin(t) * (4 - k), '#9a958e'); } },
  chicken: (i) => { i.disc(8, 10, 4, '#d9b17a'); i.disc(5, 6, 2, '#d9b17a'); i.set(3, 6, '#e0a526'); i.set(5, 5, '#1d1d1d'); i.rect(5, 3, 2, 1, '#c0392b'); i.rect(11, 7, 2, 3, '#a87a46'); i.rect(7, 14, 1, 1, '#e0a526'); i.rect(9, 14, 1, 1, '#e0a526'); },
  egg: (i) => { i.disc(8, 9, 4, '#efe2c4'); i.disc(8, 6, 3, '#efe2c4'); i.disc(7, 7, 1, '#fbf4e2'); },
  egg_cooked: (i) => { i.disc(8, 8, 6, '#f6f1e6'); i.disc(8, 8, 2, '#f2b81c'); i.disc(7, 7, 0, '#f8d45a'); },
  feather: (i) => { i.line(4, 13, 12, 3, '#8a6a3a'); for (let k = 0; k < 8; k++) { i.line(5 + k, 11 - k, 3 + k, 8 - k, '#d9c9a8'); i.line(5 + k, 11 - k, 8 + k, 12 - k, '#c9b58e'); } },
  poultry: (i) => { i.disc(7, 9, 4, '#e8b4a0'); i.disc(7, 9, 2, '#f2c8b6'); i.line(10, 7, 14, 3, '#ece6d6', 1); i.disc(14, 3, 1, '#ece6d6'); },
  poultry_cooked: (i) => { i.disc(7, 9, 4, '#b8743e'); i.disc(7, 9, 2, '#d08c4e'); i.line(10, 7, 14, 3, '#ece6d6', 1); i.disc(14, 3, 1, '#ece6d6'); },
  // Zone-1's mid and deep bands, and M2 (docs/PHASE5.md).
  rifle_worn: (i) => { i.rect(1, 9, 5, 3, '#5a4632'); i.rect(5, 8, 10, 2, '#4a4642'); i.set(9, 8, '#7a3a24'); i.set(12, 9, '#7a3a24'); i.rect(6, 10, 1, 2, '#3a3632'); },
  bowstring: (i) => { for (let a = 0; a < 28; a++) { const t = (a / 28) * Math.PI * 2; i.set(8 + Math.cos(t) * 5, 8 + Math.sin(t) * 3, '#e8e2cc'); } i.rect(3, 7, 2, 2, '#c8b98f'); i.rect(11, 7, 2, 2, '#c8b98f'); },
  forge_parts: (i) => { i.rect(2, 8, 6, 5, '#a8483a'); i.rect(2, 8, 6, 1, '#c86a4a'); i.disc(11, 7, 3, '#5d5f62'); i.disc(11, 7, 1, '#2a2a2a'); i.rect(9, 11, 5, 3, '#7d8790'); i.line(13, 4, 15, 2, '#5e3c20'); },
  bow_wood: (i) => { for (let y = 2; y < 15; y++) i.set(5 + Math.round(4 * Math.sin(((y - 2) / 12) * Math.PI)), y, '#8a5a32'); i.line(5, 2, 5, 14, '#e8e2cc'); i.rect(8, 7, 2, 3, '#3a2a1c'); },
  jaguar_pelt: (i) => { i.rect(2, 4, 12, 9, '#c9973c'); for (const [x, y] of [[4, 6], [8, 5], [11, 7], [5, 10], [9, 10], [12, 11]]) { i.disc(x, y, 1, '#3a2a18'); i.set(x, y, '#a8782a'); } },
  smoked_meat: (i) => { i.disc(8, 9, 5, '#6a3a24'); i.disc(8, 9, 3, '#8a4a2e'); i.line(4, 12, 12, 6, '#4a2414'); },
  jerky: (i) => { for (const x of [3, 7, 11]) { i.line(x, 13, x + 2, 3, '#6e3a22', 2); i.set(x + 1, 8, '#9a5a34'); } },
  quinoa: (i) => { for (let k = 0; k < 18; k++) i.disc(4 + ((k * 5) % 9), 5 + ((k * 7) % 8), 0, k % 3 ? '#e2c48a' : '#c9a86a'); },
  slip: (i) => { i.line(3, 13, 12, 4, '#6e4a2a', 1); i.line(9, 7, 12, 6, '#5e9b3c'); i.disc(12, 4, 1, '#76b24c'); i.rect(3, 12, 3, 2, '#c8a96a'); },
  apple: (i) => { i.disc(8, 9, 5, '#b8322a'); i.disc(6, 7, 1, '#e86a5a'); i.line(8, 4, 9, 2, '#5e3c20'); i.rect(9, 2, 3, 1, '#5e9b3c'); },
  journal: (i) => { i.rect(3, 2, 10, 12, '#6b3e26'); i.rect(4, 3, 8, 10, '#7d4a2e'); i.rect(12, 2, 1, 12, '#e8dcc0'); i.line(5, 6, 10, 6, '#c9a227'); },
  // Zone-2's salvage, power and ammunition (docs/PHASE6.md).
  pv_panel: (i) => { i.rect(2, 3, 12, 10, '#1d3354'); for (const x of [2, 6, 10, 13]) i.line(x, 3, x, 12, '#b9c2c9'); for (const y of [3, 8, 12]) i.line(2, y, 13, y, '#b9c2c9'); i.line(3, 4, 5, 6, '#6f8fb8'); },
  wiring: (i) => { for (let k = 0; k < 3; k++) for (let a = 0; a < 24; a++) { const t = (a / 24) * Math.PI * 2; i.set(8 + Math.cos(t) * (5 - k), 8 + Math.sin(t) * (5 - k), k === 1 ? '#e08a4e' : '#c06c3a'); } i.line(12, 11, 15, 14, '#2b2b2b'); },
  pipe_fittings: (i) => { i.rect(2, 6, 8, 3, '#b8683a'); i.rect(8, 6, 3, 8, '#b8683a'); i.rect(1, 5, 2, 5, '#9a5a30'); i.rect(7, 12, 5, 2, '#9a5a30'); i.line(3, 6, 9, 6, '#e08a4e'); },
  scrap_lead: (i) => { i.rect(3, 8, 10, 5, '#5e646a'); i.rect(4, 7, 8, 1, '#7d848a'); i.line(4, 12, 11, 9, '#41464b'); i.set(10, 8, '#9aa0a6'); },
  battery_cell: (i) => { i.rect(5, 3, 6, 11, '#2b6a3a'); i.rect(5, 3, 6, 2, '#c9d0d6'); i.rect(7, 2, 2, 1, '#c9d0d6'); i.rect(6, 8, 4, 1, '#e0e0e0'); i.rect(7, 7, 2, 3, '#e0e0e0'); },
  gpu: (i) => { i.rect(1, 4, 14, 8, '#2c2e33'); i.disc(5, 8, 2, '#55595e'); i.disc(11, 8, 2, '#55595e'); i.set(5, 8, '#16181a'); i.set(11, 8, '#16181a'); i.rect(2, 12, 10, 1, '#c9a227'); i.set(14, 5, '#39ff6a'); },
  psu: (i) => { i.rect(2, 3, 12, 10, '#3a3d42'); i.disc(8, 8, 3, '#55595e'); for (let k = -3; k <= 3; k += 2) i.line(5, 8 + k, 11, 8 + k, '#2a2c2f'); i.rect(12, 4, 2, 2, '#1d1d1d'); i.line(13, 13, 15, 15, '#d63031'); },
  mining_board: (i) => { i.rect(2, 2, 12, 12, '#1f6b3a'); for (const [x, y] of [[4, 4], [9, 4], [4, 9], [9, 9]]) i.rect(x, y, 3, 3, '#1d1d1d'); i.line(2, 8, 13, 8, '#c9a227'); i.line(8, 2, 8, 13, '#c9a227'); },
  fridge_unit: (i) => { i.disc(6, 10, 3, '#2b2b2b'); i.disc(6, 10, 1, '#55595e'); for (let y = 2; y < 13; y += 2) i.line(10, y, 14, y, '#b8683a'); i.line(10, 2, 10, 12, '#9a5a30'); i.line(14, 2, 14, 12, '#9a5a30'); },
  pump_unit: (i) => { i.rect(2, 5, 7, 7, '#2d6a9a'); i.disc(11, 9, 3, '#5e646a'); i.disc(11, 9, 1, '#2b2b2b'); i.rect(10, 3, 2, 3, '#b8683a'); i.rect(13, 8, 3, 2, '#b8683a'); },
  brass_casing: (i) => { for (const x of [3, 7, 11]) { i.rect(x, 5, 3, 8, '#c9a227'); i.set(x + 1, 5, '#3a2a10'); i.rect(x, 12, 3, 1, '#9a7a1a'); } },
  primer: (i) => { for (const [x, y] of [[4, 5], [10, 5], [7, 10], [12, 11], [3, 11]]) { i.disc(x, y, 1, '#c9a227'); i.set(x, y, '#b8703c'); } },
  saltpeter: (i) => { i.disc(8, 10, 5, '#ecebe4'); i.disc(6, 8, 2, '#ffffff'); i.disc(10, 11, 1, '#d8d6cc'); i.set(9, 6, '#ffffff'); },
  sulfur: (i) => { i.disc(8, 10, 5, '#e8d23a'); i.disc(6, 8, 2, '#f2e66a'); i.disc(10, 11, 1, '#c8b22a'); i.set(9, 6, '#fff69a'); },
  gunpowder: (i) => { i.disc(8, 11, 5, '#2f2f30'); i.disc(7, 9, 2, '#454547'); for (const [x, y] of [[5, 12], [10, 10], [8, 13], [11, 12]]) i.set(x, y, '#68686b'); },
  bullet_mold: (i) => { i.line(2, 14, 7, 9, WOOD, 2); i.line(4, 15, 9, 10, WOOD_D, 1); i.rect(8, 3, 6, 7, IRON); i.line(11, 3, 11, 9, '#6b655e'); i.disc(11, 6, 1, '#3a3632'); },
  bullet: (i) => { for (const x of [4, 9]) { i.rect(x, 7, 3, 6, '#7d848a'); i.disc(x + 1, 6, 1, '#7d848a'); i.set(x + 1, 5, '#9aa0a6'); } },
  cold_water: (i) => { i.rect(4, 5, 8, 9, '#a8d8ec'); i.rect(6, 2, 4, 3, '#d0d6da'); i.rect(4, 5, 8, 2, '#d4eef8'); i.set(5, 9, '#ffffff'); i.set(10, 11, '#ffffff'); i.set(7, 12, '#ffffff'); },
  // Zone-3 and M4 (docs/PHASE7.md).
  steel_stock: (i) => { i.rect(2, 9, 12, 3, '#6f7c88'); i.rect(2, 9, 12, 1, '#c2cad2'); i.rect(4, 5, 9, 2, '#8f9aa4'); i.rect(4, 4, 9, 1, '#d8dee4'); i.rect(6, 7, 2, 2, '#4a525a'); },
  steel_ingot: (i) => { i.rect(3, 7, 10, 5, '#8f9aa4'); i.rect(4, 6, 8, 1, '#d8dee4'); i.rect(3, 11, 10, 1, '#4a525a'); i.set(5, 8, '#e8eef2'); },
  turbine_runner: (i) => { i.disc(8, 8, 6, '#7d8790'); i.disc(8, 8, 2, '#c9d0d6'); for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; i.line(8 + Math.cos(a) * 2, 8 + Math.sin(a) * 2, 8 + Math.cos(a + 0.7) * 6, 8 + Math.sin(a + 0.7) * 6, '#d8dee4'); } },
  sluice_tools: (i) => { i.disc(6, 6, 4, '#7d8790'); i.disc(6, 6, 2, '#2d2d2d'); i.line(6, 6, 13, 13, '#c9d0d6', 2); i.rect(11, 3, 2, 5, '#c9a227'); i.set(12, 2, '#c9a227'); },
  lathe_parts: (i) => { i.rect(2, 6, 6, 6, '#3e6a52'); i.disc(10, 9, 3, '#c9d0d6'); i.disc(10, 9, 1, '#4a525a'); i.line(2, 13, 14, 13, '#9aa0a6'); for (let x = 3; x < 14; x += 2) i.set(x, 14, '#6a6e72'); },
  crucible: (i) => { i.rect(4, 5, 8, 9, '#34322f'); i.rect(3, 4, 10, 2, '#4a4640'); i.rect(5, 5, 6, 1, '#ff8a2e'); i.set(12, 4, '#4a4640'); i.set(13, 3, '#4a4640'); },
  plans: (i) => { i.rect(2, 3, 12, 10, '#e6dab8'); i.line(4, 10, 7, 6, '#4a5a8a'); i.line(7, 6, 11, 10, '#4a5a8a'); i.disc(7, 6, 1, '#4a5a8a'); for (let x = 4; x < 12; x += 2) i.set(x, 11, '#8a7a5a'); },
  plans_blue: (i) => { i.rect(2, 3, 12, 10, '#2c5a9c'); i.line(4, 11, 8, 5, '#eef2f5'); i.line(8, 5, 12, 11, '#eef2f5'); for (let a = 0; a < 7; a++) i.set(8 + Math.round(4 * Math.cos(Math.PI + (a / 6) * Math.PI)), 5 + Math.round(2 * Math.sin(Math.PI + (a / 6) * Math.PI)), '#eef2f5'); },
  pistol_suppressed: (i) => { i.rect(2, 5, 7, 3, '#2f3133'); i.rect(9, 5, 6, 3, '#111111'); i.rect(9, 5, 6, 1, '#3a3a3a'); i.rect(3, 8, 3, 5, '#3b2a1c'); i.set(7, 9, '#2f3133'); },
  rifle_rebuilt: (i) => { i.rect(1, 9, 5, 3, '#4a3020'); i.rect(5, 8, 10, 2, '#c9d0d6'); i.rect(5, 9, 10, 1, '#7d8790'); i.rect(6, 5, 6, 2, '#1f1f1f'); i.set(6, 6, '#6fb6e0'); i.set(6, 10, '#3c3c3c'); },
  plate_armor: (i) => { i.rect(3, 4, 3, 10, '#4b5320'); i.rect(10, 4, 3, 10, '#4b5320'); i.rect(5, 6, 6, 8, '#8f9aa4'); i.rect(5, 6, 6, 1, '#d8dee4'); i.line(8, 7, 8, 13, '#4a525a'); },
  // Zone-4 and M5 (docs/PHASE8.md).
  hazard_suit: (i) => { i.rect(4, 5, 8, 9, '#e8a01c'); i.rect(2, 6, 2, 6, '#e8a01c'); i.rect(12, 6, 2, 6, '#e8a01c'); i.rect(5, 1, 6, 5, '#e8a01c'); i.rect(6, 2, 4, 3, '#2a3a4a'); i.set(7, 3, '#9fc4e8'); i.rect(7, 8, 2, 2, '#f2c81c'); i.line(8, 6, 8, 13, '#b87a10'); },
  rad_tablets: (i) => { i.rect(3, 4, 10, 9, '#f2f5f2'); i.rect(3, 4, 10, 2, '#2c5a9c'); for (const [x, y] of [[5, 8], [8, 8], [11, 8], [5, 11], [8, 11], [11, 11]]) i.disc(x, y, 1, '#3a7ad0'); },
  antenna_section: (i) => { i.line(2, 12, 8, 3, '#eceee9', 2); i.line(8, 3, 14, 12, '#eceee9', 2); i.line(3, 12, 13, 12, '#c9ccc8'); i.line(5, 9, 11, 9, '#c9ccc8'); i.line(8, 4, 8, 12, '#9aa0a6'); },
  rare_components: (i) => { i.rect(2, 8, 12, 5, '#2e6a3e'); i.rect(4, 5, 4, 4, '#1c2024'); i.rect(10, 6, 3, 3, '#c9a227'); i.disc(5, 11, 1, '#c9d0d6'); for (let x = 3; x < 13; x += 2) i.set(x, 13, '#c9a227'); i.set(11, 7, '#fff6c8'); },
  telescope_optics: (i) => { i.disc(8, 8, 6, '#7d8790'); i.disc(8, 8, 5, '#1c2a3c'); i.disc(7, 7, 2, '#5a8ac0'); i.set(6, 6, '#e8f4ff'); i.set(5, 7, '#9fc4e8'); },
  sat_modem: (i) => { i.rect(2, 7, 12, 6, '#3a3f44'); i.rect(2, 7, 12, 1, '#6a7178'); i.line(11, 7, 13, 2, '#c9d0d6'); for (const x of [4, 6, 8]) i.set(x, 10, '#3ee05a'); i.rect(10, 10, 2, 1, '#c9a227'); },
  sat_antenna: (i) => { i.disc(7, 7, 5, '#eceee9'); i.disc(8, 8, 4, '#c9ccc8'); i.line(8, 8, 12, 4, '#6a7178'); i.disc(12, 4, 1, '#3a3f44'); i.line(7, 12, 7, 15, '#7d8790', 2); },
  uplink_terminal: (i) => { i.rect(2, 3, 12, 8, '#23272c'); i.rect(3, 4, 10, 6, '#0e2a1a'); for (const y of [5, 7]) i.line(4, y, 10, y, '#3ee05a'); i.set(4, 9, '#3ee05a'); i.rect(4, 12, 8, 2, '#3a3f44'); i.line(13, 3, 14, 1, '#c9d0d6'); },
  spirit: (i) => { i.rect(5, 6, 6, 8, '#d8eef4'); i.rect(7, 2, 2, 4, '#d8eef4'); i.rect(7, 1, 2, 1, '#8a5a32'); i.rect(5, 9, 6, 5, '#f4f8fa'); i.set(6, 7, '#ffffff'); },
  antibiotics: (i) => { i.rect(4, 3, 8, 11, '#e8a01c'); i.rect(4, 3, 8, 2, '#f2f5f2'); i.rect(5, 7, 6, 4, '#f2f5f2'); i.line(8, 8, 8, 9, '#c0281c'); i.line(7, 8, 9, 8, '#c0281c'); },
  adrenaline: (i) => { i.line(3, 13, 11, 5, '#c9d0d6', 2); i.line(11, 5, 14, 2, '#7d8790'); i.rect(5, 9, 3, 3, '#e83a2e'); i.line(2, 14, 4, 12, '#3a3f44', 2); },
  thermal_optic: (i) => { i.rect(2, 6, 10, 5, '#23272c'); i.disc(12, 8, 3, '#3a3f44'); i.disc(12, 8, 2, '#ff8a2e'); i.set(12, 8, '#ffe08a'); i.rect(4, 11, 3, 2, '#3a3f44'); i.set(3, 7, '#3ee05a'); },
  engineer_armor: (i) => { i.rect(3, 4, 3, 10, '#3a4a5a'); i.rect(10, 4, 3, 10, '#3a4a5a'); i.rect(5, 5, 6, 9, '#6f7c88'); i.rect(5, 5, 6, 1, '#d8dee4'); i.rect(6, 8, 4, 3, '#e8a01c'); i.line(8, 6, 8, 13, '#2a3440'); },
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
