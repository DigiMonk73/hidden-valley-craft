// Trading with Marco (docs/PHASE4.md, step 4): both ways, in Bitcoin, from the hot wallet. He sells his
// catalogue a lot at a time; he buys anything with a value at half of it (DESIGN.md A3). Pure.

import data from '../../data/trade.json' with { type: 'json' };
import { itemId, hasItem, itemName } from '../world/items.ts';
import type { Inventory } from './inventory.ts';

export interface Lot { id: number; lot: number; sats: number }

export const SATS_PER_BTC = 100_000_000;
export const START_WALLET: number = data.startWallet;
const UNIT: number = data.unit;

/** What Marco sells: the item, how many come in a lot, and the lot's price in satoshis. */
export const CATALOG: Lot[] = data.catalog.map((c) => ({ id: itemId(c.item), lot: c.lot, sats: Math.round(c.price * UNIT) }));

/** What Marco adds once he trusts you (trust 2, after your first run to Las Cruces): guns and rounds (docs/PHASE6.md, 7). */
export const CATALOG_M3: Lot[] = data.catalogM3.map((c) => ({ id: itemId(c.item), lot: c.lot, sats: Math.round(c.price * UNIT) }));
/** What Ray sells (docs/PHASE7.md, 3): plans and parts at a premium. He buys nothing. */
export const CATALOG_RAY: Lot[] = data.catalogRay.map((c) => ({ id: itemId(c.item), lot: c.lot, sats: Math.round(c.price * UNIT) }));
/** Ray's price for his micro-hydro plans: knowledge, not an item (DESIGN.md: schematics are recipe-unlock flags). */
export const RAY_PLANS_PRICE = Math.round(data.ray.plans * UNIT);
/** Doc's flat fee for each service, in satoshis (DESIGN.md A3: service-priced, wound care is the anchor P_wc). */
export const DOC_PRICE = { wound: Math.round(data.doc.wound * UNIT), rad: Math.round(data.doc.rad * UNIT) };

const VALUE = new Map<number, number>();
for (const [name, v] of Object.entries(data.value)) VALUE.set(itemId(name), v * UNIT);
for (const c of [...data.catalog, ...data.catalogM3]) if (!VALUE.has(itemId(c.item))) VALUE.set(itemId(c.item), (c.price / c.lot) * UNIT);

/** What Marco pays for one of an item (half its value), or 0 if he doesn't want it. */
export function sellPrice(id: number): number {
  const v = VALUE.get(id);
  return v ? Math.max(1, Math.round(v * data.sellRatio)) : 0;
}

/** Every name in the trade data is a real item (checked by a test, so a typo fails the build's checks). */
export function tradeNames(): string[] { return [...data.catalog.map((c) => c.item), ...data.catalogM3.map((c) => c.item), ...data.catalogRay.map((c) => c.item), ...Object.keys(data.value), ...Object.keys(data.keep)]; }
export const tradeNamesValid = (): boolean => tradeNames().every(hasItem);

/** The most Marco can pay out in one day, in satoshis: he carries what a man and a mule can. It is whole again each dawn. */
export const PURSE: number = Math.round(data.purse * UNIT);

/** Parts a milestone step needs, each with that step's flag: until the step is done Marco will not take one. */
const KEEP = new Map<number, string>(Object.entries(data.keep).map(([name, flag]) => [itemId(name), flag]));

/** The milestone step this part is still needed for (its flag), or null if Marco may have it. */
export function keptFor(id: number, flags: ReadonlySet<string>): string | null {
  const flag = KEEP.get(id);
  return flag && !flags.has(flag) ? flag : null;
}
export const keepNames = (): [string, string][] => Object.entries(data.keep);

export type TradeResult = { ok: true; wallet: number } | { ok: false; why: 'funds' | 'room' | 'none' | 'purse' };

/** Buys one lot: the price comes out of the wallet and the lot goes into the pack. */
export function buy(inv: Inventory, wallet: number, lot: Lot): TradeResult {
  if (wallet < lot.sats) return { ok: false, why: 'funds' };
  if (inv.room(lot.id) < lot.lot) return { ok: false, why: 'room' };
  inv.add(lot.id, lot.lot);
  return { ok: true, wallet: wallet - lot.sats };
}

/** Sells one of an item from the pack, at half its value, if Marco still has that much to pay today (`purseLeft`). */
export function sell(inv: Inventory, wallet: number, id: number, purseLeft = Infinity): TradeResult {
  const price = sellPrice(id);
  if (!price || inv.count(id) <= 0) return { ok: false, why: 'none' };
  if (price > purseLeft) return { ok: false, why: 'purse' };
  inv.remove(id, 1);
  return { ok: true, wallet: wallet + price };
}

/** The things in a pack Marco would buy, each once, in the order carried. */
export function sellable(inv: Inventory): number[] {
  const out: number[] = [];
  for (const s of inv.slots) if (s && sellPrice(s.id) && !out.includes(s.id)) out.push(s.id);
  return out;
}

/** Satoshis as BTC, for showing: 0.05000000 BTC. */
export function btc(sats: number): string { return `${(sats / SATS_PER_BTC).toFixed(8)} BTC`; }

export { itemName };
