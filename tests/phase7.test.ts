// Phase 7 (docs/PHASE7.md): Zone-3 and hydro (M4). This file grows with each step.

import { describe, it, expect } from 'vitest';
import {
  ZONE3, ZONE2, ZONE1FAR, zoneAt, inSanctuary, outsideHeight, highwayX, highwayHeight, ravineX, onDamRoad, damRoadHeight, onAvenue, avenueHeight,
  onFarRoad, farRoadZ, inReservoir, riverBelowDam, VALLEY,
} from '../src/gen/layout.ts';

// ---- Zone-3's layout (docs/PHASE7.md, 1) ---------------------------------------------------------------

describe('Zone-3’s layout', () => {
  const Z = ZONE3, D = Z.dam;

  it('puts the dam just inside Zone-2, its east end on faction ground and its west end in Zone-3', () => {
    expect(D.z).toBeLessThan(760);
    expect(D.z).toBeGreaterThan(740);
    expect(zoneAt(D.x1 + 5, D.z)).toBe('zone2');
    expect(zoneAt(D.x0 - 5, D.z)).toBe('zone3');
    expect(Math.abs((D.x0 + D.x1) / 2 - ravineX(D.z))).toBeLessThan(1.5);
  });

  it('runs the dam road from the highway to the dam with no step over one block', () => {
    const z = D.z;
    let last = highwayHeight(z);
    for (let x = Math.floor(highwayX(z)) - ZONE2.highway.halfWidth - 1; x >= D.x1; x--) {
      expect(onDamRoad(x, z), `x ${x}`).toBe(true);
      const y = outsideHeight(x, z);
      expect(y).toBe(damRoadHeight(x));
      expect(Math.abs(y - last), `x ${x}`).toBeLessThanOrEqual(1);
      last = y;
    }
    expect(last).toBe(D.crest); // level with the deck where it meets the dam
  });

  it('runs the avenue from the dam’s west end round the bend and south to the old road, no step over one block', () => {
    let last = D.crest;
    for (let x = D.x0 - 1; x >= Z.avenue.x; x--) { expect(onAvenue(x, D.z)).toBe(true); expect(outsideHeight(x, D.z)).toBe(D.crest); }
    for (let z = D.z; z < Z.avenue.z1; z++) {
      expect(onAvenue(Z.avenue.x, z), `z ${z}`).toBe(true);
      const y = outsideHeight(Z.avenue.x, z);
      expect(y).toBe(avenueHeight(z));
      expect(Math.abs(y - last), `z ${z}`).toBeLessThanOrEqual(1);
      last = y;
    }
    // And it meets the far road at the same height.
    expect(onFarRoad(Z.avenue.x, Z.avenue.z1 - 1)).toBe(true);
    expect(Math.abs(outsideHeight(Z.avenue.x, Z.avenue.z1 - 1) - last)).toBeLessThanOrEqual(1);
  });

  it('carries the old road on from the bridge’s far abutment past the body to the rail crossing, no step over one block', () => {
    const b = ZONE1FAR.bridge;
    let last = outsideHeight(b.far - 4, Math.floor(farRoadZ(b.far - 4)));
    for (let x = b.far - 4; x >= Z.farRoad.west; x--) {
      const z = Math.floor(farRoadZ(x));
      expect(onFarRoad(x, z), `x ${x}`).toBe(true);
      const y = outsideHeight(x, z);
      expect(Math.abs(y - last), `x ${x}`).toBeLessThanOrEqual(1);
      last = y;
    }
    // The body's rise lies beside the road, not on it.
    const body = ZONE1FAR.body;
    expect(onFarRoad(body.x, body.z)).toBe(false);
    expect(Math.abs(body.z - farRoadZ(body.x))).toBeLessThan(9);
  });

  it('holds the reservoir in the gorge north of the dam: its shores never dip under the water', () => {
    let wet = 0;
    for (let z = 200; z < D.z - 4; z += 3) for (let x = 560; x < 720; x++) {
      if (inReservoir(x, z)) { wet++; expect(Math.abs(x - ravineX(z))).toBeLessThan(27); }
      else if (Math.abs(x - ravineX(z)) < 60) expect(outsideHeight(x, z), `${x},${z}`).toBeGreaterThanOrEqual(D.water);
    }
    expect(wet).toBeGreaterThan(3000);
    expect(inReservoir(D.spill, D.z + 6)).toBe(false); // none below the dam
  });

  it('lets the river sink below the dam: the gorge at the broken bridge is dry, and as deep as before', () => {
    expect(riverBelowDam(D.spill, D.z + 8)).toBe('pool');
    expect(riverBelowDam(Math.round(ravineX(D.z + 60)), D.z + 60)).toBe('stream');
    expect(riverBelowDam(Math.round(ravineX(Z.river.sink + 3)), Z.river.sink + 3)).toBe('bed');
    const b = ZONE1FAR.bridge;
    for (let x = b.far; x <= b.near; x++) expect(riverBelowDam(x, b.z)).toBe(null);
    expect(Z.river.sink).toBeLessThan(b.z - 100);
    expect(outsideHeight(Math.round(ravineX(b.z)), b.z)).toBeLessThan(46);
  });

  it('puts every Zone-3 place and nest in Zone-3, west of the gorge, far outside the sanctuary', () => {
    const boxes = [Z.control, Z.powerhouse, Z.shop, Z.foundry, Z.engineShed, Z.signalBox, Z.mine.gallery];
    for (const b of boxes) for (const [x, z] of [[b.x0, b.z0], [b.x1 - 1, b.z1 - 1]]) {
      expect(zoneAt(x, z)).toBe('zone3');
      expect(inSanctuary(x, z)).toBe(false);
      expect(x).toBeLessThan(ravineX(z) - 26);
      expect(Math.hypot(x - VALLEY.cx, z - VALLEY.cz)).toBeGreaterThan(900);
    }
    for (const n of Z.nests) { expect(zoneAt(n.x, n.z)).toBe('zone3'); expect(n.n).toBeLessThanOrEqual(2); }
    expect(Z.nests.reduce((s, n) => s + n.n, 0)).toBe(9);
  });

  it('keeps the walk short: the dam 140 m from the highway, the works within 180 m of the dam', () => {
    expect(highwayX(D.z) - D.x1).toBeLessThan(150);
    expect(D.x0 - Z.avenue.x + Z.yard.z0 - D.z).toBeLessThan(180);
  });
});

