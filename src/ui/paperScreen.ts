// Screens for the builder's things: reading the journal, his computer, the phone, the map table,
// and the safe's keypad. One overlay, filled with whichever is open.

const CSS = `
.pp-wrap[hidden] { display: none; }
.pp-wrap { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: auto; background: rgba(5, 8, 6, .6); }
.pp-panel { width: min(640px, 94vw); max-height: 90vh; overflow: auto; padding: 22px 26px; border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
.pp-paper { background: #efe4c8; color: #2b2116; font-family: Georgia, 'Iowan Old Style', serif; }
.pp-paper h2 { margin: 0 0 4px; font-size: 22px; }
.pp-paper .pp-meta { font-size: 12px; letter-spacing: .6px; text-transform: uppercase; opacity: .6; margin-bottom: 14px; }
.pp-paper p { font-size: 16px; line-height: 1.6; margin: 0; }
.pp-screen { background: #0e1a24; color: #b9f3c8; font-family: ui-monospace, Menlo, monospace; border: 2px solid #2b3b48; }
.pp-screen h2 { margin: 0 0 10px; font-size: 16px; color: #e6f7ea; }
.pp-screen .row { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: 1px dashed rgba(185,243,200,.15); font-size: 14px; }
.pp-screen .dim { opacity: .55; }
.pp-screen .btc { color: #f7b24a; }
.pp-nav { display: flex; justify-content: space-between; align-items: center; margin-top: 18px; }
.pp-btn { cursor: pointer; border: 0; border-radius: 8px; padding: 8px 14px; font: inherit; font-weight: 600; background: rgba(0,0,0,.12); color: inherit; }
.pp-btn:disabled { opacity: .35; cursor: default; }
.pp-keypad { display: grid; grid-template-columns: repeat(3, 64px); gap: 8px; justify-content: center; margin-top: 12px; }
.pp-keypad button { height: 52px; font-size: 20px; }
.pp-code { text-align: center; font-size: 30px; letter-spacing: 12px; margin: 6px 0; min-height: 40px; }
.pp-map canvas { width: 100%; image-rendering: pixelated; border-radius: 6px; display: block; }
.pp-close { margin-top: 14px; font-size: 12px; opacity: .6; text-align: center; }
`;

export class PaperScreen {
  private wrap: HTMLDivElement;
  private panel: HTMLDivElement;
  onClose: () => void = () => {};

  constructor(root: HTMLElement) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.wrap = document.createElement('div');
    this.wrap.className = 'pp-wrap';
    this.wrap.hidden = true;
    this.panel = document.createElement('div');
    this.panel.className = 'pp-panel';
    this.wrap.appendChild(this.panel);
    root.appendChild(this.wrap);
  }

  get isOpen(): boolean { return !this.wrap.hidden; }

  close(): void { this.wrap.hidden = true; this.panel.innerHTML = ''; }

  private open(kind: 'pp-paper' | 'pp-screen'): HTMLDivElement {
    this.panel.className = `pp-panel ${kind}`;
    this.panel.innerHTML = '';
    this.wrap.hidden = false;
    return this.panel;
  }

  private el<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', cls = ''): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    if (text) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  }

  private footer(p: HTMLElement): void { p.append(this.el('div', 'E or Esc to put it down', 'pp-close')); }

  /** The builder's journal, one entry at a time. */
  journal(entries: { title: string; text: string }[], start = 0): void {
    let i = start;
    const show = () => {
      const p = this.open('pp-paper');
      p.append(this.el('div', `The builder's journal · ${i + 1} of ${entries.length}`, 'pp-meta'), this.el('h2', entries[i].title), this.el('p', entries[i].text));
      const nav = this.el('div', '', 'pp-nav');
      const prev = this.el('button', '← Earlier', 'pp-btn'), next = this.el('button', 'Later →', 'pp-btn');
      prev.disabled = i === 0; next.disabled = i === entries.length - 1;
      prev.onclick = () => { i--; show(); };
      next.onclick = () => { i++; show(); };
      nav.append(prev, next);
      p.append(nav);
      this.footer(p);
    };
    show();
  }

  computer(rows: [string, string, string?][], title: string): void {
    const p = this.open('pp-screen');
    p.append(this.el('h2', title));
    for (const [k, v, cls] of rows) {
      const r = this.el('div', '', 'row');
      r.append(this.el('span', k), this.el('span', v, cls ?? ''));
      p.append(r);
    }
    this.footer(p);
  }

  /** A four-digit keypad; `check` says whether the code opens it. */
  keypad(title: string, check: (code: string) => boolean): void {
    const p = this.open('pp-screen');
    p.append(this.el('h2', title));
    const code = this.el('div', '', 'pp-code');
    p.append(code);
    let entered = '';
    const pad = this.el('div', '', 'pp-keypad');
    for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '✓']) {
      const b = this.el('button', k, 'pp-btn');
      b.onclick = () => {
        if (k === 'C') entered = '';
        else if (k === '✓') { if (!check(entered)) { code.textContent = 'WRONG'; entered = ''; return; } }
        else if (entered.length < 4) entered += k;
        code.textContent = entered.replace(/./g, '•');
      };
      pad.append(b);
    }
    p.append(pad);
    this.footer(p);
  }

  map(canvas: HTMLCanvasElement, caption: string): void {
    const p = this.open('pp-paper');
    p.classList.add('pp-map');
    p.append(this.el('div', caption, 'pp-meta'), canvas);
    this.footer(p);
  }
}
