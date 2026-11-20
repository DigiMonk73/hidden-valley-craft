// The satellite antenna once it is hoisted (docs/PHASE8.md, 5): a short steel mast on the cliff's edge above
// the cave's mouth and a dish seven across, turned to the western sky, seen from the garden and the pool. Pure:
// the blocks to set, given the block the mast stands on. The game sets them as edits, so they are saved.

/** [x, y, z, block name] for every block of the antenna; `x, y, z` is the first block of the mast, on the rock. West is −x. */
export function antennaBlocks(x: number, y: number, z: number): [number, number, number, string][] {
  const out: [number, number, number, string][] = [];
  for (let k = 0; k < MAST; k++) out.push([x, y + k, z, 'tower_steel']);
  // The dish: a bowl seven across in the plane along the cliff's edge, white against the rock, its rim two
  // blocks nearer the valley than its middle. (Five across, and grey, it was lost against the limestone from the garden.)
  const cy = y + MAST + 2;
  for (let dy = -3; dy <= 3; dy++) for (let dz = -3; dz <= 3; dz++) {
    const d2 = dy * dy + dz * dz;
    if (d2 > 10) continue;
    out.push([x - (d2 >= 9 ? 2 : d2 >= 2 ? 1 : 0), cy + dy, z + dz, 'sat_dish']);
  }
  // The feed, out in front of the bowl on its arm, and a red light on it.
  out.push([x - 1, cy, z, 'tower_steel'], [x - 2, cy, z, 'tower_steel'], [x - 3, cy, z, 'tower_steel'], [x - 4, cy, z, 'red_beacon']);
  return out;
}

/** The mast's height under the dish's rim. */
const MAST = 4;
/** How high the antenna stands over the block its mast is set on. */
export const ANTENNA_HEIGHT = MAST + 6;

/**
 * The block the mast's foot stands in: on the cliff's edge above the cave's mouth, the first column from the
 * valley side whose rock stands above the overhang. `solidAt` reads the world; null if the land is not loaded
 * or the cliff has been dug away.
 */
export function antennaSpot(mast: { z: number; x0: number; x1: number; above: number }, solidAt: (x: number, y: number, z: number) => boolean | null): [number, number, number] | null {
  for (let x = mast.x0; x <= mast.x1; x++) {
    for (let y = mast.above + 30; y >= mast.above; y--) {
      const s = solidAt(x, y, mast.z);
      if (s === null) return null;
      if (s) return [x, y + 1, mast.z];
    }
  }
  return null;
}
