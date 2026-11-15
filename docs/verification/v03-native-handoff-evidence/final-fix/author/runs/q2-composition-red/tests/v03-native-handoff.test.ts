import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNativeLedger } from '../src/compute/resourceLedger';
import { createNativeHandoff, decodeInputPacket, encodeInputPacket } from '../src/compute/nativeHandoff';
import type { Lease } from '../src/compute/resourceLedger';
const caps = { managed: 1024, job: 1024, history: 1024 };
describe('G1b1b same-private-core handoff (structuredClone unit, not native proof)', () => {
  it('distinguishes native RESERVED from MAIN without changing legacy reserved/live', () => {
    const { ledger: l } = createNativeLedger(caps), owner = l.createRealm();
    const lease = l.reserve([{ key: 'a', bytes: 4, category: 'job', owner }]) as Lease;
    expect(l.snapshot().allocations[0].phase).toBe('RESERVED');
    lease.allocateBuffer(lease.ref('a')); expect(l.snapshot().allocations[0].phase).toBe('MAIN'); lease.close();
  });
  it('prepares a sole real G1a materialized backing without changing its ID or charge', () => {
    const { ledger, handoff } = createNativeLedger(caps);
    const main = ledger.createRealm(), remote = ledger.createRealm();
    const lease = ledger.reserve([{ key: 'input', bytes: 16, category: 'job', owner: main }]) as Lease;
    const ref = lease.ref('input'), backing = lease.allocateBuffer(ref);
    new Uint8Array(backing).set([7, 11, 13, 17]);
    const before = ledger.snapshot(), binding = Object.freeze({});
    const ticket = handoff.prepare(lease, [ref], main, remote, binding);
    expect(ticket).toEqual({}); expect(backing.byteLength).toBe(16);
    expect(ledger.snapshot().managed).toBe(16);
    expect(ledger.snapshot().allocations.map(a => [a.id, a.bytes, a.refs])).toEqual(before.allocations.map(a => [a.id, a.bytes, a.refs]));
    handoff.sendThrew(ticket, binding); lease.close();
  });
  it('rebinds the actual transferred RETURN wrapper to the same allocation and publishes only to a new owning lease', () => {
    const { ledger, handoff } = createNativeLedger(caps), main = ledger.createRealm(), remote = ledger.createRealm();
    const lease = ledger.reserve([]) as Lease, old = new ArrayBuffer(16);
    new Uint8Array(old).set([7, 11, 13, 17]);
    const ref = ledger.registerExisting(old, lease, 'history', main) as import('../src/compute/resourceLedger').Ref;
    const before = ledger.snapshot(), binding = Object.freeze({}), t = handoff.prepare(lease, [ref], main, remote, binding);
    const packet = handoff.packet(t, binding), worker = structuredClone(packet.buffers, { transfer: packet.buffers });
    expect(old.byteLength).toBe(0); handoff.sent(t, binding);
    expect(ledger.snapshot().allocations[0].phase).toBe('IN_FLIGHT');
    lease.close(); expect(ledger.snapshot().history).toBe(16);
    handoff.received(t, binding); expect(ledger.snapshot().allocations[0].phase).toBe('REMOTE');
    const back = structuredClone(worker, { transfer: worker }); handoff.returned(t, binding, back);
    const consumer = ledger.reserve([]) as Lease, result = handoff.publish(t, binding, consumer);
    expect(result.buffers[0]).toBe(back[0]); expect(result.buffers[0]).not.toBe(old);
    expect([...new Uint8Array(result.buffers[0])]).toEqual([7, 11, 13, 17, ...Array(12).fill(0)]);
    expect(ledger.snapshot().allocations.map(a => [a.id, a.bytes, a.realm])).toEqual(before.allocations.map(a => [a.id, a.bytes, a.realm]));
    expect([ledger.snapshot().managed, ledger.snapshot().job, ledger.snapshot().history]).toEqual([16, 0, 16]);
    expect(() => consumer.retain(ref, 'history', main)).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
    consumer.close(); expect(ledger.snapshot().managed).toBe(0);
  });
  it('rolls actual Node structuredClone DataCloneError back atomically with original refs and owner', () => {
    const { ledger: l, handoff: h } = createNativeLedger(caps), main = l.createRealm(), remote = l.createRealm();
    const source = l.reserve([{ key: 'a', bytes: 16, category: 'job', owner: main }]) as Lease;
    const r = source.ref('a'), b = source.allocateBuffer(r), before = l.snapshot(), binding = {};
    const t = h.prepare(source, [r], main, remote, binding), p = h.packet(t, binding);
    expect(() => structuredClone({ buffers: p.buffers, bad: () => 0 }, { transfer: p.buffers })).toThrowError(expect.objectContaining({ name: 'DataCloneError' }));
    expect(b.byteLength).toBe(16); h.sendThrew(t, binding);
    expect(l.snapshot()).toEqual(before); expect(source.ref('a')).toBe(r);
    expect(() => h.sent(t, binding)).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
    const other = l.reserve([]) as Lease; const retained = other.retain(r, 'job', main);
    expect(retained).not.toHaveProperty('code'); other.close(); source.close();
  });
  it('refuses aliased, duplicate, sparse, reserved, forged and foreign sources without changing any graph', () => {
    const { ledger: l, handoff: h } = createNativeLedger(caps), main = l.createRealm(), remote = l.createRealm();
    const source = l.reserve([{ key: 'a', bytes: 16, category: 'job', owner: main }, { key: 'reserved', bytes: 4, category: 'job', owner: main }]) as Lease;
    const r = source.ref('a'), b = source.allocateBuffer(r), other = l.reserve([]) as Lease;
    const alias = other.retain(r, 'history', main); expect(alias).not.toHaveProperty('code');
    let before = l.snapshot(); expect(() => h.prepare(source, [r], main, remote, {})).toThrowError(expect.objectContaining({ code: 'TRANSFER_ALIASED' }));
    expect(l.snapshot()).toEqual(before); other.close(); before = l.snapshot();
    const foreign = createNativeLedger(caps), fm = foreign.ledger.createRealm(), fl = foreign.ledger.reserve([{ key: 'f', bytes: 16, category: 'job', owner: fm }]) as Lease;
    const fr = fl.ref('f'); fl.allocateBuffer(fr);
    const invalid = [[r, r], Array(1), [source.ref('reserved')], [{}], [fr], [structuredClone(r)], [{ id: before.allocations[0].id, bytes: 16 }]];
    for (const rr of invalid) {
      expect(() => h.prepare(source, rr as never, main, remote, {})).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
      expect(l.snapshot()).toEqual(before); expect(b.byteLength).toBe(16);
    }
    source.close(); fl.close();
  });
  it('locks PREPARED and authenticates tickets/exact bindings before every private transition', () => {
    const { ledger: l, handoff: h } = createNativeLedger(caps), main = l.createRealm(), remote = l.createRealm();
    const source = l.reserve([{ key: 'a', bytes: 16, category: 'job', owner: main }]) as Lease, r = source.ref('a'), b = source.allocateBuffer(r);
    const binding = {}, t = h.prepare(source, [r], main, remote, binding), other = l.reserve([]) as Lease, before = l.snapshot();
    for (const op of [() => source.ref('a'), () => source.release(r), () => source.close(), () => other.retain(r, 'job', main), () => source.reclassify(r, 'history'), () => source.allocateBuffer(r), () => source.transfer(r, remote), () => l.registerExisting(b, other, 'job', main), () => h.sent(t, binding), () => h.packet({}, binding), () => h.packet(structuredClone(t), binding), () => h.packet(t, {}), () => h.returned(t, binding, [new ArrayBuffer(16)])]) {
      expect(op).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' })); expect(l.snapshot()).toEqual(before);
    }
    h.sendThrew(t, binding); source.close(); other.close();
  });
  it('preflights all returned buffers atomically and refuses duplicate or registered backing conflicts', () => {
    const { ledger: l, handoff: h } = createNativeLedger(caps), main = l.createRealm(), remote = l.createRealm();
    const source = l.reserve([0, 1].map(i => ({ key: String(i), bytes: 16, category: 'job' as const, owner: main }))) as Lease;
    const rr = [source.ref('0'), source.ref('1')], old = rr.map(r => source.allocateBuffer(r)), binding = {}, t = h.prepare(source, rr, main, remote, binding);
    const worker = structuredClone(old, { transfer: old }); h.sent(t, binding); h.received(t, binding);
    const returned = structuredClone(worker, { transfer: worker }), other = l.reserve([]) as Lease, conflict = new ArrayBuffer(16);
    l.registerExisting(conflict, other, 'job', main); const before = l.snapshot();
    for (const bad of [[returned[0], new ArrayBuffer(7)], [returned[0], returned[0]], [returned[0], conflict], [returned[0]], [returned[0], old[1]], [returned[0], new SharedArrayBuffer(16)], [returned[0], Reflect.construct(ArrayBuffer, [16, { maxByteLength: 32 }])]]) {
      expect(() => h.returned(t, binding, bad as never)).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' })); expect(l.snapshot()).toEqual(before);
    }
    h.returned(t, binding, returned); const consumer = l.reserve([]) as Lease; h.publish(t, binding, consumer);
    expect(() => h.returned(t, binding, returned)).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
    h.terminated(t, binding); consumer.close(); source.close(); other.close(); expect(l.snapshot().managed).toBe(0);
  });
  it('keeps zero-byte detached buffers distinct from reserved and retires remote refs only via controlled cleanup', () => {
    const { ledger: l, handoff: h } = createNativeLedger(caps), main = l.createRealm(), remote = l.createRealm();
    const source = l.reserve([{ key: 'zero', bytes: 0, category: 'job', owner: main }]) as Lease, r = source.ref('zero'), b = source.allocateBuffer(r), binding = {};
    const t = h.prepare(source, [r], main, remote, binding); structuredClone(b, { transfer: [b] }); h.sent(t, binding);
    expect(l.snapshot().allocations[0].phase).toBe('IN_FLIGHT'); source.close(); expect(l.snapshot().allocations).toHaveLength(1);
    h.terminated(t, binding); h.terminated(t, binding); expect(l.snapshot().allocations).toHaveLength(0);
  });
});

