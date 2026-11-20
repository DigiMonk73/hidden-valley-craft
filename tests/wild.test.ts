import { describe, it, expect } from 'vitest';
import { trySpawn, groundAt, despawnFar } from '../src/entity/spawner.ts';
import { makeCreature, think, KINDS, type Creature, type Kind } from '../src/entity/creatures.ts';
import { Wild, armourFactor, stepArrow } from '../src/entity/wild.ts';
import { inSanctuary, VALLEY } from '../src/gen/layout.ts';
import { makeRng } from '../src/core/noise.ts';
import { AIR, blockId } from '../src/world/blocks.ts';

const STONE = blockId('limestone');
/** Flat open ground: solid below y = 100, air above. */
const flat = (_x: number, y: number, _z?: number) => (y < 100 ? STONE : AIR);

describe('the sanctuary rule', () => {
  it('no creature spawns in the valley, over 100,000 tries around and inside it', () => {
    const rand = makeRng(7);
    let made = 0, inside = 0;
    for (let i = 0; i < 100_000; i++) {
      // Players anywhere from the valley's middle to well outside its rim, by day and by night.
      const a = rand() * Math.PI * 2, r = rand() * (VALLEY.radius + 120);
      const px = VALLEY.cx + Math.cos(a) * r, pz = VALLEY.cz + Math.sin(a) * r;
      for (const c of trySpawn([], px, pz, i % 2 === 0, rand, flat, () => true)) {
        made++;
        if (inSanctuary(c.x, c.z)) inside++;
      }
    }
    expect(made).toBeGreaterThan(10_000);
    expect(inside).toBe(0);
  });

  it('no ground inside the valley counts as somewhere to stand', () => {
    expect(groundAt(VALLEY.cx, VALLEY.cz, flat)).toBeNull();
    // The west edge: east of the valley at this latitude is the builder's home, sanctuary too.
    expect(groundAt(VALLEY.cx - VALLEY.radius - 30, VALLEY.cz, flat)).toBe(100);
  });

  it('a creature stands on the forest floor, never on top of a tree', () => {
    const leaves = blockId('leaves');
    const canopy = (x: number, y: number, z: number) => (y >= 110 && y < 113 ? leaves : flat(x, y, z));
    expect(groundAt(1400, 1024, canopy)).toBe(100);
    // Under a trunk there is no room: no spot there.
    const trunk = (x: number, y: number, z: number) => (y >= 100 && y < 105 ? blockId('log') : flat(x, y, z));
    expect(groundAt(1400, 1024, trunk)).toBeNull();
  });

  it('a creature can stand in grass and ferns, not in water', () => {
    const grass = blockId('tall_grass');
    const grassy = (x: number, y: number, z: number) => (y === 100 ? grass : flat(x, y, z));
    expect(groundAt(1400, 1024, grassy)).toBe(100);
    const wet = (x: number, y: number, z: number) => (y === 100 ? blockId('water') : flat(x, y, z));
    expect(groundAt(1400, 1024, wet)).toBeNull();
  });

  it('a creature driven toward the valley never steps into it, whatever its mind', () => {
    const rand = makeRng(3);
    const edge = VALLEY.radius + 8;
    for (const kind of Object.keys(KINDS) as Kind[]) {
      for (let trial = 0; trial < 40; trial++) {
        let a = rand() * Math.PI * 2;
        // A start beside the builder's home (sanctuary too, past the bowl's edge) moves to the far side.
        if (inSanctuary(VALLEY.cx + Math.cos(a) * (edge + 0.6), VALLEY.cz + Math.sin(a) * (edge + 0.6))) a += Math.PI;
        const c = makeCreature(kind, VALLEY.cx + Math.cos(a) * (edge + 0.6), 100, VALLEY.cz + Math.sin(a) * (edge + 0.6));
        // The player stands inside (hostiles must give up) or just outside on the far side (shy ones flee inward).
        const inside = trial % 2 === 0;
        const pr = inside ? edge - 6 : edge + 5;
        const px = VALLEY.cx + Math.cos(a) * pr, pz = VALLEY.cz + Math.sin(a) * pr;
        const pxo = inside ? px : VALLEY.cx + Math.cos(a) * (edge + 4);
        for (let t = 0; t < 400; t++) {
          // Shove it inward every step, as a charge or a flight would.
          c.vx += (VALLEY.cx - c.x) * 0.5; c.vz += (VALLEY.cz - c.z) * 0.5;
          think(c, 0.05, { px: pxo, py: 100, pz: inside ? pz : VALLEY.cz + Math.sin(a) * (edge + 4), playerInSanctuary: inSanctuary(pxo, pz), night: true, shot: t === 5 }, flat, rand);
          expect(inSanctuary(c.x, c.z), `${kind} at ${c.x.toFixed(1)},${c.z.toFixed(1)}`).toBe(false);
        }
      }
    }
  });

  it('a hostile never targets a player inside the valley', () => {
    const c: Creature = makeCreature('boar', VALLEY.cx + VALLEY.radius + 10, 100, VALLEY.cz);
    c.mind = 'charge'; c.timer = 8;
    let hits = 0;
    for (let t = 0; t < 400; t++) if (think(c, 0.05, { px: VALLEY.cx + VALLEY.radius + 6, py: 100, pz: VALLEY.cz, playerInSanctuary: true, night: true, shot: false }, flat, Math.random)) hits++;
    expect(hits).toBe(0);
    expect(c.mind === 'charge' || c.mind === 'windup').toBe(false);
  });

  it('the wild refuses a creature placed inside, lets go of any found there, and arrows stop at the edge', () => {
    const w = new Wild();
    expect(w.add(makeCreature('deer', VALLEY.cx, 100, VALLEY.cz))).toBe(false);
    const stray = makeCreature('deer', VALLEY.cx + 20, 100, VALLEY.cz);
    expect(despawnFar([stray], VALLEY.cx + 20, VALLEY.cz)).toHaveLength(0);
    // Shot from the west, toward the valley (east of it at this latitude is the builder's home, sanctuary too).
    const a = { x: VALLEY.cx - VALLEY.radius - 20, y: 105, z: VALLEY.cz, vx: 40, vy: 0, vz: 0, damage: 20, stuck: false, age: 0 };
    for (let t = 0; t < 40 && !a.stuck; t++) stepArrow(a, 0.05, (_x, y) => (y < 50 ? STONE : AIR));
    expect(a.stuck).toBe(true);
    expect(inSanctuary(a.x, a.z)).toBe(false);
  });
});

