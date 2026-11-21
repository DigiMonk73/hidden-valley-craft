// The game's icon (the owner, 2026-11-21: "we need a nice favicon for the app"): drawn by code in tools/icon.ts,
// kept in assets/icon/ at every store size, and carried inline by the page so it stays one file.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SIZES, pngFor, ico, svg, render, draw16, draw32 } from '../tools/icon.ts';

const file = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url));
const pngSize = (b: Buffer) => {
  expect(b.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

describe('the icon', () => {
  it('is kept in assets/icon at every size, as the drawing code makes it today', () => {
    for (const s of SIZES) {
      const b = file(`assets/icon/icon-${s}.png`);
      expect(pngSize(b), `icon-${s}.png`).toEqual([s, s]);
      expect(b.equals(pngFor(s)), `icon-${s}.png is stale: run tools/icon.ts`).toBe(true);
    }
    const i = file('assets/icon/icon.ico');
    expect([i.readUInt16LE(2), i.readUInt16LE(4)]).toEqual([1, 3]);
    expect([0, 1, 2].map((n) => i[6 + 16 * n])).toEqual([16, 32, 48]);
    expect(i.equals(ico([16, 32, 48]))).toBe(true);
    expect(file('assets/icon/icon.svg').toString()).toBe(svg());
  });

  it('is in index.html: the 16 and 32 px favicons and the 180 px touch icon, inline', () => {
    const html = file('index.html').toString();
    expect(html).not.toContain('href="data:,"');
    const links = [...html.matchAll(/<link rel="(icon|apple-touch-icon)"[^>]*sizes="(\d+)x\2" href="data:image\/png;base64,([^"]+)"/g)];
    expect(links.map((m) => [m[1], Number(m[2])])).toEqual([['icon', 16], ['icon', 32], ['apple-touch-icon', 180]]);
    for (const m of links) expect(Buffer.from(m[3], 'base64').equals(file(`assets/icon/icon-${m[2]}.png`))).toBe(true);
  });

  it('is dark at the corners and bright in the middle, so it holds on light and dark tabs', () => {
    for (const [s, g] of [[16, draw16()], [32, draw32()]] as const) {
      const px = render(g, s);
      const luma = (x: number, y: number) => { const i = (y * s + x) * 4; return 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]; };
      for (const [x, y] of [[0, 0], [s - 1, 0]]) expect(luma(x, y), `${s} px corner`).toBeLessThan(40);
      expect(luma(s / 2, s / 2), `${s} px middle`).toBeGreaterThan(180);
      const lit = (x: number, y: number) => { const i = (y * s + x) * 4; return px[i] - px[i + 2] > 80; };
      let warm = 0;
      for (let y = Math.ceil(s * 0.35); y < s * 0.75; y++) for (let x = Math.ceil(s * 0.3); x < s * 0.7; x++) if (lit(x, y)) warm++;
      expect(warm / (s * s), `${s} px: the lamp glows warm behind the falls`).toBeGreaterThan(0.03);
    }
  });
});
