import data from '../../data/blocks.json' with { type: 'json' };

// Compiles data/blocks.json into flat typed tables indexed by block id, so the mesher,
// lighting and physics read properties without object lookups in their hot loops.

export type RenderType = 'none' | 'cube' | 'cross' | 'liquid';
export type Layer = 'opaque' | 'cutout' | 'translucent';

interface BlockDef {
  name: string;
  label: string;
  tex?: string | { top: string; side: string; bottom: string };
  render: RenderType;
  layer: Layer;
  solid: boolean;
  opaque: boolean;
  emit?: number;
  filter?: number;
  hardness: number;
  drop?: string;
}

const defs = data.blocks as BlockDef[];

export const BLOCK_COUNT = defs.length;
export const BLOCK_DEFS: readonly BlockDef[] = defs;

/** Face order used everywhere: +x east, -x west, +y top, -y bottom, +z south, -z north. */
export const FACE_DIRS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

export const RENDER = { none: 0, cube: 1, cross: 2, liquid: 3 } as const;
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

defs.forEach((d, id) => {
  idByName.set(d.name, id);
  B_OPAQUE[id] = d.opaque ? 1 : 0;
  B_SOLID[id] = d.solid ? 1 : 0;
  B_RENDER[id] = RENDER[d.render];
  B_LAYER[id] = LAYER[d.layer];
  B_EMIT[id] = d.emit ?? 0;
  B_FILTER[id] = d.filter ?? 0;
  B_HARDNESS[id] = d.hardness;
  if (d.tex) {
    const t = typeof d.tex === 'string' ? { top: d.tex, side: d.tex, bottom: d.tex } : d.tex;
    const side = texLayer(t.side);
    const top = texLayer(t.top);
    const bottom = texLayer(t.bottom);
    const faces = [side, side, top, bottom, side, side];
    for (let f = 0; f < 6; f++) B_FACE_TEX[id * 6 + f] = faces[f];
  }
});

export function blockId(name: string): number {
  const id = idByName.get(name);
  if (id === undefined) throw new Error(`unknown block "${name}"`);
  return id;
}

export function blockName(id: number): string {
  return defs[id]?.name ?? 'air';
}

/** What mining a block gives: its "drop" if set, else the block itself; nothing for unbreakables. */
export function blockDrop(id: number): number {
  const d = defs[id];
  if (!d || d.hardness < 0 || d.render === 'none') return 0;
  return d.drop ? blockId(d.drop) : id;
}

// Frequently used ids, resolved once.
export const AIR = 0;
export const BEDROCK = blockId('bedrock');
export const WATER = blockId('water');
