// Item icons for the hotbar, drawn from the block textures: a small three-sided cube for blocks,
// the flat picture for plants.

import { B_FACE_TEX, B_RENDER, RENDER, TEXTURE_NAMES } from '../world/blocks.ts';
import { drawTexture, TEX } from '../render/textures.ts';

const cache = new Map<number, string>();

function textureCanvas(layer: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = TEX;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(TEX, TEX);
  img.data.set(drawTexture(TEXTURE_NAMES[layer]));
  ctx.putImageData(img, 0, 0);
  return c;
}

export function iconFor(id: number): string {
  const hit = cache.get(id);
  if (hit) return hit;
  const S = 48;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const k = 1 / TEX;
  if (B_RENDER[id] === RENDER.cube || B_RENDER[id] === RENDER.liquid) {
    const top = textureCanvas(B_FACE_TEX[id * 6 + 2]);
    const left = textureCanvas(B_FACE_TEX[id * 6 + 4]);
    const right = textureCanvas(B_FACE_TEX[id * 6 + 0]);
    const face = (tex: HTMLCanvasElement, a: number, b: number, cc: number, d: number, e: number, f: number, dark: number) => {
      ctx.setTransform(a * k, b * k, cc * k, d * k, e, f);
      ctx.drawImage(tex, 0, 0);
      if (dark > 0) { ctx.fillStyle = `rgba(0,0,0,${dark})`; ctx.fillRect(0, 0, TEX, TEX); }
    };
    face(top, 20, -10, 20, 10, 4, 14, 0);
    face(left, 20, 10, 0, 22, 4, 14, 0.18);
    face(right, 20, -10, 0, 22, 24, 24, 0.36);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  } else {
    ctx.drawImage(textureCanvas(B_FACE_TEX[id * 6]), 4, 4, S - 8, S - 8);
  }
  const url = c.toDataURL();
  cache.set(id, url);
  return url;
}
