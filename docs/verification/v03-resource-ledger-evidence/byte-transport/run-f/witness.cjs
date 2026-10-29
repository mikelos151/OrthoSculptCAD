'use strict';
// Independent real-API review witnesses; no replacement ledger, worker or hash results.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createResourceLedger, DEFAULT_RESOURCE_LIMITS } = require('./compiled/resourceLedger.js');
const results = [];
let assertions = 0, maxNativePayload = 0, nativeAllocations = 0;
const nativeLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get;
function eq(a, b) { assertions++; assert.deepStrictEqual(a, b); }
function ok(a) { assertions++; assert.ok(a); }
function error(f, code) { assertions++; assert.throws(f, e => e && e.code === code); }
function budget(x) { eq(x, { ok: false, code: 'BUDGET' }); }
function accepted(x) { ok(x && x.code === undefined); return x; }
function native(n) { maxNativePayload = Math.max(maxNativePayload, n); nativeAllocations++; return new ArrayBuffer(n); }
function make(controls, limits = { managed: 64, job: 32, history: 24 }) {
  const l = createResourceLedger(limits, { controls, allocate: native });
  return { l, owner: l.createRealm() };
}
function lease(l, owner, bytes = 8, category = 'job', key = 'a') {
  const x = accepted(l.reserve([{ key, bytes, category, owner }]));
  return { x, r: x.ref(key) };
}
function empty(l) { return accepted(l.reserve([])); }
function unchanged(l, operation, code = 'INVALID_INPUT') {
  const before = l.snapshot(); error(operation, code); eq(l.snapshot(), before);
}
function test(name, body) {
  const start = assertions;
  try { const detail = body(); results.push({ name, passed: true, assertions: assertions - start, detail }); }
  catch (e) { results.push({ name, passed: false, assertions: assertions - start, error: { name: e.name, message: e.message, stack: e.stack } }); }
}

test('weak-identity: serialized/cloned/foreign/diagnostic handles never gain authority', () => {
  const { l, owner } = make(); const target = l.createRealm();
  const { x, r } = lease(l, owner); x.allocateBuffer(r); const dest = empty(l);
  const f = make(); const foreign = lease(f.l, f.owner);
  const snap = l.snapshot();
  const badRefs = [{}, 'a', 1, snap.allocations[0].refs[0], JSON.parse(JSON.stringify(r)), structuredClone(r), foreign.r, null, undefined, new Proxy(r, {})];
  for (const bad of badRefs) for (const op of [
    () => x.allocateBuffer(bad), () => x.release(bad), () => x.reclassify(bad, 'resident'),
    () => x.transfer(bad, target), () => dest.retain(bad, 'resident', owner)
  ]) unchanged(l, op);
  for (const bad of [{}, 'main', 1, snap.allocations[0].realm, structuredClone(owner), f.owner, null]) {
    for (const op of [() => dest.retain(r, 'resident', bad), () => x.transfer(r, bad),
      () => l.reserve([{ key: 'forged', bytes: 0, category: 'resident', owner: bad }]),
      () => l.registerExisting(native(0), dest, 'resident', bad)]) unchanged(l, op);
  }
  const held = accepted(dest.retain(r, 'resident', owner));
  for (const op of [() => x.release(held), () => x.allocateBuffer(held), () => x.reclassify(held, 'job'), () => x.transfer(held, target)]) unchanged(l, op);
  x.close(); dest.close(); foreign.x.close(); eq(l.snapshot().managed, 0);
});

test('borrowed-method receivers authenticate the ledger-local lease', () => {
  const { l, owner } = make(); const { x, r } = lease(l, owner); x.allocateBuffer(r);
  const f = make(); const foreign = empty(f.l);
  for (const bad of [null, {}, { ...x }, foreign, structuredClone({}), 'lease', 0]) {
    for (const method of ['close', 'ref', 'allocateBuffer', 'release', 'reclassify', 'transfer', 'retain']) {
      const args = { close: [], ref: ['a'], allocateBuffer: [r], release: [r], reclassify: [r, 'job'], transfer: [r, owner], retain: [r, 'job', owner] }[method];
      unchanged(l, () => Reflect.apply(x[method], bad, args));
    }
    unchanged(l, () => l.registerExisting(native(0), bad, 'resident', owner));
  }
  const second = empty(l); const h = accepted(x.retain.call(second, r, 'history', owner));
  second.release(h); x.close(); second.close(); foreign.close();
});

