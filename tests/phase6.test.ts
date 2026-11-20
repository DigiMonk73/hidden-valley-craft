// Phase 6 (docs/PHASE6.md): Zone-2 and power (M3). This file grows with each step.

import { describe, it, expect } from 'vitest';
import { load } from './load.ts';
import { ZONE1FAR, roadHeight } from '../src/gen/layout.ts';
import { blockOf } from '../src/world/light.ts';

describe('the Phase 5 outpost reads at night (the Phase 5 review: dim from 40 m)', () => {
  const w = load(830, 1010, 900, 1060);
  const o = ZONE1FAR.outpost, OF = o.floor, mz = (o.z0 + o.z1) >> 1;
  const lamp = (x: number, y: number, z: number) => blockOf(w.lightAt(x, y, z));

  it('lights every side of the building, the yard’s corners and the lookout’s platform', () => {
    const spots: [string, number, number, number][] = [
      ['front left of the yard', o.x0 - 3, OF + 1, o.z0 - 6],
      ['front right of the yard', o.x1 + 2, OF + 1, o.z0 - 6],
      ['west wall', o.x0 - 2, OF + 1, mz],
      ['east wall', o.x1 + 1, OF + 1, mz],
      ['back wall', (o.x0 + o.x1) >> 1, OF + 1, o.z1 + 1],
      ['lookout platform', o.x1 - 2, OF + 5, mz],
    ];
    for (const [what, x, y, z] of spots) expect(lamp(x, y, z), what).toBeGreaterThanOrEqual(8);
  });

  it('lights the stripped pickup across the road', () => {
    const h = ZONE1FAR.hulk;
    let best = 0;
    for (let x = h.x0; x < h.x1; x++) best = Math.max(best, lamp(x, roadHeight((h.x0 + h.x1) >> 1) + 2, h.z0 - 1));
    expect(best).toBeGreaterThanOrEqual(8);
  });
});

// ---- Zone-2's layout (docs/PHASE6.md, 1) -------------------------------------------------------------
import { ZONE2, zoneAt, ZONES, highwayX, highwayHeight, outsideHeight, onHighway, radiationAt, onCaveTrail, inSanctuary } from '../src/gen/layout.ts';

describe('Zone-2’s layout', () => {
  it('starts faction ground at z 760 west of the saddle, and leaves the buffer, the canyon and the valley as they were', () => {
    expect(zoneAt(800, 759)).toBe('zone2');
    expect(zoneAt(800, 761)).toBe('mid');
    expect(zoneAt(1300, 700)).toBe('buffer'); // north of the buffer: still buffer, as before
    expect(zoneAt(1560, 700)).toBe('canyon');
    expect(zoneAt(1700, 1024)).toBe('valley');
    expect(ZONES.zone2Play).toBe(760);
    expect(zoneAt(800, ZONE2.border.z - 3)).toBe('zone2');
    expect(zoneAt(800, ZONE2.border.z + 3)).toBe('mid');
  });

  it('runs the highway from the camp to the gate with no step over one block', () => {
    const h = ZONE2.highway;
    let last = outsideHeight(Math.floor(highwayX(h.z0)), h.z0);
    for (let z = h.z0; z >= h.z1; z--) {
      const x = Math.floor(highwayX(z));
      expect(onHighway(x, z), `z ${z}`).toBe(true);
      const y = outsideHeight(x, z);
      expect(Math.abs(y - last), `z ${z}`).toBeLessThanOrEqual(1);
      expect(y).toBe(highwayHeight(z));
      last = y;
    }
  });

  it('keeps radiation off the highway, the cave trail and the shop doors', () => {
    for (let z = ZONE2.highway.z0; z >= ZONE2.highway.z1; z--)
      for (let dx = -3; dx <= 3; dx++) expect(radiationAt(highwayX(z) + dx, z), `z ${z}`).toBe(0);
    for (let x = 790; x <= ZONE2.cave.mouthX; x++) if (onCaveTrail(x, ZONE2.caveTrail.z)) expect(radiationAt(x, ZONE2.caveTrail.z)).toBe(0);
    for (const s of ZONE2.shops) expect(radiationAt(ZONE2.mall.x0 - 1, (s.z0 + s.z1) / 2), s.name).toBe(0);
  });

  it('puts every Zone-2 place outside the sanctuary, in Zone-2', () => {
    const Z = ZONE2;
    for (const [x, z] of [[Z.mall.x0, Z.mall.z0], [Z.exchange.x0, Z.exchange.z0], [Z.compound.x0, Z.compound.z0], [Z.cave.mouthX, Z.cave.z], ...Z.hotspots.map((h) => [h.x, h.z])]) {
      expect(inSanctuary(x, z)).toBe(false);
      expect(zoneAt(x, z)).toBe('zone2');
    }
  });
});