describe('G1b1b bounded input codec and opaque facade coverage (not native Worker)', () => {
  const tuple = [0, 1, 1, 1, 1, 1, 1], nonce = [1, 2, 3, 4];
  const packet = () => encodeInputPacket(3, tuple, nonce, [[0, 1, 16]], [new ArrayBuffer(16)]);
  it('encodes normative offsets, zero padding, exact descriptors and full fixed backing lengths', () => {
    const p = packet(), h = new DataView(p.header), d = new DataView(p.descriptors);
    expect(p.header.byteLength).toBe(64); expect(p.descriptors.byteLength).toBe(12);
    expect(Array.from({ length: 16 }, (_, i) => h.getUint32(4 * i, true))).toEqual([0x3142474e, 1, 3, ...tuple, ...nonce, 0, 0]);
    expect([d.getUint32(0, true), d.getUint32(4, true), d.getUint32(8, true)]).toEqual([0, 1, 16]);
    expect(decodeInputPacket(p).buffers[0]).toBe(p.buffers[0]);
    const many = Array.from({ length: 16 }, (_, i) => [i, (i % 9) + 1, 1] as [number, import('../src/compute/nativeHandoff').InputRole, number]);
    expect(decodeInputPacket(encodeInputPacket(1, tuple, nonce, many, many.map(() => new ArrayBuffer(1)))).plan).toHaveLength(16);
  });
  it.each([
    ['extra envelope', (p: ReturnType<typeof packet>) => Object.assign(p, { extra: 0 })],
    ['header short', (p: ReturnType<typeof packet>) => { p.header = new ArrayBuffer(63); }],
    ['magic', (p: ReturnType<typeof packet>) => new DataView(p.header).setUint32(0, 0, true)],
    ['version', (p: ReturnType<typeof packet>) => new DataView(p.header).setUint32(4, 2, true)],
    ['unknown operation', (p: ReturnType<typeof packet>) => new DataView(p.header).setUint32(8, 99, true)],
    ['padding56', (p: ReturnType<typeof packet>) => new DataView(p.header).setUint32(56, 1, true)],
    ['padding60', (p: ReturnType<typeof packet>) => new DataView(p.header).setUint32(60, 1, true)],
    ['bad descriptor length', (p: ReturnType<typeof packet>) => { p.descriptors = new ArrayBuffer(13); }],
    ['too many descriptors', (p: ReturnType<typeof packet>) => { p.descriptors = new ArrayBuffer(204); }],
    ['unknown role', (p: ReturnType<typeof packet>) => new DataView(p.descriptors).setUint32(4, 10, true)],
    ['bad ordinal', (p: ReturnType<typeof packet>) => new DataView(p.descriptors).setUint32(0, 16, true)],
    ['wrong intrinsic payload bytes', (p: ReturnType<typeof packet>) => { p.buffers[0] = new ArrayBuffer(15); }],
    ['RAB', (p: ReturnType<typeof packet>) => { p.buffers[0] = Reflect.construct(ArrayBuffer, [16, { maxByteLength: 32 }]); }],
    ['SAB', (p: ReturnType<typeof packet>) => { p.buffers[0] = new SharedArrayBuffer(16) as never; }],
    ['view instead of AB', (p: ReturnType<typeof packet>) => { p.buffers[0] = new Uint8Array(16) as never; }],
    ['detached', (p: ReturnType<typeof packet>) => { structuredClone(p.buffers[0], { transfer: p.buffers }); }],
    ['sparse buffers', (p: ReturnType<typeof packet>) => { p.buffers = Array(1); }],
    ['ACK carrying payload', (p: ReturnType<typeof packet>) => new DataView(p.header).setUint32(8, 2, true)],
  ])('rejects %s without authorizing an allocation', (_name, mutate) => {
    const p = packet(); mutate(p); expect(() => decodeInputPacket(p)).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
  });
  it('rejects forged, diagnostic/equal-bytes, cloned and foreign public handles even after dispose', () => {
    const a = createNativeHandoff(caps), b = createNativeHandoff(caps), consumer = a.ledger.reserve([]) as Lease;
    for (const bad of [{}, Object.freeze({}), { id: 1, bytes: new ArrayBuffer(16) }, structuredClone({})]) {
      expect(() => a.wait(bad as never)).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
      expect(() => a.accept(bad as never, consumer)).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
      expect(() => b.release(bad as never)).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
    }
    a.dispose(); expect(() => a.release({} as never)).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' })); b.dispose(); consumer.close();
    expect(a.snapshot().pool.ownershipDomains).toBe(3); expect(a.snapshot().pool.occupied).toBe(0);
  });
});

