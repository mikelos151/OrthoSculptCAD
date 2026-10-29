// TEST-ONLY native browser harness; NOT product RPC/owner/admission/pool code.
import { createSourceCandidateStore } from '@accepted';
import { createArithmeticContext, rational } from '@numerics';
const assert = (ok: unknown, message: string) => { if (!ok) throw Error(message); };
const arithmetic = createArithmeticContext({ maxBits: 4096, maxOperations: 2000000 });
const stores = new Set<ReturnType<typeof createSourceCandidateStore>>();
const store = () => { const s = createSourceCandidateStore({ maxOwnedBufferBytes: 1024 * 1024 }); stores.add(s); return s; };
const trace: unknown[] = [], digests: any[] = [];
const event = (kind: string, details = {}) => trace.push({ kind, at: performance.now(), ...details });
const hex = (a: ArrayBuffer | Uint8Array) => Array.from(a instanceof Uint8Array ? a : new Uint8Array(a), n => n.toString(16).padStart(2, '0')).join('');
const subtle = crypto.subtle;
const nativeMethod = subtle.digest;
const originalDescriptor = Object.getOwnPropertyDescriptor(subtle, 'digest');
const nativeFunction = Function.prototype.toString.call(nativeMethod);
assert(nativeFunction.includes('[native code]'), 'Expected actual native WebCrypto digest');
let digestLabel = '';
let gate: any;
Object.defineProperty(subtle, 'digest', { configurable: true, writable: true, value: async function(algorithm: any, data: any) {
  const bytes = ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data);
  const record = { label: digestLabel, algorithm, preimageHex: hex(bytes), nativeSettled: false, digestHex: '', gated: !!gate };
  digests.push(record); event('native-digest-call', { label: digestLabel });
  const thisGate = gate;
  // Always calls original actual native method; never fabricates/replaces hash bytes.
  const nativePromise = Reflect.apply(nativeMethod, subtle, [algorithm, data]);
  const result = await nativePromise;
  record.nativeSettled = true; record.digestHex = hex(result);
  event('native-promise-fulfilled-observed', { label: record.label });
  if (thisGate) { thisGate.nativeSettled = true; await thisGate.wait; event('real-native-hash-returned-after-test-gate'); }
  return result;
}});
function frozen(value: any): number {
  if (!value || typeof value !== 'object') return 0;
  assert(!ArrayBuffer.isView(value) && !(value instanceof ArrayBuffer), 'public result leaked a view/buffer');
  assert(Object.isFrozen(value), 'public result not frozen inside Worker');
  return 1 + Object.values(value).reduce<number>((sum, child) => sum + frozen(child), 0);
}
function uints(values: any, length?: number) {
  assert(Array.isArray(values) && values.length <= 600000, 'Invalid oracle integer array');
  if (length !== undefined) assert(values.length === length, 'Oracle integer array length');
  for (let i = 0; i < values.length; i++) assert(Object.hasOwn(values, i) && typeof values[i] === 'number' && Number.isSafeInteger(values[i]) && values[i] >= 0 && values[i] <= 0xffffffff, 'Invalid oracle uint32');
}
function validateFixture(f: any) {
  assert(f.format === 'OrthoSculptSourceCandidateOracle' && f.version === 1, 'Fixture contract');
  assert(Array.isArray(f.cases) && f.cases.length > 0 && f.cases.length <= 32, 'Fixture cap');
  const ids = new Set();
  // Validate ALL cases and expected integer fields before ANY fixture TypedArray construction.
  for (const c of f.cases) {
    assert(typeof c.id === 'string' && !ids.has(c.id), 'Fixture unique case id'); ids.add(c.id);
    const { mesh: m, expected: e } = c;
    for (const n of [e.vertexCount, e.faceCount, c.stamp.projectEpoch, c.stamp.revision, c.stamp.generation]) assert(Number.isSafeInteger(n) && n >= 0, 'Fixture safe integer');
    assert(e.vertexCount >= 3 && e.vertexCount <= 200000 && e.faceCount >= 1 && e.faceCount <= 200000, 'Fixture geometry cap');
    uints(m.positionsBits, e.vertexCount * 3); uints(m.indices, e.faceCount * 3);
    for (const id of m.indices) assert(id < e.vertexCount, 'Fixture index range');
    if (m.colorsBits !== undefined) uints(m.colorsBits, e.vertexCount * 3);
    if (m.uvsBits !== undefined) uints(m.uvsBits, e.vertexCount * 2);
    for (const bits of [m.positionsBits, m.colorsBits, m.uvsBits]) if (bits) for (const n of bits) assert(((n >>> 23) & 255) !== 255, 'Fixture nonfinite bits');
    assert(e.faces.length === e.faceCount, 'Fixture faces length');
    for (const [ordinal, f] of e.faces.entries()) {
      assert(Number.isSafeInteger(f.sourceFace) && f.sourceFace === ordinal, 'Fixture face ordinal');
      uints(f.vertexIDs, 3); for (const id of f.vertexIDs) assert(id < e.vertexCount, 'Fixture vertex id');
      assert(f.positionBits.length === 3, 'Fixture position rows'); for (const row of f.positionBits) uints(row, 3);
      assert(f.triangle.length === 3, 'Fixture triangle rows');
      for (const row of f.triangle) { assert(row.length === 3, 'Fixture triangle columns'); for (const r of row) assert(typeof r.n === 'string' && /^(0|-?[1-9][0-9]*)$/.test(r.n) && typeof r.d === 'string' && /^[1-9][0-9]*$/.test(r.d), 'Fixture literal Rat n/d'); }
    }
  }
  event('all-fixture-integers-validated-before-typed-arrays');
}
function fixtureMesh(m: any) {
  const f32 = (bits: number[]) => new Float32Array(new Uint32Array(bits).buffer);
  return { name: m.name, positions: f32(m.positionsBits), indices: new Uint32Array(m.indices), source: m.source, textureUrl: m.textureUrl,
    ...(m.colorsBits === undefined ? {} : { colors: f32(m.colorsBits) }), ...(m.uvsBits === undefined ? {} : { uvs: f32(m.uvsBits) }) };
}
const stamp = () => ({ projectEpoch: 1, revision: 2, generation: 3, units: 'mm' as const, unitsConfirmed: true as const, frameId: 'frame_1' });
const mesh = () => ({ name: 'TESTDATA S 🦴', source: 'synthetic' as const,
  positions: new Float32Array([2, 0, -0, 3, 0, 0, 2, 1, 0, 2, 0, 1]), indices: new Uint32Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 2, 0, 3]),
  colors: new Float32Array(12).fill(0.5), uvs: new Float32Array(8), textureUrl: 'data:image/png;base64,AAAA' });