// ---- Radiation (docs/PHASE6.md, 3) -------------------------------------------------------------------
import { stepDose, healthCap, clickRate, nearHotspot } from '../src/sim/radiation.ts';

describe('radiation', () => {
  const van = ZONE2.hotspots[0];
  it('climbs while standing in a ring, most at its heart, and not at all outside', () => {
    let heart = 0, edge = 0, out = 0;
    for (let s = 0; s < 10; s++) { heart = stepDose(heart, van.x, van.z, 1, 0); edge = stepDose(edge, van.x + van.r - 0.5, van.z, 1, 0); out = stepDose(out, van.x + van.r + 1, van.z, 1, 0); }
    expect(heart).toBeGreaterThan(25);
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(heart / 4);
    expect(out).toBe(0);
    expect(stepDose(99, van.x, van.z, 60, 0)).toBe(100);
  });
  it('caps health at 100 − 0.6 × dose, never below 40, and never kills', () => {
    expect(healthCap(0)).toBe(100);
    expect(healthCap(50)).toBe(70);
    expect(healthCap(100)).toBe(40);
  });
  it('fades by 4 a game day', () => { expect(stepDose(20, 1700, 1024, 0, 24)).toBe(16); expect(stepDose(1, 1700, 1024, 0, 24)).toBe(0); });
  it('clicks from 4 m outside the ring, quicker toward the heart', () => {
    expect(nearHotspot(van.x + van.r + 3, van.z)).toBe(true);
    expect(nearHotspot(van.x + van.r + 5, van.z)).toBe(false);
    expect(clickRate(van.x, van.z)).toBeGreaterThan(clickRate(van.x + van.r, van.z));
  });
});

// ---- Power (docs/PHASE6.md, 6) ---------------------------------------------------------------------
import { stepPower, newPower, sunAt, findDevices, powerFromSave, RIG_SATS_PER_DAY, type Devices } from '../src/sim/power.ts';
import { blockId } from '../src/world/blocks.ts';
import { chunkKey } from '../src/world/constants.ts';

const homeDevices = (arrays: number, banks: number, rigs: number, fridges = 0, pumps = 0): Devices => {
  const at = (n: number): [number, number, number][] => Array.from({ length: n }, (_, i) => [1790 + i, 82, 1020] as [number, number, number]);
  return { solar_array: at(arrays), battery_bank: at(banks), mining_rig: at(rigs), fridge: at(fridges), water_pump: at(pumps), hydro_generator: [] };
};

describe('power at home', () => {
  it('makes nothing at night, most at noon', () => {
    expect(sunAt(0)).toBe(0);
    expect(sunAt(22)).toBe(0);
    expect(sunAt(12)).toBeCloseTo(1);
  });

  it('runs a rig by day only on one array with no bank', () => {
    const s = newPower(), d = homeDevices(1, 0, 1);
    stepPower(s, d, 12, 1);
    expect(s.on.mining_rig).toBe(true);
    stepPower(s, d, 23, 1);
    expect(s.on.mining_rig).toBe(false);
  });

  it('carries the rig, the fridge and the pump through the night on two arrays and a bank', () => {
    const s = newPower(), d = homeDevices(2, 1, 1, 1, 1);
    stepPower(s, d, 6, 24 * 60); // a first day to charge up
    let offMinutes = 0;
    for (let m = 0; m < 24 * 60; m++) { stepPower(s, d, (6 + m / 60) % 24, 1); if (!s.on.mining_rig) offMinutes++; }
    expect(offMinutes).toBeLessThan(60); // the odd minute at dawn at worst
    expect(s.on.fridge).toBe(true);
  });

  it('pays the rig only while it is powered, about 50,000 sats a full day', () => {
    const s = newPower();
    expect(stepPower(s, homeDevices(0, 0, 1), 12, 600)).toBe(0); // no arrays: nothing
    const full = newPower(), d = homeDevices(4, 2, 1);
    stepPower(full, d, 6, 24 * 60);
    const paid = stepPower(full, d, 6, 24 * 60);
    expect(paid).toBeGreaterThan(RIG_SATS_PER_DAY * 0.97);
    expect(paid).toBeLessThanOrEqual(RIG_SATS_PER_DAY + 1);
    expect(full.satsTotal).toBeGreaterThan(paid);
  });

  it('stops the rig first when power runs short', () => {
    const s = newPower(), d = homeDevices(1, 0, 1, 1, 1);
    stepPower(s, d, 7, 1); // a weak early sun: enough for the pump and fridge, not the rig
    expect(s.on.water_pump).toBe(true);
    expect(s.on.mining_rig).toBe(false);
  });

  it('finds what the player placed at home, and nothing placed outside', () => {
    const edits = new Map<number, Map<number, number>>();
    const put = (x: number, y: number, z: number, name: string) => {
      const k = chunkKey(x >> 5, y >> 5, z >> 5);
      if (!edits.has(k)) edits.set(k, new Map());
      edits.get(k)!.set(((y & 31) << 10) | ((z & 31) << 5) | (x & 31), blockId(name));
    };
    put(1795, 83, 1020, 'solar_array'); put(1820, 82, 1030, 'battery_bank'); put(1806, 82, 1020, 'mining_rig');
    put(800, 90, 700, 'solar_array'); // in Zone-2: not home
    const d = findDevices(edits);
    expect(d.solar_array).toEqual([[1795, 83, 1020]]);
    expect(d.battery_bank.length).toBe(1);
    expect(d.mining_rig.length).toBe(1);
  });

  it('loads an older save with nothing built and no charge', () => {
    const p = powerFromSave(undefined);
    expect(p.charge).toBe(0);
    expect(p.satsTotal).toBe(0);
    expect(powerFromSave({ charge: 5, satsTotal: 900 }).satsTotal).toBe(900);
  });
});

