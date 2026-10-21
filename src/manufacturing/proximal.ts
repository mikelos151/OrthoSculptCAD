import type { Bounds, MeshData, Vec3 } from '../types';
import { validateMesh } from '../geometry';
import { requireCondition as check } from '../io/validation';

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const point = (p: Float32Array, i: number): Vec3 => [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const tolerance = (bounds: Bounds) => Math.max(1e-5, Math.hypot(...bounds.size) * 1e-5);
const minNormalZ = Math.cos(Math.PI / 6);
export interface ProximalPlane { center: Vec3; normal: Vec3; tolerance: number; }

/** Ring-plane check is invariant under small PCA tilts; no input coordinates are modified. */
export function readProximalPlane(mesh: MeshData, loop: number[], bounds: Bounds): ProximalPlane {
  const center: Vec3 = [0, 0, 0]; const p = mesh.positions;
  for (const i of loop) for (let k = 0; k < 3; k++) center[k] += p[i * 3 + k] / loop.length;
  const normal: Vec3 = [0, 0, 0];
  for (let i = 0; i < loop.length; i++) {
    const n = cross(sub(point(p, loop[i]), center), sub(point(p, loop[(i + 1) % loop.length]), center));
    for (let k = 0; k < 3; k++) normal[k] += n[k];
  }
  const length = Math.hypot(...normal); check(length > 1e-9, 'Zdegenerowany pierścień proksymalny.');
  const sign = normal[2] < 0 ? -1 : 1; for (let k = 0; k < 3; k++) normal[k] *= sign / length;
  const tol = tolerance(bounds);
  check(normal[2] >= minNormalZ && center[2] > bounds.max[2] - bounds.size[2] * 0.25, 'Pierścień nie jest proksymalny / normalna odchylona ponad 30° od +Z.');
  check(loop.every(i => Math.abs(dot(normal, sub(point(p, i), center))) <= tol), 'Pierścień proksymalny nie jest płaski w tolerancji numerycznej.');
  for (let i = 0; i < p.length / 3; i++) check(dot(normal, sub(point(p, i), center)) <= tol, 'Pierścień nie leży na podpierającej płaszczyźnie proksymalnej.');
  return { center, normal, tolerance: tol };
}

/** Only remove a broad connected coplanar supporting cap, not arbitrary high-Z triangles. */
export function removeProximalCap(mesh: MeshData, bounds: Bounds): { faces: number[]; removed: number } {
  const p = mesh.positions, ix = mesh.indices; const tol = tolerance(bounds);
  const candidates: { normal: Vec3; origin: Vec3; area: number }[] = [];
  for (let t = 0; t < ix.length; t += 3) {
    const vertices = [ix[t], ix[t + 1], ix[t + 2]];
    if (!vertices.every(i => p[i * 3 + 2] >= bounds.max[2] - bounds.size[2] * 0.2)) continue;
    const origin = point(p, vertices[0]); const raw = cross(sub(point(p, vertices[1]), origin), sub(point(p, vertices[2]), origin));
    const area = Math.hypot(...raw); if (area <= 1e-12 || Math.abs(raw[2]) / area < minNormalZ) continue;
    const sign = raw[2] < 0 ? -1 : 1; const normal = raw.map(x => x * sign / area) as Vec3;
    candidates.push({ normal, origin, area });
  }
  // Largest facets give a well-conditioned plane; tiny earcut slivers do not.
  candidates.sort((a, b) => b.area - a.area);
  const attempted: { normal: Vec3; origin: Vec3 }[] = [];
  for (const candidate of candidates) {
    const { normal, origin } = candidate;
    if (attempted.some(c => dot(c.normal, normal) > 0.999999 && Math.abs(dot(c.normal, sub(origin, c.origin))) <= tol)) continue;
    check(attempted.length < 32, 'Zbyt wiele niejednoznacznych płaszczyzn proksymalnych; otwórz siatkę ręcznie.'); attempted.push(candidate);
    let supporting = true;
    for (let i = 0; i < p.length / 3; i++) if (dot(normal, sub(point(p, i), origin)) > tol) { supporting = false; break; }
    if (!supporting) continue;
    const cap: number[] = []; const retained: number[] = []; let area = 0;
    for (let t = 0; t < ix.length; t += 3) {
      const ids = [ix[t], ix[t + 1], ix[t + 2]];
      if (ids.every(i => Math.abs(dot(normal, sub(point(p, i), origin))) <= tol)) {
        cap.push(...ids); area += Math.abs(dot(normal, cross(sub(point(p, ids[1]), point(p, ids[0])), sub(point(p, ids[2]), point(p, ids[0]))))) / 2;
      } else retained.push(...ids);
    }
    if (cap.length < 6 || area < bounds.size[0] * bounds.size[1] * 0.2) continue;
    const remap = new Map<number, number>(); const capPositions: number[] = []; const capIndices: number[] = [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const i of cap) {
      let j = remap.get(i);
      if (j === undefined) { j = remap.size; remap.set(i, j); const v = point(p, i); capPositions.push(...v); minX = Math.min(minX, v[0]); maxX = Math.max(maxX, v[0]); minY = Math.min(minY, v[1]); maxY = Math.max(maxY, v[1]); }
      capIndices.push(j);
    }
    if (maxX - minX < bounds.size[0] * 0.5 || maxY - minY < bounds.size[1] * 0.5) continue;
    const capMesh = { positions: new Float32Array(capPositions), indices: new Uint32Array(capIndices), name: 'candidate proximal cap' };
    const report = validateMesh(capMesh);
    if (report.nonManifoldEdges || report.inconsistentEdges || report.degenerateTriangles || report.boundaryLoops.length !== 1 || report.boundaryEdges !== report.boundaryLoops[0].length) continue;
    readProximalPlane(capMesh, report.boundaryLoops[0], bounds);
    return { faces: retained, removed: cap.length / 3 };
  }
  throw new Error('Zamknięta siatka bez rozpoznawalnej szerokiej, spójnej płaskiej pokrywy proksymalnej (do 30° od +Z): otwórz ją ręcznie.');
}
