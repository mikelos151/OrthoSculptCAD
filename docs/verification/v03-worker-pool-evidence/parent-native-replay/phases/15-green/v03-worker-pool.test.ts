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
  it('09 bounds trusted plans to sixteen entries before any reservation or constructor', () => {
    const ledger = createResourceLedger(limits); let constructors = 0;
    const pool = createWorkerPool(ledger, () => { constructors++; return worker(); });
    const oversized = Array.from({ length: 17 }, (_, i) => ({ ...plan[0], key: 'key' + i, bytes: 0 }));
    expect(pool.acquire('compute', oversized)).toEqual({ ok: false, code: 'BUDGET' });
    expect(constructors).toBe(0); expect(ledger.snapshot().allocations).toEqual([]);
    const h = accepted(pool.acquire('compute', oversized.slice(0, 16))); pool.release(h);
  });
  it('10 isolates sparse and other malformed plans without leaked slots or ledger changes', () => {
    const ledger = createResourceLedger(limits); let constructors = 0;
    const pool = createWorkerPool(ledger, () => { constructors++; return worker(); });
    const sparse = [plan[0], , { ...plan[0], key: 'unique-second' }];
    for (const bad of [sparse, null, {}, [null], [{ ...plan[0], bytes: -1 }], [{ ...plan[0], bytes: 0.5 }], [{ ...plan[0], bytes: NaN }], [{ ...plan[0], bytes: Number.MAX_SAFE_INTEGER + 1 }], [{ ...plan[0], key: '' }], [{ ...plan[0], key: 'a'.repeat(129) }], [plan[0], plan[0]], [{ ...plan[0], category: 'fake' }]]) {
      const before = ledger.snapshot();
      expect(() => pool.acquire('compute', bad as never)).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
      expect(ledger.snapshot()).toEqual(before); expect(constructors).toBe(0);
    }
    const h1 = accepted(pool.acquire('compute', plan)), h2 = accepted(pool.acquire('display', plan));
    pool.release(h1); pool.release(h2);
  });
  it('11 TEST terminate throw fails closed with revoked authority and no slot or charge reuse', () => {
    const ledger = createResourceLedger(limits); let calls = 0;
    const pool = createWorkerPool(ledger, () => {
      const w = new TestWorker();
      w.terminate = () => { calls++; throw new Error('TEST terminate throw'); };
      return w as unknown as Worker;
    });
    const h = accepted(pool.acquire('owner', plan)), h2 = accepted(pool.acquire('index', plan));
    const before = ledger.snapshot();
    expect(() => pool.release(h)).toThrow('TEST terminate throw');
    pool.release(h); expect(calls).toBe(1); expect(ledger.snapshot()).toEqual(before);
    expect(pool.acquire('display', [])).toEqual({ ok: false, code: 'BUSY' });
    expect(() => pool.release(h2)).toThrow('TEST terminate throw'); expect(calls).toBe(2);
  });
  it('12 TEST native error callback retires only the captured binding and late events cannot touch h2', () => {
    const ledger = createResourceLedger(limits); const instances: TestWorker[] = [];
    const pool = createWorkerPool(ledger, () => { const w = new TestWorker(); instances.push(w); return w as unknown as Worker; });
    const old = accepted(pool.acquire('index', plan));
    instances[0].dispatchEvent(new Event('error'));
    expect(instances[0].terminated).toBe(1); expect(ledger.snapshot().managed).toBe(0);
    const h2 = accepted(pool.acquire('display', plan)), before = ledger.snapshot();
    instances[0].dispatchEvent(new Event('error')); pool.release(old);
    expect(ledger.snapshot()).toEqual(before); expect(instances[1].terminated).toBe(0);
    pool.release(h2);
  });
  it('13 dispose synchronously blocks acquire and revokes every public lease before native effects', () => {
    const ledger = createResourceLedger(limits); const instances: TestWorker[] = []; let second: PoolLease;
    const pool = createWorkerPool(ledger, () => {
      const w = new TestWorker(); instances.push(w);
      w.terminate = () => {
        w.terminated++;
        expect(() => pool.acquire('display', [])).toThrowError(expect.objectContaining({ code: 'CLOSED' }));
        pool.release(second); // Must not terminate the second binding reentrantly.
        if (instances[0] === w) expect(instances[1].terminated).toBe(0);
      };
      return w as unknown as Worker;
    });
    const first = accepted(pool.acquire('owner', plan)); second = accepted(pool.acquire('index', plan));
    pool.dispose(); pool.dispose(); pool.release(first); pool.release(second);
    expect(instances.map(w => w.terminated)).toEqual([1, 1]); expect(ledger.snapshot().managed).toBe(0);
    expect(() => pool.release({} as never)).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
  });
  it('14 TEST disposal during trusted constructor cannot publish a lease or leak the returned native object', () => {
    const ledger = createResourceLedger(limits); const w = new TestWorker();
    const pool = createWorkerPool(ledger, () => { pool.dispose(); return w as unknown as Worker; });
    expect(() => pool.acquire('compute', plan)).toThrowError(expect.objectContaining({ code: 'CLOSED' }));
    expect(w.terminated).toBe(1); expect(ledger.snapshot().managed).toBe(0);
    pool.dispose(); expect(w.terminated).toBe(1);
  });
  it('15 exposes only frozen diagnostic binding ordinals, monotonically increasing across slot reuse', () => {
    const ledger = createResourceLedger(limits);
    const pool = createWorkerPool(ledger, worker);
    const h1 = accepted(pool.acquire('owner', plan));
    const h2 = accepted(pool.acquire('index', plan));
    expect(pool.snapshot()).toMatchObject({ occupied: 2, slots: [
      { ordinal: 0, incarnation: 1, generation: 1, phase: 'IDLE' },
      { ordinal: 1, incarnation: 1, generation: 2, phase: 'IDLE' },
    ] });
    pool.release(h1); const h3 = accepted(pool.acquire('compute', plan));
    const snap = pool.snapshot();
    expect(snap).toMatchObject({ slots: [{ ordinal: 0, incarnation: 2, generation: 3, phase: 'IDLE' }, { ordinal: 1, incarnation: 1, generation: 2, phase: 'IDLE' }] });
    expect(Object.isFrozen(snap)).toBe(true);
    expect(() => pool.release(snap as never)).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
    pool.release(h2); pool.release(h3);
  });
});