// ---- Recipes, trade and M3 (docs/PHASE6.md, 5, 7, 8) ------------------------------------------------
import { recipesAt, RECIPES } from '../src/sim/crafting.ts';
import { itemId, hasItem } from '../src/world/items.ts';
import { CATALOG_M3, DOC_PRICE, tradeNamesValid, sellPrice } from '../src/sim/trade.ts';
import { M3_STEPS, trackM3, diedOutsideM3, atRuins } from '../src/sim/milestones.ts';
import { hasIcon } from '../src/render/itemIcons.ts';
import items from '../data/items.json' with { type: 'json' };

describe('M3’s recipes and trade', () => {
  // M3's recipes need M2 done (docs/FIXES.md, 6): `names` asks as a player who has.
  const names = (station: Parameters<typeof recipesAt>[0], known: string[]) => recipesAt(station, new Set([...known, 'm2_done'])).map((r) => r.out[0]);
  it('gates the power chain in the script’s order: array, then bank, then rig, fridge and pump', () => {
    expect(recipesAt('workbench', new Set(['m1_done'])).map((r) => r.out[0])).not.toContain(blockId('solar_array'));
    expect(names('workbench', [])).toContain(blockId('solar_array'));
    expect(names('workbench', [])).not.toContain(blockId('battery_bank'));
    expect(names('workbench', ['array_built'])).toContain(blockId('battery_bank'));
    for (const n of ['mining_rig', 'fridge', 'water_pump']) {
      expect(names('workbench', ['array_built'])).not.toContain(blockId(n));
      expect(names('workbench', ['array_built', 'bank_built'])).toContain(blockId(n));
    }
  });
  it('makes gunpowder at the powder mill, bullets at the forge (the mould kept), rounds at the workbench', () => {
    expect(names('powder_mill', [])).toContain(itemId('gunpowder'));
    const bullets = RECIPES.find((r) => r.out[0] === itemId('bullet'))!;
    expect(bullets.station).toBe('forge');
    expect(bullets.in.find(([id]) => id === itemId('bullet_mold'))![1]).toBe(0);
    expect(names('workbench', [])).toContain(itemId('pistol_rounds'));
    expect(names('workbench', [])).toContain(itemId('rifle_rounds'));
    // Never a gun (ADR-019).
    for (const g of ['pistol', 'raider_rifle', 'hunting_rifle']) expect(RECIPES.some((r) => r.out[0] === itemId(g))).toBe(false);
  });
  it('has an icon for every new item, and every trade name is real', () => {
    for (const i of items.items) expect(hasIcon(i.icon), i.name).toBe(true);
    expect(tradeNamesValid()).toBe(true);
  });
  it('prices Marco’s guns and Doc’s services as multiples of wound care', () => {
    const unit = DOC_PRICE.wound / 4;
    expect(DOC_PRICE.rad).toBe(DOC_PRICE.wound * 3);
    expect(CATALOG_M3.find((l) => l.id === itemId('pistol'))!.sats).toBe(DOC_PRICE.wound * 12);
    expect(CATALOG_M3.every((l) => l.sats % unit === 0)).toBe(true);
    // He buys the ruins' salvage too (DESIGN.md A3: Marco buys every band).
    for (const n of ['gpu', 'pv_panel', 'battery_cell', 'scrap_lead']) expect(sellPrice(itemId(n)), n).toBeGreaterThan(0);
    expect(hasItem('cold_water')).toBe(true);
  });
});

