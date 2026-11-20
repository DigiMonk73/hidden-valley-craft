// Review probe for branch `fixes` (the land, N3; and M1's "back home"). Written by a reviewer who did not write
// the code. tests/walk.test.ts floods the valley from the inside and shows nothing leaves. This floods the other
// way: from where the player comes out (the canyon side of the tunnel), with the tunnel's gate shut as it stands,
// does a walk, a jump or a swim reach the sanctuary? If it does, M1's "back home", "home from Las Cruces" and
// "home from across the dam" tick up on the rim without the swim back, and a death there costs nothing.

import { describe, it, expect, vi } from 'vitest';
import { Land, Flood, standing, show, measureRules, type Spot } from './walk.ts';
import { VALLEY, HOME, HOME_GROUNDS, GATE, CANYON_FALLS, WATERFALL, RIM_MENDS, inSanctuary, inValleyBowl, distToValley, outsideHeight } from '../src/gen/layout.ts';
import { WORLD_X, WORLD_Y } from '../src/world/constants.ts';
import { AIR, B_SOLID, blockId } from '../src/world/blocks.ts';
import { Player } from '../src/sim/player.ts';
import { fallDamage } from '../src/sim/survival.ts';
import { plateauAt } from '../tools/rimwalk.ts';
import { trackM1, HOME_LEVEL } from '../src/sim/milestones.ts';
import { losesPack } from '../src/sim/death.ts';

vi.setConfig({ testTimeout: 600_000 });

const ROCK = new Set(['limestone', 'limestone_mossy'].map(blockId));
const isRock = (id: number): boolean => ROCK.has(id);

