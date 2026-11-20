// Builds the geometry of one chunk from a padded copy of its blocks and light (the chunk plus a
// one-block border). Pure: runs in workers. Every visible face gets per-corner ambient occlusion
// and smooth light, which is why faces are not merged (merging would flatten both).

import { CS, PS, PADDED_VOLUME, paddedIndex } from '../world/constants.ts';
import { B_OPAQUE, B_RENDER, B_LAYER, B_FACE_TEX, B_FILTER, B_BOXES, B_BOX_TEX, B_BOX_GLOW, BOX_FLAME, RENDER, LAYER, FALLING_WATER, BLOCK_DEFS } from '../world/blocks.ts';
import { GLOW_OF } from '../world/glow.ts';

export interface MeshPart {
  quads: number;
  positions: Float32Array; // 3 per vertex, chunk-local
  pack: Uint8Array; // 4 per vertex: flags, ao, sky×16, block×16
  layers: Uint16Array; // 1 per vertex: texture-array layer
  uvs: Uint8Array; // 2 per vertex: texture u, v in sixteenths (0–16; v counts up from the bottom)
}

export interface ChunkMesh {
  solid: MeshPart; // opaque and cut-out blocks and plants
  water: MeshPart; // translucent water
  /** The chunk's lamps and fires, for the glow drawn round each (src/world/glow.ts): GLOW_STRIDE numbers apiece. */
  glows: Float32Array;
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
const FLAG_FLOW = 1 << 7; // falling water: its texture scrolls downward
const FLAG_GLOW = 7; // in the face bits: lit from within (a lamp's shade, coals, a flame)

/** Thin things that are let go far off (a vine on a cliff): the shader reads the mark from the shading byte's third bit. */
const THIN = new Uint8Array(B_OPAQUE.length);
BLOCK_DEFS.forEach((d, id) => { if ((d.base ?? d.name) === 'vine') THIN[id] = 4; });

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
  uvs = new Uint8Array(4096 * 8);

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
    this.uvs = grow(this.uvs, this.uvs.length * 2);
  }

  vertex(q: number, k: number, x: number, y: number, z: number, flags: number, ao: number, sky: number, blk: number, layer: number, u = -1, w = -1): void {
    const v = q * 4 + k;
    // Texture position: given in sixteenths for model boxes, else the quad's corner (0 or 16).
    const c = (flags >> 3) & 3;
    this.uvs[v * 2] = u >= 0 ? u : c === 1 || c === 2 ? 16 : 0;
    this.uvs[v * 2 + 1] = w >= 0 ? w : c >= 2 ? 16 : 0;
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
      uvs: this.uvs.slice(0, n * 8),
    };
  }
}

/**
 * blocks and light are PS³ (34³) arrays: index paddedIndex(x+1, y+1, z+1) is chunk cell (x, y, z).
 * Positions in the output are relative to the chunk's corner.
 */
export function meshChunk(blocks: Uint16Array, sourceLight: Uint8Array): ChunkMesh {
  if (blocks.length !== PADDED_VOLUME) throw new Error('meshChunk expects a padded chunk');
  const light = lightForDrawing(blocks, sourceLight);
  const solid = new PartBuilder();
  const water = new PartBuilder();
  const glows: number[] = [];

  for (let y = 0; y < CS; y++)
    for (let z = 0; z < CS; z++)
      for (let x = 0; x < CS; x++) {
        const pi = paddedIndex(x + 1, y + 1, z + 1);
        const id = blocks[pi];
        const render = B_RENDER[id];
        if (render === RENDER.none) continue;
        const glow = GLOW_OF[id];
        if (glow) addGlow(glows, blocks, light, pi, x, y, z, id);

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

        if (render === RENDER.model) {
          meshModel(solid, blocks, light, id, x, y, z, pi);
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
          // Leaves against leaves and water against water draw no face between them, except one case:
          // full-height water (something above it) beside lowered water (open air above) shows the
          // strip between the two surfaces, or a see-through slit would open under the block's edge.
          let fromY = 0;
          const sameKind = nid === id || (isWater && B_RENDER[nid] === RENDER.liquid);
          if (sameKind && B_LAYER[id] !== LAYER.opaque) {
            const sideStep = isWater && f !== 2 && f !== 3 && !openAbove && B_RENDER[blocks[ni + PS * PS]] === RENDER.none;
            if (!sideStep) continue;
            fromY = 0.875;
          }
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
            else if (fromY > 0) py = y + fromY;
            const flags = f | (k << 3) | waveFlag | (isWater ? FLAG_LIQUID : 0) | (id === FALLING_WATER && f !== 2 && f !== 3 ? FLAG_FLOW : 0);
            part.vertex(q, j, px, py, pz, flags, aos[k], skies[k], blks[k], layer);
          }
          part.quads++;
        }
      }

  return { solid: solid.finish(), water: water.finish(), glows: new Float32Array(glows) };
}

/**
 * A lamp or a fire in the chunk: where its glow sits, and how much of the sky's light reaches it (a lamp in
 * daylight glows faintly). A lit block set whole into a wall puts its glow at the faces left open, so it is
 * not seen through the rock from behind; one walled in on every side has none.
 */
function addGlow(out: number[], blocks: Uint16Array, light: Uint8Array, pi: number, x: number, y: number, z: number, id: number): void {
  const g = GLOW_OF[id]!;
  let gx = g.x, gy = g.y, gz = g.z, sky = light[pi] >> 4;
  if (g.inWall) {
    let ox = 0, oy = 0, oz = 0, open = 0;
    for (const n of FACE_NORMALS) {
      const ni = pi + n[0] * AXIS_STRIDE[0] + n[1] * AXIS_STRIDE[1] + n[2] * AXIS_STRIDE[2];
      if (B_OPAQUE[blocks[ni]]) continue;
      open++; ox += n[0]; oy += n[1]; oz += n[2];
      sky = Math.max(sky, light[ni] >> 4);
    }
    if (!open) return;
    const len = Math.hypot(ox, oy, oz);
    // A little out in front of the open face, so the wall does not cut the glow in half.
    if (len > 0) { gx += (ox / len) * 0.72; gy += (oy / len) * 0.72; gz += (oz / len) * 0.72; }
  }
  out.push(x + gx, y + gy, z + gz, id, sky);
}

