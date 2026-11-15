import { createResourceLedger } from './resourceLedger.js';
import { createWorkerPool } from './workerPool.js';

export async function run() {
  const checks = [], events = [], nativeObjects = [], urls = [], pools = [];
  const NativeWorker = globalThis.Worker;
  const nativeTerminate = NativeWorker.prototype.terminate, nativeSend = NativeWorker.prototype.postMessage;
  const meta = new WeakMap();
  let attempts = 0, created = 0, terminated = 0, maximumLiveObjects = 0, sends = 0, allocations = 0, mode = 'idle';
  const expectedErrors = [];
  const ok = (name, condition, details = {}) => { checks.push({ name, pass: Boolean(condition), ...details }); if (!condition) throw Error(name); };
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const accepted = h => { ok('acquire accepted', !('code' in h)); return h; };
  const metrics = () => ({ attempts, created, terminated, sends, allocations });
  NativeWorker.prototype.terminate = function () {
    const m = meta.get(this); events.push({ type: 'terminate-invoked', ordinal: m?.id });
    const result = Reflect.apply(nativeTerminate, this, []);
    if (m) { m.terminations++; terminated++; }
    return result;
  };
  NativeWorker.prototype.postMessage = function (...args) { sends++; events.push({ type: 'native-main-send' }); return Reflect.apply(nativeSend, this, args); };
  globalThis.Worker = new Proxy(NativeWorker, { construct(target, args, newTarget) {
    attempts++; events.push({ type: 'constructor-attempt', mode });
    try {
      const w = Reflect.construct(target, args, newTarget);
      const m = { id: ++created, terminations: 0 }; meta.set(w, m); nativeObjects.push(w);
      maximumLiveObjects = Math.max(maximumLiveObjects, created - terminated);
      events.push({ type: 'constructor-success', ordinal: m.id }); return w;
    } catch (error) { events.push({ type: 'constructor-threw', name: error.name }); throw error; }
  } });
  const ledger = createResourceLedger({ managed: 1024, job: 768, history: 512 }, {
    controls: { maxRealms: 3, maxLeases: 2, maxRefs: 2 }, allocate: n => { allocations++; return new ArrayBuffer(n); },
  });
  const ready = new WeakMap();
  let last;
  const factory = kind => {
    ok('reservation precedes native constructor', ledger.snapshot().allocations.some(a => a.phase === 'reserved'));
    if (mode === 'invalid') return new Worker('http://['); // Native synchronous URL SyntaxError, no request.
    const script = `postMessage({ fixture: 'idle-ready' }); ${mode === 'error' ? "setTimeout(() => { throw Error('G1B_EXPECTED_WORKER_ERROR'); }, 20);" : ''} setInterval(() => {}, 1000);`;
    const url = URL.createObjectURL(new Blob([script], { type: 'text/javascript' })); urls.push(url);
    const w = new Worker(url, { name: 'G1b1a-idle-' + kind }); last = w;
    ready.set(w, new Promise(resolve => w.addEventListener('message', e => {
      events.push({ type: 'native-worker-message', ordinal: meta.get(w).id, data: e.data });
      if (e.data?.fixture === 'idle-ready') resolve();
    }, { once: true })));
    w.addEventListener('error', e => {
      expectedErrors.push({ message: e.message, trusted: e.isTrusted, ordinal: meta.get(w).id });
      if (e.message.includes('G1B_EXPECTED_WORKER_ERROR')) e.preventDefault();
    });
    return w;
  };
  const pool = createWorkerPool(ledger, factory); pools.push(pool);
  const plan = [{ key: 'idle-payload', bytes: 16, category: 'job' }];
  const acquire = async kind => { const h = accepted(pool.acquire(kind, plan)); await ready.get(last); return h; };
  try {
    const h1 = await acquire('compute'), w1 = last;
    const h2 = await acquire('owner'), w2 = last;
    const before = { metrics: metrics(), ledger: ledger.snapshot(), pool: pool.snapshot() };
    ok('two real idle workers hold two slots', pool.snapshot().occupied === 2 && created - terminated === 2);
    ok('third role BUSY', pool.acquire('display', plan).code === 'BUSY');
    ok('BUSY has zero constructors, sends, allocation, reservation or binding deltas', equal(before, { metrics: metrics(), ledger: ledger.snapshot(), pool: pool.snapshot() }));
    pool.release(h1); ok('controlled native terminate h1 once', meta.get(w1).terminations === 1);
    const h3 = await acquire('index'), w3 = last;
    const reuse = { metrics: metrics(), ledger: ledger.snapshot(), pool: pool.snapshot() };
    pool.release(h1);
    ok('retired h1 cannot terminate or free h3', equal(reuse, { metrics: metrics(), ledger: ledger.snapshot(), pool: pool.snapshot() }) && meta.get(w3).terminations === 0 && meta.get(w2).terminations === 0);
    for (const bad of [structuredClone(h3), JSON.parse(JSON.stringify(h3)), pool.snapshot(), { ordinal: 0 }, null]) {
      let code; try { pool.release(bad); } catch (error) { code = error.code; }
      ok('native-context forged handle rejected', code === 'INVALID_INPUT');
    }
    pool.release(h3); pool.release(h2);
    const domains = new Set();
    const anchor = await acquire('owner');
    domains.add(ledger.snapshot().allocations[0].realm);
    for (let i = 0; i < 40; i++) {
      const h = await acquire('index');
      for (const a of ledger.snapshot().allocations) domains.add(a.realm);
      pool.release(h);
    }
    pool.release(anchor);
    ok('forty actual serial incarnations reuse two domains under maxRealms=3', domains.size === 2 && ledger.snapshot().managed === 0, { domains: [...domains], serialIncarnations: 40 });
    mode = 'invalid'; const ctorBefore = ledger.snapshot(); let ctorFailure;
    try { pool.acquire('compute', plan); } catch (error) { ctorFailure = { name: error.name, message: error.message }; }
    ok('actual native constructor SyntaxError rolls back reservation and slot', ctorFailure?.name === 'SyntaxError' && equal(ctorBefore, ledger.snapshot()) && pool.snapshot().occupied === 0, { ctorFailure });
    mode = 'idle'; pool.release(await acquire('display'));
    mode = 'error'; const errored = await acquire('index'); const errorWorker = last;
    const deadline = performance.now() + 5000;
    while (pool.snapshot().occupied && performance.now() < deadline) await new Promise(r => setTimeout(r, 10));
    ok('actual trusted native worker error performs one controlled terminal', expectedErrors.length === 1 && expectedErrors[0].trusted && meta.get(errorWorker).terminations === 1 && ledger.snapshot().managed === 0);
    mode = 'idle'; const afterError = await acquire('index'); const errorReuse = ledger.snapshot();
    pool.release(errored); ok('error-retired lease cannot touch replacement', equal(errorReuse, ledger.snapshot())); pool.release(afterError);
    const d1 = await acquire('compute'), d2 = await acquire('owner');
    pool.dispose(); pool.dispose(); pool.release(d1); pool.release(d2);
    let closed; try { pool.acquire('display', plan); } catch (error) { closed = error.code; }
    ok('dispose is terminal and closes both native workers once', closed === 'CLOSED' && pool.snapshot().occupied === 0 && ledger.snapshot().managed === 0);
    ok('all created native objects have exactly one successful terminate invocation', nativeObjects.every(w => meta.get(w).terminations === 1));
    ok('native object peak is at most two (not an OS-thread or RSS measurement)', maximumLiveObjects === 2);
    ok('primitive never sent or materialized payload', sends === 0 && allocations === 0);
    return { checks, events, expectedErrors, metrics: metrics(), maximumLiveObjects, ledger: ledger.snapshot(), pool: pool.snapshot(),
      limitations: ['Pool primitive only; App/WorkerClient/runDisplayTask remain legacy.', 'Native delayed old binding event after terminate was not forced; captured late-listener guard is TEST unit coverage.', 'Worker close notification and terminate invocation are not physical thread join/GC/RSS proof.', 'No ACK/handoff/transport/main-SHA/admission/publication or audited-source capability.'] };
  } finally {
    for (const p of pools) p.dispose();
    for (const w of nativeObjects) if (!meta.get(w).terminations) w.terminate();
    for (const url of urls) URL.revokeObjectURL(url);
    NativeWorker.prototype.terminate = nativeTerminate; NativeWorker.prototype.postMessage = nativeSend; globalThis.Worker = NativeWorker;
  }
}
