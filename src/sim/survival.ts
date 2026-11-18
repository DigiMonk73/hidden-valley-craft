// Health, hunger and thirst (each 0–100). Hunger empties in about 40 minutes and thirst in about 25;
// either at zero wears health away, and health comes back slowly while both are well fed. Gentler
// than the prototype's numbers, because the valley is a place to live, not a trial.

export const HUNGER_MINUTES = 40;
export const THIRST_MINUTES = 25;
const STARVE_HP_PER_S = 0.5;
const REGEN_HP_PER_S = 0.35;
const DROWN_HP_PER_S = 6;
export const SAFE_FALL = 4; // blocks
const FALL_HP_PER_BLOCK = 7;

export interface Vitals { hp: number; hunger: number; thirst: number }

export function freshVitals(): Vitals { return { hp: 100, hunger: 100, thirst: 100 }; }

/** Advances the body by dt seconds. `exertion` is 1 at a walk and more when sprinting or swimming. */
export function tickVitals(v: Vitals, dt: number, exertion: number, drowning: boolean): void {
  v.hunger = Math.max(0, v.hunger - (dt * 100 * exertion) / (HUNGER_MINUTES * 60));
  v.thirst = Math.max(0, v.thirst - (dt * 100 * exertion) / (THIRST_MINUTES * 60));
  if (v.hunger === 0 || v.thirst === 0) v.hp -= STARVE_HP_PER_S * dt;
  else if (v.hunger > 60 && v.thirst > 60) v.hp += REGEN_HP_PER_S * dt;
  if (drowning) v.hp -= DROWN_HP_PER_S * dt;
  v.hp = Math.max(0, Math.min(100, v.hp));
}

export function fallDamage(blocks: number): number {
  return blocks > SAFE_FALL ? Math.round((blocks - SAFE_FALL) * FALL_HP_PER_BLOCK) : 0;
}

/** Eats or drinks: returns false if there was no room for it (already full). */
export function consume(v: Vitals, food: { hunger?: number; thirst?: number }, heal = 0): boolean {
  const useful = (food.hunger && v.hunger < 99) || (food.thirst && v.thirst < 99) || (heal && v.hp < 99);
  if (!useful) return false;
  v.hunger = Math.min(100, v.hunger + (food.hunger ?? 0));
  v.thirst = Math.max(0, Math.min(100, v.thirst + (food.thirst ?? 0)));
  v.hp = Math.min(100, v.hp + heal);
  return true;
}