test('reserved/live/retired/closed phase and authentication-error priority', () => {
  const { l, owner } = make(); const { x, r } = lease(l, owner); const dest = empty(l), closed = empty(l); closed.close();
  unchanged(l, () => dest.retain(r, 'job', owner));
  unchanged(l, () => closed.retain(r, 'job', owner), 'CLOSED');
  unchanged(l, () => x.transfer(r, owner));
  x.reclassify(r, 'resident'); eq(l.snapshot().allocations[0].phase, 'reserved');
  const b = x.allocateBuffer(r); eq(nativeLength.call(b), 8); eq(l.snapshot().allocations[0].phase, 'live');
  unchanged(l, () => x.allocateBuffer(r));
  const h = accepted(dest.retain(r, 'history', owner)); x.close();
  for (const op of [() => x.ref('a'), () => x.allocateBuffer(r), () => x.reclassify(r, 'job'), () => x.retain(h, 'job', owner),
    () => l.registerExisting(b, x, 'resident', owner)]) unchanged(l, op, 'CLOSED');
  for (const op of [() => x.transfer(r, owner), () => dest.retain(r, 'resident', owner),
    () => x.release({}), () => x.reclassify({}, 'job'), () => x.allocateBuffer({}), () => closed.retain({}, 'job', owner)]) unchanged(l, op);
  x.release(r); x.close(); eq(l.snapshot().managed, 8); dest.release(h); dest.close(); eq(l.snapshot().managed, 0);
});

test('budget refusals preserve entire graph, aliases and controlled references', () => {
  const { l, owner } = make(); const { x, r } = lease(l, owner, 32); const b = x.allocateBuffer(r);
  const hold = empty(l); const h = accepted(hold.retain(r, 'job', owner)); const before = l.snapshot();
  budget(hold.retain(r, 'history', owner)); eq(l.snapshot(), before);
  budget(x.reclassify(r, 'history')); eq(l.snapshot(), before);
  budget(l.registerExisting(b, hold, 'history', owner)); eq(l.snapshot(), before);
  budget(l.reserve([{ key: 'one', bytes: 17, category: 'resident', owner }, { key: 'two', bytes: 16, category: 'resident', owner }])); eq(l.snapshot(), before);
  x.close(); eq(l.snapshot().managed, 32); eq(l.snapshot().job, 32);
  const newer = lease(l, owner, 8, 'resident', 'new'); const snapshot = l.snapshot(); x.release(r); eq(l.snapshot(), snapshot);
  hold.release(h); eq(l.snapshot().managed, 8); newer.x.close(); hold.close(); eq(l.snapshot().managed, 0);
});

test('intrinsic native backing identity ignores forged/shadow getters and view lengths', () => {
  const { l, owner } = make(); const a = empty(l), b = native(16); let getterCalls = 0;
  Object.defineProperty(b, 'byteLength', { get() { getterCalls++; throw Error('must not run'); } });
  Object.defineProperty(b, 'resizable', { get() { getterCalls++; throw Error('must not run'); } });
  const r = accepted(l.registerExisting(b, a, 'job', owner));
  const v = new Uint8Array(b, 4, 2); const h = accepted(l.registerExisting(v.buffer, a, 'history', owner));
  eq(l.snapshot().managed, 16); eq(l.snapshot().job, 16); eq(l.snapshot().history, 16); eq(l.snapshot().allocations.length, 1); eq(getterCalls, 0);
  for (const bad of [v, new DataView(b), { byteLength: 16 }, new Proxy(b, {}), new SharedArrayBuffer(1), new ArrayBuffer(1, { maxByteLength: 2 })]) {
    unchanged(l, () => l.registerExisting(bad, a, 'resident', owner));
  }
  const foreignNative = vm.runInNewContext('new ArrayBuffer(3)');
  accepted(l.registerExisting(foreignNative, a, 'resident', owner)); eq(l.snapshot().managed, 19);
  a.release(r); a.release(h); a.close(); eq(l.snapshot().managed, 0); eq(getterCalls, 0);
  return { foreignRealmNativeBufferAccepted: true, shadowGetterCalls: getterCalls };
});

