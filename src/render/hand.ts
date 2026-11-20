// The player's own arm, and what the hand holds, drawn in front of everything (docs/PHASE9A.md, 1): a pickaxe
// that swings as it mines, a rifle that comes up to the eye in focus, a bow that bends as it is drawn, a block
// on the palm. Every shape is this game's own drawing: small models built from boxes for tools and weapons,
// the block itself for a block, and for the rest the pack icon lying flat on the open palm.
//
// Cheap by design: two draw calls (the arm, the thing held), a few thousand triangles, no texture, no pass of
// its own beyond a depth clear. The shapes and the poses are plain data and arithmetic (heldShape, handPose),
// so they are tested without a graphics card; HandView at the bottom is the only part that touches three.js.

import * as THREE from 'three';
import { BLOCK_COUNT, B_BOXES, B_BOX_TEX, B_FACE_TEX, B_RENDER, RENDER, TEXTURE_NAMES } from '../world/blocks.ts';
import { itemDef, itemName } from '../world/items.ts';
import { drawItemIcon, hasIcon } from './itemIcons.ts';
import { drawTexture, TEX } from './textures.ts';

type RGB = [number, number, number];
const hex = (c: string): RGB => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
/** How bright each face of a box is drawn (east, west, top, bottom, south, north), so a shape has form without a light. */
const FACE_SHADE = [0.78, 0.7, 1, 0.5, 0.88, 0.62];

/** A shape as coloured quads, in its own units (scaled when it is made into a mesh). */
export class Shape {
  pos: number[] = [];
  col: number[] = [];
  get quads(): number { return this.pos.length / 12; }

  private quad(p: number[][], c: RGB, shade: number): void {
    for (const v of p) { this.pos.push(v[0], v[1], v[2]); this.col.push(c[0] * shade, c[1] * shade, c[2] * shade); }
  }

  /** One face of a box (0 east … 5 north, the game's face order), wound counter-clockwise from outside. */
  face(f: number, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: RGB): void {
    const s = FACE_SHADE[f];
    if (f === 0) this.quad([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], c, s);
    else if (f === 1) this.quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], c, s);
    else if (f === 2) this.quad([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], c, s);
    else if (f === 3) this.quad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], c, s);
    else if (f === 4) this.quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], c, s);
    else this.quad([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], c, s);
  }

  /** A box in one colour. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, colour: string): this {
    const c = hex(colour);
    for (let f = 0; f < 6; f++) this.face(f, x0, y0, z0, x1, y1, z1, c);
    return this;
  }

  /**
   * A box (in sixteenths of a block) drawn texel by texel from the block textures of its six faces, as the world
   * draws it: a texel that is cut out (a leaf's gaps) is left open.
   */
  texBox(b: readonly number[], layer: (face: number) => number): this {
    const [x0, y0, z0, x1, y1, z1] = b;
    for (let f = 0; f < 6; f++) {
      const t = texturePixels(layer(f));
      // The two axes that span the face, and where it sits on the third.
      const [u0, u1, v0, v1] = f < 2 ? [z0, z1, y0, y1] : f < 4 ? [x0, x1, z0, z1] : [x0, x1, y0, y1];
      for (let v = Math.floor(v0); v < v1; v++) for (let u = Math.floor(u0); u < u1; u++) {
        const col = Math.min(TEX - 1, Math.max(0, u)), row = f === 2 || f === 3 ? Math.min(TEX - 1, Math.max(0, v)) : TEX - 1 - Math.min(TEX - 1, Math.max(0, v));
        const i = (row * TEX + col) * 4;
        if (t[i + 3] < 128) continue;
        const a0 = Math.max(u, u0), a1 = Math.min(u + 1, u1), c0 = Math.max(v, v0), c1 = Math.min(v + 1, v1);
        const c: RGB = [t[i], t[i + 1], t[i + 2]];
        if (f < 2) this.face(f, x0, c0, a0, x1, c1, a1, c);
        else if (f < 4) this.face(f, a0, y0, c0, a1, y1, c1, c);
        else this.face(f, a0, c0, z0, a1, c1, z1, c);
      }
    }
    return this;
  }

  /** A 16 × 16 picture (row 0 at the top) given a thickness: each drawn pixel a small block, inner faces left out. */
  sprite(px: Uint8ClampedArray, thick: number): this {
    const on = (x: number, y: number) => x >= 0 && y >= 0 && x < TEX && y < TEX && px[(y * TEX + x) * 4 + 3] >= 128;
    for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
      if (!on(x, y)) continue;
      const i = (y * TEX + x) * 4, c: RGB = [px[i], px[i + 1], px[i + 2]];
      // The picture stands in the x–y plane, centred, its thickness along z.
      const x0 = x - 8, y0 = 15 - y - 8, z0 = -thick / 2;
      this.face(4, x0, y0, z0, x0 + 1, y0 + 1, z0 + thick, c);
      this.face(5, x0, y0, z0, x0 + 1, y0 + 1, z0 + thick, c);
      if (!on(x + 1, y)) this.face(0, x0, y0, z0, x0 + 1, y0 + 1, z0 + thick, c);
      if (!on(x - 1, y)) this.face(1, x0, y0, z0, x0 + 1, y0 + 1, z0 + thick, c);
      if (!on(x, y - 1)) this.face(2, x0, y0, z0, x0 + 1, y0 + 1, z0 + thick, c);
      if (!on(x, y + 1)) this.face(3, x0, y0, z0, x0 + 1, y0 + 1, z0 + thick, c);
    }
    return this;
  }

  /** A thin square rod from one point to another (a bowstring, an arrow): it need not lie along an axis. */
  beam(a: number[], b: number[], thick: number, colour: string): this {
    const c = hex(colour);
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = Math.hypot(d[0], d[1], d[2]) || 1;
    const n = d.map((v) => v / len);
    // Two directions square to the rod and to each other.
    const up = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let u = [n[1] * up[2] - n[2] * up[1], n[2] * up[0] - n[0] * up[2], n[0] * up[1] - n[1] * up[0]];
    const ul = Math.hypot(u[0], u[1], u[2]);
    u = u.map((v) => (v / ul) * thick * 0.5);
    const w = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
    const at = (p: number[], su: number, sw: number) => [p[0] + u[0] * su + w[0] * sw, p[1] + u[1] * su + w[1] * sw, p[2] + u[2] * su + w[2] * sw];
    const ring: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let k = 0; k < 4; k++) {
      const [s0, t0] = ring[k], [s1, t1] = ring[(k + 1) % 4];
      this.quad([at(a, s0, t0), at(a, s1, t1), at(b, s1, t1), at(b, s0, t0)], c, 0.7 + 0.1 * k);
      this.quad([at(b, s0, t0), at(b, s1, t1), at(a, s1, t1), at(a, s0, t0)], c, 0.7 + 0.1 * k); // seen from either side
    }
    return this;
  }

  /** The smallest box that holds the shape: [x0, y0, z0, x1, y1, z1]. */
  bounds(): number[] {
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let i = 0; i < this.pos.length; i += 3) for (let a = 0; a < 3; a++) { b[a] = Math.min(b[a], this.pos[i + a]); b[a + 3] = Math.max(b[a + 3], this.pos[i + a]); }
    return b;
  }
}