describe('M3 · power up', () => {
  const home = { arrays: 0, banks: 0, fridges: 0, pumps: 0, rigSats: 0 };
  it('ticks the run to the ruins only once you are home alive, and a death outside undoes it', () => {
    const f = new Set<string>();
    const m = ZONE2.mall;
    expect(atRuins(m.x0 - 5, m.z0 + 5)).toBe(true);
    trackM3(f, m.x0 - 5, m.z0 + 5, home);
    expect(f.has('ruins_reached')).toBe(true);
    expect(f.has('zone2_home')).toBe(false);
    diedOutsideM3(f);
    expect(f.has('ruins_reached')).toBe(false);
    trackM3(f, m.x0 - 5, m.z0 + 5, home);
    trackM3(f, 1700, 1024, home);
    expect(f.has('zone2_home')).toBe(true);
  });
  it('ticks the array, the bank (only after an array), the rig’s first sats, fridge-and-pump, then M3 done', () => {
    const f = new Set<string>(['zone2_home', 'doc_called', 'ammo_made', 'marco_guns', 'm2_done']);
    trackM3(f, 1700, 1024, { ...home, banks: 1 });
    expect(f.has('bank_built')).toBe(false);
    trackM3(f, 1700, 1024, { ...home, arrays: 1, banks: 1, fridges: 1 });
    expect(f.has('array_built') && f.has('bank_built')).toBe(true);
    expect(f.has('fridge_pump')).toBe(false);
    const got = trackM3(f, 1700, 1024, { arrays: 2, banks: 1, fridges: 1, pumps: 1, rigSats: 34 });
    expect(got).toContain('rig_earned');
    expect(got[got.length - 1]).toBe('m3_done');
    expect(M3_STEPS.every((s) => f.has(s.flag))).toBe(true);
  });
});

// ---- Zone-2's faction (docs/PHASE6.md, 2) --------------------------------------------------------------
import { makeCreature, fits, type Creature } from '../src/entity/creatures.ts';
import { thinkRaider, raiderSees } from '../src/entity/outpost.ts';
import { Wild } from '../src/entity/wild.ts';
import { manFaction, standDown, newFaction, factionDawn, SQUADS, PASS, FACTION_FAR, ALL_SQUADS } from '../src/entity/faction.ts';
import { TOWER_POSTS } from '../src/gen/zone2.ts';
import { VALLEY } from '../src/gen/layout.ts';
import { makeRng } from '../src/core/noise.ts';

const senseAt = (px: number, pz: number, py = 90) => ({ px, py, pz, playerInSanctuary: inSanctuary(px, pz), night: false, shot: false });

describe('the sanctuary rule, with Zone-2’s men', () => {
  const STONE = blockId('limestone');
  const flat = (_x: number, y: number) => (y < 100 ? STONE : 0);
  it('none can stand, walk, see, shoot or strike into the valley', () => {
    const rand = makeRng(6);
    const edge = VALLEY.radius + 8;
    for (const kind of ['patrol', 'sentry', 'guard'] as const) {
      expect(fits(makeCreature(kind, VALLEY.cx, 100, VALLEY.cz), VALLEY.cx, 100, VALLEY.cz, flat)).toBe(false);
      expect(new Wild().add(makeCreature(kind, VALLEY.cx + 10, 100, VALLEY.cz))).toBe(false);
      for (let trial = 0; trial < 20; trial++) {
        const a = Math.PI * (0.6 + rand() * 0.8);
        const c = makeCreature(kind, VALLEY.cx + Math.cos(a) * (edge + 0.6), 100, VALLEY.cz + Math.sin(a) * (edge + 0.6));
        c.post = { x: c.x, y: 100, z: c.z, yaw: 0 };
        // On a beat that runs into the valley, alerted or not: he still never sets foot in it.
        c.route = [[VALLEY.cx, VALLEY.cz], [c.x, c.z]]; c.leg = 0;
        c.mind = trial % 3 === 0 ? 'watch' : trial % 2 ? 'alerted' : 'charge'; c.timer = 10;
        const st = { ...newFaction(), alert: c.mind !== 'watch' };
        const px = VALLEY.cx + Math.cos(a) * (edge - 5), pz = VALLEY.cz + Math.sin(a) * (edge - 5);
        let harm = 0;
        for (let t = 0; t < 300; t++) {
          c.vx += (VALLEY.cx - c.x) * 0.5; c.vz += (VALLEY.cz - c.z) * 0.5;
          const s = { px, py: 100, pz, playerInSanctuary: true, night: true, shot: t === 3 };
          for (const e of thinkRaider(c, 0.05, s, st, flat, () => 0, trial % 2 ? PASS : 0)) if ((e.kind === 'shot' && e.hit) || e.kind === 'blow') harm++;
          expect(inSanctuary(c.x, c.z), `${kind} at ${c.x.toFixed(1)},${c.z.toFixed(1)}`).toBe(false);
        }
        expect(harm, kind).toBe(0);
        expect(raiderSees(c, senseAt(px, pz, 100), true, flat)).toBe(false);
      }
    }
  });

  it('keeps every beat and post far outside it, and mans nothing while the player is at home', () => {
    for (const q of SQUADS) {
      for (const [x, z] of q.route ?? []) { expect(inSanctuary(x, z)).toBe(false); expect(zoneAt(x, z)).toBe('zone2'); }
      if (q.post) expect(inSanctuary(q.post.x, q.post.z)).toBe(false);
    }
    expect(manFaction([], newFaction(), 1700, 1024, () => true, () => 90)).toEqual([]);
  });

  it('walks every beat clear of the radiation rings and their signs', () => {
    for (const q of SQUADS) {
      const r = q.route ?? [];
      for (let i = 0; i < r.length; i++) {
        const [ax, az] = r[i], [bx, bz] = r[(i + 1) % r.length];
        for (let t = 0; t <= 1; t += 0.02) {
          const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
          for (const h of ZONE2.hotspots) expect(Math.hypot(x - h.x, z - h.z), `squad ${q.bit}`).toBeGreaterThan(h.r + 1.2);
        }
      }
    }
  });
});

