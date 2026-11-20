// A layer of flat block clouds high above the world, drifting west on the trade wind.

import * as THREE from 'three';
import { SKY_COLOR_GLSL, type SkyState } from './sky.ts';
import { Simplex } from '../core/noise.ts';

const SIZE = 128; // texels; each is one cloud block
const CELL = 12; // metres per texel
const HEIGHT = 236;

const VERT = /* glsl */ `
out vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const FRAG = /* glsl */ `
precision highp float;
in vec3 vWorld;
uniform sampler2D uClouds;
uniform vec2 uOffset;
uniform float uDaylight;
uniform vec3 uSkyLight;
uniform float uRain; // 0–1: rain clouds are grey, and nearly close the sky's gaps to the eye
out vec4 outColor;
${SKY_COLOR_GLSL}
void main() {
  vec2 uv = (vWorld.xz + uOffset) / ${(SIZE * CELL).toFixed(1)};
  float a = texture(uClouds, uv).r;
  if (a < 0.5) discard;
  float dist = length(vWorld.xz - cameraPosition.xz);
  // Bright by day, barely there at night (daylight bottoms out at 0.3 under the moon).
  float day = clamp((uDaylight - 0.3) / 0.7, 0.0, 1.0);
  vec3 lit = mix(vec3(1.0), uSkyLight, 0.5) * (0.1 + 0.9 * day) * (1.0 - 0.42 * uRain);
  vec3 col = mix(lit, skyColor(normalize(vWorld - cameraPosition)), smoothstep(500.0, 1900.0, dist));
  outColor = vec4(col, (0.45 + 0.29 * day) * (1.0 - smoothstep(1500.0, 2000.0, dist)));
}`;

export class Clouds {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

  constructor() {
    const n = new Simplex(91);
    const data = new Uint8Array(SIZE * SIZE * 4);
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) {
        // Tileable: sample noise on a torus so the layer repeats without a seam.
        const a = (x / SIZE) * Math.PI * 2, b = (y / SIZE) * Math.PI * 2;
        const v = n.noise3(Math.cos(a) * 3, Math.sin(a) * 3 + Math.cos(b) * 3, Math.sin(b) * 3) * 0.7 +
          n.noise3(Math.cos(a) * 8 + 9, Math.sin(a) * 8, Math.cos(b) * 8 + Math.sin(b) * 2) * 0.3;
        const on = v > 0.3 ? 255 : 0; // scattered cumulus, mostly open sky
        data.set([on, on, on, 255], (y * SIZE + x) * 4);
      }
    const tex = new THREE.DataTexture(data, SIZE, SIZE);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: {
        uClouds: { value: tex }, uOffset: { value: new THREE.Vector2() }, uDaylight: { value: 1 }, uSkyLight: { value: new THREE.Color(1, 1, 1) }, uRain: { value: 0 },
        uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
        uSunGlow: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(4200, 4200).rotateX(-Math.PI / 2), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }

  /** Follows the camera across the sky; the texture drifts with time. */
  sync(s: SkyState, camX: number, camZ: number, time: number, rain = 0): void {
    this.mesh.position.set(camX, HEIGHT, camZ);
    const u = this.mesh.material.uniforms;
    u.uOffset.value.set(time * 1.6, time * 0.3);
    u.uRain.value = rain;
    u.uDaylight.value = s.daylight; u.uSkyLight.value.copy(s.skyLight);
    u.uZenith.value.copy(s.zenith); u.uHorizon.value.copy(s.horizon); u.uSunGlow.value.copy(s.sunGlow); u.uSunDir.value.copy(s.sunDir);
  }
}
