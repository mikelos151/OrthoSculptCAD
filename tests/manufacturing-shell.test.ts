import { expect, it } from 'vitest';
import type { MeshData } from '../src/types';
import { alignPCA, calibrateMesh, createDemoMesh, measureMesh, repairMesh, validateMesh } from '../src/geometry/index';
import { buildShell } from '../src/manufacturing/index';
export function cylinder(topCap = false): MeshData {
  const n = 32; const p: number[] = []; const ix: number[] = [];
  for (const z of [0, 50, 100]) for (let i = 0; i < n; i++) { const a = i * 2 * Math.PI / n; p.push(30 * Math.cos(a), 30 * Math.sin(a), z); }
  p.push(0, 0, 0);
  for (let ring = 0; ring < 2; ring++) for (let i = 0; i < n; i++) { const j = (i + 1) % n; const a = ring * n + i, b = ring * n + j; ix.push(a, b, a + n, b, b + n, a + n); }
  for (let i = 0; i < n; i++) ix.push(96, (i + 1) % n, i);
  if (topCap) { p.push(0, 0, 100); for (let i = 0; i < n; i++) ix.push(97, 64 + i, 64 + (i + 1) % n); }
  return { name: 'Analytic cylinder mm', positions: new Float32Array(p), indices: new Uint32Array(ix) };
}
it('builds watertight normal-offset shell, preserving inner surface and stitching proximal ring', () => {
  const input = { ...cylinder(), source: 'synthetic' as const }; const snapshot = input.positions.slice();
  const result = buildShell(input, { thickness: 3, flareAngle: 0, flareRadius: 0 });
  expect(result.mesh.source).toBe('synthetic');
  expect(input.positions).toEqual(snapshot);
  const n = input.positions.length / 3;
  expect(result.mesh.positions.slice(0, n * 3)).toEqual(input.positions);
  for (let i = 0; i < n; i++) {
    const d = Math.hypot(...[0, 1, 2].map(k => result.mesh.positions[(i + n) * 3 + k] - input.positions[i * 3 + k]));
    expect(d).toBeCloseTo(3, 4);
  }
  const topology = validateMesh(result.mesh);
  expect(topology.watertight).toBe(true); expect(topology.signedVolume).toBeGreaterThan(0);
  expect(result.warnings.join(' ')).toMatch(/samoprzeci|koliz/i);
  expect(result.warnings.join(' ')).toMatch(/wytrzyma/i);
});
it('safely removes a planar proximal cap before shelling and applies optional outer flare only', () => {
  const result = buildShell(cylinder(true), { thickness: 3, flareAngle: 10, flareRadius: 15 });
  expect(validateMesh(result.mesh).watertight).toBe(true);
  expect(Math.max(...Array.from(result.mesh.positions).filter((_, i) => i % 3 === 0))).toBeGreaterThan(33);
});
it('uses configurable circular flare radius with zero flare preserving the baseline offset', () => {
  const input = cylinder(); const options = { thickness: 3, flareAngle: 20, flareRadius: 15 };
  const zero = buildShell(input, { ...options, flareAngle: 0 }).mesh;
  const flared = buildShell(input, options).mesh; const n = input.positions.length / 3;
  const topX = (n + 64) * 3;
  expect(flared.positions[topX] - zero.positions[topX]).toBeCloseTo(15 * (1 - Math.cos(20 * Math.PI / 180)), 4);
  expect(flared.positions[(n + 32) * 3]).toBe(zero.positions[(n + 32) * 3]);
  expect(flared.positions.slice(0, n * 3)).toEqual(input.positions);
});
it('rejects a pinched nonmanifold vertex even when every edge has at most two faces', () => {
  const m = cylinder(); m.indices = m.indices.map(i => i === 42 ? 32 : i);
  expect(validateMesh(m).nonManifoldEdges).toBe(0);
  expect(() => buildShell(m, { thickness: 3, flareAngle: 0, flareRadius: 0 })).toThrow(/wachlarz|wierzchoł.*manifold/i);
});
it('supports the real wizard composition demo → cap repair → PCA → constant radial calibration → shell', () => {
  const repaired = repairMesh(createDemoMesh()).mesh;
  const aligned = alignPCA(repaired);
  const rows = measureMesh(aligned, 10); const row = rows.find(r => r.valid && r.z > 80 && r.z < 160)!;
  expect(row).toBeDefined();
  const calibrated = calibrateMesh(aligned, [{ z: row.z, circumference: row.circumference * 1.01 }]);
  expect(validateMesh(calibrated).watertight).toBe(true);

  const result = buildShell(calibrated, { thickness: 4, flareAngle: 15, flareRadius: 15 });
  expect(validateMesh(result.mesh).watertight).toBe(true);
  expect(result.mesh.positions.slice(0, calibrated.positions.length)).toEqual(calibrated.positions);
  expect(result.mesh.source).toBe('synthetic');
});
it('rejects nonmanifold mesh, wrong-unit scale and excessive thickness', () => {
  const mesh = cylinder(); const bad = { ...mesh, indices: new Uint32Array([...mesh.indices, ...mesh.indices.slice(0, 3)]) };
  expect(() => buildShell(bad, { thickness: 3, flareAngle: 0, flareRadius: 0 })).toThrow();
  expect(() => buildShell({ ...mesh, positions: mesh.positions.map(v => v / 1000) }, { thickness: 3, flareAngle: 0, flareRadius: 0 })).toThrow();
  expect(() => buildShell(mesh, { thickness: 99, flareAngle: 0, flareRadius: 0 })).toThrow();
});