describe('the wild', () => {
  it('spawns creatures around a player in the buffer, and only by zone and time', () => {
    const w = new Wild();
    const rand = makeRng(11);
    let night = false;
    const senses = () => ({ px: 1400, py: 100, pz: 1024, night, shot: false, blockAt: flat, loaded: () => true, rand });
    for (let t = 0; t < 60; t++) w.update(1, senses());
    expect(w.creatures.length).toBeGreaterThan(3);
    expect(w.count('puma')).toBe(0); // only at night
    for (const c of w.creatures) expect(Math.hypot(c.x - 1400, c.z - 1024)).toBeLessThan(128);
    night = true;
    for (let t = 0; t < 200 && w.count('puma') === 0; t++) w.update(1, senses());
    expect(w.count('puma')).toBe(1);
    for (let t = 0; t < 100; t++) w.update(1, senses());
    expect(w.count('puma')).toBeLessThanOrEqual(1);
  });

  it('a boar winds up before it strikes, and stepping back makes it miss', () => {
    const run = (stepBack: boolean) => {
      const c = makeCreature('boar', 1400, 100, 1024);
      let px = 1400, landed = 0, warned = false;
      for (let t = 0; t < 120; t++) {
        if (c.mind === 'windup') { warned = true; if (stepBack) px = c.x + 6; }
        if (c.mind !== 'windup' && !stepBack) px = c.x + 1.2;
        const h = think(c, 0.05, { px, py: 100, pz: 1024, playerInSanctuary: false, night: false, shot: false }, flat, Math.random);
        if (h) { landed += h.damage; break; }
        if (!stepBack && t === 0) px = c.x + 1.2;
      }
      return { landed, warned };
    };
    const stood = run(false);
    expect(stood.warned).toBe(true);
    expect(stood.landed).toBe(10);
    expect(run(true).landed).toBe(0);
  });

  it('armour takes the edge off a blow: the vest more than leather, and the best one counts', () => {
    expect(armourFactor(() => 0)).toBe(1);
    expect(armourFactor((n) => (n === 'leather_armor' ? 1 : 0))).toBe(0.85);
    expect(armourFactor((n) => (n === 'plate_armor' || n === 'engineer_armor' ? 0 : 1))).toBe(0.7);
    expect(armourFactor((n) => (n === 'engineer_armor' ? 0 : 1))).toBe(0.5); // M4's plate armour (docs/PHASE7.md)
    expect(armourFactor(() => 1)).toBe(0.35); // M5's engineer's armour (docs/PHASE8.md) is the best of all
  });
});
