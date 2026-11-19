// The smoke column over the mid band's outpost (docs/PHASE4.md, step 1): the far landmark the saddle
// looks out on, before Phase 5 builds the outpost itself. Puffs of block smoke rise, widen and drift,
// grey by day and faint by night, in the same haze as the distant land.

import * as THREE from 'three';
import { SKY_COLOR_GLSL, type SkyState } from './sky.ts';
import { ZONE1, outsideHeight } from '../gen/layout.ts';

const VERT = /* glsl */ `
in float aAlpha;
out vec3 vWorld;
out float vDist;
out float vAlpha;
out float vShade;
void main() {
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 view = viewMatrix * world;
  vDist = length(view.xyz);
  vAlpha = aAlpha;
  vShade = normal.y > 0.5 ? 1.0 : normal.y < -0.5 ? 0.7 : 0.85;
  gl_Position = projectionMatrix * view;
}`;

const FRAG = /* glsl */ `
precision highp float;
in vec3 vWorld;
in float vDist;
in float vAlpha;
in float vShade;
uniform float uDaylight;
uniform vec3 uColor;
uniform vec3 uSkyLight;
uniform float uFogNear, uFogFar;
out vec4 outColor;
${SKY_COLOR_GLSL}
void main() {
  vec3 col = uColor * vShade * max(uSkyLight * uDaylight, vec3(0.06));
  float fog = pow(smoothstep(uFogNear, uFogFar, vDist), 0.8) * 0.55;
  col = mix(col, skyColor(normalize(vWorld - cameraPosition)), fog);
  outColor = vec4(col, vAlpha * (0.35 + 0.65 * uDaylight));
}`;

const PUFFS = 28;
const HEIGHT = 70; // how high the column rises before it thins out
const RISE = 1.6; // m/s

/** A column's look: grey smoke over the outpost; white steam from the hot spring's vent (docs/PHASE6.md). */
/** `spread`: how far the puffs start from the column's foot (1 if unset: a wide fire; a chimney's is narrow). */
export interface ColumnLook { color: [number, number, number]; height: number; rise: number; size: number; drift: number; spread?: number }
const SMOKE: ColumnLook = { color: [0.5, 0.49, 0.48], height: HEIGHT, rise: RISE, size: 1, drift: 26 };
export const STEAM: ColumnLook = { color: [0.9, 0.91, 0.93], height: 34, rise: 2.4, size: 0.55, drift: 8 };
/** Wood smoke from the home's chimney on the plateau, and the thinner thread from the range's flue (docs/HOME.md). */
export const CHIMNEY: ColumnLook = { color: [0.62, 0.61, 0.6], height: 22, rise: 1.5, size: 0.16, drift: 7, spread: 0.12 };
// The flue ends under an overhang of the cliff: its smoke curls out west, over the valley, as it rises.
export const FLUE: ColumnLook = { color: [0.66, 0.65, 0.64], height: 7, rise: 1.0, size: 0.09, drift: -16, spread: 0.06 };

export class SmokeColumn {
  readonly mesh: THREE.InstancedMesh<THREE.BoxGeometry, THREE.ShaderMaterial>;
  private alpha: THREE.InstancedBufferAttribute;
  private base: THREE.Vector3;
  private m = new THREE.Matrix4();
  private look: ColumnLook;

  constructor(at?: [number, number, number], look: ColumnLook = SMOKE) {
    const s = ZONE1.smoke;
    this.look = look;
    this.base = at ? new THREE.Vector3(...at) : new THREE.Vector3(s.x + 0.5, outsideHeight(s.x, s.z) + 6, s.z + 0.5);
    const g = new THREE.BoxGeometry(1, 1, 1);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(PUFFS), 1);
    g.setAttribute('aAlpha', this.alpha);
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      uniforms: {
        uDaylight: { value: 1 }, uColor: { value: new THREE.Color(...look.color) }, uSkyLight: { value: new THREE.Color(1, 1, 1) }, uFogNear: { value: 300 }, uFogFar: { value: 1400 },
        uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
        uSunGlow: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      },
    });
    this.mesh = new THREE.InstancedMesh(g, mat, PUFFS);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.update(0);
  }

  /** Moves the puffs up the column: each rises, grows and drifts east with the wind, then starts again. */
  update(time: number): void {
    const L = this.look;
    for (let k = 0; k < PUFFS; k++) {
      const h = (time * L.rise + (k * L.height) / PUFFS) % L.height, t = h / L.height;
      const size = (3.5 + t * 10 + (k % 3) * 0.8) * L.size;
      const sp = L.spread ?? 1;
      const drift = t * t * L.drift + Math.sin(time * 0.3 + k) * 1.2 * sp;
      this.m.makeScale(size, size * 0.8, size);
      this.m.setPosition(this.base.x + drift + (((k * 7) % 3) - 1) * sp, this.base.y + h, this.base.z + Math.sin(k * 1.7) * 1.4 * sp);
      this.mesh.setMatrixAt(k, this.m);
      this.alpha.setX(k, 0.8 * Math.min(1, h / (4 * Math.min(1, L.size * 3))) * (1 - t) ** 1.1);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.alpha.needsUpdate = true;
  }

  sync(s: SkyState, fogNear: number, fogFar: number, time: number): void {
    const u = this.mesh.material.uniforms;
    u.uDaylight.value = s.daylight; u.uSkyLight.value.copy(s.skyLight);
    u.uFogNear.value = fogNear; u.uFogFar.value = fogFar;
    u.uZenith.value.copy(s.zenith); u.uHorizon.value.copy(s.horizon); u.uSunGlow.value.copy(s.sunGlow); u.uSunDir.value.copy(s.sunDir);
    this.update(time);
  }
}
