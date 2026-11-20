// Zone-1's near band (docs/PHASE4.md, steps 3–7): the dogs, coyotes and chickens and how they keep the
// sanctuary rule; the pack's flank; Marco's trade; the coop; M1.

import { describe, it, expect } from 'vitest';
import { trySpawn, denPack, despawnFar, DEN_SIZE } from '../src/entity/spawner.ts';
import { makeCreature, think, hurt, KINDS, FLANK_RADIUS, type Creature } from '../src/entity/creatures.ts';
import { inSanctuary, zoneAt, VALLEY, GATE } from '../src/gen/layout.ts';
import { DEN, YARD, MARCO_SPOT } from '../src/gen/zone1.ts';
import { makeRng } from '../src/core/noise.ts';
import { AIR, blockId } from '../src/world/blocks.ts';
import { itemId } from '../src/world/items.ts';
import { Inventory } from '../src/sim/inventory.ts';
import { CATALOG, START_WALLET, buy, sell, sellPrice, sellable, tradeNamesValid, btc } from '../src/sim/trade.ts';
import { layEggs, catchChicken, COOP, EGGS_MAX } from '../src/sim/livestock.ts';
import { trackM1, diedOutside, M1_STEPS } from '../src/sim/milestones.ts';
import { World } from '../src/world/world.ts';
import { runJob, type GenResult } from '../src/jobs/tasks.ts';
import { CS } from '../src/world/constants.ts';
import { RECIPES } from '../src/sim/crafting.ts';
import journal from '../data/journal.json' with { type: 'json' };
import { encodeSave, decodeSave } from '../src/save/save.ts';

const STONE = blockId('limestone');
const flat = (_x: number, y: number, _z?: number) => (y < 100 ? STONE : AIR);
const senses = (px: number, pz: number, night = false) => ({ px, py: 100, pz, playerInSanctuary: inSanctuary(px, pz), night, shot: false });

describe('the sanctuary rule, with Zone-1’s creatures', () => {
  it('no creature spawns in the valley, over 100,000 tries all over the world, by day and night', () => {
    const rand = makeRng(11);
    let made = 0, inside = 0;
    const kinds = new Set<string>();
    for (let i = 0; i < 100_000; i++) {
      // Half the players round the valley, half anywhere along the road out to Zone-1.
      const px = i % 2 ? VALLEY.cx + (rand() - 0.5) * 400 : 940 + rand() * 800, pz = VALLEY.cz + (rand() - 0.5) * 300;
      const made1 = [...trySpawn([], px, pz, i % 3 === 0, rand, flat, () => true), ...denPack([], px, pz, DEN_SIZE, rand, flat, () => true)];
      for (const c of made1) { made++; kinds.add(c.kind); if (inSanctuary(c.x, c.z)) inside++; }
    }
    expect(made).toBeGreaterThan(10_000);
    expect([...kinds]).toEqual(expect.arrayContaining(['coyote', 'chicken', 'dog']));
    expect(inside).toBe(0);
  });

  it('coyotes come only to the near band at night, chickens only round the farmyard by day', () => {
    const rand = makeRng(5);
    for (let i = 0; i < 4000; i++) {
      const px = 1000 + rand() * 300, pz = 1000 + rand() * 80, night = i % 2 === 0;
      for (const c of trySpawn([], px, pz, night, rand, flat, () => true)) {
        if (c.kind === 'coyote') { expect(night).toBe(true); expect(zoneAt(c.x, c.z)).toBe('near'); }
        if (c.kind === 'chicken') { expect(night).toBe(false); expect(Math.hypot(c.x - YARD[0], c.z - YARD[1])).toBeLessThan(12); expect(c.home).toEqual(YARD); }
      }
    }
  });

  it('coyotes slip away at dawn, like the puma', () => {
    const c = makeCreature('coyote', 1000, 100, 1024);
    expect(despawnFar([c], 1000 + 40, 1024, false)).toEqual([]);
    expect(despawnFar([c], 1000 + 40, 1024, true)).toEqual([c]);
  });
});

