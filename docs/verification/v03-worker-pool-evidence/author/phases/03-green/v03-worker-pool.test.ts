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
  it('02 counts STARTING and idle slots across roles; BUSY has zero ledger/constructor effects', () => {
    let allocations = 0, constructors = 0;
    const ledger = createResourceLedger(limits, { allocate: n => { allocations++; return new ArrayBuffer(n); } });
    const pool = createWorkerPool(ledger, () => {
      if (++constructors === 1) accepted(pool.acquire('owner', plan));
      else {
        const before = ledger.snapshot();
        expect(pool.acquire('display', plan)).toEqual({ ok: false, code: 'BUSY' });
        expect(ledger.snapshot()).toEqual(before);
      }
      return worker();
    });
    accepted(pool.acquire('compute', plan));
    const before = ledger.snapshot();
    expect(pool.acquire('index', plan)).toEqual({ ok: false, code: 'BUSY' });
    expect(ledger.snapshot()).toEqual(before); expect(constructors).toBe(2); expect(allocations).toBe(0);
  });
  it('03 TEST constructor failure returns its slot and closes only its own reservation', () => {
    const ledger = createResourceLedger(limits); const externalDomain = ledger.createRealm();
    const external = ledger.reserve([{ key: 'external', bytes: 8, category: 'history', owner: externalDomain }]);
    if ('code' in external) throw Error('external reservation refused');
    const before = ledger.snapshot(); let fail = true;
    const pool = createWorkerPool(ledger, () => { if (fail) throw new SyntaxError('TEST constructor'); return worker(); });
    expect(() => pool.acquire('compute', plan)).toThrow('TEST constructor');
    expect(ledger.snapshot()).toEqual(before);
    fail = false; accepted(pool.acquire('index', plan)); accepted(pool.acquire('display', plan));
    external.close();
  });
});
