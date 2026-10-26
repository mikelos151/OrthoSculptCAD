import type { MeshData, TapePoint } from '../types';
import { validateWorkspace } from '../workspace';
import type { WorkspaceState } from '../workspace/types';
import { embedImage } from './assets';
import { assertMesh, assertTexture, checkSource, count, finite, LIMITS, requireCondition as check } from './validation';

type RecordData = Record<string, unknown>;
function object(value: unknown, keys: string[], required = keys): RecordData {
  check(value !== null && typeof value === 'object' && !Array.isArray(value), 'Wymagany obiekt projektu.');
  const result = value as RecordData;
  check(Object.keys(result).every(k => keys.includes(k)) && required.every(k => Object.hasOwn(result, k)), 'Nieznane lub brakujące pole projektu.'); return result;
}
function numeric(value: unknown): number { check(typeof value === 'number', 'Wymagana liczba, nie null/string.'); return finite(value); }
function array(value: unknown, max: number, integer = false): number[] {
  check(Array.isArray(value), 'Wymagana tablica projektu.'); count(value.length, max, 'Tablica projektu');
  for (const item of value) { numeric(item); if (integer) count(item, LIMITS.vertices - 1, 'Indeks projektu'); else finite(Math.fround(item), 'Float32 projektu'); }
  return value as number[];
}
export function validateTapes(tapes: unknown): TapePoint[] {
  check(Array.isArray(tapes), 'Wymagana tablica taśm.'); count(tapes.length, LIMITS.tapes, 'Taśmy'); const seen = new Set<number>();
  return tapes.map(t => {
    const row = object(t, ['z', 'circumference']); const z = numeric(row.z); const circumference = numeric(row.circumference);
    check(Math.abs(z) <= 100_000 && circumference > 0 && circumference <= 100_000 && !seen.has(z), 'Nieprawidłowa lub powielona taśma.'); seen.add(z);
    return { z, circumference };
  });
}
function baseline(mesh: MeshData, original: Float32Array): void {
  check(original instanceof Float32Array && original.length === mesh.positions.length, 'Niezgodna długość pozycji bazowych.');
  for (const v of original) finite(v, 'Pozycja bazowa');
}
function texture(value: unknown): string {
  assertTexture(value);
  const data = value.slice(value.indexOf(',') + 1); check(data.length % 4 === 0, 'Nieprawidłowe kodowanie base64.');
  let raw: string; try { raw = atob(data); } catch { throw new Error('Nieprawidłowe kodowanie base64.'); }
  const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
  const normalized = embedImage(bytes); check(normalized === value, 'Niezgodna zawartość lub MIME tekstury.'); return value;
}
export function saveProject(mesh: MeshData, originalPositions: Float32Array, tapes: TapePoint[], workspace?: WorkspaceState): Blob {
  assertMesh(mesh); baseline(mesh, originalPositions); const checkedTapes = validateTapes(tapes);
  if (mesh.textureUrl) texture(mesh.textureUrl);
  const data = {
    format: 'OrthoSculptCAD', version: workspace === undefined ? 1 : 2, units: 'mm',
    ...(workspace === undefined ? {} : { workspace: validateWorkspace(workspace) }),
    mesh: { name: mesh.name, ...(mesh.source ? { source: mesh.source } : {}), positions: Array.from(mesh.positions), indices: Array.from(mesh.indices),
      ...(mesh.colors ? { colors: Array.from(mesh.colors) } : {}), ...(mesh.uvs ? { uvs: Array.from(mesh.uvs) } : {}),
      ...(mesh.textureUrl ? { textureUrl: mesh.textureUrl } : {}) },
    originalPositions: Array.from(originalPositions), tapes: checkedTapes,
  };
  const json = JSON.stringify(data); check(json.length <= LIMITS.bytes, 'Limit rozmiaru projektu.');
  const blob = new Blob([json], { type: 'application/json' }); check(blob.size <= LIMITS.bytes, 'Limit rozmiaru projektu.'); return blob;
}
export function loadProject(text: string): { mesh: MeshData; originalPositions: Float32Array; tapes: TapePoint[]; workspace?: WorkspaceState } {
  check(typeof text === 'string' && text.length > 0 && text.length <= LIMITS.bytes && new Blob([text]).size <= LIMITS.bytes, 'Limit rozmiaru projektu.');
  let parsed: unknown; try { parsed = JSON.parse(text); } catch { throw new Error('Nieprawidłowy JSON projektu.'); }
  const root = object(parsed, ['format', 'version', 'units', 'mesh', 'originalPositions', 'tapes', 'workspace'], ['format', 'version', 'units', 'mesh', 'originalPositions', 'tapes']);
  check(root.format === 'OrthoSculptCAD' && (root.version === 1 || root.version === 2) && root.units === 'mm', 'Nieobsługiwana wersja/format/jednostki projektu.');
  check(Object.hasOwn(root, 'workspace') === (root.version === 2), 'Niezgodny workspace/wersja projektu.');
  const workspace = root.version === 2 ? validateWorkspace(root.workspace) : undefined;
  const m = object(root.mesh, ['name', 'source', 'positions', 'indices', 'colors', 'uvs', 'textureUrl'], ['name', 'positions', 'indices']);
  check(typeof m.name === 'string' && m.name.length <= 200 && !/[\x00-\x1f\ud800-\udfff\ufffe\uffff]/u.test(m.name), 'Nieprawidłowa nazwa siatki.');
  checkSource(m.source);
  const p = array(m.positions, LIMITS.vertices * 3); const ix = array(m.indices, LIMITS.triangles * 3, true);
  check(p.length >= 9 && p.length % 3 === 0 && ix.length > 0 && ix.length % 3 === 0 && ix.every(i => i < p.length / 3), 'Niezgodna geometria projektu.');
  const c = Object.hasOwn(m, 'colors') ? array(m.colors, p.length) : undefined;
  const uv = Object.hasOwn(m, 'uvs') ? array(m.uvs, p.length / 3 * 2) : undefined;
  check(!c || c.length === p.length && c.every(v => v >= 0 && v <= 1), 'Niezgodna tablica lub zakres RGB.'); check(!uv || uv.length === p.length / 3 * 2, 'Niezgodna tablica UV.');
  const original = array(root.originalPositions, p.length); check(original.length === p.length, 'Niezgodna tablica bazowa.');
  check(!Object.hasOwn(m, 'textureUrl') || uv !== undefined, 'Tekstura wymaga współrzędnych UV.');
  const tapes = validateTapes(root.tapes); const textureUrl = Object.hasOwn(m, 'textureUrl') ? texture(m.textureUrl) : undefined;
  const mesh: MeshData = { name: m.name, ...(m.source ? { source: m.source as 'imported' | 'synthetic' } : {}), positions: new Float32Array(p), indices: new Uint32Array(ix),
    ...(c ? { colors: new Float32Array(c) } : {}), ...(uv ? { uvs: new Float32Array(uv) } : {}), ...(textureUrl ? { textureUrl } : {}) };
  assertMesh(mesh); const originalPositions = new Float32Array(original); baseline(mesh, originalPositions); return { mesh, originalPositions, tapes, ...(workspace === undefined ? {} : { workspace }) };
}