describe('the den', () => {
  it('holds three dogs while all live, each with its own place in the pack; killed dogs stay dead', () => {
    const rand = makeRng(2);
    const three = denPack([], DEN[0] + 30, DEN[2], DEN_SIZE, rand, flat, () => true);
    expect(three.map((c) => c.pack).sort()).toEqual([0, 1, 2]);
    for (const c of three) { expect(c.kind).toBe('dog'); expect(c.home).toEqual([DEN[0], DEN[2]]); }
    // One killed: two come back next time, never a third.
    const two = denPack([], DEN[0] + 30, DEN[2], 2, rand, flat, () => true);
    expect(two.length).toBe(2);
    expect(denPack(two, DEN[0] + 30, DEN[2], 2, rand, flat, () => true)).toEqual([]);
    expect(denPack([], DEN[0] + 30, DEN[2], 0, rand, flat, () => true)).toEqual([]);
    // Far from the farm, no dogs.
    expect(denPack([], DEN[0] + 300, DEN[2], 3, rand, flat, () => true)).toEqual([]);
  });

  it('lies up in the house by day while the player is away, and comes out when they enter the yard', () => {
    const rand = makeRng(9);
    const dogs = denPack([], DEN[0] + 60, DEN[2], 3, rand, flat, () => true);
    for (let t = 0; t < 400; t++) for (const d of dogs) think(d, 0.05, senses(DEN[0] + 60, DEN[2]), flat, rand);
    for (const d of dogs) { expect(d.mind).toBe('wander'); expect(Math.hypot(d.x - DEN[0], d.z - DEN[2])).toBeLessThan(5); }
    for (const d of dogs) think(d, 0.05, senses(DEN[0] + 10, DEN[2]), flat, rand);
    for (const d of dogs) expect(d.mind).toBe('flank');
  });

  it('notices from further at night', () => {
    const rand = makeRng(4);
    const [d] = denPack([], DEN[0] + 20, DEN[2], 1, rand, flat, () => true);
    think(d, 0.05, senses(DEN[0] + 20, DEN[2], false), flat, rand);
    expect(d.mind).toBe('wander');
    think(d, 0.05, senses(DEN[0] + 20, DEN[2], true), flat, rand);
    expect(d.mind).toBe('flank');
  });
});

describe('the flank', () => {
  it('three dogs close from three different sides of the player, not in a line', () => {
    const rand = makeRng(8);
    const px = DEN[0] + 9, pz = DEN[2];
    const dogs = denPack([], px, pz, 3, rand, flat, () => true);
    const angles: number[] = [];
    for (const d of dogs) {
      for (let t = 0; t < 200 && d.mind !== 'charge' && d.mind !== 'windup'; t++) think(d, 0.05, senses(px, pz), flat, rand);
      expect(['charge', 'windup']).toContain(d.mind);
      expect(Math.hypot(d.x - px, d.z - pz)).toBeLessThan(FLANK_RADIUS + 1.5);
      angles.push(Math.atan2(d.z - pz, d.x - px));
    }
    // Every pair of dogs is well apart round the player (more than 80°).
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
      let da = Math.abs(angles[i] - angles[j]) % (Math.PI * 2);
      if (da > Math.PI) da = Math.PI * 2 - da;
      expect(da, `dogs ${i} and ${j}`).toBeGreaterThan((80 * Math.PI) / 180);
    }
  });

  it('every blow is wound up first: stepping back out of reach makes it miss', () => {
    const rand = makeRng(1);
    const d = makeCreature('dog', 1000, 100, 1024);
    d.pack = 0; d.mind = 'charge' as Creature['mind']; d.timer = 5;
    let hit: ReturnType<typeof think> = null;
    for (let t = 0; t < 60 && d.mind !== 'windup'; t++) hit = think(d, 0.05, senses(1001.2, 1024), flat, rand) ?? hit;
    expect(d.mind).toBe('windup');
    expect(hit).toBeNull();
    // The player steps back 3 m during the wind-up.
    for (let t = 0; t < 20; t++) hit = think(d, 0.05, senses(1004.5, 1024), flat, rand) ?? hit;
    expect(hit).toBeNull();
    expect(d.mind).toBe('recover');
  });

  it('a pack goes home rather than follow far from its den', () => {
    const rand = makeRng(6);
    const [d] = denPack([], DEN[0] + 9, DEN[2], 1, rand, flat, () => true);
    think(d, 0.05, senses(DEN[0] + 9, DEN[2]), flat, rand);
    expect(d.mind).toBe('flank');
    think(d, 0.05, senses(DEN[0] + 60, DEN[2]), flat, rand);
    expect(d.mind).toBe('wander');
  });
});

