// The first ten minutes (docs/FIXES.md, 7): which goal to show on screen. First the handful of things a new
// arrival should do, one at a time; after them, the next step of the milestone in hand. Pure.

import data from '../../data/guide.json' with { type: 'json' };
import { M1_STEPS, M2_STEPS, M3_STEPS, M4_STEPS, type Step } from './milestones.ts';
import { M5_STEPS } from './m5.ts';

export const OPENING: string[] = data.opening;
export const FIRST_GOALS: Step[] = data.goals.map((g) => ({ flag: g.flag, label: g.text }));
export const HINTS: Record<string, string> = data.hints;

const MILESTONE_STEPS: [string, string, Step[]][] = [
  ['m1_done', 'M1', M1_STEPS], ['m2_done', 'M2', M2_STEPS], ['m3_done', 'M3', M3_STEPS], ['m4_done', 'M4', M4_STEPS], ['m5_done', 'M5', M5_STEPS],
];

/**
 * The one line to show: the first of the first goals not yet done; then the first step not yet ticked of the
 * first milestone not yet done; null when there is nothing left to point at. A valley that has finished M1 is
 * past the first goals, whether or not each was ever ticked.
 */
export function nextGoal(flags: ReadonlySet<string>): string | null {
  if (!flags.has('m1_done')) {
    const first = FIRST_GOALS.find((g) => !flags.has(g.flag));
    if (first) return first.label;
  }
  for (const [done, name, steps] of MILESTONE_STEPS) {
    if (flags.has(done)) continue;
    const step = steps.find((s) => !flags.has(s.flag));
    return step ? `${name} · ${step.label}` : null;
  }
  return null;
}
