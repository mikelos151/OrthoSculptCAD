import { describe, expect, it } from 'vitest';
import { createResourceLedger } from '../src/compute/resourceLedger';
import type { Lease, PlanEntry, Refusal } from '../src/compute/resourceLedger';
const caps = { managed: 1024, job: 768, history: 512 };
function accepted(value: Lease | Refusal): Lease {
  expect(value).not.toHaveProperty('code');
  return value as Lease;
}
function tuple(l: ReturnType<typeof createResourceLedger>) {
  const { managed, job, history } = l.snapshot();
  return [managed, job, history];
}
describe('G1a resource ledger', () => {
  it('11 rejects detached live backing and allocator reuse without corrupting another allocation', () => {
    const backing = new ArrayBuffer(16);
    const l = createResourceLedger(caps, { allocate: () => backing }), owner = l.createRealm();
    const a = accepted(l.reserve([{ key: 'a', bytes: 16, category: 'job', owner }, { key: 'b', bytes: 16, category: 'resident', owner }]));
    const r = a.ref('a'), rb = a.ref('b'); a.allocateBuffer(r);
    const before = l.snapshot();
    expect(() => a.allocateBuffer(rb)).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
    expect(tuple(l)).toEqual([16, 16, 0]);
    expect(l.snapshot().allocations[0]).toEqual(before.allocations[0]);
    const b = accepted(l.reserve([]));
    const clonedBacking = structuredClone(backing, { transfer: [backing] });
    expect(backing.byteLength).toBe(0); expect(clonedBacking.byteLength).toBe(16);
    const detachedState = l.snapshot();
    expect(() => b.retain(r, 'history', owner)).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
    expect(() => a.reclassify(r, 'history')).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
    expect(() => a.transfer(r, owner)).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
    expect(() => l.registerExisting(backing, b, 'resident', owner)).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
    expect(l.snapshot()).toEqual(detachedState); // Never pretend an unauthorized external detach released ownership.
    a.release(r); b.close(); expect(tuple(l)).toEqual([0, 0, 0]);
  });
  it('10 bounds live control records including zero-byte reservations and empty leases', () => {
    const controls = { maxLeases: 2, maxRefs: 2, maxRealms: 1, maxPlanEntries: 2, maxKeyLength: 4 };
    const l = createResourceLedger(caps, { controls }), owner = l.createRealm();
    expect(() => l.createRealm()).toThrowError(expect.objectContaining({ code: 'BUDGET' }));
    expect(() => l.reserve([{ key: 'long-key', bytes: 0, category: 'resident', owner }])).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
    const a = accepted(l.reserve([{ key: 'a', bytes: 0, category: 'job', owner }]));
    const b = accepted(l.reserve([]));
    expect(l.reserve([])).toEqual({ ok: false, code: 'BUDGET' });
    const r = a.ref('a'); a.allocateBuffer(r);
    const r2 = b.retain(r, 'job', owner); expect(r2).not.toHaveProperty('code');
    const before = l.snapshot();
    expect(b.retain(r, 'resident', owner)).toEqual({ ok: false, code: 'BUDGET' });
    expect(l.registerExisting(new ArrayBuffer(0), b, 'resident', owner)).toEqual({ ok: false, code: 'BUDGET' });
    expect(l.snapshot()).toEqual(before);
    b.release(r2 as never); expect(b.retain(r, 'resident', owner)).not.toHaveProperty('code');
    a.close(); b.close(); expect(l.snapshot().allocations).toEqual([]);
    const tooMany = ['a', 'b', 'c'].map(key => ({ key, bytes: 0, category: 'resident' as const, owner }));
    expect(l.reserve(tooMany)).toEqual({ ok: false, code: 'BUDGET' });
    const c = accepted(l.reserve(tooMany.slice(0, 2))); c.close();
    expect(tuple(l)).toEqual([0, 0, 0]);
    expect(Object.isFrozen(l)).toBe(true); expect(Object.isFrozen(owner)).toBe(true); expect(Object.isFrozen(a)).toBe(true); expect(Object.isFrozen(r)).toBe(true);
    for (const bad of [-1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => createResourceLedger({ ...caps, managed: bad })).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
      expect(() => createResourceLedger(caps, { controls: { maxRefs: bad } })).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
    }
  });
  it('09 authenticates every capability boundary before closed and rejects retired transfer sources', () => {
    const l = createResourceLedger(caps), owner = l.createRealm(), target = l.createRealm();
    const a = accepted(l.reserve([{ key: 'a', bytes: 16, category: 'job', owner }]));
    const r = a.ref('a'); a.allocateBuffer(r);
    const b = accepted(l.reserve([]));
    const foreign = createResourceLedger(caps), foreignRealm = foreign.createRealm();
    const foreignLease = accepted(foreign.reserve([{ key: 'a', bytes: 1, category: 'job', owner: foreignRealm }]));
    const foreignRef = foreignLease.ref('a'); foreignLease.allocateBuffer(foreignRef);
    const badRefs = [{}, 'a', JSON.parse(JSON.stringify(r)), structuredClone(r), foreignRef, null];
    const check = (f: () => unknown, code = 'INVALID_INPUT') => expect(f).toThrowError(expect.objectContaining({ code }));
    for (const bad of badRefs) {
      const before = l.snapshot();
      check(() => a.allocateBuffer(bad as never)); check(() => a.release(bad as never));
      check(() => a.reclassify(bad as never, 'history')); check(() => a.transfer(bad as never, target));
      check(() => b.retain(bad as never, 'job', owner)); expect(l.snapshot()).toEqual(before);
    }
    for (const bad of [{}, foreignRealm, structuredClone(owner), JSON.parse(JSON.stringify(owner)), 'main']) {
      check(() => b.retain(r, 'job', bad as never)); check(() => a.transfer(r, bad as never));
      check(() => l.registerExisting(new ArrayBuffer(1), b, 'job', bad as never));
      check(() => l.reserve([{ key: 'bad', bytes: 1, category: 'resident', owner: bad as never }]));
    }
    for (const bad of [{}, foreignLease, 'lease', JSON.parse(JSON.stringify(a))]) {
      check(() => l.registerExisting(new ArrayBuffer(1), bad as never, 'job', owner));
      check(() => a.close.call(bad as never)); check(() => a.ref.call(bad as never, 'a'));
      check(() => a.allocateBuffer.call(bad as never, r)); check(() => a.release.call(bad as never, r));
      check(() => a.reclassify.call(bad as never, r, 'job')); check(() => a.transfer.call(bad as never, r, target));
      check(() => a.retain.call(bad as never, r, 'job', owner));
    }
    const own2 = b.retain(r, 'job', owner) as never;
    check(() => a.allocateBuffer(own2)); check(() => a.release(own2)); check(() => a.transfer(own2, target));
    a.close();
    for (const bad of [...badRefs, own2]) {
      check(() => a.allocateBuffer(bad as never)); check(() => a.release(bad as never));
      check(() => a.reclassify(bad as never, 'job')); check(() => a.transfer(bad as never, target));
    }
    check(() => a.ref('a'), 'CLOSED'); check(() => a.allocateBuffer(r), 'CLOSED');
    check(() => a.reclassify(r, 'job'), 'CLOSED');
    check(() => a.retain(own2, 'job', owner), 'CLOSED');
    check(() => l.registerExisting(new ArrayBuffer(1), a, 'job', owner), 'CLOSED');
    check(() => a.retain(own2, 'job', {} as never));
    check(() => a.transfer(r, target)); // Retired transfer source is not authority, even after close.
    check(() => b.retain(r, 'job', owner));
    a.release(r); a.close(); b.close(); expect(tuple(l)).toEqual([0, 0, 0]);
  });
  it('08 checks logical sole-reference realm handoff without native detach or re-reservation', () => {
    const l = createResourceLedger(caps), main = l.createRealm(), worker = l.createRealm();
    const a = accepted(l.reserve([{ key: 'a', bytes: 256, category: 'job', owner: main }]));
    const r = a.ref('a'); const backing = a.allocateBuffer(r);
    const b = accepted(l.reserve([])); const ui = b.retain(r, 'resident', main);
    const before = l.snapshot();
    expect(() => a.transfer(r, worker)).toThrowError(expect.objectContaining({ code: 'TRANSFER_ALIASED' }));
    expect(l.snapshot()).toEqual(before); expect(backing.byteLength).toBe(256);
    expect(() => a.retain(r, 'job', worker)).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
    b.release(ui as never);
    const sole = l.snapshot(); a.transfer(r, worker);
    const after = l.snapshot();
    expect(tuple(l)).toEqual([256, 256, 0]);
    expect(after.allocations[0].id).toBe(sole.allocations[0].id);
    expect(after.allocations[0].refs[0].id).toBe(sole.allocations[0].refs[0].id);
    expect(after.allocations[0].realm).not.toBe(sole.allocations[0].realm);
    expect(backing.byteLength).toBe(256); // G1a is logical only; G1b owns transport.
    expect(() => b.retain(r, 'job', main)).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
    const hold = b.retain(r, 'job', worker); a.close();
    b.transfer(hold as never, main); expect(tuple(l)).toEqual([256, 256, 0]);
    b.close(); expect(tuple(l)).toEqual([0, 0, 0]);
  });
  it('07 registers native backing identity, not view lengths; independent copies need new reservations', () => {
    const l = createResourceLedger(caps), owner = l.createRealm();
    const a = accepted(l.reserve([{ key: 'a', bytes: 768, category: 'resident', owner }]));
    const backing = a.allocateBuffer(a.ref('a')), v1 = new Uint8Array(backing, 0, 16), v2 = new Uint32Array(backing, 16, 8);
    const b = accepted(l.reserve([]));
    expect(l.registerExisting(v1.buffer, b, 'resident', owner)).not.toHaveProperty('code');
    expect(l.registerExisting(v2.buffer, b, 'resident', owner)).not.toHaveProperty('code');
    const graph = l.snapshot();
    expect(graph.allocations).toHaveLength(1);
    expect(graph.allocations[0].refs).toHaveLength(3);
    expect(new Set(graph.allocations[0].refs.map(r => r.id)).size).toBe(3);
    v2[0] = 0xdeadbeef; expect(l.snapshot()).toEqual(graph);
    expect(l.registerExisting(backing, b, 'history', owner)).toEqual({ ok: false, code: 'BUDGET' });
    expect(l.snapshot()).toEqual(graph);
    expect(() => l.registerExisting(v1 as never, b, 'resident', owner)).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
    const copy = accepted(l.reserve([{ key: 'copy', bytes: 256, category: 'resident', owner }]));
    const copied = copy.allocateBuffer(copy.ref('copy')); new Uint8Array(copied).set(new Uint8Array(backing, 0, 256));
    expect(copied).not.toBe(backing); expect(l.snapshot().allocations.map(a => a.id)).toEqual([1, 2]);
    expect(l.reserve([{ key: 'extra', bytes: 1, category: 'resident', owner }])).toEqual({ ok: false, code: 'BUDGET' });
    expect(tuple(l)).toEqual([1024, 0, 0]);
    const external = new ArrayBuffer(1); const full = l.snapshot();
    expect(l.registerExisting(external, b, 'resident', owner)).toEqual({ ok: false, code: 'BUDGET' }); expect(l.snapshot()).toEqual(full);
    copy.close();
    Object.defineProperty(external, 'byteLength', { value: 999999 });
    expect(l.registerExisting(external, b, 'job', owner)).not.toHaveProperty('code');
    expect(tuple(l)).toEqual([769, 1, 0]);
    expect(l.snapshot().allocations[1].bytes).toBe(1);
  });
  it('06 rolls back only the failed unmaterialized key and validates real fixed buffers intrinsically', () => {
    let calls = 0;
    const l = createResourceLedger(caps, { allocate: n => { if (++calls === 2) throw new RangeError('synthetic native failure'); return new ArrayBuffer(n); } });
    const owner = l.createRealm();
    const a = accepted(l.reserve(['ok', 'fail', 'pending'].map(key => ({ key, bytes: 128, category: 'job', owner }))));
    const ok = a.ref('ok'), fail = a.ref('fail'), pending = a.ref('pending');
    a.allocateBuffer(ok);
    const b = accepted(l.reserve([])); b.retain(ok, 'history', owner);
    expect(() => a.allocateBuffer(fail)).toThrow('synthetic native failure');
    expect(tuple(l)).toEqual([256, 256, 128]);
    expect(a.ref('pending')).toBe(pending);
    a.release(fail); expect(tuple(l)).toEqual([256, 256, 128]);
    expect(() => a.allocateBuffer(fail)).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
    expect(() => a.allocateBuffer(ok)).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
    a.allocateBuffer(pending); expect(calls).toBe(3);
    const detached = new ArrayBuffer(8); structuredClone(detached, { transfer: [detached] });
    const rab = Reflect.construct(ArrayBuffer, [8, { maxByteLength: 16 }]);
    for (const bad of [{ byteLength: 8 }, new ArrayBuffer(7), new SharedArrayBuffer(8), detached, rab]) {
      const x = createResourceLedger(caps, { allocate: () => bad as ArrayBuffer }), r = x.createRealm();
      const lease = accepted(x.reserve([{ key: 'x', bytes: 8, category: 'resident', owner: r }]));
      expect(() => lease.allocateBuffer(lease.ref('x'))).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
      expect(tuple(x)).toEqual([0, 0, 0]);
    }
    const backing = new ArrayBuffer(8); Object.defineProperty(backing, 'byteLength', { value: 9999 });
    const x = createResourceLedger(caps, { allocate: () => backing }), r = x.createRealm();
    const lease = accepted(x.reserve([{ key: 'x', bytes: 8, category: 'resident', owner: r }]));
    expect(lease.allocateBuffer(lease.ref('x'))).toBe(backing); expect(tuple(x)).toEqual([8, 0, 0]);
  });
  it('05 closes only own refs, preserves controlled holds, ignores retired h1 while h2 pending', () => {
    const l = createResourceLedger({ ...caps, history: 768 }), owner = l.createRealm();
    const a = accepted(l.reserve([{ key: 'a', bytes: 768, category: 'job', owner }]));
    const r = a.ref('a'); a.allocateBuffer(r);
    const b = accepted(l.reserve([])); const h = b.retain(r, 'history', owner);
    expect(tuple(l)).toEqual([768, 768, 768]);
    expect(() => b.release(r)).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
    a.close(); expect(tuple(l)).toEqual([768, 0, 768]);
    a.close(); a.release(r); expect(tuple(l)).toEqual([768, 0, 768]);
    b.release(h as never); expect(tuple(l)).toEqual([0, 0, 0]);
    const caller = accepted(l.reserve([{ key: 'c', bytes: 256, category: 'job', owner }]));
    const c = caller.ref('c'); caller.allocateBuffer(c);
    const broker = accepted(l.reserve([])); const controlled = broker.retain(c, 'job', owner);
    caller.close(); expect(tuple(l)).toEqual([256, 256, 0]);
    broker.release(controlled as never); expect(tuple(l)).toEqual([0, 0, 0]);
    const pending = accepted(l.reserve([{ key: 'h2', bytes: 256, category: 'job', owner }]));
    const h2 = pending.ref('h2'); const before = l.snapshot();
    a.release(r); expect(l.snapshot()).toEqual(before); expect(pending.ref('h2')).toBe(h2);
    pending.close(); expect(tuple(l)).toEqual([0, 0, 0]);
  });
  it('04 reclassifies only one owning ref and rolls back all categories on refusal', () => {
    for (const bytes of [256, 768]) {
      const l = createResourceLedger(caps), owner = l.createRealm();
      const a = accepted(l.reserve([{ key: 'a', bytes, category: 'job', owner }]));
      const r = a.ref('a'); a.allocateBuffer(r);
      const b = accepted(l.reserve([])); const r2 = b.retain(r, 'job', owner);
      expect(r2).not.toHaveProperty('code');
      const before = l.snapshot(), result = a.reclassify(r, 'history');
      if (bytes === 768) { expect(result).toEqual({ ok: false, code: 'BUDGET' }); expect(l.snapshot()).toEqual(before); }
      else { expect(result).toBeUndefined(); expect(tuple(l)).toEqual([256, 256, 256]); }
      expect(() => a.reclassify(r2 as never, 'resident')).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
    }
  });
  it('03 retains materialized backing once per category with atomic history refusal', () => {
    for (const history of [512, 768]) {
      const l = createResourceLedger({ ...caps, history }), owner = l.createRealm();
      const a = accepted(l.reserve([{ key: 'a', bytes: 768, category: 'resident', owner }]));
      const b = accepted(l.reserve([])), r = a.ref('a');
      const before = l.snapshot();
      expect(() => b.retain(r, 'job', owner)).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
      expect(l.snapshot()).toEqual(before);
      a.allocateBuffer(r);
      const r2 = b.retain(r, 'resident', owner);
      expect(r2).not.toBe(r);
      expect(r2).not.toHaveProperty('code');
      expect(tuple(l)).toEqual([768, 0, 0]);
      expect(() => b.allocateBuffer(r2 as never)).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
      const live = l.snapshot();
      const h = b.retain(r, 'history', owner);
      if (history === 512) { expect(h).toEqual({ ok: false, code: 'BUDGET' }); expect(l.snapshot()).toEqual(live); }
      else { expect(h).not.toHaveProperty('code'); expect(tuple(l)).toEqual([768, 0, 768]); }
    }
  });
  it('02 atomically refuses managed/category excess and malformed plans before allocation', () => {
    let allocations = 0;
    const l = createResourceLedger(caps, { allocate: n => { allocations++; return new ArrayBuffer(n); } });
    const owner = l.createRealm();
    const plan = (bytes: number, category: PlanEntry['category'] = 'resident'): PlanEntry[] => [{ key: 'x', bytes, category, owner }];
    accepted(l.reserve(plan(768, 'job')));
    const before = l.snapshot();
    expect(l.reserve(plan(257))).toEqual({ ok: false, code: 'BUDGET' });
    expect(l.reserve([...plan(1), { key: 'y', bytes: 256, category: 'resident', owner }])).toEqual({ ok: false, code: 'BUDGET' });
    expect(l.snapshot()).toEqual(before);
    for (const bad of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => l.reserve(plan(bad))).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
    }
    expect(() => l.reserve([...plan(1), ...plan(2)])).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
    expect(() => l.reserve([{ ...plan(1)[0], owner: {} as never }])).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
    expect(l.snapshot()).toEqual(before);
    accepted(l.reserve(plan(256)));
    expect(tuple(l)).toEqual([1024, 768, 0]);
    expect(l.reserve(plan(1))).toEqual({ ok: false, code: 'BUDGET' });
    expect(allocations).toBe(0);
    const huge = createResourceLedger({ managed: Number.MAX_SAFE_INTEGER, job: Number.MAX_SAFE_INTEGER, history: Number.MAX_SAFE_INTEGER });
    const r = huge.createRealm();
    expect(huge.reserve([{ key: 'a', bytes: Number.MAX_SAFE_INTEGER, category: 'resident', owner: r }, { key: 'b', bytes: 1, category: 'resident', owner: r }])).toEqual({ ok: false, code: 'BUDGET' });
    expect(tuple(huge)).toEqual([0, 0, 0]);
  });
  it('01 reserves before a real exact-limit native allocation', () => {
    const l = createResourceLedger(caps), owner = l.createRealm();
    const a = accepted(l.reserve([{ key: 'a', bytes: 768, category: 'job', owner }]));
    expect(tuple(l)).toEqual([768, 768, 0]);
    const backing = a.allocateBuffer(a.ref('a'));
    expect(backing).toBeInstanceOf(ArrayBuffer);
    expect(backing.byteLength).toBe(768);
    expect(tuple(l)).toEqual([768, 768, 0]);
  });
});
