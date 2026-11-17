// The game: boots the world around the player, runs the loop (fixed-step physics, a render each
// frame), turns input into movement, mining and building, and keeps the save.

import { World } from './world/world.ts';
import { Streamer } from './world/streamer.ts';
import { createExecutor, type Executor } from './jobs/pool.ts';
import { Renderer } from './render/renderer.ts';
import { skyAt, DAY_SECONDS, type SkyState } from './render/sky.ts';
import { Player, EYE, BREATH_MAX, type Input } from './sim/player.ts';
import { raycast, type RayHit } from './sim/raycast.ts';
import { Inventory } from './sim/inventory.ts';
import { mineSeconds, toolFor, toolOf } from './world/items.ts';
import { breakBlock, placeBlock, placeTarget } from './sim/interact.ts';
import { Hud, nearestViewChunks } from './ui/hud.ts';
import { Sound, materialOf } from './audio/audio.ts';
import { Look } from './platform/look.ts';
import { openStore, writePending, readPending, clearPending, type Store } from './platform/storage.ts';
import { downloadFile, saveToCode, codeToSave, pickFile, fileToSave, inFrame, claudeDownloads, type Downloads } from './platform/fileio.ts';
import { shouldAutosave } from './save/schedule.ts';
import { collectEdits, restoreEdits, encodeSave, encodeSaveNow, decodeSave, SAVE_FORMAT, SAVE_VERSION, type SaveData } from './save/save.ts';
import { HOME, WATERFALL, VALLEY, POOL, zoneAt, ZONE_DANGER, inSanctuary, valleyFloorHeight, creekDistance } from './gen/layout.ts';
import { CS } from './world/constants.ts';

const SAVE_KEY = 'save:1';
const SETTINGS_KEY = 'settings';
const REACH = 5;
const STEP = 1 / 60;
const SPAWN = { x: HOME.wallX - 3.5, y: HOME.floor, z: 1024.5, yaw: Math.PI / 2, pitch: -0.06 };

export interface BootOptions {
  hour?: number;
  cam?: [number, number, number, number, number];
  renderChunks?: number;
  test?: boolean; // deterministic: frozen time, no saving, no waving
  handover?: SaveData; // state passed from the previous version of an open page
  effects?: boolean; // particles in test mode
}

export class Game {
  world = new World();
  renderer: Renderer;
  streamer!: Streamer;
  exec!: Executor;
  player = new Player();
  hotbar = Inventory.starter();
  hud: Hud;
  sound = new Sound();
  private stepDist = 0;
  private digTimer = 0;
  private wasInWater = false;
  look: Look;
  store!: Store;
  hour = 16.5;
  private opts: BootOptions;
  private keys = new Set<string>();
  private mining = { active: false, x: 0, y: 0, z: 0, progress: 0 };
  private target: RayHit | null = null;
  private playing = false;
  private ready = false;
  private accumulator = 0;
  private last = 0;
  private time = 0;
  private lastSave = 0;
  private fps = { frames: 0, t: 0, value: 0 };
  /** Edits made so far, and how many of them the last good save holds. */
  private editCount = 0;
  private savedCount = 0;
  private lastEdit = 0;
  private saving = false;
  private lastFailure = -Infinity;
  /** Bumped by every write; a slower save that finds it changed was overtaken and is dropped. */
  private writeSeq = 0;
  private cachedCode: string | null = null;
  private sky: SkyState = skyAt(16.5);
  private downloads: Downloads | null = null;

