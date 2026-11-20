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

import rim from './fixtures/east-rim.json' with { type: 'json' };
import { hashRim } from '../tools/worldhash.ts';

describe('the gorge’s east rim', () => {
  // The column the gorge shares with its east rim (x 640–671) cannot be hashed whole: the gorge itself changed
  // (the reservoir, the dam). Its rim, 22 m and more east of the centre line, is hashed row by row instead
  // (tests/fixtures/east-rim.json, made on main before Phase 7 with tools/worldhash.ts --rim).
  it('is as earlier phases made it, but for the reservoir’s shore and the dam’s east end (trees and caves were cut from all of it, down to the river’s sink)', () => {
    const now = hashRim(), was = rim as Record<string, number>;
    const d = ZONE3.dam;
    const changed = Object.keys(was).map(Number).filter((z) => was[z] !== now[z]);
    expect(changed.length).toBeGreaterThan(0); // the reservoir is there
    // North of the reservoir's head and south of the dam's stepped face, not a block differs.
    for (const z of changed) expect(z > 150 && z < d.z + 26, `row z ${z} changed`).toBe(true);
    // And above the dam only rows where the shore had to be raised to hold the water, or lies under it.
    for (const z of changed) {
      if (z >= d.z - 8) continue;
      let touched = false;
      // (From two blocks inside the rim's line: a cave no longer cut under the water's edge changes the moss on the rock beside it.)
      for (let x = 640; x < 672 && !touched; x++) { const rd = x - ravineX(z); if (rd >= 20 && rd < 44 && outsideHeight(x, z) <= d.water + 2) touched = true; }
      expect(touched, `row z ${z}: no shore here, yet it changed`).toBe(true);
    }
    expect(changed.length).toBeLessThan(300);
  });
});

