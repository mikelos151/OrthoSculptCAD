import type { MeshData, SliceResult, SliceLoop } from './types';

// Binary IPC avoids JSON encoding of large arrays. It still COPIES data across processes.
export const MAX_NATIVE_VERTICES = 1_000_000;
export const MAX_NATIVE_TRIANGLES = 2_000_000;
// Keep these limits in parity with crates/ortho-geometry/src/{lib,slice}.rs.
export const MAX_SECTION_LOOPS = 250_000;
export const MAX_SECTION_POINTS = 500_000;
export const MAX_SECTION_BYTES = 32 + MAX_SECTION_LOOPS * 40 + MAX_SECTION_POINTS * 16;
export function packMesh(mesh: MeshData): ArrayBuffer {
  const {positions, indices} = mesh;
  const vertices = positions.length / 3;
  const triangles = indices.length / 3;
  if (!Number.isInteger(vertices) || !Number.isInteger(triangles) || vertices < 3 || triangles < 1 || vertices > MAX_NATIVE_VERTICES || triangles > MAX_NATIVE_TRIANGLES) {
    throw new Error('Nieprawidłowa liczba wierzchołków lub trójkątów IPC.');
  }
  for (const coordinate of positions) if (!Number.isFinite(coordinate) || Math.abs(coordinate) > 1e6) throw new Error('Nieprawidłowa współrzędna IPC.');
  for (const index of indices) if (index >= vertices) throw new Error('Indeks IPC poza siatką.');
  const result = new ArrayBuffer(16 + positions.length * 4 + indices.length * 4);
  const view = new DataView(result);
  view.setUint32(0, 0x4f534344, true);
  view.setUint32(4, 1, true);
  view.setUint32(8, vertices, true);
  view.setUint32(12, triangles, true);
  let offset = 16;
  for (const value of positions) { view.setFloat32(offset, value, true); offset += 4; }
  for (const value of indices) { view.setUint32(offset, value, true); offset += 4; }
  return result;
}

/** Versioned, little-endian Rust response. Fail closed on corrupt/oversized data. */
export function unpackSlice(packet: ArrayBuffer): SliceResult {
  if (!(packet instanceof ArrayBuffer) || packet.byteLength < 32 || packet.byteLength > MAX_SECTION_BYTES) throw new Error('Nieprawidłowy pakiet przekroju.');
  const view = new DataView(packet);
  let offset = 0;
  function u32(): number { if (offset + 4 > packet.byteLength) throw new Error('Ucięty pakiet przekroju.'); const value = view.getUint32(offset,true); offset += 4; return value; }
  function f64(): number { if (offset + 8 > packet.byteLength) throw new Error('Ucięty pakiet przekroju.'); const value = view.getFloat64(offset,true); offset += 8; if (!Number.isFinite(value)) throw new Error('Nieprawidłowa liczba w przekroju.'); return value; }
  if (u32() !== 0x4f53534c || u32() !== 1) throw new Error('Nieobsługiwany format przekroju.');
  const validFlag = u32();
  const count = u32();
  if (validFlag > 1 || count > MAX_SECTION_LOOPS) throw new Error('Nieprawidłowy nagłówek przekroju.');
  const z = f64();
  const queryMs = f64();
  if (queryMs < 0) throw new Error('Nieprawidłowy czas przekroju.');
  const loops: SliceLoop[] = [];
  let totalPoints = 0;
  for (let i=0; i<count; i++) {
    const closedFlag = u32();
    const pointsCount = u32();
    totalPoints += pointsCount;
    if (closedFlag > 1 || pointsCount < 2 || totalPoints > MAX_SECTION_POINTS || offset + 32 + pointsCount*16 > packet.byteLength) throw new Error('Nieprawidłowy kontur przekroju.');
    const perimeter = f64(); const area = f64(); const ap = f64(); const ml = f64();
    if (Math.min(perimeter,area,ap,ml) < 0) throw new Error('Ujemny pomiar przekroju.');
    const points: [number,number][] = [];
    for (let p=0; p<pointsCount; p++) points.push([f64(), f64()]);
    loops.push({closed:closedFlag===1, points, perimeter,area,ap,ml});
  }
  if (offset !== packet.byteLength) throw new Error('Nadmiarowe dane pakietu przekroju.');
  const valid = validFlag === 1 && loops.length === 1 && loops[0].closed && loops[0].points.length >= 3;
  const primary = valid ? loops[0] : null;
  return {z,loops,valid,queryMs,perimeter:primary?.perimeter ?? 0,area:primary?.area ?? 0,ap:primary?.ap ?? 0,ml:primary?.ml ?? 0,warnings:valid?[]:['Brak jednoznacznego zamkniętego konturu. Pomiar nieważny.']};
}