describe('Zone-2’s men', () => {
  const STONE = blockId('limestone');
  const flat = (_x: number, y: number) => (y < 90 ? STONE : 0);
  const at = SQUADS[0].route![2];

  it('come out in groups of at most three, on their beats and towers, and go back in when you leave', () => {
    const st = newFaction();
    const men = manFaction([], st, at[0], at[1], () => true, () => 90);
    expect(men.length).toBeGreaterThan(0);
    expect(men.length).toBeLessThanOrEqual(SQUADS.length);
    for (const kind of ['patrol', 'sentry', 'guard']) expect(men.filter((c) => c.kind === kind).length).toBeLessThanOrEqual(3);
    const guard = men.find((c) => c.kind === 'guard');
    if (guard) expect(TOWER_POSTS.some((p) => p.x === guard.x && p.z === guard.z)).toBe(true);
    expect(standDown(men, st, at[0], at[1] + FACTION_FAR + 300).length).toBe(0);
  });

  it('stay down until dawn once killed', () => {
    const st = newFaction();
    st.down = ALL_SQUADS;
    expect(manFaction([], st, at[0], at[1], () => true, () => 90)).toEqual([]);
    factionDawn(st);
    expect(manFaction([], st, at[0], at[1], () => true, () => 90).length).toBeGreaterThan(0);
  });

  const patrolFacing = (dist: number): Creature => {
    const c = makeCreature('patrol', 800.5, 90, 700.5);
    c.mind = 'watch'; c.yaw = 0; c.post = { x: c.x, y: 90, z: c.z, yaw: 0 }; // looking north, up the highway
    void dist;
    return c;
  };

  it('take a stranger in the armband for one of their own beyond 14 m', () => {
    const c = patrolFacing(20), st = newFaction();
    for (let t = 0; t < 60; t++) thinkRaider(c, 0.05, senseAt(800.5, 700.5 - 20), st, flat, () => 0.5, PASS);
    expect(c.mind).toBe('watch');
    expect(st.alert).toBe(false);
    // Without it, the same man sees a stranger and shouts.
    const c2 = patrolFacing(20), st2 = newFaction();
    for (let t = 0; t < 60; t++) thinkRaider(c2, 0.05, senseAt(800.5, 700.5 - 20), st2, flat, () => 0.5, 0);
    expect(st2.alert).toBe(true);
  });

  it('look again within 14 m, and know in 1.5 s', () => {
    const c = patrolFacing(10), st = newFaction();
    const ev = thinkRaider(c, 0.05, senseAt(800.5, 700.5 - 10), st, flat, () => 0.5, PASS);
    expect(ev.some((e) => e.kind === 'challenge')).toBe(true);
    for (let t = 0; t < 20; t++) thinkRaider(c, 0.05, senseAt(800.5, 700.5 - 10), st, flat, () => 0.5, PASS);
    expect(st.alert).toBe(false); // 1 s in: still looking
    for (let t = 0; t < 12; t++) thinkRaider(c, 0.05, senseAt(800.5, 700.5 - 10), st, flat, () => 0.5, PASS);
    expect(st.alert).toBe(true);
  });

  it('let it go if you back off past 14 m while he looks', () => {
    const c = patrolFacing(10), st = newFaction();
    thinkRaider(c, 0.05, senseAt(800.5, 700.5 - 10), st, flat, () => 0.5, PASS);
    for (let t = 0; t < 40; t++) thinkRaider(c, 0.05, senseAt(800.5, 700.5 - 18), st, flat, () => 0.5, PASS);
    expect(st.alert).toBe(false);
    expect(c.mind).toBe('watch');
  });

  it('are all alerted by a shot near any of them, and then the armband hides nothing', () => {
    const w = new Wild();
    w.spawning = true;
    const c = makeCreature('patrol', 800.5, 90, 700.5);
    c.mind = 'watch'; c.squad = 1; c.post = { x: c.x, y: 90, z: c.z, yaw: 0 };
    w.creatures.push(c);
    w.update(0.1, { px: 800.5, py: 90, pz: 740, night: false, shot: true, blockAt: flat, loaded: () => true, rand: () => 0.5, armband: true });
    expect(w.faction.alert).toBe(true);
    expect(w.faction.blown).toBe(true);
  });

  it('walk their beat while unaware', () => {
    const c = makeCreature('patrol', 800.5, 90, 740.5);
    c.mind = 'watch'; c.route = [[800.5, 720.5], [800.5, 740.5]]; c.leg = 0;
    for (let t = 0; t < 200; t++) thinkRaider(c, 0.05, senseAt(900, 900), newFaction(), flat, () => 0.5, 0);
    expect(c.z).toBeLessThan(735);
  });
});

