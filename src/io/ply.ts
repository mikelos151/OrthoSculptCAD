import type { MeshData } from '../types';
import { assertMesh, boundedBytes, count, finite, LIMITS, requireCondition as check } from './validation';

type Property = { name: string; type: string; list?: string };
type Element = { name: string; count: number; properties: Property[] };
const sizes: Record<string, number> = { char: 1, int8: 1, uchar: 1, uint8: 1, short: 2, int16: 2, ushort: 2, uint16: 2, int: 4, int32: 4, uint: 4, uint32: 4, float: 4, float32: 4, double: 8, float64: 8 };
export function parsePLY(bytes: Uint8Array, name = 'PLY'): MeshData {
  boundedBytes(bytes);
  const prefix = new TextDecoder().decode(bytes.subarray(0, 65536));
  const match = /end_header\r?\n/.exec(prefix);
  check(match && match.index < 65500, 'Brak prawidłowego nagłówka PLY.');
  const header = prefix.slice(0, match.index).split(/\r?\n/).map(s => s.trim());
  const format = header[1]?.split(/\s+/)[1];
  check(header[0] === 'ply' && ['ascii', 'binary_little_endian', 'binary_big_endian'].includes(format), 'Nieobsługiwany format PLY.');
  check(header[1].endsWith(' 1.0'), 'Nieobsługiwana wersja PLY.');
  check(!header.some(s => /^comment\s+TextureFile\b/i.test(s)), 'Teksturowany PLY nie jest obsługiwany; użyj OBJ + MTL + lokalna tekstura.');
  const elements: Element[] = [];
  for (const line of header.slice(2)) {
    const t = line.split(/\s+/);
    if (t[0] === 'element') {
      check(elements.length < 16 && !elements.some(e => e.name === t[1]), 'Za dużo/powielone elementy PLY.');
      elements.push({ name: t[1], count: count(Number(t[2]), t[1] === 'vertex' ? LIMITS.vertices : LIMITS.triangles, 'Elementy PLY'), properties: [] });
    } else if (t[0] === 'property') {
      const el = elements.at(-1); check(el && el.properties.length < 32, 'Nieprawidłowe właściwości PLY.');
      const p = t[1] === 'list' ? { name: t[4], type: t[3], list: t[2] } : { name: t[2], type: t[1] };
      check(Object.hasOwn(sizes, p.type) && (!p.list || Object.hasOwn(sizes, p.list)) && !el.properties.some(q => q.name === p.name), 'Nieprawidłowy typ PLY.');
      check(!['texture_u', 'texture_v', 'u', 'v', 's', 't', 'texcoord', 'texcoords'].includes(p.name), 'UV/tekstury PLY nie są obsługiwane; użyj OBJ.');
      el.properties.push(p);
    } else check(t[0] === 'comment' || t[0] === 'obj_info' || t[0] === '', 'Nieznana deklaracja PLY.');
  }
  const vertex = elements.find(e => e.name === 'vertex'); const face = elements.find(e => e.name === 'face');
  check(vertex && face && elements.indexOf(vertex) < elements.indexOf(face), 'PLY wymaga wierzchołków przed ścianami.');
  check(['x', 'y', 'z'].every(p => vertex.properties.some(q => q.name === p && !q.list)), 'Brak współrzędnych PLY.');
  check(face.properties.some(p => ['vertex_indices', 'vertex_index'].includes(p.name) && p.list), 'Brak indeksów PLY.');
  const rgbProps = ['red', 'green', 'blue'].map(p => vertex.properties.find(q => q.name === p));
  check(rgbProps.every(Boolean) || rgbProps.every(p => !p), 'Niekompletny RGB.');
  check(rgbProps.every(p => !p || !p.list), 'RGB PLY wymaga trzech właściwości skalarnych; listowe kanały kolorów nie są obsługiwane.');
  let cursor = new TextEncoder().encode(prefix.slice(0, match.index + match[0].length)).length;
  const minimum = elements.reduce((sum, el) => sum + el.count * el.properties.reduce((s, p) => s + (format === 'ascii' ? 2 : sizes[p.list ?? p.type]), 0), 0);
  check(bytes.length - cursor >= minimum - (format === 'ascii' ? 1 : 0), 'Rozmiar PLY nie odpowiada zadeklarowanej liczbie elementów.');
  const positions = new Float32Array(vertex.count * 3);
  const colors = rgbProps.every(Boolean) ? new Float32Array(vertex.count * 3) : undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); const little = format !== 'binary_big_endian';
  const text = format === 'ascii' ? new TextDecoder().decode(bytes.subarray(cursor)) : ''; let token = 0;
  function read(type: string): number {
    let value: number;
    if (format === 'ascii') {
      while (token < text.length && /\s/.test(text[token])) token++;
      const start = token; while (token < text.length && !/\s/.test(text[token])) token++;
      check(token > start, 'Ucięte dane PLY.'); value = Number(text.slice(start, token));
    } else {
      const size = sizes[type]; check(cursor + size <= bytes.length, 'Ucięte dane PLY.');
      switch (type) {
        case 'char': case 'int8': value = view.getInt8(cursor); break;
        case 'uchar': case 'uint8': value = view.getUint8(cursor); break;
        case 'short': case 'int16': value = view.getInt16(cursor, little); break;
        case 'ushort': case 'uint16': value = view.getUint16(cursor, little); break;
        case 'int': case 'int32': value = view.getInt32(cursor, little); break;
        case 'uint': case 'uint32': value = view.getUint32(cursor, little); break;
        case 'float': case 'float32': value = view.getFloat32(cursor, little); break;
        default: value = view.getFloat64(cursor, little);
      }
      cursor += size;
    }
    finite(value, 'PLY');
    if (!type.startsWith('float') && type !== 'double') check(Number.isInteger(value), 'Niecałkowita wartość typu integer.');
    return value;
  }
  const indices: number[] = [];
  for (const el of elements) for (let i = 0; i < el.count; i++) {
    let polygon: number[] | undefined;
    for (const p of el.properties) {
      if (p.list) {
        const length = count(read(p.list), 10_000, 'Lista PLY');
        const isFace = el === face && ['vertex_indices', 'vertex_index'].includes(p.name);
        if (isFace) {
          check(length === 3, 'PLY: obsługiwane są tylko ściany trójkątne; trianguluj przed importem.');
          check(indices.length / 3 + 1 <= LIMITS.triangles, 'Limit trójkątów.'); polygon = [];
        }
        for (let k = 0; k < length; k++) {
          const value = read(p.type);
          if (isFace) { count(value, vertex.count - 1, 'Indeks PLY'); polygon!.push(value); }
        }
      } else {
        const value = read(p.type);
        if (el === vertex) {
          const xyz = ['x', 'y', 'z'].indexOf(p.name); if (xyz >= 0) positions[i * 3 + xyz] = value;
          const rgb = ['red', 'green', 'blue'].indexOf(p.name);
          if (colors && rgb >= 0) {
            const normalized = value / (['uchar', 'uint8'].includes(p.type) ? 255 : ['ushort', 'uint16'].includes(p.type) ? 65535 : 1);
            check(normalized >= 0 && normalized <= 1, 'RGB PLY poza zakresem 0–1.'); colors[i * 3 + rgb] = normalized;
          }
        }
      }
    }
    if (polygon) indices.push(...polygon);
  }
  const mesh: MeshData = { positions, indices: new Uint32Array(indices), colors, name, source: 'imported' };
  assertMesh(mesh); return mesh;
}
