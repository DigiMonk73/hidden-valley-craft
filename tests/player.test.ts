import { describe, it, expect } from 'vitest';
import { Player, type Input } from '../src/sim/player.ts';
import { blockId, AIR } from '../src/world/blocks.ts';

const STONE = blockId('limestone');
const still: Input = { forward: 0, strafe: 0, jump: false, sprint: false, descend: false };

/** A floor at y = 0 and a ceiling at y = ceilingY, everywhere. */
function room(ceilingY: number) {
  return (_x: number, y: number) => (y <= 0 || y >= ceilingY ? STONE : AIR);
}

function run(p: Player, ticks: number, input: Input, blockAt: (x: number, y: number, z: number) => number): number {
  let maxY = p.y;
  for (let i = 0; i < ticks; i++) { p.step(1 / 60, input, blockAt); maxY = Math.max(maxY, p.y); }
  return maxY;
}

describe('player under a ceiling', () => {
  it('jumping in a two-high tunnel keeps the player inside it', () => {
    const p = new Player();
    p.setPosition(0.5, 1, 0.5);
    const world = room(3); // air at y = 1 and 2
    run(p, 10, still, world);
    const maxY = run(p, 120, { ...still, jump: true }, world);
    expect(maxY).toBeLessThan(1.3);
    run(p, 60, still, world);
    expect(p.y).toBeCloseTo(1, 3);
  });

  it('jumping under a three-high roof bumps the head and lands back on the floor', () => {
    const p = new Player();
    p.setPosition(0.5, 1, 0.5);
    const world = room(4);
    const maxY = run(p, 120, { ...still, jump: true }, world);
    expect(maxY).toBeLessThan(2.3);
    run(p, 60, still, world);
    expect(p.y).toBeCloseTo(1, 3);
  });

  it('flying up into a ceiling stops at it', () => {
    const p = new Player();
    p.setPosition(0.5, 1, 0.5);
    p.flying = true;
    const world = room(6);
    run(p, 180, { ...still, jump: true }, world);
    expect(p.y + 1.8).toBeLessThanOrEqual(6);
  });

  it('a player stuck in solid rock is not lifted through it', () => {
    const p = new Player();
    p.setPosition(0.5, 10, 0.5);
    const solid = () => STONE;
    run(p, 60, still, solid);
    expect(p.y).toBe(10);
  });
});
