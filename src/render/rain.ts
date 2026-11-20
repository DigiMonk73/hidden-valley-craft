// Afternoon rain (docs/PHASE9A.md, 7; the script's cloud forest: mist in the mornings, rain in the afternoons).
// Most afternoons, for an hour or so from about two, it rains: the sky greys, the haze closes in, streaks fall round
// the player and stop at whatever is overhead, so from the cave's mouth the rain is a curtain outside.
//
// Cheap by design: 700 streaks in one draw call, moved wholly in the vertex shader (nothing per drop on the CPU),
// kept round the eye by wrapping. What is overhead comes from a 32 × 32 map of roof heights round the eye, refreshed
// a row a frame.

import * as THREE from 'three';
import { B_SOLID, B_RENDER, RENDER } from '../world/blocks.ts';
import { WORLD_Y } from '../world/constants.ts';
import type { SkyState } from './sky.ts';

/** How hard it rains, 0–1, on a day at an hour. Three afternoons in five; none in the valley's first two days. */
export function rainAt(day: number, hour: number): number {
  if (day < 2 || (day * 7 + 3) % 5 >= 3) return 0;
  // Each rainy day's shower starts a little earlier or later, and lasts between fifty minutes and an hour and a half.
  const start = 14 + ((day * 13) % 7) / 10, length = 0.85 + ((day * 5) % 7) / 10;
  const t = hour - start;
  if (t <= 0 || t >= length) return 0;
  return Math.min(1, t / 0.12, (length - t) / 0.2);
}

/** The side of the square of land the streaks fill, and its height. */
const SPAN = 28, TALL = 16, DROPS = 700, MAP = 32;

const VERT = /* glsl */ `
in vec3 aSeed; // where in the square, and when
uniform vec3 uEye;
uniform float uTime;
uniform float uLevel;
uniform sampler2D uRoof; // the height of whatever is overhead, by column (wrapped)
out float vAlpha;
void main() {
  // The drop's column: fixed in the world, wrapped so the square is always round the eye.
  vec2 col = uEye.xz + mod(aSeed.xy * ${SPAN.toFixed(1)} - uEye.xz, ${SPAN.toFixed(1)}) - ${(SPAN / 2).toFixed(1)};
  float fall = mod(aSeed.z * ${TALL.toFixed(1)} - uTime * (13.0 + aSeed.x * 5.0), ${TALL.toFixed(1)});
  float y = uEye.y - 6.0 + fall;
  float roof = texture(uRoof, (floor(col) + 0.5) / ${MAP.toFixed(1)}).r * 255.0;
  // Fewer drops in a light rain; none under a roof.
  bool shown = aSeed.z < uLevel && y > roof + 0.2;
  vec3 world = vec3(col.x, y + position.y * 0.55, col.y);
  // A thin streak that faces the eye, leaning a little with the wind.
  vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), world - uEye));
  world += side * position.x * 0.012 + vec3(0.06, 0.0, 0.02) * position.y;
  vAlpha = shown ? (0.2 + 0.25 * aSeed.y) * smoothstep(${(SPAN / 2).toFixed(1)}, ${(SPAN / 2 - 4).toFixed(1)}, length(col - uEye.xz)) : 0.0;
  gl_Position = shown ? projectionMatrix * viewMatrix * vec4(world, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}`;

const FRAG = /* glsl */ `
precision highp float;
in float vAlpha;
uniform vec3 uColor;
out vec4 outColor;
void main() { outColor = vec4(uColor, vAlpha); }`;

const GREY = new THREE.Color('#8a949c');

export class Rain {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private roof = new Uint8Array(MAP * MAP);
  private roofTex: THREE.DataTexture;
  private row = 0;
  /** How hard it rains now, 0–1. */
  level = 0;

  constructor() {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const seed = new Float32Array(DROPS * 3);
    // A fixed scatter (the same rain every time: nothing here is for chance to decide).
    let s = 12345;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < seed.length; i++) seed[i] = rnd();
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 3));
    g.instanceCount = DROPS;
    this.roofTex = new THREE.DataTexture(this.roof, MAP, MAP, THREE.RedFormat, THREE.UnsignedByteType);
    this.roofTex.magFilter = this.roofTex.minFilter = THREE.NearestFilter;
    this.roofTex.wrapS = this.roofTex.wrapT = THREE.RepeatWrapping;
    this.roofTex.needsUpdate = true;
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uEye: { value: new THREE.Vector3() }, uTime: { value: 0 }, uLevel: { value: 0 }, uRoof: { value: this.roofTex }, uColor: { value: new THREE.Color(0.78, 0.83, 0.9) } },
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 22; // over the water, under the lamps' glow
  }

  /**
   * Each frame: how hard it rains, where the eye is, and the world to look up what is overhead. One row of the roof
   * map is looked up again each frame (the whole map every 32), so a new roof stops the rain within a second.
   */
  update(level: number, eye: THREE.Vector3, time: number, blockAt: (x: number, y: number, z: number) => number): void {
    this.level = level;
    this.mesh.visible = level > 0.01;
    if (!this.mesh.visible) return;
    const u = this.mesh.material.uniforms;
    u.uEye.value.copy(eye); u.uTime.value = time; u.uLevel.value = level;
    const ex = Math.floor(eye.x), ez = Math.floor(eye.z), top = Math.min(WORLD_Y - 1, Math.floor(eye.y) + 24);
    // The world columns this row of the map stands for now: those within 16 of the eye whose z wraps to it.
    const z = ez - MAP / 2 + ((this.row - (ez - MAP / 2)) % MAP + MAP) % MAP;
    for (let x = ex - MAP / 2; x < ex + MAP / 2; x++) {
      let y = top;
      while (y > 0) { const id = blockAt(x, y, z); if (B_SOLID[id] || B_RENDER[id] === RENDER.liquid) break; y--; }
      this.roof[this.row * MAP + ((x % MAP) + MAP) % MAP] = y + 1;
    }
    this.row = (this.row + 1) % MAP;
    this.roofTex.needsUpdate = true;
  }

  /** What rain does to the sky: greyer, darker, the haze nearer. Gives `s` new colours; returns how far the haze now reaches. */
  weather(s: SkyState, fogFar: number): number {
    const k = this.level;
    if (k <= 0) return fogFar;
    const grey = GREY.clone().multiplyScalar(0.35 + 0.65 * s.daylight);
    // New colours, not the given ones changed: at midday the sky's colours are the palette's own (src/render/sky.ts
    // hands them out by reference), and changing those would leave every later day grey.
    s.zenith = s.zenith.clone().lerp(grey, 0.75 * k);
    s.horizon = s.horizon.clone().lerp(grey, 0.6 * k);
    s.fog = s.fog.clone().lerp(grey, 0.65 * k);
    s.sunGlow = s.sunGlow.clone().multiplyScalar(1 - 0.85 * k);
    s.skyLight = s.skyLight.clone().multiplyScalar(1 - 0.28 * k);
    (this.mesh.material.uniforms.uColor.value as THREE.Color).setRGB(0.78, 0.83, 0.9).multiplyScalar(0.45 + 0.55 * s.daylight);
    return fogFar + (420 - fogFar) * k;
  }
}
