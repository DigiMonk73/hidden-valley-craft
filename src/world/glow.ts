// Which blocks have a glow round them (docs/PHASE9A.md, 3): every lamp and every fire. Plain data, shared by the
// mesher (which finds them in a chunk, in a worker) and the renderer (which draws a soft light at each).

import { BLOCK_DEFS, B_BOXES, B_BOX_GLOW } from './blocks.ts';

export interface GlowDef {
  /** Where the light sits in the block (0–1 each way): the middle of its lit parts. */
  x: number; y: number; z: number;
  /** Its colour, 0–1. */
  r: number; g: number; b: number;
  /** How far the glow reaches from its middle, in metres. */
  size: number;
  /** A fire: it flickers. */
  fire: boolean;
  /** A whole lit block set in a wall (the tunnel's sealed lamps): its glow sits at whichever face is open. */
  inWall: boolean;
}

const WARM = '#ffc47a', FIRE = '#ff9a48', EMBER = '#ff7a34', WHITE = '#e4ecff';
/** By a block's base name: colour, reach, and whether it is a fire. */
const KINDS: Record<string, [string, number, boolean?]> = {
  lantern: [WARM, 1.15], storm_lantern: [WARM, 1.05], wall_lamp: [WARM, 1.0], dropped_lamp: [WARM, 0.9], sealed_lamp: ['#ffd08a', 1.1],
  table_lamp: ['#ffd9a0', 0.9], desk_lamp: ['#c4ecb4', 0.7], candlestick: ['#ffcf80', 0.6, true],
  street_light: ['#ffe2b0', 1.8], searchlight: [WHITE, 2.2], arc_lamp: [WHITE, 2.0], red_beacon: ['#ff4030', 1.4], pharmacy_sign: ['#70e890', 0.9],
  fireplace: [FIRE, 1.5, true], hearth_fire: [FIRE, 1.5, true], hearth_flames: [FIRE, 1.3, true], ember_bed: [EMBER, 1.1, true], oil_drum_fire: [FIRE, 1.6, true],
  stove: [EMBER, 0.8, true], range_firebox: [EMBER, 0.8, true], smelter: [EMBER, 0.9, true], kiln: [EMBER, 0.8, true], forge: [EMBER, 0.9, true],
  raider_forge: [EMBER, 0.9, true], crucible_furnace: [EMBER, 0.9, true],
  // Zone-4's sump (docs/PHASE9A.md, 8): the black sludge gives off a sick green light of its own, dim by day and
  // plain at dusk. It lights nothing (the block emits no light): it is a warning, like the signs round it.
  // (Dim on purpose: a pond is some 150 blocks and nine glows overlap at any point of it; the first picture was neon.)
  sludge: ['#111e06', 1.5],
};

/** The glow of each block, by id; undefined for a block with none. */
export const GLOW_OF: (GlowDef | undefined)[] = BLOCK_DEFS.map((d, id) => {
  const kind = KINDS[d.base ?? d.name];
  if (!kind) return undefined;
  const [hex, size, fire] = kind;
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  // The middle of the block's lit boxes (a lantern's shade, a fire's flames); of all its boxes if none is marked lit.
  const boxes = B_BOXES[id], lit = B_BOX_GLOW[id];
  let x = 0.5, y = 0.5, z = 0.5;
  if (boxes?.length) {
    const use = boxes.filter((_, b) => lit?.[b]);
    const of = use.length ? use : boxes;
    x = y = z = 0;
    for (const b of of) { x += (b[0] + b[3]) / 32; y += (b[1] + b[4]) / 32; z += (b[2] + b[5]) / 32; }
    x /= of.length; y /= of.length; z /= of.length;
  }
  return { x, y, z, r: c[0], g: c[1], b: c[2], size, fire: !!fire, inWall: d.render === 'cube' };
});

/** Numbers per glow in a chunk's list: x, y, z (in the chunk), the block's id, the sky's light there (0–15). */
export const GLOW_STRIDE = 5;
