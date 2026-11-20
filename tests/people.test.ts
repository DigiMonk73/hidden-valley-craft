// The parts split out of src/game.ts (docs/FIXES.md, 8) that had no tests of their own: Doc's services, Ray's
// catalogue and his plans, what the computer shows, and the weapons table. (Marco's trade is in tests/money.test.ts.)

import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/ui/icons.ts', async () => (await import('./game/stubs.ts')).iconsModule);

import { greetDoc, docServices, greetRay, rayCatalog, greetMarco, marcoTrade, DOC, RAY, MARCO, type Dealer } from '../src/game/people.ts';
import { computerRows, milestoneRows, powerRows } from '../src/game/computer.ts';
import { GUNS, isBow, isBlade, isWeapon, gunOf } from '../src/sim/weapons.ts';
import { DOC_PRICE, RAY_PLANS_PRICE, CATALOG_RAY } from '../src/sim/trade.ts';
import { healthCap } from '../src/sim/radiation.ts';
import { newPower, findDevices } from '../src/sim/power.ts';
import { M1_STEPS, M2_STEPS } from '../src/sim/milestones.ts';
import { Inventory } from '../src/sim/inventory.ts';
import { itemId, hasItem } from '../src/world/items.ts';

function dealer(over: Partial<Dealer> = {}): Dealer & { edits: number } {
  const d = { flags: new Set<string>(), hotbar: new Inventory(), wallet: 1_000_000, marcoPaid: 0, vitals: { hp: 100, hunger: 100, thirst: 100 }, dose: 0, hpBefore: 100, edits: 0, edited() { this.edits++; }, ...over };
  return d;
}
const first = () => 0;

describe('Doc, by phone', () => {
  it('his first call is noted, and later calls are his usual lines', () => {
    const g = dealer();
    expect(greetDoc(g, first)).toBe(DOC.first);
    expect(g.flags.has('doc_called')).toBe(true);
    expect(DOC.again).toContain(greetDoc(g, first));
  });

  it('wound care brings health up to what the dose allows, for a flat fee, and charges nothing when you are not hurt', () => {
    const g = dealer({ vitals: { hp: 30, hunger: 100, thirst: 100 }, dose: 40 });
    const view = docServices(g, 'hello');
    const wound = () => view().buy[0];
    expect(wound().label).toContain(String(healthCap(40)));
    expect(wound().act()).toBe(DOC.wound);
    expect([g.vitals.hp, g.hpBefore, g.wallet]).toEqual([healthCap(40), healthCap(40), 1_000_000 - DOC_PRICE.wound]);
    expect(wound().act()).toBe(DOC.notHurt);
    expect(g.wallet).toBe(1_000_000 - DOC_PRICE.wound);
    expect(view().sellHead).toBeNull(); // he buys nothing
  });

  it('rad treatment clears the dose; with no dose or no money nothing is taken', () => {
    const g = dealer({ dose: 60 });
    const rad = () => docServices(g, '')().buy[1];
    expect(rad().act()).toBe(DOC.rad);
    expect([g.dose, g.wallet]).toEqual([0, 1_000_000 - DOC_PRICE.rad]);
    expect(rad().act()).toBe(DOC.noDose);
    const poor = dealer({ dose: 60, wallet: 10 });
    const row = docServices(poor, '')().buy[1];
    expect(row.can).toBe(false);
    expect(row.act()).toBe(DOC.funds);
    expect([poor.dose, poor.wallet]).toEqual([60, 10]);
  });
});

describe('Ray, by phone', () => {
  it('sells his micro-hydro plans once, as knowledge and not a thing to carry', () => {
    const g = dealer();
    expect(greetRay(g, first)).toBe(RAY.first);
    const view = rayCatalog(g, '');
    const plans = view().buy[0];
    expect(plans.label).toContain('Micro-hydro plans');
    expect(plans.act()).toBe(RAY.plansBought);
    expect([g.flags.has('hydro_plans'), g.wallet]).toEqual([true, 1_000_000 - RAY_PLANS_PRICE]);
    expect(view().buy.some((r) => r.label.includes('Micro-hydro'))).toBe(false);
    expect(view().buy.length).toBe(CATALOG_RAY.length);
    expect(hasItem('hydro_plans')).toBe(false);
  });

  it('sends the uplink plans on the first call after the generator turns, and keeps them if the pack is full', () => {
    const g = dealer();
    greetRay(g, first);
    g.flags.add('hydro_plans');
    expect(greetRay(g, first)).toBe(RAY.notYet);
    g.flags.add('hydro_built');
    const full = dealer({ flags: new Set(['ray_called', 'hydro_plans', 'hydro_built']) });
    full.hotbar.slots = full.hotbar.slots.map(() => ({ id: itemId('planks'), count: 64 }));
    expect(greetRay(full, first)).toBe(RAY.uplinkFull);
    expect(full.flags.has('uplink_plans')).toBe(false);
    expect(greetRay(g, first)).toBe(RAY.uplink);
    expect(g.flags.has('uplink_plans')).toBe(true);
    expect(g.hotbar.count(itemId('uplink_plans'))).toBe(1);
  });

  it('a part bought goes into the pack and out of the wallet; with no room, neither', () => {
    const g = dealer({ flags: new Set(['hydro_plans']) });
    const lot = CATALOG_RAY[0];
    expect(rayCatalog(g, '')().buy[0].act()).toContain('Ray sends');
    expect([g.hotbar.count(lot.id), g.wallet]).toEqual([lot.lot, 1_000_000 - lot.sats]);
    const full = dealer({ flags: new Set(['hydro_plans']) });
    full.hotbar.slots = full.hotbar.slots.map(() => ({ id: itemId('planks'), count: 64 }));
    expect(rayCatalog(full, '')().buy[0].act()).toBe('No room in your pack.');
    expect(full.wallet).toBe(1_000_000);
  });
});

