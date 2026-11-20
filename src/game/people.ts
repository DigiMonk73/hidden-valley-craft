// The people you deal with: Marco at his shelter, Doc and Ray by phone. Each is a line of talk and a trade
// screen; this builds the screens' rows from the game's state and does the deals. It knows nothing of the
// picture or the page: the game hands it a narrow view of itself (`Dealer`), so it is tested without a browser.
// (Split out of src/game.ts: docs/FIXES.md, 8.)

import people from '../../data/people.json' with { type: 'json' };
import type { Inventory } from '../sim/inventory.ts';
import type { Vitals } from '../sim/survival.ts';
import type { TradeView, TradeRow } from '../ui/paperScreen.ts';
import { CATALOG, CATALOG_M3, CATALOG_RAY, CATALOG_RAY_M5, RAY_PLANS_PRICE, DOC_PRICE, PURSE, buy, sell, sellPrice, sellable, keptFor, btc } from '../sim/trade.ts';
import { M1_STEPS, M2_STEPS, M3_STEPS, M4_STEPS } from '../sim/milestones.ts';
import { M5_STEPS } from '../sim/m5.ts';
import { rayCall } from '../sim/ridge.ts';
import { healthCap } from '../sim/radiation.ts';
import { itemId, itemLabel } from '../world/items.ts';
import { iconFor } from '../ui/icons.ts';

export const MARCO = people.marco;
export const DOC = people.doc;
export const RAY = people.ray;
/** Marco keeps a meeting by day: from seven in the morning until six in the evening. */
export const MARCO_HOURS: [number, number] = [7, 18];

/** What a deal reads and changes: the part of the game the people see. */
export interface Dealer {
  flags: Set<string>;
  hotbar: Inventory;
  wallet: number;
  /** What Marco has paid out since dawn. */
  marcoPaid: number;
  vitals: Vitals;
  dose: number;
  /** Health at the last look: a cure is not a blow. */
  hpBefore: number;
  /** Something changed that a save should hold. */
  edited(): void;
}

const stepLabel = (flag: string) => [...M1_STEPS, ...M2_STEPS, ...M3_STEPS, ...M4_STEPS, ...M5_STEPS].find((st) => st.flag === flag)?.label ?? 'a later step';

/** Meeting Marco: his first line or one of his usual ones. Notes that you have met. */
export function greetMarco(g: Dealer, rand: () => number = Math.random): string {
  const first = !g.flags.has('marco_met');
  g.flags.add('marco_met');
  return first ? MARCO.first : MARCO.again[Math.floor(rand() * MARCO.again.length)];
}

/**
 * Marco's trade (docs/PHASE4.md; docs/FIXES.md, 6). The first deal earns trust 1. He pays out only his day's
 * purse, will not take a part a milestone step still needs, and what he is offered is fixed while the screen is
 * open: a row that sells out stays where it is, greyed, so a quick second click never lands on the next thing down.
 */
export function marcoTrade(g: Dealer, say: string): () => TradeView {
  const dealt = () => {
    g.edited();
    if (!g.flags.has('marco_trust1')) { g.flags.add('marco_trust1'); return MARCO.trust; }
    return '';
  };
  const why = { funds: 'Not enough in your wallet.', room: 'No room in your pack.', none: 'You have none of that.', purse: MARCO.purse };
  const offered = sellable(g.hotbar);
  return () => {
    const left = Math.max(0, PURSE - g.marcoPaid);
    return {
      title: `${MARCO.name} · ${g.flags.has('marco_trust2') ? 'trust 2' : g.flags.has('marco_trust1') ? 'trust 1' : 'a stranger still'}`,
      say,
      wallet: btc(g.wallet),
      sellHead: `Sell to him (half price) · he can pay ${btc(left)} more today`,
      buy: [...CATALOG, ...(g.flags.has('marco_trust2') ? CATALOG_M3 : [])].map((lot): TradeRow => ({
        icon: iconFor(lot.id), label: `${itemLabel(lot.id)} ×${lot.lot}`, price: btc(lot.sats), button: 'Buy',
        can: g.wallet >= lot.sats,
        act: () => {
          const r = buy(g.hotbar, g.wallet, lot);
          if (!r.ok) return why[r.why];
          g.wallet = r.wallet;
          if (CATALOG_M3.includes(lot) && lot.id !== itemId('primer')) g.flags.add('marco_guns');
          return dealt() || `Bought ${itemLabel(lot.id)} ×${lot.lot}.`;
        },
      })),
      sell: offered.map((id): TradeRow => {
        const have = g.hotbar.count(id), kept = keptFor(id, g.flags), price = sellPrice(id);
        return {
          icon: iconFor(id),
          label: kept ? `${itemLabel(id)} · keep it: ${stepLabel(kept)}` : have ? `${itemLabel(id)} (you have ${have})` : `${itemLabel(id)} (none left)`,
          price: btc(price), button: 'Sell 1',
          can: have > 0 && !kept && price <= left,
          act: () => {
            // A part a milestone step still needs is not his to take: one sale must never end your progress.
            if (keptFor(id, g.flags)) return MARCO.keep;
            const r = sell(g.hotbar, g.wallet, id, Math.max(0, PURSE - g.marcoPaid));
            if (!r.ok) return why[r.why];
            g.marcoPaid += r.wallet - g.wallet;
            g.wallet = r.wallet;
            return dealt() || `Sold one ${itemLabel(id)}.`;
          },
        };
      }),
    };
  };
}

/** Calling Doc: his line (noting the call), to be followed by his services. */
export function greetDoc(g: Dealer, rand: () => number = Math.random): string {
  const first = !g.flags.has('doc_called');
  g.flags.add('doc_called');
  g.edited();
  return first ? DOC.first : DOC.again[Math.floor(rand() * DOC.again.length)];
}

