// The whole world as a coarse block landscape (8 m cells) for drawing beyond the loaded chunks:
// forest as a dark canopy, steep ground as bare rock, the valley floor as grass, water as water.
// Pure: built in a worker from the same layout the terrain comes from.

import { WORLD_X, WORLD_Z } from '../world/constants.ts';
import { VALLEY, POOL, CANYON_POOL, SPRINGS, inCanyonStream, surfaceHeight, landZoneAt, distToValley, creekDistance, inReservoir, ZONE3, ZONE4, type ZoneId } from './layout.ts';
import { blockId, B_FACE_TEX } from '../world/blocks.ts';

const tex = (name: string, face: number) => B_FACE_TEX[blockId(name) * 6 + face];
/** Texture layers for each kind of distant cell: [top, side]. */
const LAYERS = {
  canopy: [tex('leaves', 2), tex('leaves', 0)], grass: [tex('grass', 2), tex('grass', 0)],
  rock: [tex('limestone', 2), tex('limestone', 0)], water: [tex('water', 2), tex('water', 0)],
  // Zone-4 under the fallout (docs/PHASE8.md): grey dead ground, no canopy.
  dead: [tex('dead_soil', 2), tex('dead_soil', 0)],
  // Open forest floor: the treeless band round the valley's rim, the canyon's sides (docs/PHASE9A.md, 4).
  floor: [tex('forest_floor', 2), tex('limestone', 0)],
};
/** Each kind's number, carried to the shader with the face (face + 4 × kind): rock gets strata and moss, canopy its crowns. */
export const FAR_KINDS: (keyof typeof LAYERS)[] = ['canopy', 'grass', 'rock', 'water', 'dead', 'floor'];

export const FAR_CELL = 8;

export interface FarMesh {
  positions: Float32Array; // x, y, z per vertex
  colors: Uint8Array; // r, g, b tint (128 = as drawn), face shade per vertex
  mats: Uint16Array; // texture layer, and face (0 top, 1 east/west, 2 north/south) + 4 × kind (FAR_KINDS), per vertex
  index: Uint32Array;
}

type RGB = [number, number, number];
// Tints over the textures (128 = unchanged): each zone's forest has its own shade.
const CANOPY: Partial<Record<ZoneId, RGB>> = {
  buffer: [128, 128, 128], canyon: [138, 132, 118], near: [150, 140, 112], mid: [118, 120, 112], deep: [96, 104, 108],
  zone2: [156, 146, 116], zone3: [136, 134, 122], zone4: [140, 132, 124],
};
const NEUTRAL: RGB = [128, 128, 128];