const texCache = new Map<number, Uint8ClampedArray>();
function texturePixels(layer: number): Uint8ClampedArray {
  let t = texCache.get(layer);
  if (!t) { t = drawTexture(TEXTURE_NAMES[layer] ?? 'limestone'); texCache.set(layer, t); }
  return t;
}

// ---- What is held ---------------------------------------------------------------------------

/**
 * How a thing sits in the hand. `tool`: by a handle, head up (it chops). `long`: a long gun, along the forearm.
 * `pistol`: a hand gun. `bow`: held out upright. `rod`: a fishing rod, leaning out. `block`: on the palm.
 * `flat`: a small thing held up between the fingers. `none`: an empty hand.
 */
export type Grip = 'none' | 'tool' | 'long' | 'pistol' | 'bow' | 'rod' | 'block' | 'flat';

export interface Held { grip: Grip; shape: Shape; /** Metres per unit of the shape. */ scale: number }

const WOOD = '#8a5a32', WOOD_D = '#5e3c20', WOOD_L = '#a8733f', STEEL = '#c9d0d6', STEEL_D = '#7d8790', STEEL_L = '#e6ebee';
const IRON = '#a9a29a', IRON_D = '#6b655e', STONE = '#9d978a', STONE_D = '#6f6a60', GUN = '#34363a', GUN_D = '#1e2023', GUN_L = '#50545a';
const WALNUT = '#6b4423', WALNUT_D = '#4a2e16', WALNUT_L = '#86582f';

/** A tool's handle: the grip is at the origin, the head up the +y axis; −z is away from the player. */
function handle(s: Shape, from: number, to: number, c = WOOD, d = WOOD_D): Shape {
  s.box(-0.55, from, -0.55, 0.55, to, 0.55, c);
  s.box(-0.6, from, -0.6, 0.6, from + 0.9, 0.6, d); // the butt
  return s;
}

function pickaxe(metal: string, dark: string, light: string): Shape {
  const s = handle(new Shape(), -6, 12.6);
  s.box(-0.9, 10.4, -1.3, 0.9, 13.2, 1.3, dark); // the eye
  // Two arms curving down to their points, one ahead and one behind.
  for (const k of [-1, 1]) {
    const z = (a: number, b: number): [number, number] => (k < 0 ? [-b, -a] : [a, b]);
    let [a, b] = z(1.3, 4.2); s.box(-0.6, 11.3, a, 0.6, 12.9, b, metal);
    [a, b] = z(4.2, 6.6); s.box(-0.55, 10.5, a, 0.55, 12.2, b, metal);
    [a, b] = z(6.6, 8.4); s.box(-0.45, 9.4, a, 0.45, 11.1, b, light);
    [a, b] = z(8.4, 9.6); s.box(-0.3, 8.2, a, 0.3, 9.9, b, light);
  }
  return s;
}

