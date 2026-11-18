import { describe, it, expect } from 'vitest';
import { HOME, inSanctuary, zoneAt } from '../src/gen/layout.ts';
import { losesPack } from '../src/sim/death.ts';
import { makeCreature, fits } from '../src/entity/creatures.ts';
import { groundAt } from '../src/entity/spawner.ts';
import { AIR } from '../src/world/blocks.ts';

// Review (Silas, 2026-11-18): the sanctuary was only the valley's bowl, so most of the builder's home,
// cut deep into the east cliff, counted as wilderness.
describe('the builder’s home is part of the sanctuary', () => {
  it('every room, from the mouth to the vault, is in the sanctuary and is valley', () => {
    for (const r of HOME.rooms)
      for (let x = r.x0; x < r.x1; x++)
        for (let z = r.z0; z < r.z1; z++) {
          expect(inSanctuary(x, z), `${r.name} ${x},${z}`).toBe(true);
          expect(zoneAt(x, z), `${r.name} ${x},${z}`).toBe('valley');
        }
  });

  it('dying anywhere in the home costs nothing (no lost pack)', () => {
    for (const r of HOME.rooms) expect(losesPack((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2), r.name).toBe(false);
  });

  it('no creature fits, or is given ground to spawn on, over or under the home', () => {
    const open = () => AIR;
    for (const r of HOME.rooms) {
      const x = (r.x0 + r.x1) / 2, z = (r.z0 + r.z1) / 2;
      expect(fits(makeCreature('dog', x, r.y0, z), x, r.y0, z, open), r.name).toBe(false);
      expect(groundAt(x, z, (_x, y) => (y < 120 ? 1 : AIR)), r.name).toBeNull();
    }
  });
});
