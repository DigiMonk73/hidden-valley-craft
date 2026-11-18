// The game: boots the world around the player, runs the loop (fixed-step physics, a render each
// frame), turns input into movement, mining and building, and keeps the save.

import { World } from './world/world.ts';
import { Streamer } from './world/streamer.ts';
import { createExecutor, type Executor } from './jobs/pool.ts';
import { Renderer } from './render/renderer.ts';
import { skyAt, DAY_SECONDS, type SkyState } from './render/sky.ts';
import { Player, EYE, BREATH_MAX, type Input } from './sim/player.ts';
import { raycast, type RayHit } from './sim/raycast.ts';
import { WATER, FALLING_WATER, BLOCK_DEFS, blockName } from './world/blocks.ts';
import { Inventory } from './sim/inventory.ts';
import { mineSeconds, toolFor, toolOf } from './world/items.ts';
import { breakBlock, placeBlock, placeTarget, toggleDoor } from './sim/interact.ts';
import { stationOf, type Station } from './sim/crafting.ts';
import { Gate, GATE_LEVER } from './sim/gate.ts';
import { randomTicks, till, sow, pickCoffee, growWhileAway, FARMLAND } from './sim/farming.ts';
import { freshVitals, tickVitals, fallDamage, consume, type Vitals } from './sim/survival.ts';
import { Hud, nearestViewChunks } from './ui/hud.ts';
import { InventoryScreen } from './ui/inventoryScreen.ts';
import { PaperScreen } from './ui/paperScreen.ts';
import { drawMap } from './ui/mapView.ts';
import journalData from '../data/journal.json' with { type: 'json' };
import { homeChestAt } from './gen/inheritance.ts';
import { itemId, foodOf } from './world/items.ts';
import { BACKPACK_SLOTS } from './sim/inventory.ts';
import { Sound, materialOf } from './audio/audio.ts';
import { Look } from './platform/look.ts';
import { openStore, writePending, readPending, clearPending, type Store } from './platform/storage.ts';
import { downloadFile, saveToCode, codeToSave, pickFile, fileToSave, inFrame, claudeDownloads, type Downloads } from './platform/fileio.ts';
import { shouldAutosave } from './save/schedule.ts';
import { collectContainers, restoreContainers, collectEdits, restoreEdits, encodeSave, encodeSaveNow, decodeSave, SAVE_FORMAT, SAVE_VERSION, type SaveData } from './save/save.ts';
import { HOME, WATERFALL, CANYON_FALLS, SPRINGS, VALLEY, POOL, GATE, PLACES, riverCurrent, fallsLoudness, rescueFromOldTunnel, zoneAt, inValleyBowl, ZONE_DANGER, inSanctuary, valleyFloorHeight, outsideHeight, creekDistance } from './gen/layout.ts';
import { CS } from './world/constants.ts';
import { Wild, armourFactor, type WildEvents } from './entity/wild.ts';
import { makeCreature, hurt as hurtCreature, rayHitCreature, type Creature, type Kind } from './entity/creatures.ts';
import { leaveLostPack, losesPack } from './sim/death.ts';
import { emptySnare, breedHutches, newDay, SNARE_CAUGHT } from './sim/rabbits.ts';
import { meleeDamage, takeDrops, drawOf, clearShot, MELEE_COOLDOWN, MELEE_REACH, RIFLE_COOLDOWN, RIFLE_DAMAGE, RIFLE_RANGE, BOW_MIN_DRAW } from './sim/hunting.ts';
import { groundAt, FLOCK_SIZE } from './entity/spawner.ts';
import { ZONE1, SADDLE } from './gen/layout.ts';
import { SCOUT_AT, MARCO_SPOT, YARD, DEN } from './gen/zone1.ts';
import { CATALOG, START_WALLET, buy, sell, sellPrice, sellable, btc } from './sim/trade.ts';
import { M1_STEPS, trackM1, diedOutside } from './sim/milestones.ts';
import { catchChicken, layEggs, COOP, CATCH_REACH } from './sim/livestock.ts';
import { itemLabel } from './world/items.ts';
import { iconFor } from './ui/icons.ts';
import { drawMapScrap } from './ui/mapView.ts';
import people from '../data/people.json' with { type: 'json' };