// ---- The land east of the gorge is as it was (docs/PHASE7.md, "Design calls") ------------------------------
import baseline from './fixtures/east-of-ravine.json' with { type: 'json' };
import { hashColumn } from '../tools/worldhash.ts';

describe('the land of earlier phases', () => {
  /** The only columns east of x 672 that Phase 7 may change: the dam road's corridor and the strip mall's lot. */
  const MAY_CHANGE = new Set(['21,23', '22,23', '23,23', '24,23', '25,23', '25,21', '25,22']);

  it('hashes the same as before Phase 7 in a sample of columns east of the gorge, zone by zone', () => {
    const base = baseline as Record<string, number>;
    const sample: [number, number][] = [];
    // Every column round Zone-2's places and Zone-1's far band, and a spread over the rest of the world.
    for (let cz = 16; cz <= 33; cz++) for (let cx = 21; cx <= 28; cx++) sample.push([cx, cz]);
    for (let cz = 2; cz < 64; cz += 7) for (let cx = 22; cx < 64; cx += 5) sample.push([cx, cz]);
    for (const [cx, cz] of [[53, 32], [52, 31], [48, 32], [49, 32], [35, 32], [33, 33], [26, 30]]) sample.push([cx, cz]);
    let checked = 0;
    for (const [cx, cz] of sample) {
      const k = `${cx},${cz}`;
      if (MAY_CHANGE.has(k)) continue;
      expect(hashColumn(cx, cz), `column ${k}`).toBe(base[k]);
      checked++;
    }
    expect(checked).toBeGreaterThan(180);
  }, 120_000);
});

// ---- Power: hydro and the farm (docs/PHASE7.md, 5) ------------------------------------------------------
import { stepPower, newPower, turning, HYDRO_KW, RIG_SATS_PER_DAY, findDevices, type Devices } from '../src/sim/power.ts';
import { blockId } from '../src/world/blocks.ts';
import { chunkKey } from '../src/world/constants.ts';

const home = (o: Partial<Record<keyof Devices, number>>): Devices => {
  const at = (n = 0): [number, number, number][] => Array.from({ length: n }, (_, i) => [1700 + i, 70, 1050] as [number, number, number]);
  return { solar_array: at(o.solar_array), battery_bank: at(o.battery_bank), mining_rig: at(o.mining_rig), fridge: at(o.fridge), water_pump: at(o.water_pump), hydro_generator: at(o.hydro_generator) };
};

describe('hydro and the farm', () => {
  it('makes two kilowatts at midnight as at noon, with no battery', () => {
    for (const hour of [0, 12]) {
      const s = newPower();
      stepPower(s, home({ hydro_generator: 1, mining_rig: 1 }), hour, 10);
      expect(s.made).toBeCloseTo(HYDRO_KW);
      expect(s.on.mining_rig).toBe(true);
    }
  });

  it('runs four rigs, the fridge and the pump round the clock on one generator, and pays each rig', () => {
    const s = newPower();
    const paid = stepPower(s, home({ hydro_generator: 1, mining_rig: 4, fridge: 1, water_pump: 1 }), 0, 24 * 60);
    expect(s.rigs).toBe(4);
    expect(s.on.fridge && s.on.water_pump).toBe(true);
    expect(paid).toBeGreaterThan(4 * RIG_SATS_PER_DAY - 10);
    expect(paid).toBeLessThanOrEqual(4 * RIG_SATS_PER_DAY);
  });

  it('runs as many rigs as there is power for, not none (five rigs on one generator: four run)', () => {
    const s = newPower();
    stepPower(s, home({ hydro_generator: 1, mining_rig: 5 }), 0, 5);
    expect(s.rigs).toBe(4);
    expect(s.on.mining_rig).toBe(true);
  });

  it('runs only one rig without hydro, however many arrays and banks there are: the farm gates on hydro', () => {
    const s = newPower();
    s.charge = 48;
    stepPower(s, home({ solar_array: 8, battery_bank: 4, mining_rig: 4 }), 12, 30);
    expect(s.rigs).toBe(1);
    const paid = stepPower(s, home({ solar_array: 8, battery_bank: 4, mining_rig: 4 }), 12, 24 * 60);
    expect(paid).toBeLessThanOrEqual(RIG_SATS_PER_DAY);
  });

  it('counts only a generator set at the water: one on dry ground makes nothing', () => {
    const gens: [number, number, number][] = [[1700, 70, 1050], [1790, 82, 1020]];
    const wet = turning(gens, (x) => x === 1700, []);
    expect(wet).toEqual([[1700, 70, 1050]]);
    // Where the land isn't loaded, it is as last seen.
    expect(turning(gens, () => null, [[1790, 82, 1020]])).toEqual([[1790, 82, 1020]]);
    const s = newPower();
    stepPower(s, home({ hydro_generator: 0, mining_rig: 1 }), 0, 5);
    expect(s.on.mining_rig).toBe(false);
  });

  it('finds a generator the player placed at home, and none placed outside', () => {
    const edits = new Map<number, Map<number, number>>();
    const put = (x: number, y: number, z: number, name: string) => { const k = chunkKey(x >> 5, y >> 5, z >> 5); if (!edits.has(k)) edits.set(k, new Map()); edits.get(k)!.set(((y & 31) << 10) | ((z & 31) << 5) | (x & 31), blockId(name)); };
    put(1690, 70, 1060, 'hydro_generator');
    put(600, 77, 800, 'hydro_generator');
    expect(findDevices(edits).hydro_generator).toEqual([[1690, 70, 1060]]);
  });
});

