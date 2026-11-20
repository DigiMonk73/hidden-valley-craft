// Small pictures drawn by code (item icons, the map table, the map scrap) use a 2D canvas that is kept
// on the CPU. A browser's default 2D canvas lives on the graphics card: where that card is slow or
// emulated in software, making one and reading it back takes over a second and about 100 MB each, so a
// pack of new icons froze the page and, with enough of them, crashed the tab. `willReadFrequently`
// keeps the canvas in ordinary memory, where these few thousand pixels cost nothing.

export function cpuCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  return { canvas, ctx };
}
