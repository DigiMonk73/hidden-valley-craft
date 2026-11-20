// Draws the world: the sky, every chunk's mesh with the block shader, the water, and the outline
// of the block the player is looking at.

import * as THREE from 'three';
import { TEXTURE_NAMES } from '../world/blocks.ts';
import { buildTextureStack, buildCrackStages, TEX } from './textures.ts';
import { createSkyDome, applySky, SKY_COLOR_GLSL, type SkyState } from './sky.ts';
import type { ChunkMesh, MeshPart } from '../mesh/mesher.ts';
import { CS } from '../world/constants.ts';
import { Particles } from './particles.ts';
import { FarLand } from './farland.ts';
import { Clouds } from './clouds.ts';
import { RidgeTower } from './tower.ts';
import { SmokeColumn, STEAM, CHIMNEY, FLUE } from './smoke.ts';
import { HOME_FIT } from '../gen/home.ts';
import { STEAM_AT } from '../gen/zone2.ts';
import { outsideHeight } from '../gen/layout.ts';
import { CreatureRenderer } from './creatures.ts';
import type { FarMesh } from '../gen/farland.ts';
import { disposeChunkGeometry } from './chunkGeometry.ts';
import { watchContext, type ContextWatch } from '../platform/context.ts';

/** One atmosphere for everything: blocks, distant land and particles fade into the sky alike. */
const FOG_NEAR = 150;
const FOG_FAR = 1350;

const BLOCK_VERT = /* glsl */ `
in vec4 aPack;
in float aLayer;
in vec2 aUv;
uniform float uTime;
out vec2 vUv;
flat out float vLayer;
out float vAo;
out vec2 vLight;
out float vShade;
out float vDist;
out vec3 vWorld;
out float vWaterTop;
out float vSun;
out float vFlicker;
uniform vec3 uSunDirV;
void main() {
  int flags = int(aPack.x + 0.5);
  int face = flags & 7;
  int corner = (flags >> 3) & 3;
  bool wave = (flags & 32) != 0;
  bool liquid = (flags & 64) != 0;
  bool glow = face == 7; // lit from within: a lamp's shade, coals, a flame (which also wavers)
  vec2 uv = aUv / 16.0; // position on the texture, in sixteenths (v counts up)
  vUv = vec2(uv.x, 1.0 - uv.y);
  if ((flags & 128) != 0) vUv.y -= uTime * 1.6; // falling water pours downward (the texture repeats)
  vLayer = aLayer;
  vWaterTop = liquid && face == 2 ? 1.0 : 0.0;
  // How squarely this face looks at the sun (plants count as half-facing it).
  vec3 n = face == 0 ? vec3(1, 0, 0) : face == 1 ? vec3(-1, 0, 0) : face == 2 ? vec3(0, 1, 0)
         : face == 3 ? vec3(0, -1, 0) : face == 4 ? vec3(0, 0, 1) : face == 5 ? vec3(0, 0, -1) : vec3(0.0);
  vSun = face == 6 ? 0.5 : max(dot(n, uSunDirV), 0.0);
  vAo = aPack.y / 3.0;
  vLight = aPack.zw / 240.0;
  // Fixed shading per face direction gives blocks their form: top brightest, bottom darkest.
  vShade = glow ? 2.0 : face == 2 ? 1.0 : face == 3 ? 0.55 : (face == 0 || face == 1) ? 0.72 : face == 6 ? 0.92 : 0.84;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vFlicker = 0.9;
  if (glow && wave) {
    // A flame: its top licks about, quick and uneven, and its brightness flutters.
    float h = corner >= 2 ? 1.0 : 0.0; // the foot of a flame stays put
    float t = uTime * 7.0 + world.x * 3.1 + world.z * 2.3;
    world.x += h * (sin(t) * 0.035 + sin(t * 2.7 + 1.3) * 0.02);
    world.z += h * (cos(t * 1.3) * 0.035 + sin(t * 3.1) * 0.02);
    world.y += h * sin(t * 1.9) * 0.03;
    vFlicker = 0.88 + 0.12 * sin(uTime * 11.0 + world.x * 5.0) * sin(uTime * 6.3 + world.z * 4.0);
  } else if (wave) {
    world.x += sin(uTime * 1.6 + world.z * 0.45 + world.y * 0.3) * 0.045;
    world.z += cos(uTime * 1.25 + world.x * 0.45) * 0.045;
  }
  if (liquid && face == 2) world.y += sin(uTime * 1.1 + world.x * 0.6 + world.z * 0.45) * 0.035 - 0.035;
  vec4 view = viewMatrix * world;
  vDist = length(view.xyz);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * view;
}`;