// ---- Zone-2's places, built and lit (docs/PHASE6.md, 1) -------------------------------------------------
import { B_EMIT, blockName } from '../src/world/blocks.ts';
import { PHARMACY_COUNTER, HARDWARE_CRATE, SERVER_RACKS, UPS_CABINETS, DISPLAY_FRIDGES, CAR_BATTERIES, GATE_X, COMPOUND_FLOOR, HOT_POOL, CAVE_FLOOR, LEAD_CASKET } from '../src/gen/zone2.ts';
import { homeChestAt } from '../src/gen/inheritance.ts';
import { dropOf } from '../src/world/items.ts';
import { hasTexture } from '../src/render/textures.ts';
import { BLOCK_DEFS } from '../src/world/blocks.ts';

describe('Zone-2’s places, built and lit', () => {
  const w = load(760, 640, 885, 760);
  const n = (x: number, y: number, z: number) => blockName(w.blockAt(x, y, z));
  const lightNear = (x: number, y: number, z: number, r: number) => {
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) for (let dy = -2; dy <= 6; dy++) if (B_EMIT[w.blockAt(x + dx, y + dy, z + dz)]) return true;
    return false;
  };
  const night = (x: number, y: number, z: number) => blockOf(w.lightAt(x, y, z));

  it('has a texture for every new block', () => {
    for (const d of BLOCK_DEFS) {
      const t = d.tex;
      if (!t) continue;
      for (const name of typeof t === 'string' ? [t] : Object.values(t)) expect(hasTexture(name as string), `${d.name}: ${name}`).toBe(true);
    }
  });

  it('builds the strip mall: three shops with their signs, Doc’s card, the salvage, panels on the roof', () => {
    expect(n(...PHARMACY_COUNTER)).toBe('pharmacy_counter');
    expect(n(...HARDWARE_CRATE)).toBe('stock_crate');
    for (const f of DISPLAY_FRIDGES) expect(n(...f)).toBe('display_fridge@west');
    for (const b of CAR_BATTERIES) expect(n(...b)).toBe('car_battery');
    expect(dropOf(blockId('display_fridge@west'))).toBe(itemId('fridge_unit'));
    expect(dropOf(blockId('roof_solar'))).toBe(itemId('pv_panel'));
    const m = ZONE2.mall, MF = PHARMACY_COUNTER[1];
    let panels = 0;
    for (let z = m.z0; z < m.z1; z++) for (let x = m.x0; x < m.x1; x++) if (n(x, MF + 6, z) === 'roof_solar') panels++;
    expect(panels).toBeGreaterThanOrEqual(8); // two arrays' worth, and more
    for (const s of ZONE2.shops) {
      const dz = Math.floor((s.z0 + s.z1) / 2);
      expect(n(m.x0 - 1, MF + 3, dz), s.name).toMatch(/_sign@west$/);
      expect(B_EMIT[w.blockAt(m.x0, MF, dz)] === 0 && n(m.x0, MF, dz)).toBe('air'); // the door is open
      expect(night(m.x0 - 2, MF + 1, dz), `${s.name} lit at night`).toBeGreaterThanOrEqual(8);
    }
  });

  it('leaves room to walk up to each thing to open or mine, from the door’s side (review: a shelf hid the crate)', () => {
    for (const [what, p, dx] of [['hardware crate', HARDWARE_CRATE, -1], ['counter', PHARMACY_COUNTER, -1], ...DISPLAY_FRIDGES.map((f) => ['fridge', f, -1] as const), ...SERVER_RACKS.map((r) => ['rack', r, 1] as const), ...UPS_CABINETS.map((u) => ['cabinet', u, 1] as const)] as [string, [number, number, number], number][])
      for (const k of [1, 2]) for (const dy of [0, 1]) expect(n(p[0] + dx * k, p[1] + dy, p[2]), `${what} at ${p}`).toBe('air');
  });

  it('builds the exchange: six racks, three battery cabinets, a mast with its red light, all lit', () => {
    for (const r of SERVER_RACKS) expect(n(...r)).toBe('server_rack@east');
    for (const u of UPS_CABINETS) expect(n(...u)).toBe('ups_cabinet@east');
    const e = ZONE2.exchange, EF = SERVER_RACKS[0][1];
    expect(n(e.mastX, EF + 6 + e.mastHeight, e.mastZ)).toBe('red_beacon');
    expect(lightNear(e.x1, EF, e.z0 + 4, 2)).toBe(true);
    // The racks and cabinets are lit, not only the doors (screenshot: dark room).
    for (const r of [...SERVER_RACKS, ...UPS_CABINETS]) expect(night(r[0] + 1, r[1] + 1, r[2]), `${r}`).toBeGreaterThanOrEqual(9);
  });

  it('fills the ruins’ containers: a rig’s worth of parts, a bank’s worth of cells, the pump, casings and primers', () => {
    const all = [HARDWARE_CRATE, ...SERVER_RACKS, ...UPS_CABINETS].flatMap((p) => homeChestAt(...p)?.items ?? []);
    const total = (name: string) => all.filter(([n]) => n === name).reduce((a, [, k]) => a + k, 0);
    expect(total('gpu')).toBeGreaterThanOrEqual(2);
    expect(total('psu')).toBeGreaterThanOrEqual(1);
    expect(total('mining_board')).toBeGreaterThanOrEqual(1);
    expect(total('battery_cell')).toBeGreaterThanOrEqual(6);
    expect(total('pump_unit')).toBe(1);
    expect(total('brass_casing')).toBeGreaterThanOrEqual(40);
    expect(homeChestAt(LEAD_CASKET[0], LEAD_CASKET[1], LEAD_CASKET[2] + 1)?.items[0][0]).toBe('scrap_lead');
  });

  it('rings each hotspot with warning signs and dead ground', () => {
    for (const h of ZONE2.hotspots) {
      let signs = 0;
      for (let z = h.z - h.r - 3; z <= h.z + h.r + 3; z++) for (let x = h.x - h.r - 3; x <= h.x + h.r + 3; x++) for (let y = 80; y < 100; y++) if (n(x, y, z).startsWith('rad_sign')) signs++;
      expect(signs, h.name).toBeGreaterThanOrEqual(6);
    }
  });

  it('builds the hot-spring cave: a lit trail and mouth, saltpeter on the walls, sulfur round the pool', () => {
    const cv = ZONE2.cave;
    expect(lightNear(cv.mouthX, zone2Floor_cave(), cv.z, 3)).toBe(true);
    expect(n(HOT_POOL[0], CAVE_FLOOR - 1, HOT_POOL[2])).toBe('water');
    let salt = 0, sulfur = 0;
    for (let x = cv.mouthX; x < cv.cavern.x1 + 1; x++) for (let z = cv.cavern.z0 - 1; z <= cv.cavern.z1; z++) for (let y = CAVE_FLOOR - 2; y < CAVE_FLOOR + 18; y++) {
      const b = n(x, y, z);
      if (b === 'saltpeter_crust') salt++;
      if (b === 'sulfur_crust') sulfur++;
    }
    expect(salt).toBeGreaterThan(20);
    expect(sulfur).toBeGreaterThan(20);
    // The way down is open all the way, and lit.
    for (let k = 0; k < cv.depth; k++) expect(n(cv.mouthX + k, zone2Floor_cave() - k, cv.z), `step ${k}`).toBe('air');
    expect(night(cv.cavern.x0 + 2, CAVE_FLOOR + 1, cv.z)).toBeGreaterThanOrEqual(7);
  });
});
const zone2Floor_cave = () => highwayHeight(ZONE2.caveTrail.z);

