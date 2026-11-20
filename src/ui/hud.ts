// Everything drawn over the 3D view: crosshair with mining progress, hotbar, breath, messages,
// the debug panel, and the start / pause menu with saving and settings.

import { iconFor } from './icons.ts';
import { BLOCK_DEFS } from '../world/blocks.ts';
import type { Inventory } from '../sim/inventory.ts';
import { itemLabel } from '../world/items.ts';

const CSS = `
#ui * { box-sizing: border-box; }
.hv-cross { position: absolute; left: 50%; top: 50%; width: 22px; height: 22px; transform: translate(-50%, -50%); }
.hv-cross::before, .hv-cross::after { content: ''; position: absolute; background: rgba(255,255,255,.85); mix-blend-mode: difference; }
.hv-cross::before { left: 10px; top: 2px; width: 2px; height: 18px; }
.hv-cross::after { top: 10px; left: 2px; height: 2px; width: 18px; }
.hv-ring { position: absolute; left: 50%; top: 50%; width: 40px; height: 40px; transform: translate(-50%, -50%) rotate(-90deg); }
.hv-hotbar { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); display: flex; gap: 4px; padding: 5px;
  background: rgba(14, 20, 16, .55); border-radius: 8px; }
.hv-slot { position: relative; width: 50px; height: 50px; border: 2px solid rgba(255,255,255,.18); border-radius: 6px; background: rgba(0,0,0,.25); }
.hv-slot.sel { border-color: #ffe7b0; box-shadow: 0 0 0 2px rgba(255, 220, 150, .35); }
.hv-slot img { position: absolute; inset: 1px; width: 44px; height: 44px; image-rendering: pixelated; }
.hv-slot span { position: absolute; right: 3px; bottom: 1px; font-size: 12px; font-weight: 700; text-shadow: 0 1px 2px #000, 0 0 2px #000; }
.hv-slot i { position: absolute; left: 3px; top: 1px; font-size: 10px; font-style: normal; opacity: .55; }
.hv-label { position: absolute; left: 50%; bottom: 100px; transform: translateX(-50%); font-size: 14px; text-shadow: 0 1px 3px #000; transition: opacity .4s; }
.hv-breath { position: absolute; left: 50%; bottom: 126px; transform: translateX(-50%); width: 200px; height: 8px; border-radius: 4px;
  background: rgba(0,0,0,.4); overflow: hidden; }
.hv-breath b { display: block; height: 100%; background: linear-gradient(90deg, #6fc3ff, #c9ecff); }
.hv-focus { position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity .25s;
  background: radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(10,20,30,.62) 100%); }
.hv-focusbar { position: absolute; left: 50%; bottom: 140px; transform: translateX(-50%); width: 120px; height: 5px; border-radius: 3px;
  background: rgba(0,0,0,.4); overflow: hidden; }
.hv-focusbar b { display: block; height: 100%; background: #e8d48e; }
.hv-home { position: absolute; left: 50%; top: 58%; transform: translateX(-50%); text-align: center; font-size: 14px; text-shadow: 0 1px 3px #000; }
.hv-home u { display: block; width: 160px; height: 6px; margin: 5px auto 0; border-radius: 3px; background: rgba(0,0,0,.45); overflow: hidden; }
.hv-home b { display: block; height: 100%; background: #f2d68a; }
.hv-vitals { position: absolute; left: 50%; bottom: 78px; transform: translateX(-50%); display: flex; gap: 14px; font-size: 11px; }
.hv-vital { display: flex; align-items: center; gap: 5px; text-shadow: 0 1px 2px #000; }
.hv-vital u { display: block; width: 110px; height: 7px; border-radius: 4px; background: rgba(0,0,0,.45); overflow: hidden; }
.hv-vital u b { display: block; height: 100%; transition: width .25s; }
.hv-vital.low { animation: hv-pulse 1s infinite; }
@keyframes hv-pulse { 50% { opacity: .45; } }
.hv-vital u { position: relative; }
.hv-vital u i { position: absolute; top: 0; bottom: 0; right: 0; background: repeating-linear-gradient(135deg, rgba(240,200,40,.75) 0 3px, rgba(20,20,20,.75) 3px 6px); }
.hv-dose span { color: #f2c81c; }
.hv-hurt { position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity .6s;
  background: radial-gradient(ellipse at center, transparent 45%, rgba(160, 20, 10, .55)); }
.hv-toast { position: absolute; left: 50%; top: 18%; transform: translateX(-50%); padding: 8px 14px; border-radius: 8px;
  background: rgba(14, 20, 16, .75); font-size: 15px; transition: opacity .5s; text-align: center; max-width: 80vw; }
.hv-debug { position: absolute; left: 8px; top: 8px; font: 12px/1.35 ui-monospace, Menlo, monospace; background: rgba(0,0,0,.5);
  padding: 6px 8px; border-radius: 6px; white-space: pre; }
.hv-mode { position: absolute; right: 10px; top: 8px; font-size: 12px; opacity: .8; text-shadow: 0 1px 2px #000; }
.hv-menu { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: auto;
  background: radial-gradient(ellipse at center, rgba(10,16,12,.55), rgba(5,8,6,.85)); }
.hv-panel { width: min(560px, 92vw); max-height: 92vh; overflow: auto; padding: 22px 24px; border-radius: 14px;
  background: rgba(20, 28, 22, .92); border: 1px solid rgba(255,255,255,.08); box-shadow: 0 20px 60px rgba(0,0,0,.5); }
.hv-panel h1 { margin: 0 0 2px; font-size: 26px; font-weight: 700; letter-spacing: .3px; }
.hv-panel h2 { margin: 18px 0 6px; font-size: 13px; text-transform: uppercase; letter-spacing: .8px; opacity: .6; }
.hv-panel p { margin: 4px 0; opacity: .85; }
.hv-sub { opacity: .7; margin-bottom: 14px !important; }
.hv-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0; }
.hv-btn { pointer-events: auto; cursor: pointer; border: 0; border-radius: 8px; padding: 9px 14px; font: inherit; font-weight: 600;
  background: #2f4a35; color: #eaf3e6; }
.hv-btn:hover { background: #3b5c42; }
.hv-btn.primary { background: #c98f3e; color: #1b130a; font-size: 16px; padding: 11px 22px; }
.hv-btn.primary:hover { background: #ddA24c; }
.hv-btn.quiet { background: transparent; border: 1px solid rgba(255,255,255,.18); }
.hv-keys { display: grid; grid-template-columns: auto 1fr; gap: 3px 14px; font-size: 13px; }
.hv-keys b { font-weight: 600; color: #ffe2a8; }
.hv-set { display: grid; grid-template-columns: 1fr auto; gap: 8px 12px; align-items: center; font-size: 13px; }
.hv-set select, .hv-set input { pointer-events: auto; }
.hv-status { font-size: 13px; padding: 8px 10px; border-radius: 8px; background: rgba(255,255,255,.05); margin-top: 6px; }
.hv-status.warn { background: rgba(201, 143, 62, .18); }
.hv-code[hidden], .hv-btn[hidden] { display: none; }
.hv-code { width: 100%; height: 90px; margin-top: 6px; font: 11px ui-monospace, monospace; pointer-events: auto; }
.hv-load { font-size: 15px; opacity: .85; }
.hv-bar { height: 6px; border-radius: 3px; background: rgba(255,255,255,.1); overflow: hidden; margin-top: 10px; }
.hv-bar b { display: block; height: 100%; width: 0; background: #c98f3e; transition: width .2s; }
`;

