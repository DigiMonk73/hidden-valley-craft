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
import { Inventory, type Stack } from './sim/inventory.ts';
import { mineSeconds, toolFor, toolOf } from './world/items.ts';
import { breakBlock, placeBlock, placeTarget, toggleDoor } from './sim/interact.ts';
import { stationAt, type Station } from './sim/crafting.ts';
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
import { openStore, pendingFor, type Store, type PendingIo } from './platform/storage.ts';
import { tabLock } from './platform/tablock.ts';
import { downloadFile, saveToCode, codeToSave, pickFile, fileToSave, inFrame, claudeDownloads, type Downloads } from './platform/fileio.ts';
import { shouldAutosave } from './save/schedule.ts';
import { collectContainers, restoreContainers, collectEdits, restoreEdits, encodeSave, parseSave, fromEarlierLayout, SAVE_FORMAT, SAVE_VERSION, WORLD_LAYOUT, type SaveData, type Slot, type Mode } from './save/save.ts';
import { newSave, normaliseSave, START, BEGUN } from './save/state.ts';
import { Keeper, NOTES, SAVE_KEY } from './save/keeper.ts';
import { OPENING, HINTS, nextGoal } from './sim/guide.ts';
import { isBow, isBlade, isWeapon, gunOf } from './sim/weapons.ts';
import { MARCO, DOC, RAY, MARCO_HOURS, greetMarco, marcoTrade, greetDoc, docServices, greetRay, rayCatalog } from './game/people.ts';
import { computerRows } from './game/computer.ts';
import { HOME_FIT } from './gen/home.ts';
import { HOME, HOME_GROUNDS, WATERFALL, CANYON_FALLS, SPRINGS, VALLEY, POOL, GATE, PLACES, riverCurrent, fallsLoudness, rescueFromOldTunnel, zoneAt, inValleyBowl, ZONE_DANGER, inSanctuary, valleyFloorHeight, outsideHeight, creekDistance } from './gen/layout.ts';
import { CS, WORLD_Y } from './world/constants.ts';
import { packPos, skyOf } from './world/light.ts';
import { Wild, armourFactor, type WildEvents } from './entity/wild.ts';
import { makeCreature, hurt as hurtCreature, rayHitCreature, type Creature, type Kind } from './entity/creatures.ts';
import { leaveLostPack, losesPack } from './sim/death.ts';
import { emptySnare, breedHutches, newDay, SNARE_CAUGHT } from './sim/rabbits.ts';
import { meleeDamage, takeDrops, drawOf, clearShot, MELEE_COOLDOWN, MELEE_REACH, RIFLE_COOLDOWN, RIFLE_DAMAGE, RIFLE_RANGE, BOW_MIN_DRAW } from './sim/hunting.ts';
import { groundAt, FLOCK_SIZE } from './entity/spawner.ts';
import { ZONE1, SADDLE } from './gen/layout.ts';
import { SCOUT_AT, MARCO_SPOT, YARD, DEN } from './gen/zone1.ts';
import { START_WALLET, btc } from './sim/trade.ts';
import { trackM1, diedOutside, notWalkedHome } from './sim/milestones.ts';
import { catchChicken, layEggs, hatchEggs, syncTameHens, takeHen, COOP, CATCH_REACH } from './sim/livestock.ts';
import { drawMapScrap } from './ui/mapView.ts';
import { RAIDER_KINDS, FACTION_KINDS, isMan } from './entity/creatures.ts';
import { factionDawn } from './entity/faction.ts';
import { alertOutpost, silentTakedown, RAIDER_BIT, ALL_RAIDERS, outpostFromSave } from './entity/outpost.ts';
import { makeJaguar, atCampClearing } from './entity/jaguar.ts';
import { Focus } from './sim/focus.ts';
import { HomeKey } from './sim/home.ts';
import { ZONE1FAR, ZONES } from './gen/layout.ts';
import { OUTPOST_AT, CAMP_MARKER, DECK_END, RUSTED_TRAP } from './gen/zone1far.ts';
import { trackM2 } from './sim/milestones.ts';
import { smokeMeat, cureJerky, newWatch, learnLeghold, LEGHOLD_LESSON, LEGHOLD } from './sim/preserve.ts';
import { pickApple, isFarmland, sows, cropOf, NEW_CROPS } from './sim/farming.ts';
import { itemName } from './world/items.ts';
import { blockId } from './world/blocks.ts';
import { ZONE2 } from './gen/layout.ts';
import { trackM3, diedOutsideM3 } from './sim/milestones.ts';
import { sunlit, findDevices, newPower, stepPower, powerFromSave, RIG_THS, BANK_KWH, type Devices, type PowerState } from './sim/power.ts';
import { stepDose, healthCap, clickRate, nearHotspot } from './sim/radiation.ts';
import { ZONE3, onDamCrest, onDamRoad, ravineX, highwayX } from './gen/layout.ts';
import { trackM4, diedOutsideM4 } from './sim/milestones.ts';
import { turning, liveFromSave, HYDRO_KW, chillJugs } from './sim/power.ts';
import { wakeFrom, settleWake } from './sim/wake.ts';
import { ashenOn, ashenDawn, ALL_ASHEN } from './entity/ashen.ts';
import { isWaterId } from './world/blocks.ts';
import { quetzalTree } from './gen/terrain.ts';
import { rainAt } from './render/rain.ts';
// Zone-4 and the uplink (docs/PHASE8.md).
import { absorb, doseRate, meterLine, roadDose } from './sim/radiation.ts';
import { isMedicine, useMedicine, medicineIdle, blowFelt, stepAdrenaline } from './sim/medicine.ts';
import { ridgePlaceAt, ridgeToast, rayWaiting, canAskMeeting, gateRefuge, RAY_SPOT, RAY_FROM, RAY_UNTIL } from './sim/ridge.ts';
import { trackM5, craftedFlag, diedOutsideM5 } from './sim/m5.ts';
import { startDevice, stepDevices, smokeOf, devicesFromSave, LURE_HEARD, type Device } from './sim/countermeasures.ts';
import { scopeTargets, aimedAt, scopeLabel, satTrain, SCOPE_ZOOM, SCOPE_NEAR } from './sim/telescope.ts';
import { hoursToDusk, MIRA, type LinkNeeds } from './sim/uplink.ts';
import { uplinkView, findPlaced } from './game/uplink.ts';
import { askRayToMeet, meetRay } from './game/people.ts';
import { ScopeView } from './ui/scopeView.ts';
import { antennaBlocks, antennaSpot } from './gen/antenna.ts';
import { HUT_LOG, DOME_PAGE, RELAY_PAGE } from './gen/zone4.ts';
import { ZONE4, ridgeRoadAt, ridgeRoadLength, ridgeRoadMark, inFallout } from './gen/layout.ts';
import { NESTS } from './entity/ashen.ts';
import { isPerson } from './entity/creatures.ts';

const KILL_LINE: Record<Creature['kind'], string> = {
  rabbit: 'A rabbit: meat and a small hide', deer: 'A deer: venison, a hide and bone', boar: 'A wild boar: pork, a hide and bone', puma: 'The puma is dead. Its pelt is yours',
  dog: 'The dog is dead: a hide and bone', coyote: 'A coyote: its hide', chicken: 'A chicken: meat and feathers', marco: '', ray: '',
  lookout: 'The lookout is down. His rifle and his rounds are yours.', gunman: 'The man with the pistol is down. His pistol and rounds are yours.',
  rusher: 'The man with the machete is down. His machete is yours.', jaguar: 'The jaguar is dead. Its pelt is yours.',
  patrol: 'The patrolman is down: a few rounds and casings. Las Cruces will send another at dawn.', sentry: 'The sentry is down. Another will walk his beat tomorrow.',
  guard: 'The guard is down: his rounds are yours. The tower will be manned again at dawn.',
  ashen: 'It is down. It carries nothing, and you don’t touch it. Others drift in by dawn.',
};
/** Right-click with one of M5's things in hand: what it is for (docs/PHASE8.md). */
const HELD_HINT: Record<string, string> = {
  hazard_suit: 'The hazard suit. It works from your pack: carry it and the ridge’s dose is cut to a fortieth.',
  sat_antenna: 'The satellite antenna, assembled. Take it to the builder’s hoist, in the balcony’s north corner, and right-click the hoist.',
  uplink_terminal: 'The uplink terminal. Right-click the builder’s computer with it to fit it.',
  sat_modem: 'The dam’s telemetry modem, with its keys. The uplink terminal is built round it, at the workbench.',
  antenna_section: 'A panel of the tower’s dish. Three, with steel and wiring, make the satellite antenna at the workbench.',
  rare_components: 'Rare components: an amplifier, a waveguide, an oscillator. The terminal, the medical bench and the uplink’s drawings use them.',
  telescope_optics: 'The observatory’s mirror, in its cell. The lathe makes a telescope round it.',
  thermal_optic: 'The thermal optic. Carried, it shows every warm body within sixty metres while you hold focus (Q), in any dark.',
  engineer_armor: 'Engineer’s armour. It works from your pack: about a third of a blow gets through.',
  spirit: 'Spirit, from the distiller. The medical bench makes medicines with it. Not for drinking.',
};
/** Said the first time each of M5's things is made. */
const MADE_LINE: Record<string, string> = {
  hazard_suit: 'A hazard suit. It works from your pack. Call Ray: he will meet someone who carries one.',
  sat_antenna: 'The satellite antenna, assembled. Take it to the builder’s hoist in the balcony’s north corner.',
  telescope: 'A telescope. Set it down under open sky at home: the balcony will do. The uplink needs it to find the satellites.',
  uplink_terminal: 'The uplink terminal. Right-click the builder’s computer with it in your hand.',
  med_bench: 'A medical bench. It works while a hydro generator turns: blue tablets, antibiotics, adrenaline. It needs spirit from a distiller.',
  distiller: 'A distiller. It works while a hydro generator turns: corn or potatoes, water and charcoal make spirit.',
  rad_tablets: 'Blue tablets of your own. Each binds thirty of your dose.',
  antibiotics: 'Antibiotics. One brings your health back to the most your dose allows, at once.',
  adrenaline: 'Adrenaline. For a minute blows hurt half as much and your focus is full. None of these cures what the Ashen have.',
  thermal_optic: 'The thermal optic. Carry it, and hold focus (Q) with a weapon in hand: they glow.',
  sonic_lure: 'Sonic lures. Set one down, right-click it, and walk the other way.',
  smoke_pot: 'Smoke pots. Set one down and right-click it: they will not come into its smoke.',
  engineer_armor: 'Engineer’s armour: about a third of a blow gets through. Carry it in your pack.',
};
/** How near a hunting Ashen keeps hold H from working (docs/PHASE7.md). */
const ASHEN_HOLDS_H = 30;
/** What a running Ashen kicks up. */
const ASH_DUST = blockId('pale_stain');
/** The least hunger and thirst you wake with after a death in the valley. */
export const WAKE_FLOOR = 15;
const SETTINGS_KEY = 'settings';
const REACH = 5;
const STEP = 1 / 60;
/** Said when the stored valley is from before the home was rebuilt (docs/HOME.md). */
export const EARLIER_BUILD = NOTES.earlier;
const SPAWN = START;
/** Said when the browser's main storage held the valley last time and could not be opened now. */
export const DEGRADED = 'This browser’s storage did not open just now, so your saved valley can’t be reached. Nothing has been lost: reload the page to try again. What you do meanwhile is kept apart and will not replace it.';
/** Said in a second tab while a first one has the valley open. */
export const SECOND_TAB = 'Hidden Valley is already open in another tab or window. Play there, or close it: this one will then open your valley.';
const stackSlot = (s: Stack): Slot => ({ name: itemName(s.id), count: s.count, ...(s.wear ? { wear: s.wear } : {}) });

export interface BootOptions {
  hour?: number;
  cam?: [number, number, number, number, number];
  renderChunks?: number;
  test?: boolean; // deterministic: frozen time, no saving, no waving
  handover?: unknown; // state passed from the previous version of an open page (checked before use)
  /** For tests: the storage to use, and where the close-time copy goes, instead of the browser's. */
  store?: Store;
  pending?: PendingIo;
  effects?: boolean; // particles in test mode
}

