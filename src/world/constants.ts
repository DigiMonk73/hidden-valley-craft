// World dimensions. 1 block = 1 metre. x runs west→east, z north→south, y up.
export const CS = 32; // chunk size on every axis
export const CS_BITS = 5;
export const CS_MASK = CS - 1;
export const CHUNK_VOLUME = CS * CS * CS;

export const WORLD_X = 2048;
export const WORLD_Z = 2048;
export const WORLD_Y = 192;
export const COLS_X = WORLD_X / CS; // 64
export const COLS_Z = WORLD_Z / CS; // 64
export const CHUNKS_Y = WORLD_Y / CS; // 6

/** Index of a block inside its chunk: y-major so a vertical run is a stride of 1024. */
export function chunkIndex(lx: number, ly: number, lz: number): number {
  return (ly << 10) | (lz << 5) | lx;
}

export function columnKey(cx: number, cz: number): number {
  return cz * COLS_X + cx;
}

export function chunkKey(cx: number, cy: number, cz: number): number {
  return (cz * COLS_X + cx) * CHUNKS_Y + cy;
}

export function inWorldXZ(x: number, z: number): boolean {
  return x >= 0 && z >= 0 && x < WORLD_X && z < WORLD_Z;
}

/** Padded chunk used by the mesher: the chunk plus a one-block border on every side. */
export const PS = CS + 2; // 34
export const PADDED_VOLUME = PS * PS * PS;
export function paddedIndex(px: number, py: number, pz: number): number {
  return (py * PS + pz) * PS + px;
}