describe('Marco', () => {
  it('stands his ground, turns to face the player and cannot be hurt', () => {
    const m = makeCreature('marco', MARCO_SPOT[0], 100, MARCO_SPOT[2]);
    const rand = makeRng(1);
    for (let t = 0; t < 100; t++) think(m, 0.05, senses(MARCO_SPOT[0], MARCO_SPOT[2] + 5), flat, rand);
    expect(Math.hypot(m.x - MARCO_SPOT[0], m.z - MARCO_SPOT[2])).toBeLessThan(0.01);
    expect(Math.abs(Math.sin(m.yaw))).toBeLessThan(0.05); // facing +z, toward the player
    expect(hurt(m, 999)).toBe(false);
    expect(m.hp).toBe(KINDS.marco.hp);
    expect(KINDS.marco.hostile).toBe(false);
  });

  it('never stands in the valley: his body refuses it like any creature’s', () => {
    const rand = makeRng(2);
    // The west edge: east of the valley at this latitude is the builder's home, sanctuary too.
    const m = makeCreature('marco', VALLEY.cx - VALLEY.radius - 8.8, 100, VALLEY.cz);
    for (let t = 0; t < 200; t++) think(m, 0.05, senses(VALLEY.cx, VALLEY.cz), flat, rand);
    expect(inSanctuary(m.x, m.z)).toBe(false);
  });
});

describe('trading with Marco', () => {
  it('every item in the price list is real, and nothing he sells is a gun or ammunition', () => {
    expect(tradeNamesValid()).toBe(true);
    for (const lot of CATALOG) expect(['pistol', 'pistol_rounds', 'hunting_rifle', 'rifle_rounds']).not.toContain(lot.id);
    const guns = ['pistol', 'pistol_rounds', 'hunting_rifle', 'rifle_rounds'].map(itemId);
    for (const lot of CATALOG) expect(guns).not.toContain(lot.id);
  });

  it('buying takes the price from the wallet and puts the lot in the pack', () => {
    const inv = new Inventory(36);
    const salt = CATALOG.find((l) => l.id === itemId('salt'))!;
    const r = buy(inv, START_WALLET, salt);
    expect(r).toEqual({ ok: true, wallet: START_WALLET - salt.sats });
    expect(inv.count(itemId('salt'))).toBe(salt.lot);
  });

  it('refuses a deal the wallet can’t pay, or the pack can’t hold', () => {
    const lantern = CATALOG.find((l) => l.id === itemId('lantern'))!;
    expect(buy(new Inventory(36), lantern.sats - 1, lantern)).toEqual({ ok: false, why: 'funds' });
    const full = new Inventory(1);
    full.add(itemId('stick'), 64);
    expect(buy(full, START_WALLET, lantern)).toEqual({ ok: false, why: 'room' });
    expect(full.count(itemId('lantern'))).toBe(0);
  });

  it('pays half an item’s value: selling back what he sold returns less than was paid, and he buys hides', () => {
    const inv = new Inventory(36);
    const nails = CATALOG.find((l) => l.id === itemId('nails'))!;
    const bought = buy(inv, START_WALLET, nails);
    expect(bought.ok).toBe(true);
    let wallet = (bought as { wallet: number }).wallet;
    for (let k = 0; k < nails.lot; k++) {
      const r = sell(inv, wallet, itemId('nails'));
      expect(r.ok).toBe(true);
      wallet = (r as { wallet: number }).wallet;
    }
    // He pays half of each nail's own resale value: never more back than was paid.
    expect(START_WALLET - wallet).toBe(nails.sats - nails.lot * sellPrice(itemId('nails')));
    expect(wallet).toBeLessThan(START_WALLET);
    inv.add(itemId('hide'), 2);
    expect(sellable(inv)).toContain(itemId('hide'));
    expect(sellPrice(itemId('hide'))).toBeGreaterThan(0);
    expect(sell(inv, wallet, itemId('pistol'))).toEqual({ ok: false, why: 'none' });
  });

  it('shows the wallet in BTC', () => {
    expect(btc(START_WALLET)).toBe('0.01000000 BTC'); // 40 units: a small starter balance (docs/FIXES.md, 6)
  });
});