// ---- M4's recipes, Ray's catalogue, the mods and the armour (docs/PHASE7.md, 3–4) ---------------------------
import { RECIPES, recipesAt, make, stationOf } from '../src/sim/crafting.ts';
import { Inventory } from '../src/sim/inventory.ts';
import { itemId, hasItem } from '../src/world/items.ts';
import { hasIcon } from '../src/render/itemIcons.ts';
import { hasTexture } from '../src/render/textures.ts';
import { BLOCK_DEFS } from '../src/world/blocks.ts';
import items from '../data/items.json' with { type: 'json' };
import { CATALOG_RAY, RAY_PLANS_PRICE, DOC_PRICE, sellPrice, tradeNamesValid } from '../src/sim/trade.ts';
import { armourFactor } from '../src/entity/wild.ts';
import { isFarmland, PLANTER_BOX } from '../src/sim/farming.ts';

describe('M4’s recipes and trade', () => {
  const bag = (...things: [string, number][]) => { const inv = new Inventory(36); for (const [n, c] of things) inv.add(itemId(n), c); return inv; };
  const recipe = (station: string, out: string, known: string[] = []) => recipesAt(station as never, new Set(known)).find((r) => r.out[0] === itemId(out));

  it('chains steel → lathe → mods and armour, each from Zone-3’s salvage', () => {
    const furnace = recipe('workbench', 'crucible_furnace')!;
    expect(furnace.in.map(([id]) => id)).toContain(itemId('crucible'));
    expect(stationOf(blockId('crucible_furnace'))).toBe('crucible_furnace');
    expect(stationOf(blockId('lathe'))).toBe('lathe');
    expect(stationOf(blockId('old_lathe'))).toBe(null); // the seized ones in the shop are salvage, not stations
    const inv = bag(['steel_stock', 2], ['coal', 1]);
    expect(make(inv, recipesAt('crucible_furnace').find((r) => r.in.some(([id]) => id === itemId('steel_stock')))!)).toBe('made');
    expect(inv.count(itemId('steel_ingot'))).toBe(2);
    // Steel never runs out: your own iron makes it too.
    const own = bag(['iron_ingot', 2], ['coal', 2]);
    expect(make(own, recipesAt('crucible_furnace').find((r) => r.in.some(([id]) => id === itemId('iron_ingot')))!)).toBe('made');
    expect(own.count(itemId('steel_ingot'))).toBe(1);
    expect(recipe('workbench', 'lathe')!.in.map(([id]) => id)).toEqual(expect.arrayContaining([itemId('lathe_parts'), itemId('steel_ingot')]));
  });

  it('shows the hydro generator only once Ray’s plans are bought, and keeps the sluice tools', () => {
    expect(recipe('workbench', 'hydro_generator')).toBeUndefined();
    const r = recipe('workbench', 'hydro_generator', ['hydro_plans'])!;
    const inv = bag(['turbine_parts', 1], ['steel_ingot', 6], ['wiring', 4], ['sluice_tools', 1]);
    expect(make(inv, r)).toBe('made');
    expect(inv.count(blockId('hydro_generator'))).toBe(1);
    expect(inv.count(itemId('sluice_tools'))).toBe(1);
    expect(inv.count(itemId('turbine_parts'))).toBe(0);
    expect(make(bag(['turbine_parts', 1], ['steel_ingot', 6], ['wiring', 4]), r)).toBe('short'); // no tools
  });

  it('mods a found gun at the lathe by using it up: nothing makes a gun from nothing (ADR-019)', () => {
    for (const [out, gun] of [['pistol_suppressed', 'pistol'], ['rifle_rebuilt', 'raider_rifle']]) {
      const r = recipe('lathe', out)!;
      expect(r.in.find(([id]) => id === itemId(gun))![1]).toBe(1);
    }
    const guns = ['pistol', 'raider_rifle', 'hunting_rifle', 'pistol_suppressed', 'rifle_rebuilt'].map((n) => itemId(n));
    for (const r of RECIPES) if (guns.includes(r.out[0])) expect(r.in.some(([id, n]) => guns.includes(id) && n === 1), 'a gun comes only from a gun').toBe(true);
    const inv = bag(['pistol', 1], ['steel_ingot', 2], ['pipe_fittings', 1]);
    expect(make(inv, recipe('lathe', 'pistol_suppressed')!)).toBe('made');
    expect(inv.count(itemId('pistol'))).toBe(0);
    expect(inv.count(itemId('pistol_suppressed'))).toBe(1);
  });

  it('makes plate armour from the vest: half of every blow, better than the vest or leather', () => {
    expect(recipe('lathe', 'plate_armor')!.in.map(([id]) => id)).toContain(itemId('armor_vest'));
    expect(armourFactor((n) => (n === 'plate_armor' ? 1 : 0))).toBe(0.5);
    expect(armourFactor((n) => (n === 'armor_vest' ? 1 : 0))).toBe(0.7);
  });

  it('has an icon for every item, a texture for every block face, and at most four kinds of input a recipe', () => {
    for (const it of items.items) expect(hasIcon(it.icon), it.name).toBe(true);
    for (const d of BLOCK_DEFS) {
      if (!d.tex) continue;
      for (const t of typeof d.tex === 'string' ? [d.tex] : Object.values(d.tex)) expect(hasTexture(t as string), `${d.name}: ${t}`).toBe(true);
    }
    for (const r of RECIPES) expect(r.in.length).toBeLessThanOrEqual(4);
    expect(tradeNamesValid()).toBe(true);
  });

  it('prices Ray at a premium over what Marco pays, buy-only, and his plans at three wound cares', () => {
    expect(RAY_PLANS_PRICE).toBe(3 * DOC_PRICE.wound);
    expect(hasItem('hydro_plans')).toBe(false); // the plans are knowledge, not a thing to carry
    for (const lot of CATALOG_RAY) expect(sellPrice(lot.id) * lot.lot, 'no money from buying off Ray and selling to Marco').toBeLessThan(lot.sats);
    // What M4 hangs on can't be sold by mistake.
    for (const n of ['turbine_parts', 'sluice_tools', 'crucible', 'lathe_parts', 'uplink_plans']) expect(sellPrice(itemId(n)), n).toBe(0);
  });

  it('counts a planter box as farmland (M4’s balcony drip)', () => {
    expect(isFarmland(PLANTER_BOX)).toBe(true);
    expect(recipe('workbench', 'planter_box')).toBeDefined();
  });
});

