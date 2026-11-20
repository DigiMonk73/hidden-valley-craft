// The time and the day, shown at the start of the hotbar (the owner, 2026-11-20: "you can sleep at 5:00 pm but
// there is no working clock"). Pure, so the rule for the bed and the clock's warm colour are one rule.

/** The bed can be slept in from five in the evening until six in the morning. */
export const SLEEP_FROM = 17;
export const SLEEP_UNTIL = 6;
export const canSleep = (hour: number): boolean => hour >= SLEEP_FROM || hour < SLEEP_UNTIL;

/** "4:35 PM" and "Day 3" for an hour of 0–24 and a day counted from 0 (the first day is Day 1). */
export function clockText(hour: number, day: number): { time: string; day: string; sleep: boolean } {
  const minutes = Math.floor((((hour % 24) + 24) % 24) * 60) % (24 * 60);
  const h24 = Math.floor(minutes / 60), mm = minutes % 60;
  const h12 = ((h24 + 11) % 12) + 1;
  return { time: `${h12}:${String(mm).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`, day: `Day ${Math.max(0, Math.floor(day)) + 1}`, sleep: canSleep(hour) };
}
