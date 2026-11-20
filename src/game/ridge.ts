// Zone-4 and the uplink in play (docs/PHASE8.md): the ridge's places and Ray at the refuge, the lures and smoke
// pots running down, the builder's hoist, the pages left on desks, the telescope at home and the view through it.
// The game hands it a view of itself (`RidgeHost`); it keeps Phase 8's own state. Behaviour is as it was in
// src/game.ts, where all of this lived (split out: docs/PHASE9B.md, 8; docs/FIXES.md, 8). The Node harness
// (tests/phase8.game.test.ts and the rest) plays it through the real Game.

import journalData from '../../data/journal.json' with { type: 'json' };
import type { Player } from '../sim/player.ts';
import type { World } from '../world/world.ts';
import type { Wild } from '../entity/wild.ts';
import type { Sound } from '../audio/audio.ts';
import type { Hud } from '../ui/hud.ts';
import type { PaperScreen } from '../ui/paperScreen.ts';
import type { Streamer } from '../world/streamer.ts';
import type { Renderer } from '../render/renderer.ts';
import type { Inventory } from '../sim/inventory.ts';
import { ridgePlaceAt, ridgeToast, rayWaiting, RAY_SPOT, RAY_FROM, RAY_UNTIL } from '../sim/ridge.ts';
import { groundAt } from '../entity/spawner.ts';
import { makeCreature } from '../entity/creatures.ts';
import { CS } from '../world/constants.ts';
import { PLACES, inSanctuary, ZONE4 } from '../gen/layout.ts';
import { skyOf } from '../world/light.ts';
import { findPlaced } from './uplink.ts';
import { hoursToDusk } from '../sim/uplink.ts';
import { NESTS } from '../entity/ashen.ts';
import { trackM5, craftedFlag } from '../sim/m5.ts';
import { nextGoal } from '../sim/guide.ts';
import { HUT_LOG, DOME_PAGE, RELAY_PAGE } from '../gen/zone4.ts';
import { startDevice, stepDevices, LURE_HEARD, type Device } from '../sim/countermeasures.ts';
import { antennaBlocks, antennaSpot } from '../gen/antenna.ts';
import { HOME_FIT } from '../gen/home.ts';
import { ScopeView } from '../ui/scopeView.ts';
import { scopeTargets, aimedAt, scopeLabel, satTrain, SCOPE_ZOOM, SCOPE_NEAR } from '../sim/telescope.ts';
import { clearShot } from '../sim/hunting.ts';
import { blockId, blockName, BLOCK_DEFS } from '../world/blocks.ts';
import { itemId } from '../world/items.ts';