const code = (fn: () => any) => { try { fn(); return 'ACCEPTED'; } catch (e: any) { assert(e.name === 'SourceCandidateError' && e.message === e.code, 'Unexpected source exception'); return e.code; } };
let auth: any;
async function command(name: string, payload: any) {
  if (name === 'oracle') {
    validateFixture(payload);
    const results = [];
    for (const c of payload.cases) {
      const s = store(); digestLabel = c.id;
      try {
        const h = await s.capture(fixtureMesh(c.mesh), c.stamp), description = s.describe(h);
        assert(Reflect.ownKeys(h).length === 0, 'Opaque handle own keys');
        let frozenNodes = frozen(h) + frozen(description);
        const faces = [];
        for (let f = 0; f < description.faceCount; f++) { const actual = s.resolveFace(h, f, arithmetic); frozenNodes += frozen(actual); faces.push(actual); }
        results.push({ id: c.id, description, faces, frozenNodes, publicBuffers: 0 });
      } finally { s.dispose(); }
    }
    return { cases: results, sharedCumulativeArithmeticContext: true };
  }
  if (name === 'mutation') {
    const m = mesh(), st = stamp(), s = store(); let getterTouches = 0;
    const refs: { view: Float32Array | Uint32Array; length: number }[] = [];
    for (const key of ['positions', 'indices', 'colors', 'uvs'] as const) {
      const original = m[key], bytes = original.byteLength, length = original.length;
      const buffer = new ArrayBuffer(bytes + 16); new Uint8Array(buffer, 8, bytes).set(new Uint8Array(original.buffer));
      const view = key === 'indices' ? new Uint32Array(buffer, 8, length) : new Float32Array(buffer, 8, length);
      for (const field of ['buffer', 'byteOffset', 'byteLength', 'length', 'slice', Symbol.iterator]) Object.defineProperty(view, field, { get() { getterTouches++; throw Error('test-only shadow getter touched'); } });
      Object.assign(m, { [key]: view }); refs.push({ view, length });
    }
    try {
      digestLabel = 'mutation'; const p = s.capture(m, st); event('capture-returned-promise-before-caller-mutation');
      for (const { view, length } of refs) for (let i = 0; i < length; i++) view[i] = 99;
      m.name = 'TESTDATA changed'; m.textureUrl = 'data:image/jpeg;base64,BBBB'; st.revision = 90;
      event('worker-local-caller-input-mutated-before-await');
      const h = await p, description = s.describe(h), face = s.resolveFace(h, 1, arithmetic);
      return { description, face, getterTouches, frozenNodes: frozen(h) + frozen(description) + frozen(face), mutatedViews: refs.length, nonzeroByteOffset: 8 };
    } finally { s.dispose(); }
  }
  if (name === 'gate-start') {
    assert(!gate, 'Only one gate'); let open!: () => void;
    gate = { wait: new Promise<void>(resolve => { open = resolve; }), open: () => open(), nativeSettled: false, captureSettled: false, published: false, s: store() };
    digestLabel = 'pending-dispose';
    const p = gate.s.capture(mesh(), stamp());
    gate.observed = p.then(() => { gate.captureSettled = true; gate.published = true; return { published: true }; }, (e: any) => { gate.captureSettled = true; event('capture-rejected', { code: e.code }); return { published: false, name: e.name, message: e.message, code: e.code }; });
    gate.busyCode = await gate.s.capture(null, null).then(() => 'ACCEPTED', (e: any) => e.code);
    event('test-gate-capture-dispatched'); return { busyCode: gate.busyCode, captureSettled: gate.captureSettled };
  }
  if (name === 'gate-dispose') {
    assert(gate, 'Gate absent');
    const deadline = performance.now() + 10000;
    while (!gate.nativeSettled && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 1));
    assert(gate.nativeSettled, 'Native promise did not fulfill within bound');
    gate.s.dispose(); gate.s.dispose(); event('store-disposed-with-test-gate-closed');
    const closedCode = await gate.s.capture(null, null).then(() => 'ACCEPTED', (e: any) => e.code);
    return { nativePromiseFulfillmentObserved: gate.nativeSettled, captureSettled: gate.captureSettled, published: gate.published, closedCode };
  }
  if (name === 'gate-open') {
    event('test-gate-opened'); gate.open(); const outcome = await gate.observed;
    const state = { ...outcome, captureSettled: gate.captureSettled, nativePromiseFulfillmentObserved: gate.nativeSettled,
      describeClosed: code(() => gate.s.describe({})) };
    gate = undefined; return state;
  }
  if (name === 'auth-start') {
    const s = store(), other = store(); digestLabel = 'auth-primary'; const h = await s.capture(mesh(), stamp());
    digestLabel = 'auth-foreign'; const foreign = await other.capture(mesh(), stamp());
    auth = { s, other, h, foreign };
    const localClone = structuredClone(h), jsonClone = JSON.parse(JSON.stringify(h));
    const attempts: any = {};
    for (const [label, fake] of [['structuredClone', localClone], ['JSON', jsonClone], ['foreignStore', foreign]]) {
      attempts[label as string] = { describe: code(() => s.describe(fake)), resolve: code(() => s.resolveFace(fake, -1, arithmetic)), bind: code(() => s.bindFaceCubic(fake, -1, null, arithmetic)), release: code(() => s.release(fake)) };
    }
    return { attempts, primaryId: s.describe(h).sourceId, foreignId: other.describe(foreign).sourceId, authHandle: h, frozenNodes: frozen(h) };
  }
  if (name === 'auth-return') {
    const { s, other, h } = auth, clone = payload.handle;
    const open = { describe: code(() => s.describe(clone)), resolve: code(() => s.resolveFace(clone, -1, arithmetic)), bind: code(() => s.bindFaceCubic(clone, -1, null, arithmetic)), release: code(() => s.release(clone)) };
    s.release(h); s.release(h);
    const retired = { real: code(() => s.describe(h)), clone: code(() => s.describe(clone)) };
    s.dispose(); s.dispose();
    const closed = { real: code(() => s.describe(h)), clone: code(() => s.describe(clone)), resolveClone: code(() => s.resolveFace(clone, -1, arithmetic)), bindClone: code(() => s.bindFaceCubic(clone, -1, null, arithmetic)), releaseClone: code(() => s.release(clone)), releaseRetired: code(() => s.release(h)) };
    other.dispose(); auth = undefined;
    return { nativePostMessageRoundTrip: true, open, retired, closed };
  }
  if (name === 'bind') {
    const s = store(); digestLabel = 'bind';
    try {
      const h = await s.capture(mesh(), stamp()), q = (n: bigint, d = 1n) => rational(n, d, arithmetic);
      const face = s.resolveFace(h, 1, arithmetic);
      const weights = [[q(1n), q(0n), q(0n)], [q(2n, 3n), q(1n, 3n), q(0n)], [q(1n, 3n), q(2n, 3n), q(0n)], [q(0n), q(1n), q(0n)]];
      const span = s.bindFaceCubic(h, 1, weights as any, arithmetic);
      const tiny = createArithmeticContext({ maxBits: 4096, maxOperations: 1 });
      const exhaustedCodes = [];
      for (let i = 0; i < 2; i++) { try { rational(0n, 1n, tiny); exhaustedCodes.push('ACCEPTED'); } catch (e: any) { exhaustedCodes.push(e.code); } }
      return { face, span, frozenNodes: frozen(face) + frozen(span), sharedCumulativeArithmeticContext: true, exhaustedCodes };
    } finally { s.dispose(); }
  }
  if (name === 'finish') {
    for (const s of stores) s.dispose();
    if (originalDescriptor) Object.defineProperty(subtle, 'digest', originalDescriptor); else delete (subtle as any).digest;
    return { nativeFunction, digestRestored: subtle.digest === nativeMethod, digests, trace,
      userAgent: navigator.userAgent, secureContext: isSecureContext, crossOriginIsolated, sharedArrayBufferAvailable: typeof SharedArrayBuffer !== 'undefined',
      notes: 'Native promise fulfillment observed by JS, not crypto internal thread completion measurement. No native cancellation/RSS/GC claim.' };
  }
  throw Error('Unknown test-only command');
}
self.addEventListener('message', async (e: MessageEvent) => {
  const { id, name, payload } = e.data;
  event('native-worker-message-received', { id, name });
  try { const result = await command(name, payload); self.postMessage({ id, ok: true, result }); }
  catch (error: any) { self.postMessage({ id, ok: false, error: { name: error.name, message: error.message, stack: error.stack } }); }
});
