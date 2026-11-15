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
  });
});
