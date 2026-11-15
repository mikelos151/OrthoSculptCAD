import { afterEach, expect, it, vi } from 'vitest';
import { createNativeLedger } from '../src/compute/resourceLedger';
import type { Lease } from '../src/compute/resourceLedger';
import { createGracefulNativeHandoff, encodeInputPacket } from '../src/compute/nativeHandoff';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('native fixed output binds actual result once to the reserved allocation, never registers a new ID', () => {
  const core = createNativeLedger(), realm = core.ledger.createRealm(), binding = {};
  const outputs = (core as any).nativeOutput;
  expect(outputs, 'separate private native-output controller').toBeDefined();
  const grant = outputs.reserve(realm, binding), before = core.ledger.snapshot();
  expect(before.managed).toBe(32); expect(before.allocations[0].phase).toBe('RESERVED');
  const actual = new ArrayBuffer(32);
  outputs.bindNativeResult(grant, binding, actual);
  expect(core.ledger.snapshot().allocations[0]).toMatchObject({ id: before.allocations[0].id, phase: 'MAIN', bytes: 32 });
  expect(() => outputs.bindNativeResult(grant, binding, new ArrayBuffer(32))).toThrow();
  const consumer = core.ledger.reserve([]) as Lease;
  const result = outputs.publish(grant, binding, consumer);
  expect(result.buffers[0]).toBe(actual); expect(core.ledger.snapshot().managed).toBe(32);
  consumer.close(); expect(core.ledger.snapshot().managed).toBe(0);
});
class Transport extends EventTarget {
  static all: Transport[] = [];
  start!: ReturnType<typeof encodeInputPacket>;
  terminates = 0;
  constructor() { super(); Transport.all.push(this); }
  postMessage(p: ReturnType<typeof encodeInputPacket>, transfer: Transferable[] = []) { this.start = structuredClone(p, { transfer }); }
  terminate() { this.terminates++; }
  roundtrip() {
    const p = this.start;
    const ack = { header: p.header.slice(0), descriptors: p.descriptors.slice(0), buffers: [] };
    new DataView(ack.header).setUint32(8, 2, true);
    this.dispatchEvent(new MessageEvent('message', { data: ack }));
    new DataView(p.header).setUint32(8, 3, true);
    this.dispatchEvent(new MessageEvent('message', { data: structuredClone(p, { transfer: p.buffers }) }));
  }
}
function fixture() {
  vi.stubGlobal('Worker', Transport); Transport.all = [];
  const c = createGracefulNativeHandoff();
  const source = c.ledger.reserve([{ key: 'a', bytes: 3, category: 'job', owner: c.mainRealm }]) as Lease;
  const ref = source.ref('a'); new Uint8Array(source.allocateBuffer(ref)).set([97, 98, 99]);
  return { c, source, ref };
}
it('authentic native SHA keeps returned preimage plus fixed output charged after worker terminal until real continuation settles', async () => {
  const { c, source, ref } = fixture();
  expect((c as any).submitSha, 'internal transport SHA composition').toBeTypeOf('function');
  const digest = crypto.subtle.digest.bind(crypto.subtle); let finish!: () => void;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (algorithm, data) => {
    expect(c.ledger.snapshot().managed).toBe(35);
    const actual = await digest(algorithm, data);
    await new Promise<void>(resolve => { finish = resolve; }); return actual;
  });
  const h = (c as any).submitSha(source, [{ ref, role: 6 }]); source.close();
  const ids = c.ledger.snapshot().allocations.map(a => a.id).sort();
  Transport.all[0].roundtrip();
  expect(c.snapshot().pool.occupied).toBe(0);
  expect(c.snapshot().requests[0].phase).toBe('WAIT_MAIN'); expect(c.ledger.snapshot().managed).toBe(35);
  await vi.waitFor(() => expect(finish).toBeTypeOf('function')); finish();
  await c.wait(h);
  expect(c.ledger.snapshot().allocations.map(a => a.id).sort()).toEqual(ids);
  const consumer = c.ledger.reserve([]) as Lease, result = c.accept(h, consumer);
  expect(result.buffers).toHaveLength(2);
  expect(Buffer.from(result.buffers[1]).toString('hex')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  consumer.close(); c.dispose(); expect(c.ledger.snapshot().managed).toBe(0);
});
it('cleanup failure while SHA pending revokes accept even after successful actual settlement (UNIT failure seam)', async () => {
  const { c, source, ref } = fixture(); let finish!: (b: ArrayBuffer) => void;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const h = c.submitSha(source, [{ ref, role: 6 }]); if ('code' in h) throw Error(h.code); source.close();
  const w = Transport.all[0], error = Error('remove failed');
  w.removeEventListener = () => { throw error; };
  w.roundtrip(); await expect(c.wait(h)).rejects.toBe(error);
  finish(new ArrayBuffer(32)); await Promise.resolve();
  const consumer = c.ledger.reserve([]) as Lease;
  expect(() => c.accept(h, consumer)).toThrowError(expect.objectContaining({ code: 'STALE' }));
  expect(c.ledger.snapshot().managed).toBe(0); consumer.close(); c.dispose();
});
it.each(['success', 'reject'])('dispose retains WAIT_MAIN to actual %s settlement and CLOSED beats later outcome', async outcome => {
  const { c, source, ref } = fixture(); let resolve!: (b: ArrayBuffer) => void, reject!: (e: unknown) => void;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(() => new Promise((a, b) => { resolve = a; reject = b; }));
  const h = c.submitSha(source, [{ ref, role: 6 }]); if ('code' in h) throw Error(h.code); source.close();
  Transport.all[0].roundtrip(); c.dispose();
  await expect(c.wait(h)).rejects.toMatchObject({ code: 'CLOSED' });
  expect(c.snapshot()).toMatchObject({ mainHolds: 1, pending: 1 }); expect(c.ledger.snapshot().managed).toBe(35);
  if (outcome === 'success') resolve(new ArrayBuffer(32)); else reject(Error('late crypto rejection'));
  await Promise.resolve(); await expect(c.wait(h)).rejects.toMatchObject({ code: 'CLOSED' });
  expect(c.snapshot()).toMatchObject({ mainHolds: 0, pending: 0 }); expect(c.ledger.snapshot().managed).toBe(0);
});
it('two WAIT_MAIN holds refuse third before input access; retired h1 cannot release h2 or its token', async () => {
  const { c, source, ref } = fixture(); const resolvers: ((b: ArrayBuffer) => void)[] = [];
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(() => new Promise(resolve => { resolvers.push(resolve); }));
  const h1 = c.submitSha(source, [{ ref, role: 6 }]); if ('code' in h1) throw Error(h1.code); source.close(); Transport.all[0].roundtrip();
  const s2 = c.ledger.reserve([{ key: 'b', bytes: 3, category: 'job', owner: c.mainRealm }]) as Lease;
  const r2 = s2.ref('b'); s2.allocateBuffer(r2);
  const h2 = c.submitSha(s2, [{ ref: r2, role: 6 }]); if ('code' in h2) throw Error(h2.code); s2.close(); Transport.all[1].roundtrip();
  expect(c.snapshot()).toMatchObject({ mainHolds: 2, pool: { occupied: 0 } });
  let reads = 0; const bad = Object.defineProperty([], '0', { get() { reads++; throw Error('input'); } });
  expect(c.submitSha({} as Lease, bad)).toEqual({ ok: false, code: 'BUSY' }); expect(reads).toBe(0);
  c.release(h1); expect(c.ledger.snapshot().managed).toBe(70);
  resolvers[0](new ArrayBuffer(32)); await Promise.resolve();
  expect(c.ledger.snapshot().managed).toBe(35); const before = c.ledger.snapshot(); c.release(h1); expect(c.ledger.snapshot()).toEqual(before);
  expect(c.snapshot().mainHolds).toBe(1); c.dispose(); resolvers[1](new ArrayBuffer(32)); await Promise.resolve();
  expect(c.snapshot().mainHolds).toBe(0); expect(c.ledger.snapshot().managed).toBe(0);
});
it('original deadline gates late native settlement without allowing publication', async () => {
  const { c, source, ref } = fixture(); let now = 0, resolve!: (b: ArrayBuffer) => void;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(() => new Promise(a => { resolve = a; }));
  const h = c.submitSha(source, [{ ref, role: 6 }]); if ('code' in h) throw Error(h.code); source.close(); Transport.all[0].roundtrip();
  now = 120000; resolve(new ArrayBuffer(32)); await expect(c.wait(h)).rejects.toMatchObject({ code: 'DEADLINE' });
  expect(c.ledger.snapshot().managed).toBe(0); c.dispose();
});
it('real native rejection settles reservations; crypto unavailable never falls back or constructs worker', async () => {
  const { c, source, ref } = fixture(); const native = crypto.subtle.digest.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'digest').mockImplementation((_algorithm, data) => native('not-a-digest', data));
  const h = c.submitSha(source, [{ ref, role: 6 }]); if ('code' in h) throw Error(h.code); source.close(); Transport.all[0].roundtrip();
  await expect(c.wait(h)).rejects.toMatchObject({ name: 'NotSupportedError' }); expect(c.ledger.snapshot().managed).toBe(0); c.dispose();
  const other = fixture(); vi.stubGlobal('crypto', { getRandomValues: () => { throw Error('must not call'); } });
  expect(() => other.c.submitSha(other.source, [{ ref: other.ref, role: 6 }])).toThrowError(expect.objectContaining({ code: 'CRYPTO_UNAVAILABLE' }));
  expect(Transport.all).toHaveLength(0); other.source.close(); other.c.dispose();
});
it('grant rejects forged, foreign, wrong binding, wrong size, duplicate native output and stale authority atomically', () => {
  const core = createNativeLedger(), foreign = createNativeLedger(), realm = core.ledger.createRealm(), binding = {};
  const g = core.nativeOutput.reserve(realm, binding); if ('code' in g) throw Error(g.code);
  const before = core.ledger.snapshot();
  for (const run of [() => core.nativeOutput.bindNativeResult({} as any, binding, new ArrayBuffer(32)),
    () => foreign.nativeOutput.bindNativeResult(g, binding, new ArrayBuffer(32)),
    () => core.nativeOutput.bindNativeResult(g, {}, new ArrayBuffer(32)),
    () => core.nativeOutput.bindNativeResult(g, binding, new ArrayBuffer(31)),
    () => core.nativeOutput.bindNativeResult(g, binding, new SharedArrayBuffer(32) as any)]) {
    expect(run).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' })); expect(core.ledger.snapshot()).toEqual(before);
  }
  const actual = new ArrayBuffer(32); core.nativeOutput.bindNativeResult(g, binding, actual);
  const g2 = core.nativeOutput.reserve(realm, binding); if ('code' in g2) throw Error(g2.code);
  expect(() => core.nativeOutput.bindNativeResult(g2, binding, actual)).toThrow();
  core.nativeOutput.retire(g, binding); core.nativeOutput.retire(g, binding);
  expect(() => core.nativeOutput.bindNativeResult(g, binding, new ArrayBuffer(32))).toThrow();
  core.nativeOutput.retire(g2, binding); expect(core.ledger.snapshot().managed).toBe(0);
});
it('fixed-output budget refusal precedes native Worker creation and preserves source ref', () => {
  vi.stubGlobal('Worker', Transport); Transport.all = [];
  const c = createGracefulNativeHandoff({ managed: 34, job: 34, history: 0 });
  const source = c.ledger.reserve([{ key: 'a', bytes: 3, category: 'job', owner: c.mainRealm }]) as Lease;
  const ref = source.ref('a'), b = source.allocateBuffer(ref), before = c.ledger.snapshot();
  expect(c.submitSha(source, [{ ref, role: 6 }])).toEqual({ ok: false, code: 'BUDGET' });
  expect(c.ledger.snapshot()).toEqual(before); expect(b.byteLength).toBe(3); expect(Transport.all).toHaveLength(0);
  source.close(); c.dispose();
});