/**
 * Slabs, stairs and pipes keep sunlight out of their own cell (so it can't pour down a chimney or
 * through a slab roof), which leaves that cell dark. Drawn as it is, the slab's faces and the faces
 * beside it would turn black. For drawing only, each such cell takes the light it would have from its
 * open neighbours: full sun from straight above, one level less from the sides and below.
 */
export function lightForDrawing(blocks: Uint16Array, light: Uint8Array): Uint8Array {
  let out: Uint8Array | null = null;
  const up = PS * PS;
  // Every cell of the padded chunk, its one-block border too: a slab just across a chunk's edge is read by the
  // faces beside it on this side, and left dark it put a dark fringe on them (docs/REVIEW.md, N5j). A border
  // cell is lit from those of its neighbours that the padded chunk holds.
  for (let y = 0; y < PS; y++)
    for (let z = 0; z < PS; z++)
      for (let x = 0; x < PS; x++) {
        const i = paddedIndex(x, y, z);
        const id = blocks[i];
        if (B_OPAQUE[id] || B_FILTER[id] < 15) continue;
        out ??= light.slice();
        let sky = 0, blk = 0;
        const edge = x === 0 || y === 0 || z === 0 || x === PS - 1 || y === PS - 1 || z === PS - 1;
        for (const d of [up, -up, 1, -1, PS, -PS]) {
          if (edge && ((d === up && y === PS - 1) || (d === -up && y === 0) || (d === 1 && x === PS - 1) || (d === -1 && x === 0) || (d === PS && z === PS - 1) || (d === -PS && z === 0))) continue;
          const n = i + d;
          if (B_OPAQUE[blocks[n]] || B_FILTER[blocks[n]] >= 15) continue;
          const lv = light[n];
          sky = Math.max(sky, d === up ? lv >> 4 : (lv >> 4) - 1);
          blk = Math.max(blk, (lv & 15) - 1);
        }
        out[i] = (Math.max(sky, light[i] >> 4) << 4) | Math.max(blk, light[i] & 15);
      }
  return out ?? light;
}

/**
 * A block made of boxes (furniture, slabs, stairs, railings): every face of every box, textured by
 * where it sits in the block, lit by the light of the cell it faces. Faces on the block's edge are
 * dropped when an opaque block covers them.
 */
function meshModel(part: PartBuilder, blocks: Uint16Array, light: Uint8Array, id: number, x: number, y: number, z: number, pi: number): void {
  const boxes = B_BOXES[id]!;
  const boxTex = B_BOX_TEX[id]!, boxGlow = B_BOX_GLOW[id]!;
  for (let b = 0; b < boxes.length; b++) {
    const [x0, y0, z0, x1, y1, z1] = boxes[b];
    const lo = [x0 / 16, y0 / 16, z0 / 16], hi = [x1 / 16, y1 / 16, z1 / 16];
    // A glowing box (a lamp's shade, a flame) is drawn by its own light: the shader reads face 7 as "lit from within",
    // and a flame wavers.
    const glow = boxGlow[b];
    for (let f = 0; f < 6; f++) {
      const n = FACE_NORMALS[f];
      const axis = n[0] !== 0 ? 0 : n[1] !== 0 ? 1 : 2;
      // A box with no thickness one way is a sheet: only its two broad faces are drawn.
      const a1 = (axis + 1) % 3, a2 = (axis + 2) % 3;
      if (lo[a1] === hi[a1] || lo[a2] === hi[a2]) continue;
      const onEdge = n[axis] > 0 ? hi[axis] === 1 : lo[axis] === 0;
      const ni = pi + n[0] * AXIS_STRIDE[0] + n[1] * AXIS_STRIDE[1] + n[2] * AXIS_STRIDE[2];
      if (onEdge && B_OPAQUE[blocks[ni]]) continue;
      // Light from the cell the face looks toward, or the block's own cell, whichever is brighter
      // (a slab or pipe holds sunlight out of its own cell, so its faces take their light from outside).
      const own = light[pi], out = B_OPAQUE[blocks[ni]] ? 0 : light[ni];
      const sky = Math.max(own >> 4, out >> 4) * 16, blk = Math.max(own & 15, out & 15) * 16;
      const layer = boxTex[b * 6 + f];
      const cs = FACE_CORNERS[f];
      part.ensure();
      const q = part.quads++;
      const flags = glow ? FLAG_GLOW | (glow === BOX_FLAME ? FLAG_WAVE : 0) : f;
      for (let k = 0; k < 4; k++) {
        const p = [0, 1, 2].map((ax) => (cs[k * 3 + ax] ? hi[ax] : lo[ax]));
        // Texture coordinates from where the corner sits in the block, matching how whole cubes are textured.
        const [px, py, pz] = p;
        const [uu, vv] = f === 0 ? [1 - pz, py] : f === 1 ? [pz, py] : f === 2 ? [px, 1 - pz] : f === 3 ? [1 - px, 1 - pz] : f === 4 ? [px, py] : [1 - px, py];
        const u = Math.round(uu * 16), v = Math.round(vv * 16);
        part.vertex(q, k, x + p[0], y + p[1], z + p[2], flags | (k << 3), 3 | THIN[id], sky, blk, layer, u, v);
      }
    }
  }
}
