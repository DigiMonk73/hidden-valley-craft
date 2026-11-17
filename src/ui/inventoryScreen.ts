// The inventory screen (E), and a chest's screen above it when one is open. Click picks up or puts
// down a stack, right-click splits, Shift-click moves a stack across to the other side.

import { iconFor } from './icons.ts';
import { itemLabel, toolOf, maxStack } from '../world/items.ts';
import { BLOCK_DEFS, B_RENDER, RENDER } from '../world/blocks.ts';
import { clickSlot, quickMove, HOTBAR, type Inventory, type Stack } from '../sim/inventory.ts';
import { recipesAt, canMake, make, STATION_LABEL, type Station, type Recipe } from '../sim/crafting.ts';

const CSS = `
.iv-wrap[hidden], .iv-tip[hidden] { display: none; }
.iv-wrap { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: auto;
  background: rgba(5, 8, 6, .55); }
.iv-panel { --slot: clamp(34px, calc((100vh - 200px) / 7.2), 50px); max-height: 96vh; overflow: auto; padding: 14px 16px; border-radius: 12px; background: rgba(24, 32, 26, .96); border: 1px solid rgba(255,255,255,.08);
  box-shadow: 0 20px 60px rgba(0,0,0,.5); user-select: none; max-width: 96vw; }
.iv-title { font-size: 13px; text-transform: uppercase; letter-spacing: .8px; opacity: .65; margin: 6px 0 6px; }
.iv-grid { display: grid; grid-template-columns: repeat(9, var(--slot)); gap: 4px; }
.iv-gap { height: 10px; }
.iv-slot { position: relative; width: var(--slot); height: var(--slot); border-radius: 6px; background: rgba(0,0,0,.3); border: 2px solid rgba(255,255,255,.12); }
.iv-slot:hover { border-color: rgba(255, 231, 176, .7); }
.iv-slot.sel { border-color: #ffe7b0; }
.iv-slot img { position: absolute; inset: 1px; width: calc(100% - 2px); height: calc(100% - 2px); image-rendering: pixelated; pointer-events: none; }
.iv-slot span { position: absolute; right: 3px; bottom: 1px; font-size: 12px; font-weight: 700; text-shadow: 0 1px 2px #000, 0 0 2px #000; pointer-events: none; }
.iv-slot i { position: absolute; left: 4px; right: 4px; bottom: 3px; height: 3px; border-radius: 2px; background: #6fd36f; pointer-events: none; }
.iv-cursor { position: fixed; width: 44px; height: 44px; pointer-events: none; z-index: 10; }
.iv-cursor img { width: 44px; height: 44px; image-rendering: pixelated; }
.iv-cursor span { position: absolute; right: 0; bottom: -2px; font-size: 12px; font-weight: 700; text-shadow: 0 1px 2px #000; }
.iv-tip { position: fixed; padding: 4px 8px; border-radius: 6px; background: rgba(10,14,11,.95); font-size: 13px; pointer-events: none; z-index: 11; white-space: nowrap; }
.iv-help { margin-top: 10px; font-size: 12px; opacity: .6; }
.iv-cols { display: flex; gap: 18px; align-items: flex-start; }
.iv-recipes { width: 300px; max-height: 70vh; overflow: auto; display: flex; flex-direction: column; gap: 6px; padding-right: 4px; }
.iv-recipe { display: grid; grid-template-columns: 34px 1fr auto; gap: 8px; align-items: center; padding: 6px; border-radius: 8px; background: rgba(255,255,255,.04); }
.iv-recipe.off { opacity: .45; }
.iv-recipe img { width: 32px; height: 32px; image-rendering: pixelated; }
.iv-recipe .name { font-size: 13px; font-weight: 600; }
.iv-recipe .needs { display: flex; flex-wrap: wrap; gap: 6px; font-size: 11px; opacity: .85; margin-top: 2px; }
.iv-recipe .needs span { display: inline-flex; align-items: center; gap: 2px; }
.iv-recipe .needs img { width: 16px; height: 16px; }
.iv-recipe .needs .short { color: #ff9b8a; }
.iv-make { cursor: pointer; border: 0; border-radius: 6px; padding: 6px 10px; font: inherit; font-weight: 700; background: #c98f3e; color: #1b130a; }
.iv-make:disabled { background: #444; color: #999; cursor: default; }
`;

