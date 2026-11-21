// The game's icon (the owner, 2026-11-21: "we need a nice favicon for the app"), drawn by code in tools/icon.ts
// in four designs for the owner to choose from. Once one is chosen, `tools/icon.ts <design>` writes it to
// assets/icon/ and inline into index.html, and these tests hold the two to the drawing code.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { DESIGNS, SIZES, pngFor, ico, type Design } from '../tools/icon.ts';

const path = (p: string) => new URL(`../${p}`, import.meta.url);
const file = (p: string) => readFileSync(path(p));
const pngSize = (b: Buffer) => {
  expect(b.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};
const designs = Object.keys(DESIGNS) as Design[];

describe('the icon designs', () => {
  it('draw at every store size', () => {
    for (const d of designs)
      for (const s of SIZES) {
        expect(DESIGNS[d](s).length, `${d} ${s}`).toBe(s * s * 4);
        expect(pngSize(pngFor(d, s)), `${d} ${s}`).toEqual([s, s]);
      }
  });

  it('read at 16 and 32 px: a dark or clear edge, a bright middle, the lamp glowing warm', () => {
    for (const d of designs)
      for (const s of [16, 32]) {
        const px = DESIGNS[d](s);
        const at = (x: number, y: number) => { const i = (y * s + x) * 4; return { a: px[i + 3], luma: 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2], warm: px[i] - px[i + 2] }; };
        for (const [x, y] of [[0, 0], [s - 1, 0]]) { const c = at(x, y); expect(c.a === 0 || c.luma < 40, `${d} ${s} px corner`).toBe(true); }
        let bright = 0, warm = 0;
        for (let y = Math.ceil(s * 0.2); y < s * 0.8; y++)
          for (let x = Math.ceil(s * 0.3); x < s * 0.7; x++) { const c = at(x, y); if (c.luma > 180) bright++; if (c.warm > 80 && c.luma > 120) warm++; }
        expect(bright / (s * s), `${d} ${s} px: bright middle`).toBeGreaterThan(0.05);
        expect(warm / (s * s), `${d} ${s} px: the lamp's glow`).toBeGreaterThan(0.03);
      }
  });

  it('pack 16, 32 and 48 px into a valid .ico', () => {
    const i = ico('falls', [16, 32, 48]);
    expect([i.readUInt16LE(2), i.readUInt16LE(4)]).toEqual([1, 3]);
    let next = 6 + 16 * 3;
    [16, 32, 48].forEach((s, n) => {
      const e = 6 + 16 * n, len = i.readUInt32LE(e + 8), at = i.readUInt32LE(e + 12);
      expect([i[e], i[e + 1], i.readUInt16LE(e + 4), i.readUInt16LE(e + 6)]).toEqual([s, s, 1, 32]);
      expect(at).toBe(next);
      expect(pngSize(i.subarray(at, at + len))).toEqual([s, s]);
      next = at + len;
    });
    expect(next).toBe(i.length);
  });
});

describe('the icon in the page', () => {
  const html = file('index.html').toString();
  const chosen = html.match(/<!-- icon: written by tools\/icon\.ts \((\w+)\) -->/)?.[1] as Design | undefined;

  it('is empty until the owner picks a design, then is the chosen one, inline, matching assets/icon', () => {
    if (!chosen) {
      expect(html).toContain('<link rel="icon" href="data:," />');
      return;
    }
    expect(designs).toContain(chosen);
    const links = [...html.matchAll(/<link rel="(icon|apple-touch-icon)"[^>]*sizes="(\d+)x\2" href="data:image\/png;base64,([^"]+)"/g)];
    expect(links.map((m) => [m[1], Number(m[2])])).toEqual([['icon', 16], ['icon', 32], ['apple-touch-icon', 180]]);
    for (const m of links) expect(Buffer.from(m[3], 'base64').equals(pngFor(chosen, Number(m[2])))).toBe(true);
    for (const s of SIZES) expect(file(`assets/icon/icon-${s}.png`).equals(pngFor(chosen, s)), `icon-${s}.png is stale: run tools/icon.ts ${chosen}`).toBe(true);
    expect(file('assets/icon/icon.ico').equals(ico(chosen, [16, 32, 48]))).toBe(true);
  });

  it('has no files in assets/icon before a design is chosen', () => {
    if (!chosen) expect(existsSync(path('assets/icon/icon-16.png'))).toBe(false);
  });
});
