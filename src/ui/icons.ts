// Item icons for the hotbar, drawn from the block textures: a small three-sided cube for blocks,
// the flat picture for plants.

import { B_FACE_TEX, B_RENDER, RENDER, TEXTURE_NAMES } from '../world/blocks.ts';
import { drawTexture, TEX } from '../render/textures.ts';
import { drawItemIcon } from '../render/itemIcons.ts';
import { itemDef } from '../world/items.ts';
import { cpuCanvas } from '../platform/canvas.ts';
import { modelIconPixels } from './modelIcon.ts';

const cache = new Map<number, string>();

function pixelCanvas(px: Uint8ClampedArray): HTMLCanvasElement {
  const { canvas: c, ctx } = cpuCanvas(TEX, TEX);
  const img = ctx.createImageData(TEX, TEX);
  img.data.set(px);
  ctx.putImageData(img, 0, 0);
  return c;
}

function textureCanvas(layer: number): HTMLCanvasElement { return pixelCanvas(drawTexture(TEXTURE_NAMES[layer])); }

export function iconFor(id: number): string {
  const hit = cache.get(id);
  if (hit) return hit;
  const S = 48;
  const { canvas: c, ctx } = cpuCanvas(S, S);
  ctx.imageSmoothingEnabled = false;
  const k = 1 / TEX;
  const item = itemDef(id);
  if (item) ctx.drawImage(pixelCanvas(drawItemIcon(item.icon)), 4, 4, S - 8, S - 8);
  else if (B_RENDER[id] === RENDER.cube || B_RENDER[id] === RENDER.liquid) {
    const top = textureCanvas(B_FACE_TEX[id * 6 + 2]);
    const left = textureCanvas(B_FACE_TEX[id * 6 + 5]); // the north face: a block with a front (a fridge, a safe) shows it
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
  } else if (B_RENDER[id] === RENDER.model) {
    // Furniture: a picture of the piece itself, box by box (src/ui/modelIcon.ts).
    const img = ctx.createImageData(S, S);
    img.data.set(modelIconPixels(id, S));
    ctx.putImageData(img, 0, 0);
  } else {
    ctx.drawImage(textureCanvas(B_FACE_TEX[id * 6]), 4, 4, S - 8, S - 8);
  }
  const url = c.toDataURL();
  cache.set(id, url);
  return url;
}