// ---- M4 on the computer (docs/PHASE7.md, 6) --------------------------------------------------------------
import { M4_STEPS, trackM4, diedOutsideM4, atWorks } from '../src/sim/milestones.ts';

describe('M4 · hydro', () => {
  const P = ZONE3.powerhouse;

  it('ticks the run to the works only once you are home alive, and a death outside undoes it', () => {
    const f = new Set<string>();
    expect(atWorks(P.x0 - 4, P.door)).toBe(true);
    expect(atWorks(ZONE3.dam.x1 + 10, ZONE3.dam.z)).toBe(false); // looking from the dam is not going
    trackM4(f, P.x0 - 4, P.door, { hydro: 0, rigs: 0 });
    expect(f.has('works_reached')).toBe(true);
    expect(f.has('zone3_home')).toBe(false);
    diedOutsideM4(f);
    expect(f.has('works_reached')).toBe(false);
    trackM4(f, P.x0 - 4, P.door, { hydro: 0, rigs: 0 });
    expect(trackM4(f, 1700, 1024, { hydro: 0, rigs: 0 })).toContain('zone3_home');
    diedOutsideM4(f);
    expect(f.has('zone3_home')).toBe(true); // done is done
  });

  it('ticks hydro when a generator turns, the farm at three rigs running, and M4 when all eight are done', () => {
    const f = new Set<string>(['zone3_home']);
    expect(trackM4(f, 1700, 1024, { hydro: 0, rigs: 2 })).toEqual([]);
    expect(trackM4(f, 1700, 1024, { hydro: 1, rigs: 2 })).toEqual(['hydro_built']);
    expect(trackM4(f, 1700, 1024, { hydro: 1, rigs: 3 })).toEqual(['farm_running']);
    for (const s of M4_STEPS.slice(0, -1)) f.add(s.flag);
    expect(f.has('m4_done')).toBe(false);
    f.add(M4_STEPS[M4_STEPS.length - 1].flag);
    expect(trackM4(f, 1700, 1024, { hydro: 1, rigs: 3 })).toEqual(['m4_done']);
    expect(M4_STEPS.length).toBe(8);
  });
});

// ---- The Ashen (docs/PHASE7.md, 2) -----------------------------------------------------------------------
import { makeCreature, fits, KINDS, type Creature } from '../src/entity/creatures.ts';
import {
  thinkAshen, ashenSenses, ashenGround, manAshen, standDownAshen, ashenDawn, ashenHear, provokeAshen, ashenOn, isHunting, newAshen, nestFloor,
  DULL, KEEN, SLOTS, ALL_ASHEN, MAX_HUNTING, STUMBLE, LUNGE_FROM, LEASH, type AshenSenses, type AshenEvent,
} from '../src/entity/ashen.ts';
import { Wild } from '../src/entity/wild.ts';
import { HomeKey } from '../src/sim/home.ts';
import { makeRng } from '../src/core/noise.ts';
import { WALK, SPRINT } from '../src/sim/player.ts';

