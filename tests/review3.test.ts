// Findings of the Phase 3 review, each with a test that fails on the code before the fix.
import { describe, it, expect } from 'vitest';
import { trySpawn, despawnFar } from '../src/entity/spawner.ts';
import { makeCreature, think, fits, type Creature } from '../src/entity/creatures.ts';
import { Wild, stepArrow } from '../src/entity/wild.ts';
import { leaveLostPack } from '../src/sim/death.ts';
import { Inventory } from '../src/sim/inventory.ts';
import { World } from '../src/world/world.ts';
import { runJob, type GenResult } from '../src/jobs/tasks.ts';
import { CS, WORLD_Y } from '../src/world/constants.ts';
import { AIR, blockId } from '../src/world/blocks.ts';
import { itemId, dropOf } from '../src/world/items.ts';
import { inSanctuary, zoneAt, PLACES, VALLEY, outsideHeight } from '../src/gen/layout.ts';
import { makeRng } from '../src/core/noise.ts';

const STONE = blockId('limestone');
const flat = (_x: number, y: number, _z?: number) => (y < 100 ? STONE : AIR);

/** Runs a boar that wants the player for 30 s; returns the damage that lands. */
function boarAttack(blockAt: (x: number, y: number, z: number) => number, py: number, px: number): number {
  const c = makeCreature('boar', 1398.5, 100, 1024.5);
  c.mind = 'charge'; c.timer = 8;
  let dmg = 0;
  for (let t = 0; t < 600; t++) {
    const h = think(c, 0.05, { px, py, pz: 1024.5, playerInSanctuary: false, night: false, shot: false }, blockAt, Math.random);
    if (h) dmg += h.damage;
    if ((c.mind as string) === 'wander' || (c.mind as string) === 'flee') { c.mind = 'charge'; c.timer = 8; }
  }
  return dmg;
}

describe('review: hostiles need to reach you', () => {
  it('a boar can’t strike through a wall', () => {
    const wall = (x: number, y: number, z: number) => (x === 1400 && y >= 100 && y < 103 ? STONE : flat(x, y, z));
    expect(boarAttack(wall, 100, 1401.3)).toBe(0);
  });

  it('a boar can’t strike a player standing on a two-block pillar', () => {
    const pillar = (x: number, y: number, z: number) => (x === 1399 && z === 1024 && y >= 100 && y < 102 ? STONE : flat(x, y, z));
    expect(boarAttack(pillar, 102, 1399.5)).toBe(0);
  });

  it('on open ground it still does', () => {
    expect(boarAttack(flat, 100, 1399.8)).toBeGreaterThan(0);
  });

  it('the boar grunts as it winds up', () => {
    const w = new Wild();
    w.spawning = false;
    const c = makeCreature('boar', 1400, 100, 1024);
    c.mind = 'charge'; c.timer = 8;
    w.add(c);
    let warned = false;
    for (let t = 0; t < 40 && !warned; t++) {
      const ev = w.update(0.05, { px: 1401.2, py: 100, pz: 1024, night: false, shot: false, blockAt: flat, loaded: () => true, rand: Math.random });
      if ((c.mind as string) === 'windup' && ev.sounds.some((s) => s.kind === 'grunt')) warned = true;
    }
    expect(warned).toBe(true);
  });
});

