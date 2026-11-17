import { type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { statSync } from 'node:fs';
import { resolve } from 'node:path';

// The published page must stay under claude.ai's 16 MB limit; fail the build at 14 MB
// so there is always headroom for the source bundle published beside it.
const MAX_BYTES = 14 * 1024 * 1024;

function sizeGate(): Plugin {
  return {
    name: 'size-gate',
    apply: 'build',
    closeBundle() {
      const file = resolve(import.meta.dirname, 'dist/index.html');
      const bytes = statSync(file).size;
      const mb = (bytes / 1024 / 1024).toFixed(2);
      if (bytes > MAX_BYTES) throw new Error(`dist/index.html is ${mb} MB, over the 14 MB gate`);
      console.log(`size gate: dist/index.html ${mb} MB (limit 14 MB)`);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [viteSingleFile(), sizeGate()],
  // Classic (non-module) workers start in more sandboxed frames than module workers do.
  worker: { format: 'iife' },
  build: {
    target: 'es2022',
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 100_000,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