const STONE = blockId('limestone');
/** Open, level ground at height `floor` everywhere: the Ashen's mind without the buildings. */
const flat = (floor: number) => (_x: number, y: number, _z: number) => (y < floor ? STONE : 0);
const FLOOR = 77;
const senses = (px: number, pz: number, o: Partial<AshenSenses> = {}): AshenSenses => ({
  px, py: FLOOR, pz, pv: 0, sprint: false, playerInSanctuary: inSanctuary(px, pz), night: false, shot: false, lightAt: () => 15, ...o,
});
/** An Ashen standing in the open yard, out of its nest (the shed's), facing north. */
const ashenAt = (x: number, z: number, nest = 3): Creature => {
  const c = makeCreature('ashen', x, FLOOR, z);
  c.nest = nest; c.squad = 1; c.leg = ZONE3.nests[nest].path.length; c.yaw = 0; c.post = { x, y: FLOOR, z, yaw: 0 };
  return c;
};
const run = (c: Creature, s: () => AshenSenses, seconds: number, others = 0, each?: (e: AshenEvent) => void): AshenEvent[] => {
  const all: AshenEvent[] = [], rand = makeRng(7);
  for (let k = 0; k < seconds * 20; k++) for (const e of thinkAshen(c, 1 / 20, s(), others, flat(FLOOR), rand)) { all.push(e); each?.(e); }
  return all;
};
const YX = 540, YZ = 940; // open ground in the rail yard, within the shed nest's leash

describe('the Ashen: the sanctuary and the dam', () => {
  it('has no Ashen ground in the sanctuary, east of the gorge or on the dam, over 100,000 points', () => {
    const rand = makeRng(11);
    const D = ZONE3.dam;
    let ground = 0;
    for (let k = 0; k < 100_000; k++) {
      // Half the points round the valley and the home, half over the whole world.
      const x = k % 2 ? 1560 + rand() * 300 : rand() * 2048, z = k % 2 ? 880 + rand() * 300 : rand() * 2048;
      if (!ashenGround(x, z)) continue;
      ground++;
      expect(inSanctuary(x, z)).toBe(false);
      expect(zoneAt(x, z)).toBe('zone3');
      expect(x).toBeLessThan(ravineX(z) - 26);
    }
    expect(ground).toBeGreaterThan(1000);
    for (let x = D.x0 - 1; x < D.x1 + 20; x++) for (let z = D.z - 3; z <= D.z + 3; z++) expect(ashenGround(x, z), `the dam at ${x},${z}`).toBe(false);
    const b = ZONE1FAR.bridge;
    for (let x = b.far - 3; x <= b.near + 30; x++) expect(ashenGround(x, b.z), `a bridge at ${x}`).toBe(false);
    expect(ashenGround(1700, 1024)).toBe(false);
    expect(ashenGround(800, 700)).toBe(false); // Zone-2
    expect(ashenGround(700, 1024)).toBe(false); // Zone-1's deep band
  });

  it('spawns none in the sanctuary, wherever the player stands, and none at all while the player is at home', () => {
    const rand = makeRng(3);
    const floor = (_x: number, y: number) => y;
    expect(manAshen([], newAshen(), 1700, 1024, false, () => true, floor)).toEqual([]);
    expect(manAshen([], newAshen(), 1810, 1024, true, () => true, floor)).toEqual([]);
    let made = 0;
    for (let k = 0; k < 4000; k++) {
      const out = manAshen([], newAshen(), rand() * 2048, rand() * 2048, k % 2 === 0, () => true, floor);
      for (const c of out) { made++; expect(inSanctuary(c.x, c.z)).toBe(false); expect(ashenGround(c.x, c.z)).toBe(true); }
      expect(out.length).toBeLessThanOrEqual(9);
    }
    expect(made).toBeGreaterThan(100);
    // And the wild refuses one put in the valley by hand.
    const w = new Wild();
    expect(w.add(makeCreature('ashen', 1700, 70, 1024))).toBe(false);
  });

  it('cannot stand, walk, see or lunge into the valley: put at its edge beside a player inside, it does nothing', () => {
    // Just outside the bowl's west edge (not Ashen ground, but suppose one were there).
    const edge = VALLEY.cx - (VALLEY.radius + 8) - 1.5;
    const c = makeCreature('ashen', edge, 118, VALLEY.cz);
    c.nest = 0; c.leg = 1;
    expect(fits(c, edge + 2, 118, VALLEY.cz, flat(118))).toBe(false); // its body can't be inside
    const s = () => senses(edge + 3, VALLEY.cz, { py: 118, sprint: true, pv: 5, lightAt: () => 0 });
    expect(s().playerInSanctuary).toBe(true);
    expect(ashenSenses(c, s(), true, true, flat(118))).toBe(null);
    c.mind = 'charge';
    const all: AshenEvent[] = [];
    for (let k = 0; k < 200; k++) all.push(...thinkAshen(c, 1 / 20, s(), 0, flat(118), makeRng(1)));
    expect(all.filter((e) => e.kind === 'hit' || e.kind === 'shriek')).toEqual([]);
    expect(inSanctuary(c.x, c.z)).toBe(false);
    expect(c.x).toBeLessThanOrEqual(edge + 0.01);
  });

  it('stops at the dam: a player on the crest is out of its world, and it never steps onto the deck', () => {
    const D = ZONE3.dam;
    const c = ashenAt(D.x0 - 14, D.z, 0);
    c.post = undefined; c.mind = 'charge';
    const player = () => senses(D.x0 + 6, D.z, { py: D.crest, pv: 0 });
    const ground = flat(D.crest);
    const rand = makeRng(5);
    c.y = D.crest;
    for (let k = 0; k < 400; k++) {
      const ev = thinkAshen(c, 1 / 20, player(), 0, ground, rand);
      expect(ev.some((e) => e.kind === 'hit')).toBe(false);
      expect(c.x, `step ${k}`).toBeLessThan(D.x0 - 1);
      if ((c.mind as string) === 'wander') c.mind = 'charge'; // even if it keeps trying
    }
    expect(c.x).toBeGreaterThan(D.x0 - 6); // it came to the dam's end, and stood there
  });
});

