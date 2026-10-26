import type { MeshData, ShellOptions } from '../types';
import type { AuditOptions } from '../geometry/auditTypes';
import { getBounds, validateMesh, auditMesh } from '../geometry/index';
import { assertMesh, finite, LIMITS, requireCondition as check } from '../io/validation';
import { assertVertexFans } from './manifold';
import { readProximalPlane, removeProximalCap } from './proximal';

/** Research-only normal offset, not an exact solid offset or a strength calculation. */
export function buildShell(input: MeshData, options: ShellOptions, auditOptions?: AuditOptions): { mesh: MeshData; warnings: string[] } {
  assertMesh(input);
  check(input.positions.length / 3 * 2 <= LIMITS.vertices && input.indices.length / 3 * 2 <= LIMITS.triangles, 'Powłoka przekroczyłaby limit siatki.');
  check(options && [options.thickness, options.flareAngle, options.flareRadius].every(Number.isFinite), 'Nieprawidłowe parametry powłoki.');
  const bounds = getBounds(input); const [sx, sy, height] = bounds.size;
  check(height >= 10 && height <= 1000 && sx >= 10 && sy >= 10 && sx <= 600 && sy <= 600, 'Skala poza zakresem badawczym: potwierdź jednostki mm i orientację Z proksymalną.');
  const { thickness, flareAngle, flareRadius } = options;
  check(thickness >= 0.5 && thickness <= 20 && thickness <= Math.min(sx, sy, height) * 0.1, 'Nadmierna lub zbyt mała grubość powłoki.');
  check(flareAngle >= 0 && flareAngle <= 30 && flareRadius >= 0 && flareRadius <= height / 2 && (flareAngle === 0 || flareRadius > 0), 'Nieprawidłowe wywinięcie: kąt 0–30°, strefa do połowy wysokości.');
  const initial = validateMesh(input);
  check(initial.nonManifoldEdges === 0 && initial.inconsistentEdges === 0 && initial.degenerateTriangles === 0, 'Powłoka wymaga spójnej, niezdegenerowanej siatki manifold.');
  const warnings = ['EKSPERYMENT: offset normalny nie gwarantuje braku kolizji ani samoprzecięć; wymagana kontrola niezależnym narzędziem.', 'Brak walidacji wytrzymałości, zmęczenia, dopasowania i przydatności klinicznej. Potwierdź mm przed wytwarzaniem.'];
  let faces = Array.from(input.indices);
  if (initial.watertight) {
    const opened = removeProximalCap(input, bounds); faces = opened.faces;
    warnings.push(`Usunięto spójną płaską pokrywę proksymalną (${opened.removed} trójkątów); dopuszczono pochylenie płaszczyzny do 30° od +Z.`);
  }
  // Compact only unreferenced vertices after cap removal; no geometric repair is hidden here.
  const used = new Uint8Array(input.positions.length / 3); for (const i of faces) used[i] = 1;
  const remap = new Uint32Array(used.length); const p: number[] = [];
  for (let i = 0; i < used.length; i++) if (used[i]) { remap[i] = p.length / 3; p.push(input.positions[i * 3], input.positions[i * 3 + 1], input.positions[i * 3 + 2]); }
  faces = faces.map(i => remap[i]);
  const surface: MeshData = { name: input.name, positions: new Float32Array(p), indices: new Uint32Array(faces) };
  const report = validateMesh(surface);
  check(report.nonManifoldEdges === 0 && report.inconsistentEdges === 0 && report.degenerateTriangles === 0 && report.boundaryLoops.length === 1 && report.boundaryEdges === report.boundaryLoops[0].length, 'Wymagany jeden otwarty pierścień proksymalny i zamknięty koniec dystalny.');
  const loop = report.boundaryLoops[0];
  assertVertexFans(surface.indices, surface.positions.length / 3);
  const inputAudit = auditMesh(input, auditOptions);
  check(inputAudit.complete && inputAudit.intersections.length === 0 && inputAudit.checks.filter(c => ['components', 'vertex-manifold', 'self-intersections'].includes(c.id)).every(c => c.status === 'pass'), 'Audit 3D wejścia nie potwierdził braku samoprzecięć (FAIL/UNKNOWN); powłoka zablokowana.');
  warnings.push('Odległość przesunięcia wierzchołków wzdłuż normalnych NIE jest gwarantowaną minimalną grubością ściany; wymagana niezależna kontrola grubości.');
  const plane = readProximalPlane(surface, loop, bounds);
  const n = p.length / 3;
  check(n * 2 <= LIMITS.vertices && faces.length / 3 * 2 + loop.length * 2 <= LIMITS.triangles, 'Powłoka przekroczyłaby limit siatki.');
  const boundary = new Set(loop.map((a, i) => { const b = loop[(i + 1) % loop.length]; return `${Math.min(a, b)}:${Math.max(a, b)}`; }));
  let rim: [number, number][] = [];
  // Connectivity through edges rejects disconnected shells, including point-only connections.
  const faceCount = faces.length / 3; const parent = Uint32Array.from({ length: faceCount }, (_, i) => i);
  const root = (v: number): number => { while (parent[v] !== v) { parent[v] = parent[parent[v]]; v = parent[v]; } return v; };
  const edgeFace = new Map<string, number>();
  for (let t = 0; t < faces.length; t += 3) for (let k = 0; k < 3; k++) {
    const a = faces[t + k], b = faces[t + (k + 1) % 3]; const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
    if (boundary.has(key)) rim.push([a, b]);
    const previous = edgeFace.get(key); if (previous === undefined) edgeFace.set(key, t / 3); else parent[root(t / 3)] = root(previous);
  }
  check(parent.every((_, i) => root(i) === root(0)), 'Powłoka wymaga jednej spójnej powierzchni.');
  // Close virtually at the proximal plane only for an origin-independent winding test.
  let volume = report.signedVolume;
  const [cx, cy, cz] = plane.center;
  for (const [a, b] of rim) {
    const ax = p[a * 3], ay = p[a * 3 + 1], az = p[a * 3 + 2];
    const bx = p[b * 3], by = p[b * 3 + 1], bz = p[b * 3 + 2];
    volume += (cx * (by * az - bz * ay) + cy * (bz * ax - bx * az) + cz * (bx * ay - by * ax)) / 6;
  }
  check(Math.abs(volume) > sx * sy * height * 1e-8, 'Nie można ustalić orientacji objętości powierzchni.');
  if (volume < 0) { for (let t = 0; t < faces.length; t += 3) [faces[t + 1], faces[t + 2]] = [faces[t + 2], faces[t + 1]]; rim = rim.map(([a, b]) => [b, a]); warnings.push('Odwrócono globalne nawinięcie powierzchni na zewnętrzne.'); }
  const normals = new Float64Array(p.length);
  for (let t = 0; t < faces.length; t += 3) {
    const a = faces[t] * 3, b = faces[t + 1] * 3, c = faces[t + 2] * 3;
    const u = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
    const v = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
    const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    for (const i of [a, b, c]) for (let k = 0; k < 3; k++) normals[i + k] += normal[k];
  }
  const positions = new Float32Array(p.length * 2); positions.set(p);
  for (let i = 0; i < n; i++) {
    const o = i * 3; const length = Math.hypot(normals[o], normals[o + 1], normals[o + 2]); check(length > 1e-12, 'Nieokreślona normalna wierzchołka.');
    for (let k = 0; k < 3; k++) positions[p.length + o + k] = finite(p[o + k] + thickness * normals[o + k] / length);
    // Circular flare profile of radius R: axial span R sin(theta), top shift R(1-cos(theta)).
    // Evaluated at existing mesh vertices only; it does not add clinical trim-line geometry.
    if (flareAngle > 0) {
      const span = flareRadius * Math.sin(flareAngle * Math.PI / 180);
      const delta = [p[o] - cx, p[o + 1] - cy, p[o + 2] - cz];
      const axial = delta.reduce((s, value, k) => s + value * plane.normal[k], 0);
      const d = Math.max(0, Math.min(span, axial + span));
      const radial = delta.map((value, k) => value - axial * plane.normal[k]);
      const r = Math.hypot(...radial);
      const shift = flareRadius - Math.sqrt(Math.max(0, flareRadius * flareRadius - d * d));
      if (r > 1e-9) for (let k = 0; k < 3; k++) positions[p.length + o + k] += shift * radial[k] / r;
    }
  }
  const indices = new Uint32Array(faces.length * 2 + rim.length * 6); let cursor = 0;
  for (let t = 0; t < faces.length; t += 3) { const [a, b, c] = faces.slice(t, t + 3); indices.set([a, c, b, a + n, b + n, c + n], cursor); cursor += 6; }
  for (const [a, b] of rim) { indices.set([b + n, a + n, a, b + n, a, b], cursor); cursor += 6; }
  const attributes: Pick<MeshData, 'colors' | 'uvs' | 'textureUrl'> = {};
  for (const [key, stride] of [['colors', 3], ['uvs', 2]] as const) {
    const source = input[key];
    if (!source) continue;
    const target = new Float32Array(n * stride * 2);
    for (let i = 0; i < used.length; i++) if (used[i]) {
      target.set(source.subarray(i * stride, (i + 1) * stride), remap[i] * stride);
      target.set(source.subarray(i * stride, (i + 1) * stride), (n + remap[i]) * stride);
    }
    attributes[key] = target;
  }
  if (input.textureUrl) attributes.textureUrl = input.textureUrl;
  const mesh: MeshData = { positions, indices, ...attributes, ...(input.source ? { source: input.source } : {}), name: `${input.name.slice(0, 180)} — powłoka badawcza` };
  assertMesh(mesh); const final = validateMesh(mesh); check(final.watertight && final.signedVolume > 0, 'Offset dał niepoprawną topologię/objętość; eksport przerwany.');
  const finalAudit = auditMesh(mesh, auditOptions);
  check(finalAudit.complete && finalAudit.orientation === 'outward' && finalAudit.intersections.length === 0, 'Audit 3D offsetu: samoprzecięcia lub wynik UNKNOWN; powłoka i jej eksport zablokowane.');
  if (input.colors || input.textureUrl || input.uvs) warnings.push('RGB/UV/tekstura zachowane na obu warstwach modelu powłoki; STL i eksport geometryczny nie gwarantują przeniesienia tych atrybutów do CAM. Zachowaj projekt źródłowy.');
  return { mesh, warnings };
}
