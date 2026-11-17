// Small things in the air: spray and mist at the foot of the waterfall, fireflies at dusk, and chips
// of block when something is mined. One pool of points per blending mode, updated on the CPU.

import * as THREE from 'three';
import { SKY_COLOR_GLSL, type SkyState } from './sky.ts';
import { B_FACE_TEX, BLOCK_COUNT, B_SOLID, TEXTURE_NAMES } from '../world/blocks.ts';
import { drawTexture } from './textures.ts';

export const KIND = { chip: 0, mist: 1, firefly: 2 } as const;

const VERT = /* glsl */ `
in vec4 aColor;
in float aSize;
in float aKind;
uniform float uScale;
out vec4 vColor;
out float vKind;
out float vDist;
out vec3 vWorld;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uScale / -mv.z, 1.0, 256.0);
  vColor = aColor;
  vKind = aKind;
  vDist = length(mv.xyz);
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
}`;

const FRAG = /* glsl */ `
precision highp float;
in vec4 vColor;
in float vKind;
in float vDist;
in vec3 vWorld;
uniform float uFogNear, uFogFar;
out vec4 outColor;
${SKY_COLOR_GLSL}
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float a = vColor.a;
  if (vKind > 0.5) a *= 1.0 - smoothstep(0.05, 0.5, length(p)); // mist and fireflies are soft and round
  if (a < 0.01) discard;
  float fog = smoothstep(uFogNear, uFogFar, vDist);
  vec3 col = vKind > 1.5 ? vColor.rgb : mix(vColor.rgb, skyColor(normalize(vWorld - cameraPosition)), fog);
  if (vKind > 1.5) a *= 1.0 - fog;
  outColor = vec4(col, a);
}`;

/** Average colour of each block's side texture, for the chips it breaks into. */
const BLOCK_RGB = new Float32Array(BLOCK_COUNT * 3);
for (let id = 0; id < BLOCK_COUNT; id++) {
  const px = drawTexture(TEXTURE_NAMES[B_FACE_TEX[id * 6]] ?? 'limestone');
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 128) { r += px[i]; g += px[i + 1]; b += px[i + 2]; n++; }
  n = Math.max(1, n);
  BLOCK_RGB.set([r / n / 255, g / n / 255, b / n / 255], id * 3);
}

class Pool {
  readonly max: number;
  readonly points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private kind: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private baseAlpha: Float32Array;
  private seed: Float32Array;
  private count = 0;
  readonly material: THREE.ShaderMaterial;

  constructor(max: number, additive: boolean) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.kind = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.baseAlpha = new Float32Array(max);
    this.seed = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aKind', new THREE.BufferAttribute(this.kind, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: {
        uScale: { value: 500 }, uFogNear: { value: 150 }, uFogFar: { value: 250 },
        uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
        uSunGlow: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      },
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 30 : 20;
  }

  spawn(kind: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, r: number, g: number, b: number, a: number, size: number, life: number): void {
    if (this.count >= this.max) return;
    const i = this.count++;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.col.set([r, g, b, a], i * 4);
    this.baseAlpha[i] = a;
    this.size[i] = size;
    this.kind[i] = kind;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.seed[i] = Math.random() * 100;
  }

  countOf(kind: number): number {
    let n = 0;
    for (let i = 0; i < this.count; i++) if (this.kind[i] === kind) n++;
    return n;
  }

  update(dt: number, time: number, blockAt: (x: number, y: number, z: number) => number, light: number): void {
    let i = 0;
    while (i < this.count) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.remove(i); continue; }
      const k = this.kind[i], t = 1 - this.life[i] / this.maxLife[i];
      const p = i * 3;
      if (k === KIND.chip) {
        this.vel[p + 1] -= 16 * dt;
        const nx = this.pos[p] + this.vel[p] * dt, ny = this.pos[p + 1] + this.vel[p + 1] * dt, nz = this.pos[p + 2] + this.vel[p + 2] * dt;
        if (B_SOLID[blockAt(Math.floor(nx), Math.floor(ny), Math.floor(nz))]) { this.vel[p] *= 0.3; this.vel[p + 1] = 0; this.vel[p + 2] *= 0.3; }
        else { this.pos[p] = nx; this.pos[p + 1] = ny; this.pos[p + 2] = nz; }
        this.col[i * 4 + 3] = this.baseAlpha[i] * Math.min(1, this.life[i] * 3);
      } else if (k === KIND.mist) {
        this.vel[p + 1] *= 1 - dt * 0.6;
        this.pos[p] += this.vel[p] * dt; this.pos[p + 1] += this.vel[p + 1] * dt; this.pos[p + 2] += this.vel[p + 2] * dt;
        this.size[i] += dt * 1.2;
        this.col[i * 4 + 3] = this.baseAlpha[i] * Math.sin(Math.PI * t) * light;
      } else {
        // Fireflies wander and blink.
        const s = this.seed[i];
        this.pos[p] += Math.sin(time * 0.7 + s) * 0.4 * dt;
        this.pos[p + 1] += Math.sin(time * 0.9 + s * 1.7) * 0.25 * dt;
        this.pos[p + 2] += Math.cos(time * 0.6 + s * 0.8) * 0.4 * dt;
        const blink = Math.max(0, Math.sin(time * 1.6 + s * 3.1)) ** 3;
        this.col[i * 4 + 3] = this.baseAlpha[i] * blink * Math.min(1, t * 6, this.life[i] / 2);
      }
      i++;
    }
    const g = this.points.geometry;
    for (const name of ['position', 'aColor', 'aSize', 'aKind']) (g.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
    g.setDrawRange(0, this.count);
  }

  private remove(i: number): void {
    const last = --this.count;
    if (i === last) return;
    this.pos.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.vel.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.col.copyWithin(i * 4, last * 4, last * 4 + 4);
    this.size[i] = this.size[last]; this.kind[i] = this.kind[last]; this.life[i] = this.life[last];
    this.maxLife[i] = this.maxLife[last]; this.baseAlpha[i] = this.baseAlpha[last]; this.seed[i] = this.seed[last];
  }
}