/** Said the first time each of M5's things is made. */
export const MADE_LINE: Record<string, string> = {
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

/** What Phase 8's play reads and changes of the game. */
export interface RidgeHost {
  readonly player: Player;
  readonly flags: Set<string>;
  readonly world: World;
  readonly wild: Wild;
  readonly sound: Sound;
  readonly hud: Hud;
  readonly paper: PaperScreen;
  readonly streamer: Streamer;
  readonly renderer: Renderer;
  readonly hotbar: Inventory;
  /** The page's element the telescope's view is drawn in. */
  readonly ui: HTMLElement;
  /** The hour of the day, and the game's clock in seconds. */
  readonly hour: number;
  readonly time: number;
  /** Lures and pots still running (kept in the save). */
  readonly running: Device[];
  /** Something changed that a save should hold. */
  edited(): void;
  /** A line said once in a valley's life. */
  once(flag: string, line: string, ms?: number): void;
  /** Wearing the hazard suit. */
  suited(): boolean;
  /** Opens a paper screen (the notes). */
  openPaper(show: () => void): void;
  /** Puts down what the hands were doing: focus, heading home, mining, drawing a bow. */
  stopActions(): void;
  /** The camera's shake, for the winch's jolt. */
  shakeBy(amount: number): void;
}

export class Ridge {
  /** The telescopes set down at home, as last looked for (null: not yet since the valley was opened). */
  private scopesAt: [number, number, number][] | null = null;
  /** A telescope stands under the sky at home (as last seen: the home's land may not be loaded). */
  scopeOk = false;
  /** Looking through a telescope: where it stands (docs/PHASE8.md, 5). */
  scoping: { x: number; y: number; z: number } | null = null;
  private scope: ScopeView | null = null;
  private rayGreeted = false;
  /** Lures that called this tick, for the Ashen to hear. */
  lureCalls: { x: number; z: number; r: number }[] = [];

  constructor(private g: RidgeHost) {}

  /** A valley is opened: what a session gathers is let go, and a telescope counted when saved counts until looked at. */
  reset(): void {
    this.endScope();
    this.rayGreeted = false;
    this.lureCalls = [];
  }

  /** After a save is applied (its flags read). */
  loaded(): void {
    this.scopeOk = this.g.flags.has('telescope_set');
    this.scopesAt = null;
  }

  /** Each tick: the lures wail and the pots burn their time; a spent one is gone. */
  tickDevices(dt: number): void {
    const g = this.g;
    if (!g.running.length) return;
    const { calls, spent } = stepDevices(g.running, dt);
    for (const d of calls) {
      this.lureCalls.push({ x: d.x + 0.5, z: d.z + 0.5, r: LURE_HEARD });
      g.sound.lure(d.x + 0.5, d.y + 0.5, d.z + 0.5);
    }
    for (const d of g.running) if (d.kind === 'pot' && Math.random() < dt * 16) g.renderer.particles.smoke(d.x + 0.5, d.y + 0.8, d.z + 0.5, 2);
    for (const d of spent) {
      // Only its own block goes: something built there since stays.
      const name = blockName(g.world.blockAt(d.x, d.y, d.z));
      if (name === 'sonic_lure_on' || name === 'smoke_pot_lit') { g.world.setBlock(d.x, d.y, d.z, 0); g.streamer.markUrgentAround(d.x, d.y, d.z); }
      g.edited();
    }
  }

  /** Once a second: the ridge's places, Ray at the refuge, the telescope at home, the uplink's chips, M5. */
  tick(): void {
    const g = this.g, p = g.player, f = g.flags;
    const suited = g.suited();
    const place = ridgePlaceAt(p.x, p.z);
    if (place) g.once(`ridge_${place}`, ridgeToast(place, suited), place === 'gate' ? 13000 : 10000);
    // Ray keeps the meeting by day, at the refuge's door, until he has been met (as Marco at his shelter).
    const ray = g.wild.creatures.find((c) => c.kind === 'ray');
    const dist = Math.hypot(p.x - RAY_SPOT.x, p.z - RAY_SPOT.z);
    // (After the hand-over he stays while you are by him: he used to vanish under his own words.)
    const here = rayWaiting(f, g.hour) || (!!ray && f.has('ray_met') && dist < 40 && g.hour >= RAY_FROM && g.hour < RAY_UNTIL);
    if (here && !ray && dist < 120 && g.world.column(Math.floor(RAY_SPOT.x / CS), Math.floor(RAY_SPOT.z / CS))) {
      const y = groundAt(RAY_SPOT.x, RAY_SPOT.z, (bx, by, bz) => g.world.blockAt(bx, by, bz));
      if (y !== null) { const r = makeCreature('ray', RAY_SPOT.x, y, RAY_SPOT.z); r.yaw = RAY_SPOT.yaw; g.wild.add(r); }
    } else if (!here && ray) g.wild.remove(ray);
    if (here && ray && dist < 12 && !this.rayGreeted) {
      this.rayGreeted = true;
      g.sound.whistle(ray.x, ray.y + 1.6, ray.z);
      g.hud.toast('Ray is here, by the refuge’s door: the man in the orange suit. Right-click him.', 7000);
    }
    if (dist > 30) this.rayGreeted = false;
    // The tower's beacon ticks, near it.
    const T = PLACES.ridgeTower;
    if (Math.hypot(p.x - T.x, p.z - T.z) < 90) g.sound.beacon(T.x, p.y + 30, T.z);
    // A telescope under open sky at home (the valley, or the home's grounds); away from home, as last seen.
    // (Looked for only while you are at home, or after a load: away from home nothing there changes, and the
    // search reads every edit. Keyed on where you are, not on a count of edits that some path might forget to move.)
    if (this.scopesAt === null || inSanctuary(p.x, p.z)) this.scopesAt = findPlaced(g.world.edits, 'telescope').filter(([x, , z]) => inSanctuary(x + 0.5, z + 0.5));
    const scopes = this.scopesAt;
    if (!scopes.length) this.scopeOk = false;
    else if (scopes.some(([x, , z]) => g.world.isLoaded(x, z))) this.scopeOk = scopes.some(([x, y, z]) => g.world.isLoaded(x, z) && skyOf(g.world.lightAt(x, y + 1, z)) >= 13);
    // What the uplink's answers add to the screen: the time left to dusk outside (EPH), a nest close by (BIO).
    const chips: string[] = [];
    if (!g.hotbar.creative && !inSanctuary(p.x, p.z)) {
      if (f.has('agi_eph')) { const h = hoursToDusk(g.hour); chips.push(h > 0 ? `dusk in ${Math.floor(h)}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}` : 'dark: they are out'); }
      if (f.has('agi_bio')) {
        const near = Math.min(...NESTS.map((n) => Math.hypot(p.x - n.x, p.z - n.z)));
        if (near < 40) chips.push(`nest ${Math.round(near)} m`);
      }
    }
    g.hud.setChip(chips.join(' · '));
    // M5.
    const m5 = trackM5(f, p.x, p.z, { telescope: this.scopeOk });
    if (m5.length) g.edited();
    if (m5.includes('yard_reached')) g.hud.setGoal(nextGoal(f));
    if (m5.includes('ridge_home')) g.hud.toast('Home from the ridge, alive.', 6000);
    if (m5.includes('telescope_set')) g.hud.toast('The telescope stands under the sky. Right-click it to look: the falls, the moon, and at night the satellites, still crossing.', 9000);
    if (m5.includes('m5_done')) g.hud.toast('M5 · the uplink. Everything the builder began is running. What comes next is not in his drawings. (In your notes.)', 12000);
  }

  /** Something made that M5 counts, or that needs a word the first time. */
  made(name: string): void {
    const g = this.g;
    const flag = craftedFlag(name);
    if (flag && !g.flags.has(flag)) { g.flags.add(flag); g.edited(); }
    const line = MADE_LINE[name];
    if (line) g.once(`made_${name}`, line, 9000);
  }

  /** A page left on a desk, or the manual on its shelf: it is read, and kept in the notes. */
  private readNote(flag: string, by: string): void {
    const g = this.g;
    const n = journalData.notes.find((q) => q.flag === flag);
    if (!n) return;
    if (!g.flags.has(flag)) { g.flags.add(flag); g.edited(); }
    g.openPaper(() => g.paper.journal([{ title: n.title, text: n.text, by }]));
  }

  /** Right-click on Phase 8's things. True if handled. */
  use(name: string, x: number, y: number, z: number): boolean {
    const g = this.g;
    const at = (q: readonly number[]) => q[0] === x && q[1] === y && q[2] === z;
    if (name === 'note_desk') {
      this.readNote(at(HUT_LOG) ? 'hut_log' : at(DOME_PAGE) ? 'dome_page' : at(RELAY_PAGE) ? 'relay_page' : Math.hypot(x - ZONE4.observatory.x, z - ZONE4.observatory.z) < 12 ? 'dome_page' : x < ZONE4.yard.x1 ? 'relay_page' : 'hut_log', 'A page left here');
      return true;
    }
    if (name === 'manual_shelf') {
      const first = !g.flags.has('pharma_learned');
      this.readNote('pharma_learned', 'The field pharmacy manual');
      if (first) g.hud.toast('The manual is in your notes. A medical bench and a distiller can be made at the workbench now.', 8000);
      return true;
    }
    if (name === 'antenna_hoist') { this.useHoist(); return true; }
    if (name === 'telescope') { this.startScope(x, y, z); return true; }
    if (name === 'sonic_lure' || name === 'smoke_pot') {
      const lure = name === 'sonic_lure';
      g.world.setBlock(x, y, z, blockId(lure ? 'sonic_lure_on' : 'smoke_pot_lit'));
      g.streamer.markUrgentAround(x, y, z);
      g.running.push(startDevice(lure ? 'lure' : 'pot', x, y, z));
      if (lure) g.hud.toast('The lure wails. For forty seconds every one of them in earshot comes to it, not to you. Then it is spent.', 6000);
      else { g.sound.hiss(x + 0.5, y + 0.5, z + 0.5); g.hud.toast('The pot catches. For a minute none of them will step within eight paces of it. Then it is spent.', 6000); }
      g.edited();
      return true;
    }
    if (name === 'sonic_lure_on' || name === 'smoke_pot_lit') {
      // One left running by a save that lost its clock is simply spent.
      if (!g.running.some((d) => d.x === x && d.y === y && d.z === z)) { g.world.setBlock(x, y, z, 0); g.streamer.markUrgentAround(x, y, z); g.edited(); g.hud.toast('Spent.'); }
      else g.hud.toast(name === 'sonic_lure_on' ? 'It is wailing. Get clear of it.' : 'It is burning. Stay inside its smoke.');
      return true;
    }
    return false;
  }

  /** The builder's hoist on the balcony: with the assembled antenna in hand, the mast and dish go up on the cliff. */
  private useHoist(): void {
    const g = this.g, f = g.flags;
    if (f.has('antenna_up')) { g.hud.toast('The hoist. The antenna is up on the cliff above the cave’s mouth: look from the garden.', 6000); return; }
    const held = g.hotbar.current;
    if (!held || held.id !== itemId('sat_antenna')) {
      g.hud.toast(f.has('uplink_plans')
        ? 'The builder’s hoist: a winch, and a cable up the cliff. With the satellite antenna assembled (Ray’s plans, at the workbench) and in your hand, right-click it.'
        : 'The builder’s hoist: a winch, and a cable up the cliff to a bracket with nothing on it. He meant to lift something heavy up there.', 8000);
      return;
    }
    const spot = antennaSpot(HOME_FIT.mast, (bx, by, bz) => (g.world.isLoaded(bx, bz) ? (BLOCK_DEFS[g.world.blockAt(bx, by, bz)]?.solid ?? false) : null));
    if (!spot) { g.hud.toast('The cable won’t run: the cliff above the cave’s mouth is not as he left it.', 6000); return; }
    for (const [bx, by, bz, block] of antennaBlocks(...spot)) g.world.setBlock(bx, by, bz, blockId(block));
    g.streamer.markUrgentAround(...spot);
    g.streamer.markUrgentAround(spot[0], spot[1] + 6, spot[2]);
    g.hotbar.take();
    f.add('antenna_up');
    g.sound.gate();
    g.shakeBy(0.6);
    g.hud.setGoal(nextGoal(f));
    g.hud.toast('The winch takes it up. The dish stands on the cliff above the cave’s mouth, turned to the western sky: you can see it from the garden.', 10000);
    g.edited();
  }

  /** Right-click a telescope: the view narrows twelve times; the mouse aims; E, Esc or a step puts it down. */
  private startScope(x: number, y: number, z: number): void {
    const g = this.g;
    if (this.scoping) { this.endScope(); return; }
    g.stopActions();
    this.scope ??= new ScopeView(g.ui);
    this.scoping = { x, y, z };
    this.scope.show();
    g.hud.showWorldHud(false);
    g.renderer.setZoom(SCOPE_ZOOM, SCOPE_NEAR);
    g.once('scope_used', 'Through the telescope: move the mouse to aim. E or Esc to step back.', 5000);
  }

  endScope(): void {
    if (!this.scoping) return;
    this.scoping = null;
    this.scope?.hide();
    this.g.hud.showWorldHud(true);
    this.g.renderer.setZoom(1);
  }

  /** Each frame: the satellites' train in the night sky, and what the telescope is aimed at. */
  tickScope(): void {
    const g = this.g, p = g.player;
    g.renderer.setSats(satTrain(g.time, g.hour));
    if (!this.scoping) return;
    // Walked off, or the telescope mined: it is put down. (Being hurt puts it down too: `tick`.)
    const s = this.scoping;
    if (Math.hypot(p.x - s.x - 0.5, p.z - s.z - 0.5) > 4 || blockName(g.world.blockAt(s.x, s.y, s.z)).split('@')[0] !== 'telescope') { this.endScope(); return; }
    // Nothing is named through a roof or a wall: the first 120 m of the line must be clear of blocks
    // (the far land beyond that is the telescope's own reckoning: "behind the land from here").
    const [dx, dy, dz] = p.lookDir();
    // (From where the glass begins to draw: the telescope's own block, beside the eye, is not in the way.)
    const open = clearShot((bx, by, bz) => g.world.blockAt(bx, by, bz), p.x + dx * SCOPE_NEAR, p.eyeY + dy * SCOPE_NEAR, p.z + dz * SCOPE_NEAR, dx, dy, dz, 120);
    const aimed = open ? aimedAt(p.yaw, p.pitch, scopeTargets([p.x, p.eyeY, p.z], g.hour, g.time)) : null;
    this.scope?.setLabel(scopeLabel(aimed));
  }
}
