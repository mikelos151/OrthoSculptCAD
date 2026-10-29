import { expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as numerics from '../src/trimline/numerics';
import * as faceCubic from '../src/trimline/face-cubic';
import type { MeshData } from '../src/types';
import { createSourceCandidateStore } from '../src/trimline/source-candidate';
import type { SourceCandidate, SourceStamp } from '../src/trimline/source-candidate';
const refusal = (code: string) => expect.objectContaining({ name: 'SourceCandidateError', message: code, code });
import { createArithmeticContext, rational } from '../src/trimline/numerics';
import { sampleCubic } from '../src/trimline/bezier';
import type { CubicBarycentricControls } from '../src/trimline/face-cubic';
const context = (maxOperations = 2000000, maxBits = 4096) => createArithmeticContext({ maxBits, maxOperations });

const stamp = () => ({ projectEpoch: 1, revision: 2, generation: 3, units: 'mm' as const,
  unitsConfirmed: true as const, frameId: 'frame_1' });
// Synthetic closed tetrahedron, translated from its hypothetical raw/baseline.
const mesh = (): MeshData => ({ name: 'S 🦴', source: 'synthetic',
  positions: new Float32Array([2, 0, -0, 3, 0, 0, 2, 1, 0, 2, 0, 1]),
  indices: new Uint32Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 2, 0, 3]),
  colors: new Float32Array(12).fill(0.5), uvs: new Float32Array(8),
  textureUrl: 'data:image/png;base64,AAAA' });