const TOOLS: Record<string, () => Held> = {
  steel_pickaxe: () => ({ grip: 'tool', scale: 0.028, shape: pickaxe(STEEL, STEEL_D, STEEL_L) }),
  iron_pickaxe: () => ({ grip: 'tool', scale: 0.028, shape: pickaxe(IRON, IRON_D, '#c4beb6') }),
  stone_pickaxe: () => ({ grip: 'tool', scale: 0.028, shape: pickaxe(STONE, STONE_D, '#b5afa2') }),
  steel_axe: () => {
    const s = handle(new Shape(), -6, 13);
    s.box(-0.8, 9.6, -0.9, 0.8, 12.8, 1.5, STEEL_D); // the poll
    s.box(-0.5, 9.2, -4.2, 0.5, 13.2, -0.9, STEEL); // the cheek
    s.box(-0.3, 8.4, -5.6, 0.3, 14, -4.2, STEEL_L); // the bit, flaring to its edge
    return { grip: 'tool', scale: 0.028, shape: s };
  },
  steel_shovel: () => {
    const s = handle(new Shape(), -9, 9);
    s.box(-0.7, 8.4, -0.7, 0.7, 10, 0.7, STEEL_D); // the socket
    s.box(-2.6, 10, -0.35, 2.6, 15, 0.35, STEEL);
    s.box(-2, 15, -0.35, 2, 16.6, 0.35, STEEL);
    s.box(-1.1, 16.6, -0.3, 1.1, 17.8, 0.3, STEEL_L);
    s.box(-2.6, 10, -0.6, -2.1, 14.6, 0.35, STEEL_D); s.box(2.1, 10, -0.6, 2.6, 14.6, 0.35, STEEL_D); // the rolled shoulders
    return { grip: 'tool', scale: 0.028, shape: s };
  },
  steel_hoe: () => {
    const s = handle(new Shape(), -8, 13);
    s.box(-0.7, 11.6, -3.4, 0.7, 12.6, 0.7, STEEL_D); // the neck, forward
    s.box(-2.2, 8.2, -4, 2.2, 12.6, -3.4, STEEL);
    s.box(-2.2, 7.6, -4, 2.2, 8.2, -3.5, STEEL_L);
    return { grip: 'tool', scale: 0.028, shape: s };
  },
  hammer: () => {
    const s = handle(new Shape(), -5, 10);
    s.box(-1.2, 9, -2.6, 1.2, 11.6, 1.6, STEEL_D);
    s.box(-1.3, 8.9, -3.2, 1.3, 11.7, -2.6, STEEL); // the face
    s.box(-0.5, 9.6, 1.6, 0.5, 11.2, 3.4, STEEL_D); s.box(-0.25, 9.2, 3.4, 0.25, 10.4, 4.2, STEEL); // the claw
    return { grip: 'tool', scale: 0.028, shape: s };
  },
  machete: () => {
    const s = new Shape();
    s.box(-0.6, -3.2, -0.9, 0.6, 1, 0.9, '#2b2b2b').box(-0.65, -3.6, -1, 0.65, -3, 1.1, '#1c1c1c');
    s.box(-0.8, 1, -1.4, 0.8, 1.6, 1.3, STEEL_D); // the guard
    s.box(-0.2, 1.6, -1.2, 0.2, 10, 1, STEEL);
    s.box(-0.2, 10, -1.9, 0.2, 15.5, 1, STEEL); // the blade widens toward its end
    s.box(-0.2, 15.5, -1.5, 0.2, 16.6, 0.4, STEEL);
    s.box(-0.12, 1.6, -1.5, 0.12, 10, -1.2, STEEL_L); s.box(-0.12, 10, -2.2, 0.12, 15.5, -1.9, STEEL_L); // the edge
    return { grip: 'tool', scale: 0.028, shape: s };
  },
  hunting_knife: () => {
    const s = new Shape();
    s.box(-0.55, -3, -0.8, 0.55, 1, 0.8, '#3b2a1c').box(-0.6, -3.4, -0.9, 0.6, -2.8, 0.9, '#22180f');
    s.box(-0.7, 1, -1.3, 0.7, 1.5, 1.1, '#8a8f95');
    s.box(-0.18, 1.5, -1, 0.18, 6.4, 0.7, STEEL);
    s.box(-0.18, 6.4, -0.6, 0.18, 8, 0.7, STEEL); s.box(-0.14, 8, 0, 0.14, 9, 0.7, STEEL_L);
    s.box(-0.1, 1.5, -1.25, 0.1, 6.4, -1, STEEL_L);
    return { grip: 'tool', scale: 0.028, shape: s };
  },
  handsaw: () => {
    const s = new Shape();
    s.box(-0.6, -3, -1.6, 0.6, 2.2, 1.6, WOOD).box(-0.65, -1.6, -0.7, 0.65, 0.8, 0.7, WOOD_D);
    s.box(-0.12, 2.2, -2.4, 0.12, 9, 1.6, STEEL);
    s.box(-0.12, 9, -1.8, 0.12, 15, 1.6, STEEL); s.box(-0.12, 15, -1, 0.12, 17, 1.6, STEEL);
    for (let y = 2.6; y < 15; y += 1.2) s.box(-0.12, y, y < 9 ? -2.9 : -2.3, 0.12, y + 0.6, y < 9 ? -2.4 : -1.8, STEEL_D); // the teeth
    return { grip: 'tool', scale: 0.028, shape: s };
  },
  spear: () => {
    const s = new Shape();
    s.box(-0.45, -12, -0.45, 0.45, 14, 0.45, WOOD).box(-0.5, 12.6, -0.5, 0.5, 14.4, 0.5, '#c9b48a'); // the lashing
    s.box(-0.2, 14.4, -1.1, 0.2, 17, 1.1, '#3a3a3a').box(-0.2, 17, -0.7, 0.2, 18.6, 0.7, '#3a3a3a').box(-0.15, 18.6, -0.3, 0.15, 20, 0.3, '#565656');
    return { grip: 'tool', scale: 0.028, shape: s };
  },
  fishing_rod: () => {
    const s = new Shape();
    s.box(-0.5, -5, -0.5, 0.5, 2, 0.5, '#2a2a2a'); // the cork grip
    s.box(-0.3, 2, -0.3, 0.3, 14, 0.3, WOOD_L).box(-0.2, 14, -0.2, 0.2, 26, 0.2, WOOD_L).box(-0.13, 26, -0.13, 0.13, 34, 0.13, '#c9a36a');
    s.box(0.5, 0.4, -0.8, 1.7, 2, 0.8, STEEL_D).box(1.7, 0.8, -0.3, 2.2, 1.6, 0.3, '#c0392b'); // the reel and its knob
    s.box(-0.05, 22, -0.05, 0.05, 34, 0.05, '#e8e8e8'); // the line down from the tip
    s.box(-0.07, 14, -0.42, 0.07, 22, -0.32, '#e8e8e8');
    return { grip: 'rod', scale: 0.03, shape: s };
  },
};

