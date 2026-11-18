import { describe, it, expect } from 'vitest';
import { World } from '../src/world/world.ts';
import { runJob, type GenResult } from '../src/jobs/tasks.ts';
import { CS } from '../src/world/constants.ts';
import { B_SOLID } from '../src/world/blocks.ts';
import { leaveLostPack, losesPack, LOST_PACK } from '../src/sim/death.ts';
import { Inventory } from '../src/sim/inventory.ts';
import { itemId } from '../src/world/items.ts';
import { collectContainers, restoreContainers } from '../src/save/save.ts';
import { HOME, VALLEY, PLACES, outsideHeight } from '../src/gen/layout.ts';

function loadAround(x: number, z: number): World {
  const w = new World();
  for (let cz = Math.floor(z / CS) - 1; cz <= Math.floor(z / CS) + 1; cz++)
    for (let cx = Math.floor(x / CS) - 1; cx <= Math.floor(x / CS) + 1; cx++)
      w.addColumn(cx, cz, (runJob({ kind: 'gen', cx, cz, edits: [] }).result as GenResult).chunks);
  return w;
}

function kit(): Inventory {
  const inv = Inventory.starter();
  inv.grow(45);
  inv.add(itemId('venison_raw'), 3);
  inv.add(itemId('arrow'), 17);
  inv.slots[40] = { id: itemId('hunting_knife'), count: 1, wear: 12 };
  return inv;
}

describe('death outside', () => {
  const s = PLACES.rangerSign;
  const x = s.x - 6, z = s.z - 4; // on the road near the sign
  const w = loadAround(x, z);
  const y = outsideHeight(x, z);

  it('costs what you carry only outside the valley', () => {
    expect(losesPack(HOME.wallX - 3, 1024)).toBe(false);
    expect(losesPack(VALLEY.cx, VALLEY.cz)).toBe(false);
    expect(losesPack(x, z)).toBe(true);
  });

  it('leaves a lost pack where you fell, holding exactly what was carried', () => {
    const inv = kit();
    const carried = inv.slots.map((st) => (st ? { ...st } : null));
    const at = leaveLostPack(w, inv, x + 0.5, y + 0.2, z + 0.5)!;
    expect(at).not.toBeNull();
    expect(Math.hypot(at[0] - x, at[1] - y, at[2] - z)).toBeLessThan(2);
    expect(w.blockAt(...at)).toBe(LOST_PACK);
    expect(B_SOLID[w.blockAt(at[0], at[1] - 1, at[2])]).toBe(1); // resting on the ground
    expect(w.containerAt(...at)).toEqual(carried);
    expect(inv.slots.every((st) => !st)).toBe(true);
    expect(inv.size).toBe(45); // the backpack stays on your back
    // It is saved like any chest.
    const w2 = new World();
    restoreContainers(w2, { containers: collectContainers(w) } as never);
    expect([...w2.containers.values()]).toContainEqual(carried);
  });

  it('a second death beside the first pack leaves another, and never overwrites it', () => {
    const inv = kit();
    const first = [...w.containers.entries()];
    const at = leaveLostPack(w, inv, x + 0.5, y + 0.2, z + 0.5)!;
    expect(w.blockAt(...at)).toBe(LOST_PACK);
    for (const [key, slots] of first) expect(w.containers.get(key)).toBe(slots);
    expect(w.containers.size).toBe(first.length + 1);
  });

  it('dying with nothing leaves nothing behind', () => {
    const before = w.containers.size;
    expect(leaveLostPack(w, new Inventory(), x + 0.5, y + 0.2, z + 0.5)).toBeNull();
    expect(w.containers.size).toBe(before);
  });
});
