import { expect, it } from 'vitest';
import { parseSTL } from '../src/io/index';
import { exportSTL } from '../src/manufacturing/index';
const ascii = 'solid x\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid x';
it('roundtrips ASCII through binary STL with actual nonzero unit normal', async () => {
  const mesh = parseSTL(new TextEncoder().encode(ascii));
  const blob = exportSTL(mesh); const bytes = new Uint8Array(await blob.arrayBuffer());
  expect(bytes.length).toBe(134);
  const view = new DataView(bytes.buffer);
  expect(view.getUint32(80, true)).toBe(1);
  expect([view.getFloat32(84, true), view.getFloat32(88, true), view.getFloat32(92, true)]).toEqual([0, 0, 1]);
  expect(Array.from(parseSTL(bytes).positions)).toEqual(Array.from(mesh.positions));
});
it('rejects invalid STL before allocation and invalid finite values', () => {
  const short = new Uint8Array(84); new DataView(short.buffer).setUint32(80, 0xffffffff, true);
  expect(() => parseSTL(short)).toThrow();
  expect(() => parseSTL(new TextEncoder().encode(ascii.replace('vertex 0 0 0', 'vertex NaN 0 0')))).toThrow();
  expect(() => parseSTL(new TextEncoder().encode(ascii.replace('endfacet', 'bad')))).toThrow();
});
