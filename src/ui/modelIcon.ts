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
  const k = S / 48;
  // The view: the same three-sided look as a cube's icon. Into the picture is +x, +z and down.
  const dir = [1, -10 / 11, 1];
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    const sx = (px + 0.5) / k, sy = (py + 0.5) / k;
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
  return out;
}