export function buildFarLand(): FarMesh {
  const N = WORLD_X / FAR_CELL, M = WORLD_Z / FAR_CELL;
  const h = new Float32Array(N * M);
  const col: RGB[] = new Array(N * M);
  const ground = new Float32Array(N * M);
  const kinds: (keyof typeof LAYERS)[] = new Array(N * M);
  for (let j = 0; j < M; j++)
    for (let i = 0; i < N; i++) {
      const x = i * FAR_CELL + FAR_CELL / 2, z = j * FAR_CELL + FAR_CELL / 2;
      const g = surfaceHeight(x, z);
      ground[j * N + i] = g;
    }
  for (let j = 0; j < M; j++)
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      const x = i * FAR_CELL + FAR_CELL / 2, z = j * FAR_CELL + FAR_CELL / 2;
      const g = ground[k];
      const at = (di: number, dj: number) => ground[Math.min(M - 1, Math.max(0, j + dj)) * N + Math.min(N - 1, Math.max(0, i + di))];
      const slope = Math.max(Math.abs(at(1, 0) - g), Math.abs(at(-1, 0) - g), Math.abs(at(0, 1) - g), Math.abs(at(0, -1) - g));
      const zone = landZoneAt(x, z);
      const inValley = distToValley(x, z) < VALLEY.radius - 6;
      const water = (inValley && (Math.hypot(x - POOL.cx, z - POOL.cz) < POOL.radius || creekDistance(x, z) < 2.5)) ||
        Math.hypot(x - CANYON_POOL.cx, z - CANYON_POOL.cz) < CANYON_POOL.radius || inCanyonStream(x, z, 0.5);
      let c: RGB = NEUTRAL;
      let kind: keyof typeof LAYERS = 'canopy';
      let top = g;
      if (water) { kind = 'water'; top = VALLEY.water + 0.9; }
      else if (inReservoir(x, z)) { kind = 'water'; top = ZONE3.dam.water - 0.1; } // the reservoir behind Zone-3's dam
      else if (slope > 7 || g > 168) kind = 'rock';
      else if (zone === 'zone4' && Math.hypot(x - ZONE4.clean.x, z - ZONE4.clean.z) > ZONE4.clean.r) { kind = 'dead'; c = [106, 108, 114]; } // bare and ashen, so the ridge reads as poisoned from afar
      else if (inValley) { kind = 'grass'; if (((i * 73856093) ^ (j * 19349663)) % 7 === 0) { kind = 'canopy'; top = g + 8; } }
      // No tree grows in the band round the valley's rim (src/gen/terrain.ts, treeSpot): drawn as forest it stood
      // seven metres too tall and dropped when the real rim came in.
      else if (distToValley(x, z) < VALLEY.radius + 22) kind = 'floor';
      // Old farmland and the canyon's sides are open ground with a tree here and there, not a closed canopy.
      else if (zone === 'near' || zone === 'canyon') {
        kind = zone === 'near' ? 'grass' : 'floor';
        if ((((i * 73856093) ^ (j * 19349663)) >>> 0) % (zone === 'near' ? 5 : 6) === 0) { kind = 'canopy'; c = CANOPY[zone] ?? NEUTRAL; top = g + 7; }
      }
      else { c = CANOPY[zone] ?? NEUTRAL; top = g + 7; } // forest canopy stands above the ground
      // Sit a little low so nearby real blocks always win where both are drawn.
      h[k] = top - 1.5;
      const v = ((i * 2654435761) ^ (j * 40503)) >>> 0;
      const jit = kind === 'rock' ? 0.7 + ((v % 1000) / 1000) * 0.25 : kind === 'dead' ? 0.78 + ((v % 1000) / 1000) * 0.3 : 0.92 + ((v % 1000) / 1000) * 0.16; // bare rock reads darker far off
      col[k] = [c[0] * jit, c[1] * jit, c[2] * jit];
      kinds[k] = kind;
    }

  const pos: number[] = [], clr: number[] = [], mat: number[] = [], idx: number[] = [];
  /** A tall bank under forest or grass is drawn as bare rock, in rock's own tone (not the canopy's tint). */
  const ROCK_TINT: RGB = [104, 104, 104];
  const tallRock = (k: number, ny: number) => kinds[k] !== 'rock' && kinds[k] !== 'water' && kinds[k] !== 'dead' && h[k] - ny > (kinds[k] === 'canopy' ? 13 : 5);
  let layer = 0, kindBits = 0;
  const quad = (p: number[][], c: RGB, shade: number, face: number) => {
    const base = pos.length / 3;
    for (const v of p) { pos.push(v[0], v[1], v[2]); clr.push(c[0], c[1], c[2], shade); mat.push(layer, face + kindBits); }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (let j = 0; j < M; j++)
    for (let i = 0; i < N; i++) {
      const k = j * N + i, y = h[k], c = col[k];
      const x0 = i * FAR_CELL, x1 = x0 + FAR_CELL, z0 = j * FAR_CELL, z1 = z0 + FAR_CELL;
      const [topLayer, sideLayer] = LAYERS[kinds[k]];
      kindBits = 4 * FAR_KINDS.indexOf(kinds[k]);
      layer = topLayer;
      quad([[x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0]], c, 255, 0);
      layer = sideLayer;
      // A bank more than a few metres high is a rock face whatever grows on top of it: strata and moss, like the near cliffs.
      const bank = kinds[k] !== 'water' && kinds[k] !== 'dead';
      const sideOf = (ny: number) => { if (bank) { const tall = y - ny > (kinds[k] === 'canopy' ? 13 : 5); kindBits = 4 * FAR_KINDS.indexOf(tall ? 'rock' : kinds[k]); layer = tall ? LAYERS.rock[1] : sideLayer; } };
      // Sides down to each lower neighbour (counter-clockwise from outside).
      const side = (ny: number, pts: number[][], shade: number, face: number) => {
        if (ny >= y) return;
        sideOf(ny);
        quad(pts.map((p) => [p[0], p[1] === 1 ? y : ny, p[2]]), tallRock(k, ny) ? ROCK_TINT : c, shade, face);
      };
      // On a 32 m column edge the neighbour may be hidden (real blocks drawn there instead), so the
      // side always reaches below the ground: otherwise the sky shows under a floating canopy.
      const SKIRT = 4; // cells per column
      const below = ground[k] - 8;
      const nb = (n: number, onEdge: boolean) => (onEdge ? Math.min(n, below) : n);
      if (i < N - 1) side(nb(h[k + 1], i % SKIRT === SKIRT - 1), [[x1, 0, z1], [x1, 0, z0], [x1, 1, z0], [x1, 1, z1]], 184, 1);
      if (i > 0) side(nb(h[k - 1], i % SKIRT === 0), [[x0, 0, z0], [x0, 0, z1], [x0, 1, z1], [x0, 1, z0]], 184, 1);
      if (j < M - 1) side(nb(h[k + N], j % SKIRT === SKIRT - 1), [[x0, 0, z1], [x1, 0, z1], [x1, 1, z1], [x0, 1, z1]], 214, 2);
      if (j > 0) side(nb(h[k - N], j % SKIRT === 0), [[x1, 0, z0], [x0, 0, z0], [x0, 1, z0], [x1, 1, z0]], 214, 2);
    }
  // The two waterfalls (docs/PHASE9A.md, 4): each a white ribbon down its cliff, standing just clear of the coarse
  // rock, so the valley's landmark is there before its real blocks are, and from beyond the view distance.
  kindBits = 4 * FAR_KINDS.indexOf('water');
  layer = tex('falling_water', 0);
  for (const f of SPRINGS) {
    // Out to the next 8 m line in front of the face (the coarse rock ends on one), and a little beyond.
    const x = f.dir > 0 ? Math.ceil((f.x + 1) / FAR_CELL) * FAR_CELL + 0.4 : Math.floor(f.x / FAR_CELL) * FAR_CELL - 0.4;
    const y0 = VALLEY.water, y1 = f.top + 1, z0 = f.z0, z1 = f.z1 + 1, back = x - f.dir * 1.2;
    const white: RGB = [150, 156, 160];
    quad(f.dir > 0 ? [[x, y0, z1], [x, y0, z0], [x, y1, z0], [x, y1, z1]] : [[x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0]], white, 235, 1);
    quad([[back, y0, z1], [x, y0, z1], [x, y1, z1], [back, y1, z1]], white, 200, 2);
    quad([[x, y0, z0], [back, y0, z0], [back, y1, z0], [x, y1, z0]], white, 200, 2);
  }
  return { positions: new Float32Array(pos), colors: new Uint8Array(clr), mats: new Uint16Array(mat), index: new Uint32Array(idx) };
}