const BLOCK_FRAG = /* glsl */ `
precision highp float;
precision highp sampler2DArray;
in vec2 vUv;
flat in float vLayer;
in float vAo;
in vec2 vLight;
in float vShade;
in float vDist;
in vec3 vWorld;
in float vWaterTop;
in float vSun;
in float vFlicker;
uniform sampler2DArray uTex;
uniform float uMist;
uniform vec3 uMistColor;
uniform vec3 uValley; // centre x, centre z, radius
uniform float uDaylight;
uniform vec3 uSkyLight;
uniform vec3 uBlockLight;
uniform float uFogNear;
uniform float uFogFar;
uniform float uOpacity;
uniform bool uCutout;
out vec4 outColor;
${SKY_COLOR_GLSL}
float curve(float l) { return l / (2.2 - 1.2 * l); } // light level → brightness, like a lightmap
void main() {
  vec3 tc = vec3(vUv, vLayer);
  vec4 tex = texture(uTex, tc);
  if (uCutout) {
    // Test alpha on the sharpest level so leaves don't thin out with distance.
    if (textureLod(uTex, tc, 0.0).a < 0.5) discard;
    tex.a = 1.0;
  }
  float sky = curve(vLight.x) * uDaylight;
  float blk = curve(vLight.y);
  // Faces in the open that look toward the sun take more of its light: warm cliffs at sunset.
  float sunUp = smoothstep(-0.04, 0.12, uSunDir.y);
  float direct = smoothstep(0.8, 1.0, vLight.x) * sunUp;
  vec3 light = max(uSkyLight * sky * (0.8 + 0.55 * vSun * direct), uBlockLight * blk);
  light = max(light, vec3(0.035));
  float ao = mix(0.42, 1.0, vAo);
  vec3 col = tex.rgb * light * ao * vShade;
  // Lit from within (a lamp's shade, coals, a flame): its own colour, whatever the light around it.
  if (vShade > 1.5) col = tex.rgb * (0.9 + 0.25 * vFlicker) * vFlicker;
  float alpha = tex.a * uOpacity;
  if (vWaterTop > 0.5) {
    // Still water mirrors the sky, more so at a glancing angle, and catches a glint of the sun.
    vec3 v = normalize(cameraPosition - vWorld);
    vec3 r = reflect(-v, vec3(0.0, 1.0, 0.0));
    float fresnel = pow(1.0 - max(v.y, 0.0), 4.0);
    vec3 sky = skyColor(r) * (0.35 + 0.65 * curve(vLight.x));
    col = mix(col, sky, 0.25 + 0.6 * fresnel);
    col += uSunGlow * pow(max(dot(r, uSunDir), 0.0), 220.0) * 1.5 * curve(vLight.x);
    alpha = mix(alpha, 1.0, fresnel * 0.7);
  }
  // Morning mist lies low in the valley and thickens with distance.
  if (uMist > 0.0) {
    float inValley = 1.0 - smoothstep(uValley.z - 10.0, uValley.z + 6.0, length(vWorld.xz - uValley.xy));
    float low = 1.0 - smoothstep(70.0, 84.0, vWorld.y);
    float m = uMist * inValley * low * (1.0 - exp(-vDist * 0.03));
    col = mix(col, uMistColor, m * 0.85);
  }
  float fog = smoothstep(uFogNear, uFogFar, vDist);
  // Fog takes the colour of the sky behind the fragment, so the edge of the world melts into it.
  col = mix(col, skyColor(normalize(vWorld - cameraPosition)), fog);
  outColor = vec4(col, alpha);
}`;

