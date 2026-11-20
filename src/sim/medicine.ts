// The three medicines of the medical bench (docs/PHASE8.md, 4): rare drugs from before, made again. None of
// them is a cure for what the Ashen have. Pure: what using one does to a body, or that it would do nothing
// (and so is not used up).

import { healthCap, takeTablet } from './radiation.ts';

export type Medicine = 'rad_tablets' | 'antibiotics' | 'adrenaline';
export const isMedicine = (name: string): name is Medicine => name === 'rad_tablets' || name === 'antibiotics' || name === 'adrenaline';

/** How long a shot of adrenaline lasts, and what part of a blow is felt while it does. */
export const ADRENALINE_SECONDS = 60, ADRENALINE_FELT = 0.5;

/** `adrenaline`: seconds of it still in the blood. */
export interface Body { hp: number; dose: number; adrenaline: number }

/** Uses one. Returns the body after it and what to say, or null when it would do nothing. */
export function useMedicine(m: Medicine, b: Body): (Body & { said: string; focus?: true }) | null {
  if (m === 'rad_tablets') {
    if (b.dose < 0.5) return null;
    const dose = takeTablet(b.dose);
    return { ...b, dose, said: `Blue tablets: your dose is ${Math.round(dose)} now. Health can come back to ${healthCap(dose)}.` };
  }
  if (m === 'antibiotics') {
    const cap = healthCap(b.dose);
    if (b.hp >= cap - 0.5) return null;
    return { ...b, hp: cap, said: cap < 100 ? `Antibiotics: health back to ${cap}, the most your dose allows.` : 'Antibiotics: health back to full.' };
  }
  if (b.adrenaline > 0) return null;
  return { ...b, adrenaline: ADRENALINE_SECONDS, focus: true, said: 'Adrenaline: for a minute blows hurt half as much, and your focus is back.' };
}

/** What part of a blow is felt with this much adrenaline left. */
export function blowFelt(adrenaline: number): number { return adrenaline > 0 ? ADRENALINE_FELT : 1; }

/** The adrenaline left after `dt` seconds. */
export function stepAdrenaline(adrenaline: number, dt: number): number { return Math.max(0, adrenaline - dt); }

/** Why one cannot be used now, said when a right-click with it does nothing. */
export function medicineIdle(m: Medicine): string {
  return m === 'rad_tablets' ? 'No dose to bind. Keep them for the ridge.' : m === 'antibiotics' ? 'You are as well as your dose allows.' : 'It is still in your blood.';
}
