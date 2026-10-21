import type { MeshData } from '../types';

export const LIMITS = Object.freeze({ bytes: 128 * 1024 * 1024, vertices: 1_000_000, triangles: 2_000_000, files: 16, tapes: 1000, rows: 100_000, textureBytes: 16 * 1024 * 1024 });
export function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function finite(value: number, label = 'Wartość'): number {
  requireCondition(Number.isFinite(value), `${label}: wymagana skończona liczba.`);
  return value;
}
export function count(value: number, limit: number, label: string): number {
  requireCondition(Number.isSafeInteger(value) && value >= 0 && value <= limit, `${label}: przekroczony limit lub nieprawidłowa liczba.`);
  return value;
}
/** Structural input validation only; topology belongs to src/geometry. */
export function assertMesh(mesh: MeshData): void {
  requireCondition(mesh && mesh.positions instanceof Float32Array && mesh.indices instanceof Uint32Array, 'Nieprawidłowe tablice siatki.');
  checkSource(mesh.source);
  const n = count(mesh.positions.length / 3, LIMITS.vertices, 'Wierzchołki');
  requireCondition(n >= 3, 'Siatka wymaga minimum 3 wierzchołków.');
  requireCondition(count(mesh.indices.length / 3, LIMITS.triangles, 'Trójkąty') > 0, 'Brak trójkątów.');
  requireCondition(typeof mesh.name === 'string' && mesh.name.length <= 200 && !/[\x00-\x1f\ud800-\udfff\ufffe\uffff]/u.test(mesh.name), 'Nieprawidłowa nazwa siatki.');
  for (const x of mesh.positions) finite(x, 'Pozycja');
  for (const i of mesh.indices) requireCondition(i < n, 'Indeks poza tablicą wierzchołków.');
  if (mesh.colors) {
    requireCondition(mesh.colors instanceof Float32Array && mesh.colors.length === n * 3, 'Niezgodna długość RGB.');
    for (const c of mesh.colors) requireCondition(Number.isFinite(c) && c >= 0 && c <= 1, 'RGB poza zakresem 0–1.');
  }
  if (mesh.uvs) {
    requireCondition(mesh.uvs instanceof Float32Array && mesh.uvs.length === n * 2, 'Niezgodna długość UV.');
    for (const uv of mesh.uvs) finite(uv, 'UV');
  }
  if (mesh.textureUrl !== undefined) {
    assertTexture(mesh.textureUrl);
    requireCondition(!!mesh.uvs, 'Tekstura wymaga współrzędnych UV.');
  }
}
export function checkSource(value: unknown): void {
  requireCondition(value === undefined || value === 'synthetic' || value === 'imported', 'Nieprawidłowe pochodzenie siatki.');
}
export function assertTexture(value: unknown): asserts value is string {
  requireCondition(typeof value === 'string' && value.length <= Math.ceil(LIMITS.textureBytes / 3) * 4 + 64, 'Przekroczony limit tekstury.');
  requireCondition(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value), 'Dozwolone są wyłącznie osadzone PNG/JPEG.');
}
export function boundedBytes(bytes: Uint8Array): void {
  requireCondition(bytes.byteLength > 0 && bytes.byteLength <= LIMITS.bytes, 'Pusty plik lub przekroczony limit 128 MiB.');
}
