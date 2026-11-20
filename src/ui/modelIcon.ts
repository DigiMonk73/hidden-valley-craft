// The pack icon of a block made of boxes (furniture): a small picture of the piece itself, seen from the
// front-left and a little above, each box in its own material. Before, every such block showed one flat face
// of its first texture, so a dozen walnut pieces shared one brown square.
//
// Pure pixels (no canvas), so it can be tested: one ray per pixel, straight into the block, to the first box.

import { B_BOXES, B_BOX_TEX, B_FACE_TEX, TEXTURE_NAMES } from '../world/blocks.ts';
import { drawTexture, TEX } from '../render/textures.ts';

const textures = new Map<number, Uint8ClampedArray>();
const texture = (layer: number): Uint8ClampedArray => {
  let t = textures.get(layer);
  if (!t) { t = drawTexture(TEXTURE_NAMES[layer]); textures.set(layer, t); }
  return t;
};

/** An S×S RGBA picture of a model block. The block's front (north, −z) is the left face, as for a cube's icon. */
export function modelIconPixels(id: number, S = 48): Uint8ClampedArray {
  const out = new Uint8ClampedArray(S * S * 4);
  const boxes = B_BOXES[id];
  if (!boxes) return out;
  const boxTex = B_BOX_TEX[id];
  const layerOf = (b: number, f: number) => (boxTex ? boxTex[b * 6 + f] : B_FACE_TEX[id * 6 + f]);
  // The view: the same three-sided look as a cube's icon. Into the picture is +x, +z and down.
  const dir = [1, -10 / 11, 1];
  // Where the piece falls in a 48-wide picture of the whole block, so that a small piece (a lamp, a clock) can be
  // drawn larger: it is scaled to fill the slot, up to three times, and centred.
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const [x0, y0, z0, x1, y1, z1] of boxes) for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) {
    const u = 4 + (20 * (16 - x)) / 16 + (20 * z) / 16, v = 14 + (10 * (16 - x)) / 16 - (10 * z) / 16 + (22 * (16 - y)) / 16;
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
  }
  const zoom = Math.min(3, 42 / Math.max(u1 - u0, 1), 42 / Math.max(v1 - v0, 1));
  const k = (S / 48) * zoom, cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    const sx = (px + 0.5 - S / 2) / k + cu, sy = (py + 0.5 - S / 2) / k + cv;
    const z0 = ((sx - 24) * 16) / 40, o = [-z0 + 8, ((46 - sy) * 16) / 22, z0 + 8];
    let best = Infinity, colour: [number, number, number] | null = null;
    for (let b = 0; b < boxes.length; b++) {
      const bx = boxes[b];
      // Where the ray enters the box, and through which face (the slab method).
      let tIn = -Infinity, tOut = Infinity, axis = 0;
      for (let a = 0; a < 3; a++) {
        const lo = bx[a], hi = bx[a + 3];
        let t0 = (lo - o[a]) / dir[a], t1 = (hi - o[a]) / dir[a];
        if (t0 > t1) [t0, t1] = [t1, t0];
        if (t0 > tIn) { tIn = t0; axis = a; }
        if (t1 < tOut) tOut = t1;
      }
      if (tIn > tOut + 1e-9 || tIn >= best) continue;
      const h = [o[0] + dir[0] * tIn, o[1] + dir[1] * tIn, o[2] + dir[2] * tIn];
      const at = (v: number) => Math.max(0, Math.min(TEX - 1, Math.floor(v + 1e-6)));
      const up = TEX - 1 - at(h[1] - 1e-5);
      // The face entered: west (−x), top, or north (−z); and the texel there, as the mesher maps it.
      const [face, col, row, shade] = axis === 0 ? [1, at(h[2]), up, 0.64] : axis === 1 ? [2, at(h[0]), at(h[2]), 1] : [5, TEX - 1 - at(h[0] - 1e-5), up, 0.82];
      const t = texture(layerOf(b, face)), i = (row * TEX + col) * 4;
      if (t[i + 3] < 128) continue; // a cut-out texel: the ray goes on
      best = tIn;
      colour = [t[i] * shade, t[i + 1] * shade, t[i + 2] * shade];
    }
    if (colour) { const i = (py * S + px) * 4; out[i] = colour[0]; out[i + 1] = colour[1]; out[i + 2] = colour[2]; out[i + 3] = 255; }
  }
  // A pale rim round the shape, so a dark piece (the anvil, the stove, the phone) shows on a dark slot.
  const rim = new Uint8ClampedArray(out);
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    const i = (py * S + px) * 4;
    if (out[i + 3]) continue;
    const beside = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const x = px + dx, y = py + dy; return x >= 0 && x < S && y >= 0 && y < S && out[(y * S + x) * 4 + 3] > 0; });
    if (beside) { rim[i] = 236; rim[i + 1] = 226; rim[i + 2] = 200; rim[i + 3] = 150; }
  }
  return rim;
}
