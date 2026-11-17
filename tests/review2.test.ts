// Checks for the Phase 2 review's findings: each failed on the code before its fix.
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/world.ts';
import { runJob, type GenResult } from '../src/jobs/tasks.ts';
import { Inventory } from '../src/sim/inventory.ts';
import { breakBlock, placeBlock, toggleDoor } from '../src/sim/interact.ts';
import { sow, cropDrops, growWhileAway, FARMLAND } from '../src/sim/farming.ts';
import { Player, type Input } from '../src/sim/player.ts';
import { HOME_CHESTS } from '../src/gen/inheritance.ts';
import { blockId, blockName, AIR } from '../src/world/blocks.ts';
import { itemId } from '../src/world/items.ts';
import { HOME, GARDEN, VALLEY } from '../src/gen/layout.ts';

function home(): World {
  const w = new World();
  for (let cz = 30; cz <= 33; cz++) for (let cx = 53; cx <= 57; cx++)
    w.addColumn(cx, cz, (runJob({ kind: 'gen', cx, cz, edits: [] }).result as GenResult).chunks);
  return w;
}
const nobody = { intersectsBlock: () => false, yaw: 0 };
const still: Input = { forward: 0, strafe: 0, jump: false, sprint: false, descend: false };

describe('Phase 2 review fixes', () => {
  it('an emptied builder’s chest, broken and put back, stays empty', () => {
    const w = home();
    const c = HOME_CHESTS[6]; // armory
    w.containerAt(c.x, c.y, c.z)!.fill(null);
    const inv = new Inventory();
    breakBlock(w, inv, c.x, c.y, c.z);
    inv.selected = inv.slots.findIndex((s) => s && s.id === blockId('chest'));
    placeBlock(w, inv, nobody, { x: c.x, y: c.y - 1, z: c.z, nx: 0, ny: 1, nz: 0, id: w.blockAt(c.x, c.y - 1, c.z), dist: 1 });
    expect(w.blockAt(c.x, c.y, c.z)).toBe(blockId('chest'));
    expect(w.containerAt(c.x, c.y, c.z)!.some(Boolean)).toBe(false);
  });

  it('the balcony railing can be neither jumped nor stepped over from the bench', () => {
    const w = home();
    const p = new Player();
    // Stand on the balcony beside the west railing, facing it (west), sprint-jumping into it.
    p.setPosition(HOME.balcony.x0 + 1.5, HOME.floor, 1020.5);
    p.yaw = Math.PI / 2;
    const run = (input: Input, ticks: number) => { for (let i = 0; i < ticks; i++) p.step(1 / 60, input, (x, y, z) => w.blockAt(x, y, z)); };
    run({ ...still, forward: 1, sprint: true, jump: true }, 240);
    expect(p.x).toBeGreaterThan(HOME.balcony.x0 + 0.9);
    // From the bench beside the railing.
    p.setPosition(HOME.balcony.x0 + 1.5, HOME.floor + 0.5, 1024.5);
    run({ ...still, forward: 1, jump: true }, 240);
    expect(p.x).toBeGreaterThan(HOME.balcony.x0 + 0.9);
  });

  it('the vault door opens as one (both leaves, both halves) and will not shut on someone in it', () => {
    const w = home();
    expect(toggleDoor(w, 1826, HOME.floor, 1023)).toBe(true);
    for (const z of [1023, 1024]) for (const y of [HOME.floor, HOME.floor + 1]) expect(blockName(w.blockAt(1826, y, z))).toBe('steel_door_open@east');
    expect(toggleDoor(w, 1826, HOME.floor, 1024, (x, y, z) => x === 1826 && z === 1024 && y === HOME.floor)).toBe('blocked');
    expect(blockName(w.blockAt(1826, HOME.floor, 1024))).toBe('steel_door_open@east');
  });

  it('an unripe coffee bush gives a bean back, and a bean grows a new bush', () => {
    expect(cropDrops(blockId('coffee_bush_0'))).toEqual([[itemId('coffee_beans'), 1]]);
    const w = home();
    const inv = new Inventory();
    inv.slots[0] = { id: itemId('coffee_beans'), count: 1 };
    w.setBlock(1700, VALLEY.floor - 1, 990, FARMLAND);
    w.setBlock(1700, VALLEY.floor, 990, AIR);
    expect(sow(w, inv, 1700, VALLEY.floor - 1, 990)).toBe(true);
    expect(blockName(w.blockAt(1700, VALLEY.floor, 990))).toBe('coffee_bush_0');
  });

  it('breaking the soil under a ripe crop gives the harvest, not the plant', () => {
    const w = home();
    w.setBlock(1700, VALLEY.floor - 1, 991, FARMLAND);
    w.setBlock(1700, VALLEY.floor, 991, blockId('crop_tomato_3'));
    const inv = new Inventory();
    breakBlock(w, inv, 1700, VALLEY.floor - 1, 991);
    expect(inv.count(itemId('tomato'))).toBe(3);
    expect(inv.count(blockId('crop_tomato_3'))).toBe(0);
  });

  it('a night’s sleep grows the garden', () => {
    const w = home();
    const stage = () => {
      let n = 0;
      for (let z = GARDEN.z0; z < GARDEN.z1; z++) for (let x = GARDEN.x0; x < GARDEN.x1; x++) {
        const m = blockName(w.blockAt(x, VALLEY.floor, z)).match(/^crop_\w+_(\d)$/);
        if (m) n += Number(m[1]);
      }
      return n;
    };
    const before = stage();
    growWhileAway(w, 1750, 1030, 13, Math.random);
    expect(stage()).toBeGreaterThan(before);
  });

  it('no sunlight pours down the chimney into the living room', () => {
    const w = home();
    const sky = w.lightAt(1808, HOME.floor + 1, 1016) >> 4; // beside the fireplace
    expect(sky).toBeLessThanOrEqual(9);
  });
});
