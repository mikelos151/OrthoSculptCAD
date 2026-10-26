import type { CaseDetails, NewWorkspaceEvent, RegistrationRecord, WorkspaceEvent, WorkspaceState } from './types';
import type { MeshData } from '../types';
import { assertMesh, requireCondition as check } from '../io/validation';
export type * from './types';
/** Geometry only: uint32 LE vertex/triangle counts, float32 LE positions, uint32 LE indices. Not a signature. */
export async function fingerprintMesh(mesh: MeshData): Promise<string> {
  assertMesh(mesh);
  const bytes = new ArrayBuffer(8 + mesh.positions.byteLength + mesh.indices.byteLength), view = new DataView(bytes);
  view.setUint32(0, mesh.positions.length / 3, true); view.setUint32(4, mesh.indices.length / 3, true);
  let offset = 8;
  for (const v of mesh.positions) { view.setFloat32(offset, v, true); offset += 4; }
  for (const v of mesh.indices) { view.setUint32(offset, v, true); offset += 4; }
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), v => v.toString(16).padStart(2, '0')).join('');
}
export const MAX_WORKSPACE_EVENTS = 2000;
const kinds = new Set(['start', 'import', 'migration', 'units', 'repair', 'orientation', 'align-pca', 'register', 'calibrate', 'brush-relief', 'brush-compress', 'smooth', 'scale-zone', 'undo', 'reset', 'case-update', 'tape-update']);
type Row = Record<string, unknown>;
function object(value: unknown, keys?: string[]): Row {
  check(value !== null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null), 'Nieprawidłowy obiekt workspace.');
  const row = value as Row;
  if (keys) check(Object.keys(row).length === keys.length && keys.every(k => Object.hasOwn(row, k)), 'Nieznane lub brakujące pole workspace.');
  return row;
}
function ownElements(value: unknown[]): boolean {
  for (let i = 0; i < value.length; i++) if (!Object.hasOwn(value, i)) return false;
  return true;
}
function text(value: unknown, max: number, min = 0): string {
  check(typeof value === 'string' && value.length >= min && value.length <= max && !/[\x00-\x1f\ud800-\udfff\ufffe\uffff]/u.test(value), 'Nieprawidłowy tekst workspace.'); return value;
}
function integer(value: unknown): number { check(Number.isSafeInteger(value) && (value as number) >= 0, 'Nieprawidłowa rewizja.'); return value as number; }
function date(value: unknown): string {
  check(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value, 'Nieprawidłowa data ISO.'); return value;
}
function details(value: unknown): CaseDetails {
  const row = object(value, ['caseCode', 'side', 'technicalNote', 'liner', 'scanContext']);
  const caseCode = text(row.caseCode, 40, 1); check(/^[A-Za-z0-9_-]+$/.test(caseCode), 'Nieprawidłowy caseCode.');
  check(['unspecified', 'left', 'right'].includes(row.side as string), 'Nieprawidłowa strona.');
  check(['unknown', 'with-liner', 'without-liner'].includes(row.liner as string), 'Nieprawidłowy liner.');
  return { caseCode, side: row.side as CaseDetails['side'], technicalNote: text(row.technicalNote, 500), liner: row.liner as CaseDetails['liner'], scanContext: text(row.scanContext, 200) };
}
function parameters(value: unknown): WorkspaceEvent['parameters'] {
  const row = object(value); const entries = Object.entries(row); check(entries.length <= 32, 'Limit parametrów wpisu.');
  for (const [key, v] of entries) {
    check(/^[A-Za-z0-9_-]{1,40}$/.test(key) && !['__proto__', 'prototype', 'constructor'].includes(key), 'Nieprawidłowa nazwa parametru.');
    check(v === null || typeof v === 'boolean' || typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e12 || typeof v === 'string', 'Parametr musi być ograniczoną wartością prostą.');
    if (typeof v === 'string') text(v, 200);
  }
  return Object.fromEntries(entries) as WorkspaceEvent['parameters'];
}
function registrationRecord(value: unknown, caseDetails: CaseDetails, events: WorkspaceEvent[]): RegistrationRecord | null {
  if (value === null) return null;
  const row = object(value, ['side', 'landmarks', 'matrix', 'flexionDegrees', 'sourceRevision']);
  check(caseDetails.side !== 'unspecified' && row.side === caseDetails.side, 'Niezgodna strona rejestracji.');
  check(Array.isArray(row.landmarks) && row.landmarks.length === 3 && ownElements(row.landmarks), 'Wymagane trzy landmarki.');
  const landmarks = row.landmarks.map(p => {
    check(Array.isArray(p) && p.length === 3 && ownElements(p) && p.every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 100_000), 'Nieprawidłowy landmark.');
    return [...p] as [number, number, number];
  }) as RegistrationRecord['landmarks'];
  check(Array.isArray(row.matrix) && row.matrix.length === 16 && ownElements(row.matrix) && row.matrix.every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e12), 'Nieprawidłowa macierz.');
  const m = row.matrix as number[];
  const det = m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
  check(m[3] === 0 && m[7] === 0 && m[11] === 0 && m[15] === 1 && Number.isFinite(det) && Math.abs(det - 1) <= 1e-6, 'Macierz musi być sztywną prawoskrętną transformacją afiniczną.');
  for (let a = 0; a < 3; a++) for (let b = a; b < 3; b++) {
    const dot = m[4 * a] * m[4 * b] + m[4 * a + 1] * m[4 * b + 1] + m[4 * a + 2] * m[4 * b + 2];
    check(Math.abs(dot - (a === b ? 1 : 0)) <= 1e-6, 'Macierz rejestracji nie jest ortonormalna.');
  }
  const distal = landmarks[2], originTolerance = 1e-4 + 1e-9 * Math.max(...distal.map(Math.abs));
  for (let axis = 0; axis < 3; axis++) check(Math.abs(m[axis] * distal[0] + m[4 + axis] * distal[1] + m[8 + axis] * distal[2] + m[12 + axis]) <= originTolerance, 'Landmark dystalny nie trafia do początku układu.');
  check(typeof row.flexionDegrees === 'number' && Number.isFinite(row.flexionDegrees) && Math.abs(row.flexionDegrees) <= 30, 'Nieprawidłowe zgięcie.');
  const sourceRevision = integer(row.sourceRevision);
  check(sourceRevision < events.length - 1 && events[sourceRevision + 1].kind === 'register', 'Niezgodna rewizja rejestracji.');
  return { side: row.side as RegistrationRecord['side'], landmarks, matrix: [...m], flexionDegrees: row.flexionDegrees, sourceRevision };
}
export function createWorkspace(caseDetails: Partial<CaseDetails> = {}, nowISO = new Date().toISOString()): WorkspaceState {
  object(caseDetails); check(Object.keys(caseDetails).every(k => ['caseCode', 'side', 'technicalNote', 'liner', 'scanContext'].includes(k)), 'Nieznane pole przypadku.');
  return validateWorkspace({ format: 'OrthoSculptWorkspace', version: 1, caseDetails: { caseCode: 'CASE', side: 'unspecified', technicalNote: '', liner: 'unknown', scanContext: '', ...caseDetails }, revision: 0, createdAt: nowISO, updatedAt: nowISO, registration: null, events: [{ revision: 0, at: nowISO, kind: 'start', label: 'Nowy projekt', parameters: {} }] });
}
export function validateWorkspace(value: unknown): WorkspaceState {
  const row = object(value, ['format', 'version', 'caseDetails', 'revision', 'createdAt', 'updatedAt', 'registration', 'events']);
  check(row.format === 'OrthoSculptWorkspace' && row.version === 1, 'Nieobsługiwany workspace.');
  const caseDetails = details(row.caseDetails), revision = integer(row.revision), createdAt = date(row.createdAt), updatedAt = date(row.updatedAt);
  check(updatedAt >= createdAt, 'Niezgodna chronologia.');
  check(Array.isArray(row.events) && row.events.length >= 1 && row.events.length <= MAX_WORKSPACE_EVENTS, 'Limit wpisów dziennika.');
  // map/every skip holes (and may read inherited slots); JSON would silently turn them into null.
  check(ownElements(row.events), 'Niekompletny dziennik workspace.');
  let previousAt = createdAt;
  const events: WorkspaceEvent[] = row.events.map((v: unknown, i: number) => {
    const e = object(v, ['revision', 'at', 'kind', 'label', 'parameters']), at = date(e.at);
    check(integer(e.revision) === i && at >= previousAt && at <= updatedAt && kinds.has(e.kind as string), 'Niezgodna rewizja, data lub rodzaj wpisu.'); previousAt = at;
    return { revision: i, at, kind: e.kind as WorkspaceEvent['kind'], label: text(e.label, 200, 1), parameters: parameters(e.parameters) };
  });
  check(events[0].at === createdAt && ['start', 'import', 'migration'].includes(events[0].kind) && events.at(-1)!.revision === revision && events.at(-1)!.at === updatedAt, 'Niezgodne granice dziennika.');
  const registration = registrationRecord(row.registration, caseDetails, events);
  return { format: 'OrthoSculptWorkspace', version: 1, caseDetails, revision, createdAt, updatedAt, registration, events };
}
export function appendWorkspaceEvent(state: WorkspaceState, event: NewWorkspaceEvent, nowISO = new Date().toISOString()): WorkspaceState {
  const input = object(event); check(Object.keys(input).every(k => ['kind', 'label', 'parameters', 'registration', 'caseDetails'].includes(k)), 'Nieznane pole wydarzenia.');
  check(!Object.hasOwn(input, 'caseDetails') || event.kind === 'case-update', 'Metadane wymagają case-update.');
  check(!Object.hasOwn(input, 'registration') || event.registration === null || event.kind === 'register', 'Rejestracja wymaga wpisu register.');
  const next = validateWorkspace(state), oldSide = next.caseDetails.side;
  if (Object.hasOwn(input, 'caseDetails')) next.caseDetails = details(event.caseDetails);
  if (Object.hasOwn(input, 'registration')) {
    if (event.registration !== null) check(event.registration?.sourceRevision === state.revision, 'Rejestracja nie dotyczy bieżącej rewizji.');
    next.registration = structuredClone(event.registration!);
  }
  if (next.caseDetails.side === 'unspecified' || next.caseDetails.side !== oldSide) next.registration = null;
  next.revision++; next.updatedAt = nowISO;
  next.events.push({ revision: next.revision, at: nowISO, kind: event.kind, label: event.label, parameters: parameters(Object.hasOwn(input, 'parameters') ? event.parameters : {}) });
  return validateWorkspace(next);
}
