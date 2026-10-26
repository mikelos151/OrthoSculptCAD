import { expect, it } from 'vitest';

import { createWorkspace, validateWorkspace, appendWorkspaceEvent } from '../src/workspace';
const now = '2026-10-22T10:00:00.000Z';
it('rejects malformed workspace values, bounded fields, invalid ISO dates and journal revisions', () => {
  const state = createWorkspace({}, now);
  const corruptions = [
    (x: any) => { x.extra = true; }, (x: any) => { x.version = '1'; },
    (x: any) => { x.caseDetails.caseCode = 'patient name'; }, (x: any) => { x.caseDetails.caseCode = ''; },
    (x: any) => { x.caseDetails.caseCode = 'a'.repeat(41); }, (x: any) => { x.caseDetails.side = 'Left'; },
    (x: any) => { x.caseDetails.technicalNote = 'x'.repeat(501); }, (x: any) => { x.caseDetails.scanContext = 'x'.repeat(201); },
    (x: any) => { x.caseDetails.liner = 'yes'; }, (x: any) => { x.createdAt = '2026-02-30T10:00:00.000Z'; },
    (x: any) => { x.updatedAt = 'yesterday'; }, (x: any) => { x.updatedAt = '2026-10-21T10:00:00.000Z'; },
    (x: any) => { x.revision = 0.5; }, (x: any) => { x.revision = Number.MAX_SAFE_INTEGER + 1; },
    (x: any) => { x.events = []; }, (x: any) => { x.events[0].revision = 1; },
    (x: any) => { x.events[0].at = '2026-10-21T10:00:00.000Z'; },
    (x: any) => { x.events[0].kind = 'approve-clinical'; }, (x: any) => { x.events[0].label = 'x'.repeat(201); },
    (x: any) => { x.events[0].parameters = { nested: {} }; }, (x: any) => { x.events[0].parameters = { n: NaN }; },
    (x: any) => { x.events[0].parameters = { x: 'a'.repeat(201) }; },
    (x: any) => { x.events[0].parameters = Object.fromEntries(Array.from({ length: 33 }, (_, i) => [i, i])); },
    (x: any) => { x.events[0].parameters = JSON.parse('{"__proto__":1}'); },
  ];
  for (const corrupt of corruptions) { const value = structuredClone(state); corrupt(value); expect(() => validateWorkspace(value)).toThrow(); }
  for (const value of [null, [], 1, 'workspace', undefined]) expect(() => validateWorkspace(value)).toThrow();
  expect(() => createWorkspace({ caseCode: 'not allowed' }, now)).toThrow();
});
it('records affine registration, rejects reflections and clears confirmation on side changes', () => {
  const registration = { side: 'left' as const, landmarks: [[0, 1, 0], [-1, 0, 0], [0, 0, 0]] as [number, number, number][], matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], flexionDegrees: 0, sourceRevision: 0 };
  const start = createWorkspace({ side: 'left' }, now);
  const registered = appendWorkspaceEvent(start, { kind: 'register', label: 'Rejestracja', registration: registration as any }, now);
  expect(registered.registration).toEqual(registration);
  registration.matrix[0] = 2; expect(registered.registration!.matrix[0]).toBe(1);
  const changed = appendWorkspaceEvent(registered, { kind: 'case-update', label: 'Strona', caseDetails: { ...registered.caseDetails, side: 'right' } }, now);
  expect(changed.caseDetails.side).toBe('right'); expect(changed.registration).toBeNull();
  for (const mutate of [
    (r: any) => { r.side = 'right'; }, (r: any) => { r.matrix[0] = -1; },
    (r: any) => { r.matrix[3] = 1; }, (r: any) => { r.matrix[15] = 2; },
    (r: any) => { r.matrix[0] = Infinity; }, (r: any) => { r.matrix.pop(); },
    (r: any) => { r.landmarks[0][0] = NaN; }, (r: any) => { r.landmarks[0] = [1, 2]; },
    (r: any) => { r.flexionDegrees = 31; }, (r: any) => { r.sourceRevision = 1; },
  ]) { const value = structuredClone(registered); mutate(value.registration); expect(() => validateWorkspace(value)).toThrow(); }
  const unspecified = structuredClone(registered); unspecified.caseDetails.side = 'unspecified'; expect(() => validateWorkspace(unspecified)).toThrow();
  expect(() => appendWorkspaceEvent(start, { kind: 'case-update', label: 'Bad', parameters: { a: {} } } as any, now)).toThrow();
  expect(() => appendWorkspaceEvent(start, { kind: 'case-update', label: 'Bad', extra: true } as any, now)).toThrow();
});
it('accepts rigid registration within numeric tolerance but rejects scaling, shear and misplaced distal origin', () => {
  const start = createWorkspace({ side: 'right' }, now);
  const record = { side: 'right', landmarks: [[10, 21, 30], [11, 20, 30], [10, 20, 30]], matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -10, -20, -30, 1], flexionDegrees: 0, sourceRevision: 0 };
  const registered = appendWorkspaceEvent(start, { kind: 'register', label: 'Rigid', registration: record as any }, now);
  expect(registered.registration).toEqual(record);
  const close = structuredClone(registered); close.registration!.matrix[0] += 1e-9;
  expect(validateWorkspace(close).registration).not.toBeNull();
  for (const mutate of [
    (r: any) => { r.matrix[0] = r.matrix[5] = r.matrix[10] = 2; },
    (r: any) => { r.matrix[4] = 0.1; },
    (r: any) => { r.matrix[12] += 1; },
  ]) { const value = structuredClone(registered); mutate(value.registration); expect(() => validateWorkspace(value)).toThrow(); }
});
it.each([
  ['scaling 2I', (r: any) => { r.matrix[0] = r.matrix[5] = r.matrix[10] = 2; }],
  ['shear', (r: any) => { r.matrix[4] = 0.1; }],
  ['translation mismatch', (r: any) => { r.matrix[12] += 1; }],
] as const)('rejects rigid record %s independently', (_, mutate) => {
  const start = createWorkspace({ side: 'right' }, now);
  const registration = { side: 'right', landmarks: [[10, 21, 30], [11, 20, 30], [10, 20, 30]], matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -10, -20, -30, 1], flexionDegrees: 0, sourceRevision: 0 };
  mutate(registration);
  expect(() => appendWorkspaceEvent(start, { kind: 'register', label: 'Invalid frame', registration: registration as any }, now)).toThrow();
});
it('accepts the actual detailed registration matrix, including nonzero flexion and translated landmarks', async () => {
  const { registerLandmarksDetailed } = await import('../src/geometry/alignment');
  const mesh = { name: 'synthetic elongated box', positions: new Float32Array([9,19,30, 11,19,30, 11,21,30, 9,21,30, 9,19,130, 11,19,130, 11,21,130, 9,21,130]), indices: new Uint32Array([0,2,1, 0,3,2, 4,5,6, 4,6,7, 0,1,5, 0,5,4, 1,2,6, 1,6,5, 2,3,7, 2,7,6, 3,0,4, 3,4,7]) };
  for (const side of ['left', 'right'] as const) {
    const points = { anterior: [10, 21, 80] as [number,number,number], lateral: [side === 'left' ? 9 : 11, 20, 80] as [number,number,number], distal: [10,20,30] as [number,number,number] };
    const detailed = registerLandmarksDetailed(mesh, points, 12, side);
    const registration = { side, landmarks: [points.anterior, points.lateral, points.distal] as [typeof points.anterior, typeof points.lateral, typeof points.distal], matrix: detailed.matrix, flexionDegrees: 12, sourceRevision: 0 };
    const state = appendWorkspaceEvent(createWorkspace({ side }, now), { kind: 'register', label: 'Detailed real matrix', registration }, now);
    expect(validateWorkspace(state).registration).toEqual(registration);
  }
});
it('rejects forged registration updates, stale source revisions and scalar type confusion', () => {
  const start = createWorkspace({ side: 'left' }, now);
  const registration = { side: 'left', landmarks: [[0, 1, 0], [-1, 0, 0], [0, 0, 0]], matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], flexionDegrees: 0, sourceRevision: 0 };
  const registered = appendWorkspaceEvent(start, { kind: 'register', label: 'Registered', registration: registration as any }, now);
  const newer = appendWorkspaceEvent(registered, { kind: 'tape-update', label: 'Taśma' }, now);
  expect(() => appendWorkspaceEvent(newer, { kind: 'register', label: 'Stale', registration: registration as any }, now)).toThrow();
  for (const value of [[], ['left'], { toString: () => 'left' }]) expect(() => createWorkspace({ side: value as any }, now)).toThrow();
  const booleanRevision = structuredClone(start); booleanRevision.revision = true as any; expect(() => validateWorkspace(booleanRevision)).toThrow();
});
it('enforces the exact journal limit without silently discarding history', () => {
  const state = createWorkspace({}, now);
  state.events = Array.from({ length: 2000 }, (_, revision) => ({ ...state.events[0], revision, kind: revision ? 'tape-update' : 'start', parameters: {} }));
  state.revision = 1999;
  expect(validateWorkspace(state).events).toHaveLength(2000);
  expect(() => appendWorkspaceEvent(state, { kind: 'undo', label: 'Cofnij' }, now)).toThrow();
  expect(state.events).toHaveLength(2000);
});
it('creates, validates and immutably appends a workspace journal entry', async () => {
  const { createWorkspace, validateWorkspace, appendWorkspaceEvent } = await import('../src/workspace');
  const state = createWorkspace({ caseCode: 'TT_01', side: 'left' }, now);
  expect(state.revision).toBe(0);
  expect(state.events).toEqual([{ revision: 0, at: now, kind: 'start', label: 'Nowy projekt', parameters: {} }]);
  expect(state.registration).toBeNull();
  expect(validateWorkspace(state)).toEqual(state);
  const next = appendWorkspaceEvent(state, { kind: 'tape-update', label: 'Taśma', parameters: { z: 12, circumference: 123 } }, '2026-10-22T10:01:00.000Z');
  expect(next.revision).toBe(1); expect(next.events).toHaveLength(2);
  next.caseDetails.technicalNote = 'changed'; next.events[0].parameters.foo = true;
  expect(state.caseDetails.technicalNote).toBe(''); expect(state.events[0].parameters).toEqual({});
});