export class InventoryScreen {
  private wrap: HTMLDivElement;
  private panel: HTMLDivElement;
  private cursorEl: HTMLDivElement;
  private tip: HTMLDivElement;
  private inv: Inventory | null = null;
  private chest: { title: string; slots: (Stack | null)[] } | null = null;
  private cursor: Stack | null = null;
  private station: Station = 'hand';
  onChange: () => void = () => {};
  /** Called when something is made, with what it was (for a sound). */
  onMake: (r: Recipe) => void = () => {};

  constructor(root: HTMLElement) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.wrap = document.createElement('div');
    this.wrap.className = 'iv-wrap';
    this.wrap.hidden = true;
    this.panel = document.createElement('div');
    this.panel.className = 'iv-panel';
    this.wrap.appendChild(this.panel);
    this.cursorEl = document.createElement('div');
    this.cursorEl.className = 'iv-cursor';
    this.tip = document.createElement('div');
    this.tip.className = 'iv-tip';
    this.tip.hidden = true;
    this.wrap.append(this.cursorEl, this.tip);
    root.appendChild(this.wrap);
    this.wrap.addEventListener('mousemove', (e) => {
      this.cursorEl.style.left = `${e.clientX - 22}px`;
      this.cursorEl.style.top = `${e.clientY - 22}px`;
      this.tip.style.left = `${e.clientX + 16}px`;
      this.tip.style.top = `${e.clientY + 14}px`;
    });
    this.wrap.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get isOpen(): boolean { return !this.wrap.hidden; }

  open(inv: Inventory, chest: { title: string; slots: (Stack | null)[] } | null, station: Station = 'hand'): void {
    this.inv = inv;
    this.chest = chest;
    this.station = station;
    this.cursor = null;
    this.wrap.hidden = false;
    this.render();
  }

  /** Closes the screen; anything held on the cursor goes back into the inventory. */
  close(): void {
    if (this.cursor && this.inv) {
      const left = this.inv.add(this.cursor.id, this.cursor.count);
      if (left > 0 && this.chest) { const spare = this.chest.slots.findIndex((s) => !s); if (spare >= 0) this.chest.slots[spare] = { id: this.cursor.id, count: left }; }
    }
    this.cursor = null;
    this.wrap.hidden = true;
    this.tip.hidden = true;
    this.inv = null;
    this.chest = null;
  }

  private render(): void {
    const inv = this.inv!;
    this.panel.innerHTML = '';
    // Recipes on the left (a station's, or what can be made by hand), the slots on the right.
    const cols = document.createElement('div');
    cols.className = 'iv-cols';
    const right = document.createElement('div');
    if (!this.chest) {
      const left = document.createElement('div');
      const t = document.createElement('div');
      t.className = 'iv-title';
      // In builder's mode the inventory offers every block instead of recipes.
      const palette = inv.creative && this.station === 'hand';
      t.textContent = palette ? 'Builder’s palette: click a block, then a slot' : this.station === 'hand' ? 'Make by hand' : STATION_LABEL[this.station];
      left.append(t, palette ? this.palette() : this.recipeList(inv));
      cols.append(left);
    }
    cols.append(right);
    this.panel.append(cols);
    const panel = this.panel;
    this.panel = right as HTMLDivElement;
    try { this.renderSlots(inv); } finally { this.panel = panel; }
    const help = document.createElement('div');
    help.className = 'iv-help';
    help.textContent = 'Click: pick up / put down · Right click: take half or place one · Shift-click: move across · E or Esc: close';
    this.panel.appendChild(help);
    this.renderCursor();
  }

