import { describe, expect, it } from 'vitest';
import { parsePLY } from '../src/io/index';

const asciiPLY = `ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n0 0 0 255 128 0\n1 0 0 0 255 0\n0 1 0 0 0 255\n3 0 1 2\n`;
function binaryPLY(little: boolean): Uint8Array {
  const header = new TextEncoder().encode(`ply\nformat binary_${little ? 'little' : 'big'}_endian 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n`);
  const out = new Uint8Array(header.length + 45 + 13); out.set(header); const view = new DataView(out.buffer); let o = header.length;
  for (const row of [[0, 0, 0], [1, 0, 0], [0, 1, 0]]) {
    for (const v of row) { view.setFloat32(o, v, little); o += 4; }
    out.set([255, 128, 0], o); o += 3;
  }
  out[o++] = 3;
  for (const i of [0, 1, 2]) { view.setInt32(o, i, little); o += 4; }
  return out;
}
describe('local PLY import', () => {
  it.each([true, false])('reads binary PLY RGB endian=%s without integer color accessors', little => {
    const mesh = parsePLY(binaryPLY(little));
    expect(Array.from(mesh.positions)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect(mesh.colors?.[0]).toBe(1); expect(mesh.colors?.[1]).toBeCloseTo(128 / 255);
  });
  it('rejects NaN, bad indices and malicious declared counts before allocations', () => {
    expect(() => parsePLY(new TextEncoder().encode(asciiPLY.replace('0 0 0 255', 'NaN 0 0 255')))).toThrow();
    expect(() => parsePLY(new TextEncoder().encode(asciiPLY.replace('3 0 1 2', '3 -1 1 2')))).toThrow();
    expect(() => parsePLY(new TextEncoder().encode(asciiPLY.replace('vertex 3', 'vertex 999999999')))).toThrow();
    expect(() => parsePLY(binaryPLY(true).slice(0, -1))).toThrow();
  });
  it('preserves normalized RGB from ASCII PLY', () => {
    const mesh = parsePLY(new TextEncoder().encode(asciiPLY));
    expect(Array.from(mesh.indices)).toEqual([0, 1, 2]);
    expect(mesh.colors?.[0]).toBe(1);
    expect(mesh.colors?.[1]).toBeCloseTo(128 / 255);
    expect(mesh.colors?.[8]).toBe(1);
  });
});
