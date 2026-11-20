// Looking through the telescope (docs/PHASE8.md, 5): a round field on black, cross-hairs, and a label when a
// known thing is in them. The game narrows the camera and turns it; this is only what lies over the picture.

const CSS = `
.sc-wrap[hidden] { display: none; }
.sc-wrap { position: absolute; inset: 0; pointer-events: none; }
.sc-mask { position: absolute; inset: 0; background: radial-gradient(circle at 50% 50%, transparent 0, transparent min(41vh, 41vw), rgba(0,0,0,.96) min(43vh, 43vw), #000 min(46vh, 46vw)); }
.sc-hair { position: absolute; left: 50%; top: 50%; width: min(82vh, 82vw); height: min(82vh, 82vw); transform: translate(-50%, -50%); }
.sc-hair::before, .sc-hair::after { content: ''; position: absolute; background: rgba(20,20,20,.75); }
.sc-hair::before { left: 0; right: 0; top: 50%; height: 1px; }
.sc-hair::after { top: 0; bottom: 0; left: 50%; width: 1px; }
.sc-label { position: absolute; left: 50%; top: calc(50% + min(22vh, 22vw)); transform: translateX(-50%); color: #f4f1e8; font: 15px Georgia, serif; text-shadow: 0 1px 3px #000, 0 0 8px #000; white-space: nowrap; }
.sc-help { position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%); color: rgba(244,241,232,.6); font: 12px Georgia, serif; }
`;

export class ScopeView {
  private wrap: HTMLDivElement;
  private label: HTMLDivElement;

  constructor(root: HTMLElement) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.wrap = document.createElement('div');
    this.wrap.className = 'sc-wrap';
    this.wrap.hidden = true;
    const mask = document.createElement('div'); mask.className = 'sc-mask';
    const hair = document.createElement('div'); hair.className = 'sc-hair';
    this.label = document.createElement('div'); this.label.className = 'sc-label';
    const help = document.createElement('div'); help.className = 'sc-help'; help.textContent = 'Look round to aim · E or Esc to step back';
    this.wrap.append(mask, hair, this.label, help);
    root.appendChild(this.wrap);
  }

  get isOpen(): boolean { return !this.wrap.hidden; }
  show(): void { this.wrap.hidden = false; this.label.textContent = ''; }
  hide(): void { this.wrap.hidden = true; }
  setLabel(text: string): void { if (this.label.textContent !== text) this.label.textContent = text; }
}
