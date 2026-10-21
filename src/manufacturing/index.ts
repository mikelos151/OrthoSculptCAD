import type { MeshData } from '../types';
export { buildShell } from './shell';
export { export3MF, manufacturingAvailability } from './threeMF';
import { assertMesh, requireCondition as check } from '../io/validation';

export function exportSTL(mesh: MeshData): Blob {
  assertMesh(mesh);
  const n = mesh.indices.length / 3;
  const buffer = new ArrayBuffer(84 + n * 50); const view = new DataView(buffer);
  new Uint8Array(buffer).set(new TextEncoder().encode(`${mesh.source === 'synthetic' ? 'SYNTHETIC; ' : ''}OrthoSculpt research mesh; units mm; geometry only`));
  view.setUint32(80, n, true);
  const p = mesh.positions; const ix = mesh.indices;
  for (let t = 0; t < n; t++) {
    const a = ix[t * 3] * 3, b = ix[t * 3 + 1] * 3, c = ix[t * 3 + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const normal = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const length = Math.hypot(...normal); check(length > 1e-12, 'STL: zdegenerowany trójkąt.');
    let o = 84 + t * 50;
    for (const v of normal) { view.setFloat32(o, v / length, true); o += 4; }
    for (const i of [a, b, c]) for (let k = 0; k < 3; k++) { view.setFloat32(o, p[i + k], true); o += 4; }
  }
  return new Blob([buffer], { type: 'model/stl' });
}
