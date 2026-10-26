import { expect, it, vi } from 'vitest';
import { loadProject, saveProject } from '../src/io/project';
import { createWorkspace } from '../src/workspace';
import type { MeshData } from '../src/types';
const mesh: MeshData = { source: 'synthetic', name: 'Synthetic TT', positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]) };
it('rejects unsafe names and texture-without-UV before typed geometry allocation', async () => {
  const data = JSON.parse(await saveProject(mesh, mesh.positions, []).text());
  for (const mutate of [
    (x: any) => { x.mesh.name = 'bad\u0000name'; },
    (x: any) => { x.mesh.textureUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1kAAAAASUVORK5CYII='; },
  ]) {
    const value = structuredClone(data); mutate(value); const text = JSON.stringify(value);
    const ctor = vi.spyOn(globalThis, 'Float32Array');
    try { expect(() => loadProject(text)).toThrow(); expect(ctor).not.toHaveBeenCalled(); } finally { ctor.mockRestore(); }
  }
});
it('writes v2 only with workspace, roundtrips it and strictly preserves legacy v1', async () => {
  const workspace = createWorkspace({ caseCode: 'TT_01', side: 'left' }, '2026-10-22T10:00:00.000Z');
  const v2 = JSON.parse(await saveProject(mesh, mesh.positions, [{ z: 0, circumference: 123 }], workspace).text());
  expect(v2.version).toBe(2); expect(v2.workspace).toEqual(workspace);
  const loaded = loadProject(JSON.stringify(v2)); expect(loaded.workspace).toEqual(workspace); expect(loaded.mesh).toEqual(mesh);
  const v1 = JSON.parse(await saveProject(mesh, mesh.positions, []).text());
  expect(v1.version).toBe(1); expect(Object.hasOwn(v1, 'workspace')).toBe(false);
  expect(Object.hasOwn(loadProject(JSON.stringify(v1)), 'workspace')).toBe(false);
  for (const mutate of [
    (x: any) => { delete x.workspace; }, (x: any) => { x.version = 1; }, (x: any) => { x.workspace.caseDetails.patient = 'forbidden'; },
    (x: any) => { x.workspace = null; }, (x: any) => { x.mesh.indices[0] = -0.1; }, (x: any) => { x.mesh.positions[0] = 1e100; },
    (x: any) => { x.originalPositions[0] = '0'; }, (x: any) => { x.patient = 'forbidden'; },
  ]) { const x = structuredClone(v2); mutate(x); expect(() => loadProject(JSON.stringify(x))).toThrow(); }
  expect(() => saveProject(mesh, mesh.positions, [], { ...workspace, revision: -1 })).toThrow();
});