describe('the Ashen: dull in the light, keen in the dark', () => {
  const see = (c: Creature, px: number, pz: number, o: Partial<AshenSenses>, keen: boolean) => ashenSenses(c, senses(px, pz, o), keen, false, flat(FLOOR));

  it('by day sees a walker only within 6 m in front, and not one who passes behind', () => {
    const c = ashenAt(YX, YZ); // faces north (−z)
    expect(see(c, YX, YZ - 5, { pv: 4 }, false)).toBe('seen');
    expect(see(c, YX, YZ - 7, { pv: 4 }, false)).toBe(null);
    expect(see(c, YX, YZ + 4, { pv: 4 }, false)).toBe(null); // behind it
    expect(see(c, YX + 5, YZ + 1, { pv: 4 }, false)).toBe(null); // beside and a little behind
  });

  it('by day hears a sprint at 15 m and mining at 9 m, but not a walk', () => {
    const c = ashenAt(YX, YZ);
    expect(see(c, YX, YZ + 15, { pv: 5.6, sprint: true }, false)).toBe('heard');
    expect(see(c, YX, YZ + 17, { pv: 5.6, sprint: true }, false)).toBe(null);
    expect(see(c, YX, YZ + 9, { mining: true }, false)).toBe('heard');
    expect(see(c, YX, YZ + 9, { pv: 4 }, false)).toBe(null);
  });

  it('in the dark sees 20 m all round and hears a walk at 7 m', () => {
    const c = ashenAt(YX, YZ);
    expect(see(c, YX, YZ + 19, { pv: 0 }, true)).toBe('seen'); // behind it, standing still
    expect(see(c, YX, YZ + 21, { pv: 0 }, true)).toBe(null);
    expect(see(c, YX + 7, YZ, { pv: 4 }, true)).toBe('heard');
  });

  it('takes its temper from the light where it stands: a lamp’s pool makes it dull at night', () => {
    const c = ashenAt(YX, YZ);
    c.post = undefined; c.mind = 'charge';
    run(c, () => senses(YX, YZ - 12, { lightAt: () => 2, night: true }), 0.2);
    expect(c.keen).toBe(true);
    run(c, () => senses(YX, YZ - 12, { lightAt: () => 12, night: true }), 0.2);
    expect(c.keen).toBe(false);
  });

  it('is slower than your walk when dull, and between your walk and your sprint when keen', () => {
    expect(DULL.speed).toBeLessThan(WALK);
    expect(KEEN.speed).toBeGreaterThan(WALK);
    expect(KEEN.speed).toBeLessThan(SPRINT);
    for (const [light, lo, hi] of [[15, 1.8, 2.5], [0, 4.2, 5.1]] as const) {
      const c = ashenAt(YX, YZ);
      c.post = undefined; c.mind = 'charge';
      const z0 = c.z;
      run(c, () => senses(YX, YZ - 15, { lightAt: () => light }), 2);
      const v = (z0 - c.z) / 2;
      expect(v, `light ${light}`).toBeGreaterThan(lo);
      expect(v, `light ${light}`).toBeLessThan(hi);
    }
  });

  it('a careful player walking past 7 m behind one standing in the road by day is never noticed', () => {
    const c = ashenAt(YX, YZ);
    c.yaw = Math.PI; c.post!.yaw = Math.PI; // its back to the north, as the first one stands
    let pz = YZ - 30;
    const ev = run(c, () => { pz += WALK / 20; return senses(YX + 7, pz, { pv: WALK }); }, 15); // north to south, past it on its right
    expect(ev.filter((e) => e.kind === 'notice')).toEqual([]);
    expect(c.mind).toBe('wander');
    // The same walk at a sprint wakes it.
    const d = ashenAt(YX, YZ);
    pz = YZ - 30;
    const ev2 = run(d, () => { pz += SPRINT / 20; return senses(YX + 7, pz, { pv: SPRINT, sprint: true }); }, 8);
    expect(ev2.some((e) => e.kind === 'notice')).toBe(true);
  });
});

