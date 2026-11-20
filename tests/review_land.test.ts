// Review probe for branch `fixes` (the land, N3; and M1's "back home"). Written by a reviewer who did not write
// the code. tests/walk.test.ts floods the valley from the inside and shows nothing leaves. This floods the other
// way: from where the player comes out (the canyon side of the tunnel), with the tunnel's gate shut as it stands,
// does a walk, a jump or a swim reach the sanctuary? If it does, M1's "back home", "home from Las Cruces" and
// "home from across the dam" tick up on the rim without the swim back, and a death there costs nothing.

import { describe, it, expect, vi } from 'vitest';
import { Land, Flood, standing, show, measureRules, follow, nameAt, type Spot } from './walk.ts';
import { VALLEY, HOME_GROUNDS, GATE, CANYON_FALLS, inSanctuary, distToValley } from '../src/gen/layout.ts';
import { WORLD_X } from '../src/world/constants.ts';
import { trackM1 } from '../src/sim/milestones.ts';
import { losesPack } from '../src/sim/death.ts';

vi.setConfig({ testTimeout: 600_000 });

describe('FINDING 6 · the sanctuary is reached from outside over the rim, with the gate shut', () => {
  // NOT FIXED (docs/FIXES.md, 9 and "Left undone"): the valley's outer rim can be walked up from the canyon and its
  // south cliff climbed down by harmless falls. It is so on main too. Closing it means reshaping the valley's
  // cliffs, the most looked-at land in the game, which wants its own pass and the owner's eye. What it let a
  // player cheat is closed: M1's "back home" now needs the swim through the gate (tests/review_money.test.ts).
  it.skip('from the canyon side of the tunnel, no walk, jump or swim should end inside the sanctuary', () => {
    const land = new Land();
    const at = land.blockAt;
    const R = measureRules();
    // The land round the valley, 200 blocks out from the rim and out to the world's east edge.
    const M = 200;
    const x0 = VALLEY.cx - VALLEY.radius - M, x1 = Math.min(WORLD_X - 1, HOME_GROUNDS.x1 + M), z0 = VALLEY.cz - VALLEY.radius - M, z1 = VALLEY.cz + VALLEY.radius + M;
    const inside = (x: number, z: number) => x >= x0 && x <= x1 && z >= z0 && z <= z1;
    // Where the player comes out: the open ground in the canyon west of the falls, on the tunnel's line.
    const out = Math.floor(CANYON_FALLS.x) - 12;
    const starts: Spot[] = standing(at, out, GATE.z0 + 1).slice(-1);
    expect(starts.length).toBe(1);
    expect(inSanctuary(starts[0].x, starts[0].z)).toBe(false);
    const found: number[] = [];
    for (const [name, opts] of [['walking and jumping, falls that do no harm', { inside, drop: R.safeFall }], ['with running jumps and any fall short of a deadly one', { inside, jumps: true }]] as const) {
      const flood = new Flood(at, starts, opts);
      const inn = flood.spots.filter((s) => inSanctuary(s.x, s.z));
      const ways = inn.slice(0, 4000).map((s) => flood.wayTo(s));
      const first = ways.length ? ways.reduce((a, b) => (b.length < a.length ? b : a)) : [];
      const floor = inn.filter((s) => Math.abs(s.y - VALLEY.floor) < 3 && distToValley(s.x, s.z) < VALLEY.radius - 20).length;
      const top = first[first.length - 1];
      console.info(`REVIEW from the canyon ${show(starts[0])}, ${name}: ${flood.spots.length} places reached, ${inn.length} in the sanctuary, ${floor} of them on the valley's floor.` +
        (top ? ` A way to a sanctuary place, ${show(top)}, in ${first.length} steps: ${first.filter((_s, i) => i % Math.ceil(first.length / 10) === 0 || i === first.length - 1).map(show).join(' → ')}` : ''));
      if (top) {
        // What the game makes of standing there, having been out and to Zone 1.
        const f = new Set(['been_out', 'reached_near']);
        const got = trackM1(f, top.x + 0.5, top.z + 0.5, false);
        console.info(`REVIEW standing at ${show(top)}: M1 ticks ${JSON.stringify(got)}; a death here costs the pack: ${losesPack(top.x + 0.5, top.z + 0.5)}`);
      }
      found.push(inn.length);
      if (name.startsWith('walking') && floor) {
        // The whole way from the canyon to the middle of the valley's floor, then walked by the real Player.
        const goal = inn.filter((s) => Math.abs(s.y - VALLEY.floor) < 3).reduce((a, b) => (distToValley(b.x, b.z) < distToValley(a.x, a.z) ? b : a));
        const way = flood.wayTo(goal);
        const enter = way.findIndex((s) => inSanctuary(s.x + 0.5, s.z + 0.5));
        let drop = 0, rise = 0;
        for (let i = 1; i < way.length; i++) { drop = Math.max(drop, way[i - 1].y - way[i].y); rise = Math.max(rise, way[i].y - way[i - 1].y); }
        const down = way.slice(enter - 3).filter((_s, i, a) => i % Math.ceil(a.length / 16) === 0 || i === a.length - 1);
        console.info(`REVIEW the way in: ${way.length} steps to ${show(goal)}; the biggest single drop ${drop} blocks, the biggest step up ${rise}; it crosses into the sanctuary at step ${enter}, ${show(way[enter])}, standing on ${nameAt(at, way[enter].x, Math.ceil(way[enter].y) - 1, way[enter].z)}; from there: ${down.map((s) => `${show(s)} on ${nameAt(at, s.x, Math.ceil(s.y) - 1, s.z)}`).join(' → ')}`);
        const walked = follow(at, way, { jump: true });
        console.info(`REVIEW the real Player set to walk it: arrived ${walked.arrived}, stopped at (${walked.at.map((v) => v.toFixed(1)).join(', ')}) after ${walked.seconds.toFixed(0)} s, longest fall ${walked.fall.toFixed(1)} blocks, least breath ${walked.breath.toFixed(1)} s`);
      }
    }
    expect(found, 'places in the sanctuary reached from the canyon [harmless falls only, any fall short of deadly]').toEqual([0, 0]);
  });
});