/** Doc's services, priced flat per kind (DESIGN.md A3): wound care up to what the dose allows, and the dose itself. */
export function docServices(g: Dealer, say: string): () => TradeView {
  const svc = (label: string, price: number, act: () => string): TradeRow => ({
    icon: iconFor(itemId('first_aid_kit')), label, price: btc(price), button: 'Ask', can: g.wallet >= price,
    act: () => { if (g.wallet < price) return DOC.funds; const r = act(); g.edited(); return r; },
  });
  return () => ({
    title: `${DOC.name} · by phone`, say, wallet: btc(g.wallet), buyHead: 'He can talk you through', sellHead: null, sell: [],
    buy: [
      svc(`Wound care (health back to ${healthCap(g.dose)})`, DOC_PRICE.wound, () => {
        const cap = healthCap(g.dose);
        if (g.vitals.hp >= cap - 0.5) return DOC.notHurt;
        g.wallet -= DOC_PRICE.wound; g.vitals.hp = cap; g.hpBefore = cap;
        return DOC.wound;
      }),
      svc(`Rad treatment (your dose: ${Math.round(g.dose)})`, DOC_PRICE.rad, () => {
        if (g.dose < 0.5) return DOC.noDose;
        g.wallet -= DOC_PRICE.rad; g.dose = 0;
        return DOC.rad;
      }),
    ],
  });
}

/**
 * Calling Ray: his line. The first call after the generator turns he sends the uplink plans (the contact-taught
 * schematic; if the pack has no room he says so and keeps them for the next call).
 */
export function greetRay(g: Dealer, rand: () => number = Math.random): string {
  const first = !g.flags.has('ray_called');
  g.flags.add('ray_called');
  let say = first ? RAY.first : RAY.again[Math.floor(rand() * RAY.again.length)];
  if (!first && g.flags.has('hydro_built') && !g.flags.has('uplink_plans')) {
    if (g.hotbar.add(itemId('uplink_plans'), 1) > 0) say = RAY.uplinkFull;
    else { g.flags.add('uplink_plans'); say = RAY.uplink; }
  } else if (!first && g.flags.has('hydro_plans') && !g.flags.has('hydro_built')) say = RAY.notYet;
  else if (!first) {
    // The ridge (docs/PHASE8.md, 3): his word and the suit's pattern, once M4 is done; his piece when the link has answered.
    const r = rayCall(g.flags, hasSuit(g), false);
    if (r.line) { say = RAY[r.line]; for (const f of r.sets) g.flags.add(f); }
  }
  g.edited();
  return say;
}

const hasSuit = (g: Dealer): boolean => g.hotbar.count(itemId('hazard_suit')) > 0;

/** The phone's second button under Ray: asking him to meet you at the refuge. He comes only for someone who carries a suit. */
export function askRayToMeet(g: Dealer): string {
  const r = rayCall(g.flags, hasSuit(g), true);
  for (const f of r.sets) g.flags.add(f);
  g.edited();
  return r.line ? RAY[r.line] : RAY.meetWaiting;
}

/**
 * Meeting Ray at the refuge: he hands over the dam's modem and two boxes of tablets, once. With no room in the
 * pack he waits (the modem never goes on the ground).
 */
export function meetRay(g: Dealer): string {
  if (g.flags.has('ray_met')) return RAY.look;
  const modem = itemId('sat_modem'), tablets = itemId('rad_tablets');
  // Both or neither: if the tablets find no room once the modem is in, he takes the modem back and waits.
  if (g.hotbar.add(modem, 1) > 0) return RAY.metFull;
  const left = g.hotbar.add(tablets, 2);
  if (left > 0) { g.hotbar.remove(tablets, 2 - left); g.hotbar.remove(modem, 1); return RAY.metFull; }
  g.flags.add('ray_met');
  g.edited();
  return RAY.met;
}

/** What Ray sells (DESIGN.md A3: premium, buy-only): his micro-hydro plans once, then parts. */
export function rayCatalog(g: Dealer, say: string): () => TradeView {
  const why = { funds: RAY.funds, room: 'No room in your pack.', none: '', purse: '' };
  return () => ({
    title: `${RAY.name} · by phone`, say, wallet: btc(g.wallet), buyHead: 'He can send', sellHead: null, sell: [],
    buy: [
      ...(g.flags.has('hydro_plans') ? [] : [{
        icon: iconFor(itemId('uplink_plans')), label: 'Micro-hydro plans (teaches the hydro generator)', price: btc(RAY_PLANS_PRICE), button: 'Buy', can: g.wallet >= RAY_PLANS_PRICE,
        act: () => {
          if (g.wallet < RAY_PLANS_PRICE) return RAY.funds;
          g.wallet -= RAY_PLANS_PRICE; g.flags.add('hydro_plans'); g.edited();
          return RAY.plansBought;
        },
      }]),
      // After the meeting he sells what the ridge gives, so nothing in M5 can be lost for good.
      ...[...CATALOG_RAY, ...(g.flags.has('ray_met') ? CATALOG_RAY_M5 : [])].map((lot): TradeRow => ({
        icon: iconFor(lot.id), label: `${itemLabel(lot.id)} ×${lot.lot}`, price: btc(lot.sats), button: 'Buy', can: g.wallet >= lot.sats,
        act: () => {
          const r = buy(g.hotbar, g.wallet, lot);
          if (!r.ok) return why[r.why];
          g.wallet = r.wallet; g.edited();
          return `Ray sends ${itemLabel(lot.id)} ×${lot.lot}.`;
        },
      })),
    ],
  });
}