describe('FINDING 6 · the valley is not walked into over its rim (docs/PHASE9B.md, 3)', () => {
  // MENDED in Phase 9B. This test was written by the fixes branch's reviewer and skipped: from the canyon a walker
  // climbed the valley's outer slope and came down its cliff by steps and falls that do no harm, at two places where
  // the cliff's ledges lined up into a stair. Those two bands of cliff are sheer now (src/gen/layout.ts, RIM_MENDS).
  //
  // What is asserted, and why it is not what the reviewer first wrote:
  // - The reviewer counted any place inside the sanctuary's circle. The sanctuary reaches 8 m past the cliff's top
  //   edge, onto the plateau, which is one piece with the land outside: that part can always be walked onto, and
  //   nothing but a wall round the whole rim would change it. What matters is the valley below the rim.
  // - The rule is the walk: steps, jumps and falls that do no harm. With running jumps and falls that hurt but do
  //   not kill, the cliff can still be come down at many places all round the rim; closing that means a sheer band
  //   round the whole upper cliff, the most looked-at land in the game, and was left for the lead and the owner
  //   (its numbers are printed here on every run, not asserted).
  // - A dive is not a walk either: see the last test here.
  const land = new Land();
  const at = land.blockAt;
  const R = measureRules();
  // The land round the valley, 200 blocks out from the rim and out to the world's east edge.
  const M = 200;
  const x0 = VALLEY.cx - VALLEY.radius - M, x1 = Math.min(WORLD_X - 1, HOME_GROUNDS.x1 + M), z0 = VALLEY.cz - VALLEY.radius - M, z1 = VALLEY.cz + VALLEY.radius + M;
  const inside = (x: number, z: number) => x >= x0 && x <= x1 && z >= z0 && z <= z1;
  // Where the player comes out: the open ground in the canyon west of the falls, on the tunnel's line.
  const start = (): Spot[] => standing(at, Math.floor(CANYON_FALLS.x) - 12, GATE.z0 + 1).slice(-1);
  const onFloor = (s: Spot) => Math.abs(s.y - VALLEY.floor) < 3 && distToValley(s.x, s.z) < VALLEY.radius - 20;
  const atHome = (s: Spot) => s.x >= HOME_GROUNDS.x0 && s.x < HOME_GROUNDS.x1 && s.z >= HOME_GROUNDS.z0 && s.z < HOME_GROUNDS.z1 && s.y < HOME.floor + 12;
  const below = (s: Spot) => plateauAt(s.x, s.z) - s.y;

  it('from the canyon side of the tunnel, no walk, jump or harmless fall ends on the valley’s floor, at the home, or more than 30 blocks below the rim', () => {
    const starts = start();
    expect(starts.length).toBe(1);
    expect(inSanctuary(starts[0].x, starts[0].z)).toBe(false);
    const flood = new Flood(at, starts, { inside, drop: R.safeFall });
    const bowl = flood.spots.filter((s) => inValleyBowl(s.x, s.z));
    const deepest = bowl.reduce((a, b) => (below(b) > below(a) ? b : a));
    console.info(`RIM from the canyon ${show(starts[0])}, walking and jumping, falls that do no harm: ${flood.spots.length} places reached, ${bowl.length} within the bowl's circle (the plateau's edge and the worn rim), the deepest ${show(deepest)}, ${below(deepest)} below the plateau.`);
    // The flood really does get all round the rim: a mend is not passing because the walker never arrived.
    expect(bowl.length).toBeGreaterThan(3000);
    const bearings = new Set(bowl.map((s) => Math.floor((((Math.atan2(s.z - VALLEY.cz, s.x - VALLEY.cx) * 180) / Math.PI + 360) % 360) / 10)));
    expect(bearings.size, 'the walk stands on the rim at every tenth of the way round').toBe(36);
    expect(bowl.filter(onFloor).map(show).slice(0, 5), 'places on the valley’s floor').toEqual([]);
    expect(flood.spots.filter(atHome).map(show).slice(0, 5), 'places at the home').toEqual([]);
    expect(bowl.filter((s) => below(s) > 30).map(show).slice(0, 5), 'places more than 30 below the plateau').toEqual([]);
    // What the game makes of standing on the rim, having been out and to Zone 1: nothing is ticked by it.
    const top = bowl.find((s) => below(s) < 2 && distToValley(s.x, s.z) < VALLEY.radius + 5)!;
    expect(trackM1(new Set(['been_out', 'reached_near']), top.x + 0.5, top.z + 0.5, false, top.y)).toEqual([]);
    // Nor at the lowest place the walk gets to: "home" is below anywhere the cliff's top can be walked down to.
    for (const s of bowl) expect(s.y, `${show(s)} is low enough to count as home`).toBeGreaterThan(HOME_LEVEL);
    expect(trackM1(new Set(['been_out', 'reached_near']), deepest.x + 0.5, deepest.z + 0.5, false, deepest.y)).toEqual([]);
    // Down in the valley it does tick, as before.
    expect(trackM1(new Set(['been_out', 'reached_near']), VALLEY.cx + 0.5, VALLEY.cz + 0.5, false, VALLEY.floor)).toEqual(['extracted']);
    expect(losesPack(top.x + 0.5, top.z + 0.5)).toBe(false); // (it is inside the sanctuary's circle: a death there costs nothing)
  });

  it('each mended band is a sheer face: the walk stands at its top and nowhere inside it', () => {
    const flood = new Flood(at, start(), { inside, drop: R.safeFall });
    for (const m of RIM_MENDS) {
      const inSector = (s: Spot) => { const d = (Math.atan2(s.z - VALLEY.cz, s.x - VALLEY.cx) * 180) / Math.PI; return d >= m.from && d <= m.to && inValleyBowl(s.x, s.z); };
      const here = flood.spots.filter(inSector);
      // The cliff above the band is as it was: the walk still comes down to the band's top.
      expect(here.some((s) => s.y >= m.hi && s.y <= m.hi + 4), `${m.name}: the walk reaches the top of the band`).toBe(true);
      expect(here.filter((s) => s.y < m.hi - 1).map(show), `${m.name}: places reached below the band's top`).toEqual([]);
      // And the band is high: a fall down it costs more than half of full health.
      expect(fallDamage(m.hi - m.lo)).toBeGreaterThan(50);
      // Within the band no column has rock with air over it (a ledge), on the face the valley sees.
      let ledges = 0;
      for (let deg = m.from; deg <= m.to; deg += 0.25) for (let r = VALLEY.radius - 14; r <= VALLEY.radius + 10; r++) {
        const a = (deg * Math.PI) / 180, x = Math.round(VALLEY.cx + Math.cos(a) * r), z = Math.round(VALLEY.cz + Math.sin(a) * r);
        const d = (Math.atan2(z - VALLEY.cz, x - VALLEY.cx) * 180) / Math.PI;
        if (d < m.from || d > m.to) continue; // (rounding put the cell just outside the band's bearings)
        // (Rock with air over it. Where the plateau's edge is lower than the band's top, its worn steps, the top four
        // blocks of the land, are the lip the walker stands on, not ledges of the face.)
        for (let y = m.lo; y < m.hi - 1 && y + 1 <= outsideHeight(x, z) - 4; y++) if (isRock(at(x, y, z)) && at(x, y + 1, z) === AIR && at(x, y + 2, z) === AIR) ledges++;
      }
      expect(ledges, `${m.name}: ledges inside the band`).toBe(0);
    }
  });

  it('NOT CLOSED, and printed on every run: with falls that hurt, the cliff is still come down elsewhere', () => {
    // The least that gets in now: falls of 5 blocks, 7 health each. (Before the mends it was free.)
    const five = new Flood(at, start(), { inside, drop: R.safeFall + 1 });
    const floor5 = five.spots.filter(onFloor);
    let how = '';
    if (floor5.length) {
      const w = five.wayTo(floor5[0]);
      const falls = w.map((s, i) => (i ? w[i - 1].y - s.y : 0)).filter((f) => f > R.safeFall);
      const first = w.find((s) => inValleyBowl(s.x, s.z) && below(s) > 12)!;
      how = ` One way: below the rim at ${show(first)}, bearing ${Math.round((Math.atan2(first.z - VALLEY.cz, first.x - VALLEY.cx) * 180) / Math.PI)}°, by ${falls.length} falls of ${falls.join(', ')} blocks (${falls.reduce((n, f) => n + fallDamage(f), 0)} health in all).`;
    }
    console.info(`RIM with falls of up to ${R.safeFall + 1} blocks (${fallDamage(R.safeFall + 1)} health each): ${floor5.length} places on the valley's floor.${how}`);
    const flood = new Flood(at, start(), { inside, jumps: true });
    const floor = flood.spots.filter(onFloor).length, home = flood.spots.filter(atHome).length;
    console.info(`RIM with running jumps and any fall short of a deadly one (${R.deadlyFall} blocks): ${flood.spots.length} places reached, ${floor} on the valley's floor, ${home} at the home. Closing this means a band with no ledge round the whole cliff (docs/PHASE9B.md, 3: left for the lead).`);
    // Pinned, so that a change which closes the valley to these too is noticed and this note rewritten.
    expect(floor5.length).toBeGreaterThan(0);
    expect(floor).toBeGreaterThan(0);
  });

  it('KNOWN, and left for the lead: a dive from the ridge over the valley’s falls lands in the pool unharmed (any water breaks any fall)', () => {
    // Not a walk and not a cliff: the real Player walks east off the ridge's top above the falls and comes down 48
    // blocks into the pool. No mend of the rim closes this; only a change to what water does to a fall would.
    const topOf = (x: number, z: number) => { let y = WORLD_Y - 1; while (y > 0 && !B_SOLID[at(x, y, z)]) y--; return y + 1; };
    const z = Math.round((WATERFALL.z0 + WATERFALL.z1) / 2), x = WATERFALL.x - 11;
    const p = new Player();
    p.setPosition(x + 0.5, topOf(x, z), z + 0.5);
    p.yaw = -Math.PI / 2; // east
    const from = p.y;
    let worst = 0;
    for (let t = 0; t < 30 && !(p.inWater && p.y < VALLEY.floor + 2); t += 1 / 60) {
      p.step(1 / 60, { forward: 1, strafe: 0, jump: false, sprint: false, descend: false }, at);
      worst = Math.max(worst, p.landedFall);
      p.landedFall = 0;
    }
    console.info(`RIM the dive: from y ${from} on the ridge to (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}) in the pool; the worst fall counted ${worst.toFixed(1)} blocks, ${fallDamage(worst)} health.`);
    expect(from - p.y).toBeGreaterThan(40);
    expect(p.inWater).toBe(true);
    expect(fallDamage(worst)).toBeLessThan(30);
    expect(inSanctuary(p.x, p.z)).toBe(true);
  });
});
