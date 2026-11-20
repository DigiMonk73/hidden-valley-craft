// Every chunk's geometry draws with one shared index buffer (quad k uses vertices 4k…4k+3): 3.1 MB,
// sent to the graphics card once.
//
// three.js deletes a geometry's index from the card when the geometry is disposed (r187,
// WebGLGeometries.destroyGeometry → WebGLAttributes.remove), and it keeps one card-side buffer per
// attribute object, not per geometry. Disposing one chunk's geometry with the shared index still on
// it therefore deleted the buffer for all of them, and the next frame sent all 3.1 MB again
// (WebGLBindingStates.setup → WebGLAttributes.update → gl.bufferData): once for every frame in
// which a chunk was remeshed or unloaded. So the index is taken off first.

import type { BufferGeometry } from 'three';

export function disposeChunkGeometry(g: BufferGeometry): void {
  g.setIndex(null);
  g.dispose();
}
