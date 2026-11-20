// The satellite antenna once it is hoisted (docs/PHASE8.md, 5): a short steel mast on the cliff's edge above
// the cave's mouth and a dish five across, turned to the western sky, seen from the garden and the pool. Pure:
// the blocks to set, given the block the mast stands on. The game sets them as edits, so they are saved.

/** [x, y, z, block name] for every block of the antenna; `x, y, z` is the first block of the mast, on the rock. West is −x. */
export function antennaBlocks(x: number, y: number, z: number): [number, number, number, string][] {
  const out: [number, number, number, string][] = [];
  for (let k = 0; k < 4; k++) out.push([x, y + k, z, 'tower_steel']);
  // The dish: a shallow bowl in the plane across the cliff's edge, its rim a block nearer the valley than its middle.
  const cy = y + 5;
  for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) {
    const d2 = dy * dy + dz * dz;
    if (d2 > 5) continue;
    out.push([x - (d2 >= 4 ? 1 : 0), cy + dy, z + dz, 'sat_dish']);
  }
  // The feed, out in front of the bowl on its arm.
  out.push([x - 1, cy, z, 'tower_steel'], [x - 2, cy, z, 'tower_steel'], [x - 3, cy, z, 'red_beacon']);
  return out;
}

/** How high the antenna stands over the block its mast is set on. */
export const ANTENNA_HEIGHT = 8;
