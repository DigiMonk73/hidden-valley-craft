// Builds the geometry of one chunk from a padded copy of its blocks and light (the chunk plus a
// one-block border). Pure: runs in workers. Every visible face gets per-corner ambient occlusion
// and smooth light, which is why faces are not merged (merging would flatten both).

import { CS, PS, PADDED_VOLUME, paddedIndex } from '../world/constants.ts';
import { B_OPAQUE, B_RENDER, B_LAYER, B_FACE_TEX, B_FILTER, RENDER, LAYER } from '../world/blocks.ts';

export interface MeshPart {
  quads: number;
  positions: Float32Array; // 3 per vertex, chunk-local
  pack: Uint8Array; // 4 per vertex: flags, ao, sky×16, block×16
  layers: Uint16Array; // 1 per vertex: texture-array layer
}

export interface ChunkMesh {
  solid: MeshPart; // opaque and cut-out blocks and plants
  water: MeshPart; // translucent water
}

// Corners of each face, counter-clockwise seen from outside; face order matches FACE_DIRS.
const FACE_CORNERS: number[][] = [
  [1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 1, 1], // +x east
  [0, 0, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0], // -x west
  [0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 0], // +y top
  [1, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0], // -y bottom
  [0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1], // +z south
  [1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0], // -z north
];
const FACE_NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
// The two in-plane axes of each face (0 = x, 1 = y, 2 = z).
const FACE_AXES = [[1, 2], [1, 2], [0, 2], [0, 2], [0, 1], [0, 1]];

/** Index step in the padded array along x, y, z. */
const AXIS_STRIDE = [1, PS * PS, PS];

const FLAG_CROSS = 6;
const FLAG_WAVE = 1 << 5;
const FLAG_LIQUID = 1 << 6;

/** Blocks that darken the corners next to them. */
const AO_OCCLUDER = new Uint8Array(B_OPAQUE.length);
for (let id = 0; id < B_OPAQUE.length; id++) {
  AO_OCCLUDER[id] = B_OPAQUE[id] || (B_RENDER[id] === RENDER.cube && B_LAYER[id] === LAYER.cutout && B_FILTER[id] > 0) ? 1 : 0;
}

class PartBuilder {
  quads = 0;
  positions = new Float32Array(4096 * 12);
  pack = new Uint8Array(4096 * 16);
  layers = new Uint16Array(4096 * 4);

  ensure(): void {
    if ((this.quads + 1) * 12 <= this.positions.length) return;
    const grow = <T extends Float32Array | Uint8Array | Uint16Array>(a: T, n: number): T => {
      const b = new (a.constructor as new (n: number) => T)(n);
      b.set(a);
      return b;
    };
    this.positions = grow(this.positions, this.positions.length * 2);
    this.pack = grow(this.pack, this.pack.length * 2);
    this.layers = grow(this.layers, this.layers.length * 2);
  }

  vertex(q: number, k: number, x: number, y: number, z: number, flags: number, ao: number, sky: number, blk: number, layer: number): void {
    const v = q * 4 + k;
    this.positions[v * 3] = x;
    this.positions[v * 3 + 1] = y;
    this.positions[v * 3 + 2] = z;
    this.pack[v * 4] = flags;
    this.pack[v * 4 + 1] = ao;
    this.pack[v * 4 + 2] = sky;
    this.pack[v * 4 + 3] = blk;
    this.layers[v] = layer;
  }

  finish(): MeshPart {
    const n = this.quads;
    return {
      quads: n,
      positions: this.positions.slice(0, n * 12),
      pack: this.pack.slice(0, n * 16),
      layers: this.layers.slice(0, n * 4),
    };
  }
}

/**
 * blocks and light are PS³ (34³) arrays: index paddedIndex(x+1, y+1, z+1) is chunk cell (x, y, z).
 * Positions in the output are relative to the chunk's corner.
 */
