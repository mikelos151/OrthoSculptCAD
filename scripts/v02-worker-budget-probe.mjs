// Observational only: real constructor, native dispatch and native termination.
// No fabricated replies, artificial latency, cancellation or application-state writes.
export function installWorkerBudgetProbe() {
  const NativeWorker = globalThis.Worker;
  const records = new Map();
  const events = [];
  let nextId = 0;
  const snapshot = () => [...records.values()].filter(r => r.alive).map(r => ({ ...r }));
  const log = (type, details = {}) => events.push({ t: performance.now(), type, ...details, alive: snapshot() });
  const send = NativeWorker.prototype.postMessage;
  const terminate = NativeWorker.prototype.terminate;
  NativeWorker.prototype.postMessage = function(message, ...args) {
    const record = records.get(this);
    if (record) { record.kind = message?.kind; record.op = message?.op; record.requestId = message?.id; record.generation = message?.generation; }
    log('postMessage', { workerId: record?.workerId, kind: message?.kind, op: message?.op, requestId: message?.id, generation: message?.generation });
    return send.call(this, message, ...args);
  };
  NativeWorker.prototype.terminate = function() {
    const record = records.get(this);
    if (record) record.alive = false;
    log('terminate', { workerId: record?.workerId });
    return terminate.call(this);
  };
  globalThis.Worker = new Proxy(NativeWorker, {
    construct(target, args) {
      const workerId = ++nextId, url = String(args[0]);
      log('constructor-attempt', { workerId, url, stack: new Error().stack });
      let worker;
      try { worker = Reflect.construct(target, args); }
      catch (error) { log('constructor-error', { workerId, error: String(error) }); throw error; }
      records.set(worker, { workerId, url, category: /display\.worker-/.test(url) ? 'display' : 'compute', alive: true });
      log('constructor', { workerId, url });
      worker.addEventListener('message', event => log('response', { workerId, requestId: event.data?.id, generation: event.data?.generation, ok: event.data?.ok }));
      return worker;
    }
  });
  globalThis.__PUBLIC_WORKER_BUDGET = { events, mark: label => log('checkpoint', { label }), snapshot };
  const observedAlerts = new Set();
  const observe = () => {
    for (const alert of document.querySelectorAll('[role="alert"]')) {
      const text = alert.textContent || '';
      if (!observedAlerts.has(text)) { observedAlerts.add(text); log('alert', { text }); }
    }
  };
  new MutationObserver(observe).observe(document, { subtree: true, childList: true, characterData: true });
  addEventListener('error', event => log('pageerror', { error: event.message }));
}

// Summaries retain compute and display pools separately. Failed application-side
// admission occurs before NativeWorker; an alert can therefore lack constructor-attempt.
export function summarizeWorkerBudget(events) {
  return {
    events: events.length,
    constructors: events.filter(e => e.type === 'constructor').length,
    maxComputeAlive: Math.max(0, ...events.map(e => e.alive.filter(w => w.category === 'compute').length)),
    maxDisplayAlive: Math.max(0, ...events.map(e => e.alive.filter(w => w.category === 'display').length)),
    alerts: events.filter(e => e.type === 'alert'),
    checkpoints: events.filter(e => e.type === 'checkpoint').map(e => ({ label: e.label, t: e.t }))
  };
}
