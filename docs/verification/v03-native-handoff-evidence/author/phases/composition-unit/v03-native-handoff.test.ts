import { describe, expect, it } from 'vitest';
import { createNativeLedger } from '../src/compute/resourceLedger';
import type { Lease } from '../src/compute/resourceLedger';
const caps = { managed: 1024, job: 1024, history: 1024 };
describe('G1b1b same-private-core handoff (structuredClone unit, not native proof)', () => {
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
});