test('allocator seam: thrown native-style failure and invalid results roll back only failing key', () => {
  const detached = native(4); const transferred = structuredClone(detached, { transfer: [detached] }); eq(nativeLength.call(transferred), 4);
  const sentinel = new RangeError('review injected constructor failure, not a physical OOM');
  const modes = [() => { throw sentinel; }, () => native(3), () => ({}), () => new SharedArrayBuffer(4),
    () => new ArrayBuffer(4, { maxByteLength: 8 }), () => detached, () => new Uint8Array(4)];
  for (const fail of modes) {
    let calls = 0;
    const l = createResourceLedger({ managed: 64, job: 32, history: 24 }, { allocate(n) { return ++calls === 2 ? fail() : native(n); } });
    const owner = l.createRealm(); const a = accepted(l.reserve(['live', 'fail', 'pending'].map(key => ({ key, bytes: 4, category: 'job', owner }))));
    const live = a.ref('live'), failed = a.ref('fail'), pending = a.ref('pending'); a.allocateBuffer(live);
    const broker = empty(l); const h = accepted(broker.retain(live, 'history', owner));
    const before = l.snapshot(); let caught;
    try { a.allocateBuffer(failed); } catch (e) { caught = e; }
    ok(caught); if (fail === modes[0]) eq(caught, sentinel); else eq(caught.code, 'INVALID_INPUT');
    const expected = structuredClone(before); expected.managed -= 4; expected.job -= 4; expected.allocations.splice(1, 1); eq(l.snapshot(), expected);
    eq(a.ref('pending'), pending); unchanged(l, () => a.ref('fail')); a.release(failed); a.allocateBuffer(pending);
    a.close(); eq(l.snapshot().managed, 4); broker.release(h); broker.close(); eq(l.snapshot().managed, 0);
  }
  return { injectedFailureModes: modes.length, physicalOOMAttempted: false };
});

test('allocator duplicate existing/live native backing cannot replace another allocation', () => {
  const b = native(5); const l = createResourceLedger({ managed: 64, job: 32, history: 24 }, { allocate: () => b }); const owner = l.createRealm();
  const dest = empty(l); accepted(l.registerExisting(b, dest, 'history', owner));
  const { x, r } = lease(l, owner, 5); const before = l.snapshot();
  error(() => x.allocateBuffer(r), 'INVALID_INPUT'); eq(l.snapshot().allocations, before.allocations.slice(0, 1)); eq(l.snapshot().history, 5); eq(l.snapshot().managed, 5);
  x.close(); dest.close(); eq(l.snapshot().managed, 0);
});

test('observed native detach refuses ownership transitions without dropping charge; cleanup recovers', () => {
  for (const n of [0, 7]) {
    const { l, owner } = make(); const { x, r } = lease(l, owner, n); const b = x.allocateBuffer(r), dest = empty(l);
    const moved = structuredClone(b, { transfer: [b] }); eq(nativeLength.call(moved), n);
    for (const op of [() => dest.retain(r, 'resident', owner), () => x.reclassify(r, 'resident'), () => x.transfer(r, owner),
      () => l.registerExisting(b, dest, 'resident', owner)]) unchanged(l, op);
    eq(l.snapshot().allocations.length, 1); x.release(r); eq(l.snapshot().allocations, []); x.close(); dest.close();
  }
});

test('zero-byte/empty/invalid-plan control slots are bounded and reusable; realms have lifetime cap', () => {
  const { l, owner } = make({ maxLeases: 2, maxRefs: 2, maxPlanEntries: 2, maxKeyLength: 11 });
  const valid = { key: '__proto__', bytes: 0, category: 'resident', owner };
  for (let i = 0; i < 40; i++) {
    const a = empty(l); const before = l.snapshot();
    for (const bad of [[valid, null], [valid, valid], [valid, { ...valid, key: '' }], [valid, ,],
      [{ ...valid, bytes: NaN }], [{ ...valid, bytes: '0' }], [{ ...valid, bytes: -1 }], [{ ...valid, category: { toString() { throw Error('coercion'); } } }]]) {
      unchanged(l, () => l.reserve(bad));
    }
    budget(l.reserve([valid, { ...valid, key: 'x' }, { ...valid, key: 'y' }])); eq(l.snapshot(), before);
    const b = accepted(l.reserve([valid])); const r = b.ref('__proto__'); b.allocateBuffer(r);
    budget(l.reserve([])); const h = accepted(a.retain(r, 'history', owner));
    const full = l.snapshot(); budget(a.retain(r, 'job', owner)); budget(l.registerExisting(native(0), a, 'resident', owner)); eq(l.snapshot(), full);
    a.release(h); accepted(a.retain(r, 'job', owner)); b.close(); a.close(); eq(l.snapshot().allocations, []);
  }
  for (let i = 1; i < 32; i++) l.createRealm(); error(() => l.createRealm(), 'BUDGET');
  return { recycleRounds: 40, lifetimeRealms: 32 };
});