export interface MenuActions {
  play(): void;
  saveNow(): void;
  downloadSave(): void;
  /** The current save as a code, prepared when the menu opened; null while it is being made. */
  saveCode(): string | null;
  loadFile(): void;
  loadCode(code: string): void;
  newGame(): void;
  /** Opens the backup in the valley's place (the valley left becomes the backup). */
  openBackup(): void;
  setRenderDistance(chunks: number): void;
  setSensitivity(v: number): void;
  setInvertY(v: boolean): void;
  setVolume(v: number): void;
}

/** The view distances the menu offers, in chunks of 32 m: 224 m keeps the whole valley at full detail. */
export const VIEW_CHUNKS = [7, 8, 10, 12];

/** The offered view distance nearest a saved one (older builds also allowed 4 and 6). */
export function nearestViewChunks(n: number): number {
  return VIEW_CHUNKS.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
}

export class Hud {
  private root: HTMLElement;
  private ring: SVGCircleElement;
  private slots: HTMLDivElement[] = [];
  private label: HTMLDivElement;
  private breath: HTMLDivElement;
  private focusEl!: HTMLDivElement;
  private focusBar!: HTMLDivElement;
  private doseWrap!: HTMLElement;
  private doseBar!: HTMLElement;
  private capEl!: HTMLElement;
  private homeEl!: HTMLDivElement;
  private toastEl: HTMLDivElement;
  private vitalBars: { wrap: HTMLDivElement; bar: HTMLElement }[] = [];
  private hurt!: HTMLDivElement;
  private hurtTimer = 0;
  private debugEl: HTMLDivElement;
  private modeEl: HTMLDivElement;
  private menu: HTMLDivElement;
  private status!: HTMLDivElement;
  private playBtn!: HTMLButtonElement;
  private loadBar!: HTMLElement;
  private loadText!: HTMLElement;
  private loadBox!: HTMLElement;
  private labelTimer = 0;
  private toastTimer = 0;
  private hotbarSig = '';
  debugVisible = false;