describe('review: spawning', () => {
  it('a group never takes a kind over its cap', () => {
    const caps: Record<string, number> = { rabbit: 6, deer: 4, boar: 2, puma: 1 };
    const rand = makeRng(9);
    for (let run = 0; run < 300; run++) {
      let cs: Creature[] = [];
      for (let k = 0; k < 50; k++) cs = cs.concat(trySpawn(cs, PLACES.rangerSign.x, PLACES.rangerSign.z, k % 2 === 0, rand, flat, () => true));
      for (const [kind, cap] of Object.entries(caps)) expect(cs.filter((c) => c.kind === kind).length, kind).toBeLessThanOrEqual(cap);
    }
  });

  it('the puma slips away by day, but not at night', () => {
    const p = makeCreature('puma', 1430, 100, 1024);
    expect(despawnFar([p], 1400, 1024, true)).toHaveLength(1);
    expect(despawnFar([p], 1400, 1024, false)).toHaveLength(0);
    // A deer stays by day.
    expect(despawnFar([makeCreature('deer', 1430, 100, 1024)], 1400, 1024, false)).toHaveLength(1);
  });

  it('rabbits live in the buffer, not the canyon, and most come from the warren', () => {
    const rand = makeRng(4);
    const w = PLACES.warren;
    let total = 0, nearWarren = 0;
    for (let i = 0; i < 4000; i++) {
      const px = w.x + (rand() - 0.5) * 120, pz = w.z + (rand() - 0.5) * 120;
      for (const c of trySpawn([], px, pz, false, rand, flat, () => true)) {
        if (c.kind !== 'rabbit') continue;
        total++;
        expect(zoneAt(c.x, c.z)).toBe('buffer');
        if (Math.hypot(c.x - w.x, c.z - w.z) < w.radius + 12) nearWarren++;
      }
    }
    expect(total).toBeGreaterThan(500);
    expect(nearWarren / total).toBeGreaterThan(0.4);
    // And none in the canyon, wherever the player is.
    const r2 = makeRng(8);
    for (let i = 0; i < 3000; i++) for (const c of trySpawn([], 1560, 900 + r2() * 300, false, r2, flat, () => true)) if (c.kind === 'rabbit') expect(zoneAt(c.x, c.z)).not.toBe('canyon');
  });

  it('no part of a creature’s body stands inside the sanctuary', () => {
    const edge = VALLEY.radius + 8;
    // The west edge: east of the valley at this latitude is the builder's home, sanctuary too.
    const c = makeCreature('deer', VALLEY.cx - edge - 0.1, 100, VALLEY.cz);
    expect(inSanctuary(c.x, c.z)).toBe(false);
    expect(fits(c, c.x, 100, c.z, flat)).toBe(false); // its near side would be inside
    expect(fits(c, VALLEY.cx - edge - 0.5, 100, VALLEY.cz, flat)).toBe(true);
  });
});

describe('review: nothing carried is lost', () => {
  it('a full pack leaves an arrow lying, to be picked up later', () => {
    const w = new Wild();
    w.spawning = false;
    w.arrows.push({ x: 1400, y: 100.1, z: 1024, vx: 0, vy: 0, vz: 0, damage: 12, stuck: true, age: 1 });
    const s = { px: 1400, py: 100, pz: 1024, night: false, shot: false, blockAt: flat, loaded: () => true, rand: Math.random };
    expect(w.update(0.05, { ...s, arrowRoom: () => 0 }).picked).toBe(0);
    expect(w.arrows).toHaveLength(1);
    expect(w.update(0.05, { ...s, arrowRoom: () => 64 }).picked).toBe(1);
  });

  it('an arrow stopped at the valley’s edge falls to the ground there', () => {
    const a = { x: VALLEY.cx + VALLEY.radius + 20, y: 115, z: VALLEY.cz, vx: -40, vy: 0, vz: 0, damage: 20, stuck: false, age: 0 };
    for (let t = 0; t < 40 && !a.stuck; t++) stepArrow(a, 0.05, flat);
    expect(a.stuck).toBe(true);
    expect(a.y).toBeLessThan(101);
    expect(a.y).toBeGreaterThanOrEqual(100);
  });

  it('an emptied lost pack gives nothing when broken', () => {
    expect(dropOf(blockId('lost_pack'))).toBe(0);
  });

  const s = PLACES.rangerSign;
  const world = new World();
  for (let cz = Math.floor(s.z / CS) - 1; cz <= Math.floor(s.z / CS) + 1; cz++)
    for (let cx = Math.floor(s.x / CS) - 1; cx <= Math.floor(s.x / CS) + 1; cx++)
      world.addColumn(cx, cz, (runJob({ kind: 'gen', cx, cz, edits: [] }).result as GenResult).chunks);

  it('a lost pack never goes where no block can be set, and nothing is lost then', () => {
    const inv = new Inventory();
    inv.add(itemId('arrow'), 10);
    const at = leaveLostPack(world, inv, s.x + 0.5, WORLD_Y + 0.5, s.z + 0.5);
    if (at) {
      expect(world.blockAt(...at)).toBe(blockId('lost_pack'));
      expect(at[1]).toBeLessThan(WORLD_Y - 1);
    } else expect(inv.count(itemId('arrow'))).toBe(10);
  });

  it('a lost pack never flattens a set snare', () => {
    const x = s.x - 8, z = s.z - 6, y = outsideHeight(x, z);
    // Snares on every open cell around where the player falls.
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++)
      for (let dy = -3; dy <= 3; dy++) if (world.blockAt(x + dx, y + dy, z + dz) === AIR) world.setBlock(x + dx, y + dy, z + dz, blockId('snare'));
    const inv = new Inventory();
    inv.add(itemId('arrow'), 5);
    leaveLostPack(world, inv, x + 0.5, y + 0.2, z + 0.5);
    let snares = 0;
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) if (world.blockAt(x + dx, y + dy, z + dz) === blockId('snare')) snares++;
    expect(snares).toBeGreaterThan(0);
    expect(world.blockAt(x, y, z)).toBe(blockId('snare'));
  });
});