/** The view's angle, top to bottom, with nothing held to the eye. */
const BASE_FOV = 72;
/** The train of satellites: how many, and how far off they are drawn (inside the far plane). */
const SAT_COUNT = 4, SAT_FAR = 1700;

export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly solidMat: THREE.ShaderMaterial;
  readonly waterMat: THREE.ShaderMaterial;
  private sky = createSkyDome();
  private meshes = new Map<number, { solid?: THREE.Mesh; water?: THREE.Mesh }>();
  private index: THREE.BufferAttribute;
  private indexQuads: number;
  private outline: THREE.LineSegments;
  private crack: THREE.Mesh<THREE.BoxGeometry, THREE.ShaderMaterial>;
  /** The fishing bobber: red over white, bobbing on the water. */
  private bobber = (() => {
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.16), new THREE.MeshBasicMaterial({ color: 0xd63031 }));
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.16), new THREE.MeshBasicMaterial({ color: 0xf2f2f2 }));
    top.position.y = 0.1;
    g.add(top, bottom);
    g.visible = false;
    return g;
  })();
  private fogDist = 256;
  stats = { chunks: 0, quads: 0 };
  readonly particles = new Particles();
  private farland: FarLand | null = null;
  private clouds = new Clouds();
  private tower = new RidgeTower();
  private smoke = new SmokeColumn();
  /** The hot spring's steam, rising from its vent in Zone-2 (docs/PHASE6.md). */
  private steam = new SmokeColumn([STEAM_AT[0], outsideHeight(Math.floor(STEAM_AT[0]), Math.floor(STEAM_AT[2])) - 1, STEAM_AT[2]], STEAM);
  /** The home's fires: the hearth's chimney on the plateau, and the range's flue up the cliff. */
  private chimney = new SmokeColumn([HOME_FIT.chimney.x + 0.5, HOME_FIT.chimney.top + 1, HOME_FIT.chimney.z + 0.5], CHIMNEY);
  private flue = new SmokeColumn([HOME_FIT.flueCap.x + 0.5, HOME_FIT.flueCap.y + 0.8, HOME_FIT.flueCap.z + 0.5], FLUE);
  /** The wild's creatures and arrows. */
  readonly creatures: CreatureRenderer;
  /** Which columns have real blocks drawn: the distant land stays out of them. */
  private drawnTex = (() => {
    const t = new THREE.DataTexture(new Uint8Array(64 * 64), 64, 64, THREE.RedFormat, THREE.UnsignedByteType);
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    return t;
  })();

  /** Told when the browser takes the picture away (the WebGL context is lost): nothing can be drawn until it is back. */
  onContextLost: () => void = () => {};
  /** Told when the picture is back and drawing again. */
  onContextRestored: () => void = () => {};
  /** Told when the picture has stayed away so long that it may not come back without a reload. */
  onContextStuck: () => void = () => {};
  private context: ContextWatch;
  private clearColor = new THREE.Color();

  constructor(canvas: HTMLCanvasElement) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    // Listened for after three.js's own listeners (made with the renderer above), so on a restore
    // three has already set its new context up by the time restore() runs.
    this.context = watchContext(canvas, {
      onLost: () => this.onContextLost(),
      onRestored: () => { this.restore(); this.onContextRestored(); },
      onStuck: () => this.onContextStuck(),
    });
    this.gl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.gl.outputColorSpace = THREE.LinearSRGBColorSpace; // colours are authored for the screen as-is
    this.camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.08, 2000);
    this.scene.add(this.sky);

    const tex = new THREE.DataArrayTexture(buildTextureStack(TEXTURE_NAMES), TEX, TEX, TEXTURE_NAMES.length);
    tex.format = THREE.RGBAFormat;
    tex.type = THREE.UnsignedByteType;
    tex.magFilter = THREE.NearestFilter;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; // falling water scrolls its texture
    tex.minFilter = THREE.NearestMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = Math.min(8, this.gl.capabilities.getMaxAnisotropy());
    tex.colorSpace = THREE.NoColorSpace;
    tex.needsUpdate = true;

    const uniforms = () => ({
      uTex: { value: tex },
      uTime: { value: 0 },
      uDaylight: { value: 1 },
      uSkyLight: { value: new THREE.Color(1, 1, 1) },
      uBlockLight: { value: new THREE.Color('#ffd08c') },
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uSunGlow: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uFogNear: { value: 120 },
      uFogFar: { value: 250 },
      uOpacity: { value: 1 },
      uSunDirV: { value: new THREE.Vector3(0, 1, 0) },
      uMist: { value: 0 },
      uMistColor: { value: new THREE.Color('#dfe8ec') },
      uValley: { value: new THREE.Vector3(1700, 1024, 100) },
      uCutout: { value: true },
    });
    this.solidMat = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: BLOCK_VERT, fragmentShader: BLOCK_FRAG, uniforms: uniforms() });
    this.waterMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: BLOCK_VERT, fragmentShader: BLOCK_FRAG, uniforms: uniforms(),
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    this.waterMat.uniforms.uCutout.value = false;
    this.creatures = new CreatureRenderer(this.scene, this.solidMat);

    // One index buffer shared by every chunk: quad k uses vertices 4k…4k+3.
    this.indexQuads = 1 << 17;
    const idx = new Uint32Array(this.indexQuads * 6);
    for (let q = 0, v = 0, i = 0; q < this.indexQuads; q++, v += 4) {
      idx[i++] = v; idx[i++] = v + 1; idx[i++] = v + 2;
      idx[i++] = v; idx[i++] = v + 2; idx[i++] = v + 3;
    }
    this.index = new THREE.BufferAttribute(idx, 1);

    const box = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004));
    this.outline = new THREE.LineSegments(box, new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.55 }));
    this.outline.visible = false;
    this.scene.add(this.outline);
    this.particles.addTo(this.scene);

    // Cracks spreading over the block being mined, darkening it stage by stage.
    const crackTex = new THREE.DataArrayTexture(buildCrackStages(), TEX, TEX, 10);
    crackTex.magFilter = THREE.NearestFilter;
    crackTex.minFilter = THREE.NearestFilter;
    crackTex.needsUpdate = true;
    this.crack = new THREE.Mesh(new THREE.BoxGeometry(1.006, 1.006, 1.006), new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
      uniforms: { uCracks: { value: crackTex }, uStage: { value: 0 } },
      vertexShader: 'out vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'precision highp float; precision highp sampler2DArray; in vec2 vUv; uniform sampler2DArray uCracks; uniform float uStage; out vec4 outColor;' +
        'void main() { vec4 c = texture(uCracks, vec3(vUv.x, 1.0 - vUv.y, uStage)); if (c.a < 0.1) discard; outColor = vec4(c.rgb, 0.75); }',
    }));
    this.crack.visible = false;
    this.crack.renderOrder = 15;
    this.scene.add(this.crack);
    this.scene.add(this.bobber);
    this.scene.add(this.clouds.mesh);
    this.scene.add(this.tower.mesh);
    this.scene.add(this.smoke.mesh);
    this.scene.add(this.steam.mesh);
    this.scene.add(this.chimney.mesh);
    this.scene.add(this.flue.mesh);
  }

  /** True while the browser has taken the picture away. */
  get contextLost(): boolean { return this.context.lost; }

  /**
   * After the context comes back. three.js r187 (WebGLRenderer.onContextRestore → initGLContext)
   * starts again with empty caches, so every geometry buffer, texture and shader is sent again from
   * the data still held here the next time it is drawn: nothing of ours needs rebuilding. Two things
   * it does not carry over are put back here: the clear colour (its new WebGLBackground starts at
   * black) and the viewport (only ever applied by setViewport or setRenderTarget).
   */
  private restore(): void {
    this.gl.setClearColor(this.clearColor);
    this.gl.setViewport(this.gl.getViewport(new THREE.Vector4()));
  }

  /** Looking through a telescope (docs/PHASE8.md, 5): the view narrowed `zoom` times, nothing nearer than `near` drawn. 1 puts it back. */
  setZoom(zoom: number, near = 0.08): void {
    const fov = (2 * Math.atan(Math.tan((BASE_FOV * Math.PI) / 360) / zoom) * 180) / Math.PI;
    if (Math.abs(this.camera.fov - fov) < 1e-6 && this.camera.near === near) return;
    this.camera.fov = fov;
    this.camera.near = near;
    // Through the glass the satellites are discs, not specks.
    if (this.sats) (this.sats.material as THREE.PointsMaterial).size = zoom > 1 ? 7 : 2.5;
    this.zoomed = zoom > 1;
    this.camera.updateProjectionMatrix();
  }

  /** The satellites crossing the night sky, as directions from the eye (none: nothing drawn). */
  setSats(dirs: [number, number, number][]): void {
    if (!this.sats) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SAT_COUNT * 3), 3));
      this.sats = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xfff6dc, size: this.zoomed ? 7 : 2.5, sizeAttenuation: false, fog: false, transparent: true, depthWrite: false }));
      this.sats.frustumCulled = false;
      // After the clouds (drawn at 5), or the night's cloud would paint them out; the land still hides them.
      this.sats.renderOrder = 6;
      this.scene.add(this.sats);
    }
    this.sats.visible = dirs.length > 0;
    if (!dirs.length) return;
    const a = this.sats.geometry.getAttribute('position') as THREE.BufferAttribute, c = this.camera.position;
    for (let i = 0; i < SAT_COUNT; i++) { const d = dirs[Math.min(i, dirs.length - 1)]; a.setXYZ(i, c.x + d[0] * SAT_FAR, c.y + d[1] * SAT_FAR, c.z + d[2] * SAT_FAR); }
    a.needsUpdate = true;
  }
  private sats: THREE.Points | null = null;
  private zoomed = false;

  resize(w: number, h: number): void {
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  setRenderDistance(blocks: number): void {
    this.fogDist = blocks;
    for (const m of [this.solidMat, this.waterMat]) {
      m.uniforms.uFogNear.value = FOG_NEAR;
      m.uniforms.uFogFar.value = FOG_FAR;
    }
  }

  setDrawnColumns(mask: Uint8Array): void {
    // The texture reads bytes as 0–1, so a drawn column is stored as 255.
    const data = this.drawnTex.image.data as Uint8Array;
    for (let i = 0; i < mask.length; i++) data[i] = mask[i] ? 255 : 0;
    this.drawnTex.needsUpdate = true;
  }

  /** The distant landscape, once a worker has built it. */
  setFarLand(m: FarMesh): void {
    this.farland = new FarLand(m, this.solidMat.uniforms.uTex.value, this.drawnTex);
    this.scene.add(this.farland.mesh);
  }

  applySky(s: SkyState, time: number): void {
    applySky(this.sky, s);
    for (const m of [this.solidMat, this.waterMat]) {
      const u = m.uniforms;
      u.uTime.value = time;
      u.uDaylight.value = s.daylight;
      u.uSkyLight.value.copy(s.skyLight);
      u.uZenith.value.copy(s.zenith);
      u.uHorizon.value.copy(s.horizon);
      u.uSunGlow.value.copy(s.sunGlow);
      u.uSunDir.value.copy(s.sunDir);
      u.uSunDirV.value.copy(s.sunDir);
      u.uMist.value = s.mist;
      u.uMistColor.value.copy(s.mistColor);
    }
    this.gl.setClearColor(this.clearColor.copy(s.fog));
    this.particles.sync(this.gl.domElement.height, this.camera.fov, FOG_NEAR, FOG_FAR, s);
    this.farland?.sync(s, FOG_NEAR, FOG_FAR);
    this.tower.sync(s, FOG_NEAR, FOG_FAR);
    this.smoke.sync(s, FOG_NEAR, FOG_FAR, time);
    this.steam.sync(s, FOG_NEAR, FOG_FAR, time);
    this.chimney.sync(s, FOG_NEAR, FOG_FAR, time);
    this.flue.sync(s, FOG_NEAR, FOG_FAR, time);
    this.clouds.sync(s, this.camera.position.x, this.camera.position.z, time);
  }

  private makePart(part: MeshPart, mat: THREE.Material, key: number, cx: number, cy: number, cz: number): THREE.Mesh | undefined {
    if (part.quads === 0) return undefined;
    if (part.quads > this.indexQuads) throw new Error(`chunk ${key} has ${part.quads} quads, over the index buffer`);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(part.positions, 3));
    g.setAttribute('aPack', new THREE.BufferAttribute(part.pack, 4));
    g.setAttribute('aLayer', new THREE.BufferAttribute(part.layers, 1));
    g.setAttribute('aUv', new THREE.BufferAttribute(part.uvs, 2));
    g.setIndex(this.index);
    g.setDrawRange(0, part.quads * 6);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(CS / 2, CS / 2, CS / 2), CS * 0.87);
    g.boundingBox = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(CS, CS, CS));
    const m = new THREE.Mesh(g, mat);
    m.position.set(cx * CS, cy * CS, cz * CS);
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    this.scene.add(m);
    return m;
  }

  setChunkMesh(key: number, cx: number, cy: number, cz: number, mesh: ChunkMesh): void {
    this.removeChunk(key);
    const solid = this.makePart(mesh.solid, this.solidMat, key, cx, cy, cz);
    const water = this.makePart(mesh.water, this.waterMat, key, cx, cy, cz);
    if (water) water.renderOrder = 10;
    if (solid || water) this.meshes.set(key, { solid, water });
  }

  removeChunk(key: number): void {
    const old = this.meshes.get(key);
    if (!old) return;
    for (const m of [old.solid, old.water]) {
      if (!m) continue;
      this.scene.remove(m);
      disposeChunkGeometry(m.geometry); // a plain dispose would delete the index every chunk shares
    }
    this.meshes.delete(key);
  }

  showOutline(x: number, y: number, z: number): void {
    this.outline.position.set(x + 0.5, y + 0.5, z + 0.5);
    this.outline.visible = true;
  }
  hideOutline(): void { this.outline.visible = false; }

  /** Shows the bobber floating at a point; `dip` pulls it under when a fish bites. null hides it. */
  showBobber(at: [number, number, number] | null, dip: number, time: number): void {
    this.bobber.visible = !!at;
    if (at) this.bobber.position.set(at[0], at[1] + Math.sin(time * 2.4) * 0.03 - dip * 0.12, at[2]);
  }

  /** Shows mining progress (0–1) as cracks on a block; 0 hides them. */
  showCrack(x: number, y: number, z: number, progress: number): void {
    this.crack.visible = progress > 0.02;
    this.crack.position.set(x + 0.5, y + 0.5, z + 0.5);
    this.crack.material.uniforms.uStage.value = Math.min(9, Math.floor(progress * 10));
  }

  render(): void {
    this.sky.position.copy(this.camera.position);
    let quads = 0;
    for (const v of this.meshes.values()) quads += (v.solid?.geometry.drawRange.count ?? 0) / 6 + (v.water?.geometry.drawRange.count ?? 0) / 6;
    this.stats.chunks = this.meshes.size;
    this.stats.quads = quads;
    this.gl.render(this.scene, this.camera);
  }

  get renderDistance(): number { return this.fogDist; }
}
