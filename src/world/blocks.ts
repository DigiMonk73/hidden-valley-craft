import data from '../../data/blocks.json' with { type: 'json' };

// Compiles data/blocks.json into flat typed tables indexed by block id, so the mesher,
// lighting and physics read properties without object lookups in their hot loops.

export type RenderType = 'none' | 'cube' | 'cross' | 'liquid' | 'model';
export type Layer = 'opaque' | 'cutout' | 'translucent';

type Tex = string | { top: string; side: string; bottom: string; front?: string };
/** A box inside the block, in sixteenths: [x0, y0, z0, x1, y1, z1]. */
export type Box = [number, number, number, number, number, number];

interface BlockSource {
  name: string;
  label: string;
  tex?: Tex;
  render: RenderType;
  layer: Layer;
  solid: boolean;
  opaque: boolean;
  emit?: number;
  filter?: number;
  hardness: number;
  drop?: string; // a block or item name
  boxes?: Box[]; // for render "model"
  facing?: boolean; // placed facing the player: expands into four blocks (name, name@east, @south, @west)
  collideTop?: number; // collision height in sixteenths if not the boxes' own (a railing is 32: no jumping or stepping over)
  crop?: { kind: string; stage: number }; // a crop at a growth stage (the last stage is ripe)
}

export interface BlockDef extends BlockSource {
  /** For a facing block: the name of its north-facing form, which is also what it drops. */
  base?: string;
  /** 0 north (−z), 1 east, 2 south, 3 west. */
  facingIndex?: number;
}

const FACINGS = ['', '@east', '@south', '@west'];

/** Turns a box a quarter turn clockwise (seen from above) k times about the block's centre. */
function turnBox(b: Box, k: number): Box {
  let [x0, y0, z0, x1, y1, z1] = b;
  for (let i = 0; i < k; i++) [x0, z0, x1, z1] = [16 - z1, x0, 16 - z0, x1];
  return [x0, y0, z0, x1, y1, z1];
}

// Facing blocks become four blocks, one per direction; everything else is as written.
const defs: BlockDef[] = [];
for (const src of data.blocks as BlockSource[]) {
  if (!src.facing) { defs.push(src); continue; }
  FACINGS.forEach((suffix, k) => defs.push({
    ...src, name: src.name + suffix, base: src.name, facingIndex: k,
    boxes: src.boxes?.map((b) => turnBox(b, k)),
    drop: src.drop ?? src.name,
  }));
}

export const BLOCK_COUNT = defs.length;
export const BLOCK_DEFS: readonly BlockDef[] = defs;

/** Face order used everywhere: +x east, -x west, +y top, -y bottom, +z south, -z north. */
export const FACE_DIRS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

export const RENDER = { none: 0, cube: 1, cross: 2, liquid: 3, model: 4 } as const;
export const LAYER = { opaque: 0, cutout: 1, translucent: 2 } as const;

export const B_OPAQUE = new Uint8Array(BLOCK_COUNT);
export const B_SOLID = new Uint8Array(BLOCK_COUNT);
export const B_RENDER = new Uint8Array(BLOCK_COUNT);
export const B_LAYER = new Uint8Array(BLOCK_COUNT);
export const B_EMIT = new Uint8Array(BLOCK_COUNT);
export const B_FILTER = new Uint8Array(BLOCK_COUNT);
export const B_HARDNESS = new Float32Array(BLOCK_COUNT);
/** Texture layer for each block face: index = id * 6 + face. */
export const B_FACE_TEX = new Uint16Array(BLOCK_COUNT * 6);
/** Boxes of a model block, in sixteenths (undefined for other blocks). */
export const B_BOXES: (Box[] | undefined)[] = new Array(BLOCK_COUNT);
/** Height a solid block stops the player at, in sixteenths (16 = a full block; slabs are 8). */
export const B_TOP = new Uint8Array(BLOCK_COUNT);

/** Every texture name the blocks use, in a stable order; its index is the texture-array layer. */
export const TEXTURE_NAMES: string[] = [];
const texIndex = new Map<string, number>();
function texLayer(name: string): number {
  let i = texIndex.get(name);
  if (i === undefined) {
    i = TEXTURE_NAMES.length;
    TEXTURE_NAMES.push(name);
    texIndex.set(name, i);
  }
  return i;
}

const idByName = new Map<string, number>();
// The face a block's front looks out of, by facing: north −z (5), east +x (0), south +z (4), west −x (1).
const FRONT_FACE = [5, 0, 4, 1];

defs.forEach((d, id) => {
  idByName.set(d.name, id);
  B_OPAQUE[id] = d.opaque ? 1 : 0;
  B_SOLID[id] = d.solid ? 1 : 0;
  B_RENDER[id] = RENDER[d.render];
  B_LAYER[id] = LAYER[d.layer];
  B_EMIT[id] = d.emit ?? 0;
  B_FILTER[id] = d.filter ?? 0;
  B_HARDNESS[id] = d.hardness;
  B_BOXES[id] = d.boxes;
  B_TOP[id] = d.collideTop ?? (d.boxes && d.solid ? Math.max(...d.boxes.map((b) => b[4])) : 16);
  if (d.tex) {
    const t = typeof d.tex === 'string' ? { top: d.tex, side: d.tex, bottom: d.tex } : d.tex;
    const side = texLayer(t.side);
    const top = texLayer(t.top);
    const bottom = texLayer(t.bottom);
    const faces = [side, side, top, bottom, side, side];
    if (t.front) faces[FRONT_FACE[d.facingIndex ?? 0]] = texLayer(t.front);
    for (let f = 0; f < 6; f++) B_FACE_TEX[id * 6 + f] = faces[f];
  }
});

/** The form of a facing block that faces back toward a player looking along `yaw` (0 = north). */
export function facingVariant(id: number, yaw: number): number {
  const d = defs[id];
  if (!d?.base) return id;
  // The player looks one way; the block's front should look back at them.
  const look = ((Math.round(-yaw / (Math.PI / 2)) % 4) + 4) % 4; // 0 north, 1 east, 2 south, 3 west
  const front = (look + 2) % 4;
  return idByName.get(d.base + FACINGS[front]) ?? id;
}

export function blockId(name: string): number {
  const id = idByName.get(name);
  if (id === undefined) throw new Error(`unknown block "${name}"`);
  return id;
}

export function blockName(id: number): string {
  return defs[id]?.name ?? 'air';
}

// Frequently used ids, resolved once.
export const AIR = 0;
export const BEDROCK = blockId('bedrock');
export const WATER = blockId('water');
export const FALLING_WATER = blockId('falling_water');

/** Water of either kind: what the player swims in. */
export function isWaterId(id: number): boolean { return id === WATER || id === FALLING_WATER; }
