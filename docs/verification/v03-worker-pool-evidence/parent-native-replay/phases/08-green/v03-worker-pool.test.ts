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
  it('04 authentic release invokes controlled terminate once before returning the slot', () => {
    const ledger = createResourceLedger(limits); const instances: TestWorker[] = [];
    const pool = createWorkerPool(ledger, () => {
      const w = new TestWorker(); instances.push(w); return w as unknown as Worker;
    });
    const h1 = accepted(pool.acquire('compute', plan));
    accepted(pool.acquire('owner', plan));
    expect(() => pool.release(h1)).not.toThrow();
    expect(instances[0].terminated).toBe(1); expect(ledger.snapshot().managed).toBe(16);
    accepted(pool.acquire('index', plan));
    pool.release(h1); expect(instances.map(w => w.terminated)).toEqual([1, 0, 0]);
    expect(ledger.snapshot().managed).toBe(32);
  });
  it('05 rejects forged, cloned, diagnostic and cross-pool handles even after authentic retirement', () => {
    const ledger = createResourceLedger(limits), pool = createWorkerPool(ledger, worker);
    const foreignPool = createWorkerPool(createResourceLedger(limits), worker);
    const h = accepted(pool.acquire('owner', plan)), foreign = accepted(foreignPool.acquire('owner', []));
    for (const bad of [{}, null, 1, '1', { slot: 0, incarnation: 1 }, JSON.parse(JSON.stringify(h)), structuredClone(h), foreign]) {
      const before = ledger.snapshot();
      expect(() => pool.release(bad as never)).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
      expect(ledger.snapshot()).toEqual(before);
    }
    expect(Object.isFrozen(h)).toBe(true); expect(Reflect.ownKeys(h)).toEqual([]);
    pool.release(h); pool.release(h); foreignPool.release(foreign);
    expect(() => pool.release({} as never)).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
  });
  it('06 reuses exactly two logical domains for forty incarnations with maxRealms=3', () => {
    const ledger = createResourceLedger(limits, { controls: { maxRealms: 3 } });
    const pool = createWorkerPool(ledger, worker), domains = new Set<number>();
    const anchor = accepted(pool.acquire('owner', plan));
    domains.add(ledger.snapshot().allocations[0].realm);
    for (let i = 0; i < 40; i++) {
      const h = accepted(pool.acquire('index', plan));
      for (const a of ledger.snapshot().allocations) domains.add(a.realm);
      pool.release(h); pool.release(h);
    }
    pool.release(anchor); expect(domains.size).toBe(2); expect(ledger.snapshot().managed).toBe(0);
    expect(() => ledger.createRealm()).toThrowError(expect.objectContaining({ code: 'BUDGET' }));
  });
  it('07 atomic BUDGET leaves the free slot available and never calls payload allocator or constructor', () => {
    let constructors = 0, allocations = 0;
    const ledger = createResourceLedger(limits, { allocate: n => { allocations++; return new ArrayBuffer(n); } });
    const pool = createWorkerPool(ledger, () => { constructors++; return worker(); });
    const h = accepted(pool.acquire('owner', plan)), before = ledger.snapshot();
    expect(pool.acquire('compute', [{ ...plan[0], bytes: 768 }, { key: 'extra', bytes: 1, category: 'job' }])).toEqual({ ok: false, code: 'BUDGET' });
    expect(ledger.snapshot()).toEqual(before); expect(constructors).toBe(1); expect(allocations).toBe(0);
    const h2 = accepted(pool.acquire('display', [])); pool.release(h); pool.release(h2);
  });
  it('08 rejects an invalid internal role before reserving or constructing', () => {
    const ledger = createResourceLedger(limits); let constructors = 0;
    const pool = createWorkerPool(ledger, () => { constructors++; return worker(); });
    expect(() => pool.acquire('fake-owner' as never, plan)).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
    expect(constructors).toBe(0); expect(ledger.snapshot().managed).toBe(0);
  });
});
