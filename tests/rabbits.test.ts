import { describe, it, expect } from 'vitest';
import { World } from '../src/world/world.ts';
import { runJob, type GenResult } from '../src/jobs/tasks.ts';
import { CS } from '../src/world/constants.ts';
import { AIR, blockId } from '../src/world/blocks.ts';
import { Wild } from '../src/entity/wild.ts';
import { makeCreature } from '../src/entity/creatures.ts';
import { SNARE, SNARE_CAUGHT, HUTCH, emptySnare, breedHutches, newDay } from '../src/sim/rabbits.ts';
import { Inventory } from '../src/sim/inventory.ts';
import { itemId } from '../src/world/items.ts';
import { makeRng } from '../src/core/noise.ts';
import { PLACES, outsideHeight } from '../src/gen/layout.ts';

const STONE = blockId('limestone');

function loadAround(x: number, z: number): World {
  const w = new World();
  const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
  w.addColumn(cx, cz, (runJob({ kind: 'gen', cx, cz, edits: [] }).result as GenResult).chunks);
  return w;
}

describe('the snare', () => {
  it('catches a rabbit that steps into it', () => {
    const snareAt = [1400, 100, 1030];
    const blockAt = (x: number, y: number, z: number) => (x === snareAt[0] && y === snareAt[1] && z === snareAt[2] ? SNARE : y < 100 ? STONE : AIR);
    const w = new Wild();
    w.spawning = false;
    const r = makeCreature('rabbit', 1400.5, 100, 1030.5);
    w.add(r);
    const ev = w.update(0.05, { px: 1460, py: 100, pz: 1030, night: false, shot: false, blockAt, loaded: () => true, rand: Math.random });
    expect(ev.snared).toEqual([snareAt]);
    expect(w.creatures).not.toContain(r);
  });

  it('a rabbit grazing nearby finds the bait in time', () => {
    const blockAt = (x: number, y: number, z: number) => (x === 1404 && y === 100 && z === 1030 ? SNARE : y < 100 ? STONE : AIR);
    const w = new Wild();
    w.spawning = false;
    w.add(makeCreature('rabbit', 1400.5, 100, 1027.5));
    const rand = makeRng(5);
    let caught = 0;
    for (let t = 0; t < 2400 && !caught; t++) caught += w.update(0.05, { px: 1460, py: 100, pz: 1030, night: false, shot: false, blockAt, loaded: () => true, rand }).snared.length;
    expect(caught).toBe(1);
  });

  it('a full snare gives a live rabbit and is set again', () => {
    const wr = PLACES.warren;
    const w = loadAround(wr.x, wr.z);
    const y = outsideHeight(wr.x + 12, wr.z);
    w.setBlock(wr.x + 12, y, wr.z, SNARE_CAUGHT);
    const inv = new Inventory();
    expect(emptySnare(w, inv, wr.x + 12, y, wr.z)).toBe('taken');
    expect(inv.count(itemId('live_rabbit'))).toBe(1);
    expect(w.blockAt(wr.x + 12, y, wr.z)).toBe(SNARE);
    expect(emptySnare(w, inv, wr.x + 12, y, wr.z)).toBeNull(); // nothing in it now
  });
});

describe('the hutch', () => {
  const w = loadAround(1400, 1030);
  const y = outsideHeight(1400, 1030);
  w.setBlock(1400, y, 1030, HUTCH);
  const slots = w.containerAt(1400, y, 1030)!;
  const rabbits = () => slots.reduce((s, st) => s + (st && st.id === itemId('live_rabbit') ? st.count : 0), 0);

  it('one rabbit alone never breeds', () => {
    slots[0] = { id: itemId('live_rabbit'), count: 1 };
    for (let d = 0; d < 5; d++) breedHutches(w);
    expect(rabbits()).toBe(1);
  });

  it('a pair gains one a day, up to eight', () => {
    slots[0] = { id: itemId('live_rabbit'), count: 2 };
    expect(breedHutches(w)).toBe(1);
    expect(rabbits()).toBe(3);
    for (let d = 0; d < 20; d++) breedHutches(w);
    expect(rabbits()).toBe(8);
  });

  it('a new day begins at six in the morning, or on waking', () => {
    expect(newDay(5.9, 6.01)).toBe(true);
    expect(newDay(22, 6)).toBe(true); // slept through the night
    expect(newDay(23.9, 0.1)).toBe(false); // midnight is not morning
    expect(newDay(6.5, 7)).toBe(false);
    expect(newDay(12, 12)).toBe(false);
  });
});