/** A long gun, lying along −z (the muzzle away from the player), the grip at the origin. */
function rifle(kind: 'hunting' | 'worn' | 'rebuilt'): Shape {
  const s = new Shape();
  const stock = kind === 'rebuilt' ? '#2c2f33' : kind === 'worn' ? '#5a4630' : WALNUT;
  const stockD = kind === 'rebuilt' ? '#1d1f22' : kind === 'worn' ? '#3d2f20' : WALNUT_D;
  const stockL = kind === 'rebuilt' ? '#3d4146' : kind === 'worn' ? '#6f5a40' : WALNUT_L;
  // The butt (toward the player), stepping up to the wrist.
  s.box(-0.8, -3.6, 9, 0.8, 0.4, 13, stock).box(-0.85, -3.8, 13, 0.85, 0.5, 13.6, stockD);
  s.box(-0.75, -2.6, 5, 0.75, 0.5, 9, stock).box(-0.7, -1.6, 2, 0.7, 0.6, 5, stockL);
  s.box(-0.65, -2.4, 0.4, 0.65, -0.2, 2.2, stockD); // the grip's wrist
  // The receiver, the bolt, the fore-end, the barrel.
  s.box(-0.8, -0.6, -5, 0.8, 1.2, 2, GUN).box(-0.6, 1.2, -4, 0.6, 1.5, 1, GUN_L);
  s.box(0.8, 0.5, -1.6, 1.5, 0.9, -1, GUN_L).box(1.3, 0.1, -1.7, 1.8, 0.9, -0.9, GUN_D); // the bolt handle
  s.box(-0.5, -1.7, -3.4, 0.5, -0.6, -1, GUN_D); // the magazine
  s.box(-0.1, -1.5, -0.6, 0.1, -0.6, 1.4, GUN_D); // the trigger guard
  s.box(-0.75, -0.9, -14, 0.75, 0.5, -5, stock).box(-0.7, -1, -15, 0.7, 0.3, -14, stockD);
  s.box(-0.35, 0.5, -26, 0.35, 1.2, -5, GUN_L).box(-0.42, 0.4, -26.6, 0.42, 1.3, -25.6, GUN_D);
  if (kind === 'worn') {
    // Iron sights, and tape round the fore-end: a raider's rifle has seen no care.
    s.box(-0.12, 1.2, -25.4, 0.12, 2, -25, GUN_D).box(-0.4, 1.5, -1.2, 0.4, 2, -0.8, GUN_D);
    s.box(-0.82, -1, -10, 0.82, 0.6, -8.4, '#9a9a8c').box(-0.82, -1, -12.4, 0.82, 0.6, -11.6, '#9a9a8c');
  } else {
    const big = kind === 'rebuilt';
    s.box(-0.3, 1.5, -5.4, 0.3, 2, -4.6, GUN_D).box(-0.3, 1.5, 0, 0.3, 2, 0.8, GUN_D); // the mounts
    s.box(-0.5, 2, -7, 0.5, 3, 2.6, GUN_D);
    s.box(-0.7, 1.8, -10 - (big ? 2 : 0), 0.7, 3.2, -7, GUN).box(-0.6, 1.9, 2.6, 0.6, 3.1, 4.4, GUN);
    s.box(-0.5, 2, -10.2 - (big ? 2 : 0), 0.5, 3, -10 - (big ? 2 : 0), '#6fa0b8'); // the glass
    s.box(-0.25, 3, -2.6, 0.25, 3.5, -1.8, GUN_L); // the turret
  }
  return s;
}

function pistol(quiet: boolean): Shape {
  const s = new Shape();
  s.box(-0.6, -4.6, 0, 0.6, 0.2, 2, '#2a2a2a').box(-0.65, -5, 0.3, 0.65, -4.4, 2.3, GUN_D); // the grip, raked back
  s.box(-0.55, -4.2, 0.9, 0.55, -1, 2.4, '#3a2c20');
  s.box(-0.62, 0.2, -6.2, 0.62, 1.9, 2.2, GUN).box(-0.5, 1.9, -5.6, 0.5, 2.1, 1.6, GUN_L); // frame and slide
  s.box(-0.14, 2.1, -5.8, 0.14, 2.5, -5.4, GUN_D).box(-0.4, 2.1, 1.2, 0.4, 2.5, 1.6, GUN_D); // the sights
  s.box(-0.1, -1.6, -2.4, 0.1, 0.2, 0, GUN_D); // the trigger guard
  s.box(-0.3, 0.7, -6.8, 0.3, 1.5, -6.2, GUN_L);
  if (quiet) s.box(-0.6, 0.4, -13, 0.6, 1.8, -6.8, '#26282b').box(-0.65, 0.35, -8.6, 0.65, 1.85, -8, GUN_D);
  return s;
}