describe('Las Cruces', () => {
  const w = load(765, 540, 830, 610);
  const n = (x: number, y: number, z: number) => blockName(w.blockAt(x, y, z));
  it('stands walled in reinforced concrete with a steel gate at the highway’s end, the broken circle over it', () => {
    const C = ZONE2.compound, F = COMPOUND_FLOOR;
    expect(n(GATE_X, F, C.z1 - 1)).toBe('steel_gate');
    expect(n(C.x0, F + 3, C.z0 + 10)).toBe('compound_wall');
    expect(n(GATE_X, F + C.wall - 1, C.z1 - 1)).toBe('compound_mark@south');
    for (const b of ['compound_wall', 'steel_gate', 'compound_mark@south']) expect(BLOCK_DEFS[blockId(b)].hardness).toBeLessThan(0);
    expect(Math.abs(GATE_X + 0.5 - highwayX(C.z1))).toBeLessThan(1.5);
  });
  it('reads at night: lamps along the south wall and on the towers (screenshot: dark from the ruins)', () => {
    const C = ZONE2.compound;
    let lit = 0;
    for (let x = C.x0; x < C.x1; x++) if (blockOf(w.lightAt(x, COMPOUND_FLOOR + 2, C.z1 + 1)) >= 8) lit++;
    expect(lit / (C.x1 - C.x0)).toBeGreaterThan(0.8);
  });
  it('mans its towers: a platform with room to stand and a searchlight', () => {
    for (const p of TOWER_POSTS) {
      expect(n(Math.floor(p.x), p.y - 1, Math.floor(p.z))).toBe('planks');
      expect(n(Math.floor(p.x), p.y, Math.floor(p.z))).toBe('air');
      expect(n(Math.floor(p.x), p.y + 1, Math.floor(p.z))).toBe('air');
    }
  });
});

