// The player's body: walking, sprinting, jumping, stepping up single blocks without a jump (so the
// path down from the balcony is easy), swimming with a breath meter, and flying for exploring.

import { B_SOLID, WATER } from '../world/blocks.ts';

export interface Input {
  forward: number; // -1 … 1
  strafe: number; // -1 … 1
  jump: boolean;
  sprint: boolean;
  descend: boolean;
}

const WIDTH = 0.6;
const HEIGHT = 1.8;
export const EYE = 1.62;
const GRAVITY = 28;
const JUMP_SPEED = 8.6;
const WALK = 4.0;
const SPRINT = 5.6;
const SWIM = 2.6;
const FLY = 12;
export const BREATH_MAX = 20; // seconds

type BlockAt = (x: number, y: number, z: number) => number;

export class Player {
  x = 0; y = 0; z = 0; // feet, centre
  vx = 0; vy = 0; vz = 0;
  yaw = 0; // radians; 0 looks north (−z), increasing turns to the west
  pitch = 0;
  onGround = false;
  flying = false;
  inWater = false;
  headInWater = false;
  breath = BREATH_MAX;
  /** Smoothed eye height, so stepping up a block glides instead of jolting. */
  eyeY = 0;

  setPosition(x: number, y: number, z: number): void {
    this.x = x; this.y = y; this.z = z;
    this.vx = this.vy = this.vz = 0;
    this.eyeY = y + EYE;
  }

  lookDir(): [number, number, number] {
    const cp = Math.cos(this.pitch);
    return [-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp];
  }

  step(dt: number, input: Input, blockAt: BlockAt): void {
    const isWater = (x: number, y: number, z: number) => blockAt(Math.floor(x), Math.floor(y), Math.floor(z)) === WATER;
    this.inWater = isWater(this.x, this.y + 0.4, this.z);
    this.headInWater = isWater(this.x, this.y + EYE, this.z);
    if (this.headInWater && !this.flying) this.breath = Math.max(0, this.breath - dt);
    else this.breath = Math.min(BREATH_MAX, this.breath + dt * 4);

    // Wished-for horizontal velocity from the keys, relative to where the player faces.
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let wx = -sin * input.forward + cos * input.strafe;
    let wz = -cos * input.forward - sin * input.strafe;
    const len = Math.hypot(wx, wz);
    if (len > 1) { wx /= len; wz /= len; }

    if (this.flying) {
      const speed = input.sprint ? FLY * 2.5 : FLY;
      this.vx = wx * speed; this.vz = wz * speed;
      this.vy = (input.jump ? speed : 0) - (input.descend ? speed : 0);
    } else if (this.inWater) {
      const speed = input.sprint ? SWIM * 1.4 : SWIM;
      this.vx += (wx * speed - this.vx) * Math.min(1, dt * 6);
      this.vz += (wz * speed - this.vz) * Math.min(1, dt * 6);
      // Slow sinking; space swims up, and climbs out at the edge.
      this.vy += (input.jump ? 9 : -3.5) * dt;
      this.vy = Math.max(-2.5, Math.min(3.2, this.vy));
      this.vy *= 1 - Math.min(1, dt * 1.5);
    } else {
      const speed = input.sprint ? SPRINT : WALK;
      const accel = this.onGround ? 14 : 3;
      this.vx += (wx * speed - this.vx) * Math.min(1, dt * accel);
      this.vz += (wz * speed - this.vz) * Math.min(1, dt * accel);
      this.vy -= GRAVITY * dt;
      if (this.vy < -50) this.vy = -50;
      if (input.jump && this.onGround) this.vy = JUMP_SPEED;
    }

    this.move(dt, blockAt);
    // Glide the eye toward its true height (fast down, gentle up).
    const target = this.y + EYE;
    const k = target > this.eyeY ? 14 : 30;
    this.eyeY += (target - this.eyeY) * Math.min(1, dt * k);
    if (Math.abs(target - this.eyeY) > 1.5) this.eyeY = target;
  }

  private collides(x: number, y: number, z: number, blockAt: BlockAt): boolean {
    const x0 = Math.floor(x - WIDTH / 2), x1 = Math.floor(x + WIDTH / 2 - 1e-6);
    const y0 = Math.floor(y), y1 = Math.floor(y + HEIGHT - 1e-6);
    const z0 = Math.floor(z - WIDTH / 2), z1 = Math.floor(z + WIDTH / 2 - 1e-6);
    for (let by = y0; by <= y1; by++)
      for (let bz = z0; bz <= z1; bz++)
        for (let bx = x0; bx <= x1; bx++) if (B_SOLID[blockAt(bx, by, bz)]) return true;
    return false;
  }

  /** True if a block at (bx, by, bz) would overlap the player's body. */
  intersectsBlock(bx: number, by: number, bz: number): boolean {
    return bx + 1 > this.x - WIDTH / 2 && bx < this.x + WIDTH / 2 && by + 1 > this.y && by < this.y + HEIGHT && bz + 1 > this.z - WIDTH / 2 && bz < this.z + WIDTH / 2;
  }

  private move(dt: number, blockAt: BlockAt): void {
    if (this.collides(this.x, this.y, this.z, blockAt)) {
      // Stuck inside a block (the world loaded around us): step up into open space if there is
      // some within two blocks; never climb further, or a stuck player would rise through rock.
      for (const up of [1, 2]) {
        const y = Math.floor(this.y) + up;
        if (!this.collides(this.x, y, this.z, blockAt)) { this.y = y; break; }
      }
      this.vy = 0;
      return;
    }
    // Vertical first.
    const ny = this.y + this.vy * dt;
    this.onGround = false;
    if (this.collides(this.x, ny, this.z, blockAt)) {
      if (this.vy < 0) { this.y = Math.floor(ny) + 1; this.onGround = true; }
      else this.y = Math.floor(ny + HEIGHT) - HEIGHT - 1e-4; // head stops just under the ceiling
      this.vy = 0;
    } else this.y = ny;
    // Then each horizontal axis, stepping up one block when walking into a ledge.
    for (const axis of [0, 1]) {
      const v = axis === 0 ? this.vx : this.vz;
      if (v === 0) continue;
      const nx = axis === 0 ? this.x + v * dt : this.x;
      const nz = axis === 1 ? this.z + v * dt : this.z;
      if (!this.collides(nx, this.y, nz, blockAt)) { this.x = nx; this.z = nz; continue; }
      const canStep = (this.onGround || this.inWater) && !this.flying;
      const up = Math.floor(this.y) + 1;
      if (canStep && up - this.y <= 1.01 && !this.collides(this.x, up, this.z, blockAt) && !this.collides(nx, up, nz, blockAt)) {
        this.y = up; this.x = nx; this.z = nz;
        continue;
      }
      // Blocked: stop against the face (or stay put if even that overlaps something).
      const ox = this.x, oz = this.z;
      if (axis === 0) { this.x = v > 0 ? Math.floor(nx + WIDTH / 2) - WIDTH / 2 - 1e-4 : Math.floor(nx - WIDTH / 2) + 1 + WIDTH / 2 + 1e-4; this.vx = 0; }
      else { this.z = v > 0 ? Math.floor(nz + WIDTH / 2) - WIDTH / 2 - 1e-4 : Math.floor(nz - WIDTH / 2) + 1 + WIDTH / 2 + 1e-4; this.vz = 0; }
      if (this.collides(this.x, this.y, this.z, blockAt)) { this.x = ox; this.z = oz; }
    }
  }
}