describe('Marco', () => {
  it('greets a stranger once, and the first deal of any kind earns trust 1', () => {
    const g = dealer();
    expect(greetMarco(g, first)).toBe(MARCO.first);
    expect(MARCO.again).toContain(greetMarco(g, first));
    const view = marcoTrade(g, '');
    expect(view().title).toContain('a stranger still');
    expect(view().buy[0].act()).toBe(MARCO.trust);
    expect(view().title).toContain('trust 1');
    expect(g.edits).toBeGreaterThan(0);
    // Guns and rounds only once he trusts you more.
    const n = view().buy.length;
    g.flags.add('marco_trust2');
    expect(view().buy.length).toBeGreaterThan(n);
  });
});

describe('the builder’s computer', () => {
  it('shows the wallets, "no rig" until something is built, and each milestone with its steps', () => {
    const g = { flags: new Set<string>(['gate_both']), hotbar: new Inventory(), wallet: 1_000_000, power: newPower(), devices: findDevices(new Map()) };
    const rows = computerRows(g);
    expect(rows[0]).toEqual(['Hot wallet (phone)', '0.01000000 BTC', 'btc']);
    expect(rows[1][1]).toBe('not connected');
    expect(rows.some((r) => r[0] === 'Mining' && r[1].startsWith('no rig'))).toBe(true);
    expect(rows.find((r) => r[0].startsWith('M1'))![1]).toBe(`1 of ${M1_STEPS.length}`);
    expect(rows.some((r) => r[0] === `   ✓ ${M1_STEPS[0].label}`)).toBe(true);
    expect(rows.some((r) => r[0] === `   · ${M1_STEPS[1].label}` && r[2] === 'dim')).toBe(true);
    g.hotbar.add(itemId('hardware_wallet'), 1);
    expect(computerRows(g)[1][1]).toContain('connected');
  });

  it('says which milestone each later one waits for, until it is done', () => {
    const waits = (flags: string[]) => milestoneRows(new Set(flags)).filter((r) => /^M\d/.test(r[0])).map((r) => r[1]);
    expect(waits([])).toEqual([`0 of ${M1_STEPS.length}`, `0 of ${M2_STEPS.length} · after M1`, '0 of 8 · after M2', '0 of 8 · after M3']);
    expect(waits(['m1_done'])[0]).toBe('done ✓');
    expect(waits(['m1_done'])[1]).toBe(`0 of ${M2_STEPS.length}`);
  });

  it('lists a farm as a farm, and says when more than one rig needs hydro', () => {
    const P = newPower();
    const d = findDevices(new Map());
    d.mining_rig = [[0, 0, 0], [1, 0, 0]];
    d.solar_array = [[2, 0, 0]];
    P.rigs = 1; P.on.mining_rig = true;
    const farm = powerRows(P, d).find((r) => r[0] === 'Mining farm')!;
    expect(farm[1]).toContain('1 of 2 rigs running');
    expect(farm[1]).toContain('more than one rig needs hydro');
  });
});

describe('weapons', () => {
  it('guns are the five found ones, each with its rounds; bows and blades are told apart', () => {
    expect(Object.keys(GUNS).sort()).toEqual(['hunting_rifle', 'pistol', 'pistol_suppressed', 'raider_rifle', 'rifle_rebuilt']);
    for (const [name, gun] of Object.entries(GUNS)) { expect(hasItem(name), name).toBe(true); expect(hasItem(gun.ammo), gun.ammo).toBe(true); }
    expect(gunOf(itemId('pistol_suppressed'))!.quiet).toBe(true);
    expect(gunOf(itemId('machete'))).toBeUndefined();
    expect([isBow(itemId('hunting_bow')), isBow(itemId('pistol')), isBlade(itemId('machete')), isBlade(itemId('hunting_bow'))]).toEqual([true, false, true, false]);
    expect([isWeapon(itemId('compound_bow')), isWeapon(itemId('hunting_rifle')), isWeapon(itemId('machete')), isWeapon(undefined)]).toEqual([true, true, false, false]);
  });
});