  constructor(root: HTMLElement, actions: MenuActions) {
    this.root = root;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    el('div', 'hv-cross', root);
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'hv-ring');
    svg.setAttribute('viewBox', '0 0 40 40');
    this.ring = document.createElementNS(svgNS, 'circle');
    this.ring.setAttribute('cx', '20'); this.ring.setAttribute('cy', '20'); this.ring.setAttribute('r', '16');
    this.ring.setAttribute('fill', 'none'); this.ring.setAttribute('stroke', 'rgba(255,240,210,.9)'); this.ring.setAttribute('stroke-width', '3');
    this.ring.setAttribute('stroke-dasharray', '0 200');
    svg.appendChild(this.ring);
    root.appendChild(svg);

    const bar = el('div', 'hv-hotbar', root);
    for (let i = 0; i < 9; i++) this.slots.push(el('div', 'hv-slot', bar));
    // Health, hunger, thirst: just above the hotbar.
    const vit = el('div', 'hv-vitals', root);
    for (const [name, color] of [['Health', '#e5533d'], ['Food', '#e8a33a'], ['Water', '#4fa8e8']]) {
      const w = el('div', 'hv-vital', vit);
      el('span', '', w).textContent = name;
      const u = el('u', '', w);
      const b = el('b', '', u);
      b.style.background = color;
      this.vitalBars.push({ wrap: w, bar: b });
    }
    // Radiation (docs/PHASE6.md): the dose, amber; and on the health bar, striped, the part the dose takes away.
    this.capEl = el('i', '', this.vitalBars[0].bar.parentElement as HTMLElement);
    this.capEl.style.width = '0';
    this.doseWrap = el('div', 'hv-vital hv-dose', vit);
    el('span', '', this.doseWrap).textContent = '☢ Dose';
    this.doseBar = el('b', '', el('u', '', this.doseWrap));
    this.doseBar.style.background = '#f2a81c';
    this.doseWrap.style.display = 'none';
    this.hurt = el('div', 'hv-hurt', root);
    this.label = el('div', 'hv-label', root);
    this.breath = el('div', 'hv-breath', root);
    el('b', '', this.breath);
    this.breath.style.display = 'none';
    this.focusEl = el('div', 'hv-focus', root);
    this.focusBar = el('div', 'hv-focusbar', root);
    el('b', '', this.focusBar);
    this.focusBar.style.display = 'none';
    this.homeEl = el('div', 'hv-home', root);
    this.homeEl.textContent = 'Heading home…';
    el('b', '', el('u', '', this.homeEl));
    this.homeEl.style.display = 'none';
    this.toastEl = el('div', 'hv-toast', root);
    this.toastEl.style.opacity = '0';
    this.debugEl = el('div', 'hv-debug', root);
    this.debugEl.style.display = 'none';
    this.modeEl = el('div', 'hv-mode', root);

