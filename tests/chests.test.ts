import { describe, it, expect } from 'vitest';
import { World } from '../src/world/world.ts';
import { runJob, type GenResult } from '../src/jobs/tasks.ts';
import { HOME_CHESTS } from '../src/gen/inheritance.ts';
import { itemId } from '../src/world/items.ts';
import { blockId, AIR } from '../src/world/blocks.ts';
import { Inventory } from '../src/sim/inventory.ts';
import { breakBlock } from '../src/sim/interact.ts';
import { collectContainers, restoreContainers, SAVE_FORMAT, SAVE_VERSION, type SaveData } from '../src/save/save.ts';

function home(): World {
  const w = new World();
  for (let cz = 30; cz <= 33; cz++) for (let cx = 55; cx <= 57; cx++)
    w.addColumn(cx, cz, (runJob({ kind: 'gen', cx, cz, edits: [] }).result as GenResult).chunks);
  return w;
}

describe('the builder’s chests', () => {
  it('stand in the home and hold everything on the inheritance list', () => {
    const w = home();
    const all = new Map<number, number>();
    for (const c of HOME_CHESTS) {
      expect(w.blockAt(c.x, c.y, c.z)).toBe(c.safe ? blockId('wall_safe') : blockId('chest'));
      for (const s of w.containerAt(c.x, c.y, c.z)!) if (s) all.set(s.id, (all.get(s.id) ?? 0) + s.count);
    }
    // The plan's promise: weapons, ammo, food, tools, medicine and gear from day one.
    for (const [name, n] of [['hunting_rifle', 1], ['rifle_rounds', 40], ['compound_bow', 1], ['arrow', 30], ['machete', 1], ['armor_vest', 1],
      ['first_aid_kit', 6], ['water_filter', 1], ['binoculars', 1], ['headlamp', 1], ['backpack_upgrade', 1], ['canned_food', 32],
      ['water_jug', 16], ['fishing_rod', 1], ['seeds_corn', 16], ['builders_journal', 1], ['hardware_wallet', 1]] as [string, number][]) {
      expect(all.get(itemId(name)), name).toBe(n);
    }
  });

  it('a chest with things in it cannot be taken apart; an empty one can', () => {
    const w = home();
    const c = HOME_CHESTS[0];
    expect(breakBlock(w, new Inventory(), c.x, c.y, c.z).keepsItems).toBe(true);
    w.containerAt(c.x, c.y, c.z)!.fill(null);
    const inv = new Inventory();
    expect(breakBlock(w, inv, c.x, c.y, c.z).changed).toBe(true);
    expect(w.blockAt(c.x, c.y, c.z)).toBe(AIR);
    expect(inv.count(blockId('chest'))).toBe(1);
  });

  it('what is taken from a chest stays taken through a save', () => {
    const w = home();
    const c = HOME_CHESTS[6]; // the armory
    const slots = w.containerAt(c.x, c.y, c.z)!;
    slots[0] = null; // the rifle, taken
    const d = { format: SAVE_FORMAT, version: SAVE_VERSION, containers: collectContainers(w) } as SaveData;
    const w2 = home();
    restoreContainers(w2, d);
    expect(w2.containerAt(c.x, c.y, c.z)![0]).toBeNull();
    expect(w2.containerAt(c.x, c.y, c.z)![1]).toEqual({ id: itemId('rifle_rounds'), count: 40 });
  });
});

describe('the journal and the safe', () => {
  it('the journal gives the safe’s code', async () => {
    const j = (await import('../data/journal.json')).default;
    expect(j.entries.some((e: { text: string }) => /eighteenth of June/.test(e.text) && /Month first/.test(e.text))).toBe(true);
  });
});