describe('the land of earlier phases', () => {
  /** The only columns east of x 672 that Phase 7 may change: the dam road's corridor (the lot's kerb, smoothed, lies in its last two). */
  const MAY_CHANGE = new Set(['21,23', '22,23', '23,23', '24,23', '25,23']);

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
  it('keeps the sun’s share apart from the creek’s, for the computer’s Solar line (it showed the hydro’s 2 kW with no array)', () => {
    const s = newPower();
    stepPower(s, home({ hydro_generator: 1 }), 0, 5);
    expect(s.solar).toBe(0);
    expect(s.made).toBeCloseTo(HYDRO_KW);
    stepPower(s, home({ hydro_generator: 1, solar_array: 2 }), 12, 5);
    expect(s.solar).toBeCloseTo(2, 1);
    expect(s.made).toBeCloseTo(4, 1);
  });

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
  DULL, KEEN, DAZZLED, SLOTS, ALL_ASHEN, MAX_HUNTING, STUMBLE, LUNGE_FROM, LEASH, type AshenSenses, type AshenEvent,
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
      // (Phase 8 gave them the ground round the relay station on the ridge, in Zone-4: tests/phase8.test.ts.)
      expect(['zone3', 'zone4']).toContain(zoneAt(x, z));
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

  it('by day hears a sprint at 15 m and mining at 7 m, but not a walk', () => {
    const c = ashenAt(YX, YZ);
    expect(see(c, YX, YZ + 15, { pv: 5.6, sprint: true }, false)).toBe('heard');
    expect(see(c, YX, YZ + 17, { pv: 5.6, sprint: true }, false)).toBe(null);
    expect(see(c, YX, YZ + 7, { mining: true }, false)).toBe('heard');
    expect(see(c, YX, YZ + 9, { mining: true }, false)).toBe(null);
    expect(see(c, YX, YZ + 9, { mining: true }, true)).toBe('heard'); // in the dark it carries to 10 m
    expect(see(c, YX, YZ + 9, { pv: 4 }, false)).toBe(null);
  });

  it('in the dark sees 20 m all round and hears a walk at 7 m', () => {
    const c = ashenAt(YX, YZ);
    const dark = { lightAt: () => 2 }; // night, away from the lamps: the player in the dark too
    expect(see(c, YX, YZ + 19, { pv: 0, ...dark }, true)).toBe('seen'); // behind it, standing still
    expect(see(c, YX, YZ + 21, { pv: 0, ...dark }, true)).toBe(null);
    expect(see(c, YX + 7, YZ, { pv: 4, ...dark }, true)).toBe('heard');
  });

  it('from the dark sees someone standing in light only from close: daylight and lamps are the player’s cover (it saw 20 m out of a dark bay into the road)', () => {
    const c = ashenAt(YX, YZ);
    const pool = (x: number, _y: number, z: number) => (Math.hypot(x - YX, z - YZ) < 3 ? 2 : 15); // it stands in the dark; all round is lit
    expect(see(c, YX, YZ + 19, { lightAt: pool }, true)).toBe(null);
    expect(see(c, YX, YZ + DAZZLED + 1, { lightAt: pool }, true)).toBe(null);
    expect(see(c, YX, YZ + DAZZLED - 1, { lightAt: pool }, true)).toBe('seen');
    // Once it is hunting you it keeps you in view further, light or no.
    expect(ashenSenses(c, senses(YX, YZ + 15, { lightAt: pool }), true, true, flat(FLOOR))).toBe('seen');
  });

  it('hears a walk or a pick only with nothing solid between; running carries through a wall (they heard both through the wall that parts a building)', () => {
    const c = ashenAt(YX, YZ);
    const walled = (x: number, y: number, z: number) => (y < FLOOR || (z === YZ + 3 && y < FLOOR + 5) ? STONE : 0);
    const dark = { lightAt: () => 2 };
    const hear = (o: Partial<AshenSenses>, blockAt: (x: number, y: number, z: number) => number) => ashenSenses(c, senses(YX + 0.5, YZ + 6.5, { ...dark, ...o }), true, false, blockAt);
    expect(hear({ pv: 4 }, flat(FLOOR))).toBe('heard');
    expect(hear({ mining: true }, flat(FLOOR))).toBe('heard');
    expect(hear({ pv: 4 }, walled)).toBe(null);
    expect(hear({ mining: true }, walled)).toBe(null);
    expect(hear({ pv: 4, mining: true }, walled)).toBe(null);
    expect(hear({ pv: 5.6, sprint: true }, walled)).toBe('heard');
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
    // (Phase 8 added the relay station's two on the ridge, after Zone-3's nine: bits 9 and 10.)
    expect(SLOTS.filter((q) => q.nest < ZONE3.nests.length).length).toBe(9);
    expect(ALL_ASHEN & 511).toBe(511);
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

  it('the first one does not stand in the road all night: at dusk it roams like the rest, and at dawn it goes in (it stood there for good)', () => {
    const c = ashenAt(YX, YZ); // posted, out of its nest
    const far = () => senses(YX + 70, YZ, { night: true, lightAt: () => 2 });
    run(c, far, 1);
    expect(c.post).toBeUndefined();
    run(c, () => senses(YX + 70, YZ), 90); // day again, the player well away
    const n = ZONE3.nests[3];
    expect(Math.hypot(c.x - n.x, c.z - n.z)).toBeLessThan(2);
  });

  it('one stuck on its way home slips back only unseen: never into a nest the player stands at (it measured to itself, not the nest)', () => {
    const n = ZONE3.nests[3], bx = 553, bz = 944; // boxed in south of the shed, 35 m from its nest
    const box = (x: number, y: number, z: number) => y < FLOOR + 4 && Math.max(Math.abs(x - bx), Math.abs(z - bz)) === 2;
    const screen = (_x: number, y: number, z: number) => y < FLOOR + 4 && z === 920; // a wall between the box and the nest
    const stuck = () => { const c = makeCreature('ashen', bx + 0.5, FLOOR, bz + 0.5); c.nest = 3; c.squad = 1; c.leg = 0; c.lost = 41; return c; };
    const step = (c: Creature, px: number, pz: number, blockAt: (x: number, y: number, z: number) => number) => { for (let k = 0; k < 20; k++) thinkAshen(c, 1 / 20, senses(px, pz), 0, blockAt, makeRng(1)); };
    const home = (c: Creature) => Math.hypot(c.x - n.x, c.z - n.z) < 2;
    const boxed = (x: number, y: number, z: number) => (y < FLOOR || box(x, y, z) ? STONE : 0);
    const hidden = (x: number, y: number, z: number) => (y < FLOOR || box(x, y, z) || screen(x, y, z) ? STONE : 0);
    // The player stands at the nest, 35 m from it: it does not appear beside them.
    let c = stuck();
    step(c, n.x, n.z + 1, boxed);
    expect(home(c)).toBe(false);
    // The player 15 m off, walls between them and it, but the nest in plain view: it stays.
    c = stuck();
    step(c, bx + 15.5, bz + 0.5, boxed);
    expect(home(c)).toBe(false);
    // The same, the nest hidden too: it slips home (it used to wait until the player was 30 m off).
    c = stuck();
    step(c, bx + 15.5, bz + 0.5, hidden);
    expect(home(c)).toBe(true);
    // Too near, walls or no: it stays.
    c = stuck();
    step(c, bx + 6.5, bz + 0.5, hidden);
    expect(home(c)).toBe(false);
    // Far from both, in the open: it slips home as before.
    c = stuck();
    step(c, bx + 40.5, bz + 40.5, boxed);
    expect(home(c)).toBe(true);
  });

  it('one killed by an arrow is down from that moment: the roll-call in the same update does not put another in its place', () => {
    const w = new Wild();
    const n = ZONE3.nests[1], ground = flat(nestFloor(1));
    w.ashen.firstOut = false;
    const s = (o: object = {}) => ({ px: n.x - 6, py: nestFloor(1), pz: n.z, night: false, shot: false, blockAt: ground, loaded: () => true, rand: makeRng(5), lightAt: () => 15, ...o });
    w.update(0.05, s()); // the roll-call: the nests near are manned
    const pair = w.creatures.filter((c) => c.kind === 'ashen' && c.nest === 1);
    expect(pair.length).toBe(2);
    const target = pair[0];
    target.hp = 1;
    w.arrows.push({ x: target.x - 1.5, y: target.y + 1, z: target.z, vx: 40, vy: 0, vz: 0, damage: 20, stuck: false, age: 0 });
    const ev = w.update(1.5, s()); // thirty steps at once (a slow frame): the arrow lands, and a roll-call follows
    expect(ev.kills).toContain(target);
    expect(w.ashen.down & target.squad!).toBe(target.squad);
    expect(w.creatures.filter((c) => c.kind === 'ashen' && c.squad === target.squad).length).toBe(0);
  });

  it('is heard coming: a footfall each stride while it runs at you, none while it stands', () => {
    const c = ashenAt(YX, YZ);
    c.post = undefined; c.mind = 'charge';
    const steps = run(c, () => senses(YX, YZ - 30), 2).filter((e) => e.kind === 'step').length;
    expect(steps).toBeGreaterThanOrEqual(3);
    const d = ashenAt(YX, YZ);
    expect(run(d, () => senses(YX + 60, YZ), 5).filter((e) => e.kind === 'step')).toEqual([]);
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

// ---- The strip mall's lot and the highway (docs/PHASE7.md, 7) -------------------------------------------------
describe('the strip mall’s lot', () => {
  it('never stands above the highway beside it (its south end used to: a kerb a block high)', () => {
    const l = ZONE2.lot;
    for (let z = l.z0; z < l.z1; z++) {
      const edge = Math.ceil(highwayX(z) + ZONE2.highway.halfWidth); // the first block past the asphalt
      expect(outsideHeight(edge, z), `z ${z}`).toBeLessThanOrEqual(highwayHeight(z));
      expect(highwayHeight(z) - outsideHeight(edge, z), `z ${z}`).toBeLessThanOrEqual(1);
    }
    // And the highway itself still never steps more than a block.
    for (let z = l.z0 - 10; z < l.z1 + 12; z++) expect(Math.abs(highwayHeight(z) - highwayHeight(z + 1))).toBeLessThanOrEqual(1);
  });
});

// ---- Zone-3's places, built and lit (docs/PHASE7.md, 1) -----------------------------------------------------
import { load } from './load.ts';
import { blockName, B_SOLID, isWaterId } from '../src/world/blocks.ts';
import { blockOf, skyOf } from '../src/world/light.ts';
import { zone3Floor, onFarRoad as farRoad, onDamCrest, ROLLING } from '../src/gen/layout.ts';
import * as Z3 from '../src/gen/zone3.ts';
import { initialContents } from '../src/gen/inheritance.ts';
import { floorNear } from '../src/entity/wild.ts';
import { LIGHT_KEEN } from '../src/entity/ashen.ts';

/** Zone-3 west of the gorge with the dam and its road, generated and lit once for the tests below. */
let worksWorld: World | null = null;
const works = (): World => (worksWorld ??= load(488, 738, 700, 1036));

describe('Zone-3’s places, built and lit', () => {
  const Z = ZONE3, D = Z.dam, A = Z.avenue;
  const w = works();
  const name = (x: number, y: number, z: number) => blockName(w.blockAt(x, y, z));
  const base = (x: number, y: number, z: number) => name(x, y, z).split('@')[0];
  const lamp = (x: number, y: number, z: number) => blockOf(w.lightAt(x, y, z));
  /** The light the Ashen live by at noon: daylight where it reaches, or lamplight. */
  const noon = (x: number, y: number, z: number) => Math.max(skyOf(w.lightAt(x, y, z)), lamp(x, y, z));
  const open = (x: number, y: number, z: number) => !B_SOLID[w.blockAt(x, y, z)] && !B_SOLID[w.blockAt(x, y + 1, z)];
  const count = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, n: string) => { let k = 0; for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) if (base(x, y, z) === n) k++; return k; };

  it('builds the dam: a level deck between parapets from rim to rim, concrete to the gorge’s floor, lit end to end', () => {
    for (let x = D.x0; x < D.x1; x++) {
      for (const z of [D.z - 2, D.z - 1, D.z, D.z + 1]) {
        expect(onDamCrest(x, z)).toBe(true);
        expect(B_SOLID[w.blockAt(x, D.crest - 1, z)], `deck at ${x},${z}`).toBe(1);
        expect(open(x, D.crest, z), `clear over the deck at ${x},${z}`).toBe(true);
      }
      for (const z of [D.z - 3, D.z + 2]) expect(B_SOLID[w.blockAt(x, D.crest, z)], `a parapet at ${x},${z}`).toBe(1);
      expect(lamp(x, D.crest + 1, D.z)).toBeGreaterThanOrEqual(7);
    }
    for (let y = 44; y < D.crest; y++) expect(name(D.spill + 6, y, D.z)).toBe('concrete');
    expect(count(D.x0, D.x1, D.crest, D.crest + 1, D.z - 3, D.z + 3, 'dam_parapet')).toBeGreaterThan(80);
  });

  it('holds the reservoir behind it and pours the spillway down its face into a pool; the river thins and sinks', () => {
    expect(name(D.spill, D.water - 1, D.z - 5)).toBe('water');
    expect(name(D.spill, 50, D.z - 5)).toBe('water'); // deep, to the gorge's floor
    expect(name(D.spill, D.water, D.z - 5)).toBe('air');
    expect(name(D.spill, 60, D.z + 3)).toBe('falling_water');
    expect(isWaterId(w.blockAt(D.spill, 41, D.z + 8))).toBe(true); // the plunge pool
    expect(isWaterId(w.blockAt(Math.round(ravineX(D.z + 60)), 41, D.z + 60))).toBe(true); // the stream
    // Below the sink, and at the broken bridge, the gorge is dry.
    const b = ZONE1FAR.bridge;
    for (let x = b.far; x <= b.near; x++) for (let z = b.z - 8; z <= b.z + 8; z++) for (let y = 36; y < 60; y++) expect(isWaterId(w.blockAt(x, y, z)), `water at ${x},${y},${z}`).toBe(false);
    for (let x = 600; x < 680; x++) expect(isWaterId(w.blockAt(x, 41, Z.river.sink + 12))).toBe(false);
  });

  it('paves and lights the dam road, with the sign at the highway and the faction’s barricade short of the dam', () => {
    const east = load(672, 738, 815, 768);
    const n2 = (x: number, y: number, z: number) => blockName(east.blockAt(x, y, z)).split('@')[0];
    for (let x = D.x1; x < 795; x++) {
      const y = damRoadHeight(x);
      expect(['road', 'gravel', 'dirt']).toContain(x < 672 ? base(x, y - 1, D.z) : n2(x, y - 1, D.z));
    }
    let signs = 0, boards = 0, barriers = 0, flags = 0;
    for (let y = 80; y < 98; y++) for (let z = D.z - 6; z < D.z + 8; z++) for (let x = 672; x < 808; x++) {
      const b = n2(x, y, z);
      if (b === 'dam_sign') signs++;
      if (b === 'cenizos_board') boards++;
      if (b === 'concrete_barrier') barriers++;
      if (b === 'faction_flag') flags++;
    }
    expect(signs).toBe(4);
    expect(boards).toBe(2);
    expect(barriers).toBe(4);
    expect(flags).toBe(2);
    // The barricade is a chicane, not a wall: there is a way through on foot.
    const bx = Z.barricade.x, y = damRoadHeight(bx);
    expect(!B_SOLID[east.blockAt(bx, y, D.z)] || !B_SOLID[east.blockAt(bx, y, D.z + 1)]).toBe(true);
    expect(!B_SOLID[east.blockAt(bx + 3, y, D.z - 2)] || !B_SOLID[east.blockAt(bx + 3, y, D.z - 1)]).toBe(true);
  });

  it('lights the avenue from the bend to the old road: no step of it is in the dark', () => {
    for (let z = D.z + 3; z < A.z1 - 1; z++) {
      const y = outsideHeight(A.x, z);
      expect(['road', 'gravel', 'dirt']).toContain(name(A.x, y - 1, z));
      expect(open(A.x, y, z), `clear at z ${z}`).toBe(true);
      expect(lamp(A.x, y + 1, z), `light at z ${z}`).toBeGreaterThanOrEqual(LIGHT_KEEN);
    }
    for (let x = A.x + 2; x < D.x0; x++) expect(lamp(x, D.crest + 1, D.z)).toBeGreaterThanOrEqual(LIGHT_KEEN);
    // No tree stands on any of it.
    for (let z = D.z; z < A.z1; z += 2) for (let y = outsideHeight(A.x, z); y < outsideHeight(A.x, z) + 6; y++) for (let x = A.x - 2; x < A.x + 2; x++) expect(['log', 'tree_fern_trunk']).not.toContain(name(x, y, z));
  });

  it('builds the control house at the dam’s end: a lit room, the logbook on the desk, a door on the road', () => {
    const c = Z.control, [dx, dy, dz] = Z3.LOGBOOK_DESK;
    expect(name(dx, dy, dz)).toBe('logbook_desk');
    expect(lamp(dx, dy + 1, dz - 1)).toBeGreaterThanOrEqual(9);
    expect(open(c.x0 + 3, zone3Floor.control, c.z1 - 1)).toBe(true); // the door
    expect(open(c.x0 + 3, zone3Floor.control, c.z1)).toBe(true); // onto the crest road's edge
    expect(open(dx, dy, dz + 2) || open(dx - 1, dy, dz)).toBe(true); // room to walk up to the desk
  });

  const halls = [
    { what: 'the powerhouse', b: Z.powerhouse, floor: zone3Floor.powerhouse, split: Z3.POWER_SPLIT, side: 'west', nest: 0, sign: 'powerhouse_sign' },
    { what: 'the machine shop', b: Z.shop, floor: zone3Floor.shop, split: Z3.SHOP_SPLIT, side: 'west', nest: 1, sign: 'taller_sign' },
    { what: 'the foundry', b: Z.foundry, floor: zone3Floor.foundry, split: Z3.FOUNDRY_SPLIT, side: 'east', nest: 2, sign: 'fundicion_sign' },
  ] as const;

  it('lights the half of each building you enter, with its sign over the door and a lamp either side', () => {
    for (const h of halls) {
      const b = h.b, wallX = h.side === 'west' ? b.x0 : b.x1 - 1, out = h.side === 'west' ? -1 : 1;
      for (const z of [b.door, b.door + 1]) { expect(open(wallX, h.floor, z), `${h.what}: the door`).toBe(true); expect(open(wallX + out, h.floor, z)).toBe(true); }
      expect(count(wallX + out, wallX + out + 1, h.floor + 3, h.floor + 6, b.door - 2, b.door + 4, h.sign), h.what).toBe(2);
      expect(count(wallX + out, wallX + out + 1, h.floor + 3, h.floor + 6, b.door - 2, b.door + 4, 'lantern'), h.what).toBe(2);
      let dim = 0, cells = 0;
      for (let z = b.z0 + 1; z < h.split; z++) for (let x = b.x0 + 1; x < b.x1 - 1; x++) {
        if (!open(x, h.floor, z)) continue;
        cells++;
        if (lamp(x, h.floor + 1, z) < 8) dim++;
      }
      expect(cells, h.what).toBeGreaterThan(100);
      expect(dim, `${h.what}: dim cells in the lit half`).toBe(0);
    }
  });

  it('walls the dark half off from the lit one, with its own open bay; it is dark at noon, and that is where the nest is', () => {
    for (const h of halls) {
      const b = h.b, wallX = h.side === 'west' ? b.x0 : b.x1 - 1, out = h.side === 'west' ? -1 : 1, n = Z.nests[h.nest];
      for (let x = b.x0; x < b.x1; x++) for (let y = h.floor; y < h.floor + 5; y++) expect(B_SOLID[w.blockAt(x, y, h.split)], `${h.what}: the wall across at ${x},${y}`).toBe(1);
      for (let z = b.bay; z < b.bay + 4; z++) for (let y = h.floor; y < h.floor + 4; y++) expect(B_SOLID[w.blockAt(wallX, y, z)], `${h.what}: the bay`).toBe(0);
      expect(n.z).toBeGreaterThan(h.split);
      expect(noon(Math.floor(n.x), h.floor + 1, Math.floor(n.z)), `${h.what}: light at the nest`).toBeLessThan(LIGHT_KEEN);
      expect(base(Math.floor(n.x), h.floor, Math.floor(n.z))).toBe('pale_stain');
      // Its way out is one straight clear line to open daylight outside the bay.
      const [ex, ez] = n.path[n.path.length - 1];
      expect(Math.sign(ex - wallX)).toBe(out);
      const steps = Math.ceil(Math.hypot(ex - n.x, ez - n.z) / 0.5);
      for (let k = 0; k <= steps; k++) { const x = Math.floor(n.x + ((ex - n.x) * k) / steps), z = Math.floor(n.z + ((ez - n.z) * k) / steps); expect(open(x, h.floor, z), `${h.what}: the way out at ${x},${z}`).toBe(true); }
      expect(ashenGround(ex, ez)).toBe(true);
      expect(skyOf(w.lightAt(Math.floor(ex), outsideHeight(Math.floor(ex), Math.floor(ez)) + 1, Math.floor(ez)))).toBeGreaterThanOrEqual(12);
    }
  });

  it('puts what M4 needs in the lit halves, each with room to walk up to it', () => {
    const P = Z.powerhouse, S = Z.shop, F = Z.foundry;
    expect(name(...Z3.PARTS_CRATE)).toBe('stock_crate');
    expect(base(...Z3.TOOL_LOCKER)).toBe('steel_locker');
    for (const c of Z3.CONTROL_CABINETS) expect(base(...c)).toBe('control_cabinet');
    for (const l of Z3.OLD_LATHES) expect(name(...l)).toBe('old_lathe');
    for (const k of Z3.STEEL_RACKS) expect(name(...k)).toBe('steel_rack');
    expect(Z3.STEEL_RACKS.length).toBe(8);
    expect(name(...Z3.SHOP_CRATE)).toBe('stock_crate');
    expect(name(...Z3.FOUNDRY_CRUCIBLE)).toBe('foundry_crucible');
    expect(count(P.x0, P.x1, zone3Floor.powerhouse, zone3Floor.powerhouse + 3, P.z0, Z3.POWER_SPLIT, 'turbine')).toBe(27);
    const things: [string, [number, number, number], number][] = [
      ['the parts crate', Z3.PARTS_CRATE, Z3.POWER_SPLIT], ['the tool locker', Z3.TOOL_LOCKER, Z3.POWER_SPLIT], ['a control cabinet', Z3.CONTROL_CABINETS[0], Z3.POWER_SPLIT],
      ['a lathe', Z3.OLD_LATHES[0], Z3.SHOP_SPLIT], ['the steel racks', Z3.STEEL_RACKS[0], Z3.SHOP_SPLIT], ['the shop’s crate', Z3.SHOP_CRATE, Z3.SHOP_SPLIT], ['the crucible', Z3.FOUNDRY_CRUCIBLE, Z3.FOUNDRY_SPLIT],
    ];
    for (const [what, [x, y, z], split] of things) {
      expect(z, `${what}: on the lit side of the wall`).toBeLessThan(split);
      expect([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => open(x + dx, y, z + dz)), `${what}: room beside it`).toBe(true);
      expect(lamp(x, y + 1, z) >= 9 || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => lamp(x + dx, y + 1, z + dz) >= 9), `${what}: lit`).toBe(true);
    }
    void F; void S;
  });

  it('fills the containers: the turbine parts, the sluice tools, two more rigs’ worth of electronics', () => {
    const at = ([x, y, z]: [number, number, number]) => initialContents(x, y, z).filter(Boolean).map((s) => [s!.id, s!.count]);
    const has = (c: [number, number, number], n: string) => at(c).find(([id]) => id === itemId(n))?.[1] ?? 0;
    expect(has(Z3.PARTS_CRATE, 'turbine_parts')).toBe(1);
    expect(has(Z3.TOOL_LOCKER, 'sluice_tools')).toBe(1);
    const cabs = Z3.CONTROL_CABINETS;
    expect(has(cabs[0], 'gpu') + has(cabs[1], 'gpu')).toBe(2);
    expect(has(cabs[0], 'mining_board') + has(cabs[1], 'mining_board')).toBe(2);
    expect(has(cabs[0], 'psu') + has(cabs[1], 'psu')).toBe(1);
    expect(has(Z3.SHOP_CRATE, 'steel_stock')).toBeGreaterThan(0);
    expect(has(Z3.BOXCAR_CRATE, 'canvas')).toBeGreaterThan(0);
  });

  it('builds the rail yard: two tracks, the engine shed dark at the back, the signal box’s red light, the stock', () => {
    const Y = Z.yard, YF = zone3Floor.yard, E = Z.engineShed;
    for (const t of Y.tracks) for (let z = E.z1 + 1; z < Y.z1; z++) expect(base(t, YF, z) === 'rail' || B_SOLID[w.blockAt(t, YF + 1, z)] === 1, `rail at ${t},${z}`).toBe(true);
    expect(count(Y.x0, Y.x1, YF, YF + 12, Y.z0, Y.z0 + 16, 'red_beacon')).toBe(1);
    expect(count(Y.x0, Y.x1, YF, YF + 6, Y.z0, Y.z1, 'loco_body')).toBeGreaterThan(80);
    expect(count(Y.x0, Y.x1, YF, YF + 6, Y.z0, Y.z1, 'coal_heap')).toBeGreaterThanOrEqual(24);
    expect(count(Y.x0, Y.x1, YF, YF + 6, Y.z0, Y.z1, 'plate_stack')).toBeGreaterThanOrEqual(10);
    expect(name(...Z3.BOXCAR_CRATE)).toBe('stock_crate');
    const [cx, cy, cz] = Z3.BOXCAR_CRATE;
    expect(open(cx + 1, cy - 1, cz)).toBe(true); // reached from the platform side
    const n = Z.nests[3];
    expect(noon(Math.floor(n.x), YF + 1, Math.floor(n.z))).toBeLessThan(LIGHT_KEEN);
    for (let z = Math.floor(n.z); z <= Math.floor(n.path[0][1]); z++) expect(open(Math.floor(n.x), YF, z), `the shed's way out at z ${z}`).toBe(true);
    // Nothing grows on the yard.
    expect(count(Y.x0, Y.x1, YF, YF + 1, Y.z0 + 20, Y.z1, 'fern') + count(Y.x0, Y.x1, YF, YF + 12, Y.z0, Y.z1, 'log')).toBe(0);
  });

  it('builds the mine: a lit trail and decline with no step over one block, a gallery thick with iron and coal, an unlit drift', () => {
    const M = Z.mine, G = M.gallery, gf = Z3.GALLERY_FLOOR, YF = zone3Floor.yard;
    expect(gf).toBe(YF - M.depth);
    let y = YF;
    for (let x = M.headX + 2; x >= G.x1; x--) {
      const f = floorNear(x + 0.5, y, M.z + 0.5, (bx, by, bz) => w.blockAt(bx, by, bz));
      expect(f, `a floor on the way down at x ${x}`).not.toBe(null);
      expect(Math.abs(f! - y)).toBeLessThanOrEqual(1);
      y = f!;
      if (x < M.headX - 1) expect(lamp(x, y + 1, M.z), `lit on the way down at x ${x}`).toBeGreaterThanOrEqual(8);
    }
    expect(y).toBe(gf);
    let dim = 0;
    for (let z = G.z0; z < G.z1; z++) for (let x = G.x0; x < G.x1; x++) { expect(open(x, gf, z) || name(x, gf, z) === 'lantern').toBe(true); if (lamp(x, gf + 1, z) < 7) dim++; }
    expect(dim).toBe(0);
    expect(count(G.x0 - 1, G.x1 + 1, gf, gf + 5, G.z0 - 1, G.z1 + 1, 'iron_ore')).toBeGreaterThan(60);
    expect(count(G.x0 - 1, G.x1 + 1, gf, gf + 5, G.z0 - 1, G.z1 + 1, 'coal_ore')).toBeGreaterThan(60);
    // The drift: open from the gallery to the nest, and dark there.
    const n = Z.nests[4];
    for (let z = Math.floor(n.z) - 1; z < G.z0; z++) expect(open(M.drift.x, gf, z), `the drift at z ${z}`).toBe(true);
    expect(lamp(Math.floor(n.x), gf + 1, Math.floor(n.z))).toBeLessThan(LIGHT_KEEN);
    expect(skyOf(w.lightAt(Math.floor(n.x), gf + 1, Math.floor(n.z)))).toBe(0);
    expect(count(M.drift.x - 1, M.drift.x + 2, gf, gf + 3, M.drift.z0, G.z0 - 3, 'lantern')).toBe(0);
    expect(name(M.headX + 1, YF + 5, M.z)).toBe('mina_sign@east');
  });

  it('carries the old road on past the body to a level crossing with two red lights, and lights it', () => {
    const b = ZONE1FAR.bridge, body = ZONE1FAR.body;
    for (let x = Z.farRoad.west + 1; x < b.far - 4; x++) {
      const z = Math.floor(farRoadZ(x)), y = outsideHeight(x, z);
      expect(farRoad(x, z)).toBe(true);
      expect(['road', 'gravel', 'dirt'], `x ${x}`).toContain(name(x, y - 1, z));
      expect(lamp(x, y + 1, z), `light at x ${x}`).toBeGreaterThanOrEqual(6);
    }
    for (const [lx, lz] of Z3.CROSSING_LIGHTS) { const g = outsideHeight(lx, lz); expect(name(lx, g + 2, lz)).toBe('red_beacon'); expect(name(lx, g + 3, lz)).toBe('crossing_sign'); }
    // Phase 5's body still lies on its rise beside the road, with its stain.
    expect(name(body.x, body.y, body.z)).toBe('pale_body');
    expect(name(body.x + 1, body.y, body.z)).toBe('pale_legs');
    expect(lamp(body.x, body.y + 1, body.z), 'the body is lit at night now').toBeGreaterThanOrEqual(4);
  });

  it('cuts no cave under any of it, nor into the reservoir', () => {
    const air = (x: number, y: number, z: number) => w.blockAt(x, y, z) === 0;
    for (const b of [Z.control, Z.powerhouse, Z.shop, Z.foundry, Z.engineShed]) for (let z = b.z0; z < b.z1; z += 2) for (let x = b.x0; x < b.x1; x += 2) for (let y = 40; y < outsideHeight(x, z) - 1; y += 2) expect(air(x, y, z), `a cave under ${x},${y},${z}`).toBe(false);
    for (let z = 742; z < 748; z++) for (let x = Math.round(ravineX(z)) - 8; x < ravineX(z) + 8; x++) for (let y = 32; y < 41; y++) expect(air(x, y, z), `a cave under the reservoir at ${x},${y},${z}`).toBe(false);
  });

  it('gives each of the nine a floor to stand on in its nest, in the dark, and the first one a place in the lit road', () => {
    const floor = (x: number, y: number, z: number) => floorNear(x, y, z, (bx, by, bz) => w.blockAt(bx, by, bz));
    const st = newAshen();
    st.firstOut = false;
    const all: Creature[] = [];
    for (const n of Z.nests) all.push(...manAshen(all, st, n.x, n.z, false, (x, z) => w.isLoaded(x, z), floor));
    expect(all.length).toBe(9);
    for (const c of all) {
      expect(fits(c, c.x, c.y, c.z, (x, y, z) => w.blockAt(x, y, z)), `nest ${c.nest}: it fits where it stands`).toBe(true);
      expect(noon(Math.floor(c.x), Math.floor(c.y) + 1, Math.floor(c.z)), `nest ${c.nest}: in the dark`).toBeLessThan(LIGHT_KEEN);
    }
    const first = manAshen([], newAshen(), Z.firstAshen.x, Z.firstAshen.z - 30, false, (x, z) => w.isLoaded(x, z), floor).find((c) => c.post)!;
    expect(first.y).toBe(outsideHeight(A.x, Math.floor(Z.firstAshen.z)));
    expect(skyOf(w.lightAt(Math.floor(first.x), first.y + 1, Math.floor(first.z)))).toBeGreaterThanOrEqual(12); // in daylight: dull
  });
});

describe('the Ashen in the real buildings', () => {
  const Z = ZONE3, S = Z.shop, SF = zone3Floor.shop;
  const w = load(560, 830, 620, 880);
  const blockAt = (x: number, y: number, z: number) => w.blockAt(x, y, z);
  const noonLight = (x: number, y: number, z: number) => { const l = w.lightAt(x, y, z); return Math.max(skyOf(l), blockOf(l)); };
  const shopPair = () => { const st = newAshen(); st.firstOut = false; return manAshen([], st, Z.nests[1].x, Z.nests[1].z, false, (x, z) => w.isLoaded(x, z), (x, y, z) => floorNear(x, y, z, blockAt)).filter((c) => c.nest === 1); };
  const sense = (px: number, pz: number, o: Partial<AshenSenses> = {}): AshenSenses => ({ px, py: SF, pz, pv: 0, sprint: false, playerInSanctuary: false, night: false, shot: false, lightAt: noonLight, ...o });

  it('a player in the lit half by day, walking, opening crates and mining a lathe, wakes nothing behind the wall', () => {
    const pair = shopPair();
    expect(pair.length).toBe(2);
    const [lx, , lz] = Z3.OLD_LATHES[1];
    const rand = makeRng(9);
    const ev: AshenEvent[] = [];
    for (let k = 0; k < 20 * 20; k++) for (const c of pair) ev.push(...thinkAshen(c, 1 / 20, sense(lx + 0.5, lz + 1.5, { pv: k % 40 < 20 ? 4 : 0, mining: k % 40 >= 20 }), 0, blockAt, rand));
    expect(ev.filter((e) => e.kind !== 'breath')).toEqual([]);
    for (const c of pair) expect(c.z).toBeGreaterThan(Z3.SHOP_SPLIT);
  });

  it('one that hears a sprint in the lit half goes out by its own bay, never through a wall, and is dull in the daylight outside', () => {
    const [c] = shopPair();
    const rand = makeRng(4);
    let noticed = false, out = false;
    for (let k = 0; k < 20 * 14; k++) {
      // The player runs up and down the lit half, by the door.
      const pz = S.door + 0.5 + 3 * Math.sin(k / 15);
      for (const e of thinkAshen(c, 1 / 20, sense(S.x0 + 4.5, pz, { pv: 5.6, sprint: true }), 0, blockAt, rand)) if (e.kind === 'notice') noticed = true;
      expect(fits(c, c.x, c.y, c.z, blockAt), `inside a wall at ${c.x.toFixed(1)},${c.z.toFixed(1)}`).toBe(true);
      if (c.x < S.x0 - 0.5) { out = true; expect(c.keen, 'dull once out in the daylight').toBe(false); }
    }
    expect(noticed).toBe(true);
    expect(out, 'it came out through its bay').toBe(true);
  });
});

describe('the Ashen and a careful player, in the real land (the review’s walk)', () => {
  const Z = ZONE3, A = Z.avenue, D = Z.dam;
  const w = works();
  const blockAt = (x: number, y: number, z: number) => w.blockAt(x, y, z);
  const noonLight = (x: number, y: number, z: number) => { const l = w.lightAt(x, y, z); return Math.max(skyOf(l), blockOf(l)); };
  const nine = () => {
    const st = newAshen(); st.firstOut = false;
    const all: Creature[] = [];
    for (const n of Z.nests) all.push(...manAshen(all, st, n.x, n.z, false, (x, z) => w.isLoaded(x, z), (x, y, z) => floorNear(x, y, z, blockAt)));
    return all;
  };
  const sense = (px: number, py: number, pz: number, o: Partial<AshenSenses> = {}): AshenSenses => ({ px, py, pz, pv: 0, sprint: false, playerInSanctuary: false, night: false, shot: false, lightAt: noonLight, ...o });
  const tick = (all: Creature[], s: AshenSenses, rand: () => number, into: AshenEvent[]) => {
    for (const c of all) into.push(...thinkAshen(c, 1 / 20, s, all.filter((o) => o !== c && isHunting(o)).length, blockAt, rand).filter((e) => e.kind === 'notice'));
  };

  it('walking the avenue by day, in any lane or on either kerb, wakes none of the nine (the dark bays saw 20 m into the road)', () => {
    for (const lane of [A.x - 3.5, A.x - 1.5, A.x - 0.5, A.x + 0.5, A.x + 1.5]) {
      const all = nine(), rand = makeRng(11), ev: AshenEvent[] = [];
      expect(all.length).toBe(9);
      for (let z = D.z + 4; z < A.z1 - 3; z += WALK / 20) tick(all, sense(lane, outsideHeight(Math.floor(lane), Math.floor(z)), z, { pv: WALK }), rand, ev);
      expect(ev.map((e) => `nest ${e.c.nest} noticed`), `lane x ${lane}`).toEqual([]);
    }
  });

  it('standing in the road outside a dark bay is safe by day; walking into the dark is what wakes them', () => {
    const P = Z.powerhouse, PF = zone3Floor.powerhouse, n = Z.nests[0];
    let all = nine(), ev: AshenEvent[] = [];
    const rand = makeRng(12);
    for (let k = 0; k < 20 * 20; k++) tick(all, sense(P.x0 - 2.5, PF, n.z), rand, ev);
    expect(ev).toEqual([]);
    // In through the roller door, toward the ash on the floor: they have you before you are among them.
    all = nine(); ev = [];
    let at = Infinity;
    for (let x = P.x0 - 2.5; x < n.x - 1 && !ev.length; x += WALK / 20) { tick(all, sense(x, PF, n.z, { pv: WALK }), rand, ev); at = n.x - x; }
    expect(ev.length).toBeGreaterThan(0);
    expect(at).toBeGreaterThan(4);
  });

  it('in the lit halves, walking every open floor and working a pick anywhere wakes nothing behind the wall (the back rows and two steel racks used to)', () => {
    const halves: [typeof Z.shop, number, number][] = [[Z.powerhouse, zone3Floor.powerhouse, Z3.POWER_SPLIT], [Z.shop, zone3Floor.shop, Z3.SHOP_SPLIT], [Z.foundry, zone3Floor.foundry, Z3.FOUNDRY_SPLIT]];
    const all = nine(), rand = makeRng(13), ev: AshenEvent[] = [];
    let cells = 0;
    for (const [b, floor, split] of halves) for (let z = b.z0 + 1; z < split; z++) for (let x = b.x0 + 1; x < b.x1 - 1; x++) {
      if (B_SOLID[w.blockAt(x, floor, z)] || B_SOLID[w.blockAt(x, floor + 1, z)]) continue;
      cells++;
      for (let k = 0; k < 16; k++) tick(all, sense(x + 0.5, floor, z + 0.5, { pv: WALK, mining: k >= 8 }), rand, ev);
    }
    expect(cells).toBeGreaterThan(300);
    expect(ev.map((e) => `nest ${e.c.nest} noticed`)).toEqual([]);
  });
});

describe('the Ashen hunting on the real land: out of each nest by its own door, to the player, and no further than the dam', () => {
  // Every other test of their mind runs on flat ground. These run on the generated blocks: the game has no
  // path-finding, so each nest's way out is a straight leg or two by design, and this is where a wall in the
  // way would show (the review of Phases 0–6: three creature faults appeared only on real blocks).
  const Z = ZONE3, A = Z.avenue, D = Z.dam;
  const w = works();
  const blockAt = (x: number, y: number, z: number) => w.blockAt(x, y, z);
  const noonLight = (x: number, y: number, z: number) => { const l = w.lightAt(x, y, z); return Math.max(skyOf(l), blockOf(l)); };
  const nine = () => {
    const st = newAshen(); st.firstOut = false;
    const all: Creature[] = [];
    for (const n of Z.nests) all.push(...manAshen(all, st, n.x, n.z, false, (x, z) => w.isLoaded(x, z), (x, y, z) => floorNear(x, y, z, blockAt)));
    return all;
  };
  /** Runs the nest's Ashen against a player who keeps running on the spot at (px, pz), until one rears at them. */
  const bringOut = (nest: number, px: number, py: number, pz: number, seconds: number) => {
    const mine = nine().filter((c) => c.nest === nest), rand = makeRng(21 + nest);
    let shriek: Creature | null = null, worst = '';
    for (let k = 0; k < seconds * 20 && !shriek; k++) for (const c of mine) {
      const s: AshenSenses = { px, py, pz, pv: 5.6, sprint: true, playerInSanctuary: false, night: false, shot: false, lightAt: noonLight };
      for (const e of thinkAshen(c, 1 / 20, s, mine.filter((o) => o !== c && isHunting(o)).length, blockAt, rand)) if (e.kind === 'shriek') shriek = e.c;
      if (!fits(c, c.x, c.y, c.z, blockAt)) worst = `inside a block at ${c.x.toFixed(1)},${c.y},${c.z.toFixed(1)}`;
      if (!ashenGround(c.x, c.z)) worst = `off its ground at ${c.x.toFixed(1)},${c.z.toFixed(1)}`;
    }
    return { mine, shriek, worst };
  };

  it('from each of the four nests above ground: a runner in the open outside is reached, by the nest’s own door, never through a block', () => {
    for (const i of [0, 1, 2, 3]) {
      const n = Z.nests[i], [ox, oz] = n.path[n.path.length - 1];
      // The player stands two metres beyond the door's far point, on the line out of the nest.
      const len = Math.hypot(ox - n.x, oz - n.z), px = ox + ((ox - n.x) / len) * 2, pz = oz + ((oz - n.z) / len) * 2;
      const py = outsideHeight(Math.floor(px), Math.floor(pz));
      const r = bringOut(i, px, py, pz, 60);
      expect(r.mine.length, n.name).toBe(n.n);
      expect(r.worst, n.name).toBe('');
      expect(r.shriek, `${n.name}: one of them reached the player and reared`).not.toBeNull();
      expect(Math.hypot(r.shriek!.x - px, r.shriek!.z - pz), n.name).toBeLessThan(LUNGE_FROM);
      expect(r.shriek!.keen, `${n.name}: dull out in the daylight`).toBe(false);
    }
  });

  it('from the mine’s drift: placed there, not spawned; a runner in the gallery is reached down the drift', () => {
    const n = Z.nests[4], gf = Z3.GALLERY_FLOOR;
    const r = bringOut(4, n.path[1][0] + 4, gf, n.path[1][1], 60);
    expect(r.mine.length).toBe(2);
    for (const c of r.mine) expect(c.y).toBe(gf); // under 18 m of rock, where nothing spawns
    expect(r.worst).toBe('');
    expect(r.shriek, 'one of them reached the player and reared').not.toBeNull();
  });

  it('refuses the dam: hunting a player who goes out onto the deck, it stops at the dam’s end and lands nothing', () => {
    const [c] = nine().filter((o) => o.nest === 0);
    c.x = A.x + 4.5; c.z = D.z; c.y = D.crest; c.leg = Z.nests[0].path.length; c.mind = 'charge'; c.lost = 0;
    const rand = makeRng(31), ev: AshenEvent[] = [];
    let px = A.x + 9.5;
    for (let k = 0; k < 20 * 25; k++) {
      px = Math.min(D.x0 + 8.5, px + WALK / 20); // the player walks east along the crest road and out onto the deck
      ev.push(...thinkAshen(c, 1 / 20, { px, py: D.crest, pz: D.z, pv: WALK, sprint: false, playerInSanctuary: false, night: false, shot: false, lightAt: noonLight }, 0, blockAt, rand));
      expect(c.x, 'never onto the deck').toBeLessThan(D.x0 - 1);
      expect(fits(c, c.x, c.y, c.z, blockAt)).toBe(true);
    }
    expect(c.x).toBeGreaterThan(A.x + 8); // it did come after them, as far as it may
    expect(ev.filter((e) => e.kind === 'hit')).toEqual([]);
  });
});

describe('the review’s faults in the land', () => {
  const Z = ZONE3, A = Z.avenue, D = Z.dam, Y = Z.yard, YF = zone3Floor.yard;
  const w = works();
  const name = (x: number, y: number, z: number) => blockName(w.blockAt(x, y, z)).split('@')[0];
  const lamp = (x: number, y: number, z: number) => blockOf(w.lightAt(x, y, z));

  it('leaves no bank between the avenue and the rail yard: from the road’s edge to the tracks no step is over one block (two and three stood at the signal box and the south end)', () => {
    for (let z = Y.z0 - 4; z < Y.z1 + 4; z++) for (let x = Y.tracks[1] + 2; x < A.x - A.halfWidth; x++) {
      expect(Math.abs(outsideHeight(x, z) - outsideHeight(x + 1, z)), `step at ${x},${z}`).toBeLessThanOrEqual(1);
      if (x < A.x - A.halfWidth - 1) expect(Math.abs(outsideHeight(x, z) - outsideHeight(x, z + 1)), `step at ${x},${z} southward`).toBeLessThanOrEqual(1);
    }
    // The signal box's door is on the yard's level.
    const sb = Z.signalBox;
    expect(outsideHeight(sb.x1, sb.z0 + 2)).toBe(YF);
  });

  it('walls the avenue’s edge where it comes down above the powerhouse’s forecourt (a drop of three to five blocks was open)', () => {
    let walled = 0;
    for (let z = D.z + A.halfWidth; z < Z.powerhouse.door; z++) for (const px of [A.x - A.halfWidth - 1, A.x + A.halfWidth]) {
      const road = outsideHeight(A.x, z);
      if (outsideHeight(px, z) > road - 2) continue;
      walled++;
      const at = name(px, road, z);
      expect(at === 'dam_parapet' || at === 'fence_post' || at === 'arc_lamp', `the edge at ${px},${z}: ${at}`).toBe(true);
      expect(B_SOLID[w.blockAt(px, road - 1, z)], `the wall under it at ${px},${z}`).toBe(1);
    }
    expect(walled).toBeGreaterThan(6);
    // The powerhouse's door is not walled off.
    for (const z of [Z.powerhouse.door, Z.powerhouse.door + 1]) expect(B_SOLID[w.blockAt(A.x + A.halfWidth, zone3Floor.powerhouse, z)]).toBe(0);
  });

  it('keeps the crest road’s lamps out of the control house’s front wall (one stood in it, beside the door)', () => {
    const c = Z.control, CF = zone3Floor.control;
    for (let x = c.x0; x < c.x1; x++) for (let y = CF; y < CF + 4; y++) {
      const at = name(x, y, c.z1 - 1);
      expect(at === 'concrete' || at === 'glass' || at === 'air', `the wall at ${x},${y}: ${at}`).toBe(true);
    }
    // The road in front of it is still lit.
    for (let x = c.x0; x < c.x1; x++) expect(lamp(x, CF + 1, D.z)).toBeGreaterThanOrEqual(LIGHT_KEEN);
  });

  it('runs the tailrace level out of the hall and then down: its water never climbs the bank (it rose three blocks over the rim)', () => {
    const tz = Z3.LIVE_TURBINE[2] + 1, PF = zone3Floor.powerhouse;
    let last = PF, wet = 0;
    for (let x = Z.powerhouse.x1; x < Math.round(ravineX(tz)) - 2; x++) {
      let top = -1;
      for (let y = PF + 6; y > 40 && top < 0; y--) if (isWaterId(w.blockAt(x, y, tz))) top = y;
      if (top < 0) continue;
      wet++;
      expect(top, `the water at x ${x}`).toBeLessThanOrEqual(last);
      last = top;
    }
    expect(wet).toBeGreaterThan(10);
    expect(last).toBeLessThan(60); // it reaches the gorge's floor
  });

  it('hangs every ceiling lamp from the roof by a rod (forty hung in the air)', () => {
    let lamps = 0;
    for (const [b, floor, high, split] of [[Z.powerhouse, zone3Floor.powerhouse, 7, Z3.POWER_SPLIT], [Z.shop, zone3Floor.shop, 6, Z3.SHOP_SPLIT], [Z.foundry, zone3Floor.foundry, 6, Z3.FOUNDRY_SPLIT]] as const)
      for (let z = b.z0 + 1; z < split; z++) for (let x = b.x0 + 1; x < b.x1 - 1; x++) for (let y = floor + 2; y < floor + high; y++) {
        if (name(x, y, z) !== 'lantern') continue;
        lamps++;
        for (let yy = y + 1; yy < floor + high; yy++) expect(name(x, yy, z), `over the lamp at ${x},${y},${z}`).toBe('fence_post');
        expect(name(x, floor + high, z)).toBe('shed_roof');
      }
    expect(lamps).toBeGreaterThan(30);
  });

  it('lights the boxcar’s crate and the coal wagon at night too (they stood in the dark)', () => {
    const [cx, cy, cz] = Z3.BOXCAR_CRATE;
    expect(lamp(cx + 1, cy, cz)).toBeGreaterThanOrEqual(LIGHT_KEEN); // where you stand to open it
    const hop = ROLLING.find((r) => r.kind === 'hopper')!;
    expect(lamp(Y.tracks[1] + 2, YF + 1, (hop.z0 + hop.z1) >> 1)).toBeGreaterThanOrEqual(LIGHT_KEEN);
    // The engine shed stays dark at the back, lamps or no: the nest is still a nest.
    const n = Z.nests[3];
    expect(lamp(Math.floor(n.x), YF + 1, Math.floor(n.z))).toBeLessThan(LIGHT_KEEN);
  });

  it('gives the signal box a way up: an outside stair to a door in the cabin, no step over one block (there was none)', () => {
    const sb = Z.signalBox;
    for (let k = 0; k < 5; k++) {
      const x = sb.x1 - k;
      expect(B_SOLID[w.blockAt(x, YF + k, sb.z1)], `step ${k}`).toBe(1);
      for (let y = YF + k + 1; y < YF + k + 3; y++) expect(B_SOLID[w.blockAt(x, y, sb.z1)], `headroom over step ${k}`).toBe(0);
    }
    expect(outsideHeight(sb.x1 + 1, sb.z1)).toBeGreaterThanOrEqual(YF - 1); // the foot of the stair is reached from the yard
    // From the top step (its top at the cabin's floor) north through the door.
    for (const y of [YF + 5, YF + 6]) { expect(B_SOLID[w.blockAt(sb.x0 + 1, y, sb.z1 - 1)]).toBe(0); expect(B_SOLID[w.blockAt(sb.x0 + 1, y, sb.z1 - 2)]).toBe(0); }
    expect(name(sb.x0 + 1, YF + 4, sb.z1 - 1)).toBe('planks');
  });
});

import { liveFromSave } from '../src/sim/power.ts';
import { Player } from '../src/sim/player.ts';

describe('the review’s faults in saving and loading', () => {
  it('after a reload away from home, a generator on dry ground still makes nothing: only what was turning when saved counts (all did)', () => {
    const dry: [number, number, number] = [1650, 72, 1040], wet: [number, number, number] = [1652, 70, 1044], roofed: [number, number, number] = [1660, 71, 1030], open: [number, number, number] = [1662, 80, 1030];
    const found = { ...home({}), hydro_generator: [dry, wet], solar_array: [roofed, open], mining_rig: [[1655, 71, 1035] as [number, number, number]] };
    const live = liveFromSave(found, { solar: [open], hydro: [wet] });
    expect(live.hydro_generator).toEqual([wet]);
    expect(live.solar_array).toEqual([open]);
    expect(live.mining_rig).toEqual(found.mining_rig);
    // Its land not loaded, each counts as last seen: the dry one stays out.
    expect(turning(found.hydro_generator, () => null, live.hydro_generator)).toEqual([wet]);
    // An older save has no list: nothing counts until its land is seen (and nothing breaks).
    for (const old of [undefined, null, 3, {}, { hydro: 'x' }]) {
      const l = liveFromSave(found, old);
      expect(l.hydro_generator).toEqual([]);
      expect(l.solar_array).toEqual([]);
    }
    // Seen again at home, the wet one turns whatever the save said.
    expect(turning(found.hydro_generator, (x) => x === wet[0], [])).toEqual([wet]);
  });

  it('a save made where the land has since risen does not leave the player inside rock: they are set on the surface (the west bank above the dam rose five to ten blocks)', () => {
    const rock = (_x: number, y: number, _z: number) => (y < 90 ? STONE : 0);
    const p = new Player();
    p.setPosition(560.5, 82, 700.5);
    expect(p.liftOut(rock, 180)).toBe(true);
    expect(p.y).toBe(90);
    // Standing free, nothing happens; nor under a roof with room to stand.
    expect(p.liftOut(rock, 180)).toBe(false);
    const q = new Player();
    q.setPosition(560.5, 82, 700.5);
    const cave = (_x: number, y: number, _z: number) => (y < 82 || y > 86 ? STONE : 0);
    expect(q.liftOut(cave, 180)).toBe(false);
    expect(q.y).toBe(82);
  });
});