describe('G1b1b exceptional teardown regressions (UNIT faults, not native Worker)', () => {
  const controllers: ReturnType<typeof createNativeHandoff>[] = [];
  afterEach(() => {
    for (const c of controllers.splice(0)) { try { c.dispose(); } catch { /* Injected native failure stays held. */ } }
    vi.unstubAllGlobals();
  });
  function fixture() {
    let worker!: UnitWorker;
    class UnitWorker extends EventTarget {
      actual!: ReturnType<typeof encodeInputPacket>;
      captured?: EventListenerOrEventListenerObject;
      terminates = 0;
      onTerminate?: () => void;
      removed: string[] = [];
      removeThrowOnce = false;
      readonly removeFailure = new Error('listener removal injected');
      constructor() { super(); worker = this; }
      override addEventListener(type: string, fn: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
        if (type === 'message' && fn) this.captured = fn;
        super.addEventListener(type, fn, options);
      }
      postMessage(packet: ReturnType<typeof encodeInputPacket>, transfer: Transferable[]) { this.actual = structuredClone(packet, { transfer }); }
      override removeEventListener(type: string, fn: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) {
        this.removed.push(type);
        if (type === 'message' && this.removeThrowOnce) { this.removeThrowOnce = false; throw this.removeFailure; }
        super.removeEventListener(type, fn, options);
      }
      terminate() { this.terminates++; this.onTerminate?.(); }
      stale() {
        const event = new MessageEvent('message', { data: { malformed: true } });
        if (typeof this.captured === 'function') this.captured(event); else this.captured?.handleEvent(event);
      }
      finish() {
        const f = decodeInputPacket(this.actual);
        this.dispatchEvent(new MessageEvent('message', { data: encodeInputPacket(2, f.tuple, f.nonce, f.plan, []) }));
        const back = structuredClone(f.buffers, { transfer: f.buffers });
        this.dispatchEvent(new MessageEvent('message', { data: encodeInputPacket(3, f.tuple, f.nonce, f.plan, back) }));
      }
    }
    vi.stubGlobal('Worker', UnitWorker);
    const c = createNativeHandoff(caps); controllers.push(c);
    const source = c.ledger.reserve([2, 3].map((bytes, i) => ({ key: String(i), bytes, category: 'job' as const, owner: c.mainRealm }))) as Lease;
    const refs = [source.ref('0'), source.ref('1')], old = refs.map(r => source.allocateBuffer(r));
    old.forEach((b, i) => new Uint8Array(b).fill(i + 7));
    const h = c.submit(source, refs.map(ref => ({ ref, role: 1 as const })));
    if ('code' in h) throw Error(h.code);
    source.close();
    return { c, source, h, w: worker, old };
  }
  it('Q1 reentrant dispose during successful RETURN termination cannot resurrect publication or orphan controlled refs', async () => {
    const { c, h, w, old } = fixture(), consumer = c.ledger.reserve([]) as Lease;
    const outcome = c.wait(h).then(() => 'resolved', (e: { code: string }) => e.code);
    let fired = false;
    w.onTerminate = () => {
      if (fired) return; fired = true;
      expect(c.snapshot().pool.occupied).toBe(1);
      expect([c.ledger.snapshot().managed, c.ledger.snapshot().job]).toEqual([5, 5]);
      c.dispose();
      expect(c.snapshot().disposed).toBe(true);
      expect([c.ledger.snapshot().managed, c.ledger.snapshot().job]).toEqual([5, 5]);
      expect(() => c.accept(h, consumer)).toThrowError(expect.objectContaining({ code: 'STALE' }));
      const before = c.ledger.snapshot(); w.stale(); expect(c.ledger.snapshot()).toEqual(before);
    };
    try {
      w.finish();
      expect(c.snapshot()).toMatchObject({ disposed: true, pending: 0, pool: { occupied: 0 } });
      expect([c.ledger.snapshot().managed, c.ledger.snapshot().job]).toEqual([0, 0]);
      expect(c.ledger.snapshot().allocations).toHaveLength(0);
      expect(await outcome).toBe('CLOSED');
      expect(() => c.accept(h, consumer)).toThrowError(expect.objectContaining({ code: 'STALE' }));
      c.release(h); c.dispose(); w.stale();
      expect(w.terminates).toBe(1); expect(old.map(b => b.byteLength)).toEqual([0, 0]);
      expect(c.snapshot().pending).toBe(0); expect(c.ledger.snapshot().managed).toBe(0);
    } finally { consumer.close(); }
  });
  it.each(['release', 'return'] as const)('Q2 %s attempts every listener and settles only its ticket after successful termination despite cleanup throw', async action => {
    const { c, h, w } = fixture(), consumer = c.ledger.reserve([]) as Lease;
    const mainHold = c.ledger.reserve([{ key: 'main', bytes: 7, category: 'history', owner: c.mainRealm }]) as Lease;
    const mainRef = mainHold.ref('main'), main = mainHold.allocateBuffer(mainRef); new Uint8Array(main).fill(23);
    const outcome = c.wait(h).then(() => 'resolved', (e: Error & { code?: string }) => e.code ?? e.message);
    w.removeThrowOnce = true;
    w.onTerminate = () => {
      expect(w.removed).toEqual(expect.arrayContaining(['message', 'error', 'messageerror']));
      expect(c.snapshot().pool.occupied).toBe(1);
      expect([c.ledger.snapshot().managed, c.ledger.snapshot().job, c.ledger.snapshot().history]).toEqual([12, 5, 7]);
      const before = c.ledger.snapshot(); w.stale(); expect(c.ledger.snapshot()).toEqual(before);
      expect(() => c.accept(h, consumer)).toThrowError(expect.objectContaining({ code: 'STALE' }));
    };
    try {
      if (action === 'release') c.release(h); else w.finish();
      expect(w.terminates).toBe(1);
      expect(c.snapshot()).toMatchObject({ pending: 0, pool: { occupied: 0 } });
      expect(await outcome).toBe(action === 'release' ? 'RELEASED' : w.removeFailure.message);
      expect([c.ledger.snapshot().managed, c.ledger.snapshot().job, c.ledger.snapshot().history]).toEqual([7, 0, 7]);
      expect(mainHold.ref('main')).toBe(mainRef); expect([...new Uint8Array(main)]).toEqual(Array(7).fill(23));
      const source2 = c.ledger.reserve([{ key: 'next', bytes: 3, category: 'job', owner: c.mainRealm }]) as Lease;
      const r2 = source2.ref('next'), b2 = source2.allocateBuffer(r2); new Uint8Array(b2).fill(31);
      const h2 = c.submit(source2, [{ ref: r2, role: 1 }]); if ('code' in h2) throw Error(h2.code); source2.close();
      const before = c.ledger.snapshot(), state = c.snapshot();
      w.stale(); c.release(h);
      expect(c.ledger.snapshot()).toEqual(before); expect(c.snapshot()).toEqual(state);
      c.release(h2); c.dispose(); c.dispose(); c.release(h);
      expect(w.terminates).toBe(1); expect(c.snapshot()).toMatchObject({ pending: 0, pool: { occupied: 0 } });
      expect([c.ledger.snapshot().managed, c.ledger.snapshot().job]).toEqual([7, 0]);
    } finally { consumer.close(); mainHold.close(); }
    expect(c.ledger.snapshot().managed).toBe(0);
  });
  it.each([false, true])('retains the exact controlled charge after actual terminate failure plus reentrant dispose (cleanup throw=%s), without retry', async cleanupThrow => {
    const { c, h, w } = fixture(), consumer = c.ledger.reserve([]) as Lease;
    const mainHold = c.ledger.reserve([{ key: 'main', bytes: 7, category: 'history', owner: c.mainRealm }]) as Lease;
    const ref = mainHold.ref('main'), main = mainHold.allocateBuffer(ref); new Uint8Array(main).fill(29);
    const terminateFailure = new Error('native terminate injected');
    w.removeThrowOnce = cleanupThrow;
    w.onTerminate = () => {
      expect(w.removed).toEqual(expect.arrayContaining(['message', 'error', 'messageerror']));
      c.dispose();
      expect([c.ledger.snapshot().managed, c.ledger.snapshot().job]).toEqual([12, 5]);
      expect(() => c.accept(h, consumer)).toThrowError(expect.objectContaining({ code: 'STALE' }));
      throw terminateFailure;
    };
    try {
      w.finish();
      await expect(c.wait(h)).rejects.toBe(terminateFailure);
      expect(c.snapshot()).toMatchObject({ disposed: true, pending: 1, requests: [{ phase: 'FAILED' }], pool: { occupied: 1 } });
      expect(c.snapshot().pool.slots[0].phase).toBe('FAILED');
      expect([c.ledger.snapshot().managed, c.ledger.snapshot().job, c.ledger.snapshot().history]).toEqual([12, 5, 7]);
      expect(mainHold.ref('main')).toBe(ref); expect([...new Uint8Array(main)]).toEqual(Array(7).fill(29));
      const before = c.ledger.snapshot(), state = c.snapshot();
      c.release(h); c.release(h); c.dispose(); c.dispose(); w.stale();
      expect(c.ledger.snapshot()).toEqual(before); expect(c.snapshot()).toEqual(state);
      expect(w.terminates).toBe(1);
      await expect(c.wait(h)).rejects.toBe(terminateFailure);
    } finally { consumer.close(); mainHold.close(); }
    expect([c.ledger.snapshot().managed, c.ledger.snapshot().job, c.ledger.snapshot().history]).toEqual([5, 5, 0]);
  });
});