const SAVE_KEY = 'save:1';
const KILL_LINE: Record<Creature['kind'], string> = {
  rabbit: 'A rabbit: meat and a small hide', deer: 'A deer: venison, a hide and bone', boar: 'A wild boar: pork, a hide and bone', puma: 'The puma is dead. Its pelt is yours',
  dog: 'The dog is dead: a hide and bone', coyote: 'A coyote: its hide', chicken: 'A chicken: meat and feathers', marco: '',
};
const MARCO = people.marco;
/** Pistol: the dead scout's, never crafted (ADR-019). */
const PISTOL = { damage: 30, cooldown: 0.5, range: 60 };
/** Marco keeps a meeting by day: from seven in the morning until six in the evening. */
const MARCO_HOURS: [number, number] = [7, 18];
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
  screen: InventoryScreen;
  paper: PaperScreen;
  /** Columns the player has been near (for the map table). */
  explored = new Uint8Array(64 * 64);
  /** Things that have happened for good (the safe opened). */
  flags = new Set<string>();
  /** The hot wallet, in satoshis: what Marco is paid from and pays into (docs/PHASE4.md). */
  wallet = START_WALLET;
  /** Once a second: the places' toasts, M1, Marco's comings and goings. */
  private lastPlaces = -1;
  private lastExplore = -1;
  sound = new Sound();
  private stepDist = 0;
  private digTimer = 0;
  private wasInWater = false;
  private tickCount = 0;
  private frameDt = 0;
  /** Seconds of actual play (stops when paused or a screen is open): for boosts and bites. */
  private playTime = 0;
  private biteCued = false;
  /** A line in the water: where the bobber floats, when a fish bites and how long it stays on. */
  private fishing: { at: [number, number, number]; biteAt: number; biteEnd: number } | null = null;
  vitals: Vitals = freshVitals();
  /** The builder's gate in the tunnel, and how hard the ground is shaking from it. */
  gate = new Gate();
  private shake = 0;
  /** The creatures and arrows outside the valley. */
  wild = new Wild();
  /** A rifle shot this tick, for the creatures to hear. */
  private shotFired = false;
  private lastBlow = -Infinity;
  private lastShot = -Infinity;
  /** When the bowstring was drawn (play time), or null. */
  private drawing: number | null = null;
  /** Where the player wakes after a death or a night's sleep. */
  spawn = { x: 0, y: 0, z: 0, yaw: 0 };
  private coffeeUntil = 0;
  look: Look;
  store!: Store;
  hour = 16.5;
  /** The hour at the last frame, to notice a new day beginning. */
  private dayClock = 16.5;
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
    this.player.flow = riverCurrent;
    this.wild.spawning = !opts.test;
    this.renderer = new Renderer(canvas);
    this.look = new Look(canvas);
    this.screen = new InventoryScreen(ui);
    this.paper = new PaperScreen(ui);
    this.screen.onChange = () => this.edited();
    this.screen.onMake = () => this.sound.place('wood');
    this.screen.onFull = () => this.hud.toast('No room in your pack for that');
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
      if (m === 'off' && this.playing && !this.screen.isOpen && !this.paper.isOpen) this.pause();
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
    if (!resumed) this.spawn = { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z, yaw: SPAWN.yaw };
    if (!resumed) {
      this.player.setPosition(SPAWN.x, SPAWN.y, SPAWN.z);
      this.player.yaw = SPAWN.yaw;
      this.player.pitch = SPAWN.pitch;
    }
    if (this.opts.hour !== undefined) this.hour = this.opts.hour;
    this.dayClock = this.hour;
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
    this.frameDt = dt;
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
    // Each morning (or on waking), the hutches breed.
    if (newDay(this.dayClock, this.hour)) {
      if (breedHutches(this.world)) this.edited();
      if (layEggs(this.world)) this.edited();
      // The farm's feral flock regrows by a hen a day.
      this.wild.flockLeft = Math.min(FLOCK_SIZE, this.wild.flockLeft + 1);
    }
    this.dayClock = this.hour;

    // Camera and sky.
    const cam = this.renderer.camera;
    this.shake = Math.max(0, this.shake - dt);
    const quake = this.shake > 0 ? Math.min(1, this.shake) * 0.05 : 0;
    cam.position.set(p.x + quake * Math.sin(this.time * 61), p.eyeY + quake * Math.sin(this.time * 47), p.z);
    cam.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
    this.sky = skyAt(this.hour);
    this.renderer.applySky(this.sky, this.opts.test ? 0 : this.time);
    if (!this.opts.test || this.opts.effects) this.emitParticles(dt);
    this.renderer.particles.update(dt, this.time, (x, y, z) => this.world.blockAt(x, y, z), this.sky.daylight);
    this.renderer.creatures.sync(this.wild.creatures, this.wild.arrows, (x, y, z) => this.world.lightAt(x, y, z), cam.position);
    this.updateTarget();
    this.updateSound();
    this.renderer.render();

    // HUD.
    this.hud.updateHotbar(this.hotbar);
    this.hud.setVitals(this.vitals.hp, this.vitals.hunger, this.vitals.thirst, !this.hotbar.creative);
    // The bow's draw shows on the same bar as mining; switching away from the bow lets the string down.
    if (this.drawing !== null && this.hotbar.current?.id !== itemId('compound_bow')) this.drawing = null;
    this.hud.setMining(this.drawing !== null ? drawOf(this.playTime - this.drawing) : this.mining.active ? this.mining.progress : 0);
    const m = this.mining;
    this.renderer.showCrack(m.x, m.y, m.z, m.active && this.target ? m.progress : 0);
    this.updateFishing();
    this.hud.setBreath(p.breath / BREATH_MAX, p.headInWater || p.breath < BREATH_MAX - 0.01);
    this.fps.frames++;
    if (now - this.fps.t > 500) { this.fps.value = Math.round((this.fps.frames * 1000) / (now - this.fps.t)); this.fps.frames = 0; this.fps.t = now; }
    // Every frame, so turning F3 off hides the panel too (it used to stay up with its last text).
    this.hud.setDebug(this.hud.debugVisible ? this.debugText() : '');

    // Save a couple of seconds after the player stops changing things, and at least once a minute.
    if (this.playing && shouldAutosave({ unsaved: this.unsaved, saving: this.saving, now: this.time, lastEdit: this.lastEdit, lastSave: this.lastSave, lastFailure: this.lastFailure })) void this.save(false);
  }

  private tick(dt: number): void {
    // With a screen open the player's body waits (no hunger, no sinking); the world goes on.
    if (this.screen.isOpen || this.paper.isOpen) {
      if ((this.tickCount = (this.tickCount + 1) % 3) === 0) randomTicks(this.world, this.player.x, this.player.z, Math.random);
      return;
    }
    this.playTime += dt;
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
    this.tickWild(dt);
    this.tickSurvival(dt, input);
    this.tickGate(dt);
    if (Math.floor(this.time) !== this.lastPlaces) { this.lastPlaces = Math.floor(this.time); this.tickPlaces(); }
    // Mark where the player has been, for the map table (once a second).
    if (Math.floor(this.time) !== this.lastExplore) {
      this.lastExplore = Math.floor(this.time);
      const cx = Math.floor(p.x / 32), cz = Math.floor(p.z / 32);
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        const x = cx + dx, z = cz + dz;
        if (x >= 0 && z >= 0 && x < 64 && z < 64) this.explored[z * 64 + x] = 1;
      }
    }
    // Crops grow on random ticks near the player (20 a second).
    if ((this.tickCount = (this.tickCount + 1) % 3) === 0) randomTicks(this.world, p.x, p.z, Math.random);
    // Arrow keys turn too (useful where the mouse can't be captured).
    const turn = (this.keys.has('ArrowLeft') ? 1 : 0) - (this.keys.has('ArrowRight') ? 1 : 0);
    const tilt = (this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('ArrowDown') ? 1 : 0);
    this.player.yaw += turn * dt * 2.2;
    this.player.pitch = Math.max(-1.55, Math.min(1.55, this.player.pitch + tilt * dt * 1.6));
    this.tickMining(dt);
  }

  private readInput(): Input {
    if (this.screen.isOpen || this.paper.isOpen) return { forward: 0, strafe: 0, jump: false, sprint: false, descend: false };
    const k = this.keys;
    return {
      forward: (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0),
      strafe: (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0),
      jump: k.has('Space'),
      sprint: k.has('ShiftLeft') || k.has('ShiftRight'),
      descend: k.has('ShiftLeft') || k.has('ShiftRight'),
    };
  }

  private updateFishing(): void {
    const f = this.fishing;
    const p = this.player;
    // Putting the rod away or walking off ends it.
    if (f && (this.hotbar.current?.id !== itemId('fishing_rod') || Math.hypot(p.x - f.at[0], p.z - f.at[2]) > 14)) this.fishing = null;
    const g = this.fishing;
    if (g && this.playTime >= g.biteAt && !this.biteCued) { this.biteCued = true; this.sound.splash(); this.hud.toast('A bite! Right-click!', 1500); }
    if (!g) this.biteCued = false;
    if (g && this.playTime > g.biteEnd + 4) this.fishing = null;
    const biting = g && this.playTime >= g.biteAt && this.playTime <= g.biteEnd ? 1 : 0;
    this.renderer.showBobber(g ? g.at : null, biting, this.time);
  }

  private tickGate(dt: number): void {
    const before = this.gate.rows;
    const e = this.gate.update(dt, this.world, this.player);
    if (e === 'grind') { this.sound.gate(); this.shake = 2; }
    if (e === 'open' || e === 'shut') { this.sound.thud(); this.shake = Math.max(this.shake, 0.4); }
    if (this.gate.rows !== before) {
      this.streamer.markUrgentAround(GATE.x0, GATE.y0, GATE.z0);
      this.edited();
    }
  }

  // ---- The wild ----------------------------------------------------------------------------

  private tickWild(dt: number): void {
    const p = this.player;
    const ev = this.wild.update(dt, {
      px: p.x, py: p.y, pz: p.z, night: this.hour >= 19 || this.hour < 5.5, shot: this.shotFired,
      blockAt: (x, y, z) => this.world.blockAt(x, y, z),
      loaded: (x, z) => !!this.world.column(Math.floor(x / CS), Math.floor(z / CS)),
      rand: Math.random,
      arrowRoom: () => this.hotbar.room(itemId('arrow')),
    });
    this.shotFired = false;
    this.wildEvents(ev);
  }

  private wildEvents(ev: WildEvents): void {
    for (const s of ev.sounds) {
      if (s.kind === 'rustle') this.sound.rustle(s.x, s.y, s.z);
      else if (s.kind === 'grunt') this.sound.grunt(s.x, s.y, s.z);
      else if (s.kind === 'growl') this.sound.growl(s.x, s.y, s.z);
      else if (s.kind === 'bark') { this.sound.bark(s.x, s.y, s.z); this.once('dogs_met', 'Dogs! When one crouches and snarls, step back, then strike.', 6000); }
      else if (s.kind === 'yip') { this.sound.yip(s.x, s.y, s.z); this.once('coyotes_met', 'Coyotes! They come from the sides. Step back when one crouches to spring.', 6000); }
      else if (s.kind === 'snarl') this.sound.snarl(s.x, s.y, s.z);
      else if (s.kind === 'cluck') this.sound.cluck(s.x, s.y, s.z);
      else this.sound.hit(s.x, s.y, s.z);
    }
    if (!this.hotbar.creative && !this.player.flying) {
      for (const h of ev.hits) {
        const factor = armourFactor((name) => this.hotbar.count(itemId(name)));
        this.vitals.hp = Math.max(0, this.vitals.hp - h.damage * factor);
        this.sound.hurt();
        this.hud.flashHurt();
      }
    }
    for (const c of ev.kills) this.takeDrops(c);
    for (const [x, y, z] of ev.snared) {
      this.world.setBlock(x, y, z, SNARE_CAUGHT);
      this.streamer.markUrgentAround(x, y, z);
      this.edited();
    }
    if (ev.picked) { this.hotbar.add(itemId('arrow'), ev.picked); this.edited(); }
  }

  /** A kill's drops go into the pack; what doesn't fit is said so. */
  private takeDrops(c: Creature): void {
    // The den's dogs stay dead: the farm is quiet once all three are.
    if (c.kind === 'dog' && c.home) {
      this.wild.denLeft = Math.max(0, this.wild.denLeft - 1);
      if (this.wild.denLeft === 0) this.hud.toast('The last of the dogs. The farm is quiet now.', 5000);
    }
    if (c.kind === 'chicken') this.wild.flockLeft = Math.max(0, this.wild.flockLeft - 1);
    const left = takeDrops(this.hotbar, c.kind);
    if (!left.length) this.hud.toast(KILL_LINE[c.kind]);
    else {
      // What doesn't fit is left in a sack where the animal fell, to come back for.
      const sack = new Inventory(left.length);
      for (const [id, n] of left) sack.add(id, n);
      const at = leaveLostPack(this.world, sack, c.x, c.y + 0.2, c.z);
      if (at) this.streamer.markUrgentAround(at[0], at[1], at[2]);
      this.hud.toast('Your pack is full: the rest is left in a sack where it fell');
    }
    this.edited();
  }

  // ---- Hunting -------------------------------------------------------------------------------

  /** The creature under the crosshair within `reach`, if no block stands in front of it. */
  private creatureInSight(reach: number): { c: Creature; dist: number } | null {
    const p = this.player;
    const [dx, dy, dz] = p.lookDir();
    const hit = rayHitCreature(this.wild.creatures, p.x, p.eyeY, p.z, dx, dy, dz, reach);
    if (!hit) return null;
    return clearShot((x, y, z) => this.world.blockAt(x, y, z), p.x, p.eyeY, p.z, dx, dy, dz, hit.dist) ? hit : null;
  }

  private damageCreature(c: Creature, damage: number): void {
    this.sound.hit(c.x, c.y + 0.5, c.z);
    if (hurtCreature(c, damage)) { this.wild.remove(c); this.takeDrops(c); }
  }

  /** A left-click on a creature in reach: a blow with what is in hand. True if there was one to hit. */
  private strike(): boolean {
    const hit = this.creatureInSight(MELEE_REACH);
    if (!hit) return false;
    if (hit.c.kind === 'marco') { this.hud.toast(MARCO.strike); return true; }
    if (this.playTime - this.lastBlow < MELEE_COOLDOWN) return true;
    this.lastBlow = this.playTime;
    this.damageCreature(hit.c, meleeDamage(this.hotbar.current?.id));
    return true;
  }

  /** Is the block in front something a right-click uses (a chest, lever, station, bed…), rather than shoots at? */
  private usableTarget(): boolean {
    const t = this.target;
    if (!t) return false;
    const name = BLOCK_DEFS[t.id]?.base ?? blockName(t.id);
    const scoutLegs = blockName(t.id).startsWith('scout_legs') && !!this.world.containerAt(t.x - 1, t.y, t.z);
    return !!this.world.containerAt(t.x, t.y, t.z) || scoutLegs || t.id === GATE_LEVER || !!stationOf(t.id) || /^steel_door|^snare_caught/.test(blockName(t.id))
      || ['bed', 'bookshelf', 'computer', 'phone', 'map_table'].includes(name);
  }

  /** Right-click with the bow or rifle in hand. True if it was handled. */
  private aim(): boolean {
    const held = this.hotbar.current?.id;
    if (held === undefined || this.usableTarget()) return false;
    if (held === itemId('compound_bow')) {
      if (this.hotbar.count(itemId('arrow')) === 0) { this.hud.toast('No arrows'); return true; }
      this.drawing = this.playTime;
      this.sound.bowDraw();
      return true;
    }
    if (held === itemId('pistol')) {
      if (this.playTime - this.lastShot < PISTOL.cooldown) return true;
      if (!this.hotbar.remove(itemId('pistol_rounds'), 1)) { this.hud.toast('No pistol rounds'); return true; }
      this.lastShot = this.playTime;
      this.shotFired = true;
      this.sound.pistol();
      this.shake = Math.max(this.shake, 0.15);
      const hit = this.creatureInSight(PISTOL.range);
      if (hit && hit.c.kind !== 'marco') this.damageCreature(hit.c, PISTOL.damage);
      this.edited();
      return true;
    }
    if (held === itemId('hunting_rifle')) {
      if (this.playTime - this.lastShot < RIFLE_COOLDOWN) return true;
      if (!this.hotbar.remove(itemId('rifle_rounds'), 1)) { this.hud.toast('No rifle rounds'); return true; }
      this.lastShot = this.playTime;
      this.shotFired = true;
      this.sound.rifle();
      this.shake = Math.max(this.shake, 0.25);
      const hit = this.creatureInSight(RIFLE_RANGE);
      if (hit && hit.c.kind !== 'marco') this.damageCreature(hit.c, RIFLE_DAMAGE);
      this.edited();
      return true;
    }
    return false;
  }

  /** A right-click on a creature that can be used: Marco to talk and trade, a chicken to catch. */
  private useCreature(): boolean {
    const hit = this.creatureInSight(4);
    if (!hit) return false;
    if (hit.c.kind === 'marco') { this.talkToMarco(); return true; }
    if (hit.c.kind === 'chicken' && hit.dist <= CATCH_REACH) {
      const r = catchChicken(this.hotbar, hit.c);
      if (r === 'full') { this.hud.toast('No room in your pack for the chicken'); return true; }
      this.wild.remove(hit.c);
      this.wild.flockLeft = Math.max(0, this.wild.flockLeft - 1);
      this.sound.cluck(hit.c.x, hit.c.y + 0.3, hit.c.z);
      const n = this.hotbar.count(itemId('live_chicken'));
      this.hud.toast(n >= 2 ? `${n} live chickens: a pair for a coop. Build one at the workbench.` : 'A live chicken! Catch another: a pair lays eggs in a coop.');
      this.edited();
      return true;
    }
    return false;
  }

  /** Letting go of the right button: loose the arrow, if the bow was drawn far enough. */
  private loose(): void {
    if (this.drawing === null) return;
    const draw = drawOf(this.playTime - this.drawing);
    this.drawing = null;
    if (this.hotbar.current?.id !== itemId('compound_bow') || draw < BOW_MIN_DRAW) return;
    if (!this.hotbar.remove(itemId('arrow'), 1)) return;
    const p = this.player;
    const [dx, dy, dz] = p.lookDir();
    this.wild.shoot(p.x + dx * 0.4, p.eyeY - 0.1 + dy * 0.4, p.z + dz * 0.4, dx, dy, dz, draw);
    this.sound.bowRelease();
    this.edited();
  }

  // ---- Survival ------------------------------------------------------------------------------

  private tickSurvival(dt: number, input: Input): void {
    const p = this.player, v = this.vitals;
    p.speed = this.playTime < this.coffeeUntil ? 1.15 : 1;
    const fall = p.landedFall;
    p.landedFall = 0;
    if (this.hotbar.creative || p.flying) return;
    const moving = input.forward !== 0 || input.strafe !== 0;
    const exertion = p.inWater ? 1.5 : input.sprint && moving ? 1.8 : 1;
    const before = v.hp;
    tickVitals(v, dt, exertion, p.headInWater && p.breath <= 0);
    const hurt = fallDamage(fall);
    if (hurt) { v.hp = Math.max(0, v.hp - hurt); this.sound.footstep('stone'); }
    if (v.hp < before - 0.5 || hurt) this.hud.flashHurt();
    if (v.hp <= 0) this.die();
  }

  /**
   * Death. In the valley you wake with everything. Outside, what you carried stays in a lost pack
   * where you fell, and you wake with nothing.
   */
  private die(): void {
    const p = this.player;
    this.drawing = null;
    this.fishing = null;
    this.mining.active = false;
    if (!losesPack(p.x, p.z)) { this.wakeAgain('You wake, aching, back at the cave. The valley keeps you.'); return; }
    diedOutside(this.flags);
    const at = leaveLostPack(this.world, this.hotbar, p.x, p.y + 0.2, p.z);
    if (at) this.streamer.markUrgentAround(at[0], at[1], at[2]);
    this.wakeAgain(at ? 'You wake at the cave with nothing. Your pack lies where you fell: go back for it.' : 'You wake, aching, back at the cave.');
  }

  /** You wake where you last slept (or on the balcony). */
  private wakeAgain(line: string): void {
    const s = this.spawn;
    this.player.setPosition(s.x, s.y, s.z);
    this.player.yaw = s.yaw;
    this.player.pitch = 0;
    this.player.breath = 20;
    this.vitals = { hp: 100, hunger: Math.max(this.vitals.hunger, 50), thirst: Math.max(this.vitals.thirst, 50) };
    this.hud.toast(line, 6000);
    this.edited();
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
      // The valley's falls, and the canyon's (the stronger spring, a little louder); each is muffled
      // by the ridge when heard from the other side of it.
      falls: SPRINGS.map((f) => ({ pos: [f.x + f.dir, (VALLEY.water + f.top) / 2, (f.z0 + f.z1) / 2] as [number, number, number], loudness: fallsLoudness(f, p.x, p.z, valley) })),
    });
  }

  // ---- Life in the air ----------------------------------------------------------------------

  private sprayDebt = SPRINGS.map(() => 0);

  private emitParticles(dt: number): void {
    const p = this.player, parts = this.renderer.particles;
    // Spray where each waterfall meets its pool, while the player is near enough to see it.
    for (let k = 0; k < SPRINGS.length; k++) {
      const f = SPRINGS[k];
      if (Math.hypot(p.x - f.x, p.z - (f.z0 + f.z1) / 2) > 170) continue;
      this.sprayDebt[k] += dt * (f === CANYON_FALLS ? 55 : 45);
      const n = Math.floor(this.sprayDebt[k]);
      this.sprayDebt[k] -= n;
      // From just in front of the rock out past the curtain, on the side the water falls into.
      const a = f.x + f.dir * 0.5, b = f.x + f.dir * 3;
      if (n) parts.spray(Math.min(a, b), Math.max(a, b), f.z0, f.z1, VALLEY.water + 0.9, n);
    }
    // Fireflies over the valley floor from dusk into the night.
    const h = this.hour;
    const dusk = Math.min(1, Math.max(0, (h - 18.3) / 0.8)) * (h < 23.5 ? 1 : 0) + (h < 4.5 ? 0.5 : 0);
    const want = Math.round(70 * dusk);
    if (inValleyBowl(p.x, p.z) && parts.fireflies() < want) {
      const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 30;
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      if (inValleyBowl(x, z)) parts.firefly(x, valleyFloorHeight(x, z) + 0.6 + Math.random() * 2.8, z); // over the valley floor, not the rock of the home
    }
    // Blue morphos gather round the morpho tree in daylight.
    const m = PLACES.morphoTree;
    const daytime = h > 7.5 && h < 17;
    if (daytime && Math.hypot(p.x - m.x, p.z - m.z) < 90 && parts.morphos() < 14) parts.morpho(m.x + 1, outsideHeight(m.x, m.z) + 1, m.z + 1);
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
    if (r.full) this.hud.toast('Your pack is full');
    if (r.keepsItems) this.hud.toast('Empty the chest before taking it apart');
    if (r.changed) this.edited();
  }

  private placeBlock(): void {
    if (!this.target) { this.useHeldItem(); return; }
    // Using what is in front comes first: a chest opens.
    let t = this.target;
    // The scout lies across two blocks: his legs open his pockets too.
    if (blockName(t.id).startsWith('scout_legs') && this.world.containerAt(t.x - 1, t.y, t.z)) t = { ...t, x: t.x - 1, id: this.world.blockAt(t.x - 1, t.y, t.z) };
    const chest = this.world.containerAt(t.x, t.y, t.z);
    if (chest && blockName(t.id).startsWith('wall_safe') && !this.flags.has('safe_open')) {
      this.openPaper(() => this.paper.keypad('Wall safe', (code) => {
        if (code !== '0618') return false;
        this.flags.add('safe_open');
        this.edited();
        this.closePaper();
        this.hud.toast('The safe clicks open');
        return true;
      }));
      return;
    }
    if (chest && t.x === SCOUT_AT[0] && t.y === SCOUT_AT[1] && t.z === SCOUT_AT[2] && !this.flags.has('scout_searched')) {
      this.flags.add('scout_searched');
      this.hud.toast('Shot from the front, a day or two ago. A raider scout, walking out toward the saddle. Someone out here shoots back. (In your notes: the journal.)', 9000);
      this.edited();
    }
    if (chest) { this.openScreen({ title: homeChestAt(t.x, t.y, t.z)?.title ?? (BLOCK_DEFS[t.id]?.label || 'Chest'), slots: chest }); return; }
    if (this.useFurniture(t.x, t.y, t.z, t.id)) return;
    const snare = emptySnare(this.world, this.hotbar, t.x, t.y, t.z);
    if (snare === 'full') { this.hud.toast('No room in your pack for the rabbit'); return; }
    if (snare) {
      this.streamer.markUrgentAround(t.x, t.y, t.z);
      this.sound.place('leaves');
      this.hud.toast('A live rabbit. Take it home to a hutch: two or more breed.');
      this.edited();
      return;
    }
    if (t.id === GATE_LEVER) {
      if (this.gate.pull() === 'grind') { this.sound.gate(); this.shake = 2; }
      return;
    }
    const door = toggleDoor(this.world, t.x, t.y, t.z, (x, y, z) => this.player.intersectsBlock(x, y, z));
    if (door === 'blocked') { this.hud.toast('Step out of the doorway first'); return; }
    if (door) { this.sound.place('stone'); this.edited(); return; }
    const station = stationOf(t.id);
    if (station) { this.openScreen(null, station); return; }
    // The garden: pick ripe coffee, till with a hoe, sow seeds on farmland.
    const picked = pickCoffee(this.world, this.hotbar, t.x, t.y, t.z);
    if (picked === 'full') { this.hud.toast('No room in your pack for the beans'); return; }
    if (picked) { this.sound.place('leaves'); this.edited(); return; }
    const held = this.hotbar.current;
    if (held && held.id === itemId('steel_hoe') && till(this.world, t.x, t.y, t.z)) { this.hotbar.wearTool(); this.sound.dig('soil'); this.edited(); return; }
    if (t.id === FARMLAND && t.ny === 1 && sow(this.world, this.hotbar, t.x, t.y, t.z)) { this.sound.place('soil'); this.edited(); return; }
    if (this.useHeldItem()) return;
    const [x, y, z] = placeTarget(this.target);
    this.streamer.markUrgentAround(x, y, z);
    const id = this.hotbar.current?.id ?? 0;
    if (placeBlock(this.world, this.hotbar, this.player, this.target)) {
      this.edited();
      this.sound.place(materialOf(id));
      if (id === COOP) this.hud.toast('A coop. Put two chickens in it (right-click): they lay eggs every morning.', 6000);
    }
  }

  /** The builder's things: bed, bookshelves, computer, phone, map table. True if one was used. */
  private useFurniture(x: number, y: number, z: number, id: number): boolean {
    const name = BLOCK_DEFS[id]?.base ?? blockName(id);
    if (name === 'bed') {
      if (this.hour < 17 && this.hour >= 6) { this.hud.toast('You can sleep from five in the evening'); return true; }
      // A night's sleep (up to thirteen hours) moves the garden on as if those hours had passed.
      const hours = (6 - this.hour + 24) % 24;
      growWhileAway(this.world, this.player.x, this.player.z, hours, Math.random);
      this.hour = 6;
      this.spawn = { x: this.player.x, y: this.player.y, z: this.player.z, yaw: this.player.yaw };
      this.vitals.hp = Math.min(100, this.vitals.hp + 30);
      this.vitals.hunger = Math.max(0, this.vitals.hunger - 10);
      this.vitals.thirst = Math.max(0, this.vitals.thirst - 10);
      this.edited();
      this.hud.toast('You sleep, and wake to mist on the valley. You will wake here from now on.', 4500);
      void this.save(false);
      return true;
    }
    if (name === 'bookshelf') { this.openJournal(); return true; }
    if (name === 'computer') {
      const cold = this.hotbar.count(itemId('hardware_wallet')) > 0;
      const m1 = this.flags.has('m1_done');
      this.openPaper(() => this.paper.computer([
        ['Hot wallet (phone)', btc(this.wallet), 'btc'],
        ['Cold wallet', cold ? '2.50000000 BTC (connected, kept cold)' : 'not connected', cold ? 'btc' : 'dim'],
        ['Mining', 'no rig: needs a solar array and battery bank', 'dim'],
        ['Satellite uplink', 'no antenna', 'dim'],
        ['M1 · the first outside run', m1 ? 'done ✓' : `${M1_STEPS.filter((st) => this.flags.has(st.flag)).length} of ${M1_STEPS.length}`, m1 ? 'btc' : ''],
        ...M1_STEPS.map((st) => [`   ${this.flags.has(st.flag) ? '✓' : '·'} ${st.label}`, '', this.flags.has(st.flag) ? '' : 'dim'] as [string, string, string]),
        ['Last note', '“Back before the rains.”'],
      ], 'R.’s terminal'));
      return true;
    }
    if (name === 'phone') { this.openPhone(); return true; }
    if (name === 'map_table') {
      const marks = { route: this.flags.has('extracted'), shelter: this.flags.has('shelter_found'), scout: this.flags.has('scout_searched'), farm: this.flags.has('farm_seen') };
      this.openPaper(() => this.paper.map(drawMap(this.explored, this.player.x, this.player.z, marks), marks.route ? 'The builder’s map · the road home is marked' : 'The builder’s map · filled in where you have been'));
      return true;
    }
    return false;
  }

  /** The builder's journal, and after it the player's own notes as they are earned. */
  private openJournal(): void {
    const notes = journalData.notes.filter((n) => this.flags.has(n.flag)).map((n) => ({ title: n.title, text: n.text, by: 'Your notes' }));
    const all = [...journalData.entries, ...notes];
    this.openPaper(() => this.paper.journal(all, notes.length ? all.length - 1 : 0)); // at your newest note
  }

  /** The builder's phone: his dead contacts, and Marco once his number has been found at the shelter. */
  private openPhone(): void {
    const rows: { name: string; status: string; cls?: string; call?: () => string }[] = [];
    if (this.flags.has('shelter_found')) {
      rows.push({
        name: MARCO.contact, status: this.flags.has('marco_trust1') ? 'trust 1' : 'new', cls: 'btc',
        call: () => {
          const night = this.hour < MARCO_HOURS[0] || this.hour >= MARCO_HOURS[1];
          const waiting = this.flags.has('marco_meeting');
          this.flags.add('marco_meeting');
          this.flags.delete('marco_seen');
          this.edited();
          return waiting ? MARCO.callWaiting : night ? MARCO.callNight : MARCO.callDay;
        },
      });
    }
    rows.push({ name: 'Mamá', status: 'no answer', cls: 'dim' }, { name: 'Lucía', status: 'no answer', cls: 'dim' }, { name: 'Dr. Alvarez', status: 'no answer', cls: 'dim' }, { name: 'Raúl (pilot)', status: 'no answer', cls: 'dim' });
    rows.push({ name: 'Signal', status: 'satellite: weak' });
    if (this.flags.has('shelter_found')) rows.push({ name: 'Wallet', status: btc(this.wallet), cls: 'btc' });
    this.openPaper(() => this.paper.phone('Satellite phone · the builder’s contacts', rows));
  }

  /** Talking to Marco: a line, then his trade. The first deal earns trust 1 (DESIGN.md M1). */
  private talkToMarco(): void {
    const first = !this.flags.has('marco_met');
    this.flags.add('marco_met');
    const say = first ? MARCO.first : MARCO.again[Math.floor(Math.random() * MARCO.again.length)];
    const dealt = () => {
      this.edited();
      if (!this.flags.has('marco_trust1')) { this.flags.add('marco_trust1'); return MARCO.trust; }
      return '';
    };
    const why = { funds: 'Not enough in your wallet.', room: 'No room in your pack.', none: 'You have none of that.' };
    this.openPaper(() => this.paper.trade(() => ({
      title: `${MARCO.name} · ${this.flags.has('marco_trust1') ? 'trust 1' : 'a stranger still'}`,
      say,
      wallet: btc(this.wallet),
      buy: CATALOG.map((lot) => ({
        icon: iconFor(lot.id), label: `${itemLabel(lot.id)} ×${lot.lot}`, price: btc(lot.sats), button: 'Buy',
        can: this.wallet >= lot.sats,
        act: () => {
          const r = buy(this.hotbar, this.wallet, lot);
          if (!r.ok) return why[r.why];
          this.wallet = r.wallet;
          return dealt() || `Bought ${itemLabel(lot.id)} ×${lot.lot}.`;
        },
      })),
      sell: sellable(this.hotbar).map((id) => ({
        icon: iconFor(id), label: `${itemLabel(id)} (you have ${this.hotbar.count(id)})`, price: btc(sellPrice(id)), button: 'Sell 1',
        can: true,
        act: () => {
          const r = sell(this.hotbar, this.wallet, id);
          if (!r.ok) return why[r.why];
          this.wallet = r.wallet;
          return dealt() || `Sold one ${itemLabel(id)}.`;
        },
      })),
    })));
  }

  /** Says something the first time only. */
  private once(flag: string, line: string, ms = 5000): void {
    if (this.flags.has(flag)) return;
    this.flags.add(flag);
    this.hud.toast(line, ms);
    this.edited();
  }

  /**
   * Once a second: a toast the first time each Zone-1 place is reached (saying what can be done there),
   * M1's steps, and Marco coming to the shelter by day once a meeting is arranged.
   */
  private tickPlaces(): void {
    const p = this.player, f = this.flags;
    const near = (x: number, z: number, r: number) => Math.hypot(p.x - x, p.z - z) < r;
    if (p.x < SADDLE.x + 2 && p.x > SADDLE.x - 20 && Math.abs(p.z - 1025) < 30)
      this.once('saddle_seen', 'The saddle. Below: a farm, a smoke column far off, the dark forest beyond. Past here is Zone 1: danger 2, and 3 at night.', 8000);
    const sh = ZONE1.shelter;
    if (near((sh.x0 + sh.x1) / 2, (sh.z0 + sh.z1) / 2, 8))
      this.once('shelter_found', `A bus shelter, its lantern lit. Scratched on the timetable: “${MARCO.scratched}”. His number is in your phone now: call him from the cave to meet here by day.`, 9000);
    if (near(SCOUT_AT[0] + 0.5, SCOUT_AT[2] + 0.5, 7) && !f.has('scout_searched')) this.once('scout_seen', 'A dead man on the road, shot. Right-click him to search his pockets.', 6000);
    const g = ZONE1.farmGate;
    if (near(g.x, g.z + 2, 9)) this.once('farm_seen', 'A farm track. On the board at the gate: FAMILIA ROJAS. Hens are clucking down there, and something growls in the house.', 7000);
    if (near(YARD[0], YARD[1], 16) && this.wild.creatures.some((c) => c.kind === 'chicken' && near(c.x, c.z, 14)))
      this.once('chickens_seen', 'Feral chickens. Walk up close and right-click to catch one. Two make a pair for a coop.', 7000);
    // M1.
    const gained = trackM1(f, p.x, p.z, this.hotbar.count(itemId('pistol')) > 0);
    if (gained.length) this.edited();
    if (gained.includes('m1_done')) this.hud.toast('M1 · the first outside run. You went out, and came home. (The road home is on the map table now.)', 9000);
    else if (gained.includes('extracted')) this.hud.toast('Home, from Zone 1, alive. The way back is on the builder’s map now.', 6000);
    // Marco: at the shelter by day once a meeting is arranged; gone again once you have dealt and left.
    const marco = this.wild.creatures.find((c) => c.kind === 'marco');
    const day = this.hour >= MARCO_HOURS[0] && this.hour < MARCO_HOURS[1];
    const dist = Math.hypot(p.x - MARCO_SPOT[0], p.z - MARCO_SPOT[2]);
    // The meeting is over once you have been to him and walked away (60 m), dealt or not.
    if (f.has('marco_meeting') && f.has('marco_seen') && dist > 60) { f.delete('marco_meeting'); f.delete('marco_seen'); this.edited(); }
    const here = f.has('marco_meeting') && day;
    if (here && !marco && dist < 120 && this.world.column(Math.floor(MARCO_SPOT[0] / CS), Math.floor(MARCO_SPOT[2] / CS))) {
      const m = makeCreature('marco', MARCO_SPOT[0], MARCO_SPOT[1], MARCO_SPOT[2]);
      m.yaw = Math.PI; // facing the road
      this.wild.add(m);
    } else if (!here && marco) this.wild.remove(marco);
    if (here && marco && dist < 9 && !this.marcoGreeted) {
      this.marcoGreeted = true;
      f.add('marco_seen');
      this.edited();
      this.sound.whistle(marco.x, marco.y + 1.6, marco.z);
      this.hud.toast('Marco is here, under the shelter. Right-click him to talk and trade.', 6000);
    }
    if (dist > 30) this.marcoGreeted = false;
  }
  private marcoGreeted = false;

  private openPaper(show: () => void): void {
    this.mining.active = false;
    this.drawing = null;
    this.keys.clear();
    show();
    this.hud.showWorldHud(false);
    this.look.release();
  }

  private closePaper(): void {
    this.paper.close();
    this.hud.showWorldHud(true);
    if (this.playing) this.look.engage();
  }

  /** Right-click with an item in hand: returns true if the item did something. */
  private useHeldItem(): boolean {
    const held = this.hotbar.current;
    // Water within reach: drink from it with an empty hand, or fill an empty jug.
    const p = this.player;
    const [dx, dy, dz] = p.lookDir();
    const wet = raycast((x, y, z) => this.world.blockAt(x, y, z), p.x, p.eyeY, p.z, dx, dy, dz, REACH, true);
    const water = wet && (wet.id === WATER || wet.id === FALLING_WATER) && (!this.target || wet.dist <= this.target.dist);
    if (water && !held) {
      if (consume(this.vitals, { thirst: 25 })) { this.sound.splash(); this.hud.toast('Cold, clear water'); }
      else this.hud.toast('You are not thirsty');
      return true;
    }
    if (water && held && held.id === itemId('empty_jug')) {
      this.hotbar.take();
      if (this.hotbar.add(itemId('water_jug')) > 0) this.hotbar.add(itemId('empty_jug'));
      this.sound.splash();
      this.edited();
      return true;
    }
    // Fishing: cast into water; when a fish bites, right-click again to land it.
    if (held && held.id === itemId('fishing_rod')) {
      if (this.fishing) {
        const f = this.fishing;
        if (this.playTime >= f.biteAt && this.playTime <= f.biteEnd) {
          if (this.hotbar.add(itemId('trout_raw')) > 0) this.hud.toast('No room in your pack: the trout slips back into the water');
          else this.hud.toast('A rainbow trout!');
          this.sound.splash();
          this.edited();
        } else this.hud.toast(this.playTime < f.biteAt ? 'You reel in. Nothing yet.' : 'It got away.');
        this.fishing = null;
        return true;
      }
      if (wet && (wet.id === WATER)) {
        const wait = 4 + Math.random() * 6;
        this.fishing = { at: [wet.x + 0.5, wet.y + 0.9, wet.z + 0.5], biteAt: this.playTime + wait, biteEnd: this.playTime + wait + 2.5 };
        this.sound.splash();
        return true;
      }
    }
    if (!held) return false;
    if (held.id === itemId('builders_journal')) { this.openJournal(); return true; }
    if (held.id === itemId('map_scrap')) {
      this.openPaper(() => this.paper.map(drawMapScrap(), 'The scout’s map scrap · a ridge, a bend in a road, an arrow, and “Las Cruces” in pencil'));
      return true;
    }
    if (held.id === itemId('armband')) { this.hud.toast('A red armband, a white broken circle stitched on it. Whoever sent him wears the same.', 5000); return true; }
    const food = foodOf(held.id);
    const heal = held.id === itemId('first_aid_kit') ? 60 : held.id === itemId('bandage') ? 15 : held.id === itemId('poultice') ? 25 : 0;
    if (food || heal) {
      if (!consume(this.vitals, food ?? {}, heal)) { this.hud.toast(heal ? 'You are not hurt' : 'You are full'); return true; }
      this.hotbar.take();
      if (held.id === itemId('water_jug')) this.hotbar.add(itemId('empty_jug'));
      if (held.id === itemId('coffee')) { this.coffeeUntil = this.playTime + 90; this.hud.toast('Coffee on the balcony: a spring in your step'); }
      this.edited();
      return true;
    }
    if (held.id === itemId('backpack_upgrade')) {
      this.hotbar.take();
      this.hotbar.grow(BACKPACK_SLOTS);
      this.hud.toast('The expedition backpack: nine more slots');
      this.edited();
      return true;
    }
    return false;
  }

  private openScreen(chest: { title: string; slots: (import('./sim/inventory.ts').Stack | null)[] } | null, station: Station = 'hand'): void {
    this.mining.active = false;
    this.drawing = null; // a bow drawn when a screen opens is let down, not loosed
    this.keys.clear();
    this.screen.open(this.hotbar, chest, station);
    this.hud.showWorldHud(false);
    this.look.release();
  }

  private closeScreen(): void {
    if (!this.screen.close()) { this.hud.toast('No room to put that down: make space first'); return; }
    this.hud.showWorldHud(true);
    this.edited();
    if (this.playing) this.look.engage();
  }

  // ---- Input ---------------------------------------------------------------------------------

  private bindInput(canvas: HTMLCanvasElement): void {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'F3'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if (this.screen.isOpen) {
        if (e.code === 'Escape' || e.code === 'KeyE') this.closeScreen();
        return;
      }
      if (this.paper.isOpen) {
        if (e.code === 'Escape' || e.code === 'KeyE') this.closePaper();
        return;
      }
      if (e.code === 'Escape' && this.playing) this.pause();
      if (e.code === 'KeyE' && this.playing) { this.openScreen(null); return; }
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
    window.addEventListener('blur', () => { this.keys.clear(); this.mining.active = false; this.drawing = null; });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.playing) return;
      if (this.look.mode === 'off') { this.look.engage(); return; }
      if (e.button === 0 && !this.strike()) { this.mining.active = true; this.mining.progress = 0; }
      if (e.button === 2 && !this.useCreature() && !this.aim()) this.placeBlock();
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mining.active = false;
      if (e.button === 2) this.loose();
    });
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
    this.drawing = null;
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

  /** The pack as it should be saved: with anything held on a screen's cursor put back in it. */
  private carried(): Inventory {
    const held = this.screen.held;
    if (!held) return this.hotbar;
    const inv = this.hotbar.clone();
    const left = inv.stow({ ...held });
    if (left) { inv.grow(inv.size + 1); inv.stow(left); } // no room: one extra slot rather than lose it
    return inv;
  }

  snapshot(): SaveData {
    const p = this.player;
    const { palette, edits } = collectEdits(this.world);
    return {
      format: SAVE_FORMAT, version: SAVE_VERSION, savedAt: new Date().toISOString(), hour: this.hour,
      player: { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, flying: p.flying },
      hotbar: this.carried().toSave(), selected: this.hotbar.selected, palette, edits,
      containers: collectContainers(this.world),
      vitals: { ...this.vitals }, spawn: { ...this.spawn },
      flags: [...this.flags], explored: [...this.explored.keys()].filter((i) => this.explored[i]),
      wallet: this.wallet, den: this.wild.denLeft, flock: this.wild.flockLeft,
    };
  }

  applySave(d: SaveData): void {
    restoreEdits(this.world, d);
    restoreContainers(this.world, d);
    // A save made in the old tunnel or air pocket (now rock) wakes afloat by the valley mouth instead.
    const at = rescueFromOldTunnel(d.player.x, d.player.y, d.player.z) ?? [d.player.x, d.player.y, d.player.z];
    this.player.setPosition(at[0], at[1], at[2]);
    this.player.yaw = d.player.yaw;
    this.player.pitch = d.player.pitch;
    this.player.flying = d.player.flying;
    this.hour = d.hour;
    this.dayClock = d.hour;
    this.hotbar = Inventory.fromSave(d.hotbar, d.selected);
    this.vitals = d.vitals ? { ...d.vitals } : freshVitals();
    this.flags = new Set(d.flags ?? []);
    this.wallet = d.wallet ?? START_WALLET;
    this.wild.denLeft = d.den ?? 3;
    this.wild.flockLeft = d.flock ?? FLOCK_SIZE;
    this.explored = new Uint8Array(64 * 64);
    for (const i of d.explored ?? []) this.explored[i] = 1;
    this.spawn = d.spawn ? { ...d.spawn } : { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z, yaw: SPAWN.yaw };
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
    this.world.containers.clear();
    this.mining.active = false;
    this.gate = new Gate();
    this.wild.clear();
    if (d) this.applySave(d);
    else {
      this.hotbar = Inventory.starter();
      this.vitals = freshVitals();
      this.spawn = { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z, yaw: SPAWN.yaw };
      this.flags = new Set();
      this.wallet = START_WALLET;
      this.wild.denLeft = 3;
      this.wild.flockLeft = FLOCK_SIZE;
      this.explored = new Uint8Array(64 * 64);
      this.hour = 16.5;
      this.dayClock = 16.5;
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

  /** For tests and screenshots: puts a creature on the ground at (x, z). Never inside the valley. */
  spawnCreature(kind: Kind, x: number, z: number): Creature | null {
    const y = groundAt(x, z, (bx, by, bz) => this.world.blockAt(bx, by, bz));
    if (y === null) return null;
    const c = makeCreature(kind, x, y, z);
    return this.wild.add(c) ? c : null;
  }

  setCamera(x: number, y: number, z: number, yaw: number, pitch: number): void {
    this.player.setPosition(x, y - EYE, z);
    this.player.yaw = yaw;
    this.player.pitch = pitch;
    this.player.flying = true;
  }
}