/** A bow, upright, held at its grip; the string is drawn separately (it moves). */
function bow(wood: boolean): Shape {
  const s = new Shape();
  const limb = wood ? WOOD : '#2d2f33', limbD = wood ? WOOD_D : '#1c1e21', grip = wood ? '#3b2a1c' : '#4a6b3a';
  s.box(-0.7, -2.4, -0.9, 0.7, 2.4, 0.9, grip);
  for (const k of [-1, 1]) {
    const y = (a: number, b: number): [number, number] => (k < 0 ? [-b, -a] : [a, b]);
    // Each limb leans away from the player, then curls back at its tip.
    let [a, b] = y(2.4, 6); s.box(-0.5, a, -1.4, 0.5, b, -0.2, limbD);
    [a, b] = y(6, 10); s.box(-0.45, a, -1.7, 0.45, b, -0.7, limb);
    [a, b] = y(10, 14); s.box(-0.4, a, -1.3, 0.4, b, -0.4, limb);
    [a, b] = y(14, 17); s.box(-0.35, a, -0.5, 0.35, b, 0.5, limb);
    [a, b] = y(17, 18.6); s.box(-0.3, a, 0.5, 0.3, b, 1.5, limbD);
    if (!wood) { [a, b] = y(16.4, 19.2); s.box(-0.6, a, 0.3, -0.3, b, 1.8, '#8a8f95'); } // a compound bow's cams
  }
  return s;
}

/** Where a bow's string runs: from each tip (y = ±BOW_TIP) at z = BOW_STRING_Z back to the fingers. */
export const BOW_TIP = 18, BOW_STRING_Z = 1.4, BOW_PULL = 9;

const WEAPONS: Record<string, () => Held> = {
  hunting_rifle: () => ({ grip: 'long', scale: 0.03, shape: rifle('hunting') }),
  raider_rifle: () => ({ grip: 'long', scale: 0.03, shape: rifle('worn') }),
  rifle_rebuilt: () => ({ grip: 'long', scale: 0.03, shape: rifle('rebuilt') }),
  pistol: () => ({ grip: 'pistol', scale: 0.03, shape: pistol(false) }),
  pistol_suppressed: () => ({ grip: 'pistol', scale: 0.03, shape: pistol(true) }),
  compound_bow: () => ({ grip: 'bow', scale: 0.03, shape: bow(false) }),
  hunting_bow: () => ({ grip: 'bow', scale: 0.03, shape: bow(true) }),
};

/** The shape of what is held and how it is gripped; id 0 (or undefined) is the empty hand. */
export function heldShape(id: number | undefined): Held {
  if (!id) return { grip: 'none', shape: new Shape(), scale: 1 };
  if (id < BLOCK_COUNT) {
    const s = new Shape();
    if (B_RENDER[id] === RENDER.model && B_BOXES[id]) {
      const tex = B_BOX_TEX[id]!;
      B_BOXES[id]!.forEach((b, k) => s.texBox(b, (f) => tex[k * 6 + f]));
      return { grip: 'block', shape: s, scale: 0.16 / 16 };
    }
    if (B_RENDER[id] === RENDER.cube) return { grip: 'block', shape: s.texBox([0, 0, 0, 16, 16, 16], (f) => B_FACE_TEX[id * 6 + f]), scale: 0.16 / 16 };
    // A plant, or anything else drawn flat in the world: its picture, held up.
    return { grip: 'flat', shape: s.sprite(texturePixels(B_FACE_TEX[id * 6]), 0.35), scale: 0.15 / 16 };
  }
  const name = itemName(id);
  const made = (TOOLS[name] ?? WEAPONS[name])?.();
  if (made) return made;
  const icon = itemDef(id)?.icon ?? '';
  const px = hasIcon(icon) ? drawItemIcon(icon) : texturePixels(0);
  return { grip: 'flat', shape: new Shape().sprite(px, 0.35), scale: 0.15 / 16 };
}

// ---- The arm ----------------------------------------------------------------------------------

/**
 * The right forearm and hand, in metres: the fist at the origin, the forearm running back toward the player
 * (+z) to the elbow. A field jacket's sleeve, a knitted cuff, a hand. `open`: the fingers flat (a block on the palm).
 */
export function armShape(open = false): Shape {
  const s = new Shape();
  const SKIN = '#c98f63', SKIN_D = '#a8734c', SLEEVE = '#5b6b4a', SLEEVE_D = '#47553a', CUFF = '#39442f';
  if (open) {
    s.box(-0.05, -0.02, -0.11, 0.05, 0.012, 0.05, SKIN); // the palm, up
    s.box(-0.05, -0.02, -0.19, 0.045, 0.006, -0.11, SKIN).box(-0.05, -0.022, -0.15, 0.045, -0.02, -0.11, SKIN_D); // the fingers
    s.box(-0.085, -0.016, -0.08, -0.05, 0.016, -0.01, SKIN_D); // the thumb
  } else {
    s.box(-0.048, -0.055, -0.06, 0.048, 0.05, 0.05, SKIN); // the fist
    s.box(-0.05, -0.058, -0.066, 0.05, 0.03, -0.058, SKIN_D); // the knuckles' shadow
    s.box(-0.066, -0.01, -0.058, -0.046, 0.046, 0.02, SKIN_D); // the thumb, wrapped over
  }
  s.box(-0.04, -0.045, 0.05, 0.04, 0.035, 0.13, SKIN); // the wrist
  s.box(-0.056, -0.06, 0.13, 0.056, 0.052, 0.17, CUFF);
  s.box(-0.062, -0.068, 0.17, 0.062, 0.058, 0.62, SLEEVE);
  s.box(-0.064, -0.07, 0.3, 0.064, -0.02, 0.62, SLEEVE_D); // the sleeve's underside, in shadow
  s.box(-0.066, -0.072, 0.36, 0.066, 0.062, 0.385, SLEEVE_D); // a seam
  return s;
}