describe('five-registration composed teardown (UNIT faults, not native Worker)', () => {
  const controllers: ReturnType<typeof createNativeHandoff>[] = [];
  afterEach(() => {
    for (const c of controllers.splice(0)) { try { c.dispose(); } catch { /* A failed native stop remains charged. */ } }
    vi.unstubAllGlobals();
  });
  function fixture() {
    const workers: FiveWorker[] = [];
    class FiveWorker extends EventTarget {
      actual!: ReturnType<typeof encodeInputPacket>;
      added: { type: string; fn: EventListenerOrEventListenerObject | null }[] = [];
      removed: number[] = [];
      observations: { occupied: number; managed: number }[] = [];
      onRemove?: (registration: number) => void;
      onTerminate?: () => void;
      terminates = 0;
      constructor() { super(); workers.push(this); }
      override addEventListener(type: string, fn: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
        this.added.push({ type, fn }); super.addEventListener(type, fn, options);
      }
      override removeEventListener(type: string, fn: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) {
        const registration = this.added.findIndex(x => x.type === type && x.fn === fn) + 1;
        this.removed.push(registration);
        this.observations.push({ occupied: c.snapshot().pool.occupied, managed: c.ledger.snapshot().managed });
        this.onRemove?.(registration); super.removeEventListener(type, fn, options);
      }
      postMessage(packet: ReturnType<typeof encodeInputPacket>, transfer: Transferable[]) { this.actual = structuredClone(packet, { transfer }); }
      terminate() { this.terminates++; this.onTerminate?.(); }
      ack() {
        const f = decodeInputPacket(this.actual);
        this.dispatchEvent(new MessageEvent('message', { data: encodeInputPacket(2, f.tuple, f.nonce, f.plan, []) }));
      }
      back() {
        const f = decodeInputPacket(this.actual), buffers = structuredClone(f.buffers, { transfer: f.buffers });
        this.dispatchEvent(new MessageEvent('message', { data: encodeInputPacket(3, f.tuple, f.nonce, f.plan, buffers) }));
      }
      stale() {
        const fn = this.added.find(x => x.type === 'message')?.fn, event = new MessageEvent('message', { data: {} });
        if (typeof fn === 'function') fn(event); else fn?.handleEvent(event);
      }
    }
    vi.stubGlobal('Worker', FiveWorker);
    const c = createNativeHandoff(caps); controllers.push(c);
    function material(sizes: number[], category: 'job' | 'history' = 'job') {
      const s = c.ledger.reserve(sizes.map((bytes, i) => ({ key: String(i), bytes, category, owner: c.mainRealm }))) as Lease;
      const refs = sizes.map((_, i) => s.ref(String(i))), buffers = refs.map(r => s.allocateBuffer(r));
      buffers.forEach(b => new Uint8Array(b).fill(37)); return { s, refs, buffers };
    }
    function submit(x: ReturnType<typeof material>) {
      const h = c.submit(x.s, x.refs.map(ref => ({ ref, role: 1 as const }))); if ('code' in h) throw Error(h.code);
      x.s.close(); return h;
    }
    const x = material([2, 3]), h = submit(x), w = workers[0];
    return { c, x, h, w, workers, material, submit };
  }
  const counters = (c: ReturnType<typeof createNativeHandoff>) => { const s = c.ledger.snapshot(); return [s.managed, s.job, s.history]; };
  it.each(['release', 'return', 'dispose'].flatMap(action => [1, 2, 3, 4, 5].map(registration => ({ action, registration }))))
  ('Q2 composition retires exactly after successful stop despite cleanup failure: %j', async ({ action, registration }) => {
    const { c, h, w, material } = fixture(), hold = material([7], 'history'), consumer = c.ledger.reserve([]) as Lease;
    const cleanupError = new Error('exact cleanup'), outcome = c.wait(h).then(() => null, e => e);
    w.onRemove = n => { if (n === registration) throw cleanupError; };
    w.onTerminate = () => {
      expect([...w.removed].sort()).toEqual([1, 2, 3, 4, 5]);
      expect(counters(c)).toEqual([12, 5, 7]); expect(c.snapshot().pool.occupied).toBe(1);
    };
    if (action === 'return') { w.ack(); w.back(); } else if (action === 'release') c.release(h); else c.dispose();
    expect(w.terminates).toBe(1); expect([...w.removed].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(w.observations).toEqual(Array(5).fill({ occupied: 1, managed: 12 }));
    expect(c.snapshot()).toMatchObject({ pending: 0, pool: { occupied: 0 } }); expect(counters(c)).toEqual([7, 0, 7]);
    const error = await outcome;
    if (action === 'return') expect(error).toBe(cleanupError); else expect(error.code).toBe(action === 'dispose' ? 'CLOSED' : 'RELEASED');
    expect(() => c.accept(h, consumer)).toThrowError(expect.objectContaining({ code: 'STALE' }));
    const before = c.ledger.snapshot(); c.release(h); w.stale(); c.dispose(); c.dispose();
    expect(c.ledger.snapshot()).toEqual(before); expect(w.terminates).toBe(1);
    expect(hold.s.ref('0')).toBe(hold.refs[0]); expect([...new Uint8Array(hold.buffers[0])]).toEqual(Array(7).fill(37));
    consumer.close(); hold.s.close(); expect(counters(c)).toEqual([0, 0, 0]);
  });
});
