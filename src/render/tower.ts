// The relay tower on Zone-4's ridge, seen from afar (docs/PHASE3.md, step 2): a thin steel lattice in the
// same haze as the distant land. On the ridge it is built of blocks (docs/PHASE8.md); this drawing of the
// same frame stands in for them beyond the loaded land, and is not drawn within NEAR metres of the tower.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SKY_COLOR_GLSL, type SkyState } from './sky.ts';
import { PLACES, outsideHeight } from '../gen/layout.ts';
import { towerBeams } from '../gen/towerFrame.ts';

/** Nearer the tower than this the blocks are loaded and drawn, so the far drawing is left out. */
export const TOWER_NEAR = 150;

const VERT = /* glsl */ `
out vec3 vWorld;
out float vDist;
out float vShade;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 view = viewMatrix * world;
  vDist = length(view.xyz);
  vec3 n = normalize(mat3(modelMatrix) * normal);
  vShade = 0.7 + 0.3 * abs(n.x) * 0.5 + 0.3 * max(n.y, 0.0);
  gl_Position = projectionMatrix * view;
}`;

const FRAG = /* glsl */ `
precision highp float;
in vec3 vWorld;
in float vDist;
in float vShade;
uniform float uDaylight;
uniform vec3 uSkyLight;
uniform float uFogNear, uFogFar;
uniform vec3 uFoot;
out vec4 outColor;
${SKY_COLOR_GLSL}
void main() {
  if (distance(cameraPosition.xz, uFoot.xz) < uFoot.y) discard;
  vec3 col = vec3(0.30, 0.27, 0.25) * vShade * uSkyLight * uDaylight;
  // The same haze as the distant land, held back a little so the thin frame still reads as a shape.
  float fog = pow(smoothstep(uFogNear, uFogFar, vDist), 0.8) * 0.8;
  col = mix(col, skyColor(normalize(vWorld - cameraPosition)), fog);
  outColor = vec4(col, 1.0);
}`;

/** A square-section beam from a to b, `t` thick. */
function beam(a: THREE.Vector3, b: THREE.Vector3, t: number): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.BoxGeometry(t, len, t);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q);
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

/** The tower's frame, standing at the origin: the same beams the ridge's block tower is built along (src/gen/towerFrame.ts). */
export function towerGeometry(height: number): THREE.BufferGeometry {
  const parts = towerBeams(height).map(({ a, b, t }) => beam(new THREE.Vector3(...a), new THREE.Vector3(...b), t * 1.6));
  return mergeGeometries(parts.map((g) => g.toNonIndexed()));
}

export class RidgeTower {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;

  constructor() {
    const t = PLACES.ridgeTower;
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG,
      uniforms: {
        uDaylight: { value: 1 }, uSkyLight: { value: new THREE.Color(1, 1, 1) }, uFogNear: { value: 300 }, uFogFar: { value: 1400 },
        uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
        uSunGlow: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        // The tower's foot (x, z) and, in y, the distance within which the blocks stand in for this drawing.
        uFoot: { value: new THREE.Vector3(t.x + 0.5, TOWER_NEAR, t.z + 0.5) },
      },
    });
    this.mesh = new THREE.Mesh(towerGeometry(t.height), mat);
    this.mesh.position.set(t.x + 0.5, outsideHeight(t.x, t.z), t.z + 0.5);
    this.mesh.renderOrder = -9;
  }

  sync(s: SkyState, fogNear: number, fogFar: number): void {
    const u = this.mesh.material.uniforms;
    u.uDaylight.value = s.daylight; u.uSkyLight.value.copy(s.skyLight);
    u.uFogNear.value = fogNear; u.uFogFar.value = fogFar;
    u.uZenith.value.copy(s.zenith); u.uHorizon.value.copy(s.horizon); u.uSunGlow.value.copy(s.sunGlow); u.uSunDir.value.copy(s.sunDir);
  }
}