export class Particles {
  readonly normal = new Pool(2500, false);
  readonly glow = new Pool(400, true);

  addTo(scene: THREE.Scene): void { scene.add(this.normal.points, this.glow.points); }

  /** Chips flying from a broken block. */
  burst(id: number, x: number, y: number, z: number, light: number): void {
    const r = BLOCK_RGB[id * 3] * light, g = BLOCK_RGB[id * 3 + 1] * light, b = BLOCK_RGB[id * 3 + 2] * light;
    for (let n = 0; n < 14; n++) {
      const j = () => 0.85 + Math.random() * 0.3;
      this.normal.spawn(KIND.chip, x + 0.2 + Math.random() * 0.6, y + 0.2 + Math.random() * 0.6, z + 0.2 + Math.random() * 0.6,
        (Math.random() - 0.5) * 3, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 3, r * j(), g * j(), b * j(), 1, 0.14, 0.7 + Math.random() * 0.6);
    }
  }

  /** Spray rising off the pool where the waterfall lands. */
  spray(x0: number, x1: number, z0: number, z1: number, y: number, count: number): void {
    for (let n = 0; n < count; n++) {
      const big = Math.random() < 0.35;
      this.normal.spawn(KIND.mist, x0 + Math.random() * (x1 - x0), y + Math.random() * 0.6, z0 + Math.random() * (z1 - z0),
        0.6 + Math.random() * 1.6, big ? 0.6 + Math.random() * 1.2 : 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 1.2,
        0.93, 0.97, 1, big ? 0.22 : 0.45, big ? 2.2 + Math.random() * 1.5 : 0.35 + Math.random() * 0.4, big ? 2.5 + Math.random() * 2 : 0.8 + Math.random() * 0.7);
    }
  }

  firefly(x: number, y: number, z: number): void {
    this.glow.spawn(KIND.firefly, x, y, z, 0, 0, 0, 0.75, 1, 0.35, 0.9, 0.22, 12 + Math.random() * 14);
  }

  fireflies(): number { return this.glow.countOf(KIND.firefly); }

  update(dt: number, time: number, blockAt: (x: number, y: number, z: number) => number, daylight: number): void {
    this.normal.update(dt, time, blockAt, Math.max(0.25, daylight));
    this.glow.update(dt, time, blockAt, 1);
  }

  /** Keeps point sizes right for the screen, and fog and sky colours in step with the world. */
  sync(screenHeight: number, fovDeg: number, fogNear: number, fogFar: number, s: SkyState): void {
    const scale = screenHeight / (2 * Math.tan((fovDeg * Math.PI) / 360));
    for (const m of [this.normal.material, this.glow.material]) {
      const u = m.uniforms;
      u.uScale.value = scale; u.uFogNear.value = fogNear; u.uFogFar.value = fogFar;
      u.uZenith.value.copy(s.zenith); u.uHorizon.value.copy(s.horizon); u.uSunGlow.value.copy(s.sunGlow); u.uSunDir.value.copy(s.sunDir);
    }
  }
}