function frozen(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  expect(ArrayBuffer.isView(value)).toBe(false);
  expect(value instanceof ArrayBuffer).toBe(false);
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) frozen(child);
}
// Independent byte assembly for this test only, using Node Buffer and native SHA.
function canonicalBytes(m: MeshData, s = stamp()): Buffer {
  const chunks: Buffer[] = [];
  const u8 = (n: number) => chunks.push(Buffer.from([n]));
  const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); chunks.push(b); };
  const text = (v: string) => { const b = Buffer.from(v, 'utf8'); u32(b.length); chunks.push(b); };
  chunks.push(Buffer.from('OrthoSculptSourceCandidate\0', 'ascii')); u32(1);
  u32(m.positions.length / 3); u32(m.indices.length / 3);
  const raw = (a: Float32Array | Uint32Array) => {
    const v = new Uint32Array(a.buffer, a.byteOffset, a.length); for (const n of v) u32(n);
  };
  raw(m.positions); raw(m.indices);
  for (const a of [m.colors, m.uvs]) { u8(a ? 1 : 0); if (a) raw(a); }
  u8(m.source === undefined ? 0 : m.source === 'synthetic' ? 1 : 2); text(m.name);
  u8(m.textureUrl === undefined ? 0 : 1); if (m.textureUrl !== undefined) text(m.textureUrl);
  text(s.units); u8(1); text(s.frameId);
  return Buffer.concat(chunks);
}
function digest(m: MeshData, s = stamp()): string {
  return 'sha256:' + createHash('sha256').update(canonicalBytes(m, s)).digest('hex');
}
it('captures whole owned S with canonical native SHA and a frozen runtime identity', async () => {
  const m = mesh(), s = stamp(), expected = digest(m, s);
  const store = createSourceCandidateStore({ maxOwnedBufferBytes: 4096 });
  const pending = store.capture(m, s);
  m.positions.fill(99); m.indices.fill(0); m.colors!.fill(1); m.uvs!.fill(7);
  m.name = 'changed'; m.textureUrl = 'data:image/jpeg;base64,BBBB'; s.revision = 90;
  const h = await pending;
  const d = store.describe(h);
  expect(d).toMatchObject({ kind: 'owned-source-candidate-v1', sourceDigest: expected,
    vertexCount: 4, faceCount: 4, stamp: { ...stamp() } });
  expect(typeof d.sourceId).toBe('string'); expect(d.sourceId.length).toBeGreaterThan(0);
  expect(Reflect.ownKeys(h)).toEqual([]); frozen(h); frozen(d);
  expect(d).not.toHaveProperty('audited');
});
it('resolves ordered source bits and binds a real contained cubic sampled on the same ctx', async () => {
  const m = mesh(), store = createSourceCandidateStore({ maxOwnedBufferBytes: 4096 });
  const h = await store.capture(m, stamp());
  m.positions.fill(100); m.indices.fill(0);
  const ctx = context(), q = (n: bigint, d = 1n) => rational(n, d, ctx);
  const face = store.resolveFace(h, 1, ctx);
  expect(face.sourceFace).toBe(1); expect(face.vertexIDs).toEqual([0, 1, 3]);
  expect(face.positionBits).toEqual([[0x40000000, 0, 0x80000000], [0x40400000, 0, 0], [0x40000000, 0, 0x3f800000]]);
  expect(face.triangle).toEqual([[q(2n), q(0n), q(0n)], [q(3n), q(0n), q(0n)], [q(2n), q(0n), q(1n)]]);
  const weights: CubicBarycentricControls = [[q(1n), q(0n), q(0n)],
    [q(2n, 3n), q(1n, 3n), q(0n)], [q(1n, 3n), q(2n, 3n), q(0n)], [q(0n), q(1n), q(0n)]];
  const span = store.bindFaceCubic(h, 1, weights, ctx);
  expect(span.kind).toBe('candidate-source-face-cubic-v1');
  expect(span.face).toEqual(face); expect(span.containment.triangle).toEqual(face.triangle);
  expect(span.containment.controls).toEqual([[q(2n), q(0n), q(0n)], [q(7n, 3n), q(0n), q(0n)],
    [q(8n, 3n), q(0n), q(0n)], [q(3n), q(0n), q(0n)]]);
  const approximation = sampleCubic(span.containment.controls, q(1n, 200n),
    { maxDepth: 16, maxNodes: 1000, maxSegments: 500 }, ctx);
  expect(approximation.leaves).toHaveLength(1);
  frozen(face); frozen(span); frozen(approximation);
});
it('authenticates opaque handles with operation-specific retirement, busy and closed priorities', async () => {
  const store = createSourceCandidateStore({ maxOwnedBufferBytes: 4096 });
  const other = createSourceCandidateStore({ maxOwnedBufferBytes: 4096 });
  const h = await store.capture(mesh(), stamp()), foreign = await other.capture(mesh(), stamp());
  expect(other.describe(foreign).sourceId).not.toBe(store.describe(h).sourceId);
  let touched = 0;
  const hostile = Object.defineProperty({}, 'positions', { get() { touched++; throw Error('input getter'); } }) as MeshData;
  await expect(store.capture(hostile, stamp())).rejects.toThrowError(refusal('SOURCE_IN_USE'));
  const ctx = context();
  for (const fake of [{}, structuredClone(h), foreign, null, 1] as SourceCandidate[]) {
    expect(() => store.describe(fake)).toThrowError(refusal('INVALID_INPUT'));
    expect(() => store.resolveFace(fake, -1, ctx)).toThrowError(refusal('INVALID_INPUT'));
    expect(() => store.bindFaceCubic(fake, -1, null!, ctx)).toThrowError(refusal('INVALID_INPUT'));
    expect(() => store.release(fake)).toThrowError(refusal('INVALID_INPUT'));
  }
  store.release(h); store.release(h);
  expect(() => store.describe(h)).toThrowError(refusal('STALE_SOURCE'));
  expect(() => store.resolveFace(h, -1, ctx)).toThrowError(refusal('STALE_SOURCE'));
  expect(() => store.bindFaceCubic(h, -1, null!, ctx)).toThrowError(refusal('STALE_SOURCE'));
  const h2 = await store.capture(mesh(), stamp());
  store.release(h);
  expect(store.describe(h2).sourceDigest).toBe(other.describe(foreign).sourceDigest);
  store.dispose(); store.dispose(); store.release(h); store.release(h2);
  expect(() => store.release(foreign)).toThrowError(refusal('INVALID_INPUT'));
  for (const handle of [h, h2, foreign, {} as SourceCandidate]) {
    expect(() => store.describe(handle)).toThrowError(refusal('STALE_SOURCE'));
    expect(() => store.resolveFace(handle, -1, ctx)).toThrowError(refusal('STALE_SOURCE'));
    expect(() => store.bindFaceCubic(handle, -1, null!, ctx)).toThrowError(refusal('STALE_SOURCE'));
  }
  await expect(store.capture(hostile, stamp())).rejects.toThrowError(refusal('STALE_SOURCE'));
  expect(touched).toBe(0);
});
it('preflights descriptor shapes, bounded metadata and ordinary fixed native view ranges', async () => {
  const store = createSourceCandidateStore({ maxOwnedBufferBytes: 4096 });
  let touched = 0;
  const getter = () => { touched++; throw Error('getter'); };
  const bad: unknown[] = [null, {}, { ...mesh(), positions: [] }, { ...mesh(), indices: new Int32Array(12) },
    { ...mesh(), positions: new Float32Array(10) }, { ...mesh(), positions: new Float32Array(600003) },
    { ...mesh(), indices: new Uint32Array(600003) }, { ...mesh(), colors: new Float32Array(11) },
    { ...mesh(), uvs: new Float32Array(7) }, { ...mesh(), positions: new (class extends Float32Array {})(12) },
    { ...mesh(), positions: new Float32Array(new SharedArrayBuffer(48)) },
    { ...mesh(), positions: new Float32Array(Reflect.construct(ArrayBuffer, [48, { maxByteLength: 96 }]) as ArrayBuffer) }];
  const detached = new Float32Array(12); structuredClone(detached.buffer, { transfer: [detached.buffer] });
  bad.push({ ...mesh(), positions: detached });
  for (const key of ['name', 'positions', 'indices', 'colors', 'uvs', 'source', 'textureUrl']) {
    bad.push(Object.defineProperty(mesh(), key, { get: getter }));
  }
  const inherited = mesh(); delete (inherited as Partial<MeshData>).name; Object.setPrototypeOf(inherited, { name: 'inherited' }); bad.push(inherited);
  for (const name of [undefined, 2, 'x'.repeat(201), '\u0000', '\ud800', '\udfff', '\ufffe']) bad.push({ ...mesh(), name });
  for (const source of [null, false, 'S']) bad.push({ ...mesh(), source });
  for (const textureUrl of [null, 'https://example.invalid/a.png', 'data:image/png;base64,🦴', 'data:image/png;base64,',
    'data:image/png;base64,' + 'A'.repeat(Math.ceil(16 * 1024 * 1024 / 3) * 4 + 65)]) bad.push({ ...mesh(), textureUrl });
  bad.push({ ...mesh(), uvs: undefined }); // texture requires UV
  for (const input of bad) await expect(store.capture(input as MeshData, stamp())).rejects.toThrowError(refusal('INVALID_INPUT'));
  for (const key of ['projectEpoch', 'revision', 'generation', 'units', 'unitsConfirmed', 'frameId']) {
    const s = Object.defineProperty(stamp(), key, { get: getter });
    await expect(store.capture(mesh(), s)).rejects.toThrowError(refusal('INVALID_INPUT'));
  }
  for (const s of [null, {}, { ...stamp(), revision: -1 }, { ...stamp(), projectEpoch: 0.5 },
    { ...stamp(), generation: Number.MAX_SAFE_INTEGER + 1 }, { ...stamp(), units: 'cm' },
    { ...stamp(), unitsConfirmed: false }, { ...stamp(), frameId: '' }, { ...stamp(), frameId: 'x'.repeat(65) },
    { ...stamp(), frameId: 'å' }]) await expect(store.capture(mesh(), s as ReturnType<typeof stamp>)).rejects.toThrowError(refusal('INVALID_INPUT'));
  expect(touched).toBe(0);
  // Native accessors must ignore shadowed view getters/iterator/methods.
  const m = mesh(), expected = digest(m);
  for (const key of ['positions', 'indices', 'colors', 'uvs'] as const) {
    const original = m[key]!;
    const buffer = new ArrayBuffer(original.byteLength + 16);
    new Uint8Array(buffer, 8, original.byteLength).set(new Uint8Array(original.buffer));
    const view = key === 'indices' ? new Uint32Array(buffer, 8, original.length) : new Float32Array(buffer, 8, original.length);
    for (const field of ['buffer', 'byteOffset', 'byteLength', 'length', 'slice', Symbol.iterator]) Object.defineProperty(view, field, { get: getter });
    Object.assign(m, { [key]: view });
  }
  const h = await store.capture(m, stamp());
  expect(store.describe(h).sourceDigest).toBe(expected); expect(touched).toBe(0);
});
it('validates the private whole snapshot before hashing, including distant coordinates and attrs', async () => {
  const store = createSourceCandidateStore({ maxOwnedBufferBytes: 4096 });
  const mutations: ((m: MeshData) => void)[] = [
    m => { m.positions[11] = NaN; }, m => { m.positions[11] = Infinity; },
    m => { m.indices[11] = 4; }, m => { m.indices[11] = 0xffffffff; },
    m => { m.colors![11] = -0.01; }, m => { m.colors![11] = 1.01; }, m => { m.colors![11] = NaN; },
    m => { m.uvs![7] = Infinity; },
  ];
  for (const mutate of mutations) {
    const m = mesh(); mutate(m);
    await expect(store.capture(m, stamp())).rejects.toThrowError(refusal('INVALID_INPUT'));
  }
  const valid = mesh(); valid.name = ''; valid.colors![0] = -0; valid.uvs![0] = -100;
  const h = await store.capture(valid, stamp());
  expect(store.describe(h).sourceDigest).toBe(digest(valid));
});
it('reserves whole S plus canonical preimage before the first owned buffer allocation', async () => {
  for (const value of [0, -1, 0.5, NaN, Infinity, 128 * 1024 * 1024 + 1, '4096']) {
    expect(() => createSourceCandidateStore({ maxOwnedBufferBytes: value as number })).toThrowError(refusal('INVALID_INPUT'));
  }
  expect(() => createSourceCandidateStore(Object.create({ maxOwnedBufferBytes: 4096 }))).toThrowError(refusal('INVALID_INPUT'));
  const m = mesh(); m.textureUrl = 'data:image/png;base64,' + 'A'.repeat(10000);
  const sizes = [m.positions.byteLength, m.indices.byteLength, m.colors!.byteLength, m.uvs!.byteLength];
  const preimageBytes = canonicalBytes(m).length, total = sizes.reduce((a, b) => a + b, 0) + preimageBytes;
  const allocations: number[] = [], NativeBuffer = ArrayBuffer;
  const ab = new Proxy(NativeBuffer, { construct(target, args) { allocations.push(args[0] as number); return Reflect.construct(target, args); } });
  vi.stubGlobal('ArrayBuffer', ab);
  const encode = vi.spyOn(TextEncoder.prototype, 'encode').mockImplementation(() => { throw Error('unreserved encoding'); });
  try {
    const small = createSourceCandidateStore({ maxOwnedBufferBytes: total - 1 });
    await expect(small.capture(m, stamp())).rejects.toThrowError(refusal('BUDGET_EXCEEDED'));
    expect(allocations).toEqual([]);
    const exact = createSourceCandidateStore({ maxOwnedBufferBytes: total });
    const h = await exact.capture(m, stamp());
    expect(exact.describe(h).sourceDigest).toBe(digest(m));
    expect(allocations).toEqual([...sizes, preimageBytes]);
    exact.release(h); exact.release(h);
    allocations.length = 0;
    const h2 = await exact.capture(m, stamp());
    expect(allocations).toEqual([...sizes, preimageBytes]); exact.release(h2);
    // Shape failure outranks a tiny but positive store budget, with no allocation.
    allocations.length = 0;
    const tiny = createSourceCandidateStore({ maxOwnedBufferBytes: 1 });
    await expect(tiny.capture({ ...m, positions: new Float32Array(4) }, stamp())).rejects.toThrowError(refusal('INVALID_INPUT'));
    expect(allocations).toEqual([]);
  } finally { encode.mockRestore(); vi.unstubAllGlobals(); }
});
it.each([false, true])('dispose fences pending real SHA completion (failure injection=%s)', async injectFailure => {
  const nativeDigest = crypto.subtle.digest.bind(crypto.subtle);
  let open!: () => void;
  const gate = new Promise<void>(resolve => { open = resolve; });
  let submitted: Buffer | undefined, nativeSettled = false;
  const sha = vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (algorithm, data) => {
    submitted = Buffer.from(data as Uint8Array);
    const result = await nativeDigest(algorithm, data); nativeSettled = true;
    await gate;
    // Explicit failure injection, never a fabricated successful digest.
    if (injectFailure) throw Error('injected digest rejection containing private details');
    return result;
  });
  try {
    const store = createSourceCandidateStore({ maxOwnedBufferBytes: 4096 });
    const m = mesh(), expectedBytes = canonicalBytes(m);
    const p = store.capture(m, stamp());
    let settled = false, published = false;
    const observed = p.then(h => { settled = true; published = true; return h; }, e => { settled = true; throw e; });
    const rejection = expect(observed).rejects.toThrowError(refusal('STALE_SOURCE'));
    m.positions.fill(99);
    await vi.waitFor(() => expect(nativeSettled).toBe(true));
    expect(submitted).toEqual(expectedBytes);
    store.dispose(); store.dispose();
    await Promise.resolve(); expect(settled).toBe(false);
    await expect(store.capture(null!, null!)).rejects.toThrowError(refusal('STALE_SOURCE'));
    expect(sha).toHaveBeenCalledTimes(1);
    open(); await rejection;
    expect(published).toBe(false); expect(settled).toBe(true);
    expect(() => store.describe({} as SourceCandidate)).toThrowError(refusal('STALE_SOURCE'));
  } finally { open(); sha.mockRestore(); }
});
it.each(['copy', 'preimage', 'sha-reject', 'sha-throw'])('rolls back %s failure injection as sanitized UNAVAILABLE, allowing a fresh capture', async stage => {
  const m = mesh(), total = canonicalBytes(m).length + m.positions.byteLength + m.indices.byteLength + m.colors!.byteLength + m.uvs!.byteLength;
  const store = createSourceCandidateStore({ maxOwnedBufferBytes: total });
  const NativeBuffer = ArrayBuffer;
  let allocations = 0;
  vi.stubGlobal('ArrayBuffer', new Proxy(NativeBuffer, { construct(target, args) {
    allocations++;
    if ((stage === 'copy' && allocations === 2) || (stage === 'preimage' && allocations === 5)) throw new RangeError('injected allocation failure private details');
    return Reflect.construct(target, args);
  } }));
  const nativeDigest = crypto.subtle.digest.bind(crypto.subtle);
  const sha = vi.spyOn(crypto.subtle, 'digest').mockImplementation((algorithm, data) => {
    if (stage === 'sha-throw') throw Error('injected synchronous hash failure private details');
    if (stage === 'sha-reject') return Promise.reject(Error('injected rejected hash private details'));
    return nativeDigest(algorithm, data);
  });
  try { await expect(store.capture(m, stamp())).rejects.toThrowError(refusal('UNAVAILABLE')); }
  finally { sha.mockRestore(); vi.unstubAllGlobals(); }
  const h = await store.capture(m, stamp()); expect(store.describe(h).sourceDigest).toBe(digest(m));
  store.release(h); store.release(h);
  const h2 = await store.capture(m, stamp()); expect(store.describe(h2).sourceDigest).toBe(digest(m));
  store.dispose();
});
// Coverage of the already-green lifecycle implementation, not an invented RED.
it('releasing retired h1 during real pending capture h2 cannot cancel h2 or free its reservation', async () => {
  const m = mesh(), total = canonicalBytes(m).length + m.positions.byteLength + m.indices.byteLength + m.colors!.byteLength + m.uvs!.byteLength;
  const store = createSourceCandidateStore({ maxOwnedBufferBytes: total });
  const h1 = await store.capture(m, stamp()); store.release(h1);
  const nativeDigest = crypto.subtle.digest.bind(crypto.subtle);
  let open!: () => void;
  const gate = new Promise<void>(resolve => { open = resolve; });
  const sha = vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (algorithm, data) => {
    const result = await nativeDigest(algorithm, data); await gate; return result;
  });
  try {
    const p2 = store.capture(m, stamp()); let settled = false;
    void p2.then(() => { settled = true; });
    store.release(h1); store.release(h1);
    await expect(store.capture(null!, null!)).rejects.toThrowError(refusal('SOURCE_IN_USE'));
    await Promise.resolve(); expect(settled).toBe(false); expect(sha).toHaveBeenCalledTimes(1);
    open(); const h2 = await p2;
    expect(store.describe(h2).sourceDigest).toBe(digest(m));
    store.release(h1); store.release(h2);
    const h3 = await store.capture(m, stamp()); expect(store.describe(h3).sourceDigest).toBe(digest(m)); store.dispose();
  } finally { open(); sha.mockRestore(); }
});
it('validates a triangle ordinal before decoding, context use or inspecting controls', async () => {
  const store = createSourceCandidateStore({ maxOwnedBufferBytes: 4096 });
  const h = await store.capture(mesh(), stamp());
  let touched = 0;
  const hostile = { valueOf() { touched++; throw Error('coercion'); } };
  const weights = Object.defineProperty([], '0', { get() { touched++; throw Error('control getter'); } }) as unknown as CubicBarycentricControls;
  for (const f of [-1, 0.5, 4, 12, NaN, Infinity, '0', null, hostile]) {
    expect(() => store.resolveFace(h, f as number, null!)).toThrowError(refusal('INVALID_INPUT'));
    expect(() => store.bindFaceCubic(h, f as number, weights, null!)).toThrowError(refusal('INVALID_INPUT'));
  }
  expect(touched).toBe(0);
  expect(store.resolveFace(h, 3, context()).vertexIDs).toEqual([2, 0, 3]);
});
it('checks native typed-array kind rather than a spoofed ordinary prototype or tag', async () => {
  const store = createSourceCandidateStore({ maxOwnedBufferBytes: 4096 });
  const m = mesh();
  const disguised = new Uint32Array(m.positions.buffer.slice(0));
  Object.setPrototypeOf(disguised, Float32Array.prototype);
  Object.defineProperty(disguised, Symbol.toStringTag, { value: 'Float32Array' });
  await expect(store.capture({ ...m, positions: disguised as unknown as Float32Array }, stamp())).rejects.toThrowError(refusal('INVALID_INPUT'));
  const disguisedIndices = new Float32Array(m.indices.buffer.slice(0));
  Object.setPrototypeOf(disguisedIndices, Uint32Array.prototype);
  await expect(store.capture({ ...m, indices: disguisedIndices as unknown as Uint32Array }, stamp())).rejects.toThrowError(refusal('INVALID_INPUT'));
  let touched = 0;
  Object.defineProperty(m.positions, Symbol.toStringTag, { get() { touched++; throw Error('tag getter'); } });
  Object.defineProperty(m.positions.buffer, 'resizable', { get() { touched++; throw Error('buffer getter'); } });
  const h = await store.capture(m, stamp());
  expect(store.describe(h).sourceDigest).toBe(digest(mesh())); expect(touched).toBe(0);
});
it.each(['numeric', 'texture'])('preserves UNAVAILABLE for injected allocation failure inside real %s validation', async stage => {
  const store = createSourceCandidateStore({ maxOwnedBufferBytes: 4096 });
  const nativeTest = RegExp.prototype.test;
  const finiteFailure = stage === 'numeric' ? vi.spyOn(Number, 'isFinite').mockImplementationOnce(() => { throw new RangeError('injected validator allocation failure'); }) : undefined;
  const textureFailure = stage === 'texture' ? vi.spyOn(RegExp.prototype, 'test').mockImplementation(function (this: RegExp, value) {
    if (this.source.startsWith('^data:')) throw new RangeError('injected texture validator allocation failure');
    return nativeTest.call(this, value);
  }) : undefined;
  try { await expect(store.capture(mesh(), stamp())).rejects.toThrowError(refusal('UNAVAILABLE')); }
  finally { finiteFailure?.mockRestore(); textureFailure?.mockRestore(); }
  const h = await store.capture(mesh(), stamp()); expect(store.describe(h).sourceDigest).toBe(digest(mesh())); store.dispose();
});
// Additional composition coverage of the real public arithmetic/certifier; no fake RED.
it('uses the public decoder and real certifier on the same cumulative arithmetic context', async () => {
  const store = createSourceCandidateStore({ maxOwnedBufferBytes: 4096 });
  const h = await store.capture(mesh(), stamp());
  const ctx = context(), q = (n: bigint) => rational(n, 1n, ctx);
  const row = [q(1n), q(0n), q(0n)] as const;
  const weights = [row, row, row, row] as const;
  const decoder = vi.spyOn(numerics, 'fromFloat32Bits'), certifier = vi.spyOn(faceCubic, 'certifyFaceCubic');
  try {
    const span = store.bindFaceCubic(h, 0, weights, ctx);
    expect(decoder).toHaveBeenCalledTimes(9);
    expect(decoder.mock.calls.every(call => call[1] === ctx)).toBe(true);
    expect(certifier).toHaveBeenCalledExactlyOnceWith(span.face.triangle, weights, ctx);
    const exhausted = context(1);
    expect(() => store.resolveFace(h, 0, exhausted)).toThrowError(expect.objectContaining({ name: 'NumericsError', code: 'BUDGET_EXCEEDED' }));
    expect(() => rational(0n, 1n, exhausted)).toThrowError(expect.objectContaining({ name: 'NumericsError', code: 'BUDGET_EXCEEDED' }));
    const small = context(400);
    expect(() => store.bindFaceCubic(h, 0, weights, small)).toThrowError(expect.objectContaining({ name: 'NumericsError', code: 'BUDGET_EXCEEDED' }));
    expect(() => rational(0n, 1n, small)).toThrowError(expect.objectContaining({ name: 'NumericsError', code: 'BUDGET_EXCEEDED' }));
    expect(() => store.resolveFace(h, 0, {} as never)).toThrowError(expect.objectContaining({ name: 'NumericsError', code: 'INVALID_INPUT' }));
    expect(() => store.bindFaceCubic(h, 0, {} as never, context())).toThrowError(expect.objectContaining({ name: 'FaceCubicError', code: 'INVALID_INPUT' }));
    const bad = [[q(-1n), q(1n), q(1n)], row, row, row] as const;
    expect(() => store.bindFaceCubic(h, 0, bad, context())).toThrowError(expect.objectContaining({ name: 'FaceCubicError', code: 'INVALID_BARYCENTRIC' }));
  } finally { decoder.mockRestore(); certifier.mockRestore(); }
  store.release(h);
  const degenerate = mesh(); degenerate.indices[1] = 0;
  const hd = await store.capture(degenerate, stamp()); // A candidate is not audited S.
  expect(() => store.bindFaceCubic(hd, 0, weights, context())).toThrowError(expect.objectContaining({ name: 'FaceCubicError', code: 'DEGENERATE_TRIANGLE' }));
  store.dispose();
});
it('binds the requested nearby plate and preserves source ordering rather than nearest geometry', async () => {
  const m = mesh();
  // A synthetic closed thin cuboid: two nonincident plates only 1/1024 mm apart.
  m.positions = new Float32Array([2, 0, -0, 3, 0, 0, 3, 1, 0, 2, 1, 0,
    2, 0, 1 / 1024, 3, 0, 1 / 1024, 3, 1, 1 / 1024, 2, 1, 1 / 1024]);
  m.indices = new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7,
    0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]);
  delete m.colors; delete m.uvs; delete m.textureUrl;
  const store = createSourceCandidateStore({ maxOwnedBufferBytes: 4096 });
  const h = await store.capture(m, stamp());
  const ctx = context(), q = (n: bigint, d = 1n) => rational(n, d, ctx);
  const w: CubicBarycentricControls = [[q(1n, 2n), q(1n, 3n), q(1n, 6n)],
    [q(1n), q(0n), q(0n)], [q(0n), q(1n), q(0n)], [q(0n), q(0n), q(1n)]];
  const a = store.bindFaceCubic(h, 0, w, ctx), b = store.bindFaceCubic(h, 2, w, ctx);
  expect(a.face.vertexIDs).toEqual([0, 2, 1]); expect(b.face.vertexIDs).toEqual([4, 5, 6]);
  expect(a.containment.controls[0][2]).toEqual(q(0n)); expect(b.containment.controls[0][2]).toEqual(q(1n, 1024n));
  store.release(h);
  [m.indices[1], m.indices[2]] = [m.indices[2], m.indices[1]];
  const hp = await store.capture(m, stamp());
  const noWeightPermutation = store.bindFaceCubic(hp, 0, w, ctx);
  const swapped = w.map(row => [row[0], row[2], row[1]]) as unknown as CubicBarycentricControls;
  const corrected = store.bindFaceCubic(hp, 0, swapped, ctx);
  expect(noWeightPermutation.containment.controls).not.toEqual(a.containment.controls);
  expect(corrected.containment.controls).toEqual(a.containment.controls);
  expect(corrected.face.vertexIDs).toEqual([0, 1, 2]);
  expect(corrected.face.source.sourceDigest).not.toBe(a.face.source.sourceDigest);
  store.dispose();
});