    this.menu = el('div', 'hv-menu', root);
    this.buildMenu(actions);
  }

  private buildMenu(a: MenuActions): void {
    const p = el('div', 'hv-panel', this.menu);
    el('h1', '', p).textContent = 'Hidden Valley';
    el('p', 'hv-sub', p).textContent = 'Block edition — Phase 0: the valley takes shape. A safe home in a karst sinkhole; the builder’s cave on the east cliff.';

    this.loadBox = el('div', 'hv-load', p);
    this.loadText = el('div', '', this.loadBox);
    this.loadText.textContent = 'Building the valley…';
    const lb = el('div', 'hv-bar', this.loadBox);
    this.loadBar = el('b', '', lb);

    // Why play is held back (another tab has the valley open), when it is.
    this.blockedEl = el('div', 'hv-status warn', p);
    this.blockedEl.style.display = 'none';
    const row = el('div', 'hv-row', p);
    this.playBtn = el('button', 'hv-btn primary', row);
    this.playBtn.textContent = 'Play';
    this.playBtn.style.display = 'none';
    this.playBtn.onclick = () => a.play();

    el('h2', '', p).textContent = 'Controls';
    const keys = el('div', 'hv-keys', p);
    const k = [
      ['Mouse', 'look'], ['W A S D', 'walk'], ['Space', 'jump · swim up'], ['Shift', 'sprint (flying: down)'],
      ['Left click (hold)', 'mine the block you look at'], ['Right click', 'place the selected block'],
      ['1–9 · wheel', 'choose what is in hand'], ['E', 'inventory (right-click a chest to open it)'], ['Q', 'focus: slow the world for a careful shot (gun or bow in hand)'], ['H (hold)', 'lost? head home'],
      ['F', 'fly on / off (for exploring)'], ['G', 'builder’s mode: blocks never run out'],
      ['[ and ]', 'time of day back / forward an hour'], ['M', 'sound on / off'], ['F3', 'debug panel'], ['Esc', 'this menu'],
    ];
    for (const [key, what] of k) { el('b', '', keys).textContent = key; el('span', '', keys).textContent = what; }

    el('h2', '', p).textContent = 'Your save';
    this.status = el('div', 'hv-status', p);
    const srow = el('div', 'hv-row', p);
    const btn = (label: string, fn: () => void, cls = 'hv-btn') => { const b = el('button', cls, srow); b.textContent = label; b.onclick = fn; return b; };
    btn('Save now', () => a.saveNow());
    // Shown once the game knows a download can work here (claude.ai blocks plain downloads).
    this.downloadBtn = btn('Download save file', () => a.downloadSave());
    this.downloadBtn.hidden = true;
    const codeOut = el('textarea', 'hv-code', p);
    codeOut.readOnly = true;
    codeOut.hidden = true;
    btn('Copy save code', () => {
      // The clipboard only accepts a write made straight from the click, so the code is ready beforehand.
      const code = a.saveCode();
      if (!code) { this.toast('The save code is being prepared: try again in a moment'); return; }
      codeOut.value = code;
      codeOut.hidden = false;
      codeOut.select();
      try {
        navigator.clipboard.writeText(code).then(
          () => this.toast('Save code copied. Keep it somewhere safe, such as a note.'),
          () => this.toast('Copy the selected code below (Cmd+C or Ctrl+C)', 4000),
        );
      } catch {
        this.toast('Copy the selected code below (Cmd+C or Ctrl+C)', 4000);
      }
    });
    btn('Load save file', () => a.loadFile());
    // The valley as it was when this session opened it, or just before New game or a load replaced it.
    this.backupBtn = btn('Open the backup', () => a.openBackup(), 'hv-btn quiet');
    this.backupBtn.hidden = true;
    const codeIn = el('textarea', 'hv-code', p);
    codeIn.placeholder = 'Paste a save code here (it starts with HVB1:), then press “Load pasted code”';
    codeIn.hidden = true;
    codeIn.addEventListener('keydown', (e) => e.stopPropagation());
    const pasteBtn = btn('Paste save code', () => {
      if (codeIn.hidden) { codeIn.hidden = false; codeIn.focus(); pasteBtn.textContent = 'Load pasted code'; return; }
      a.loadCode(codeIn.value);
    });
    // Starting over erases the save, so it takes a second click (browser confirm boxes don't show here).
    let armed = 0;
    const newBtn = btn('New game', () => {
      if (Date.now() - armed < 4000) { a.newGame(); return; }
      armed = Date.now();
      newBtn.textContent = 'Click again to erase this save';
      setTimeout(() => (newBtn.textContent = 'New game'), 4000);
    }, 'hv-btn quiet');

    el('h2', '', p).textContent = 'Settings';
    const set = el('div', 'hv-set', p);
    el('label', '', set).textContent = 'View distance';
    const rd = el('select', '', set);
    // 224 m is the least: it keeps the whole valley at full detail from anywhere inside it.
    for (const c of VIEW_CHUNKS) { const o = el('option', '', rd); o.value = String(c); o.textContent = `${c * 32} m`; }
    rd.value = '8';
    rd.onchange = () => a.setRenderDistance(Number(rd.value));
    el('label', '', set).textContent = 'Mouse sensitivity';
    const sens = el('input', '', set);
    sens.type = 'range'; sens.min = '0.5'; sens.max = '2.5'; sens.step = '0.1'; sens.value = '1';
    sens.oninput = () => a.setSensitivity(Number(sens.value));
    el('label', '', set).textContent = 'Invert mouse up/down';
    const inv = el('input', '', set);
    inv.type = 'checkbox';
    inv.onchange = () => a.setInvertY(inv.checked);
    el('label', '', set).textContent = 'Sound volume';
    const vol = el('input', '', set);
    vol.type = 'range'; vol.min = '0'; vol.max = '1'; vol.step = '0.05'; vol.value = '0.8';
    vol.oninput = () => a.setVolume(Number(vol.value));
    this.settingsInputs = { rd, sens, inv, vol };
  }

  private downloadBtn!: HTMLButtonElement;
  showDownload(show: boolean): void { this.downloadBtn.hidden = !show; }

  private backupBtn!: HTMLButtonElement;
  /** Shows "Open the backup (from …)" when there is one; null hides it. */
  setBackup(when: string | null): void {
    this.backupBtn.hidden = when === null;
    if (when !== null) this.backupBtn.textContent = `Open the backup (${when})`;
  }

  private blockedEl!: HTMLDivElement;
  /** Holds play back with a plain reason (another tab has the valley open); null lets it go again. */
  setBlocked(why: string | null): void {
    this.blockedEl.style.display = why ? '' : 'none';
    this.blockedEl.textContent = why ?? '';
    this.playBtn.disabled = !!why;
    this.playBtn.style.opacity = why ? '.45' : '';
  }

  setLoadingText(text: string): void { this.loadText.textContent = text; }

  settingsInputs!: { rd: HTMLSelectElement; sens: HTMLInputElement; inv: HTMLInputElement; vol: HTMLInputElement };

  setLoading(done: number, total: number): void {
    this.loadBar.style.width = `${Math.round((done / Math.max(1, total)) * 100)}%`;
  }

  setLoadingVisible(): void {
    this.loadBox.style.display = '';
    this.playBtn.style.display = 'none';
  }

  setReady(resume: boolean): void {
    this.loadBox.style.display = 'none';
    this.playBtn.style.display = '';
    this.playBtn.textContent = resume ? 'Resume' : 'Play';
  }

  showMenu(show: boolean): void { this.menu.style.display = show ? 'flex' : 'none'; }

  setSaveStatus(text: string, warn: boolean): void {
    this.status.textContent = text;
    this.status.className = 'hv-status' + (warn ? ' warn' : '');
  }

  setMining(progress: number): void {
    const len = 2 * Math.PI * 16;
    this.ring.setAttribute('stroke-dasharray', `${(progress * len).toFixed(1)} 200`);
  }

  setBreath(fraction: number, show: boolean): void {
    this.breath.style.display = show ? '' : 'none';
    (this.breath.firstChild as HTMLElement).style.width = `${Math.round(fraction * 100)}%`;
  }

  updateHotbar(h: Inventory): void {
    const sig = h.slots.slice(0, 9).map((s) => (s ? `${s.id}:${s.count}:${s.wear ?? 0}` : '-')).join(',') + `|${h.selected}|${h.creative}`;
    if (sig === this.hotbarSig) return;
    const selChanged = !this.hotbarSig.endsWith(`|${h.selected}|${h.creative}`) && this.hotbarSig !== '';
    this.hotbarSig = sig;
    h.slots.slice(0, 9).forEach((s, i) => {
      const d = this.slots[i];
      d.className = 'hv-slot' + (i === h.selected ? ' sel' : '');
      d.innerHTML = '';
      const n = el('i', '', d); n.textContent = String(i + 1);
      if (!s) return;
      const img = el('img', '', d); img.src = iconFor(s.id); img.alt = '';
      if (!h.creative && s.count > 1) el('span', '', d).textContent = String(s.count);
    });
    if (selChanged) this.flashLabel(h.current ? itemLabel(h.current.id) : 'Empty hand');
  }

  flashLabel(text: string): void {
    this.label.textContent = text;
    this.label.style.opacity = '1';
    clearTimeout(this.labelTimer);
    this.labelTimer = window.setTimeout(() => (this.label.style.opacity = '0'), 1500);
  }

  toast(text: string, ms = 2600): void {
    this.toastEl.textContent = text;
    this.toastEl.style.opacity = '1';
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toastEl.style.opacity = '0'), ms);
  }

  setMode(text: string): void { this.modeEl.textContent = text; }

  setVitals(hp: number, hunger: number, thirst: number, show: boolean): void {
    [hp, hunger, thirst].forEach((v, i) => {
      const { wrap, bar } = this.vitalBars[i];
      wrap.style.display = show ? '' : 'none';
      bar.style.width = `${Math.round(v)}%`;
      wrap.classList.toggle('low', v < 20);
    });
  }

  /** The radiation dose (0–100) and the health it leaves (the cap); shown in Zone-2 or while there is a dose. */
  setDose(dose: number, cap: number, show: boolean): void {
    this.doseWrap.style.display = show ? '' : 'none';
    this.doseBar.style.width = `${Math.round(dose)}%`;
    this.capEl.style.width = `${Math.max(0, 100 - cap)}%`;
  }

  /** Focus mode: a dark vignette while it runs, and a small bar for what is left (or how far it has come back). */
  setFocus(active: boolean, level: number, show: boolean): void {
    this.focusEl.style.opacity = active ? '1' : '0';
    this.focusBar.style.display = show ? '' : 'none';
    (this.focusBar.firstChild as HTMLElement).style.width = `${Math.round(level * 100)}%`;
  }

  /** Holding H to head home: "Heading home…" and a bar filling over the two seconds; null hides it. */
  setHoming(progress: number | null): void {
    this.homeEl.style.display = progress === null ? 'none' : '';
    if (progress !== null) (this.homeEl.querySelector('b') as HTMLElement).style.width = `${Math.round(progress * 100)}%`;
  }

  /** A red flash at the edges of the screen when hurt. */
  flashHurt(): void {
    this.hurt.style.transition = 'none';
    this.hurt.style.opacity = '1';
    clearTimeout(this.hurtTimer);
    this.hurtTimer = window.setTimeout(() => { this.hurt.style.transition = 'opacity .6s'; this.hurt.style.opacity = '0'; }, 120);
  }

  /** Hides the crosshair, hotbar and bars while a screen (inventory, chest) is open over the game. */
  showWorldHud(show: boolean): void {
    for (const e of this.root.querySelectorAll<HTMLElement>('.hv-cross, .hv-ring, .hv-hotbar, .hv-label, .hv-breath, .hv-vitals, .hv-focusbar')) e.style.visibility = show ? '' : 'hidden';
  }

  setDebug(text: string): void {
    this.debugEl.style.display = this.debugVisible ? '' : 'none';
    if (this.debugVisible) this.debugEl.textContent = text;
  }
}
