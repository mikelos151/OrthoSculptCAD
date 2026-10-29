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
