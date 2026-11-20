// What the script promises and was not there (docs/PHASE9B.md, 6; docs/REVIEW.md, E3): the parts with no game round them.
import { describe, it, expect } from 'vitest';
import { RECIPES, recipesAt, taughtByBooks, canMake, make, type Station } from '../src/sim/crafting.ts';
import { itemId, mineSeconds, isBuilt, HAMMER_SPEED } from '../src/world/items.ts';
import { blockId, AIR } from '../src/world/blocks.ts';
import { Inventory } from '../src/sim/inventory.ts';
import { normaliseSave, migrate, newSave, BEGUN, BOOKS_READ } from '../src/save/state.ts';
import { SAVE_VERSION, WORLD_LAYOUT } from '../src/save/save.ts';
import { CATALOG, sellPrice, UNIT } from '../src/sim/trade.ts';
import { HOME_CHESTS } from '../src/gen/inheritance.ts';
import { makeCreature, think, KINDS, STALK_RUSH, STALK_GIVES_UP, type Creature, type Senses } from '../src/entity/creatures.ts';
import { makeRng } from '../src/core/noise.ts';

const WORKSHOP: Station[] = ['kiln', 'smelter', 'anvil', 'tannery'];

describe('the builder’s handbooks teach the workshop', () => {
  it('before they are read the kiln, smelter, anvil and tannery show nothing; after, everything they showed before', () => {
    for (const st of WORKSHOP) {
      expect(recipesAt(st, new Set()), st).toEqual([]);
      expect(taughtByBooks(st, new Set()), st).toBe(true);
      const all = RECIPES.filter((r) => r.station === st && !r.after);
      expect(all.length, st).toBeGreaterThan(0);
      expect(recipesAt(st, new Set([BOOKS_READ])), st).toEqual(all);
      expect(taughtByBooks(st, new Set([BOOKS_READ])), st).toBe(false);
    }
  });

  it('nothing made by hand, at the workbench or on the stove waits for them: the first day is as it was', () => {
    for (const st of ['hand', 'workbench', 'stove'] as const) {
      expect(RECIPES.filter((r) => r.station === st && r.learn === BOOKS_READ), st).toEqual([]);
      expect(taughtByBooks(st, new Set()), st).toBe(false);
    }
    // Nor anything a later milestone teaches: those keep their own flags.
    for (const r of RECIPES) if (r.learn === BOOKS_READ) expect(WORKSHOP).toContain(r.station);
  });
});

describe('save version 5: the handbooks are read or not', () => {
  it('this build saves version 5, in the same world layout', () => {
    expect([SAVE_VERSION, WORLD_LAYOUT]).toEqual([5, 2]);
    expect(newSave().version).toBe(5);
    expect(newSave().flags).toEqual([]); // a new valley has not read them
  });

  it('a version 4 valley that was begun has read them; one never begun has not', () => {
    const begun = { ...newSave(), version: 4, flags: [BEGUN, 'safe_open'] } as Record<string, unknown>;
    expect(normaliseSave(begun)!.flags).toEqual([BEGUN, 'safe_open', BOOKS_READ]);
    expect(normaliseSave(begun)!.version).toBe(5);
    const fresh = { ...newSave(), version: 4, flags: [] } as Record<string, unknown>;
    expect(normaliseSave(fresh)!.flags).toEqual([]);
    // Every older version comes up the whole chain to the same place.
    for (const v of [1, 2, 3]) {
      const d = { ...newSave(), version: v, flags: [BEGUN] } as Record<string, unknown>;
      if (v < 2) { delete d.id; delete d.seq; }
      const n = normaliseSave(d)!;
      expect(n.version, `from version ${v}`).toBe(5);
      expect(n.flags, `from version ${v}`).toContain(BOOKS_READ);
    }
  });

  it('the upgrade runs once: a version 5 valley that has not read them is left so', () => {
    const d = { ...newSave(), flags: [BEGUN] } as Record<string, unknown>;
    expect(migrate(d)).toBe(true);
    expect(d.flags).toEqual([BEGUN]);
    expect(normaliseSave({ ...newSave(), flags: [BEGUN] })!.flags).toEqual([BEGUN]);
  });

  it('a save from a build after this one is still refused, untouched', () => {
    expect(normaliseSave({ ...newSave(), version: 6 })).toBeNull();
  });
});