// ---- Poses ------------------------------------------------------------------------------------

/** Where a part sits before the camera: metres right, up and toward the player; turned x, y, z (radians, in that order). */
export interface Pose { x: number; y: number; z: number; rx: number; ry: number; rz: number }
export interface HandPoses { /** The arm (its fist at the origin). */ arm: Pose; /** What is held, in the arm's own space. */ item: Pose }

export interface HandState {
  grip: Grip;
  /** 0 … 1 through a swing (a chop, a blow, setting a block down); 0 when still. */
  swing: number;
  /** 0 … 1: how far the weapon is raised to the eye (focus, or the bow drawn). */
  aim: number;
  /** 0 … 1: the bowstring's draw. */
  draw: number;
  /** A shot's kick, dying away from 1. */
  recoil: number;
  /** 0 (lowered out of sight, changing what is held) … 1 (up). */
  raised: number;
  /** The walking cycle (radians), and how much of it shows (0 standing … 1 walking). */
  step: number;
  stride: number;
  /** The view's turning, smoothed (the hand trails a quick turn a little). */
  swayX: number;
  swayY: number;
}

export const REST: HandState = { grip: 'none', swing: 0, aim: 0, draw: 0, recoil: 0, raised: 1, step: 0, stride: 0, swayX: 0, swayY: 0 };

const ease = (t: number) => t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mixPose = (a: Pose, b: Pose, t: number): Pose => ({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), z: mix(a.z, b.z, t), rx: mix(a.rx, b.rx, t), ry: mix(a.ry, b.ry, t), rz: mix(a.rz, b.rz, t) });

/** The strike of a swing: fast down to its end at 0.38, slower back. 0 at both ends, 1 at the blow. */
export function strike(s: number): number {
  if (s <= 0 || s >= 1) return 0;
  return s < 0.38 ? ease(s / 0.38) : 1 - ease((s - 0.38) / 0.62);
}

/** Each grip at rest: the arm before the camera, and the thing in the fist. */
const GRIPS: Record<Grip, HandPoses> = {
  none: { arm: { x: 0.27, y: -0.2, z: -0.5, rx: 0.36, ry: 0.5, rz: 0.1 }, item: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } },
  tool: { arm: { x: 0.27, y: -0.2, z: -0.52, rx: 0.3, ry: 0.5, rz: 0.06 }, item: { x: 0, y: 0, z: 0, rx: -0.95, ry: 0.2, rz: 0 } },
  rod: { arm: { x: 0.27, y: -0.2, z: -0.5, rx: 0.3, ry: 0.5, rz: 0.06 }, item: { x: 0, y: 0, z: 0, rx: -1.3, ry: -0.3, rz: 0 } },
  long: { arm: { x: 0.2, y: -0.2, z: -0.36, rx: 0.1, ry: 0.1, rz: 0 }, item: { x: 0, y: 0.045, z: 0.02, rx: -0.06, ry: 0.04, rz: 0 } },
  pistol: { arm: { x: 0.2, y: -0.2, z: -0.5, rx: 0.12, ry: 0.14, rz: 0 }, item: { x: 0, y: 0.05, z: 0, rx: -0.1, ry: 0, rz: 0 } },
  bow: { arm: { x: 0.15, y: -0.17, z: -0.56, rx: 0.2, ry: 0.5, rz: 0.2 }, item: { x: 0, y: 0, z: 0, rx: -0.2, ry: -0.5, rz: -0.32 } },
  block: { arm: { x: 0.27, y: -0.24, z: -0.46, rx: 0.2, ry: 0.4, rz: 0 }, item: { x: -0.08, y: 0.012, z: -0.17, rx: 0, ry: 0.45, rz: 0 } },
  // Food, parts, papers and plants lie flat on the open palm, as a thing is carried in the hand: never an upright
  // picture given a thickness and held like a blade, which is another block game's look (AGENTS.md: nothing from it).
  flat: { arm: { x: 0.27, y: -0.24, z: -0.46, rx: 0.2, ry: 0.4, rz: 0 }, item: { x: -0.01, y: 0.016, z: -0.09, rx: -Math.PI / 2, ry: 0, rz: 0.45 } },
};
/** A weapon raised to the eye: its muzzle under the cross in the middle of the view. */
const AIMED: Partial<Record<Grip, Pose>> = {
  long: { x: 0.075, y: -0.135, z: -0.3, rx: 0.03, ry: 0.13, rz: 0 },
  pistol: { x: 0.05, y: -0.13, z: -0.48, rx: 0.02, ry: 0.1, rz: 0 },
  bow: { x: 0.06, y: -0.16, z: -0.56, rx: 0.06, ry: 0.5, rz: 0.06 },
};

