import { describe, it, expect } from 'vitest';
import { Wild, stepArrow, type Arrow } from '../src/entity/wild.ts';
import { makeCreature, hurt, KINDS } from '../src/entity/creatures.ts';
import { meleeDamage, takeDrops, drawOf, RIFLE_DAMAGE } from '../src/sim/hunting.ts';
import { Inventory } from '../src/sim/inventory.ts';
import { itemId } from '../src/world/items.ts';
import { AIR, blockId } from '../src/world/blocks.ts';

const STONE = blockId('limestone');
const flat = (_x: number, y: number, _z?: number) => (y < 100 ? STONE : AIR);
const senses = (px: number, pz: number) => ({ px, py: 100, pz, night: false, shot: false, blockAt: flat, loaded: () => true, rand: Math.random });

/** Where an arrow loosed level from 1.6 m up comes down, and after how long. */
function flight(draw: number): { range: number; time: number; a: Arrow } {
  const w = new Wild();
  w.spawning = false;
  const a = w.shoot(1300, 101.6, 1024, -1, 0, 0, draw);
  let time = 0;
  while (!a.stuck && time < 10) { stepArrow(a, 0.05, flat); time += 0.05; }
  return { range: 1300 - a.x, time, a };
}

describe('arrows', () => {
  it('fly under gravity, further for a fuller draw, and stick where they land', () => {
    const half = flight(0.5), full = flight(1);
    expect(full.a.stuck).toBe(true);
    expect(full.a.y).toBeGreaterThanOrEqual(99.9);
    expect(full.a.y).toBeLessThan(100.5);
    expect(full.range).toBeGreaterThan(half.range * 1.3);
    // Falling 1.6 m takes about 0.42 s under 18 m/s²: the flight time doesn't depend on the draw.
    expect(full.time).toBeGreaterThan(0.3);
    expect(full.time).toBeLessThan(0.6);
  });

  it('deal 12 to 22 by draw', () => {
    const w = new Wild();
    expect(w.shoot(0, 0, 0, 1, 0, 0, 0).damage).toBe(12);
    expect(w.shoot(0, 0, 0, 1, 0, 0, 1).damage).toBe(22);
    expect(drawOf(0.5)).toBe(0.5);
    expect(drawOf(3)).toBe(1);
  });

  it('hit a deer, bring it down with a second, and can be picked up again', () => {
    const w = new Wild();
    w.spawning = false;
    const deer = makeCreature('deer', 1290, 100, 1024);
    w.add(deer);
    const s = senses(1340, 1024); // 50 m off: too far to spook it
    w.shoot(1300, 100.8, 1024, -1, 0.02, 0, 1);
    let kills = 0;
    for (let t = 0; t < 40; t++) kills += w.update(0.05, s).kills.length;
    expect(deer.hp).toBe(30 - 22);
    expect(kills).toBe(0);
    deer.x = 1290; deer.z = 1024; deer.vx = deer.vz = 0; deer.mind = 'wander'; deer.timer = 99; deer.goalX = 1290; deer.goalZ = 1024;
    w.shoot(1300, 100.8, 1024, -1, 0.02, 0, 1);
    let killed = null;
    for (let t = 0; t < 40 && !killed; t++) killed = w.update(0.05, s).kills[0] ?? null;
    expect(killed).toBe(deer);
    expect(w.creatures).not.toContain(deer);
    // Both arrows lie on the ground; walking over them picks them up.
    expect(w.arrows.filter((a) => a.stuck)).toHaveLength(2);
    let picked = 0;
    for (const a of [...w.arrows]) picked += w.update(0.05, senses(a.x, a.z)).picked;
    expect(picked).toBe(2);
    expect(w.arrows).toHaveLength(0);
  });
});

describe('damage and drops', () => {
  it('each weapon hits as hard as the plan says', () => {
    expect(meleeDamage(undefined)).toBe(2);
    expect(meleeDamage(itemId('hunting_knife'))).toBe(5);
    expect(meleeDamage(itemId('spear'))).toBe(8);
    expect(meleeDamage(itemId('steel_axe'))).toBe(7);
    expect(meleeDamage(itemId('machete'))).toBe(9);
    expect(meleeDamage(itemId('corn'))).toBe(2);
    expect(RIFLE_DAMAGE).toBe(45);
  });

  it('one rifle shot drops a deer or a boar, but not the puma', () => {
    expect(hurt(makeCreature('deer', 0, 0, 0), RIFLE_DAMAGE)).toBe(true);
    expect(hurt(makeCreature('boar', 0, 0, 0), RIFLE_DAMAGE)).toBe(true);
    const puma = makeCreature('puma', 0, 0, 0);
    expect(hurt(puma, RIFLE_DAMAGE)).toBe(false);
    expect(hurt(puma, RIFLE_DAMAGE)).toBe(true);
  });

  it('a hurt boar charges, a hurt deer flees', () => {
    const b = makeCreature('boar', 0, 0, 0), d = makeCreature('deer', 0, 0, 0);
    hurt(b, 5); hurt(d, 5);
    expect(b.mind).toBe('charge');
    expect(d.mind).toBe('flee');
  });

  it('a kill puts its drops in the pack, and says when the pack is full', () => {
    const inv = new Inventory();
    expect(takeDrops(inv, 'deer')).toEqual([]);
    expect(inv.count(itemId('venison_raw'))).toBe(3);
    expect(inv.count(itemId('hide'))).toBe(1);
    expect(inv.count(itemId('bone'))).toBe(1);
    const full = new Inventory();
    for (let i = 0; i < full.size; i++) full.slots[i] = { id: blockId('limestone'), count: 64 };
    expect(takeDrops(full, 'boar')).toEqual([[itemId('pork_raw'), 3], [itemId('hide'), 1], [itemId('bone'), 1]]);
    expect(KINDS.puma.drops).toEqual([['puma_pelt', 1]]);
  });
});
