import { describe, it, expect } from 'vitest';
import { createDemoMesh, validateMesh, repairMesh, alignPCA, measureMesh, calibrateMesh, scaleZone } from '../src/geometry';
import { registerLandmarksDetailed } from '../src/geometry/alignment';
import { orientMesh } from '../src/geometry/orientation';
import { auditMesh } from '../src/geometry/audit';
import { buildShell } from '../src/manufacturing';
import type { ComputePayloads } from '../src/compute/types';

describe('Node-only real geometry compute adapter', () => {
  it.each(['analyze', 'orient', 'measure', 'pca', 'register', 'calibrate', 'zone', 'shell'] as const)('dispatches %s to its real pure geometry function', async op => {
    const { runGeometryTask } = await import('../src/compute');
    const mesh = alignPCA(repairMesh(createDemoMesh()).mesh);
    const landmarks: ComputePayloads['register']['landmarks'] = [[0, 30, 100], [30, 0, 100], [0, 0, 0]];
    const options = { thickness: 3, flareAngle: 0, flareRadius: 0 };
    const circumference = measureMesh(mesh, 50).find(r => r.valid)!.circumference;
    const tapes = [{ z: 100, circumference }];
    const payloads: Pick<ComputePayloads, typeof op> = {
      analyze: { mesh, options: { maxPairTests: 20 } }, orient: { mesh }, measure: { mesh, interval: 50 }, pca: { mesh },
      register: { mesh, landmarks, flexionDegrees: 0, side: 'right' }, calibrate: { mesh, tapes },
      zone: { mesh, percent: 2, minZ: 0, maxZ: 300 }, shell: { mesh, options },
    };
    const result = await runGeometryTask(op, payloads[op]);
    const expected = () => {
      switch (op) {
        case 'analyze': return auditMesh(mesh, { maxPairTests: 20 });
        case 'orient': return orientMesh(mesh);
        case 'measure': return measureMesh(mesh, 50);
        case 'pca': return alignPCA(mesh);
        case 'register': return registerLandmarksDetailed(mesh, { anterior: landmarks[0], lateral: landmarks[1], distal: landmarks[2] }, 0, 'right');
        case 'calibrate': return calibrateMesh(mesh, tapes);
        case 'zone': return scaleZone(mesh, 2, 0, 300);
        case 'shell': return buildShell(mesh, options);
      }
    };
    const reference = expected();
    if (op === 'analyze') expect({ ...result, elapsedMs: 0 }).toEqual({ ...reference, elapsedMs: 0 });
    else expect(result).toEqual(reference);
    expect(mesh.positions.byteLength).toBeGreaterThan(0);
  });

  it('requires explicit laterality and flexion rather than accepting runtime undefined defaults', async () => {
    const { runGeometryTask } = await import('../src/compute');
    const mesh = createDemoMesh();
    const payload: ComputePayloads['register'] = { mesh, landmarks: [[0, 30, 100], [30, 0, 100], [0, 0, 0]], side: 'right', flexionDegrees: 0 };
    await expect(runGeometryTask('register', { ...payload, side: undefined as unknown as 'right' })).rejects.toThrow();
    await expect(runGeometryTask('register', { ...payload, flexionDegrees: undefined as unknown as number })).rejects.toThrow();
  });
  it('measures sorted unique exact heights with one real index and trapezoidal segment estimates', async () => {
    const { runGeometryTask } = await import('../src/compute');
    const { SliceIndex } = await import('../src/geometry');
    const mesh = createDemoMesh(), index = new SliceIndex(mesh);
    const rows = await runGeometryTask('measureAt', { mesh, heights: [150, 50, -10, 100, 50] });
    expect(rows.map(r => r.z)).toEqual([-10, 50, 100, 150]);
    for (const row of rows) {
      const slice = index.slice(row.z);
      expect(row).toMatchObject({ circumference: slice.perimeter, area: slice.area, ap: slice.ap, ml: slice.ml, valid: slice.valid });
    }
    expect(rows[0].segmentVolume).toBeNull();
    expect(rows[1].segmentVolume).toBeNull();
    expect(rows[2].segmentVolume).toBe((rows[1].area + rows[2].area) * 50 / 2);
    expect(await runGeometryTask('measureAt', { mesh, heights: [] })).toEqual([]);
    for (const heights of [[NaN], [Infinity], [1e6 + 1], Array(2001).fill(1)]) {
      await expect(runGeometryTask('measureAt', { mesh, heights })).rejects.toThrow();
    }
  });
  it('dispatches topology and repair using the real mesh without mutating caller buffers', async () => {
    const { runGeometryTask } = await import('../src/compute');
    const mesh = createDemoMesh();
    mesh.source = 'synthetic';
    const original = mesh.positions.slice();
    expect(await runGeometryTask('topology', { mesh })).toEqual(validateMesh(mesh));
    const repaired = await runGeometryTask('repair', { mesh });
    expect(repaired.report).toEqual(repairMesh(mesh).report);
    expect(repaired.mesh.source).toBe('synthetic');
    expect(repaired.mesh.positions).not.toBe(mesh.positions);
    expect(mesh.positions).toEqual(original);
    expect(mesh.positions.byteLength).toBeGreaterThan(0);
  });
});