describe('chickens and the coop', () => {
  const loadAt = (x: number, z: number) => {
    const w = new World();
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) w.addColumn(cx + dx, cz + dz, (runJob({ kind: 'gen', cx: cx + dx, cz: cz + dz, edits: [] }).result as GenResult).chunks);
    return w;
  };

  it('a chicken caught by hand goes into the pack as a live chicken', () => {
    const inv = new Inventory(36);
    expect(catchChicken(inv, makeCreature('chicken', 0, 0, 0))).toBe('caught');
    expect(inv.count(itemId('live_chicken'))).toBe(1);
    expect(catchChicken(inv, makeCreature('rabbit', 0, 0, 0))).toBeNull();
  });

  it('a coop with a pair lays an egg per hen each morning, up to eight; one hen alone lays none', () => {
    const w = loadAt(1740, 1030);
    w.setBlock(1740, 70, 1030, COOP);
    w.setBlock(1742, 70, 1030, COOP);
    const pair = w.containerAt(1740, 70, 1030)!;
    pair[0] = { id: itemId('live_chicken'), count: 2 };
    w.containerAt(1742, 70, 1030)![0] = { id: itemId('live_chicken'), count: 1 };
    expect(layEggs(w)).toBe(2);
    const eggs = () => pair.reduce((n, s) => n + (s && s.id === itemId('egg') ? s.count : 0), 0);
    expect(eggs()).toBe(2);
    expect(pair.some((s) => s && s.id === itemId('feather'))).toBe(true);
    for (let d = 0; d < 6; d++) layEggs(w);
    expect(eggs()).toBe(EGGS_MAX);
    expect(w.containerAt(1742, 70, 1030)!.some((s) => s && s.id === itemId('egg'))).toBe(false);
  });

  it('is made at the workbench from planks, wire mesh and nails, and eggs and chicken cook at the stove', () => {
    const coop = RECIPES.find((r) => r.out[0] === COOP)!;
    expect(coop.station).toBe('workbench');
    expect(coop.in.map(([id]) => id).sort()).toEqual([itemId('planks'), itemId('wire_mesh'), itemId('nails')].sort());
    expect(RECIPES.some((r) => r.station === 'stove' && r.out[0] === itemId('egg_cooked'))).toBe(true);
    expect(RECIPES.some((r) => r.station === 'stove' && r.out[0] === itemId('chicken_cooked'))).toBe(true);
  });
});

