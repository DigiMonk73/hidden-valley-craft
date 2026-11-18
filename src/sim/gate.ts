// The builder's gate in the drowned tunnel. It looks like the rock around it. Pulling the marked stone
// on either side starts the ritual: a grinding, a rumble, and the slab lifting row by row into the
// roof until the light from the far side comes through. It lowers itself again once you have passed,
// and never onto a swimmer.

import { blockId, WATER } from '../world/blocks.ts';
import { GATE } from '../gen/layout.ts';
import type { World } from '../world/world.ts';

export const GATE_STONE = blockId('gate_stone');
export const GATE_LEVER = blockId('gate_lever');

const ROWS = GATE.y1 - GATE.y0;
const ROW_SECONDS = 0.55;
/** How long it stays open at least, and how far the swimmer must be from it before it closes. */
const HOLD = 5;
const CLEAR = 3;

export type GateEvent = 'grind' | 'open' | 'shut' | 'held';

interface Swimmer { x: number; intersectsBlock(x: number, y: number, z: number): boolean }

export class Gate {
  /** Rows lifted, from the bottom: 0 shut … ROWS open. */
  rows = 0;
  state: 'shut' | 'opening' | 'open' | 'closing' = 'shut';
  private timer = 0;

  /** Someone pulled a lever: open (or keep open, or stop closing and open again). */
  pull(): GateEvent | null {
    if (this.state === 'open') { this.timer = HOLD; return null; }
    if (this.state === 'opening') return null;
    this.state = 'opening';
    this.timer = ROW_SECONDS;
    return 'grind';
  }

  update(dt: number, world: World, who: Swimmer): GateEvent | null {
    // A gate that was saved open (or opened in builder's mode) is found that way once its blocks load.
    if (this.state === 'shut' && this.rows === 0 && world.blockAt(GATE.x0, GATE.y0, GATE.z0) === WATER) {
      this.rows = ROWS;
      this.state = 'open';
      this.timer = HOLD;
    }
    if (this.state === 'shut') return null;
    this.timer -= dt;
    if (this.timer > 0) return null;
    switch (this.state) {
      case 'opening':
        this.setRow(world, this.rows, WATER);
        this.rows++;
        this.timer = ROW_SECONDS;
        if (this.rows >= ROWS) { this.state = 'open'; this.timer = HOLD; return 'open'; }
        return null;
      case 'open': {
        const near = Math.abs(who.x - (GATE.x0 + GATE.x1) / 2) < CLEAR;
        if (near || this.rowOccupied(this.rows - 1, who)) { this.timer = 0.5; return null; }
        this.state = 'closing';
        this.timer = 0;
        return 'grind';
      }
      case 'closing': {
        // The slab comes down from the roof: the top row fills first. It waits for anyone in the way.
        const row = this.rows - 1;
        if (this.rowOccupied(row, who)) { this.timer = 0.3; return 'held'; }
        this.setRow(world, row, GATE_STONE);
        this.rows--;
        this.timer = ROW_SECONDS;
        if (this.rows <= 0) { this.state = 'shut'; return 'shut'; }
        return null;
      }
    }
    return null;
  }

  /** Row r counted from the bottom; the bottom row lifts first and closes last. */
  private setRow(world: World, r: number, id: number): void {
    const y = GATE.y0 + r;
    for (let z = GATE.z0; z < GATE.z1; z++) for (let x = GATE.x0; x < GATE.x1; x++) world.setBlock(x, y, z, id);
  }

  /** Is the swimmer in the rows from r up (the slab would come down on them)? */
  private rowOccupied(r: number, who: Swimmer): boolean {
    for (let y = GATE.y0 + Math.max(0, r); y < GATE.y1; y++)
      for (let z = GATE.z0; z < GATE.z1; z++) for (let x = GATE.x0; x < GATE.x1; x++) if (who.intersectsBlock(x, y, z)) return true;
    return false;
  }
}
