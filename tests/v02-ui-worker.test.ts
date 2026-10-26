import { expect, it } from 'vitest';
import { executeDisplayTask } from '../src/hooks/displayTask';
import { runDisplayTask } from '../src/hooks/runDisplayTask';
import { auditMesh } from '../src/geometry';
import type { MeshData } from '../src/types';

it('rejects an unconfirmed baseline even when current geometry is outward', () => {
  const mesh: MeshData = { name: 'outward mathematical tetrahedron', positions: new Float32Array([0,0,0,1,0,0,0,1,0,0,0,1]), indices: new Uint32Array([0,2,1,0,1,3,0,3,2,1,2,3]) };
  expect(auditMesh(mesh).orientation).toBe('outward');
  const collapsedBaseline = mesh.positions.map((value, index) => index === 11 ? 0 : value);
  expect(() => executeDisplayTask({ kind: 'heatmap', mesh, baseline: collapsedBaseline })).toThrow(/referenc|outward/i);
});

it('cancels the actual display transport without detaching UI arrays', async () => {
  const mesh = plane();
  const controller = new AbortController();
  let terminated = false;
  let posted: unknown;
  const promise = runDisplayTask({ kind: 'stroke', mesh, points: [[0,0,0]], mode: 'smooth', radius: 2, strength: 0.5 }, { signal: controller.signal, factory: () => ({ onmessage: null, onerror: null, onmessageerror: null, terminate() { terminated = true; }, postMessage(message: unknown, transfer: Transferable[]) { posted = structuredClone(message, { transfer }); } }) });
  expect(mesh.positions.byteLength).toBe(36);
  expect((posted as { mesh: MeshData }).mesh.positions).toEqual(mesh.positions);
  controller.abort();
  await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  expect(terminated).toBe(true);
  expect(mesh.positions.byteLength).toBe(36);
});
const plane = (): MeshData => ({ name: 'mathematical plane', positions: new Float32Array([0,0,0,1,0,0,0,1,0]), indices: new Uint32Array([0,1,2]), colors: new Float32Array([1,0,0,0,1,0,0,0,1]) });
it('bounds completed strokes before performing expensive work', () => {
  expect(() => executeDisplayTask({ kind: 'stroke', mesh: plane(), points: Array.from({length:129}, () => [0,0,0] as [number,number,number]), mode: 'smooth', radius: 2, strength: 0.5 })).toThrow(/128/);
});

it('executes a completed stroke without mutating its reference or source RGB', () => {
  const mesh = plane();
  const next = executeDisplayTask({ kind: 'stroke', mesh, points: [[0,0,0],[0,0,0]], mode: 'smooth', radius: 2, strength: 0.5 });
  expect(next.kind).toBe('stroke');
  if (next.kind !== 'stroke') throw new Error('wrong result');
  expect(next.mesh.positions).not.toEqual(mesh.positions);
  expect(next.mesh.colors).toEqual(mesh.colors);
  expect(mesh.positions).toEqual(plane().positions);
  expect(next.dabCount).toBe(2);
});