describe('M1: the first outside run', () => {
  const home: [number, number] = [VALLEY.cx, VALLEY.cz];
  it('ticks each of its four steps the way the player earns it, then is done', () => {
    const f = new Set<string>();
    expect(trackM1(f, ...home, false)).toEqual([]);
    trackM1(f, 1400, 1024, false); // out through the gate, into the buffer
    expect(f.has('gate_both')).toBe(false);
    trackM1(f, ...home, false); // home, but not through the gate (over the rim, say)
    expect(f.has('gate_both')).toBe(false);
    trackM1(f, GATE.x0 + 4, 1024.5, false, 67); // swum back through the tunnel…
    trackM1(f, ...home, false); // …and home
    expect(f.has('gate_both')).toBe(true);
    trackM1(f, 1100, 1028, true); // Zone-1, the scout's pistol taken from his pockets
    expect(f.has('pistol_taken')).toBe(true);
    expect(f.has('extracted')).toBe(false);
    f.add('marco_trust1');
    const last = trackM1(f, ...home, true);
    expect(last).toEqual(['extracted', 'm1_done']);
    for (const s of M1_STEPS) expect(f.has(s.flag)).toBe(true);
  });

  it('a death outside is not a way home: Zone-1 has to be reached and walked back again', () => {
    const f = new Set<string>(['been_out']);
    trackM1(f, 1100, 1028, false);
    diedOutside(f);
    trackM1(f, ...home, false); // waking at the bed
    expect(f.has('extracted')).toBe(false);
  });

  it('every note in the journal has its flag set somewhere the game can set it', () => {
    const settable = ['saddle_seen', 'shelter_found', 'scout_searched', 'farm_seen', 'marco_trust1', 'm1_done',
      // Phase 5 (docs/PHASE5.md).
      'outpost_seen', 'outpost_cleared', 'jaguar_seen', 'body_seen', 'm2_done',
      // Phase 7 (docs/PHASE7.md).
      'ashen_seen', 'body_reached', 'm4_done',
      // Phase 8 (docs/PHASE8.md): the gate, the three pages and the manual on the ridge, Ray, the first answer, M5.
      'ridge_gate', 'hut_log', 'dome_page', 'relay_page', 'pharma_learned', 'ray_met', 'ending_seen', 'm5_done'];
    for (const n of journal.notes) expect(settable).toContain(n.flag);
  });
});

describe('saving the near band', () => {
  it('keeps the wallet and the den’s count through a save', async () => {
    const d = {
      format: 'hidden-valley-blocks-save', version: 1, savedAt: new Date().toISOString(), hour: 9,
      player: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flying: false }, hotbar: [], selected: 0, palette: [], edits: [],
      wallet: 4_321_000, den: 1,
    };
    const back = await decodeSave(await encodeSave(d));
    expect(back?.wallet).toBe(4_321_000);
    expect(back?.den).toBe(1);
  });
});

void (null as unknown as Creature);

describe('reaching a creature through the grass', () => {
  it('tall grass and ferns don’t stop a blow, a shot or a hand; rock does', async () => {
    const { clearShot } = await import('../src/sim/hunting.ts');
    const grass = blockId('tall_grass'), fern = blockId('fern');
    // A hen 2 m ahead along +x, with a tuft of grass and a fern on the line between.
    const grassy = (x: number, y: number, z: number) => (y < 100 ? STONE : x === 1 && y === 100 ? grass : x === 0 && y === 100 ? fern : AIR);
    expect(clearShot(grassy, 0.2, 100.4, 0.5, 1, 0, 0, 2)).toBe(true);
    const rock = (x: number, y: number, z: number) => (x === 1 ? STONE : grassy(x, y, z));
    expect(clearShot(rock, 0.2, 100.4, 0.5, 1, 0, 0, 2)).toBe(false);
  });
});

