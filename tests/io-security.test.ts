import { expect, it } from 'vitest';
import { parseOBJ, parsePLY, saveProject, loadProject } from '../src/io';
import { export3MF, exportSTL } from '../src/manufacturing';
const bytes = (s: string) => new TextEncoder().encode(s);
it('rejects declared binary PLY data whose minimum byte size cannot fit before vertex allocation', () => {
  const header = bytes('ply\nformat binary_little_endian 1.0\nelement vertex 1000000\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n');
  expect(() => parsePLY(header)).toThrow(/rozmiar|Rozmiar/);
});
it('does not silently discard PLY texture comments, vertex UV or face texcoord data', () => {
  const header = 'ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n0 0 0\n1 0 0\n0 1 0\n3 0 1 2';
  expect(() => parsePLY(bytes(header.replace('format ascii 1.0', 'format ascii 1.0\ncomment TextureFile scan.png')))).toThrow(/tekstur/i);
  expect(() => parsePLY(bytes(header.replace('property float z', 'property float z\nproperty float texture_u\nproperty float texture_v')))).toThrow(/UV|tekstur/i);
});
it('rejects unsupported OBJ UV/texture instructions and nonfinite values explicitly', () => {
  expect(() => parseOBJ('v NaN 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3')).toThrow(/OBJ/);
  expect(() => parseOBJ('call https://evil.test/more.obj')).toThrow();
});
it('rejects invalid XML mesh names and degenerate 3MF triangles instead of creating invalid models', () => {
  const mesh = { name: 'bad\u0001name', positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]) };
  expect(() => export3MF(mesh)).toThrow(/nazw/i);
  expect(() => export3MF({ ...mesh, name: 'safe', indices: new Uint32Array([0, 0, 1]) })).toThrow(/degener/i);
  expect(() => exportSTL({ ...mesh, name: 'safe', indices: new Uint32Array([0, 0, 1]) })).toThrow(/degener/i);
});
it('rejects raw near-boundary RGB before Float32 rounding and no-UV embedded texture', async () => {
  const m = { name: 'safe', positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]), colors: new Float32Array(9) };
  const value = JSON.parse(await saveProject(m, m.positions, []).text());
  value.mesh.colors[0] = 1.00000000001; expect(() => loadProject(JSON.stringify(value))).toThrow(/RGB/);
  value.mesh.colors[0] = 0; value.mesh.source = null; expect(() => loadProject(JSON.stringify(value))).toThrow(/pochodzenie/);
});