interface OracleRat { n: string; d: string }
interface OracleFace {
  sourceFace: number; vertexIDs: number[]; positionBits: number[][]; triangle: OracleRat[][];
}
interface OracleCase {
  id: string;
  mesh: { name: string; positionsBits: number[]; indices: number[]; colorsBits?: number[]; uvsBits?: number[];
    source?: 'synthetic' | 'imported'; textureUrl?: string };
  stamp: SourceStamp;
  expected: { sourceDigest: string; vertexCount: number; faceCount: number; faces: OracleFace[] };
}
function uints(values: unknown, expectedLength?: number): asserts values is number[] {
  if (!Array.isArray(values)) throw Error('Invalid oracle integer array');
  expect(values.length).toBeLessThanOrEqual(600000);
  if (expectedLength !== undefined) expect(values).toHaveLength(expectedLength);
  for (let i = 0; i < values.length; i++) {
    expect(Object.hasOwn(values, i)).toBe(true);
    expect(typeof values[i]).toBe('number'); expect(Number.isSafeInteger(values[i])).toBe(true);
    expect(values[i]).toBeGreaterThanOrEqual(0); expect(values[i]).toBeLessThanOrEqual(0xffffffff);
  }
}
it('interoperates directly with every untouched independent Python oracle case and face', async () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/v03-source-candidate-oracle.json', import.meta.url), 'utf8')) as
    { format: string; version: number; cases: OracleCase[] };
  expect(fixture.format).toBe('OrthoSculptSourceCandidateOracle'); expect(fixture.version).toBe(1);
  expect(Array.isArray(fixture.cases)).toBe(true); expect(fixture.cases.length).toBeGreaterThan(0); expect(fixture.cases.length).toBeLessThanOrEqual(32);
  const ids = new Set<string>(), sourceIds = new Set<string>();
  for (const c of fixture.cases) {
    expect(typeof c.id).toBe('string'); expect(ids.has(c.id)).toBe(false); ids.add(c.id);
    const e = c.expected, m = c.mesh;
    // Validate ALL fixture integer fields before constructing ANY typed arrays.
    for (const n of [e.vertexCount, e.faceCount, c.stamp.projectEpoch, c.stamp.revision, c.stamp.generation]) {
      expect(Number.isSafeInteger(n)).toBe(true); expect(n).toBeGreaterThanOrEqual(0);
    }
    expect(e.vertexCount).toBeGreaterThanOrEqual(3); expect(e.vertexCount).toBeLessThanOrEqual(200000);
    expect(e.faceCount).toBeGreaterThanOrEqual(1); expect(e.faceCount).toBeLessThanOrEqual(200000);
    uints(m.positionsBits, e.vertexCount * 3); uints(m.indices, e.faceCount * 3);
    for (const n of m.indices) expect(n).toBeLessThan(e.vertexCount);
    if (m.colorsBits !== undefined) uints(m.colorsBits, e.vertexCount * 3);
    if (m.uvsBits !== undefined) uints(m.uvsBits, e.vertexCount * 2);
    for (const a of [m.positionsBits, m.colorsBits, m.uvsBits]) if (a) for (const n of a) expect((n >>> 23) & 255).not.toBe(255);
    expect(e.faces).toHaveLength(e.faceCount);
    for (const [ordinal, face] of e.faces.entries()) {
      expect(Number.isSafeInteger(face.sourceFace)).toBe(true); expect(face.sourceFace).toBe(ordinal);
      uints(face.vertexIDs, 3); for (const id of face.vertexIDs) expect(id).toBeLessThan(e.vertexCount);
      expect(face.positionBits).toHaveLength(3); for (const row of face.positionBits) uints(row, 3);
      expect(face.triangle).toHaveLength(3);
      for (const row of face.triangle) {
        expect(row).toHaveLength(3);
        for (const r of row) { expect(r.n).toMatch(/^(0|-?[1-9][0-9]*)$/); expect(r.d).toMatch(/^[1-9][0-9]*$/); }
      }
    }
    const f32 = (bits: number[]) => new Float32Array(new Uint32Array(bits).buffer);
    const input: MeshData = { name: m.name, positions: f32(m.positionsBits), indices: new Uint32Array(m.indices),
      source: m.source, textureUrl: m.textureUrl,
      ...(m.colorsBits === undefined ? {} : { colors: f32(m.colorsBits) }), ...(m.uvsBits === undefined ? {} : { uvs: f32(m.uvsBits) }) };
    const store = createSourceCandidateStore({ maxOwnedBufferBytes: 1024 * 1024 });
    const h = await store.capture(input, c.stamp), d = store.describe(h);
    expect(d.sourceDigest, c.id).toBe(e.sourceDigest); expect(d.vertexCount).toBe(e.vertexCount); expect(d.faceCount).toBe(e.faceCount);
    expect(d.stamp).toEqual(c.stamp); expect(sourceIds.has(d.sourceId)).toBe(false); sourceIds.add(d.sourceId);
    const ctx = context();
    for (const expected of e.faces) {
      const actual = store.resolveFace(h, expected.sourceFace, ctx);
      expect(actual.sourceFace).toBe(expected.sourceFace); expect(actual.vertexIDs).toEqual(expected.vertexIDs);
      expect(actual.positionBits).toEqual(expected.positionBits);
      // Serialize live native BigInts into the contract's literal Rat fields; expected is untouched.
      expect(JSON.parse(JSON.stringify(actual.triangle, (_key, value) => typeof value === 'bigint' ? value.toString() : value))).toEqual(expected.triangle);
      frozen(actual);
    }
    store.dispose();
  }
  expect(ids.size).toBe(fixture.cases.length); expect(sourceIds.size).toBe(fixture.cases.length);
});
