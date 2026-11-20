import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Found publishing Phase 7 (2026-11-20): item icons were drawn on the browser's default 2D canvas, which
// lives on the graphics card. Under software rendering each new icon took over a second and about 100 MB;
// a crate of new items froze the page and then crashed the tab. Every 2D canvas now comes from
// src/platform/canvas.ts, which keeps it on the CPU.
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? sources(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('2D canvases stay on the CPU', () => {
  it('no code outside src/platform makes a 2D canvas context itself', () => {
    const offenders = sources('src').filter((p) => !p.startsWith(join('src', 'platform')) && /getContext\(\s*['"]2d['"]/.test(readFileSync(p, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('the one place that does asks for a CPU canvas', () => {
    const src = readFileSync(join('src', 'platform', 'canvas.ts'), 'utf8');
    expect(src).toMatch(/getContext\('2d',\s*\{\s*willReadFrequently:\s*true\s*\}\)/);
  });
});