export function meshChunk(blocks: Uint16Array, light: Uint8Array): ChunkMesh {
  if (blocks.length !== PADDED_VOLUME) throw new Error('meshChunk expects a padded chunk');
  const solid = new PartBuilder();
  const water = new PartBuilder();

  for (let y = 0; y < CS; y++)
    for (let z = 0; z < CS; z++)
      for (let x = 0; x < CS; x++) {
        const pi = paddedIndex(x + 1, y + 1, z + 1);
        const id = blocks[pi];
        const render = B_RENDER[id];
        if (render === RENDER.none) continue;

        if (render === RENDER.cross) {
          // Two crossed quads, each emitted both ways round so they show from either side.
          const lv = light[pi];
          const sky = (lv >> 4) * 16, blk = (lv & 15) * 16;
          const layer = B_FACE_TEX[id * 6];
          const quads = [[0.15, 0.15, 0.85, 0.85], [0.85, 0.15, 0.15, 0.85]];
          for (const [ax, az, bx, bz] of quads) {
            for (let side = 0; side < 2; side++) {
              solid.ensure();
              const q = solid.quads++;
              const pts = side === 0
                ? [[ax, 0, az], [bx, 0, bz], [bx, 1, bz], [ax, 1, az]]
                : [[bx, 0, bz], [ax, 0, az], [ax, 1, az], [bx, 1, bz]];
              for (let k = 0; k < 4; k++) {
                const p = pts[k];
                const wave = p[1] > 0 ? FLAG_WAVE : 0;
                solid.vertex(q, k, x + p[0], y + p[1], z + p[2], FLAG_CROSS | (k << 3) | wave, 3, sky, blk, layer);
              }
            }
          }
          continue;
        }

        const isWater = render === RENDER.liquid;
        const part = isWater ? water : solid;
        const waveFlag = B_LAYER[id] === LAYER.cutout && B_FILTER[id] > 0 ? FLAG_WAVE : 0;
        // Water sits a little low only where open air is above it; under anything else it fills its block.
        const openAbove = isWater && B_RENDER[blocks[pi + PS * PS]] === RENDER.none;

        for (let f = 0; f < 6; f++) {
          const n = FACE_NORMALS[f];
          const ni = paddedIndex(x + 1 + n[0], y + 1 + n[1], z + 1 + n[2]);
          const nid = blocks[ni];
          if (B_OPAQUE[nid]) continue;
          if (nid === id && B_LAYER[id] !== LAYER.opaque) continue; // leaves against leaves, water against water
          part.ensure();
          const q = part.quads;
          const [a1, a2] = FACE_AXES[f];
          const cs = FACE_CORNERS[f];
          const layer = B_FACE_TEX[id * 6 + f];
          const aos = [0, 0, 0, 0];
          const skies = [0, 0, 0, 0];
          const blks = [0, 0, 0, 0];

          const nbi = ni;
          const st1 = AXIS_STRIDE[a1], st2 = AXIS_STRIDE[a2];
          for (let k = 0; k < 4; k++) {
            const d1 = cs[k * 3 + a1] * 2 - 1;
            const d2 = cs[k * 3 + a2] * 2 - 1;
            // Cells in the layer in front of the face: straight ahead, the two sides, the diagonal.
            const i1 = nbi + d1 * st1;
            const i2 = nbi + d2 * st2;
            const ic = i1 + d2 * st2;
            const o1 = AO_OCCLUDER[blocks[i1]], o2 = AO_OCCLUDER[blocks[i2]], oc = AO_OCCLUDER[blocks[ic]];
            aos[k] = isWater ? 3 : o1 && o2 ? 0 : 3 - (o1 + o2 + oc);
            // Smooth light: average the open cells around the corner (the cell ahead always counts).
            let lv = light[nbi];
            let sSum = lv >> 4, bSum = lv & 15, cnt = 1;
            if (!B_OPAQUE[blocks[i1]]) { lv = light[i1]; sSum += lv >> 4; bSum += lv & 15; cnt++; }
            if (!B_OPAQUE[blocks[i2]]) { lv = light[i2]; sSum += lv >> 4; bSum += lv & 15; cnt++; }
            if (!B_OPAQUE[blocks[ic]] && !(o1 && o2)) { lv = light[ic]; sSum += lv >> 4; bSum += lv & 15; cnt++; }
            skies[k] = Math.round((sSum / cnt) * 16);
            blks[k] = Math.round((bSum / cnt) * 16);
          }

          // Flip the quad's diagonal when that makes the shading interpolate evenly.
          const start = aos[0] + aos[2] < aos[1] + aos[3] ? 1 : 0;
          const top = openAbove && f !== 3 ? 0.875 : 1;
          for (let j = 0; j < 4; j++) {
            const k = (j + start) & 3;
            const px = x + cs[k * 3];
            let py = y + cs[k * 3 + 1];
            const pz = z + cs[k * 3 + 2];
            if (cs[k * 3 + 1] === 1) py = y + top;
            const flags = f | (k << 3) | waveFlag | (isWater ? FLAG_LIQUID : 0);
            part.vertex(q, j, px, py, pz, flags, aos[k], skies[k], blks[k], layer);
          }
          part.quads++;
        }
      }

  return { solid: solid.finish(), water: water.finish() };
}