  constructor(canvas: HTMLCanvasElement, ui: HTMLElement, opts: BootOptions) {
    this.opts = opts;
    this.renderer = new Renderer(canvas);
    this.look = new Look(canvas);
    this.hud = new Hud(ui, {
      play: () => this.resume(),
      saveNow: () => void this.save(true),
      downloadSave: () => void this.downloadSave(),
      saveCode: () => this.cachedCode,
      loadFile: () => void this.loadFromFile(),
      loadCode: (c) => void this.loadFromCode(c),
      newGame: () => void this.newGame(),
      setRenderDistance: (c) => this.setRenderDistance(c, true),
      setSensitivity: (v) => { this.look.sensitivity = 0.0022 * v; void this.saveSettings(); },
      setInvertY: (v) => { this.look.invertY = v; void this.saveSettings(); },
      setVolume: (v) => { this.sound.volume = v; void this.saveSettings(); },
    });
    this.look.onDelta = (dx, dy) => {
      this.player.yaw -= dx;
      this.player.pitch = Math.max(-1.55, Math.min(1.55, this.player.pitch - dy));
    };
    this.look.onNotice = (t) => this.hud.toast(t);
    this.look.onModeChange = (m) => {
      if (m === 'off' && this.playing) this.pause();
      if (m === 'free') this.hud.toast('This page can’t capture the mouse here: move the mouse to look, or use the arrow keys.', 6000);
    };
    const resize = () => this.renderer.resize(canvas.clientWidth, canvas.clientHeight);
    window.addEventListener('resize', resize);
    resize();
    this.bindInput(canvas);
  }