// ---- The review's findings (docs/PHASE4.md, "Review"), each failing on the code before the fix. ----
describe('review fixes', () => {
  it('nothing Marco sells can be made cheaply and sold back at a profit: a lantern resells for no more than its iron', () => {
    const lantern = sellPrice(itemId('lantern')), ingot = sellPrice(itemId('iron_ingot'));
    // Two lanterns come from one ingot (plus glass and charcoal, which are free).
    expect(2 * lantern).toBeLessThanOrEqual(ingot);
    for (const lot of CATALOG) expect(sellPrice(lot.id) * lot.lot, `resale of ${lot.id}`).toBeLessThanOrEqual(lot.sats / 4);
    expect(sellPrice(itemId('live_chicken'))).toBe(0);
  });

  it('the farm’s flock is finite: no more hens spawn than are left in it', () => {
    const rand = makeRng(12);
    let cs: Creature[] = [];
    for (let t = 0; t < 600; t++) {
      cs.push(...trySpawn(cs, YARD[0] + 20, YARD[1], false, rand, flat, () => true, { chicken: 2 }));
      cs = cs.filter((c) => c.kind !== 'chicken' || rand() < 0.5); // caught as fast as they come
    }
    const rand2 = makeRng(3);
    let made = 0;
    for (let t = 0; t < 600; t++) made += trySpawn([], YARD[0] + 20, YARD[1], false, rand2, flat, () => true, { chicken: 0 }).filter((c) => c.kind === 'chicken').length;
    expect(made).toBe(0);
  });

  it('a den dog shot from beyond its range comes for the shooter instead of going home', () => {
    const rand = makeRng(5);
    const [d] = denPack([], DEN[0] + 28, DEN[2], 1, rand, flat, () => true);
    const px = DEN[0] + 28, pz = DEN[2];
    let closest = Infinity;
    hurt(d, 5);
    for (let t = 0; t < 200; t++) { think(d, 0.05, senses(px, pz), flat, rand); closest = Math.min(closest, Math.hypot(d.x - px, d.z - pz)); }
    expect(closest).toBeLessThan(3);
  });

  it('M1’s gate step needs a swim out through the gate and back: not a death outside, not turning back in the tunnel', async () => {

    const f = new Set<string>();
    trackM1(f, GATE.x0 + 0.4, 1024.5, false); // into the gate's doorway, valley side of its middle… then back
    trackM1(f, VALLEY.cx, VALLEY.cz, false);
    expect(f.has('gate_both')).toBe(false);
    trackM1(f, 1560, 1024, false); // out in the canyon
    diedOutside(f); // and dies there, waking at the bed
    trackM1(f, VALLEY.cx, VALLEY.cz, false);
    expect(f.has('gate_both')).toBe(false);
  });

  it('a coyote joining a pack takes a free place in it, and the pack closes round one bearing', async () => {
    const rand = makeRng(21);
    const one = makeCreature('coyote', 1000, 100, 1024); one.pack = 0;
    let made: Creature[] = [];
    for (let t = 0; t < 400 && !made.length; t++) made = trySpawn([one], 1010, 1024, true, rand, flat, () => true).filter((c) => c.kind === 'coyote');
    expect(made.length).toBeGreaterThan(0);
    expect(made.map((c) => c.pack)).not.toContain(0);
    const { Wild } = await import('../src/entity/wild.ts');
    const w = new Wild(); w.spawning = false;
    const a = makeCreature('coyote', 1020, 100, 1024), b = makeCreature('coyote', 1022, 100, 1030);
    a.pack = 0; b.pack = 1;
    w.add(a); w.add(b);
    w.update(0.05, { px: 1000, py: 100, pz: 1024, night: true, shot: false, blockAt: flat, loaded: () => true, rand });
    expect(a.mind).toBe('flank'); expect(b.mind).toBe('flank');
    expect(a.flankBase).toBe(b.flankBase);
  });

  it('a coop drops a feather only on mornings it lays', () => {
    const w = new World();
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) w.addColumn(54 + dx, 32 + dz, (runJob({ kind: 'gen', cx: 54 + dx, cz: 32 + dz, edits: [] }).result as GenResult).chunks);
    w.setBlock(1740, 70, 1030, COOP);
    const slots = w.containerAt(1740, 70, 1030)!;
    slots[0] = { id: itemId('live_chicken'), count: 2 };
    slots[1] = { id: itemId('egg'), count: EGGS_MAX };
    expect(layEggs(w)).toBe(0);
    expect(slots.some((s) => s && s.id === itemId('feather'))).toBe(false);
  });
});
