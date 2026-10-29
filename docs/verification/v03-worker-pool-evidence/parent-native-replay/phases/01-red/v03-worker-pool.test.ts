import { describe, expect, it } from 'vitest';
import { createResourceLedger } from '../src/compute/resourceLedger';
import { createWorkerPool } from '../src/compute/workerPool';
import type { PoolLease, PoolRefusal } from '../src/compute/workerPool';
const limits = { managed: 1024, job: 768, history: 512 };
const plan = [{ key: 'payload', bytes: 16, category: 'job' as const }];
function accepted(value: PoolLease | PoolRefusal): PoolLease {
  expect(value).not.toHaveProperty('code'); return value as PoolLease;
}
/** TEST ONLY fault-injection seam; native acceptance uses actual Chromium Worker. */
class TestWorker extends EventTarget {
  terminated = 0;
  terminate() { this.terminated++; }
}
const worker = () => new TestWorker() as unknown as Worker;
describe('G1b1a isolated internal pool', () => {
  it('01 reserves the complete plan in the supplied real ledger before construction', () => {
    const ledger = createResourceLedger(limits); let constructors = 0;
    const pool = createWorkerPool(ledger, kind => {
      constructors++; expect(kind).toBe('compute');
      expect(ledger.snapshot().managed).toBe(16);
      expect(ledger.snapshot().allocations[0].phase).toBe('reserved');
      return worker();
    });
    accepted(pool.acquire('compute', plan)); expect(constructors).toBe(1);
  });
});