  /** Every block that can be built with (one form of each, no crops or water), as a pick-up grid. */
  private palette(): HTMLDivElement {
    const grid = document.createElement('div');
    grid.className = 'iv-grid';
    grid.style.gridTemplateColumns = 'repeat(7, var(--slot))';
    grid.style.maxHeight = '70vh';
    grid.style.overflow = 'auto';
    BLOCK_DEFS.forEach((d, id) => {
      if (id === 0 || d.base && d.base !== d.name || d.crop || B_RENDER[id] === RENDER.liquid || d.hardness < 0) return;
      const cell = document.createElement('div');
      cell.className = 'iv-slot';
      const img = document.createElement('img');
      img.src = iconFor(id);
      cell.appendChild(img);
      cell.title = d.label;
      cell.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.cursor = { id, count: maxStack(id) };
        this.render();
      });
      grid.appendChild(cell);
    });
    return grid;
  }

  private recipeList(inv: Inventory): HTMLDivElement {
    const list = document.createElement('div');
    list.className = 'iv-recipes';
    const recipes = recipesAt(this.station);
    if (!recipes.length) {
      const p = document.createElement('div');
      p.className = 'iv-help';
      p.textContent = this.station === 'tannery' ? 'Hides come from hunting outside the valley.' : 'Nothing to make here yet.';
      list.append(p);
    }
    for (const r of recipes) {
      const ok = canMake(inv, r);
      const row = document.createElement('div');
      row.className = 'iv-recipe' + (ok ? '' : ' off');
      const img = document.createElement('img');
      img.src = iconFor(r.out[0]);
      const mid = document.createElement('div');
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = `${itemLabel(r.out[0])}${r.out[1] > 1 ? ` ×${r.out[1]}` : ''}`;
      const needs = document.createElement('div');
      needs.className = 'needs';
      for (const [id, n] of r.in) {
        const have = inv.count(id);
        const sp = document.createElement('span');
        if (have < Math.max(1, n)) sp.className = 'short';
        const ic = document.createElement('img');
        ic.src = iconFor(id);
        sp.append(ic, document.createTextNode(n === 0 ? `${itemLabel(id)} (kept)` : `${have}/${n}`));
        sp.title = itemLabel(id);
        needs.append(sp);
      }
      mid.append(name, needs);
      const btn = document.createElement('button');
      btn.className = 'iv-make';
      btn.textContent = 'Make';
      btn.disabled = !ok;
      btn.onclick = () => { if (make(inv, r)) { this.onMake(r); this.onChange(); this.render(); } };
      row.append(img, mid, btn);
      list.append(row);
    }
    return list;
  }

  private renderSlots(inv: Inventory): void {
    // Where Shift-click sends a stack from each section: [slots, first, end].
    type Target = [(Stack | null)[], number, number];
    const section = (title: string, slots: (Stack | null)[], from: number, to: number, target: Target) => {
      const t = document.createElement('div');
      t.className = 'iv-title';
      t.textContent = title;
      const g = document.createElement('div');
      g.className = 'iv-grid';
      for (let i = from; i < to; i++) g.appendChild(this.slotEl(slots, i, target, slots === inv.slots && i < HOTBAR && i === inv.selected));
      this.panel.append(t, g);
    };
    const chest = this.chest;
    if (chest) section(chest.title, chest.slots, 0, chest.slots.length, [inv.slots, 0, inv.size]);
    section(inv.size > 36 ? 'Backpack (expedition)' : 'Backpack', inv.slots, HOTBAR, inv.size, chest ? [chest.slots, 0, chest.slots.length] : [inv.slots, 0, HOTBAR]);
    section('Hotbar', inv.slots, 0, HOTBAR, chest ? [chest.slots, 0, chest.slots.length] : [inv.slots, HOTBAR, inv.size]);
  }

  private slotEl(slots: (Stack | null)[], i: number, target: [(Stack | null)[], number, number], selected: boolean): HTMLDivElement {
    const d = document.createElement('div');
    d.className = 'iv-slot' + (selected ? ' sel' : '');
    const s = slots[i];
    if (s) {
      const img = document.createElement('img');
      img.src = iconFor(s.id);
      d.appendChild(img);
      if (s.count > 1) { const n = document.createElement('span'); n.textContent = String(s.count); d.appendChild(n); }
      const tool = toolOf(s.id);
      if (tool && s.wear) { const bar = document.createElement('i'); bar.style.width = `${Math.max(4, 42 * (1 - s.wear / tool.uses))}px`; d.appendChild(bar); }
    }
    d.addEventListener('mouseenter', () => {
      const st = slots[i];
      this.tip.hidden = !st || !!this.cursor;
      if (st) this.tip.textContent = itemLabel(st.id) + (toolOf(st.id) ? ` (${toolOf(st.id)!.uses - (st.wear ?? 0)} uses left)` : '');
    });
    d.addEventListener('mouseleave', () => (this.tip.hidden = true));
    d.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (e.shiftKey && !this.cursor) quickMove(slots, i, target[0], target[1], target[2]);
      else this.cursor = clickSlot(slots, i, this.cursor, e.button === 2);
      this.tip.hidden = true;
      this.render();
      this.onChange();
    });
    return d;
  }

  private renderCursor(): void {
    this.cursorEl.innerHTML = '';
    if (!this.cursor) return;
    const img = document.createElement('img');
    img.src = iconFor(this.cursor.id);
    this.cursorEl.appendChild(img);
    if (this.cursor.count > 1) { const n = document.createElement('span'); n.textContent = String(this.cursor.count); this.cursorEl.appendChild(n); }
  }
}