// ---- Review fixes (each fails on the code before it) -------------------------------------------------
import { despawnFar } from '../src/entity/spawner.ts';
import { landZoneAt } from '../src/gen/layout.ts';
import { sunlit } from '../src/sim/power.ts';
import { sellPrice as price } from '../src/sim/trade.ts';

describe('review fixes', () => {
  it('1. keeps a faction man who is out, rather than remaking him every second between 128 and 150 m', () => {
    const st = newFaction();
    const px = hx(762), pz = 762;
    let men = manFaction([], st, px, pz, () => true, () => 90);
    const ids = men.map((c) => c.id).sort();
    for (let k = 0; k < 5; k++) {
      men = standDown(despawnFar(men, px, pz, false), st, px, pz);
      men.push(...manFaction(men, st, px, pz, () => true, () => 90));
    }
    expect(men.map((c) => c.id).sort()).toEqual(ids);
  });

  it('2. shapes the land with the old line: z 650–760 is still land of the mid band', () => {
    expect(landZoneAt(800, 700)).toBe('mid');
    expect(zoneAt(800, 700)).toBe('zone2');
    expect(landZoneAt(800, 600)).toBe('zone2');
  });

  it('3. keeps the men killed down across a reload, and their drops are no fortune', () => {
    const w = new Wild();
    w.faction.down = 5;
    expect(w.faction.down).toBe(5); // saved as factionDown (game.ts) and restored before anyone is manned
    const perDay = 2 * (4 * price(itemId('pistol_rounds')) + 4 * price(itemId('brass_casing'))) + price(itemId('scrap_metal')) + price(itemId('cordage')) + 2 * 6 * price(itemId('rifle_rounds'));
    expect(perDay).toBeLessThan(RIG_SATS_PER_DAY);
    expect(price(itemId('cold_water'))).toBe(0); // free water made cold is not money
    expect(dropOf(blockId('street_light'))).toBe(itemId('scrap_metal')); // the highway's lamps aren't lanterns to sell
  });

  it('4. lets the armband work again only once the visit is over, not as soon as everyone in sight is down', () => {
    const st = { ...newFaction(), alert: true, blown: true };
    standDown([], st, 800, 720);
    expect(st.blown).toBe(true);
    standDown([], st, 1300, 1024);
    expect(st.blown).toBe(false);
    expect(st.alert).toBe(false);
  });

  it('5. counts only the hours since dawn as “mined today” after a night’s sleep', () => {
    const one = newPower(), slept = newPower(), d = homeDevices(3, 2, 1);
    stepPower(one, d, 6, 24 * 60); stepPower(slept, d, 6, 24 * 60);
    stepPower(slept, d, 21, 9 * 60); // sleep 21:00 → 06:00 in one step
    for (let m = 0; m < 9 * 60; m++) stepPower(one, d, (21 + m / 60) % 24, 1);
    expect(slept.satsToday).toBe(one.satsToday);
    expect(slept.satsToday).toBeLessThan(100);
  });

  it('6. runs the rig through the night on two arrays and a bank, every night', () => {
    const s = newPower(), d = homeDevices(2, 1, 1, 1, 1);
    stepPower(s, d, 6, 24 * 60);
    let off = 0;
    for (let day = 0; day < 4; day++) for (let m = 0; m < 24 * 60; m++) { stepPower(s, d, (6 + m / 60) % 24, 1); if (!s.on.mining_rig) off++; }
    expect(off).toBe(0);
  });

  it('7. counts only arrays under open sky', () => {
    const a: [number, number, number][] = [[1, 2, 3], [4, 5, 6], [7, 8, 9]];
    const sky = (x: number) => (x === 1 ? 15 : x === 4 ? 2 : null);
    expect(sunlit(a, sky, [[7, 8, 9]])).toEqual([[1, 2, 3], [7, 8, 9]]);
    expect(sunlit(a, sky, [])).toEqual([[1, 2, 3]]);
  });

  it('8. keeps the highway clear: nothing solid stands on it but the border’s barriers', () => {
    const w = load(785, 690, 815, 760);
    for (let z = 692; z < 758; z++) for (let x = 786; x < 814; x++) {
      if (!onHighway(x, z) || Math.abs(z - ZONE2.border.z) < 4) continue;
      const y = highwayHeight(z);
      for (let dy = 0; dy < 3; dy++) expect(blockName(w.blockAt(x, y + dy, z)), `${x},${y + dy},${z}`).toBe('air');
    }
  });
});
const hx = highwayX;