describe('the Ashen: the lunge', () => {
  const start = (light: number) => { const c = ashenAt(YX, YZ); c.post = undefined; c.mind = 'charge'; void light; return c; };

  it('rears and shrieks first, then lands on a player who stands still: 16 dull, 24 keen', () => {
    for (const [light, damage, windup] of [[15, 16, DULL.windup], [0, 24, KEEN.windup]] as const) {
      const c = start(light);
      let t = 0, shriekAt = -1, hitAt = -1, dealt = 0;
      run(c, () => { t += 1 / 20; return senses(YX, YZ - 3, { lightAt: () => light }); }, 3, 0, (e) => {
        if (e.kind === 'shriek' && shriekAt < 0) shriekAt = t;
        if (e.kind === 'hit' && hitAt < 0) { hitAt = t; dealt = e.damage; }
      });
      expect(shriekAt, 'a warning first').toBeGreaterThanOrEqual(0);
      expect(hitAt - shriekAt, 'the wind-up you can see and hear').toBeGreaterThanOrEqual(windup - 0.06);
      expect(dealt).toBe(damage);
    }
  });

  it('misses a player who steps back at a walk when it shrieks, and then stands open for a second and a half', () => {
    for (const light of [15, 0]) {
      const c = start(light);
      let pz = YZ - 3, back = false, t = 0, missAt = -1;
      const ev = run(c, () => { t += 1 / 20; if (back) pz -= WALK / 20; return senses(YX, pz, { lightAt: () => light, pv: back ? WALK : 0 }); }, 1.6, 0, (e) => {
        if (e.kind === 'shriek') back = true;
        if (e.kind === 'miss' && missAt < 0) missAt = t;
      });
      expect(ev.some((e) => e.kind === 'hit'), `light ${light}`).toBe(false);
      expect(missAt, `light ${light}`).toBeGreaterThan(0);
      expect(c.mind).toBe('recover');
      // Open: it neither moves nor strikes until the stumble is over.
      const x = c.x, z = c.z;
      const during = run(c, () => senses(YX, pz, { lightAt: () => light }), STUMBLE - (t - missAt) - 0.1);
      expect(during.filter((e) => e.kind !== 'breath')).toEqual([]);
      expect(Math.hypot(c.x - x, c.z - z)).toBeLessThan(0.3);
    }
  });

  it('misses a player who steps aside, too: the lunge goes where you stood', () => {
    const c = start(15);
    let px = YX, side = false;
    const ev = run(c, () => { if (side) px += WALK / 20; return senses(px, YZ - 3, { pv: side ? WALK : 0 }); }, 1.6, 0, (e) => { if (e.kind === 'shriek') side = true; });
    expect(ev.some((e) => e.kind === 'miss')).toBe(true);
    expect(ev.some((e) => e.kind === 'hit')).toBe(false);
  });

  it('begins the lunge only within reach, so distance is a defence', () => {
    const c = start(15);
    const ev = run(c, () => senses(YX, c.z - LUNGE_FROM - 1.5), 2); // the player keeps ahead of it
    expect(ev.some((e) => e.kind === 'shriek')).toBe(false);
  });
});

describe('the Ashen: packs, noise, and coming back', () => {
  it('never hunts more than three at once: a fourth that notices only watches', () => {
    expect(MAX_HUNTING).toBe(3);
    const c = ashenAt(YX, YZ);
    run(c, () => senses(YX, YZ - 4, { pv: 4 }), 3, 3);
    expect(c.mind).toBe('notice');
    expect(isHunting(c)).toBe(false);
    run(c, () => senses(YX, YZ - 4, { pv: 4 }), 1.5, 2); // one of the three is down: now it comes
    expect(isHunting(c)).toBe(true);
    // Provoked while three hunt, it comes to look instead of joining.
    const d = ashenAt(YX + 20, YZ);
    provokeAshen(d, YX, YZ, 3);
    expect(d.mind).toBe('seek');
    provokeAshen(d, YX, YZ, 1);
    expect(d.mind).toBe('charge');
  });

  it('comes to where a shot was fired, not to the player: move on and it finds nothing', () => {
    const c = ashenAt(YX, YZ);
    ashenHear([c], YX + 30, YZ, 70);
    expect(c.mind).toBe('seek');
    // The player has walked 40 m away the other way, and keeps still.
    const ev = run(c, () => senses(YX + 30, YZ + 45), 16);
    expect(ev.some((e) => e.kind === 'notice')).toBe(false);
    expect(c.mind).toBe('wander');
    // It went toward the shot.
    const far = ashenAt(YX, YZ);
    ashenHear([far], YX + 30, YZ, 70);
    run(far, () => senses(YX + 30, YZ + 45), 3);
    expect(far.x).toBeGreaterThan(YX + 4);
    // Out of earshot, nothing; a suppressed shot carries 12 m.
    const deaf = ashenAt(YX, YZ);
    ashenHear([deaf], YX + 80, YZ, 70);
    ashenHear([deaf], YX + 14, YZ, 12);
    expect(deaf.mind).toBe('wander');
  });

  it('gives up a chase 45 m from its nest, and after 12 s with no sight or sound of you', () => {
    const n = ZONE3.nests[3];
    const c = ashenAt(n.path[0][0], n.path[0][1]);
    c.post = undefined; c.mind = 'charge';
    // The player keeps 10 m ahead, due west, in plain view, for as long as it follows.
    run(c, () => senses(c.x - 10, c.z, { pv: 2.4 }), 40);
    expect(Math.hypot(c.x - n.x, c.z - n.z)).toBeLessThan(LEASH + 3);
    expect(isHunting(c)).toBe(false);
    const d = ashenAt(YX, YZ);
    d.post = undefined; d.mind = 'charge';
    run(d, () => senses(YX + 60, YZ + 60), 13); // far out of sight and hearing
    expect(isHunting(d)).toBe(false);
  });

  it('keeps nine in five nests of one or two; the killed stay down until dawn', () => {
    expect(SLOTS.length).toBe(9);
    expect(ALL_ASHEN).toBe(511);
    const n = ZONE3.nests[1];
    const st = newAshen();
    st.firstOut = false;
    const floor = (_x: number, y: number) => y;
    const made = manAshen([], st, n.x, n.z, false, () => true, floor);
    expect(made.filter((c) => c.nest === 1).length).toBe(2);
    for (const c of made) { expect(c.y).toBe(nestFloor(c.nest!)); expect(c.mind).toBe('wander'); }
    // None is made twice.
    expect(manAshen(made, st, n.x, n.z, false, () => true, floor)).toEqual([]);
    // One is killed: it is not back the next second, nor after a reload (the bits are saved), but at dawn.
    const dead = made.find((c) => c.nest === 1)!;
    st.down |= dead.squad!;
    const left = made.filter((c) => c !== dead);
    expect(manAshen(left, st, n.x, n.z, false, () => true, floor)).toEqual([]);
    ashenDawn(st);
    expect(manAshen(left, st, n.x, n.z, false, () => true, floor).map((c) => c.squad)).toEqual([dead.squad]);
    // Far from every nest they are let go, not killed.
    expect(standDownAshen(made, 1700, 1024).length).toBe(0);
    expect(st.down).toBe(0);
  });

  it('stands one out in the road by day until it has been seen, then keeps to the nests', () => {
    const f = ZONE3.firstAshen, floor = (_x: number, y: number) => y;
    const day = manAshen([], newAshen(), f.x, f.z - 40, false, () => true, floor);
    const out = day.filter((c) => c.post);
    expect(out.length).toBe(1);
    expect(Math.hypot(out[0].x - f.x, out[0].z - f.z)).toBeLessThan(1);
    expect(out[0].yaw).toBeCloseTo(Math.PI); // its back to the dam
    expect(Math.abs(f.x - ZONE3.avenue.x)).toBeLessThan(ZONE3.avenue.halfWidth); // in the road
    const night = manAshen([], newAshen(), f.x, f.z - 40, true, () => true, floor);
    expect(night.some((c) => c.post)).toBe(false);
    const seen = newAshen();
    seen.firstOut = false;
    expect(manAshen([], seen, f.x, f.z - 40, false, () => true, floor).some((c) => c.post)).toBe(false);
  });

  it('carries nothing, and is no animal to trap or scare with a shot', () => {
    expect(KINDS.ashen.drops).toEqual([]);
    expect(KINDS.ashen.hostile).toBe(true);
  });
});