describe('the builder’s hammer and handsaw do something', () => {
  const hammer = itemId('hammer'), pick = itemId('steel_pickaxe');

  it('the hammer takes built things apart twice as fast as their own tool, and is no better than a fist on rock', () => {
    for (const name of ['table', 'chest', 'planks', 'stone_bricks', 'slab_planks', 'bookshelf', 'workbench', 'glass']) {
      const b = blockId(name);
      expect(isBuilt(b), name).toBe(true);
      const best = Math.min(mineSeconds(b, pick), mineSeconds(b, itemId('steel_axe')));
      expect(mineSeconds(b, hammer), name).toBeLessThan(best);
      expect(mineSeconds(b, hammer), name).toBeLessThan(mineSeconds(b, AIR));
    }
    const table = blockId('table');
    expect(mineSeconds(table, hammer)).toBeCloseTo(mineSeconds(table, AIR) / 6 / HAMMER_SPEED, 9);
    for (const name of ['limestone', 'dirt', 'log', 'iron_ore']) {
      const b = blockId(name);
      expect(isBuilt(b), name).toBe(false);
      expect(mineSeconds(b, hammer), name).toBe(mineSeconds(b, AIR)); // bare hands
    }
    // What cannot be broken still cannot.
    expect(mineSeconds(blockId('bedrock'), hammer)).toBeLessThan(0);
  });

  it('with the handsaw carried a log gives six planks by hand, not four; the saw is kept', () => {
    const log = blockId('log'), planks = blockId('planks'), saw = itemId('handsaw');
    const six = RECIPES.find((r) => r.station === 'hand' && r.out[0] === planks && r.out[1] === 6)!;
    const four = RECIPES.find((r) => r.station === 'hand' && r.out[0] === planks && r.out[1] === 4)!;
    expect(six.in).toContainEqual([saw, 0]);
    const inv = new Inventory(36);
    inv.add(log, 2);
    expect(canMake(inv, six)).toBe(false);
    expect(make(inv, four)).toBe('made');
    expect(inv.count(planks)).toBe(4);
    inv.add(saw, 1);
    expect(make(inv, six)).toBe('made');
    expect(inv.count(planks)).toBe(10);
    expect(inv.count(saw)).toBe(1);
    expect(inv.count(log)).toBe(0);
  });

  it('with the hammer carried the anvil makes twelve nails from an ingot, not eight; the hammer is kept', () => {
    const nails = itemId('nails'), ingot = itemId('iron_ingot');
    const twelve = RECIPES.find((r) => r.station === 'anvil' && r.out[0] === nails && r.out[1] === 12)!;
    expect(twelve.in).toContainEqual([hammer, 0]);
    const inv = new Inventory(36);
    inv.add(ingot, 1); inv.add(hammer, 1);
    expect(make(inv, twelve)).toBe('made');
    expect([inv.count(nails), inv.count(hammer), inv.count(ingot)]).toEqual([12, 1, 0]);
  });
});

describe('bananas, wild avocados and papayas have a source', () => {
  it('Marco sells each, and takes them back at no profit', () => {
    for (const name of ['banana', 'avocado', 'papaya']) {
      const lot = CATALOG.find((c) => c.id === itemId(name));
      expect(lot, name).toBeTruthy();
      expect(lot!.sats).toBe(UNIT);
      expect(sellPrice(itemId(name)) * lot!.lot, name).toBeLessThan(lot!.sats); // selling a lot back never pays for it
    }
  });

  it('the builder’s pantry holds the last of his', () => {
    const pantry = HOME_CHESTS.find((c) => c.title.startsWith('Pantry: tins'))!;
    for (const name of ['banana', 'avocado', 'papaya']) expect(pantry.items.some(([n, c]) => n === name && c >= 3), name).toBe(true);
  });
});

// ---- The puma stalks from cover ----------------------------------------------------------------------------
const STONE = blockId('limestone');
const flat = (_x: number, y: number) => (y < 100 ? STONE : AIR);
const X = 1300, Z = 1024; // open ground well outside the valley
const yawToward = (px: number, pz: number, x: number, z: number) => Math.atan2(-(x - px), -(z - pz));

