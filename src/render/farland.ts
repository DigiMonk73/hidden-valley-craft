// Draws the coarse distant landscape beyond the loaded chunks, lit and fogged like the blocks,
// and hidden inside the loaded area so the real blocks show there.

import * as THREE from 'three';
import { SKY_COLOR_GLSL, type SkyState } from './sky.ts';
import type { FarMesh } from '../gen/farland.ts';

const VERT = /* glsl */ `
in vec4 aColor;
in vec2 aMat;
out vec3 vColor;
out float vShade;
flat out float vLayer;
flat out float vFace;
out vec3 vWorld;
out float vDist;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 view = viewMatrix * world;
  vDist = length(view.xyz);
  vColor = aColor.rgb / 128.0;
  vShade = aColor.a / 255.0;
  vLayer = aMat.x;
  vFace = aMat.y;
  gl_Position = projectionMatrix * view;
}`;

const FRAG = /* glsl */ `
precision highp float;
precision highp sampler2DArray;
in vec3 vColor;
in float vShade;
flat in float vLayer;
flat in float vFace;
uniform sampler2DArray uTex;
in vec3 vWorld;
in float vDist;
uniform sampler2D uDrawn; // 64 × 64: 1 where the real blocks are drawn
uniform float uDaylight;
uniform vec3 uSkyLight;
uniform float uFogNear, uFogFar;
out vec4 outColor;
${SKY_COLOR_GLSL}
void main() {
  // Where the real blocks are drawn, they show instead. Sample the column's centre so the edge is exact.
  vec2 colUv = (floor(vWorld.xz / 32.0) + 0.5) / 64.0;
  if (texture(uDrawn, colUv).r > 0.5) discard;
  // The same block textures as near by, one texture per metre, laid on by world position.
  vec2 uv = vFace < 0.5 ? vWorld.xz : vFace < 1.5 ? vec2(vWorld.z, -vWorld.y) : vec2(vWorld.x, -vWorld.y);
  vec3 tex = texture(uTex, vec3(uv, vLayer)).rgb;
  vec3 col = tex * vColor * vShade * uSkyLight * uDaylight;
  float fog = pow(smoothstep(uFogNear, uFogFar, vDist), 0.8);
  col = mix(col, skyColor(normalize(vWorld - cameraPosition)), fog);
  outColor = vec4(col, 1.0);
}`;

export class FarLand {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;

  constructor(m: FarMesh, texture: THREE.Texture, drawn: THREE.Texture) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(m.colors, 4));
    g.setAttribute('aMat', new THREE.BufferAttribute(m.mats, 2));
    g.setIndex(new THREE.BufferAttribute(m.index, 1));
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG,
      uniforms: {
        uTex: { value: texture }, uDrawn: { value: drawn }, uDaylight: { value: 1 }, uSkyLight: { value: new THREE.Color(1, 1, 1) },
        uFogNear: { value: 300 }, uFogFar: { value: 1400 },
        uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
        uSunGlow: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      },
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }

  sync(s: SkyState, fogNear: number, fogFar: number): void {
    const u = this.mesh.material.uniforms;
    u.uDaylight.value = s.daylight; u.uSkyLight.value.copy(s.skyLight);
    u.uFogNear.value = fogNear; u.uFogFar.value = fogFar;
    u.uZenith.value.copy(s.zenith); u.uHorizon.value.copy(s.horizon); u.uSunGlow.value.copy(s.sunGlow); u.uSunDir.value.copy(s.sunDir);
  }
}