/** Where the arm and the held thing are, for a state of the hand. Pure: the same state gives the same pose. */
export function handPose(st: HandState): HandPoses {
  const g = GRIPS[st.grip];
  const aimed = AIMED[st.grip];
  let arm = aimed ? mixPose(g.arm, aimed, ease(Math.min(1, Math.max(0, st.aim)))) : { ...g.arm };
  const item = { ...g.item };
  const k = strike(st.swing);
  if (st.grip === 'long' || st.grip === 'pistol' || st.grip === 'bow') {
    // A blow with a weapon in hand is a short shove forward, not a chop.
    arm.z -= 0.1 * k; arm.rx += 0.12 * k;
  } else if (st.grip === 'block' || st.grip === 'flat') {
    // Setting down, eating, giving: the hand goes out and down, and comes back.
    arm.z -= 0.14 * k; arm.y -= 0.05 * k; arm.rx -= 0.35 * k; arm.x -= 0.05 * k;
  } else {
    // A chop: the arm drives forward and across, the head of the tool coming down in front.
    arm.rx -= 1.05 * k; arm.x -= 0.11 * k; arm.y -= 0.03 * k; arm.z -= 0.1 * k; arm.ry += 0.12 * k;
    if (st.grip === 'none') { arm.x -= 0.06 * k; arm.y += 0.1 * k; arm.rx += 0.5 * k; } // a bare fist goes straight out
  }
  // A shot kicks the weapon back and up.
  arm.z += 0.07 * st.recoil; arm.rx += (st.grip === 'pistol' ? 0.3 : 0.14) * st.recoil; arm.y += 0.012 * st.recoil;
  // Walking: the hand rides the stride (less when aiming). A turn of the view: it trails a little.
  const bob = st.stride * (1 - 0.8 * st.aim);
  arm.x += Math.cos(st.step) * 0.011 * bob + st.swayX;
  arm.y += -Math.abs(Math.sin(st.step)) * 0.016 * bob + st.swayY;
  // Lowered out of sight while what is held changes.
  const down = 1 - ease(Math.min(1, Math.max(0, st.raised)));
  arm.y -= 0.42 * down; arm.rx += 0.5 * down;
  return { arm, item };
}

// ---- Drawing ----------------------------------------------------------------------------------