/** A puma `dist` to the player's north, stalking, on flat open ground at night. */
function stalker(dist: number): { c: Creature; s: Senses } {
  const c = makeCreature('puma', X, 100, Z - dist);
  c.mind = 'stalk'; c.timer = 60;
  return { c, s: { px: X, py: 100, pz: Z, playerInSanctuary: false, night: true, shot: false } };
}
const run = (c: Creature, s: Senses, seconds: number, each?: (t: number) => void): { hit: number; minDist: number } => {
  const rand = makeRng(5);
  let hit = 0, minDist = Infinity;
  for (let t = 0; t < seconds; t += 1 / 20) {
    each?.(t);
    const h = think(c, 1 / 20, s, flat, rand);
    if (h) hit += h.damage;
    minDist = Math.min(minDist, Math.hypot(c.x - s.px, c.z - s.pz));
  }
  return { hit, minDist };
};

describe('the puma stalks from cover', () => {
  it('looked at, it does not come on: a player who keeps facing it is not reached', () => {
    const { c, s } = stalker(25);
    const r = run(c, s, 6, () => { s.pyaw = yawToward(s.px, s.pz, c.x, c.z); });
    expect(r.hit).toBe(0);
    expect(r.minDist).toBeGreaterThan(24);
    expect(c.mind).toBe('stalk');
  });

  it('watched long enough, it gives the hunt up and goes', () => {
    const { c, s } = stalker(25);
    const r = run(c, s, STALK_GIVES_UP + 4, () => { s.pyaw = yawToward(s.px, s.pz, c.x, c.z); });
    expect(r.hit).toBe(0);
    expect(c.mind === 'flee' || c.mind === 'wander').toBe(true);
    expect(Math.hypot(c.x - s.px, c.z - s.pz)).toBeGreaterThan(25);
  });

  it('with the player’s back to it, it closes and strikes; and it comes in from behind even when it began in front', () => {
    // Behind from the start: straight in.
    const a = stalker(25);
    a.s.pyaw = yawToward(a.s.px, a.s.pz, a.c.x, a.c.z) + Math.PI;
    expect(run(a.c, a.s, 30).hit).toBeGreaterThan(0);
    // In front, but the player is looking at the ground to one side (a quarter turn away): it circles to the back first.
    const b = stalker(25);
    b.s.pyaw = yawToward(b.s.px, b.s.pz, b.c.x, b.c.z) + Math.PI / 2;
    let from = 1;
    const fx = -Math.sin(b.s.pyaw), fz = -Math.cos(b.s.pyaw);
    const r = run(b.c, b.s, 40, () => {
      const d = Math.hypot(b.c.x - b.s.px, b.c.z - b.s.pz);
      if (b.c.mind === 'windup' && from === 1) from = ((b.c.x - b.s.px) * fx + (b.c.z - b.s.pz) * fz) / d;
    });
    expect(r.hit).toBeGreaterThan(0);
    expect(from, 'where it struck from: 1 is dead ahead of the player, −1 straight behind').toBeLessThan(-0.3);
  });

  it('turning to face it stops it again; inside its rush nothing stops it but stepping back', () => {
    const { c, s } = stalker(25);
    s.pyaw = yawToward(s.px, s.pz, c.x, c.z) + Math.PI;
    run(c, s, 3);
    const d1 = Math.hypot(c.x - s.px, c.z - s.pz);
    expect(d1).toBeLessThan(22); // it has been coming
    run(c, s, 3, () => { s.pyaw = yawToward(s.px, s.pz, c.x, c.z); });
    expect(Math.hypot(c.x - s.px, c.z - s.pz)).toBeGreaterThan(d1 - 1.5); // held
    // Close in, a stare does not hold it.
    const near = stalker(STALK_RUSH - 1.5);
    const r = run(near.c, near.s, 6, () => { near.s.pyaw = yawToward(near.s.px, near.s.pz, near.c.x, near.c.z); });
    expect(r.hit).toBeGreaterThan(0);
  });

  it('where the game does not say which way the player faces, it stalks as it always did', () => {
    const { c, s } = stalker(25);
    const r = run(c, s, 12);
    expect(r.hit).toBeGreaterThanOrEqual(KINDS.puma.damage);
    // Straight in, at a walk and then a run: 18 m at 2.2 m/s is about eight seconds, as before.
    const again = stalker(25);
    expect(run(again.c, again.s, 6).minDist).toBeGreaterThan(STALK_RUSH - 1);
  });

  it('it never follows into the sanctuary, facing or not', () => {
    const { c, s } = stalker(25);
    s.playerInSanctuary = true;
    s.pyaw = yawToward(s.px, s.pz, c.x, c.z) + Math.PI;
    expect(run(c, s, 20).hit).toBe(0);
  });
});