  async boot(): Promise<void> {
    this.store = await openStore();
    await this.loadSettings();
    const workers = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
    this.exec = await createExecutor((j) => this.streamer.priority(j), workers);
    this.streamer = new Streamer(this.world, this.exec, this.renderer);
    this.streamer.onDrawnChange = (mask) => this.renderer.setDrawnColumns(mask);
    void this.exec.submit({ kind: 'far' }).then((r) => { if (r.kind === 'far') this.renderer.setFarLand(r.mesh); }, (e) => console.error('distant land failed', e));
    this.setRenderDistance(this.opts.renderChunks ?? Number(this.hud.settingsInputs.rd.value), false);

    let resumed = false;
    if (this.opts.handover) { this.applySave(this.opts.handover); resumed = true; this.editCount++; }
    else if (!this.opts.test) {
      // The stored save, or the copy written as the page last closed, whichever is newer.
      const bytes = await this.store.get(SAVE_KEY);
      const stored = bytes ? await decodeSave(bytes) : null;
      const pendingBytes = readPending();
      const pending = pendingBytes ? await decodeSave(pendingBytes) : null;
      const data = pending && (!stored || pending.savedAt > stored.savedAt) ? pending : stored;
      if (data) { this.applySave(data); resumed = true; }
      if (data === pending && pending) this.editCount++; // still to be written to the main store
      else clearPending();
    }
    if (!resumed) {
      this.player.setPosition(SPAWN.x, SPAWN.y, SPAWN.z);
      this.player.yaw = SPAWN.yaw;
      this.player.pitch = SPAWN.pitch;
    }
    if (this.opts.hour !== undefined) this.hour = this.opts.hour;
    if (this.opts.cam) {
      const [x, y, z, yaw, pitch] = this.opts.cam;
      this.player.setPosition(x, y - EYE, z);
      this.player.yaw = yaw; this.player.pitch = pitch;
      this.player.flying = true;
    }
    this.updateSaveStatus();
    // Inside claude.ai a download goes through its "downloads" capability; elsewhere a plain download works.
    if (!inFrame()) this.hud.showDownload(true);
    else void claudeDownloads().then((d) => { this.downloads = d; this.hud.showDownload(!!d); });
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---- The loop ---------------------------------------------------------------------------

  private frame(now: number): void {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    const p = this.player;

    this.exec.pump(this.ready ? 6 : 14);
    this.streamer.update(p.x, p.z, this.ready ? 4 : 12);

    if (!this.ready) {
      const r = 2;
      let done = 0, total = 0;
      const pcx = Math.floor(p.x / CS), pcz = Math.floor(p.z / CS);
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { total++; if (this.world.column(pcx + dx, pcz + dz)) done++; }
      this.hud.setLoading(done, total);
      if (this.streamer.settledAround(p.x, p.z, r)) {
        this.ready = true;
        this.hud.setReady(false);
        if (this.opts.test) this.hud.showMenu(false);
      }
    }

    if (this.playing) {
      this.accumulator += dt;
      while (this.accumulator >= STEP) {
        this.tick(STEP);
        this.accumulator -= STEP;
      }
      if (!this.opts.test) this.hour = (this.hour + (dt / DAY_SECONDS) * 24) % 24;
    }

    // Camera and sky.
    const cam = this.renderer.camera;
    cam.position.set(p.x, p.eyeY, p.z);
    cam.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
    this.sky = skyAt(this.hour);
    this.renderer.applySky(this.sky, this.opts.test ? 0 : this.time);
    if (!this.opts.test || this.opts.effects) this.emitParticles(dt);
    this.renderer.particles.update(dt, this.time, (x, y, z) => this.world.blockAt(x, y, z), this.sky.daylight);
    this.updateTarget();
    this.updateSound();
    this.renderer.render();

    // HUD.
    this.hud.updateHotbar(this.hotbar);
    this.hud.setMining(this.mining.active ? this.mining.progress : 0);
    const m = this.mining;
    this.renderer.showCrack(m.x, m.y, m.z, m.active && this.target ? m.progress : 0);
    this.hud.setBreath(p.breath / BREATH_MAX, p.headInWater || p.breath < BREATH_MAX - 0.01);
    this.fps.frames++;
    if (now - this.fps.t > 500) { this.fps.value = Math.round((this.fps.frames * 1000) / (now - this.fps.t)); this.fps.frames = 0; this.fps.t = now; }
    if (this.hud.debugVisible) this.hud.setDebug(this.debugText());

    // Save a couple of seconds after the player stops changing things, and at least once a minute.
    if (this.playing && shouldAutosave({ unsaved: this.unsaved, saving: this.saving, now: this.time, lastEdit: this.lastEdit, lastSave: this.lastSave, lastFailure: this.lastFailure })) void this.save(false);
  }

  private tick(dt: number): void {
    const input = this.readInput();
    const p = this.player;
    const px = p.x, pz = p.z, vy = p.vy;
    p.step(dt, input, (x, y, z) => this.world.blockAt(x, y, z));
    // Footsteps by the ground underfoot, and a splash on falling into water.
    if (p.onGround && !p.flying && !p.inWater) {
      this.stepDist += Math.hypot(p.x - px, p.z - pz);
      if (this.stepDist > 1.7) {
        this.stepDist = 0;
        this.sound.footstep(materialOf(this.world.blockAt(Math.floor(p.x), Math.floor(p.y - 0.05), Math.floor(p.z))));
      }
    }
    if (p.inWater && !this.wasInWater && vy < -3) this.sound.splash();
    this.wasInWater = p.inWater;
    // Arrow keys turn too (useful where the mouse can't be captured).
    const turn = (this.keys.has('ArrowLeft') ? 1 : 0) - (this.keys.has('ArrowRight') ? 1 : 0);
    const tilt = (this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('ArrowDown') ? 1 : 0);
    this.player.yaw += turn * dt * 2.2;
    this.player.pitch = Math.max(-1.55, Math.min(1.55, this.player.pitch + tilt * dt * 1.6));
    this.tickMining(dt);
  }

  private readInput(): Input {
    const k = this.keys;
    return {
      forward: (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0),
      strafe: (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0),
      jump: k.has('Space'),
      sprint: k.has('ShiftLeft') || k.has('ShiftRight'),
      descend: k.has('ShiftLeft') || k.has('ShiftRight'),
    };
  }

  // ---- Sound -------------------------------------------------------------------------------

  private updateSound(): void {
    if (!this.sound.started) return;
    const p = this.player;
    const [fx, fy, fz] = p.lookDir();
    const head = this.world.lightAt(Math.floor(p.x), Math.floor(p.eyeY), Math.floor(p.z));
    const valley = inSanctuary(p.x, p.z);
    const creek = valley ? Math.min(creekDistance(p.x, p.z), Math.max(0, Math.hypot(p.x - POOL.cx, p.z - POOL.cz) - POOL.radius)) : 99;
    this.sound.update({
      x: p.x, y: p.eyeY, z: p.z, fx, fy, fz, hour: this.hour, inValley: valley,
      open: Math.min(1, Math.max(0, ((head >> 4) - 4) / 10)), underwater: p.headInWater, creekDist: creek,
      fallPos: [WATERFALL.x + 1, (VALLEY.water + WATERFALL.top) / 2, (WATERFALL.z0 + WATERFALL.z1) / 2],
    });
  }

  // ---- Life in the air ----------------------------------------------------------------------

  private sprayDebt = 0;

  private emitParticles(dt: number): void {
    const p = this.player, parts = this.renderer.particles;
    // Spray where the waterfall meets the pool, while the player is near enough to see it.
    if (Math.hypot(p.x - WATERFALL.x, p.z - (WATERFALL.z0 + WATERFALL.z1) / 2) < 170) {
      this.sprayDebt += dt * 45;
      const n = Math.floor(this.sprayDebt);
      this.sprayDebt -= n;
      if (n) parts.spray(WATERFALL.x + 1.5, WATERFALL.x + 4, WATERFALL.z0, WATERFALL.z1, VALLEY.water + 0.9, n);
    }
    // Fireflies over the valley floor from dusk into the night.
    const h = this.hour;
    const dusk = Math.min(1, Math.max(0, (h - 18.3) / 0.8)) * (h < 23.5 ? 1 : 0) + (h < 4.5 ? 0.5 : 0);
    const want = Math.round(70 * dusk);
    if (inSanctuary(p.x, p.z) && parts.fireflies() < want) {
      const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 30;
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      if (inSanctuary(x, z)) parts.firefly(x, valleyFloorHeight(x, z) + 0.6 + Math.random() * 2.8, z);
    }
  }

  // ---- Looking, mining, placing -----------------------------------------------------------

  private updateTarget(): void {
    const p = this.player;
    const [dx, dy, dz] = p.lookDir();
    this.target = this.playing ? raycast((x, y, z) => this.world.blockAt(x, y, z), p.x, p.eyeY, p.z, dx, dy, dz, REACH) : null;
    if (this.target) this.renderer.showOutline(this.target.x, this.target.y, this.target.z);
    else this.renderer.hideOutline();
  }

  private tickMining(dt: number): void {
    const m = this.mining;
    const t = this.target;
    if (!m.active || !t) { m.progress = 0; return; }
    if (t.x !== m.x || t.y !== m.y || t.z !== m.z) { m.x = t.x; m.y = t.y; m.z = t.z; m.progress = 0; }
    const seconds = mineSeconds(t.id, this.hotbar.current?.id ?? 0);
    if (seconds < 0) return; // bedrock and other unbreakables
    m.progress += seconds === 0 ? 1 : dt / seconds;
    this.digTimer -= dt;
    if (this.digTimer <= 0) { this.sound.dig(materialOf(t.id)); this.digTimer = 0.24; }
    if (m.progress >= 1) {
      this.breakBlock(t.x, t.y, t.z);
      m.progress = 0;
    }
  }

  private breakBlock(x: number, y: number, z: number): void {
    this.streamer.markUrgentAround(x, y, z);
    const id = this.world.blockAt(x, y, z);
    const lv = this.world.lightAt(x, y + 1, z);
    const r = breakBlock(this.world, this.hotbar, x, y, z);
    if (r.changed) {
      // The right tool wears with each block it mines.
      const held = this.hotbar.current;
      const tool = held ? toolOf(held.id) : undefined;
      if (tool && tool.kind === toolFor(id) && this.hotbar.wearTool()) this.hud.toast('Your tool broke');
      this.renderer.particles.burst(id, x, y, z, Math.max(0.15, Math.max((lv >> 4) * this.sky.daylight, lv & 15) / 15));
      this.sound.breakBlock(materialOf(id));
    }
    if (r.full) this.hud.toast('Your hotbar is full');
    if (r.changed) this.edited();
  }

  private placeBlock(): void {
    if (!this.target) return;
    const [x, y, z] = placeTarget(this.target);
    this.streamer.markUrgentAround(x, y, z);
    const id = this.hotbar.current?.id ?? 0;
    if (placeBlock(this.world, this.hotbar, this.player, this.target)) {
      this.edited();
      this.sound.place(materialOf(id));
    }
  }

  // ---- Input ---------------------------------------------------------------------------------

  private bindInput(canvas: HTMLCanvasElement): void {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'F3'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if (e.code === 'Escape' && this.playing) this.pause();
      if (e.code === 'KeyM') { this.sound.muted = !this.sound.muted; this.hud.toast(this.sound.muted ? 'Sound off' : 'Sound on'); }
      if (!this.playing) return;
      if (e.code.startsWith('Digit')) { const n = Number(e.code.slice(5)); if (n >= 1 && n <= 9) this.hotbar.select(n - 1); }
      if (e.code === 'KeyF') { this.player.flying = !this.player.flying; this.hud.toast(this.player.flying ? 'Flying (Space up, Shift down)' : 'Walking'); }
      if (e.code === 'KeyG') { this.hotbar.creative = !this.hotbar.creative; this.hud.toast(this.hotbar.creative ? 'Builder’s mode: blocks never run out' : 'Builder’s mode off'); }
      if (e.code === 'BracketRight') this.hour = (this.hour + 1) % 24;
      if (e.code === 'BracketLeft') this.hour = (this.hour + 23) % 24;
      if (e.code === 'F3') this.hud.debugVisible = !this.hud.debugVisible;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mining.active = false; });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.playing) return;
      if (this.look.mode === 'off') { this.look.engage(); return; }
      if (e.button === 0) { this.mining.active = true; this.mining.progress = 0; }
      if (e.button === 2) this.placeBlock();
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mining.active = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      if (!this.playing) return;
      e.preventDefault();
      this.hotbar.select(this.hotbar.selected + (e.deltaY > 0 ? 1 : -1));
    }, { passive: false });
    // Leaving: the write has to start before this event returns, so it skips compression.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.saveNow(); this.sound.suspend(); }
      else if (this.playing) this.sound.resume();
    });
    window.addEventListener('pagehide', () => this.saveNow());
  }

  private resume(): void {
    if (!this.ready) return;
    this.sound.start(); // browsers only allow sound to begin from a click
    this.playing = true;
    this.hud.showMenu(false);
    this.look.engage();
  }

  private pause(): void {
    this.playing = false;
    this.sound.suspend();
    this.mining.active = false;
    this.keys.clear();
    this.look.release();
    this.hud.setReady(true);
    this.hud.showMenu(true);
    this.updateSaveStatus();
    void this.refreshCode();
  }

  private setRenderDistance(chunks: number, persist: boolean): void {
    // At least 224 m from the menu; a test address may ask for less (?rd=…).
    chunks = Math.max(this.opts.renderChunks !== undefined && !persist ? 2 : 7, Math.min(12, chunks || 8));
    this.streamer.radius = chunks;
    this.renderer.setRenderDistance(chunks * CS);
    this.hud.settingsInputs.rd.value = String(chunks);
    if (persist) void this.saveSettings();
  }

  // ---- Saving ------------------------------------------------------------------------------

  snapshot(): SaveData {
    const p = this.player;
    const { palette, edits } = collectEdits(this.world);
    return {
      format: SAVE_FORMAT, version: SAVE_VERSION, savedAt: new Date().toISOString(), hour: this.hour,
      player: { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, flying: p.flying },
      hotbar: this.hotbar.toSave(), selected: this.hotbar.selected, palette, edits,
    };
  }

  applySave(d: SaveData): void {
    restoreEdits(this.world, d);
    this.player.setPosition(d.player.x, d.player.y, d.player.z);
    this.player.yaw = d.player.yaw;
    this.player.pitch = d.player.pitch;
    this.player.flying = d.player.flying;
    this.hour = d.hour;
    this.hotbar = Inventory.fromSave(d.hotbar, d.selected);
  }

  private get unsaved(): boolean { return this.editCount !== this.savedCount; }

  private edited(): void { this.editCount++; this.lastEdit = this.time; }

  private async save(announce: boolean): Promise<void> {
    if (this.opts.test) return;
    const holds = this.editCount;
    const seq = ++this.writeSeq;
    this.saving = true;
    const bytes = await encodeSave(this.snapshot());
    if (seq !== this.writeSeq) { this.saving = false; return; } // a close-time save wrote newer state meanwhile
    const ok = await this.store.set(SAVE_KEY, bytes);
    this.saving = false;
    this.lastSave = this.time;
    if (ok) {
      this.savedCount = Math.max(this.savedCount, holds);
      if (!this.unsaved && seq === this.writeSeq) clearPending();
    } else {
      this.lastFailure = this.time;
    }
    if (announce) this.hud.toast(ok && this.store.kind !== 'memory' ? 'Saved in this browser' : 'This page can’t keep saves: use “Copy save code”');
    if (!this.playing) void this.refreshCode();
    this.updateSaveStatus();
  }

  /** Saves at once, uncompressed, without waiting: used when the page is being hidden or closed. */
  private saveNow(): void {
    if (this.opts.test || !this.unsaved || !this.store) return;
    const holds = this.editCount;
    this.writeSeq++;
    const bytes = encodeSaveNow(this.snapshot());
    writePending(bytes); // finishes before this returns, whatever happens to the page next
    void this.store.set(SAVE_KEY, bytes).then((ok) => {
      if (ok) this.savedCount = Math.max(this.savedCount, holds);
    });
  }

  private updateSaveStatus(): void {
    const n = [...this.world.edits.values()].reduce((s, m) => s + m.size, 0);
    if (this.store.kind === 'memory') {
      this.hud.setSaveStatus(`This page isn’t allowed to keep saves. Before you close it, use “Copy save code” and keep the code somewhere safe. (${n} blocks changed)`, true);
    } else {
      this.hud.setSaveStatus(`Saves automatically in this browser every minute and when you leave. A save code is a backup you keep yourself, and it moves your valley to another computer. (${n} blocks changed)`, false);
    }
  }

  private async downloadSave(): Promise<void> {
    const code = this.cachedCode ?? saveToCode(await encodeSave(this.snapshot()));
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const filename = `hidden-valley-save-${stamp}.txt`;
    if (this.downloads) {
      try {
        await this.downloads.save({ filename, data: code });
        this.hud.toast('Save file downloaded');
      } catch (e) {
        if ((e as { code?: string }).code !== 'declined') this.hud.toast('Downloads aren’t available here: use “Copy save code”');
      }
      return;
    }
    if (!downloadFile(filename, new TextEncoder().encode(code))) this.hud.toast('Downloads are blocked here: use “Copy save code”');
    else this.hud.toast('Save file downloaded');
  }

  /** Makes the save code ahead of time, so "Copy save code" can write it straight from the click. */
  private async refreshCode(): Promise<void> {
    this.cachedCode = null;
    this.cachedCode = saveToCode(await encodeSave(this.snapshot()));
  }

  private async loadBytes(bytes: Uint8Array | null): Promise<void> {
    const d = bytes ? await decodeSave(bytes) : null;
    if (!d) { this.hud.toast('That isn’t a Hidden Valley save'); return; }
    // Stamp it with this computer's clock, so it compares fairly with saves made here afterwards.
    d.savedAt = new Date().toISOString();
    await this.store.set(SAVE_KEY, await encodeSave(d));
    this.restart(d);
    this.hud.toast('Save loaded');
  }

  private async loadFromFile(): Promise<void> {
    const bytes = await pickFile();
    await this.loadBytes(bytes ? fileToSave(bytes) : null);
  }
  private async loadFromCode(code: string): Promise<void> { await this.loadBytes(codeToSave(code)); }

  private async newGame(): Promise<void> {
    await this.store.set(SAVE_KEY, new Uint8Array(0));
    this.restart(null);
    this.hud.toast('A fresh valley');
  }

  /** Rebuilds the world from a save (or from nothing) in place: no page reload, so it works without storage. */
  private restart(d: SaveData | null): void {
    clearPending(); // a close-time copy of the old valley must not come back at the next start
    this.streamer.reset();
    this.world.edits.clear();
    this.mining.active = false;
    if (d) this.applySave(d);
    else {
      this.hotbar = Inventory.starter();
      this.hour = 16.5;
      this.player.flying = false;
      this.player.setPosition(SPAWN.x, SPAWN.y, SPAWN.z);
      this.player.yaw = SPAWN.yaw;
      this.player.pitch = SPAWN.pitch;
    }
    this.savedCount = this.editCount;
    this.ready = false;
    this.hud.setLoading(0, 1);
    this.hud.setLoadingVisible();
    this.updateSaveStatus();
  }

  private async saveSettings(): Promise<void> {
    const s = { rd: this.streamer.radius, sens: this.look.sensitivity / 0.0022, inv: this.look.invertY, vol: this.sound.volume };
    await this.store.set(SETTINGS_KEY, new TextEncoder().encode(JSON.stringify(s)));
  }

  private async loadSettings(): Promise<void> {
    try {
      const b = await this.store.get(SETTINGS_KEY);
      if (!b) return;
      const s = JSON.parse(new TextDecoder().decode(b));
      // Older builds allowed 4 and 6; the least now is 7 (224 m), and the menu offers 7, 8, 10 and 12.
      if (typeof s.rd === 'number') this.hud.settingsInputs.rd.value = String(nearestViewChunks(s.rd));
      if (typeof s.sens === 'number') { this.look.sensitivity = 0.0022 * s.sens; this.hud.settingsInputs.sens.value = String(s.sens); }
      if (typeof s.inv === 'boolean') { this.look.invertY = s.inv; this.hud.settingsInputs.inv.checked = s.inv; }
      if (typeof s.vol === 'number') { this.sound.volume = s.vol; this.hud.settingsInputs.vol.value = String(s.vol); }
    } catch { /* bad settings are ignored */ }
  }

  // ---- Debug and test hooks --------------------------------------------------------------------

  private debugText(): string {
    const p = this.player;
    const r = this.renderer.stats, s = this.streamer.stats;
    const zone = zoneAt(Math.floor(p.x), Math.floor(p.z));
    const light = this.world.lightAt(Math.floor(p.x), Math.floor(p.y + 1), Math.floor(p.z));
    return [
      `${this.fps.value} fps · ${this.exec.kind} ×${this.exec.threads} · store ${this.store.kind} · look ${this.look.mode}`,
      `pos ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)} · yaw ${(p.yaw * 57.3).toFixed(0)}° · zone ${zone} (danger ${ZONE_DANGER[zone]})`,
      `time ${Math.floor(this.hour)}:${String(Math.floor((this.hour % 1) * 60)).padStart(2, '0')} · light sky ${light >> 4} block ${light & 15}`,
      `columns ${s.columns} · gen queue ${s.genQueued} · mesh queue ${s.meshQueued}`,
      `chunk meshes ${r.chunks} · quads ${Math.round(r.quads / 1000)}k · draw calls ${this.renderer.gl.info.render.calls}`,
      this.target ? `target ${this.target.x} ${this.target.y} ${this.target.z} (${this.target.id})` : 'target —',
    ].join('\n');
  }

  /** For automated checks: is everything near the player loaded and drawn? */
  isIdle(): boolean {
    return this.ready && this.streamer.settledAround(this.player.x, this.player.z, Math.min(3, this.streamer.radius - 1));
  }

  setCamera(x: number, y: number, z: number, yaw: number, pitch: number): void {
    this.player.setPosition(x, y - EYE, z);
    this.player.yaw = yaw;
    this.player.pitch = pitch;
    this.player.flying = true;
  }
}