test('sole-live-ref handoff preserves identity/bytes and never pretends native transport', () => {
  const { l, owner } = make(); const target = l.createRealm(), { x, r } = lease(l, owner); const b = x.allocateBuffer(r); const broker = empty(l);
  const h = accepted(broker.retain(r, 'resident', owner)); unchanged(l, () => x.transfer(r, target), 'TRANSFER_ALIASED');
  x.close(); const before = l.snapshot(); broker.transfer(h, target); const after = l.snapshot();
  eq(after.managed, before.managed); eq(after.allocations[0].id, before.allocations[0].id); eq(after.allocations[0].refs, before.allocations[0].refs);
  ok(after.allocations[0].realm !== before.allocations[0].realm); eq(nativeLength.call(b), 8);
  unchanged(l, () => broker.retain(h, 'resident', owner)); accepted(broker.retain(h, 'job', target)); broker.close(); eq(l.snapshot().managed, 0);
  return { logicalOnly: true, nativeDetach: false };
});

test('deep-frozen diagnostics expose no buffer/capability/native authority; default caps unchanged', () => {
  eq(DEFAULT_RESOURCE_LIMITS, { managed: 402653184, job: 134217728, history: 134217728 }); ok(Object.isFrozen(DEFAULT_RESOURCE_LIMITS));
  const { l, owner } = make(); const { x, r } = lease(l, owner); x.allocateBuffer(r); const s = l.snapshot();
  function inspect(o) {
    if (typeof o !== 'object' || o === null) { ok(['number', 'string'].includes(typeof o)); return; }
    ok(Object.isFrozen(o)); ok(o !== owner && o !== x && o !== r); ok(!ArrayBuffer.isView(o));
    assert.throws(() => nativeLength.call(o), TypeError); assertions++;
    eq(Object.getOwnPropertySymbols(o), []);
    for (const val of Object.values(o)) inspect(val);
  }
  inspect(s); eq(Reflect.set(s.allocations[0].refs[0], 'category', 'resident'), false); eq(l.snapshot(), s); x.close();
  let calls = 0; const d = createResourceLedger(undefined, { allocate(n) { calls++; return native(n); } }), realm = d.createRealm();
  for (const category of ['job', 'history']) budget(d.reserve([{ key: category, bytes: 134217729, category, owner: realm }]));
  const full = accepted(d.reserve([{ key: 'virtual', bytes: 402653184, category: 'resident', owner: realm }]));
  budget(d.reserve([{ key: 'plus', bytes: 1, category: 'resident', owner: realm }])); full.close(); eq(calls, 0);
  eq(Object.keys(require('./compiled/resourceLedger.js')).sort(), ['DEFAULT_RESOURCE_LIMITS', 'createResourceLedger']);
});

