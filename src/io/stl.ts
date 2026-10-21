import type { MeshData } from '../types';
import { assertMesh, boundedBytes, count, finite, LIMITS, requireCondition as check } from './validation';

export function parseSTL(bytes: Uint8Array, name = 'STL'): MeshData {
  boundedBytes(bytes);
  const positions: number[] = []; const indices: number[] = []; const welded = new Map<string, number>();
  function vertex(x: number, y: number, z: number) {
    const xyz = [x, y, z].map(v => finite(Math.fround(finite(v)), 'Pozycja STL'));
    const key = xyz.join(','); let index = welded.get(key);
    if (index === undefined) {
      check(positions.length / 3 < LIMITS.vertices, 'Limit wierzchołków STL.');
      index = positions.length / 3; positions.push(...xyz); welded.set(key, index);
    }
    indices.push(index);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const triangles = bytes.length >= 84 ? view.getUint32(80, true) : 0;
  if (bytes.length >= 84 && 84 + triangles * 50 === bytes.length) {
    count(triangles, LIMITS.triangles, 'Trójkąty STL');
    for (let t = 0; t < triangles; t++) {
      let o = 84 + t * 50;
      for (let k = 0; k < 3; k++) finite(view.getFloat32(o + k * 4, true), 'Normalna STL');
      o += 12;
      for (let k = 0; k < 3; k++, o += 12) vertex(view.getFloat32(o, true), view.getFloat32(o + 4, true), view.getFloat32(o + 8, true));
    }
  } else {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).trim();
    check(/^solid(?:\s|$)/.test(text), 'Nieprawidłowy rozmiar binarnego STL.');
    const firstLine = text.indexOf('\n'); const end = text.lastIndexOf('endsolid');
    check(firstLine >= 0 && end > firstLine && !text.slice(end + 8).includes('\n'), 'Nieprawidłowy ASCII STL.');
    const body = text.slice(firstLine + 1, end); const token = /\S+/g;
    const next = () => { const m = token.exec(body); check(m, 'Ucięty ASCII STL.'); return m[0]; };
    const expected = (word: string) => check(next() === word, `STL: oczekiwano ${word}.`);
    while (token.lastIndex < body.trimEnd().length) {
      check(indices.length / 3 < LIMITS.triangles, 'Limit trójkątów STL.');
      expected('facet'); expected('normal'); for (let k = 0; k < 3; k++) finite(Number(next()), 'Normalna STL');
      expected('outer'); expected('loop');
      for (let k = 0; k < 3; k++) { expected('vertex'); vertex(Number(next()), Number(next()), Number(next())); }
      expected('endloop'); expected('endfacet');
    }
  }
  const mesh: MeshData = { positions: new Float32Array(positions), indices: new Uint32Array(indices), name, source: 'imported' };
  assertMesh(mesh); return mesh;
}