describe('hold H is no escape from the Ashen', () => {
  it('counts one hunting within 30 m, not one unaware or far off', () => {
    const c = ashenAt(YX, YZ);
    expect(ashenOn([c], YX, YZ - 10)).toBe(false); // unaware
    c.mind = 'charge';
    expect(ashenOn([c], YX, YZ - 10)).toBe(true);
    expect(ashenOn([c], YX, YZ - 40)).toBe(false);
    for (const m of ['windup', 'lunge', 'recover'] as const) { c.mind = m; expect(ashenOn([c], YX, YZ - 10)).toBe(true); }
  });

  it('refuses for ten seconds after its blow, and is cancelled by one landing mid-hold', () => {
    const h = new HomeKey();
    expect(h.press(3, false)).toBe('danger'); // hurt three seconds ago
    expect(h.press(11, false)).toBe('started');
    expect(h.update(0.5, true, true)).toBe('cancelled'); // the game passes "hurt, or one of them on you" here
    expect(h.held).toBe(null);
  });
});

// ---- Hutches and coops while the player is away (docs/PHASE7.md, 7) ------------------------------------------
import { World } from '../src/world/world.ts';
import { packPos } from '../src/world/light.ts';
import { breedHutches, HUTCH, HUTCH_MAX } from '../src/sim/rabbits.ts';
import { layEggs, hatchEggs, COOP, EGGS_MAX, HENS_MAX } from '../src/sim/livestock.ts';

describe('hutches and coops while their land is not loaded', () => {
  /** A world with nothing loaded: only the record of what the player placed, and what is in it. */
  const away = (block: number, x: number, y: number, z: number, slots: [string, number][]) => {
    const w = new World();
    const k = chunkKey(x >> 5, y >> 5, z >> 5);
    w.edits.set(k, new Map([[((y & 31) << 10) | ((z & 31) << 5) | (x & 31), block]]));
    const s = new Array(9).fill(null);
    slots.forEach(([n, c], i) => (s[i] = { id: itemId(n), count: c }));
    w.containers.set(packPos(x, y, z), s);
    return { w, s };
  };
  const count = (s: ({ id: number; count: number } | null)[], n: string) => s.reduce((t, st) => t + (st && st.id === itemId(n) ? st.count : 0), 0);

  it('a hutch breeds each dawn the player is away, up to eight (it used to wait for its chunk)', () => {
    const { w, s } = away(HUTCH, 1750, 70, 1040, [['live_rabbit', 2]]);
    expect(w.isLoaded(1750, 1040)).toBe(false);
    expect(breedHutches(w)).toBe(1);
    for (let day = 0; day < 10; day++) breedHutches(w);
    expect(count(s, 'live_rabbit')).toBe(HUTCH_MAX);
  });

  it('a coop lays and hatches each dawn the player is away, capped at eight eggs and eight hens', () => {
    const { w, s } = away(COOP, 1752, 70, 1040, [['live_chicken', 2]]);
    expect(layEggs(w)).toBe(2);
    for (let day = 0; day < 12; day++) { hatchEggs(w); layEggs(w); }
    expect(count(s, 'live_chicken')).toBe(HENS_MAX);
    expect(count(s, 'egg')).toBeLessThanOrEqual(EGGS_MAX);
    expect(count(s, 'egg')).toBeGreaterThan(0);
  });

  it('does nothing where the block is gone, or was never the player’s', () => {
    const { w } = away(blockId('planks'), 1750, 70, 1040, [['live_rabbit', 2]]);
    expect(breedHutches(w)).toBe(0);
    const bare = new World();
    bare.containers.set(packPos(1750, 70, 1040), [{ id: itemId('live_rabbit'), count: 2 }]);
    expect(breedHutches(bare)).toBe(0);
    expect(bare.blockKnown(1750, 70, 1040)).toBe(-1);
  });
});