// Independent projections derived from an explicit reference graph, compared after every operation.
test('deterministic mixed lifecycle graph witness against actual API (1600 steps)', () => {
  const caps = { managed: 48, job: 27, history: 23 }, controls = { maxLeases: 5, maxRefs: 12, maxPlanEntries: 3 };
  const { l, owner } = make(controls, caps); const realms = [owner, l.createRealm(), l.createRealm()];
  let seed = 0x41db7531, aid = 0, rid = 0, events = {};
  const rand = n => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % n; };
  const leases = [], allrefs = [], allocs = new Map();
  const cats = ['resident', 'job', 'history'];
  const refs = () => allrefs.filter(r => r.active);
  function model() {
    const out = { managed: 0, job: 0, history: 0, allocations: [] };
    for (const a of allocs.values()) {
      const rs = refs().filter(r => r.a === a); if (!rs.length) continue;
      out.managed += a.bytes; if (rs.some(r => r.c === 'job')) out.job += a.bytes; if (rs.some(r => r.c === 'history')) out.history += a.bytes;
      out.allocations.push({ id: a.id, bytes: a.bytes, realm: realms.indexOf(a.owner) + 1, phase: a.live ? 'live' : 'reserved', refs: rs.map(r => ({ id: r.id, category: r.c })) });
    }
    return out;
  }
  const fits = m => ['managed', 'job', 'history'].every(k => m[k] <= caps[k]);
  function addRef(ls, a, c, handle) { allrefs.push({ id: ++rid, ls, a, c, handle, active: true }); }
  for (let step = 0; step < 1600; step++) {
    const open = leases.filter(x => !x.closed), active = refs(); const op = rand(7); events[op] = (events[op] || 0) + 1;
    const previous = l.snapshot();
    if (op === 0 || !open.length) {
      const count = rand(4), plan = Array.from({ length: count }, (_, i) => ({ key: `k${i}`, bytes: rand(10), category: cats[rand(3)], owner: realms[rand(3)] }));
      const m = model(); for (const p of plan) { m.managed += p.bytes; if (p.category !== 'resident') m[p.category] += p.bytes; }
      const result = l.reserve(plan);
      if (!fits(m) || open.length >= 5 || active.length + count > 12) { budget(result); eq(l.snapshot(), previous); }
      else {
        const ls = { x: accepted(result), closed: false }; leases.push(ls);
        for (const p of plan) { const a = { id: ++aid, bytes: p.bytes, live: false, owner: p.owner }; allocs.set(a.id, a); addRef(ls, a, p.category, ls.x.ref(p.key)); }
      }
    } else if (op === 1) {
      const reserved = active.filter(r => !r.a.live); if (reserved.length) { const r = reserved[rand(reserved.length)]; const b = r.ls.x.allocateBuffer(r.handle); eq(nativeLength.call(b), r.a.bytes); r.a.live = true; }
    } else if (op === 2) {
      const live = active.filter(r => r.a.live); if (live.length) {
        const r = live[rand(live.length)], dest = open[rand(open.length)], c = cats[rand(3)], m = model();
        if (c !== 'resident' && !active.some(s => s.a === r.a && s.c === c)) m[c] += r.a.bytes;
        const result = dest.x.retain(r.handle, c, r.a.owner);
        if (!fits(m) || active.length >= 12) { budget(result); eq(l.snapshot(), previous); } else addRef(dest, r.a, c, accepted(result));
      }
    } else if (op === 3) {
      if (active.length) { const r = active[rand(active.length)], old = r.c, c = cats[rand(3)]; r.c = c; const valid = fits(model()); r.c = old;
        const result = r.ls.x.reclassify(r.handle, c); if (!valid) { budget(result); eq(l.snapshot(), previous); } else { eq(result, undefined); r.c = c; }
      }
    } else if (op === 4) {
      if (active.length) { const r = active[rand(active.length)]; r.ls.x.release(r.handle); r.active = false; r.ls.x.release(r.handle); }
    } else if (op === 5) {
      const ls = open[rand(open.length)]; ls.x.close(); ls.x.close(); ls.closed = true; for (const r of active) if (r.ls === ls) r.active = false;
    } else if (op === 6 && active.length) {
      const r = active[rand(active.length)], target = realms[rand(3)];
      if (!r.a.live) unchanged(l, () => r.ls.x.transfer(r.handle, target));
      else if (active.filter(s => s.a === r.a).length !== 1) unchanged(l, () => r.ls.x.transfer(r.handle, target), 'TRANSFER_ALIASED');
      else { r.ls.x.transfer(r.handle, target); r.a.owner = target; }
    }
    eq(l.snapshot(), model());
  }
  for (const ls of leases) ls.x.close(); eq(l.snapshot(), { managed: 0, job: 0, history: 0, allocations: [] });
  return { seed: '0x41db7531', steps: 1600, eventCounts: events, allocatedIdentities: aid, referenceIdentities: rid };
});

const report = {
  passed: results.every(x => x.passed), tests: results.length, failed: results.filter(x => !x.passed).length, assertions,
  runtime: { node: process.version, v8: process.versions.v8, execArgv: process.execArgv, platform: process.platform, nativeLengthGetter: Function.prototype.toString.call(nativeLength), arrayBufferConstructor: Function.prototype.toString.call(ArrayBuffer) },
  payload: { maxNativePayloadBytes: maxNativePayload, countedNativeAllocations: nativeAllocations, capSizedAllocations: 0 },
  scope: 'Actual unchanged G1a production API in Node/V8. No browser, full suite, geometry, native Worker, source audit, clinical or EXE acceptance.', results
};
fs.writeFileSync(path.join(__dirname, 'witness-results.json'), JSON.stringify(report, null, 2));
for (const r of results) console.log(`${r.passed ? 'PASS' : 'FAIL'} ${r.name} (${r.assertions} assertions)${r.error ? '\n' + r.error.stack : ''}`);
console.log(JSON.stringify({ passed: report.passed, tests: report.tests, failed: report.failed, assertions, runtime: report.runtime, payload: report.payload }, null, 2));
process.exitCode = report.passed ? 0 : 1;