const VERT = /* glsl */ `
in vec3 aColor;
out vec3 vColor;
void main() { vColor = aColor / 255.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = /* glsl */ `
precision highp float;
in vec3 vColor;
uniform vec3 uLight;
out vec4 outColor;
void main() { outColor = vec4(vColor * uLight, 1.0); }`;

function geometryOf(shape: Shape, scale: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const n = shape.quads;
  const pos = new Float32Array(shape.pos.length);
  for (let i = 0; i < pos.length; i++) pos[i] = shape.pos[i] * scale;
  const idx = new Uint16Array(n * 6);
  for (let q = 0, v = 0, i = 0; q < n; q++, v += 4) { idx[i++] = v; idx[i++] = v + 1; idx[i++] = v + 2; idx[i++] = v; idx[i++] = v + 2; idx[i++] = v + 3; }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(new Uint8Array(shape.col.map((c) => Math.min(255, Math.round(c)))), 3));
  g.setIndex(new THREE.BufferAttribute(n * 4 > 65535 ? new Uint32Array(idx) : idx, 1));
  return g;
}

const place = (o: THREE.Object3D, p: Pose) => { o.position.set(p.x, p.y, p.z); o.rotation.set(p.rx, p.ry, p.rz, 'YXZ'); };
/**
 * How large the arm and what it holds are drawn, against the sizes they are modelled at. Judged in the game's own
 * picture: at full size a pickaxe's head reached the top of the screen and hid a quarter of the view.
 */
const HAND_SIZE = 0.68;

/** What the game tells the hand each frame. */
export interface HandFrame {
  /** The item or block in hand (0 or undefined: none). */
  held: number | undefined;
  /** Is the hand drawn at all (in play, not through the telescope)? */
  show: boolean;
  /** Mining now: the tool swings again and again. */
  mining: boolean;
  aiming: boolean;
  /** The bow's draw, 0 … 1. */
  draw: number;
  /** Metres walked this frame on the ground. */
  walked: number;
  /** The view's turn this frame (radians): yaw, pitch. */
  turnX: number;
  turnY: number;
  /** The light on the hand (the sky's and the lamps', as the blocks are lit; under water it is the water's). */
  light: THREE.Color;
}

export class HandView {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(58, 1, 0.02, 6);
  private root = new THREE.Group();
  private mat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG,
    uniforms: { uLight: { value: new THREE.Color(1, 1, 1) } },
  });
  private arm: THREE.Mesh;
  private armOpen: THREE.Mesh;
  private item: THREE.Mesh | null = null;
  private string: THREE.Mesh;
  private cache = new Map<number, { held: Held; geometry: THREE.BufferGeometry }>();
  private shown: number | undefined = undefined;
  private grip: Grip = 'none';
  readonly state: HandState = { ...REST };
  private swinging = false;
  /** Set false to draw nothing (a setting, or a picture without the hand). */
  enabled = true;

  constructor() {
    this.arm = new THREE.Mesh(geometryOf(armShape(false), 1), this.mat);
    this.armOpen = new THREE.Mesh(geometryOf(armShape(true), 1), this.mat);
    this.string = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    for (const m of [this.arm, this.armOpen, this.string]) { m.frustumCulled = false; this.root.add(m); }
    this.scene.add(this.root);
  }

  /** One swing (a blow, a block set down, something eaten). A swing under way is not restarted. */
  swing(): void {
    if (this.swinging) return;
    this.swinging = true;
    this.state.swing = 0.0001;
  }

  /** A shot: the weapon kicks. */
  kick(): void { this.state.recoil = 1; }

  private held(id: number): { held: Held; geometry: THREE.BufferGeometry } {
    let e = this.cache.get(id);
    if (!e) {
      const held = heldShape(id);
      e = { held, geometry: geometryOf(held.shape, held.scale) };
      // A few shapes are kept (the hotbar's nine and a little more); the oldest goes first.
      if (this.cache.size >= 16) { const [k, v] = this.cache.entries().next().value!; v.geometry.dispose(); this.cache.delete(k); }
      this.cache.set(id, e);
    }
    return e;
  }

  private setShown(id: number | undefined): void {
    this.shown = id;
    if (this.item) { this.root.remove(this.item); this.item = null; }
    this.grip = 'none';
    if (!id) return;
    const e = this.held(id);
    this.grip = e.held.grip;
    this.item = new THREE.Mesh(e.geometry, this.mat);
    this.item.frustumCulled = false;
    this.root.add(this.item);
  }

  /** The bowstring: from each tip to the fingers, pulled back as the bow is drawn; an arrow on it while it is. */
  private drawString(draw: number, scale: number): void {
    const s = new Shape();
    const z = BOW_STRING_Z + BOW_PULL * draw;
    for (const sign of [-1, 1]) s.beam([0, sign * BOW_TIP, BOW_STRING_Z], [0, 0, z], 0.16, '#e8e4d8');
    if (draw > 0.02) {
      // The arrow: nocked on the string at the fingers, lying past the grip, its head out in front.
      s.beam([0.75, 0.3, z], [0.75, 0.3, z - 24], 0.26, '#b9925a');
      s.box(0.45, 0, z - 26, 1.05, 0.6, z - 24, '#5d6268');
      s.box(0.72, -0.2, z - 3.4, 0.78, 0.8, z - 0.6, '#e9e9e9').box(0.25, 0.27, z - 3.4, 1.25, 0.33, z - 0.6, '#d94a3a');
    }
    this.string.geometry.dispose();
    this.string.geometry = geometryOf(s, scale);
  }
  private stringDraw = -1;

  update(dt: number, f: HandFrame): void {
    const st = this.state;
    this.root.visible = f.show && this.enabled;
    const want = f.held || undefined;
    // What is held has changed: down, change, up.
    if (want !== this.shown) {
      st.raised = Math.max(0, st.raised - dt / 0.11);
      if (st.raised <= 0) { this.setShown(want); this.swinging = false; st.swing = 0; }
    } else st.raised = Math.min(1, st.raised + dt / 0.16);
    st.grip = this.grip;
    if (f.mining && !this.swinging) this.swing();
    if (this.swinging) {
      st.swing += dt / (this.grip === 'tool' || this.grip === 'none' ? 0.34 : 0.28);
      if (st.swing >= 1) { st.swing = 0; this.swinging = false; }
    }
    const k = 1 - Math.exp(-dt * 12);
    st.aim += ((f.aiming ? 1 : 0) - st.aim) * k;
    st.draw = f.draw;
    st.recoil *= Math.exp(-dt * 9);
    if (st.recoil < 0.002) st.recoil = 0;
    st.step += f.walked * 1.9;
    st.stride += ((f.walked > 0.0005 ? 1 : 0) - st.stride) * (1 - Math.exp(-dt * 8));
    const clamp = (v: number) => Math.max(-0.035, Math.min(0.035, v));
    st.swayX = clamp(st.swayX * Math.exp(-dt * 9) + f.turnX * 0.05);
    st.swayY = clamp(st.swayY * Math.exp(-dt * 9) - f.turnY * 0.05);
    const pose = handPose(st);
    place(this.root, pose.arm);
    this.root.scale.setScalar(HAND_SIZE);
    const open = this.grip === 'block' || this.grip === 'flat';
    this.arm.visible = !open; this.armOpen.visible = open;
    if (this.item) place(this.item, pose.item);
    const bowHeld = this.grip === 'bow' && !!this.item;
    this.string.visible = bowHeld;
    if (bowHeld) {
      const d = Math.round(st.draw * 40) / 40;
      if (d !== this.stringDraw) { this.stringDraw = d; this.drawString(d, 0.03); }
      place(this.string, pose.item);
    }
    this.mat.uniforms.uLight.value.copy(f.light);
  }

  /** Draws the hand over the picture already drawn (only the depth is cleared: the hand never pokes into a wall). */
  render(gl: THREE.WebGLRenderer, aspect: number): void {
    if (!this.root.visible) return;
    if (this.camera.aspect !== aspect) { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); }
    const auto = gl.autoClear;
    gl.autoClear = false;
    gl.clearDepth();
    gl.render(this.scene, this.camera);
    gl.autoClear = auto;
  }

  /** Quads drawn for the hand now (for the F3 panel's honesty about what a frame costs). */
  get quads(): number {
    if (!this.root.visible) return 0;
    const n = (m: THREE.Mesh | null) => (m && m.visible ? (m.geometry.index?.count ?? 0) / 6 : 0);
    return n(this.arm) + n(this.armOpen) + n(this.item) + n(this.string);
  }
}
