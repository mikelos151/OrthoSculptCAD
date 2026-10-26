import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import type { MeshData } from '../src/types';
const mesh: MeshData = { name: 'synthetic-only', positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]) };
it('fingerprints geometry as SHA256 over LE vertex/triangle counts, Float32 positions and Uint32 indices', async () => {
  const { fingerprintMesh } = await import('../src/workspace');
  const reference = Buffer.alloc(8 + mesh.positions.byteLength + mesh.indices.byteLength);
  reference.writeUInt32LE(3, 0); reference.writeUInt32LE(1, 4);
  mesh.positions.forEach((v, i) => reference.writeFloatLE(v, 8 + 4 * i));
  mesh.indices.forEach((v, i) => reference.writeUInt32LE(v, 8 + mesh.positions.byteLength + 4 * i));
  const expected = createHash('sha256').update(reference).digest('hex');
  expect(await fingerprintMesh(mesh)).toBe(expected);
  expect(await fingerprintMesh({ ...mesh, name: 'different', source: 'synthetic', colors: new Float32Array(9) })).toBe(expected);
  const changed = { ...mesh, positions: new Float32Array(mesh.positions) }; changed.positions[0] = 1;
  expect(await fingerprintMesh(changed)).not.toBe(expected);
  await expect(fingerprintMesh({ ...mesh, indices: new Uint32Array([0, 1, 99]) })).rejects.toThrow();
});
