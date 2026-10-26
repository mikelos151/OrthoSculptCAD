import { expect, it } from 'vitest';
import { auditMesh } from '../src/geometry/audit';
import { deformationColors } from '../src/geometry/deformation';
import { parsePLY } from '../src/io/ply';
import { loadProject, saveProject } from '../src/io/project';
import type { MeshData } from '../src/types';

const tetraPositions = [0, 0, 0, 60, 0, 0, 0, 60, 0, 0, 0, 100];
const tetraIndices = [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3];
function tetraPLY(lastColor = '255 0 0'): Uint8Array {
  return new TextEncoder().encode('ply\nformat ascii 1.0\nelement vertex 4\nproperty float x\nproperty float y\nproperty float z\nelement face 4\nproperty list uchar int vertex_indices\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n' +
    '0 0 0\n60 0 0\n0 60 0\n0 0 100\n3 0 2 1 255 0 0\n3 0 1 3 255 0 0\n3 0 3 2 255 0 0\n3 1 2 3 ' + lastColor + '\n');
}

it('rejects conflicting incident face RGB with vertex-RGB export instructions instead of breaking topology', () => {
  expect(() => parsePLY(tetraPLY('0 0 255'))).toThrow(/RGB.*(?:vertex|wierzchołk)|(?:vertex|wierzchołk).*RGB/i);
});

it('compares incident face RGB before Float32 rounding can hide a conflict', () => {
  const text = new TextDecoder().decode(tetraPLY('0.50000000001 0 0'))
    .replaceAll('property uchar', 'property double').replaceAll('255 0 0', '0.5 0 0');
  expect(Math.fround(0.5)).toBe(Math.fround(0.50000000001));
  expect(() => parsePLY(new TextEncoder().encode(text))).toThrow(/RGB.*(?:vertex|wierzchołk)/i);
});

it('preserves different face RGB on disjoint indexed vertices without splitting or welding', () => {
  const header = new TextDecoder().decode(tetraPLY()).split('end_header\n')[0]
    .replace('element vertex 4', 'element vertex 6').replace('element face 4', 'element face 2');
  const text = header + 'end_header\n0 0 0\n1 0 0\n0 1 0\n3 0 0\n4 0 0\n3 1 0\n3 0 1 2 255 0 0\n3 3 4 5 0 0 255\n';
  const mesh = parsePLY(new TextEncoder().encode(text));
  expect(Array.from(mesh.indices)).toEqual([0, 1, 2, 3, 4, 5]);
  expect(Array.from(mesh.positions)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0, 3, 0, 0, 4, 0, 0, 3, 1, 0]);
  expect(Array.from(mesh.colors ?? [])).toEqual([1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
  expect(auditMesh(mesh).checks.find(c => c.id === 'self-intersections')?.status).toBe('pass');
});

it('retains shared closed PLY topology when incident face RGB agrees, including project reload', async () => {
  const mesh = parsePLY(tetraPLY(), 'red shared tetrahedron');
  expect(Array.from(mesh.positions)).toEqual(tetraPositions);
  expect(Array.from(mesh.indices)).toEqual(tetraIndices);
  expect(Array.from(mesh.colors ?? [])).toEqual([1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0]);
  const restored = loadProject(await saveProject(mesh, mesh.positions.slice(), []).text()).mesh;
  for (const candidate of [mesh, restored]) {
    const result = auditMesh(candidate);
    expect(result.complete).toBe(true);
    expect(result.intersections).toEqual([]);
    expect(result.orientation).toBe('outward');
    for (const id of ['components', 'watertight', 'self-intersections'])
      expect(result.checks.find(c => c.id === id)?.status).toBe('pass');
    expect(candidate.positions).toEqual(mesh.positions);
    expect(candidate.indices).toEqual(mesh.indices);
    expect(candidate.colors).toEqual(mesh.colors);
  }
});

function edgePair(height: number, scale = 1): MeshData {
  return {
    name: 'coplanar shared-edge sliver',
    positions: new Float32Array([0, 0, 0, 2 * scale, 0, 0, 0, 2 * scale, 0, scale, height * scale, 0]),
    indices: new Uint32Array([0, 1, 2, 1, 0, 3]),
  };
}

it.each([3e-9, 1e-9, 1e-10])('never passes positive coplanar overlap beyond a shared edge at height %s', height => {
  const result = auditMesh(edgePair(height));
  const status = result.checks.find(c => c.id === 'self-intersections')?.status;
  expect(['fail', 'unknown']).toContain(status);
  if (status === 'unknown') expect(result.complete).toBe(false);
});

it.each([0, 8])('rejects an UNKNOWN nonplanar baseline instead of reporting green zero for displacement %s', displacement => {
  const baseline: MeshData = {
    name: 'open tetrahedron baseline',
    positions: new Float32Array([0, 0, 0, 60, 0, 0, 0, 60, 0, 0, 0, 100]),
    indices: new Uint32Array([0, 2, 1, 0, 1, 3, 0, 3, 2]),
  };
  const original = baseline.positions.slice();
  const current = { ...baseline, positions: baseline.positions.slice() };
  current.positions[0] += displacement;
  expect(auditMesh(baseline).orientation).toBe('unknown');
  expect(() => deformationColors(current, baseline.positions)).toThrow(/baseline.*orientation.*unknown|orientation.*unknown.*baseline/i);
  expect(baseline.positions).toEqual(original);
  expect(current.positions[0]).toBe(displacement);
});

it.each([1, 1e-7])('preserves legal coplanar shared edges at scale %s', scale => {
  const result = auditMesh(edgePair(-1, scale));
  expect(result.complete).toBe(true);
  expect(result.intersections).toEqual([]);
  expect(result.checks.find(c => c.id === 'self-intersections')?.status).toBe('pass');
});