/** What can be sat on (docs/PHASE9A.md, 8), by a block's base name; and those that face one way, as their sitter does. */
export const SEATS: ReadonlySet<string> = new Set(['chair', 'dining_chair', 'desk_chair', 'patio_chair', 'armchair', 'sofa_end', 'sofa_end_r', 'sofa_mid', 'bench', 'window_seat', 'lounger_head', 'lounger_foot']);
const SEAT_FACES: ReadonlySet<string> = new Set(['chair', 'dining_chair', 'desk_chair', 'patio_chair', 'armchair', 'sofa_end', 'sofa_end_r', 'sofa_mid']);
/** A seat's height above its block's floor; and how far below a sitter's eye the body's feet are put (the eye is 1.62 above them: so the eye is 0.72 above the seat). */
const SEAT_HEIGHT = 0.45, SEATED_EYE = EYE - 0.72;

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
  /** What Marco has paid out since dawn: he carries only so much (docs/FIXES.md, 6). */
  marcoPaid = 0;
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
  /** Focus mode: the world slowed for a careful shot (docs/PHASE5.md). */
  focus = new Focus();
  /** Holding H to head home (the lead, 2026-11-18), and when the player was last hurt (play time). */
  home = new HomeKey();
  private lastHurt = -Infinity;
  /** (Read and set by Doc's cure, in src/game/people.ts.) */
  hpBefore = 100;
  /** Is the player sprinting this tick (a hen runs only from that)? */
  private sprinting = false;
  /** The deep band's stinger plays once a visit, when the body across the ravine comes into view. */
  private stingerVisit = false;
  /** A rifle shot this tick, for the creatures to hear; a suppressed one is heard only close by. */
  private shotFired = false;
  private quietShot = false;
  private lastBlow = -Infinity;
  private lastShot = -Infinity;
  /** When the bowstring was drawn (play time), or null. */
  private drawing: number | null = null;
  /** Power at home (docs/PHASE6.md): the banks' charge and the rig's earnings, and the devices found placed. */
  power: PowerState = newPower();
  devices: Devices = findDevices(new Map());
  /** The game hour power was last run to (null: not yet, so nothing is back-dated). */
  private powerHour: number | null = null;
  /** The radiation dose, 0–100 (docs/PHASE6.md, 3). */
  dose = 0;
  /** The meter's second line: the rate, the suit, the time to the limit (docs/PHASE8.md, 2). */
  private doseLine = { text: '', alarm: false };
  /** Days since this valley was begun, counted at each midnight: with the hour, the uplink's clock (docs/PHASE8.md, 6). */
  day = 0;
  /** When the uplink last sent a drawing, on its clock (hours); null: never. */
  lastPull: number | null = null;
  /** Sonic lures wailing and smoke pots burning now (docs/PHASE8.md, 4). */
  running: Device[] = [];
  /** Seconds of adrenaline still in the blood. */
  adrenaline = 0;
  /**
   * Sitting (docs/PHASE9A.md, 8): the seat's block, and where the player stood before sitting down (they stand up
   * there). While seated the body does not move; a step, a jump or a blow stands it up.
   */
  private seat: { x: number; y: number; z: number; from: [number, number, number] } | null = null;
  /** Looking through a telescope: where it stands (docs/PHASE8.md, 5). */
  private scoping: { x: number; y: number; z: number } | null = null;
  private scope: ScopeView | null = null;
  /** A telescope stands under the sky at home (as last seen: the home's land may not be loaded). */
  private scopeOk = false;
  private rayGreeted = false;
  private ui: HTMLElement;
  private doseToasted = false;
  private wallToast = -Infinity;
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
  /** A line to show when play begins (said before Play, under the menu, it is easily missed). */
  private sayAtPlay: string | null = null;
  private ready = false;
  /** A save was just loaded: once its land is in, check the player isn't inside rock. */
  private checkBuried = false;
  /** A save has been applied (or a new valley begun): until then there is nothing to save or hand over. */
  private booted = false;
  /** Another tab has the valley open: this one neither plays nor saves until that one is gone. */
  private secondTab = false;
  private fromHandover = false;
  /** A line about the save the player must see (it could not be read, the storage did not open): in the menu, and said once when play begins. */
  private notice: string | null = null;
  private noticeSaid = false;
  /** What the pack could not hold when a save was made: put down in a sack once the land is in. */
  private spill: Stack[] = [];
  keeper!: Keeper;
  private landFailSaid = false;
  /** The opening has been shown for this valley (it is shown once, when play first begins in it). */
  private introShown = false;
  /**
   * How this valley is played (docs/FIXES.md, N2): chosen before play first begins in it, saved, and fixed after.
   * In Survival the keys for flying, endless blocks and the clock do nothing.
   */
  mode: Mode = 'survival';
  /** Has the game been played since the last save? Position, health and the hour are saved even with no edit. */
  private playedSince = false;
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
  private cachedCode: string | null = null;
  private sky: SkyState = skyAt(16.5);
  private downloads: Downloads | null = null;

  constructor(canvas: HTMLCanvasElement, ui: HTMLElement, opts: BootOptions) {
    this.opts = opts;
    this.ui = ui;
    this.player.flow = riverCurrent;
    this.wild.spawning = !opts.test;
    this.renderer = new Renderer(canvas);
    this.look = new Look(canvas);
    this.screen = new InventoryScreen(ui);
    this.paper = new PaperScreen(ui);
    this.screen.onChange = () => this.edited();
    this.screen.onMake = (r) => {
      this.sound.place('wood');
      // M2's workshop extension: the forge, made from the outpost's parts.
      if (r.out[0] === blockId('forge')) { this.flags.add('forge_made'); this.hud.toast('The forge, and a tool rack with it. Set the forge in the workshop: it gets more iron from scrap.', 7000); }
      // M3 (docs/PHASE6.md).
      if (r.out[0] === itemId('pistol_rounds') || r.out[0] === itemId('rifle_rounds')) { this.flags.add('ammo_made'); this.once('ammo_toast', 'Rounds of your own: powder, a cast bullet, a casing and a primer. The casings are finite: buy or find more.', 7000); }
      if (r.out[0] === blockId('solar_array')) this.once('array_toast', 'A solar array. Set it at home in the sun: the balcony, or the cliff above it. Two run a rig day and night once there is a battery bank.', 8000);
      // M4 (docs/PHASE7.md).
      if (r.out[0] === blockId('crucible_furnace')) this.once('furnace_toast', 'A crucible furnace. Set it by the smelter and right-click it: steel stock and coal make steel, or your own iron does.', 8000);
      if (r.out[0] === itemId('steel_ingot') && !this.flags.has('steel_made')) { this.flags.add('steel_made'); this.hud.toast('Steel, from your own furnace. The lathe needs four ingots, the hydro generator six.', 8000); }
      if (r.out[0] === blockId('lathe') && !this.flags.has('lathe_built')) { this.flags.add('lathe_built'); this.hud.toast('A lathe: workshop tier 2. Set it down and right-click it: gun mods, plate armour, tools.', 8000); }
      if (r.out[0] === itemId('pistol_suppressed') || r.out[0] === itemId('rifle_rebuilt')) {
        this.flags.add('gun_modded');
        this.hud.toast(r.out[0] === itemId('pistol_suppressed') ? 'The pistol, suppressed. Its shot is heard only a dozen metres off: by raiders, and by the Ashen.' : 'The rifle, rebuilt: a new barrel and a scope. It hits harder and reaches as far as the builder’s.', 8000);
      }
      if (r.out[0] === itemId('plate_armor')) { this.flags.add('armor2_made'); this.hud.toast('Plate armour: it stops half of every blow. Carry it in your pack.', 7000); }
      if (r.out[0] === blockId('hydro_generator')) this.once('hydro_toast', 'The hydro generator. Set it in the valley’s creek, at the water: it makes power day and night.', 9000);
      this.madePhase8(itemName(r.out[0]));
      if (r.out[0] === blockId('powder_mill')) this.once('mill_toast', 'A powder mill. Set it down and right-click it: saltpeter, charcoal and sulfur make gunpowder.', 7000);
    };
    this.screen.known = this.flags;
    this.screen.onFull = () => this.hud.toast('No room in your pack for that');
    this.hud = new Hud(ui, {
      play: () => this.resume(),
      saveNow: () => void this.save(true),
      downloadSave: () => void this.downloadSave(),
      saveCode: () => this.cachedCode,
      loadFile: () => void this.loadFromFile(),
      loadCode: (c) => void this.loadFromCode(c),
      newGame: () => void this.newGame(),
      openBackup: () => void this.openBackup(),
      pickMode: (m) => this.pickMode(m),
      setRenderDistance: (c) => this.setRenderDistance(c, true),
      setSensitivity: (v) => { this.look.sensitivity = 0.0022 * v; void this.saveSettings(); },
      setInvertY: (v) => { this.look.invertY = v; void this.saveSettings(); },
      setVolume: (v) => { this.sound.volume = v; void this.saveSettings(); },
      setEffects: (on) => { this.renderer.effects = on; void this.saveSettings(); },
    });
    this.look.onDelta = (dx, dy) => {
      // Through the telescope the hand is as much finer as the view is narrower.
      const fine = this.scoping ? 1 / SCOPE_ZOOM : 1;
      this.player.yaw -= dx * fine;
      this.player.pitch = Math.max(-1.55, Math.min(1.55, this.player.pitch - dy * fine));
    };
    this.look.onNotice = (t) => this.hud.toast(t);
    this.look.onModeChange = (m) => {
      if (m === 'off' && this.playing && !this.screen.isOpen && !this.paper.isOpen) this.pause();
      if (m === 'free') this.hud.toast('This page can’t capture the mouse here: move the mouse to look, or use the arrow keys.', 6000);
    };
    // The browser can take the picture away and give it back (docs/REVIEW.md, N8): wait on the menu meanwhile.
    this.renderer.onContextLost = () => {
      if (this.playing && !this.screen.isOpen && !this.paper.isOpen) this.pause();
      this.hud.notice('The picture was lost. It will come back in a moment…');
    };
    this.renderer.onContextRestored = () => this.hud.notice('The picture is back.', 4000);
    this.renderer.onContextStuck = () => this.hud.notice('The picture has not come back. Save from the menu, then reload the page.');
    const resize = () => this.renderer.resize(canvas.clientWidth, canvas.clientHeight);
    window.addEventListener('resize', resize);
    resize();
    this.bindInput(canvas);
  }

  async boot(): Promise<void> {
    this.store = this.opts.store ?? await openStore(() => this.hud.setLoadingText('Opening your save…'));
    this.hud.setLoadingText('Building the valley…');
    this.keeper = new Keeper(this.store, this.opts.pending ?? pendingFor(this.store.kind));
    await this.loadSettings();
    const workers = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
    this.exec = await createExecutor((j) => this.streamer.priority(j), workers);
    this.streamer = new Streamer(this.world, this.exec, this.renderer);
    this.streamer.onDrawnChange = (mask) => this.renderer.setDrawnColumns(mask);
    void this.exec.submit({ kind: 'far' }).then((r) => { if (r.kind === 'far') this.renderer.setFarLand(r.mesh); }, (e) => console.error('distant land failed', e));
    this.setRenderDistance(this.opts.renderChunks ?? Number(this.hud.settingsInputs.rd.value), false);

    // One tab plays a valley at a time.
    if (!this.opts.test && (await tabLock('hidden-valley-blocks:play', () => void this.otherTabClosed())) === 'taken') {
      this.secondTab = true;
      this.hud.setBlocked(SECOND_TAB);
    }
    await this.openValley();
    this.booted = true;
    // The address's hour and camera are for checks and pictures: the hour only for tests or a valley not yet begun
    // (on a begun one, "?hour=5.99" made every reload a new dawn), the camera only for tests (it flies).
    if (this.opts.hour !== undefined && (this.opts.test || !this.flags.has(BEGUN))) this.hour = this.opts.hour;
    this.dayClock = this.hour;
    if (this.opts.cam && this.opts.test) {
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

  /**
   * Opens what the browser holds: the stored save, the copy made as the page last closed, or the backup; else a new
   * valley. A hand-over from the page's previous version takes their place. Whatever is found, this ends with a
   * valley applied and a working menu: a save that cannot be used is kept aside and said, never thrown.
   */
  private async openValley(): Promise<void> {
    let opened: SaveData | null = null, unsaved = false;
    const stored: { id: string | null; seq: number } = { id: null, seq: 0 };
    this.notice = null;
    if (!this.opts.test) {
      try {
        const r = await this.keeper.load();
        opened = r.data; unsaved = r.unsaved; this.notice = r.note;
        stored.id = r.storedId; stored.seq = r.storedSeq;
      } catch (e) {
        console.error('the stored save could not be opened', e);
        this.notice = NOTES.fresh;
      }
    }
    let handed = this.opts.handover ? normaliseSave(this.opts.handover) : null;
    this.opts.handover = undefined;
    // Handed on by a page from before the home was rebuilt: not opened, like any save from that layout.
    if (handed && fromEarlierLayout(handed)) { handed = null; if (!opened && !this.notice) this.notice = EARLIER_BUILD; }
    // A hand-over takes the stored save's place only as the same valley, written no earlier than the store's copy
    // (or when the store holds nothing that can be read). Anything else is some other page's valley, or a stale one.
    const theirs = handed && (stored.id === null || (handed.id === stored.id && (handed.seq ?? 0) >= stored.seq));
    if (handed && theirs && !this.keeper.stopped && !this.store.degraded) { opened = handed; unsaved = true; this.fromHandover = true; }
    try {
      this.applySave(opened ?? newSave(), !opened);
    } catch (e) {
      // The check in normaliseSave should make this impossible; if a save still cannot be applied, it must not stop the game.
      console.error('the save could not be applied', e);
      if (!this.opts.test) await this.keeper.setAside(await this.store.get(SAVE_KEY));
      this.world.edits.clear();
      this.world.containers.clear();
      this.applySave(newSave(), true);
      this.notice = NOTES.fresh;
      unsaved = true;
    }
    if (this.store.degraded) this.notice = DEGRADED;
    if (unsaved) this.editCount++;
    this.savedCount = unsaved ? this.editCount - 1 : this.editCount;
    this.noticeSaid = false;
  }

  /** The tab that had the valley open has gone: this one opens it as that one left it. */
  private async otherTabClosed(): Promise<void> {
    if (!this.secondTab) return;
    while (!this.booted) await new Promise((r) => setTimeout(r, 50));
    this.secondTab = false;
    if (!this.fromHandover) {
      this.streamer.reset();
      this.world.edits.clear();
      this.world.containers.clear();
      await this.openValley();
      this.ready = false;
      this.hud.setLoading(0, 1);
      this.hud.setLoadingVisible();
    }
    this.hud.setBlocked(null);
    this.updateSaveStatus();
    void this.refreshCode();
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
        // A save from before the home was rebuilt may stand inside a wall or furniture; one from before the land
        // changed may stand inside rock. The first moves them to the cave, the second lifts them to the surface.
        const inHome = p.x >= HOME_GROUNDS.x0 && p.x < HOME_GROUNDS.x1 && p.z >= HOME_GROUNDS.z0 && p.z < HOME_GROUNDS.z1;
        // Out in the land the lift comes first (straight up to the surface); in the home there is a hill of rock
        // overhead, so the cave is the safe place, and it is the fallback anywhere the lift finds no room.
        if (this.checkBuried && !p.flying && !inHome && p.liftOut((x, y, z) => this.world.blockAt(x, y, z), WORLD_Y - 3)) this.hud.toast('The land here has changed since this save: you have been set down on the surface.', 7000);
        // And one from when the ridge stood higher hangs in the air: it is set down, unhurt (docs/PHASE8.md, 9).
        else if (this.checkBuried && !p.flying && !inHome && inFallout(p.x, p.z) && p.setDown((x, y, z) => this.world.blockAt(x, y, z))) this.hud.toast('The land here has changed since this save: you have been set down on the ground.', 7000);
        this.checkBuried = false;
        this.dropSpill();
        if (!this.opts.cam) this.settleIn();
        this.hud.setReady(false);
        if (this.opts.test) this.hud.showMenu(false);
      }
    }

    if (this.playing && !this.screen.isOpen && !this.paper.isOpen) {
      if (this.focus.active && !isWeapon(this.hotbar.current?.id)) this.endFocus();
      if (this.focus.update(dt) === 'ended') this.sound.focus(false);
    }
    this.hud.setHoming(this.home.progress);
    this.hud.setFocus(this.focus.active, this.focus.level, this.focus.active || (this.focus.level < 1 && isWeapon(this.hotbar.current?.id)));
    if (this.playing) {
      this.accumulator += dt;
      while (this.accumulator >= STEP) {
        this.tick(STEP);
        this.accumulator -= STEP;
      }
      // The day stands still while a screen is open, as the body does: a day spent in the pack used to cost no
      // food, pay the rig in full and bring Marco a new purse while his trade stayed open.
      if (!this.opts.test && !this.screen.isOpen && !this.paper.isOpen) {
        const h = this.hour + (dt / DAY_SECONDS) * 24;
        if (h >= 24) this.day++; // midnight: the uplink's clock counts the days
        this.hour = h % 24;
      }
    }
    // Each morning (or on waking), the hutches breed.
    if (newWatch(this.dayClock, this.hour) && smokeMeat(this.world)) this.edited();
    if (newDay(this.dayClock, this.hour)) {
      if (breedHutches(this.world)) { this.flags.add('hutch_bred'); this.edited(); }
      // Eggs left in from yesterday hatch first, then this morning's are laid.
      if (hatchEggs(this.world)) { this.hud.toast('A chick has hatched in the coop: one more hen.', 5000); this.edited(); }
      if (layEggs(this.world)) { this.flags.add('coop_laid'); this.edited(); }
      if (cureJerky(this.world)) this.edited();
      // Marco's purse is whole again.
      this.marcoPaid = 0;
      // Las Cruces sends out new men for any killed.
      factionDawn(this.wild.faction);
      // And others of the Ashen drift in for those put down.
      ashenDawn(this.wild.ashen);
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
    // Where the eye is (docs/PHASE9A.md, 2): under water the picture is the water's, whatever body the camera has.
    const ex = Math.floor(cam.position.x), ey = Math.floor(cam.position.y), ez = Math.floor(cam.position.z);
    // (Open water is drawn an eighth of a block low: an eye in that top eighth is in the air.)
    const wet = isWaterId(this.world.blockAt(ex, ey, ez)) && (cam.position.y - ey < 0.875 || this.world.blockAt(ex, ey + 1, ez) !== 0);
    this.renderer.setEye(wet, this.world.lightAt(ex, ey, ez), dt, !this.opts.test || !!this.opts.effects);
    this.renderer.applySky(this.sky, this.opts.test ? 0 : this.time);
    if (!this.opts.test || this.opts.effects) this.emitParticles(dt);
    this.renderer.particles.update(dt, this.time, (x, y, z) => this.world.blockAt(x, y, z), this.sky.daylight);
    // The thermal optic (docs/PHASE8.md, 4): carried, it shows warm bodies while focus runs.
    this.renderer.creatures.thermal = this.focus.active && this.hotbar.count(itemId('thermal_optic')) > 0;
    this.tickScope();
    this.renderer.creatures.sync(this.wild.creatures, this.wild.arrows, (x, y, z) => this.world.lightAt(x, y, z), cam.position);
    this.updateTarget();
    this.updateSound();
    this.updateHand(dt);
    this.updateBirds(dt);
    this.renderer.render();

    // HUD.
    this.hud.updateHotbar(this.hotbar);
    this.hud.setVitals(this.vitals.hp, this.vitals.hunger, this.vitals.thirst, !this.hotbar.creative);
    this.hud.setDose(this.dose, healthCap(this.dose), !this.hotbar.creative && (this.dose > 0.05 || zoneAt(p.x, p.z) === 'zone2' || zoneAt(p.x, p.z) === 'zone4' || !!this.doseLine.text), this.doseLine.text, this.doseLine.alarm);
    // The bow's draw shows on the same bar as mining; switching away from the bow lets the string down.
    if (this.drawing !== null && !isBow(this.hotbar.current?.id)) this.drawing = null;
    this.hud.setMining(this.drawing !== null ? drawOf(this.playTime - this.drawing) : this.mining.active ? this.mining.progress : 0);
    const m = this.mining;
    this.renderer.showCrack(m.x, m.y, m.z, m.active && this.target ? m.progress : 0);
    this.updateFishing();
    this.hud.setBreath(p.breath / BREATH_MAX, p.headInWater || p.breath < BREATH_MAX - 0.01);
    this.fps.frames++;
    if (now - this.fps.t > 500) { this.fps.value = Math.round((this.fps.frames * 1000) / (now - this.fps.t)); this.fps.frames = 0; this.fps.t = now; }
    // Every frame, so turning F3 off hides the panel too (it used to stay up with its last text).
    this.hud.setDebug(this.hud.debugVisible ? this.debugText() : '');

    // Land that could not be built after every retry: say so once, rather than leave a silent hole.
    if (this.streamer.stats.failed && !this.landFailSaid) {
      this.landFailSaid = true;
      this.hud.notice('Part of the land could not be built here. Pause, use “Save now”, then reload the page.', 20000);
    }
    // Save a couple of seconds after the player stops changing things, and at least once a minute.
    if (this.playing && shouldAutosave({ unsaved: this.unsaved, played: this.playedSince, saving: this.saving, now: this.time, lastEdit: this.lastEdit, lastSave: this.lastSave, lastFailure: this.lastFailure })) void this.save(false);
  }

  /** The valley's birds and the afternoon's rain (docs/PHASE9A.md, 6 and 7): scenery; what of it is heard or said. */
  private updateBirds(dt: number): void {
    const p = this.player, r = this.renderer;
    const lively = (!this.opts.test || !!this.opts.effects) && r.effects;
    const events = r.birds.flock.update(dt, {
      px: p.x, py: p.eyeY, pz: p.z, hour: this.hour, day: this.day, time: this.time, sprinting: this.sprinting,
      blockAt: (x, y, z) => this.world.blockAt(x, y, z), tree: quetzalTree(),
    }, lively);
    for (const e of events) {
      if (e.kind === 'quetzal_call') this.sound.quetzal(e.x, e.y, e.z);
      else if (e.kind === 'flush') this.sound.flutter(e.x, e.y, e.z);
      else if (this.playing) this.once('quetzal_seen', 'A quetzal, on the tree by the garden: green, a red breast, tail plumes as long as your arm. It comes some mornings, and leaves if you walk under its tree.', 9000);
    }
    r.birds.draw((x, y, z, out) => r.lightColor(this.world.lightAt(Math.floor(x), Math.floor(y), Math.floor(z)), out));
    // Afternoon rain (docs/PHASE9A.md, 7): most days, for an hour or so from about two.
    const rain = lively ? rainAt(this.day, this.hour) : 0;
    r.rain.update(rain, r.camera.position, this.time, (x, y, z) => this.world.blockAt(x, y, z));
    const head = this.world.lightAt(Math.floor(p.x), Math.floor(p.eyeY), Math.floor(p.z));
    this.sound.rain(rain, Math.min(1, Math.max(0, ((head >> 4) - 4) / 10)));
  }

  /** The arm and what it holds (docs/PHASE9A.md, 1): told each frame what the player is doing. */
  private handWas = { x: 0, z: 0, yaw: 0, pitch: 0 };
  private updateHand(dt: number): void {
    const p = this.player, was = this.handWas, held = this.hotbar.current?.id;
    const busy = this.screen.isOpen || this.paper.isOpen;
    const walked = p.onGround && !p.flying && !busy ? Math.min(0.5, Math.hypot(p.x - was.x, p.z - was.z)) : 0;
    this.renderer.hand.update(dt, {
      held, show: this.playing && !this.scoping,
      mining: this.mining.active && !!this.target && !busy && mineSeconds(this.target.id, held ?? 0) >= 0,
      aiming: (this.focus.active && isWeapon(held)) || this.drawing !== null,
      draw: this.drawing !== null ? drawOf(this.playTime - this.drawing) : 0,
      walked, turnX: p.yaw - was.yaw, turnY: p.pitch - was.pitch,
      light: this.renderer.lightColor(this.world.lightAt(Math.floor(p.x), Math.floor(p.eyeY), Math.floor(p.z))),
    });
    was.x = p.x; was.z = p.z; was.yaw = p.yaw; was.pitch = p.pitch;
  }

  private tick(dt: number): void {
    // With a screen open the player's body waits (no hunger, no sinking); the world goes on.
    if (this.screen.isOpen || this.paper.isOpen) {
      if ((this.tickCount = (this.tickCount + 1) % 3) === 0) randomTicks(this.world, this.player.x, this.player.z, Math.random);
      return;
    }
    this.playTime += dt;
    this.playedSince = true;
    if (this.wakeHold) this.settleAtWake();
    const input = this.readInput();
    this.sprinting = input.sprint && (input.forward !== 0 || input.strafe !== 0);
    const p = this.player;
    const px = p.x, pz = p.z, vy = p.vy;
    // In focus the world runs slow, the player's body with it; only the aim (the mouse) is quick.
    const world = dt * this.focus.scale;
    if (this.seat) this.keepSeat();
    else p.step(world, input, (x, y, z) => this.world.blockAt(x, y, z));
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
    this.tickDevices(world);
    this.tickWild(world);
    this.tickSurvival(dt, input);
    this.tickRadiation(world);
    this.tickGate(world);
    // Any loss of health is "hurt": it cancels heading home, and keeps H from starting for a while.
    const hurt = this.vitals.hp < this.hpBefore - 0.01;
    if (hurt) { this.lastHurt = this.playTime; this.endScope(); this.stand(); }
    this.hpBefore = this.vitals.hp;
    const h = this.home.update(dt, this.keys.has('KeyH'), hurt || (this.home.held !== null && this.ashenOnYou()));
    if (h === 'go') this.goHome();
    else if (h === 'cancelled' && hurt) this.hud.toast('Hurt: you stop. Get clear first.');
    else if (h === 'cancelled' && this.ashenOnYou()) this.hud.toast('Not with one of them on you');
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
    const fine = this.scoping ? 1 / SCOPE_ZOOM : 1; // through the telescope the keys are as fine as the mouse
    this.player.yaw += turn * dt * 2.2 * fine;
    this.player.pitch = Math.max(-1.55, Math.min(1.55, this.player.pitch + tilt * dt * 1.6 * fine));
    this.tickMining(dt);
  }

  private readInput(): Input {
    if (this.screen.isOpen || this.paper.isOpen || this.scoping) return { forward: 0, strafe: 0, jump: false, sprint: false, descend: false };
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
      pv: Math.hypot(p.vx, p.vz),
      sprint: this.sprinting,
      armband: this.hotbar.count(itemId('armband')) > 0,
      quietShot: this.quietShot,
      // The light the Ashen live by: daylight where it reaches, or lamplight.
      lightAt: (x, y, z) => { const l = this.world.lightAt(x, y, z); return Math.max((l >> 4) * this.sky.daylight, l & 15); },
      mining: this.mining.active && this.mining.progress > 0,
      smoke: smokeOf(this.running),
      calls: this.lureCalls,
    });
    this.lureCalls = [];
    this.shotFired = false;
    this.quietShot = false;
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
        // Armour first, then adrenaline: for a minute a blow is felt half as much (docs/PHASE8.md, 4).
        const factor = armourFactor((name) => this.hotbar.count(itemId(name))) * blowFelt(this.adrenaline);
        this.vitals.hp = Math.max(0, this.vitals.hp - h.damage * factor);
        this.sound.hurt();
        this.hud.flashHurt();
        // Dead at the blow that takes the last of it, not at some later look.
        if (this.vitals.hp <= 0) { this.die(); break; }
      }
    }
    for (const e of ev.raiders) {
      const c = e.c, at = [c.x, c.y + 1.6, c.z] as const;
      if (e.kind === 'notice') this.once('raider_notice', 'A raider has turned your way. Get out of his sight before he shouts.', 5000);
      else if (e.kind === 'challenge') { this.sound.shout(...at); this.hud.toast('“¡Oye! ¿Y tú quién eres?” He’s looking closer at your armband. Back off, now, or fight.', 4000); }
      else if (e.kind === 'shout') { this.sound.shout(...at); this.once('outpost_alert', 'They have seen you! Every shot comes after an aim: when you see a glint or hear a click, get behind something solid.', 8000); }
      else if (e.kind === 'aim') {
        this.sound.click(...at);
        if (c.kind === 'lookout') this.once('lookout_aim', 'A glint on the roof: he’s aiming. Get behind something solid.', 6000);
      } else if (e.kind === 'shot') {
        this.sound.enemyShot(...at, c.kind === 'lookout');
        if (!e.hit) { if (e.cover) this.sound.ricochet(...e.cover); else this.sound.zip(); }
      } else if (e.kind === 'swing') this.sound.swing(...at);
    }
    for (const e of ev.ashen) {
      const c = e.c, at = [c.x, c.y + 1.6, c.z] as const;
      if (e.kind === 'breath') { if (Math.hypot(c.x - this.player.x, c.z - this.player.z) < 16) this.sound.ashenBreath(...at); }
      else if (e.kind === 'notice') { this.sound.ashenNotice(...at); this.once('ashen_noticed', 'It has noticed you. Don’t run: it comes for what runs. Walk back into the light, out of its sight: from the dark it sees poorly into light. If it comes, step back when it rears and shrieks.', 8000); }
      else if (e.kind === 'shriek') { this.sound.ashenShriek(...at, !!c.keen); this.once('ashen_shriek', 'It rears and shrieks: it is about to throw itself at you. Step back or aside, now. When it stumbles, strike or go.', 8000); }
      else if (e.kind === 'lunge') this.sound.ashenLunge(...at);
      else if (e.kind === 'step') {
        if (Math.hypot(c.x - this.player.x, c.z - this.player.z) > 32) continue;
        this.sound.ashenStep(c.x, c.y + 0.1, c.z, !!c.keen);
        // Running in the dark it leaves ash in the air behind it.
        if (c.keen) this.renderer.particles.burst(ASH_DUST, Math.floor(c.x), Math.floor(c.y), Math.floor(c.z), 0.5);
      }
      else if (e.kind === 'miss') { this.sound.ashenMiss(...at); this.once('ashen_missed', 'It missed, and stands bent over. That is your moment.', 5000); }
    }
    for (const j of ev.jaguar) {
      const jag = this.wild.creatures.find((c) => c.kind === 'jaguar');
      if (j === 'gone') {
        const [x, z] = ZONE1FAR.jaguarPath[ZONE1FAR.jaguarPath.length - 1];
        this.sound.jaguarCall(x, ZONE1FAR.camp.floor + 1, z - 6);
        this.hud.toast('A jaguar. It looked at you, and was gone into the trees. Its tracks are in the mud by the shed.', 8000);
      } else {
        if (jag) this.sound.growl(jag.x, jag.y + 0.6, jag.z);
        this.once('jaguar_fight', 'The jaguar turns on you! Step back when it crouches, then strike.', 6000);
      }
    }
    if (ev.silent) this.once('takedown', 'He never saw it coming. The others heard nothing.', 6000);
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
    if (c.kind === 'chicken' && c.tame) takeHen(this.world, c.tame);
    else if (c.kind === 'chicken') this.wild.flockLeft = Math.max(0, this.wild.flockLeft - 1);
    // The outpost's raiders stay dead: once all three are, it is quiet for good.
    // Zone-2's men stay down until dawn.
    if (FACTION_KINDS.has(c.kind) && c.squad) this.wild.faction.down |= c.squad;
    // The Ashen too stay down until dawn.
    if (c.kind === 'ashen' && c.squad) this.wild.ashen.down |= c.squad;
    if (c.kind === 'lookout' || c.kind === 'gunman' || c.kind === 'rusher') {
      this.wild.outpost.left &= ~RAIDER_BIT[c.kind];
      if (!this.wild.outpost.left && !this.flags.has('outpost_cleared')) {
        this.flags.add('outpost_cleared');
        this.wild.outpost.alert = false;
        window.setTimeout(() => this.hud.toast('The outpost is quiet. Search the back room: the crate, and the forge (mine it to take its parts home).', 9000), 3200);
      }
    }
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
    if (RAIDER_KINDS.has(c.kind)) alertOutpost(this.wild.creatures, this.wild.outpost);
    if (FACTION_KINDS.has(c.kind)) this.wild.alertFaction();
    if (c.kind === 'ashen' && c.hp > 0) this.wild.provoke(c, this.player.x, this.player.z);
  }

  /** A left-click on a creature in reach: a blow with what is in hand. True if there was one to hit. */
  private strike(): boolean {
    const hit = this.creatureInSight(MELEE_REACH);
    if (!hit) return false;
    if (hit.c.kind === 'marco') { this.hud.toast(MARCO.strike); return true; }
    if (hit.c.kind === 'ray') { this.hud.toast('Ray looks at you. “Put that down.”'); return true; }
    if (this.playTime - this.lastBlow < MELEE_COOLDOWN) return true;
    this.lastBlow = this.playTime;
    // A blade on a raider who hasn't seen you: a silent takedown (docs/PHASE5.md).
    const held = this.hotbar.current?.id;
    if (silentTakedown(hit.c, FACTION_KINDS.has(hit.c.kind) ? this.wild.faction : this.wild.outpost, isBlade(held))) {
      this.sound.hit(hit.c.x, hit.c.y + 1, hit.c.z);
      hit.c.hp = 0;
      this.wild.remove(hit.c);
      this.takeDrops(hit.c);
      this.once('takedown', 'He never saw it coming. The others heard nothing.', 6000);
      return true;
    }
    const dmg = meleeDamage(held);
    if (dmg <= 2 && !isMan(hit.c.kind))
      this.once('weak_hit', 'That barely hurts it. The machete, the bow or the rifle (in the vault’s armory chest) work far better.', 8000);
    this.damageCreature(hit.c, dmg);
    return true;
  }

  /** Is the block in front something a right-click uses (a chest, lever, station, bed…), rather than shoots at? */
  private usableTarget(): boolean {
    const t = this.target;
    if (!t) return false;
    const name = BLOCK_DEFS[t.id]?.base ?? blockName(t.id);
    const scoutLegs = blockName(t.id).startsWith('scout_legs') && !!this.world.containerAt(t.x - 1, t.y, t.z);
    return !!this.world.containerAt(t.x, t.y, t.z) || scoutLegs || t.id === GATE_LEVER || !!stationAt((x, y, z) => this.world.blockAt(x, y, z), t.x, t.y, t.z) || /^steel_door|^snare_caught/.test(blockName(t.id))
      || blockName(t.id).startsWith('wardrobe_upper') || /^door_wood/.test(blockName(t.id)) || (SEATS.has(name) && !isWeapon(this.hotbar.current?.id))
      || ['bed', 'bed_head', 'bed_foot', 'bookshelf', 'computer', 'phone', 'map_table', 'photo_frame', 'leghold_trap', 'apple_trunk', 'pale_body', 'pale_legs', 'raider_forge',
        'water_pump', 'mining_rig', 'battery_bank', 'solar_array', 'pharmacy_counter', 'compound_wall', 'compound_mark', 'steel_gate',
        'logbook_desk', 'hydro_generator', 'turbine', 'old_lathe', 'foundry_crucible', 'cenizos_board'].includes(name);
  }

  /** Right-click with the bow or rifle in hand. True if it was handled. */
  private aim(): boolean {
    const held = this.hotbar.current?.id;
    if (held === undefined || this.usableTarget()) return false;
    if (isBow(held)) {
      if (this.hotbar.count(itemId('arrow')) === 0) { this.hud.toast('No arrows'); return true; }
      this.drawing = this.playTime;
      this.sound.bowDraw();
      return true;
    }
    const gun = gunOf(held);
    if (gun) {
      if (this.playTime - this.lastShot < gun.cooldown) return true;
      if (!this.hotbar.remove(itemId(gun.ammo), 1)) { this.hud.toast(gun.ammo === 'pistol_rounds' ? 'No pistol rounds' : 'No rifle rounds'); return true; }
      this.lastShot = this.playTime;
      if (gun.quiet) this.quietShot = true; else this.shotFired = true;
      if (gun.quiet) this.sound.bowRelease(); else if (gun.sound === 'rifle') this.sound.rifle(); else this.sound.pistol();
      this.shake = Math.max(this.shake, gun.sound === 'rifle' ? 0.25 : 0.15);
      const hit = this.creatureInSight(gun.range);
      if (hit && !isPerson(hit.c.kind)) this.damageCreature(hit.c, gun.damage);
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
    if (hit.c.kind === 'ray') { this.meetRay(); return true; }
    if (hit.c.kind === 'chicken' && hit.dist > CATCH_REACH && !hit.c.tame) {
      // A grab that falls short: she scuttles off for a moment.
      hit.c.mind = 'flee'; hit.c.timer = 3;
      this.sound.cluck(hit.c.x, hit.c.y + 0.3, hit.c.z);
      this.once('grab_short', 'Too far: walk right up to her (no running), then right-click.', 5000);
      return true;
    }
    if (hit.c.kind === 'chicken' && hit.dist <= CATCH_REACH) {
      const r = catchChicken(this.hotbar, hit.c);
      if (r === 'full') { this.hud.toast('No room in your pack for the chicken'); return true; }
      this.wild.remove(hit.c);
      // A tame hen leaves her coop's count; a wild one leaves the farm's flock.
      if (hit.c.tame) takeHen(this.world, hit.c.tame);
      else this.wild.flockLeft = Math.max(0, this.wild.flockLeft - 1);
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
    if (!isBow(this.hotbar.current?.id) || draw < BOW_MIN_DRAW) return;
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
    this.endFocus();
    this.endScope();
    this.adrenaline = 0;
    this.drawing = null;
    this.fishing = null;
    this.mining.active = false;
    if (!losesPack(p.x, p.z)) { this.wakeAgain('You wake, aching, back at the cave. The valley keeps you, but it does not feed you: eat and drink.', true); return; }
    diedOutside(this.flags);
    diedOutsideM3(this.flags);
    diedOutsideM4(this.flags);
    diedOutsideM5(this.flags);
    const at = leaveLostPack(this.world, this.hotbar, p.x, p.y + 0.2, p.z);
    if (at) this.streamer.markUrgentAround(at[0], at[1], at[2]);
    this.wakeAgain(at ? 'You wake at the cave with nothing. Your pack lies where you fell: go back for it.' : 'You wake, aching, back at the cave.');
  }

  /**
   * Once the world has loaded round the player: if a wall or a piece of furniture now stands where they were
   * saved, they go to where they wake. A save must never strand its player in rock.
   */
  private settleIn(): void {
    const p = this.player, at = (x: number, y: number, z: number) => this.world.blockAt(x, y, z);
    // Already on the way to where they wake: `settleAtWake` stands them somewhere that will do, once play goes on.
    // (Without this, a wake point that is built over as well sent them round again, and the loading never ended.)
    if (this.wakeHold || !p.shutIn(at)) return;
    const flying = p.flying;
    // Where they wake, checked by the same rule as waking after a death: beside it if something stands there,
    // the balcony if nowhere near will do (so loading and waking never disagree about the wake point).
    const s = this.toWake();
    p.setPosition(s.x, s.y, s.z);
    p.yaw = s.yaw; p.pitch = 0; p.flying = flying;
    this.ready = false; // load the world there before play goes on
    this.hud.setLoadingVisible();
    const line = 'Something stands where you were. You are back at the cave.';
    if (this.playing) this.hud.toast(line, 8000); else this.sayAtPlay = line;
    this.edited();
  }

  /**
   * You wake where you last slept (or on the balcony). After a death in the valley (`asYouWere`) you wake as hungry
   * and thirsty as you were, never below 15: dying at home used to be a free meal.
   */
  private wakeAgain(line: string, asYouWere = false): void {
    const s = this.toWake();
    this.player.setPosition(s.x, s.y, s.z);
    this.player.yaw = s.yaw;
    this.player.pitch = 0;
    this.player.breath = 20;
    const least = asYouWere ? WAKE_FLOOR : 50;
    this.vitals = { hp: 100, hunger: Math.max(this.vitals.hunger, least), thirst: Math.max(this.vitals.thirst, least) };
    this.hud.toast(line, 6000);
    this.edited();
  }

  /**
   * The place to wake or come home to (docs/FIXES.md, 3): where you last slept if that is still in the valley (a
   * bed carried outside and slept in used to move it there), else the balcony. Once the land there is in,
   * `settleAtWake` makes sure it can be stood on.
   */
  private toWake(): { x: number; y: number; z: number; yaw: number } {
    const balcony = { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z, yaw: SPAWN.yaw };
    const s = wakeFrom(this.spawn, balcony);
    if (s !== this.spawn) this.spawn = balcony;
    this.wakeHold = { x: s.x, y: s.y, z: s.z, yaw: s.yaw };
    return s;
  }
  /** Just woken or come home: held here until the land is in and the spot is checked. */
  private wakeHold: { x: number; y: number; z: number; yaw: number } | null = null;

  /**
   * Blocks stacked on the wake point used to leave you inside them, and a shaft dug under it killed you over and
   * over. Now you stand at the nearest place that will do, or on the balcony if nowhere near will.
   */
  private settleAtWake(): void {
    const h = this.wakeHold, p = this.player;
    if (!h) return;
    if (!this.world.isLoaded(Math.floor(h.x), Math.floor(h.z))) { p.setPosition(h.x, h.y, h.z); p.vy = 0; return; } // wait for the land
    this.wakeHold = null;
    const balcony = { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z, yaw: SPAWN.yaw };
    const at = settleWake((x, y, z) => this.world.blockAt(x, y, z), h, balcony);
    if (!at.moved) return;
    p.setPosition(at.x, at.y, at.z);
    p.vy = 0;
    if (at.moved === 'balcony') {
      this.spawn = balcony;
      this.hud.toast('The place you woke is gone or built over. You wake on the balcony from now on, until you sleep again.', 8000);
    } else this.hud.toast('Something stands where you wake: you are set down beside it.', 6000);
    this.edited();
  }

  // ---- Sound -------------------------------------------------------------------------------

  private updateSound(): void {
    if (!this.sound.started) return;
    const p = this.player;
    // Phase 6: the Geiger counter near a hotspot; the machines at home, now and then; the hot spring.
    this.sound.geiger(clickRate(p.x, p.z), this.frameDt);
    if (Math.random() < this.frameDt * 0.9) {
      const d = this.devices, near = (a: [number, number, number]) => Math.hypot(a[0] + 0.5 - p.x, a[2] + 0.5 - p.z) < 16;
      for (const r of d.mining_rig) if (this.power.on.mining_rig && near(r)) this.sound.machine(r[0] + 0.5, r[1] + 0.5, r[2] + 0.5, 118, 0.025);
      for (const r of d.fridge) if (this.power.on.fridge && near(r)) this.sound.machine(r[0] + 0.5, r[1] + 0.5, r[2] + 0.5, 60, 0.03);
      for (const r of d.hydro_generator) if (near(r)) this.sound.machine(r[0] + 0.5, r[1] + 0.5, r[2] + 0.5, 86, 0.03);
      // The powerhouse's one live turbine, still humming.
      const ph = ZONE3.powerhouse;
      if (Math.hypot(ph.x0 + 6 - p.x, ph.z0 + 6 - p.z) < 30) this.sound.machine(ph.x0 + 6.5, p.y + 1, ph.z0 + 6.5, 50, 0.06);
      const c = ZONE2.cave.cavern;
      if (Math.hypot((c.x0 + c.x1) / 2 - p.x, (c.z0 + c.z1) / 2 - p.z) < 26) this.sound.bubble((c.x0 + c.x1) / 2, p.y - 2, (c.z0 + c.z1) / 2);
    }
    // The hearth crackles when you are near it, and the range's firebox more quietly.
    const hearth = HOME_FIT.hearth, range = HOME_FIT.range;
    if (Math.hypot(hearth.x + 0.5 - p.x, hearth.z + 0.5 - p.z) < 14 && Math.abs(p.y - HOME.floor) < 6 && Math.random() < this.frameDt * 2.4) this.sound.crackle(hearth.x + 0.5, HOME.floor + 0.8, hearth.z + 0.5);
    if (Math.hypot(range.x + 0.5 - p.x, range.z + 0.5 - p.z) < 7 && Math.abs(p.y - HOME.floor) < 6 && Math.random() < this.frameDt * 0.8) this.sound.crackle(range.x + 0.5, HOME.floor + 0.6, range.z + 0.5);
    const [fx, fy, fz] = p.lookDir();
    const head = this.world.lightAt(Math.floor(p.x), Math.floor(p.eyeY), Math.floor(p.z));
    const valley = inSanctuary(p.x, p.z);
    const creek = valley ? Math.min(creekDistance(p.x, p.z), Math.max(0, Math.hypot(p.x - POOL.cx, p.z - POOL.cz) - POOL.radius)) : 99;
    const falls = SPRINGS.map((f) => ({ pos: [f.x + f.dir, (VALLEY.water + f.top) / 2, (f.z0 + f.z1) / 2] as [number, number, number], loudness: fallsLoudness(f, p.x, p.z, valley) }));
    // Near the dam, the second roar is its spillway (the canyon's falls are a kilometre off).
    const D = ZONE3.dam;
    if (Math.hypot(p.x - D.spill, p.z - D.z) < 300) falls[1] = { pos: [D.spill + 0.5, 62, D.z + 5], loudness: 1 };
    this.sound.update({
      x: p.x, y: p.eyeY, z: p.z, fx, fy, fz, hour: this.hour, inValley: valley,
      open: Math.min(1, Math.max(0, ((head >> 4) - 4) / 10)), underwater: p.headInWater, creekDist: creek,
      // The valley's falls, and the canyon's (the stronger spring, a little louder); each is muffled
      // by the ridge when heard from the other side of it.
      falls,
      band: ((z) => (z === 'near' || z === 'mid' || z === 'deep' ? z : 'other'))(zoneAt(p.x, p.z)),
      raiders: this.wild.outpost.left > 0,
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
    // Zone-4's sump breathes (docs/PHASE9A.md, 8): what the signs say, the pond shows.
    const sump = ZONE4.sump;
    if (this.renderer.effects && Math.hypot(p.x - sump.x, p.z - sump.z) < 90 && Math.random() < dt * 5) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * sump.pond;
      const x = sump.x + Math.cos(a) * r, z = sump.z + Math.sin(a) * r;
      parts.fume(x, outsideHeight(Math.floor(x), Math.floor(z)) + 0.2, z);
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
    if (seconds < 0) {
      // Las Cruces' walls: say why nothing happens (docs/PHASE6.md: the compound can't be taken in this phase).
      if (/^compound_|^steel_gate|^searchlight/.test(blockName(t.id)) && this.playTime - this.wallToast > 6) { this.wallToast = this.playTime; this.hud.toast('Reinforced concrete and steel. Your tools won’t touch it.'); }
      return; // bedrock and other unbreakables
    }
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
    if (r.changed && id === LEGHOLD && learnLeghold(this.flags)) this.hud.toast(LEGHOLD_LESSON, 10000);
    if (r.changed && cropOf(id)?.kind === 'coffee') this.hud.toast('You dug up the coffee bush. To pick coffee, right-click a ripe bush (red cherries): it stays and fruits again.', 8000);
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
    // A wardrobe is two blocks high: its top opens the same doors.
    if (blockName(t.id).startsWith('wardrobe_upper') && blockName(this.world.blockAt(t.x, t.y - 1, t.z)).startsWith('wardrobe_lower')) t = { ...t, y: t.y - 1, id: this.world.blockAt(t.x, t.y - 1, t.z) };
    const chest = this.world.containerAt(t.x, t.y, t.z);
    if (chest && blockName(t.id).startsWith('wall_safe') && !this.flags.has('safe_open')) {
      this.openPaper(() => this.paper.keypad('Wall safe', (code) => {
        if (code !== '0618') { this.hud.toast(HINTS.safeWrong, 6000); return false; }
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
    if (chest) {
      const title = homeChestAt(t.x, t.y, t.z)?.title;
      if (title === 'Armory' && !this.flags.has('armory_found')) { this.flags.add('armory_found'); this.edited(); }
      this.openScreen({ title: title ?? (BLOCK_DEFS[t.id]?.label || 'Chest'), slots: chest });
      return;
    }
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
    const station = stationAt((x, y, z) => this.world.blockAt(x, y, z), t.x, t.y, t.z);
    // The medical bench and the distiller work only while a hydro generator turns (docs/PHASE8.md, 4).
    if ((station === 'med_bench' || station === 'distiller') && !this.devices.hydro_generator.length) {
      this.hud.toast(`The ${station === 'med_bench' ? 'medical bench' : 'distiller'} is cold: it needs steady power, day and night. Set a hydro generator turning in the creek.`, 7000);
      return;
    }
    if (station) { this.openScreen(null, station); return; }
    // The garden: pick ripe coffee, till with a hoe, sow seeds on farmland.
    const picked = pickCoffee(this.world, this.hotbar, t.x, t.y, t.z);
    if (picked === 'full') { this.hud.toast('No room in your pack for the beans'); return; }
    if (picked) { this.sound.place('leaves'); this.edited(); return; }
    const apples = pickApple(this.world, this.hotbar, t.x, t.y, t.z);
    if (apples === 'full') { this.hud.toast('No room in your pack for the apples'); return; }
    if (apples) { this.sound.place('leaves'); this.hud.toast('Apples. The tree will fruit again.'); this.edited(); return; }
    const held = this.hotbar.current;
    if (held && held.id === itemId('steel_hoe') && till(this.world, t.x, t.y, t.z)) { this.hotbar.wearTool(); this.sound.dig('soil'); this.edited(); return; }
    const sowing = held ? sows(held.id) : undefined;
    if (isFarmland(t.id) && t.ny === 1 && sow(this.world, this.hotbar, t.x, t.y, t.z)) {
      this.sound.place('soil');
      if (sowing && NEW_CROPS.has(sowing)) this.flags.add('garden_expanded');
      this.edited();
      return;
    }
    if (this.useHeldItem()) return;
    // The garden's two silent failures, said in words (the owner, 2026-11-20).
    if (sowing) {
      const soil = isFarmland(t.id);
      this.hud.toast(cropOf(t.id) || (soil && t.ny === 1) ? 'Something already grows there. Plant on open tilled soil.'
        : soil ? 'Aim at the top of the tilled soil.'
        : 'Seeds and beans go in tilled soil. Right-click grass or dirt with the hoe first, then plant.', 6000);
      return;
    }
    if (held && held.id === itemId('steel_hoe') && !isFarmland(t.id)) {
      this.hud.toast('The hoe tills grass, dirt or forest floor with nothing built on it.', 5000);
      return;
    }
    const [x, y, z] = placeTarget(this.target);
    // Traps are for outside (ADR-020): nothing in the valley needs trapping.
    const placing = this.hotbar.current ? itemName(this.hotbar.current.id) : '';
    if ((placing === 'snare' || placing === 'leghold_trap') && inSanctuary(x + 0.5, z + 0.5)) {
      this.hud.toast('Traps are for outside the valley. Nothing here needs trapping.');
      return;
    }
    this.streamer.markUrgentAround(x, y, z);
    const id = this.hotbar.current?.id ?? 0;
    if (placeBlock(this.world, this.hotbar, this.player, this.target)) {
      this.edited();
      this.sound.place(materialOf(id));
      const placed = itemName(id);
      if (placed === 'smoker' || placed === 'jerky_rack' || placed === 'hutch') this.once(`hint_${placed}`, HINTS[placed], 8000);
      if (id === COOP) this.hud.toast('A coop. Put two chickens in it (right-click): they lay eggs every morning. Leave an egg in and it may hatch.', 7000);
    }
  }

  /** Sits down on a chair, a sofa, a bench or a lounger; on the seat already sat in, stands up again. */
  private sit(x: number, y: number, z: number, id: number): void {
    const p = this.player;
    if (this.seat && this.seat.x === x && this.seat.y === y && this.seat.z === z) { this.stand(); return; }
    // From your feet, on the ground, out of the water; and not onto a seat with something standing on it.
    if (p.flying || (!this.seat && (!p.onGround || p.inWater))) return;
    const above = this.world.blockAt(x, y + 1, z);
    if (BLOCK_DEFS[above]?.rests || BLOCK_DEFS[above]?.solid) { this.hud.toast('Something is on that seat'); return; }
    const from: [number, number, number] = this.seat ? this.seat.from : [p.x, p.y, p.z];
    this.endFocus();
    this.home.cancel();
    this.seat = { x, y, z, from };
    // A chair faces one way: so does whoever sits in it. (A bench or a lounger is sat on as you came to it.)
    const facing = BLOCK_DEFS[id]?.facingIndex;
    if (facing !== undefined && SEAT_FACES.has(BLOCK_DEFS[id]?.base ?? '')) p.yaw = [0, -Math.PI / 2, Math.PI, Math.PI / 2][facing];
    this.seatBody();
    this.once('sat_down', 'Sitting. Step or jump to stand up.', 4000);
  }

  /** How high this seat is above its block's floor: a chair's seat is under half a block up, a window seat is a whole block. */
  private seatHeight(): number {
    const s = this.seat!, id = this.world.blockAt(s.x, s.y, s.z);
    return (BLOCK_DEFS[id]?.base ?? blockName(id)) === 'window_seat' ? 1 : SEAT_HEIGHT;
  }

  /** Where a body on this seat is: its eye at a sitter's height (the feet, 1.62 below the eye, are under the seat). */
  private seatBody(): void {
    const s = this.seat!;
    this.player.setPosition(s.x + 0.5, s.y + this.seatHeight() - SEATED_EYE, s.z + 0.5);
    // The body's own step does not run while seated: what it would have found is set here.
    this.player.onGround = true;
    this.player.inWater = this.player.headInWater = false;
  }

  /**
   * Each tick while seated, in place of the body's own step. If something else has moved the body (a death, the way
   * home), the seat is simply left; if the seat has been mined from under it, it stands.
   */
  private keepSeat(): void {
    const p = this.player, s = this.seat;
    if (!s) return;
    if (Math.abs(p.x - (s.x + 0.5)) > 0.01 || Math.abs(p.z - (s.z + 0.5)) > 0.01 || Math.abs(p.y - (s.y + this.seatHeight() - SEATED_EYE)) > 0.01) { this.seat = null; return; }
    const under = this.world.blockAt(s.x, s.y, s.z);
    if (!SEATS.has(BLOCK_DEFS[under]?.base ?? blockName(under))) { this.stand(); return; }
    this.seatBody();
  }

  /** Stands up from a seat, where the player stood before sitting (or beside it, if something is there now). */
  private stand(): void {
    const s = this.seat;
    if (!s) return;
    this.seat = null;
    const p = this.player, blockAt = (x: number, y: number, z: number) => this.world.blockAt(x, y, z);
    const spots: [number, number, number][] = [s.from, [s.x + 0.5, s.y + 1, s.z + 0.5]];
    const to = spots.find(([x, y, z]) => p.fitsAt(x, y, z, blockAt)) ?? s.from;
    const yaw = p.yaw, pitch = p.pitch;
    p.setPosition(to[0], to[1], to[2]);
    p.yaw = yaw; p.pitch = pitch;
  }

  /** The builder's things: the bed (any of its blocks), bookshelves, computer, phone, map table. True if one was used. */
  private useFurniture(x: number, y: number, z: number, id: number): boolean {
    const name = BLOCK_DEFS[id]?.base ?? blockName(id);
    // (Not with a bow or a gun in hand: a seat in front of what you are shooting at must not take the shot.)
    if (SEATS.has(name) && !isWeapon(this.hotbar.current?.id)) { this.sit(x, y, z, id); return true; }
    if (name === 'bed' || name === 'bed_head' || name === 'bed_foot') {
      if (this.hour < 17 && this.hour >= 6) { this.hud.toast('You can sleep from five in the evening'); return true; }
      // A night's sleep (up to thirteen hours) moves the garden on as if those hours had passed.
      const hours = (6 - this.hour + 24) % 24;
      growWhileAway(this.world, this.player.x, this.player.z, hours, Math.random);
      if (this.hour >= 17) this.day++; // slept through midnight
      this.hour = 6;
      // The builder's own bed: you wake at its foot, facing the window and the valley. Any other bed: where you stood.
      // (If something has been built at its foot, where you stand will do.)
      const footFree = this.player.fitsAt(HOME.wake.x, HOME.wake.y, HOME.wake.z, (bx, by, bz) => this.world.blockAt(bx, by, bz));
      if (footFree && HOME_FIT.bed.some(([bx, by, bz]) => bx === x && by === y && bz === z)) {
        this.spawn = { ...HOME.wake };
        this.player.setPosition(HOME.wake.x, HOME.wake.y, HOME.wake.z);
        this.player.yaw = HOME.wake.yaw;
        this.player.pitch = 0;
      } else this.spawn = { x: this.player.x, y: this.player.y, z: this.player.z, yaw: this.player.yaw };
      this.vitals.hp = Math.min(100, this.vitals.hp + 30);
      this.vitals.hunger = Math.max(0, this.vitals.hunger - 10);
      this.vitals.thirst = Math.max(0, this.vitals.thirst - 10);
      this.edited();
      this.flags.add('slept');
      this.hud.toast('You sleep, and wake to mist on the valley. You will wake here from now on.', 4500);
      void this.save(false);
      return true;
    }
    if (name === 'bookshelf') { this.openJournal(); return true; }
    // Zone-1's mid and deep bands (docs/PHASE5.md).
    if (name === 'photo_frame') { this.hud.toast('A framed photo, faded, the glass cracked: four smiling people in hunting clothes beside a buck. Somebody’s best day.', 8000); return true; }
    if (name === 'leghold_trap') {
      if (learnLeghold(this.flags)) {
        this.edited();
        this.hud.toast(LEGHOLD_LESSON, 10000);
      } else this.hud.toast('A leghold trap. Set it where deer or boar walk, outside the valley; mine it to pick it up.');
      return true;
    }
    if (name === 'apple_trunk') {
      if (this.hotbar.count(itemId('apple_slip')) > 0) { this.hud.toast('You already have a slip from the old tree'); return true; }
      if (this.hotbar.add(itemId('apple_slip'), 1) > 0) { this.hud.toast('No room in your pack'); return true; }
      this.edited();
      this.hud.toast('You cut a slip from the old apple tree. Plant it on farmland at home: a perennial, it fruits again after picking.', 8000);
      return true;
    }
    if (name === 'pale_body' || name === 'pale_legs') { this.hud.toast('You don’t touch it.', 4000); return true; }
    if (name === 'raider_forge') { this.hud.toast('The raiders’ hand-crank forge. Mine it with a pickaxe to take its parts home.', 6000); return true; }
    if (this.usePhase6(name, x, y, z)) return true;
    if (this.usePhase7(name)) return true;
    if (this.usePhase8(name, x, y, z)) return true;
    if (name === 'computer') { this.useComputer(); return true; }
    if (name === 'phone') {
      // The builder's phone works from the cave: carried off and set down elsewhere it finds no signal (Doc is not a field medic).
      if (!inSanctuary(x + 0.5, z + 0.5)) { this.hud.toast('No signal out here. The phone works from the cave.', 5000); return true; }
      this.openPhone();
      return true;
    }
    if (name === 'map_table') {
      const f = this.flags;
      const marks = { route: f.has('extracted'), shelter: f.has('shelter_found'), scout: f.has('scout_searched'), farm: f.has('farm_seen'),
        outpost: f.has('outpost_seen'), mine: f.has('mine_seen'), camp: f.has('camp_marker'), bridge: f.has('bridge_seen'),
        highway: f.has('highway_seen'), ruins: f.has('ruins_seen'), cave: f.has('cave_seen'), compound: f.has('compound_seen'),
        dam: f.has('dam_seen'), works: f.has('zone3_entered'),
        // Zone-4, and what the uplink's answers add (docs/PHASE8.md, 6).
        ridge: f.has('ridge_gate'), fallout: f.has('agi_rad'), nests: f.has('agi_bio'), mira: f.has('agi_end') };
      this.openPaper(() => this.paper.map(drawMap(this.explored, this.player.x, this.player.z, marks), marks.route ? 'The builder’s map · the road home is marked' : 'The builder’s map · filled in where you have been'));
      return true;
    }
    return false;
  }

  /** The builder's journal, and after it the player's own notes as they are earned. */
  private openJournal(): void {
    if (!this.flags.has('journal_read')) { this.flags.add('journal_read'); this.edited(); }
    const notes = journalData.notes.filter((n) => this.flags.has(n.flag)).map((n) => ({ title: n.title, text: n.text, by: 'Your notes' }));
    const all = [...journalData.entries, ...notes];
    this.openPaper(() => this.paper.journal(all, notes.length ? all.length - 1 : 0)); // at your newest note
  }

  /** The builder's phone: his dead contacts, and Marco once his number has been found at the shelter. */
  private openPhone(): void {
    const rows: { name: string; status: string; cls?: string; call?: () => string }[] = [];
    if (this.flags.has('shelter_found')) {
      rows.push({
        name: MARCO.contact, status: this.flags.has('marco_trust2') ? 'trust 2' : this.flags.has('marco_trust1') ? 'trust 1' : 'new', cls: 'btc',
        call: () => {
          // Trust 2: the first call after coming home from Las Cruces (docs/PHASE6.md, 7).
          const trust2 = this.flags.has('zone2_home') && this.flags.has('marco_trust1') && !this.flags.has('marco_trust2');
          if (trust2) this.flags.add('marco_trust2');
          const night = this.hour < MARCO_HOURS[0] || this.hour >= MARCO_HOURS[1];
          const waiting = this.flags.has('marco_meeting');
          this.flags.add('marco_meeting');
          this.flags.delete('marco_seen');
          this.edited();
          return (trust2 ? MARCO.trust2 + ' ' : '') + (waiting ? MARCO.callWaiting : night ? MARCO.callNight : MARCO.callDay);
        },
      });
    }
    if (this.flags.has('doc_known')) rows.push({ name: DOC.contact, status: this.flags.has('doc_called') ? 'by phone' : 'new', cls: 'btc', call: () => { const line = this.callDoc(); return line; } });
    if (this.flags.has('ray_known')) rows.push({ name: RAY.contact, status: this.flags.has('uplink_plans') ? 'by phone · plans sent' : this.flags.has('ray_called') ? 'by phone' : 'new', cls: 'btc', call: () => this.callRay() });
    // Once Ray has given his word: asking him to the refuge (docs/PHASE8.md, 3).
    if (canAskMeeting(this.flags)) rows.push({ name: RAY.meetButton, status: this.flags.has('ray_coming') ? 'by day, at the refuge' : this.suited() ? 'you carry the suit: ask him' : 'needs a hazard suit', cls: 'btc', call: () => askRayToMeet(this) });
    // The beacon the uplink's endpoints table found: a position, no voice.
    if (this.flags.has('agi_end')) rows.push({ name: MIRA.id, status: `beacon · ${String(MIRA.brg).padStart(3, '0')}° · ${MIRA.km} km · no voice`, cls: 'dim' });
    rows.push({ name: 'Mamá', status: 'no answer', cls: 'dim' }, { name: 'Lucía', status: 'no answer', cls: 'dim' }, { name: 'Dr. Alvarez', status: 'no answer', cls: 'dim' }, { name: 'Raúl (pilot)', status: 'no answer', cls: 'dim' });
    rows.push({ name: 'Signal', status: 'satellite: weak' });
    if (this.flags.has('shelter_found')) rows.push({ name: 'Wallet', status: btc(this.wallet), cls: 'btc' });
    this.openPaper(() => this.paper.phone('Satellite phone · the builder’s contacts', rows));
  }

  /** Talking to Marco: a line, then his trade (src/game/people.ts). */
  private talkToMarco(): void {
    const say = greetMarco(this);
    this.openPaper(() => this.paper.trade(marcoTrade(this, say)));
  }

  /** Focus ends (run out, put away, a screen opened, a death). */
  private endFocus(): void {
    if (!this.focus.active) return;
    this.focus.stop();
    this.sound.focus(false);
  }

  /** Q: focus mode with a gun or bow in hand (docs/PHASE5.md). */
  private toggleFocus(): void {
    if (!isWeapon(this.hotbar.current?.id)) { this.hud.toast('Focus needs a gun or a bow in hand'); return; }
    if (this.focus.active) { this.endFocus(); return; }
    if (!this.focus.toggle()) { this.hud.toast('Focus is still coming back'); return; }
    this.sound.focus(true);
    this.once('focus_used', 'Focus: the world slows for a few seconds while you aim. Q again to end it.', 5000);
  }

  /** Home: back where you wake (the bed if you slept, else the balcony), with nothing lost and the hour unchanged. */
  private goHome(): void {
    const s = this.toWake();
    this.endFocus();
    this.drawing = null;
    this.mining.active = false;
    this.player.setPosition(s.x, s.y, s.z);
    this.player.yaw = s.yaw;
    this.player.pitch = 0;
    this.player.breath = 20;
    // The first run's way home has to be swum and walked: H brings you home, but M1's steps wait for the real thing.
    const f = this.flags, waiting = (f.has('been_out') && !f.has('gate_both')) || (f.has('reached_near') && !f.has('extracted'));
    notWalkedHome(f);
    this.hud.toast(waiting ? 'Home. (M1 counts the way home when you swim and walk it yourself.)' : 'Home.', waiting ? 6000 : 2500);
    this.edited();
  }

  /** Notes, once, that the player has done one of the first things (eaten, drunk): the goal on screen moves on. */
  private learned(flag: string): void {
    if (this.flags.has(flag)) return;
    this.flags.add(flag);
    this.hud.setGoal(nextGoal(this.flags));
    this.edited();
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
    this.tickFarPlaces();
    this.tickZone2();
    this.tickZone3();
    this.tickZone4();
    // The first ten minutes (docs/FIXES.md, 7): the goal on screen, and how to eat and drink the first time it is needed.
    if (!inSanctuary(p.x, p.z) && p.x < GATE.x0) this.learned('left_valley');
    if (!this.hotbar.creative && f.has('ate') && this.vitals.hunger < 35) this.once('hint_hungry', HINTS.hungry, 9000);
    if (!this.hotbar.creative && f.has('drank') && this.vitals.thirst < 35) this.once('hint_thirsty', HINTS.thirsty, 9000);
    this.hud.setGoal(nextGoal(f));
    // The coops' hens walk round them, as many as each holds.
    this.wild.creatures = syncTameHens(this.world, this.wild.creatures, p.x, p.z);
    // M1.
    const gained = trackM1(f, p.x, p.z, this.scoutPistolTaken(), p.y);
    if (gained.length) this.edited();
    if (gained.includes('m1_done')) this.hud.toast('M1 · the first outside run. You went out, and came home. New things can be made at the workbench now: a coop, a bow, a smoker, the forge.', 10000);
    else if (gained.includes('extracted')) this.hud.toast('Home, from Zone 1, alive. The way back is on the builder’s map now.', 6000);
    // Marco: at the shelter by day once a meeting is arranged; gone again once you have dealt and left.
    const marco = this.wild.creatures.find((c) => c.kind === 'marco');
    const day = this.hour >= MARCO_HOURS[0] && this.hour < MARCO_HOURS[1];
    const dist = Math.hypot(p.x - MARCO_SPOT[0], p.z - MARCO_SPOT[2]);
    // The meeting is over once you have been to him and walked away (60 m), dealt or not.
    if (f.has('marco_meeting') && f.has('marco_seen') && dist > 60) { f.delete('marco_meeting'); f.delete('marco_seen'); this.edited(); }
    // Once he trusts you he keeps the shelter every day: the call is for the first meeting only (docs/FIXES.md, 7).
    const here = (f.has('marco_meeting') || f.has('marco_trust1')) && day;
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

  /** Has the dead scout's pistol been taken from his pockets? (Any other pistol does not tick M1's step.) */
  private scoutPistolTaken(): boolean {
    if (!this.flags.has('scout_searched')) return false;
    const pockets = this.world.containers.get(packPos(SCOUT_AT[0], SCOUT_AT[1], SCOUT_AT[2]));
    return !!pockets && !pockets.some((s) => s && s.id === itemId('pistol'));
  }

  /** Once a second: Zone-1's mid and deep places (docs/PHASE5.md): their toasts, the jaguar's crossing, the stinger, M2. */
  private tickFarPlaces(): void {
    const p = this.player, f = this.flags, F = ZONE1FAR;
    const near = (x: number, z: number, r: number) => Math.hypot(p.x - x, p.z - z) < r;
    const zone = zoneAt(p.x, p.z);
    if (zone !== 'valley') this.once('home_hint', 'Lost? Hold H to head home.', 5000);
    if (zone === 'mid') this.once('mid_seen', 'Zone 1, mid band: danger 3, and 4 at night. No birds here.', 5000);
    // (A few seconds' walk on from the band's edge, so the two toasts don't overlap.)
    if (near(OUTPOST_AT[0], OUTPOST_AT[1], 66) && this.wild.outpost.left && p.x > OUTPOST_AT[0] && f.has('mid_seen'))
      this.once('outpost_seen', 'The raiders’ outpost. A lookout on the roof watches the road. Leave the road and go round through the brush to the south to come at them unseen: a blade from behind is silent. Or fight from cover.', 12000);
    if ((zone === 'mid' || zone === 'deep') && isWeapon(this.hotbar.current?.id))
      this.once('focus_hint', 'Focus: press Q with a gun or bow in hand to slow the world for a careful shot. It lasts four seconds, then needs time to come back.', 9000);
    if (near(F.mine.x, F.mine.z, 9)) this.once('mine_seen', 'An old mine, lit all the way down. Iron and coal lie thick in the walls of the chamber below. Underground, the danger is one higher.', 9000);
    if (near(CAMP_MARKER[0], CAMP_MARKER[2], 9)) this.once('camp_marker', 'COTO DE CAZA: a hunting reserve. A lit trail runs north to the hunters’ camp.', 7000);
    // The jaguar crosses the clearing once, the first time you come to it.
    if (atCampClearing(p.x, p.z) && !f.has('jaguar_seen') && this.world.column(Math.floor(F.camp.x0 / CS), Math.floor(F.camp.z0 / CS))) {
      const j = makeJaguar((x, z) => groundAt(x, z, (bx, by, bz) => this.world.blockAt(bx, by, bz)));
      if (j && this.wild.add(j)) { f.add('jaguar_seen'); this.edited(); }
    }
    if (f.has('jaguar_seen') && !this.wild.creatures.some((c) => c.kind === 'jaguar') && near((F.camp.x0 + F.camp.x1) / 2, (F.camp.z0 + F.camp.z1) / 2, 18))
      this.once('camp_seen', 'The hunters’ camp. The raiders took the easy gear. Hides still hang in the shed, there is a chest in the lodge, and a rusted trap by the shed: right-click it to see how it is made.', 10000);
    if (zone === 'deep') this.once('deep_seen', 'The deep band. Danger 4. Nothing moves, and the birds have stopped.', 7000);
    if (near(DECK_END[0], DECK_END[2], 14)) this.once('bridge_seen', 'The bridge is gone. Across the ravine, something pale lies in the undergrowth.', 8000);
    const [[ax, az], [bx, bz]] = F.tracks;
    if (near((ax + bx) / 2, (az + bz) / 2, 9)) this.once('tracks_seen', 'Tracks in the mud: two-legged, but not boots, and not paws. Days old, maybe weeks.', 9000);
    // The stinger: once a visit, the first time the body across the ravine comes into view.
    const b = F.body, bd = Math.hypot(p.x - b.x, p.z - b.z);
    if (bd > 130) this.stingerVisit = false;
    if (!this.stingerVisit && bd < 75) {
      const [dx, , dz] = p.lookDir(), tx = b.x + 0.5 - p.x, tz = b.z + 0.5 - p.z, len = Math.hypot(tx, tz) || 1;
      const facing = (dx * tx + dz * tz) / (Math.hypot(dx, dz) * len || 1) > 0.9;
      if (facing && clearShot((x, y, z) => this.world.blockAt(x, y, z), p.x, p.eyeY, p.z, tx / len, (b.y + 0.3 - p.eyeY) / len, tz / len, len - 1)) {
        this.stingerVisit = true;
        if (!f.has('body_seen')) { f.add('body_seen'); this.edited(); }
        this.sound.stinger(Math.floor(Math.random() * 4), b.x - 30, b.y + 4, b.z + (Math.random() - 0.5) * 30, 0.6);
      }
    }
    // M2.
    const m2 = trackM2(f, (name) => this.hotbar.count(itemId(name)));
    if (m2.length) this.edited();
    if (m2.includes('m2_done')) this.hud.toast('M2 · the homestead expansion. The valley is bigger for what you brought home. Power is next: solar arrays can be made at the workbench now.', 10000);
  }

  private openPaper(show: () => void): void {
    this.endFocus();
    this.endScope();
    this.home.cancel();
    this.mining.active = false;
    this.drawing = null;
    this.keys.clear();
    show();
    this.hud.showWorldHud(false);
    this.look.release();
  }

  private closePaper(): void {
    this.paper.close();
    // Putting one screen down can bring up another (the uplink's first answer, then the closing card).
    if (this.paper.isOpen) return;
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
      if (consume(this.vitals, { thirst: 25 })) { this.sound.splash(); this.hud.toast('Cold, clear water'); this.learned('drank'); }
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
    const heldName = itemName(held.id);
    // The medicines (docs/PHASE8.md, 4): one that would do nothing is not used up.
    if (isMedicine(heldName)) {
      const r = useMedicine(heldName, { hp: this.vitals.hp, dose: this.dose, adrenaline: this.adrenaline });
      if (!r) { this.hud.toast(medicineIdle(heldName)); return true; }
      this.vitals.hp = r.hp; this.hpBefore = r.hp; this.dose = r.dose; this.adrenaline = r.adrenaline;
      if (r.focus) this.focus.refill();
      this.hotbar.take();
      this.hud.toast(r.said, 6000);
      this.edited();
      return true;
    }
    if (HELD_HINT[heldName]) { this.hud.toast(HELD_HINT[heldName], 6000); return true; }
    if (held.id === itemId('armband')) { this.hud.toast('A red armband, a white broken circle stitched on it. Whoever sent him wears the same.', 5000); return true; }
    const food = foodOf(held.id);
    const heal = held.id === itemId('first_aid_kit') ? 60 : held.id === itemId('bandage') ? 15 : held.id === itemId('poultice') ? 25 : held.id === itemId('cold_water') ? 3 : 0;
    if (food || heal) {
      // A jug of water, cold or not, leaves its jug: it must have somewhere to go, or the drink waits.
      const jug = held.id === itemId('water_jug') || held.id === itemId('cold_water');
      if (jug && !this.hotbar.creative && held.count > 1 && this.hotbar.room(itemId('empty_jug')) < 1 && (this.vitals.thirst < 99 || this.vitals.hp < 99)) {
        this.hud.toast('No room in your pack for the empty jug: make space first');
        return true;
      }
      if (!consume(this.vitals, food ?? {}, heal)) { this.hud.toast(heal ? 'You are not hurt' : 'You are full'); return true; }
      this.hotbar.take();
      if ((food?.hunger ?? 0) > 0) this.learned('ate');
      if ((food?.thirst ?? 0) > (food?.hunger ?? 0)) this.learned('drank'); // a drink, not the little water in a tin
      if (jug && !this.hotbar.creative) this.hotbar.add(itemId('empty_jug'));
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
    this.endFocus();
    this.endScope();
    this.home.cancel();
    this.screen.known = this.flags;
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
        // (Not on a held key's repeats: the E that put the uplink's page down would close the card it brought up.)
        if (e.code === 'Escape' || e.code === 'KeyE') { if (!e.repeat) this.closePaper(); }
        else this.paper.key(e.code);
        return;
      }
      // At the telescope: E, Esc or a step away puts it down.
      if (this.scoping) {
        if (['Escape', 'KeyE', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(e.code)) this.endScope();
        return;
      }
      // (A fresh press: a key still held from walking up to the seat does not stand you straight up again.)
      if (this.seat && !e.repeat && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(e.code)) this.stand();
      if (e.code === 'Escape' && this.playing) this.pause();
      if (e.code === 'KeyE' && this.playing) { this.openScreen(null); return; }
      if (e.code === 'KeyM') { this.sound.muted = !this.sound.muted; this.hud.toast(this.sound.muted ? 'Sound off' : 'Sound on'); }
      if (e.code === 'F3') this.hud.debugVisible = !this.hud.debugVisible; // works paused too
      if (!this.playing) return;
      if (e.code.startsWith('Digit')) { const n = Number(e.code.slice(5)); if (n >= 1 && n <= 9) this.hotbar.select(n - 1); }
      if (e.code === 'KeyQ') this.toggleFocus();
      if (e.code === 'KeyH' && !e.repeat) {
        // Not an escape from the Ashen: with one hunting you close by, H does nothing (docs/PHASE7.md).
        if (this.ashenOnYou() && !(this.player.flying && this.hotbar.creative)) { this.home.cancel(); this.hud.toast('Not with one of them on you'); return; }
        const r = this.home.press(this.playTime - this.lastHurt, this.player.flying && this.hotbar.creative);
        if (r === 'go') this.goHome();
        else if (r === 'danger') this.hud.toast('Not with danger this close');
      }
      // Builder's mode only (docs/FIXES.md, N2): in Survival these keys do nothing at all.
      if (this.mode !== 'builder') return;
      if (e.code === 'KeyF') { this.player.flying = !this.player.flying; this.hud.toast(this.player.flying ? 'Flying (Space up, Shift down)' : 'Walking'); }
      if (e.code === 'KeyG') { this.hotbar.creative = !this.hotbar.creative; this.edited(); this.hud.toast(this.hotbar.creative ? 'Blocks never run out' : 'Blocks are counted again'); }
      if (e.code === 'BracketRight') this.turnSky(1);
      if (e.code === 'BracketLeft') this.turnSky(-1);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mining.active = false; this.drawing = null; });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.playing) return;
      if (this.look.mode === 'off') { this.look.engage(); return; }
      if (this.scoping) { if (e.button === 2) this.endScope(); return; }
      if (e.button === 0 && !this.strike()) { this.mining.active = true; this.mining.progress = 0; }
      const shot = this.lastShot;
      if (e.button === 2 && !this.useCreature() && !this.aim()) this.placeBlock();
      // The hand answers the click (docs/PHASE9A.md, 1): a blow or a thing set down swings it, a shot kicks it; a bow only bends.
      if (this.lastShot !== shot) this.renderer.hand.kick();
      else if (e.button === 0 || (e.button === 2 && this.drawing === null)) this.renderer.hand.swing();
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
      if (document.hidden) { this.saveNow(); this.sound.suspend(); return; }
      if (this.playing) this.sound.resume();
      // Back in front: has another tab saved this valley meanwhile?
      if (this.booted && !this.opts.test) void this.keeper.check().then((stopped) => { if (stopped) this.stoppedSaving(); });
    });
    window.addEventListener('pagehide', () => this.saveNow());
  }

  /** Before play first begins in a valley: Survival or Builder's mode. After that it is fixed. */
  private pickMode(mode: Mode): void {
    if (this.flags.has(BEGUN) || this.mode === mode) return;
    this.mode = mode;
    this.hotbar.creative = mode === 'builder';
    this.player.flying = false;
    this.edited();
    this.hud.showMode(this.mode, true);
    void this.refreshCode();
  }

  /**
   * Builder's mode: turns the sky's clock by whole hours. Only the sky and the hour move: no power is made or
   * used, the rig is paid nothing, and no new day begins (no eggs, no rabbits, no men back at their posts).
   * (The key used to pay a rig nearly a day's sats a press, and to start a new dawn each time before six.)
   */
  private turnSky(hours: number): void {
    // (The uplink's clock is the day and the hour: a turn across midnight moves the day with it.)
    const to = this.hour + hours;
    this.day = Math.max(0, this.day + Math.floor(to / 24));
    this.hour = ((to % 24) + 24) % 24;
    this.dayClock = this.hour;
    if (this.powerHour !== null) this.powerHour = this.hour;
    this.edited();
  }

  private resume(): void {
    if (!this.ready || this.secondTab || this.keeper.stopped === 'other-tab') return;
    if (!this.flags.has(BEGUN)) {
      // The first time in a valley: a few short cards saying who you are and where (docs/FIXES.md, 7), then play.
      if (!this.introShown && !this.opts.test) {
        this.introShown = true;
        this.hud.showMenu(false);
        this.hud.showIntro(OPENING, () => this.resume());
        return;
      }
      this.flags.add(BEGUN);
      this.edited();
      this.hud.showMode(this.mode, false);
    }
    this.hud.setGoal(nextGoal(this.flags));
    if (this.notice && !this.noticeSaid) { this.noticeSaid = true; this.hud.toast(this.notice, 12000); }
    this.sound.start(); // browsers only allow sound to begin from a click
    this.playing = true;
    this.hud.showMenu(false);
    this.look.engage();
    if (this.sayAtPlay) { this.hud.toast(this.sayAtPlay, 8000); this.sayAtPlay = null; }
  }

  private pause(): void {
    this.endFocus();
    this.home.cancel();
    this.playing = false;
    this.drawing = null;
    this.sound.suspend();
    this.mining.active = false;
    this.keys.clear();
    this.look.release();
    this.hud.setReady(true);
    this.hud.showMenu(true);
    // Pausing saves: where you stand, your health and the hour, whether or not a block changed.
    if (this.unsaved || this.playedSince) void this.save(false);
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

  /** What the pack cannot hold: an item on a screen's cursor, and anything a loaded save had too much of. */
  private spilled(): Slot[] {
    const held = this.screen.held;
    return [...(held ? [stackSlot(held)] : []), ...this.spill.map(stackSlot)];
  }

  /** Once the land is in: what a loaded save's pack could not hold is put down in a sack at the player's feet. */
  private dropSpill(): void {
    if (!this.spill.length) return;
    const sack = new Inventory(this.spill.length);
    this.spill.forEach((s, i) => (sack.slots[i] = s));
    const p = this.player;
    const at = leaveLostPack(this.world, sack, p.x, p.y + 0.2, p.z);
    if (!at) return; // nowhere to put it here: it stays with the save
    this.spill = [];
    this.streamer.markUrgentAround(at[0], at[1], at[2]);
    this.hud.toast('Your pack was over-full: what did not fit is in a sack at your feet.', 7000);
    this.edited();
  }

  snapshot(): SaveData {
    const p = this.player;
    const { palette, edits } = collectEdits(this.world);
    return {
      format: SAVE_FORMAT, version: SAVE_VERSION, id: this.keeper?.id ?? '', seq: this.keeper?.seq ?? 0, layout: WORLD_LAYOUT, savedAt: new Date().toISOString(),
      mode: this.mode, endless: this.hotbar.creative, hour: this.hour,
      // Saved while sitting, the player is where they stood before sitting down (the seated body's feet are put
      // under the seat: a save would open with them inside the floor).
      player: { x: this.seat?.from[0] ?? p.x, y: this.seat?.from[1] ?? p.y, z: this.seat?.from[2] ?? p.z, yaw: p.yaw, pitch: p.pitch, flying: p.flying },
      hotbar: this.hotbar.toSave(), spill: this.spilled(), selected: this.hotbar.selected, palette, edits,
      containers: collectContainers(this.world),
      vitals: { ...this.vitals }, spawn: { ...this.spawn },
      flags: [...this.flags], explored: [...this.explored.keys()].filter((i) => this.explored[i]),
      wallet: this.wallet, marcoPaid: this.marcoPaid, den: this.wild.denLeft, flock: this.wild.flockLeft, outpost: this.wild.outpost.left,
      power: { charge: this.power.charge, satsTotal: this.power.satsTotal, satsToday: this.power.satsToday, frac: this.power.frac }, dose: this.dose,
      factionDown: this.wild.faction.down, ashenDown: this.wild.ashen.down,
      live: { solar: this.devices.solar_array, hydro: this.devices.hydro_generator },
      day: this.day, lastPull: this.lastPull, running: this.running.map((d) => ({ ...d })),
    };
  }

  /** The state to hand to the page's next version: nothing until a valley has been opened (a blank game must never be handed on). */
  handover(): SaveData | undefined {
    // Nor from a page that has stopped saving (another tab holds the newer valley) or whose valley is a stand-in
    // begun while the storage would not open: neither may take the real one's place.
    if (!this.booted || this.secondTab || this.keeper.stopped || this.store.degraded) return undefined;
    return this.snapshot();
  }

  /**
   * Makes the game what a save says, and nothing else: everything a session gathers along the way (creatures,
   * the gate, a drawn bow, timers) is put back to its start. A new game is a fresh save applied (`fresh`),
   * so loading, New game and the hand-over cannot drift apart. The save has been through `normaliseSave`.
   */
  applySave(d: SaveData, fresh = false): void {
    // What a session gathers.
    this.gate = new Gate();
    this.wild.clear();
    this.mining.active = false;
    this.fishing = null;
    this.drawing = null;
    this.endFocus();
    this.focus = new Focus();
    this.home.cancel();
    this.lastHurt = -Infinity;
    this.lastBlow = -Infinity;
    this.lastShot = -Infinity;
    this.coffeeUntil = 0;
    this.stingerVisit = false;
    this.marcoGreeted = false;
    this.introShown = false;
    this.wakeHold = null;
    this.doseToasted = false;
    this.endScope();
    this.adrenaline = 0;
    this.rayGreeted = false;
    this.lureCalls = [];
    this.doseLine = { text: '', alarm: false };
    this.shotFired = false;
    this.quietShot = false;
    this.shake = 0;
    this.keys.clear();
    // What the save holds.
    restoreEdits(this.world, d);
    restoreContainers(this.world, d);
    // A save made in the old tunnel or air pocket (now rock) wakes afloat by the valley mouth instead.
    const at = rescueFromOldTunnel(d.player.x, d.player.y, d.player.z) ?? [d.player.x, d.player.y, d.player.z];
    this.player.setPosition(at[0], at[1], at[2]);
    this.player.yaw = d.player.yaw;
    this.player.pitch = d.player.pitch;
    this.mode = d.mode === 'builder' ? 'builder' : 'survival';
    // Nobody flies in Survival, whatever a save says.
    this.player.flying = d.player.flying && this.mode === 'builder';
    this.player.breath = BREATH_MAX;
    this.checkBuried = !fresh;
    this.hour = d.hour;
    this.dayClock = d.hour;
    this.hotbar = Inventory.fromSave(d.hotbar, d.selected);
    this.hotbar.creative = this.mode === 'builder' && d.endless !== false;
    this.spill = [];
    for (const s of d.spill ?? []) {
      const left = this.hotbar.stow({ id: itemId(s.name), count: s.count, ...(s.wear ? { wear: s.wear } : {}) });
      if (left) this.spill.push(left);
    }
    this.vitals = d.vitals ? { ...d.vitals } : freshVitals();
    this.hpBefore = this.vitals.hp; // loading a hurt player is not being hurt now
    this.flags = new Set(d.flags ?? []);
    this.screen.known = this.flags;
    this.wallet = d.wallet ?? START_WALLET;
    this.marcoPaid = d.marcoPaid ?? 0;
    this.wild.denLeft = d.den ?? 3;
    this.wild.flockLeft = d.flock ?? FLOCK_SIZE;
    this.wild.outpost = outpostFromSave(d.outpost);
    this.power = powerFromSave(d.power);
    this.wild.faction.down = Number.isFinite(d.factionDown) ? d.factionDown! & 31 : 0; // the men killed stay down until dawn, reload or not
    this.wild.ashen = { down: Number.isFinite(d.ashenDown) ? d.ashenDown! & ALL_ASHEN : 0, firstOut: !this.flags.has('ashen_seen') };
    this.dose = Number.isFinite(d.dose) ? Math.max(0, Math.min(100, d.dose!)) : 0;
    this.day = Number.isFinite(d.day) ? Math.max(0, Math.floor(d.day!)) : 0;
    this.lastPull = Number.isFinite(d.lastPull) ? d.lastPull! : null;
    this.running = devicesFromSave(d.running);
    // A telescope counted when saved counts until the home's land is looked at again.
    this.scopeOk = this.flags.has('telescope_set');
    this.scopesAt = null;
    // A save made unsuited on the ridge's poisoned ground (any save from before the fallout was there) would load
    // into certain death, the pack left where no one can fetch it: such a player wakes outside the gate instead.
    if (!fresh && this.mode === 'survival' && !this.suited() && doseRate(this.player.x, this.player.z, false) > 0 && inFallout(this.player.x, this.player.z)) {
      const at = gateRefuge();
      this.player.setPosition(at.x, at.y, at.z);
      this.player.yaw = at.yaw;
      this.sayAtPlay = 'The ridge’s ground is poisoned now, and you carry no suit: you have been set down outside its gate.';
    }
    this.powerHour = null;
    // Arrays and generators count as they did when saved (in the sun, at the water) until their land is seen again.
    this.devices = liveFromSave(findDevices(this.world.edits), d.live);
    this.explored = new Uint8Array(64 * 64);
    for (const i of d.explored ?? []) this.explored[i] = 1;
    this.spawn = d.spawn ? { ...d.spawn } : { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z, yaw: SPAWN.yaw };
    this.hud.showMode(this.mode, !this.flags.has(BEGUN));
    this.keeper?.adopt(d);
  }

  private get unsaved(): boolean { return this.editCount !== this.savedCount; }

  /** Something changed that a save should hold. (Also called by the modules split out of this file.) */
  edited(): void { this.editCount++; this.lastEdit = this.time; }

  private lastWriteFailed = false;

  private async save(announce: boolean): Promise<void> {
    if (this.opts.test || !this.booted || this.secondTab) return;
    const holds = this.editCount;
    this.saving = true;
    let r: 'ok' | 'failed' | 'stopped' | 'overtaken' = 'failed';
    try {
      r = await this.keeper.save(() => { this.playedSince = false; return this.snapshot(); });
    } catch (e) {
      console.error('saving failed', e);
    } finally {
      this.saving = false; // whatever happened, autosave goes on
    }
    this.lastSave = this.time;
    if (r === 'overtaken') return;
    if (r === 'stopped') { this.stoppedSaving(); return; }
    this.lastWriteFailed = r === 'failed';
    if (r === 'ok') {
      this.savedCount = Math.max(this.savedCount, holds);
    } else {
      this.lastFailure = this.time;
      this.playedSince = true;
      // Said every time (a failed write is retried a minute later, not every frame).
      if (!announce) this.hud.toast('Saving did not work just now: this browser’s storage may be full or blocked. Pause and use “Copy save code” to keep your valley.', 9000);
    }
    if (announce) this.hud.toast(r === 'ok' && this.store.kind !== 'memory' ? 'Saved in this browser' : 'This page can’t keep saves: use “Copy save code”');
    if (!this.playing) void this.refreshCode();
    this.updateSaveStatus();
  }

  /** Saves at once, uncompressed, without waiting: used when the page is being hidden or closed. */
  private saveNow(): void {
    if (this.opts.test || !this.booted || this.secondTab || !this.keeper) return;
    if (!this.unsaved && !this.playedSince) return;
    const holds = this.editCount;
    try {
      // The copy beside the store is written before this returns, whatever happens to the page next.
      const r = this.keeper.saveNow(() => this.snapshot());
      if (!r) return;
      void r.stored.then((ok) => {
        if (!ok) return;
        this.savedCount = Math.max(this.savedCount, holds);
        this.playedSince = this.playing;
      });
    } catch (e) {
      console.error('saving as the page closed failed', e);
    }
  }

  /** Another tab has saved this valley since: this page stops, and says why. */
  private stoppedSaving(): void {
    if (this.playing) this.pause();
    const line = this.keeper.stopped === 'newer-build' ? NOTES.newer : this.keeper.stopped === 'store-error' ? NOTES.storeError : NOTES.otherTab;
    if (this.keeper.stopped === 'other-tab') this.hud.setBlocked(line);
    this.hud.toast(line, 12000);
    this.updateSaveStatus();
  }

  private updateSaveStatus(): void {
    const k = this.keeper;
    this.hud.setBackup(k.stopped || this.secondTab ? null : k.backupWhen);
    const say = (text: string, warn = true) => this.hud.setSaveStatus(text, warn);
    if (k.stopped === 'newer-build') say(NOTES.newer);
    else if (k.stopped === 'store-error') say(NOTES.storeError);
    else if (k.stopped === 'other-tab') say(NOTES.otherTab);
    else if (this.secondTab) say(SECOND_TAB);
    else if (this.notice) say(this.notice);
    else if (this.store.kind === 'memory') say('This page isn’t allowed to keep saves. Before you close it, use “Copy save code” and keep the code somewhere safe.');
    else if (this.lastWriteFailed) say('The last save did not go through: this browser’s storage may be full or blocked. Use “Copy save code” and keep the code somewhere safe.');
    else say('Saves in this browser every minute while you play, when you pause and when you leave. A save code is a backup you keep yourself, and it moves your valley to another computer.', false);
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
    if (!this.booted) return;
    try { this.cachedCode = saveToCode(await encodeSave(this.snapshot())); } catch (e) { console.error('the save code could not be made', e); }
  }

  private async loadBytes(bytes: Uint8Array | null): Promise<void> {
    const r = await parseSave(bytes, normaliseSave);
    if (!r.ok) {
      this.hud.toast(r.why === 'newer' ? 'That save was made by a newer build of the game. Reload this page to get the new build, then load it again.'
        : r.why === 'damaged' ? 'That save is damaged and can’t be opened. Your valley is untouched.' : 'That isn’t a Hidden Valley save', 7000);
      return;
    }
    if (fromEarlierLayout(r.data)) { this.hud.toast('That save was made by an earlier build, before the home was rebuilt. It can’t be opened in this one; your valley here is untouched.', 9000); return; }
    await this.swapValley(r.data, false, 'Save loaded');
  }

  private async loadFromFile(): Promise<void> {
    const bytes = await pickFile();
    await this.loadBytes(bytes ? fileToSave(bytes) : null);
  }
  private async loadFromCode(code: string): Promise<void> { await this.loadBytes(codeToSave(code)); }

  private async newGame(): Promise<void> { await this.swapValley(newSave(), true, 'A fresh valley. (The one you left is kept as the backup.)'); }

  /** The backup takes the valley's place, and the valley just left becomes the backup: so this can be undone. */
  private async openBackup(): Promise<void> {
    const b = this.booted && !this.opts.test ? await this.keeper.backup() : null;
    if (!b) { this.hud.toast('There is no backup to open'); return; }
    await this.swapValley(b, false, 'The backup is open. The valley you just left is the backup now.');
  }

  /**
   * Puts another valley in this one's place (New game, a loaded save, the backup). It is applied first and stored
   * second, so a save that cannot be applied never reaches the store; the valley being left becomes the backup.
   */
  private async swapValley(next: SaveData, fresh: boolean, done: string): Promise<void> {
    if (!this.booted || this.secondTab) return;
    // One swap at a time: a second click while the first is still being stored used to put the wrong valley in the backup.
    if (this.swapping) return;
    if (this.keeper.stopped === 'newer-build' || this.keeper.stopped === 'store-error') { this.hud.toast(NOTES[this.keeper.stopped === 'newer-build' ? 'newer' : 'storeError'], 9000); return; }
    // Anything held on a screen's cursor goes back into the pack of the valley being left, not on into the next.
    if (this.screen.isOpen) this.closeScreen();
    if (this.paper.isOpen) this.closePaper();
    if (this.screen.isOpen) return;
    this.swapping = true;
    try {
      const current = this.snapshot();
      try {
        this.restart(next, fresh);
      } catch (e) {
        console.error('that save could not be applied', e);
        this.restart(current, false);
        this.hud.toast('That save could not be opened. Your valley is untouched.', 7000);
        return;
      }
      const noticeWas = this.notice, handedWas = this.fromHandover;
      this.notice = null;
      this.fromHandover = false;
      if (!this.opts.test) {
        // The valley being left is kept as the backup first (if it was ever begun); only then is the new one stored.
        let r: 'ok' | 'not-kept' | 'failed' | 'stopped' = 'failed';
        try { r = await this.keeper.replace(next, current, (current.flags ?? []).includes(BEGUN)); } catch (e) { console.error('storing the new valley failed', e); }
        if (r === 'not-kept' || r === 'stopped') {
          // It could not be kept: put it back, and change nothing.
          this.restart(current, false);
          this.notice = noticeWas; this.fromHandover = handedWas;
          this.editCount++; // as it was: still to be written
          this.hud.toast(r === 'not-kept' ? NOTES.notKept : NOTES.newer, 9000);
          this.updateSaveStatus();
          void this.refreshCode();
          return;
        }
        this.lastWriteFailed = r !== 'ok';
        if (r !== 'ok') this.editCount++; // still to be written
      }
      this.hud.setBlocked(null);
      this.hud.toast(done, 5000);
      this.updateSaveStatus();
      void this.refreshCode();
    } finally {
      this.swapping = false;
    }
  }
  private swapping = false;

  /** Rebuilds the world from a save in place: no page reload, so it works without storage. */
  private restart(d: SaveData, fresh: boolean): void {
    this.streamer.reset();
    this.world.edits.clear();
    this.world.containers.clear();
    this.applySave(d, fresh);
    this.savedCount = this.editCount;
    this.playedSince = false;
    this.ready = false;
    this.hud.setLoading(0, 1);
    this.hud.setLoadingVisible();
  }

  /** The settings as last read from the store, whole: what is saved is laid over them. */
  private settingsKept: Record<string, unknown> = {};
  private async saveSettings(): Promise<void> {
    // (Over whatever was stored: a key this build does not know, another build's setting, is kept as it was.)
    const s = { ...this.settingsKept, rd: this.streamer.radius, sens: this.look.sensitivity / 0.0022, inv: this.look.invertY, vol: this.sound.volume, fx: this.renderer.effects };
    await this.store.set(SETTINGS_KEY, new TextEncoder().encode(JSON.stringify(s)));
  }

  private async loadSettings(): Promise<void> {
    try {
      const b = await this.store.get(SETTINGS_KEY);
      if (!b) return;
      const s = JSON.parse(new TextDecoder().decode(b));
      if (s && typeof s === 'object' && !Array.isArray(s)) this.settingsKept = s;
      // Older builds allowed 4 and 6; the least now is 7 (224 m), and the menu offers 7, 8, 10 and 12.
      if (typeof s.rd === 'number') this.hud.settingsInputs.rd.value = String(nearestViewChunks(s.rd));
      if (typeof s.sens === 'number') { this.look.sensitivity = 0.0022 * s.sens; this.hud.settingsInputs.sens.value = String(s.sens); }
      if (typeof s.inv === 'boolean') { this.look.invertY = s.inv; this.hud.settingsInputs.inv.checked = s.inv; }
      if (typeof s.vol === 'number') { this.sound.volume = s.vol; this.hud.settingsInputs.vol.value = String(s.vol); }
      if (typeof s.fx === 'boolean') { this.renderer.effects = s.fx; this.hud.settingsInputs.fx.checked = s.fx; }
    } catch { /* bad settings are ignored */ }
  }

  // ---- Zone-2 and power (docs/PHASE6.md) ----------------------------------------------------------

  /** Each tick: the dose climbs while standing in a hotspot's ring, and caps health (it fades on the game clock). */
  private tickRadiation(dt: number): void {
    const p = this.player;
    this.adrenaline = stepAdrenaline(this.adrenaline, dt);
    if (this.hotbar.creative || p.flying) { this.doseLine = { text: '', alarm: false }; return; }
    // Zone-2's hotspots and Zone-4's ground (docs/PHASE8.md, 2): the suit lets a fortieth through; past the
    // limit the dose comes off health, one for one.
    const suited = this.suited(), before = this.dose;
    const r = absorb(this.dose, p.x, p.z, dt, suited);
    this.dose = r.dose;
    if (r.harm > 0) this.vitals.hp = Math.max(0, this.vitals.hp - r.harm);
    const cap = healthCap(this.dose);
    // The cap coming down a point is not being hurt (it kept hold H from ever working on the ridge road:
    // a point every five seconds, and H waits ten after any hurt). Health past the limit is.
    if (this.vitals.hp > cap) { this.vitals.hp = cap; this.hpBefore = Math.min(this.hpBefore, cap); }
    const rate = doseRate(p.x, p.z, suited);
    this.doseLine = meterLine(this.dose, rate, suited);
    // What the uplink's RAD answer adds: the dose the rest of the road costs at a walk, each way.
    if (rate > 0 && suited && this.flags.has('agi_rad')) {
      const road = ridgeRoadAt(p.x, p.z);
      if (road.dist < 6) this.doseLine.text += ` · road: tower +${Math.round(roadDose(road.s, ridgeRoadLength(), true))}, gate +${Math.round(roadDose(ridgeRoadMark(ZONE4.road.gate[0]), road.s, true))}`;
    }
    if (this.dose > before && this.dose > 0.5 && !this.doseToasted) {
      this.doseToasted = true;
      this.once('dose_seen', 'Your dose is rising: see the meter. It caps your health until it fades, or Doc treats it. Step back outside the signs.', 9000);
    }
    if (r.harm > 0) {
      this.hud.flashHurt();
      if (this.vitals.hp <= 0) this.die();
    }
  }

  /** Is the hazard suit carried? It works from the pack, like armour. */
  private suited(): boolean { return this.hotbar.count(itemId('hazard_suit')) > 0; }

  /** Once a second: the home's power on the game clock (sleep included), the rig's pay, the fridge, the dose fading; Zone-2's toasts; M3. */
  private tickZone2(): void {
    const p = this.player, f = this.flags, Z = ZONE2;
    const last = this.devices.solar_array, lastHydro = this.devices.hydro_generator;
    this.devices = findDevices(this.world.edits);
    // An array in the cave makes nothing: only those under open sky count.
    this.devices.solar_array = sunlit(this.devices.solar_array, (x, y, z) => (this.world.isLoaded(x, z) ? skyOf(this.world.lightAt(x, y, z)) : null), last);
    // A generator turns only at the valley's water.
    this.devices.hydro_generator = turning(this.devices.hydro_generator, (x, y, z) => (this.world.isLoaded(x, z) ? this.waterNear(x, y, z) : null), lastHydro);
    if (this.powerHour === null) this.powerHour = this.hour;
    const minutes = Math.floor((((this.hour - this.powerHour) % 24) + 24) % 24 * 60);
    if (minutes > 0) {
      const from = this.powerHour;
      const paid = stepPower(this.power, this.devices, from, minutes);
      if (paid) { this.wallet += paid; this.edited(); }
      this.dose = Math.max(0, this.dose - (4 * minutes) / 60 / 24);
      // Each whole hour a powered fridge turns one water jug in it to cold water.
      const hours = Math.floor(from + minutes / 60) - Math.floor(from);
      if (hours > 0 && this.power.on.fridge) {
        for (const [x, y, z] of this.devices.fridge) {
          const slots = this.world.containers.get(packPos(x, y, z));
          if (slots && chillJugs(slots, hours, itemId('water_jug'), itemId('cold_water'))) this.edited();
        }
      }
      this.powerHour = (from + minutes / 60) % 24;
    }
    // Zone-2's places, the first time each is reached.
    const near = (x: number, z: number, r: number) => Math.hypot(p.x - x, p.z - z) < r;
    const zone = zoneAt(p.x, p.z);
    const camp = ZONE1FAR.camp;
    if (near((camp.x0 + camp.x1) / 2, camp.z0 - 2, 12))
      this.once('highway_seen', 'A highway sign: CARRETERA 4 · LAS CRUCES. The name on the scout’s map scrap. The old highway runs north, lit.', 8000);
    if (zone === 'zone2' && p.x < ZONES.saddleX) {
      const armband = this.hotbar.count(itemId('armband')) > 0;
      this.once('zone2_seen', 'Zone 2: faction ground. Danger 5. Their patrols shoot strangers.' + (armband ? ' From a distance, the scout’s armband will pass you for one of theirs. Don’t let them close.' : ' The scout’s armband might pass you for one of theirs, from a distance.'), 11000);
    }
    if (near((Z.mall.x0 + Z.mall.x1) / 2, (Z.mall.z0 + Z.mall.z1) / 2, 30) || near((Z.exchange.x0 + Z.exchange.x1) / 2, (Z.exchange.z0 + Z.exchange.z1) / 2, 26))
      this.once('ruins_seen', 'The ruins. Panels on the roofs, copper in the walls, a server room in the exchange, fridges in the supermarket. Mine them, and open the cabinets and crates. A pharmacy at the end.', 11000);
    if (nearHotspot(p.x, p.z)) this.once('rad_near', 'A hiss, and clicking: radiation. Stay outside the yellow signs.', 7000);
    const gx = (Z.compound.x0 + Z.compound.x1) / 2;
    if (near(gx, Z.compound.z1, 145) && p.z > Z.compound.z1 && Math.abs(p.x - gx) < 30)
      this.once('compound_seen', 'The broken circle, painted over a gate: the same mark as the scout’s armband. This is who sent him: Las Cruces. Their walls are reinforced concrete, and the towers are manned.', 11000);
    if (near(Z.cave.mouthX, Z.cave.z, 10)) this.once('cave_seen', 'A cave, lit by the raiders’ lamps. Steam from below: a hot spring. White saltpeter crusts the walls, and sulfur rims the pool: mine both, for gunpowder.', 10000);
    // M3.
    const d = this.devices;
    const m3 = trackM3(f, p.x, p.z, { arrays: d.solar_array.length, banks: d.battery_bank.length, fridges: d.fridge.length, pumps: d.water_pump.length, rigSats: this.power.satsTotal });
    if (m3.length) this.edited();
    if (m3.includes('array_built')) this.hud.toast('The array is wired in. Now a battery bank (battery cells from the exchange) can store its power for the night.', 8000);
    if (m3.includes('bank_built')) this.hud.toast('A battery bank: power day and night. The rig, the fridge and the pump can be made now.', 8000);
    if (m3.includes('rig_earned')) this.hud.toast('The rig has mined its first sats. The computer shows what it earns.', 7000);
    if (m3.includes('zone2_home')) this.hud.toast('Home from Las Cruces, alive. Marco may have heard: call him.', 7000);
    if (m3.includes('m3_done')) this.hud.toast('M3 · power up. The valley hums now, day and night. Steel is next: a crucible furnace and a lathe can be made now.', 10000);
  }

  /** Right-click on Phase 6's things. True if handled. */
  private usePhase6(name: string, x: number, y: number, z: number): boolean {
    const P = this.power, d = this.devices;
    if (name === 'water_pump') {
      if (!P.on.water_pump) { this.hud.toast('The pump is dead: no power. It needs the sun, or a charged battery bank.'); return true; }
      const empties = this.hotbar.count(itemId('empty_jug'));
      if (empties > 0) {
        this.hotbar.remove(itemId('empty_jug'), empties);
        const left = this.hotbar.add(itemId('water_jug'), empties);
        if (left) this.hotbar.add(itemId('empty_jug'), left);
        this.sound.splash();
        this.hud.toast(`The pump runs: ${empties - left} jug${empties - left === 1 ? '' : 's'} filled.`);
        this.edited();
      } else if (this.vitals.thirst < 99) { this.vitals.thirst = 100; this.sound.splash(); this.hud.toast('You drink your fill from the pump.'); this.learned('drank'); }
      else this.hud.toast('The pump: right-click with empty jugs to fill them, or to drink.');
      return true;
    }
    if (name === 'mining_rig') {
      this.hud.toast(P.on.mining_rig ? `${P.rigs > 1 ? `The farm hums: ${P.rigs} rigs,` : 'The rig hums:'} ${(RIG_THS * P.rigs).toFixed(2)} TH/s. Today ${P.rigs > 1 ? 'they have' : 'it has'} mined ${btc(P.satsToday)}.${P.rigs < d.mining_rig.length && !d.hydro_generator.length ? ' More than one rig needs a hydro generator.' : ''}` : 'The rig is still: no power. It needs the sun, or a charged battery bank.', 6000);
      return true;
    }
    if (name === 'battery_bank') { this.hud.toast(`Battery bank: ${P.charge.toFixed(1)} of ${d.battery_bank.length * BANK_KWH} kWh.`); return true; }
    // An array under rock or a roof says so (it used to report the others' power and leave you guessing).
    if (name === 'solar_array' && this.world.isLoaded(x, z) && !d.solar_array.some((a) => a[0] === x && a[1] === y && a[2] === z)) { this.hud.toast(HINTS.noSky, 6000); return true; }
    if (name === 'solar_array') { this.hud.toast(`Solar: ${d.solar_array.length} array${d.solar_array.length === 1 ? '' : 's'} making ${P.solar.toFixed(1)} kW now.`); return true; }
    if (name === 'pharmacy_counter') {
      if (!this.flags.has('doc_known')) { this.flags.add('doc_known'); this.edited(); this.hud.toast(DOC.card, 10000); }
      else this.hud.toast('Doc’s card. His number is in your phone.');
      return true;
    }
    if (name === 'compound_wall' || name === 'compound_mark' || name === 'steel_gate') { this.hud.toast('Reinforced concrete and steel. Your tools won’t touch it.'); return true; }
    return false;
  }

  /** Calling Doc: a line, then his services (src/game/people.ts). */
  private callDoc(): string {
    const say = greetDoc(this);
    this.openPaper(() => this.paper.trade(docServices(this, say)));
    return say;
  }

  // ---- Zone-3 and hydro (docs/PHASE7.md) ---------------------------------------------------------

  /** Is an Ashen hunting the player close by? Then hold H does nothing. */
  private ashenOnYou(): boolean {
    const p = this.player;
    return ashenOn(this.wild.creatures, p.x, p.z, ASHEN_HOLDS_H);
  }

  /** Is there water within two blocks of a block, beside it or a block below (a generator turns only there)? */
  private waterNear(x: number, y: number, z: number): boolean {
    for (let dy = -1; dy <= 0; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (isWaterId(this.world.blockAt(x + dx, y + dy, z + dz))) return true;
    return false;
  }

  /** Once a second: Zone-3's places, the first time each is reached; the first Ashen; M4. */
  private tickZone3(): void {
    const p = this.player, f = this.flags, Z = ZONE3, D = Z.dam;
    const near = (x: number, z: number, r: number) => Math.hypot(p.x - x, p.z - z) < r;
    const mid = (b: { x0: number; x1: number; z0: number; z1: number }): [number, number] => [(b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2];
    const zone = zoneAt(p.x, p.z);
    this.wild.ashen.firstOut = !f.has('ashen_seen');
    if (near(highwayX(D.z) - 4, D.z, 12)) this.once('dam_road_seen', 'A sign: PRESA RÍO SECO, and a side road west, lit. A dam, on the river.', 7000);
    if (onDamRoad(p.x, p.z, 3) && p.x < Z.barricade.x + 14)
      this.once('dam_seen', 'The faction’s barricade, and a board: NO PASAR · CENIZOS. “The ashen ones.” They don’t cross the dam. Beyond it is Zone 3: danger 6, and 7 in the dark. Nobody lives there. Something does.', 12000);
    if (onDamCrest(p.x, p.z)) this.once('dam_crest', 'The dam. The river’s gorge is the ravine you know. The lights are still on: the dam still makes power. Whatever is over there does not come onto the dam.', 10000);
    if (near(...mid(Z.control), 9)) this.once('control_seen', 'The dam’s control house. There is a logbook on the desk: right-click it.', 7000);
    // The first Ashen: seen from the bend above, by day, standing in the road.
    const first = this.wild.creatures.find((c) => c.kind === 'ashen' && c.post);
    const seeOne = this.wild.creatures.find((c) => c.kind === 'ashen' && near(c.x, c.z, 60) && this.inView(c.x, c.y + 1.5, c.z));
    if (!f.has('ashen_seen') && (first ? near(first.x, first.z, 62) && this.inView(first.x, first.y + 1.5, first.z) : !!seeOne)) {
      this.once('ashen_seen', 'Down in the road: it was a man once. One of the Ashen. By day and in the light they are slow and half blind: walk, don’t run, pass it seven paces wide and never in front of its face, and stay out of dark places. In the dark they are fast. (In your notes.)', 14000);
      this.sound.stinger(1, (first ?? seeOne)!.x, p.y + 2, (first ?? seeOne)!.z, 0.35);
    }
    if (zone === 'zone3' && p.x < ravineX(p.z) - 22) {
      const night = this.hour >= 19 || this.hour < 5.5;
      this.once('zone3_entered', 'Zone 3. Danger 6. The street lamps still burn off the dam: keep to them.' + (night ? ' It is night: they are out, and fast. Go back, or stay in the light.' : ' By day they keep to the dark ends of the buildings.'), 10000);
    }
    if (near(Z.powerhouse.x0 - 3, Z.powerhouse.door + 1, 9))
      this.once('powerhouse_seen', 'The powerhouse. One turbine still turns. Inside, by the door, under the lamps: a parts crate, a tool locker, control cabinets. The far end is dark: leave it be.', 11000);
    if (near(Z.shop.x0 - 3, Z.shop.door + 1, 9) || near(Z.foundry.x1 + 2, Z.foundry.door + 1, 9))
      this.once('shops_seen', 'A machine shop and a foundry. In the lit halves: lathes (mine one for its parts), racks of steel, and the foundry’s crucible (mine it). The back halves are dark.', 11000);
    if (near(Z.signalBox.x0, Z.signalBox.z1 + 6, 14))
      this.once('yard_seen', 'A rail yard. Rails and the flatcar’s plate mine to steel stock; the hopper wagon is full of coal; there is a crate in the first boxcar. The engine shed is dark.', 11000);
    if (near(Z.mine.headX, Z.mine.z, 8)) this.once('mine3_seen', 'MINA SAN ROQUE. Lamps all the way down. Iron and coal are thick in the gallery’s walls. Mining is loud: watch the unlit drift at the far end.', 10000);
    const b = ZONE1FAR.body;
    if (near(b.x, b.z, 7)) this.once('body_reached', 'The body you saw from across the ravine. Not shot, not torn. The pale stain round it is ash: one of them stood here a long time. (In your notes.)', 10000);
    // M4.
    const d = this.devices;
    const m4 = trackM4(f, p.x, p.z, { hydro: d.hydro_generator.length, rigs: this.power.rigs });
    if (m4.length) this.edited();
    if (m4.includes('zone3_home')) this.hud.toast('Home from across the dam, alive.', 6000);
    if (m4.includes('hydro_built')) this.hud.toast('The generator turns. Two kilowatts, day and night: more than one rig will run now. Call Ray.', 9000);
    if (m4.includes('farm_running')) this.hud.toast('Three rigs humming at once: a farm. The computer shows what it earns.', 7000);
    if (m4.includes('m4_done')) this.hud.toast('M4 · hydro. The creek keeps the lights on now. Ray’s drawings are on the table: the ridge tower is next.', 10000);
  }

  /** Is a point in front of the player with nothing solid between (roughly: within the view's middle)? */
  private inView(x: number, y: number, z: number): boolean {
    const p = this.player, tx = x - p.x, ty = y - p.eyeY, tz = z - p.z, len = Math.hypot(tx, ty, tz) || 1;
    const [dx, dy, dz] = p.lookDir();
    if ((dx * tx + dy * ty + dz * tz) / len < 0.8) return false;
    return clearShot((bx, by, bz) => this.world.blockAt(bx, by, bz), p.x, p.eyeY, p.z, tx / len, ty / len, tz / len, len - 1);
  }

  /** Right-click on Phase 7's things. True if handled. */
  private usePhase7(name: string): boolean {
    if (name === 'logbook_desk') {
      if (!this.flags.has('ray_known')) { this.flags.add('ray_known'); this.edited(); this.hud.toast(RAY.logbook, 12000); }
      else this.hud.toast('Ray’s logbook. His number is in your phone.');
      return true;
    }
    if (name === 'hydro_generator') {
      const d = this.devices.hydro_generator.length;
      this.hud.toast(d ? `The generator turns: ${(d * HYDRO_KW).toFixed(0)} kW, day and night.` : 'The generator is still: it needs moving water. Set it in the valley’s creek, at the water’s edge.', 6000);
      return true;
    }
    if (name === 'turbine') { this.hud.toast('It still turns. Eight years with no one to stop it: that is why the lamps are lit.', 6000); return true; }
    if (name === 'old_lathe') { this.hud.toast('A lathe, seized solid. Mine it with a pickaxe for its parts: the headstock, the chuck, the lead screw.', 6000); return true; }
    if (name === 'foundry_crucible') { this.hud.toast('The foundry’s crucible. Mine it with a pickaxe to take it home: the heart of a steel furnace.', 6000); return true; }
    if (name === 'cenizos_board') { this.hud.toast('NO PASAR · CENIZOS. Painted by the faction. A pale figure with long arms, crossed out.', 6000); return true; }
    return false;
  }

  /** Calling Ray: a line (and the uplink plans once the generator turns), then what he sells (src/game/people.ts). */
  private callRay(): string {
    const say = greetRay(this);
    this.openPaper(() => this.paper.trade(rayCatalog(this, say)));
    return say;
  }

  // ---- Zone-4 and the uplink (docs/PHASE8.md) ------------------------------------------------------

  /** The telescopes set down at home, as last looked for (null: not yet since the valley was opened). */
  private scopesAt: [number, number, number][] | null = null;

  /** Lures that called this tick, for the Ashen to hear. */
  private lureCalls: { x: number; z: number; r: number }[] = [];

  /** Each tick: the lures wail and the pots burn their time; a spent one is gone. */
  private tickDevices(dt: number): void {
    if (!this.running.length) return;
    const { calls, spent } = stepDevices(this.running, dt);
    for (const d of calls) {
      this.lureCalls.push({ x: d.x + 0.5, z: d.z + 0.5, r: LURE_HEARD });
      this.sound.lure(d.x + 0.5, d.y + 0.5, d.z + 0.5);
    }
    for (const d of this.running) if (d.kind === 'pot' && Math.random() < dt * 16) this.renderer.particles.smoke(d.x + 0.5, d.y + 0.8, d.z + 0.5, 2);
    for (const d of spent) {
      // Only its own block goes: something built there since stays.
      const name = blockName(this.world.blockAt(d.x, d.y, d.z));
      if (name === 'sonic_lure_on' || name === 'smoke_pot_lit') { this.world.setBlock(d.x, d.y, d.z, 0); this.streamer.markUrgentAround(d.x, d.y, d.z); }
      this.edited();
    }
  }

  /** Once a second: the ridge's places, Ray at the refuge, the telescope at home, the uplink's chips, M5. */
  private tickZone4(): void {
    const p = this.player, f = this.flags;
    const suited = this.suited();
    const place = ridgePlaceAt(p.x, p.z);
    if (place) this.once(`ridge_${place}`, ridgeToast(place, suited), place === 'gate' ? 13000 : 10000);
    // Ray keeps the meeting by day, at the refuge's door, until he has been met (as Marco at his shelter).
    const ray = this.wild.creatures.find((c) => c.kind === 'ray');
    const dist = Math.hypot(p.x - RAY_SPOT.x, p.z - RAY_SPOT.z);
    // (After the hand-over he stays while you are by him: he used to vanish under his own words.)
    const here = rayWaiting(f, this.hour) || (!!ray && f.has('ray_met') && dist < 40 && this.hour >= RAY_FROM && this.hour < RAY_UNTIL);
    if (here && !ray && dist < 120 && this.world.column(Math.floor(RAY_SPOT.x / CS), Math.floor(RAY_SPOT.z / CS))) {
      const y = groundAt(RAY_SPOT.x, RAY_SPOT.z, (bx, by, bz) => this.world.blockAt(bx, by, bz));
      if (y !== null) { const r = makeCreature('ray', RAY_SPOT.x, y, RAY_SPOT.z); r.yaw = RAY_SPOT.yaw; this.wild.add(r); }
    } else if (!here && ray) this.wild.remove(ray);
    if (here && ray && dist < 12 && !this.rayGreeted) {
      this.rayGreeted = true;
      this.sound.whistle(ray.x, ray.y + 1.6, ray.z);
      this.hud.toast('Ray is here, by the refuge’s door: the man in the orange suit. Right-click him.', 7000);
    }
    if (dist > 30) this.rayGreeted = false;
    // The tower's beacon ticks, near it.
    const T = PLACES.ridgeTower;
    if (Math.hypot(p.x - T.x, p.z - T.z) < 90) this.sound.beacon(T.x, p.y + 30, T.z);
    // A telescope under open sky at home (the valley, or the home's grounds); away from home, as last seen.
    // (Looked for only while you are at home, or after a load: away from home nothing there changes, and the
    // search reads every edit. Keyed on where you are, not on a count of edits that some path might forget to move.)
    if (this.scopesAt === null || inSanctuary(p.x, p.z)) this.scopesAt = findPlaced(this.world.edits, 'telescope').filter(([x, , z]) => inSanctuary(x + 0.5, z + 0.5));
    const scopes = this.scopesAt;
    if (!scopes.length) this.scopeOk = false;
    else if (scopes.some(([x, , z]) => this.world.isLoaded(x, z))) this.scopeOk = scopes.some(([x, y, z]) => this.world.isLoaded(x, z) && skyOf(this.world.lightAt(x, y + 1, z)) >= 13);
    // What the uplink's answers add to the screen: the time left to dusk outside (EPH), a nest close by (BIO).
    const chips: string[] = [];
    if (!this.hotbar.creative && !inSanctuary(p.x, p.z)) {
      if (f.has('agi_eph')) { const h = hoursToDusk(this.hour); chips.push(h > 0 ? `dusk in ${Math.floor(h)}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}` : 'dark: they are out'); }
      if (f.has('agi_bio')) {
        const near = Math.min(...NESTS.map((n) => Math.hypot(p.x - n.x, p.z - n.z)));
        if (near < 40) chips.push(`nest ${Math.round(near)} m`);
      }
    }
    this.hud.setChip(chips.join(' · '));
    // M5.
    const m5 = trackM5(f, p.x, p.z, { telescope: this.scopeOk });
    if (m5.length) this.edited();
    if (m5.includes('yard_reached')) this.hud.setGoal(nextGoal(f));
    if (m5.includes('ridge_home')) this.hud.toast('Home from the ridge, alive.', 6000);
    if (m5.includes('telescope_set')) this.hud.toast('The telescope stands under the sky. Right-click it to look: the falls, the moon, and at night the satellites, still crossing.', 9000);
    if (m5.includes('m5_done')) this.hud.toast('M5 · the uplink. Everything the builder began is running. What comes next is not in his drawings. (In your notes.)', 12000);
  }

  /** Meeting Ray at the refuge (src/game/people.ts): the modem, once. */
  private meetRay(): void {
    const first = !this.flags.has('ray_met');
    const say = meetRay(this);
    this.hud.toast(say, first && this.flags.has('ray_met') ? 22000 : 6000);
    if (first && this.flags.has('ray_met')) this.hud.setGoal(nextGoal(this.flags));
  }

  /** Something made that M5 counts, or that needs a word the first time. */
  private madePhase8(name: string): void {
    const flag = craftedFlag(name);
    if (flag && !this.flags.has(flag)) { this.flags.add(flag); this.edited(); }
    const line = MADE_LINE[name];
    if (line) this.once(`made_${name}`, line, 9000);
  }

  /** A page left on a desk, or the manual on its shelf: it is read, and kept in the notes. */
  private readNote(flag: string, by: string): void {
    const n = journalData.notes.find((q) => q.flag === flag);
    if (!n) return;
    if (!this.flags.has(flag)) { this.flags.add(flag); this.edited(); }
    this.openPaper(() => this.paper.journal([{ title: n.title, text: n.text, by }]));
  }

  /** Right-click on Phase 8's things. True if handled. */
  private usePhase8(name: string, x: number, y: number, z: number): boolean {
    const at = (q: readonly number[]) => q[0] === x && q[1] === y && q[2] === z;
    if (name === 'note_desk') {
      this.readNote(at(HUT_LOG) ? 'hut_log' : at(DOME_PAGE) ? 'dome_page' : at(RELAY_PAGE) ? 'relay_page' : Math.hypot(x - ZONE4.observatory.x, z - ZONE4.observatory.z) < 12 ? 'dome_page' : x < ZONE4.yard.x1 ? 'relay_page' : 'hut_log', 'A page left here');
      return true;
    }
    if (name === 'manual_shelf') {
      const first = !this.flags.has('pharma_learned');
      this.readNote('pharma_learned', 'The field pharmacy manual');
      if (first) this.hud.toast('The manual is in your notes. A medical bench and a distiller can be made at the workbench now.', 8000);
      return true;
    }
    if (name === 'antenna_hoist') { this.useHoist(); return true; }
    if (name === 'telescope') { this.startScope(x, y, z); return true; }
    if (name === 'sonic_lure' || name === 'smoke_pot') {
      const lure = name === 'sonic_lure';
      this.world.setBlock(x, y, z, blockId(lure ? 'sonic_lure_on' : 'smoke_pot_lit'));
      this.streamer.markUrgentAround(x, y, z);
      this.running.push(startDevice(lure ? 'lure' : 'pot', x, y, z));
      if (lure) this.hud.toast('The lure wails. For forty seconds every one of them in earshot comes to it, not to you. Then it is spent.', 6000);
      else { this.sound.hiss(x + 0.5, y + 0.5, z + 0.5); this.hud.toast('The pot catches. For a minute none of them will step within eight paces of it. Then it is spent.', 6000); }
      this.edited();
      return true;
    }
    if (name === 'sonic_lure_on' || name === 'smoke_pot_lit') {
      // One left running by a save that lost its clock is simply spent.
      if (!this.running.some((d) => d.x === x && d.y === y && d.z === z)) { this.world.setBlock(x, y, z, 0); this.streamer.markUrgentAround(x, y, z); this.edited(); this.hud.toast('Spent.'); }
      else this.hud.toast(name === 'sonic_lure_on' ? 'It is wailing. Get clear of it.' : 'It is burning. Stay inside its smoke.');
      return true;
    }
    return false;
  }

  /** The builder's hoist on the balcony: with the assembled antenna in hand, the mast and dish go up on the cliff. */
  private useHoist(): void {
    const f = this.flags;
    if (f.has('antenna_up')) { this.hud.toast('The hoist. The antenna is up on the cliff above the cave’s mouth: look from the garden.', 6000); return; }
    const held = this.hotbar.current;
    if (!held || held.id !== itemId('sat_antenna')) {
      this.hud.toast(f.has('uplink_plans')
        ? 'The builder’s hoist: a winch, and a cable up the cliff. With the satellite antenna assembled (Ray’s plans, at the workbench) and in your hand, right-click it.'
        : 'The builder’s hoist: a winch, and a cable up the cliff to a bracket with nothing on it. He meant to lift something heavy up there.', 8000);
      return;
    }
    const spot = antennaSpot(HOME_FIT.mast, (bx, by, bz) => (this.world.isLoaded(bx, bz) ? (BLOCK_DEFS[this.world.blockAt(bx, by, bz)]?.solid ?? false) : null));
    if (!spot) { this.hud.toast('The cable won’t run: the cliff above the cave’s mouth is not as he left it.', 6000); return; }
    for (const [bx, by, bz, block] of antennaBlocks(...spot)) this.world.setBlock(bx, by, bz, blockId(block));
    this.streamer.markUrgentAround(...spot);
    this.streamer.markUrgentAround(spot[0], spot[1] + 6, spot[2]);
    this.hotbar.take();
    f.add('antenna_up');
    this.sound.gate();
    this.shake = 0.6;
    this.hud.setGoal(nextGoal(f));
    this.hud.toast('The winch takes it up. The dish stands on the cliff above the cave’s mouth, turned to the western sky: you can see it from the garden.', 10000);
    this.edited();
  }

  /** The builder's computer: fitting the terminal to it; its pages. */
  private useComputer(): void {
    const f = this.flags, held = this.hotbar.current;
    if (held && held.id === itemId('uplink_terminal') && !f.has('uplink_fitted')) {
      this.hotbar.take();
      f.add('uplink_fitted');
      this.edited();
      this.hud.toast('The terminal is fitted: Ray’s modem, on the builder’s machine. The computer has an Uplink page now.', 8000);
    }
    const actions: { label: string; act: () => void }[] = [];
    if (f.has('uplink_fitted')) actions.push({ label: 'Uplink', act: () => this.paper.uplink(uplinkView(this)) });
    if (f.has('ending_seen')) actions.push({ label: 'The story so far', act: () => this.paper.ending(() => this.closePaper()) });
    this.openPaper(() => this.paper.computer(computerRows(this), 'R.’s terminal', actions));
  }

  /** What the uplink has of what it needs (docs/PHASE8.md, 5). */
  linkNeeds(): LinkNeeds {
    return { antenna: this.flags.has('antenna_up'), telescope: this.scopeOk, hydro: this.devices.hydro_generator.length > 0, terminal: this.flags.has('uplink_fitted') };
  }

  /** The link opens for the first time: the modem is heard. */
  linkOpened(): void {
    this.sound.modem();
    this.hud.setGoal(nextGoal(this.flags));
  }

  /** The first answer has been read and the page put down: the closing card, once (docs/PHASE8.md, 7). */
  firstRead(): void {
    if (this.flags.has('ending_seen')) return;
    this.flags.add('ending_seen');
    this.edited();
    this.openPaper(() => this.paper.ending(() => {
      this.closePaper();
      this.hud.toast('The valley is yours. The uplink’s queries are open, on the computer; “The story so far” is there too.', 9000);
    }));
    void this.save(false);
  }

  /** Right-click a telescope: the view narrows twelve times; the mouse aims; E, Esc or a step puts it down. */
  private startScope(x: number, y: number, z: number): void {
    if (this.scoping) { this.endScope(); return; }
    this.endFocus();
    this.home.cancel();
    this.mining.active = false;
    this.drawing = null;
    this.scope ??= new ScopeView(this.ui);
    this.scoping = { x, y, z };
    this.scope.show();
    this.hud.showWorldHud(false);
    this.renderer.setZoom(SCOPE_ZOOM, SCOPE_NEAR);
    this.once('scope_used', 'Through the telescope: move the mouse to aim. E or Esc to step back.', 5000);
  }

  private endScope(): void {
    if (!this.scoping) return;
    this.scoping = null;
    this.scope?.hide();
    this.hud.showWorldHud(true);
    this.renderer.setZoom(1);
  }

  /** Each frame: the satellites' train in the night sky, and what the telescope is aimed at. */
  private tickScope(): void {
    const p = this.player;
    this.renderer.setSats(satTrain(this.time, this.hour));
    if (!this.scoping) return;
    // Walked off, or the telescope mined: it is put down. (Being hurt puts it down too: `tick`.)
    const s = this.scoping;
    if (Math.hypot(p.x - s.x - 0.5, p.z - s.z - 0.5) > 4 || blockName(this.world.blockAt(s.x, s.y, s.z)).split('@')[0] !== 'telescope') { this.endScope(); return; }
    // Nothing is named through a roof or a wall: the first 120 m of the line must be clear of blocks
    // (the far land beyond that is the telescope's own reckoning: "behind the land from here").
    const [dx, dy, dz] = p.lookDir();
    // (From where the glass begins to draw: the telescope's own block, beside the eye, is not in the way.)
    const open = clearShot((bx, by, bz) => this.world.blockAt(bx, by, bz), p.x + dx * SCOPE_NEAR, p.eyeY + dy * SCOPE_NEAR, p.z + dz * SCOPE_NEAR, dx, dy, dz, 120);
    const aimed = open ? aimedAt(p.yaw, p.pitch, scopeTargets([p.x, p.eyeY, p.z], this.hour, this.time)) : null;
    this.scope?.setLabel(scopeLabel(aimed));
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
