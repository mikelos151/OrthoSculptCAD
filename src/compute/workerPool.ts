/**
 * G1b1a internal primitive only: no App singleton, dispatch, transport or source authority.
 * The trusted composition owns its constructor URLs; this factory is not user-configurable.
 * Callers must acquire here before payload work. Existing legacy constructors are NOT migrated.
 * Slot release proves one successful terminate API invocation, not a thread/GC/RSS join.
 */
import type { Category, Lease, Realm, ResourceLedger } from './resourceLedger';
export type WorkerKind = 'compute' | 'display' | 'index' | 'owner';
export interface InternalPlanEntry { readonly key: string; readonly bytes: number; readonly category: Category }
export type InternalPlan = readonly InternalPlanEntry[];
export interface PoolLease { readonly poolLeaseBrand: unique symbol }
export type PoolRefusal = Readonly<{ ok: false; code: 'BUSY' | 'BUDGET' }>;
type Phase = 'FREE' | 'STARTING' | 'IDLE' | 'REVOKING' | 'FAILED';
interface Slot { domain: Realm; ordinal: number; incarnation: number; current?: Binding }
interface Binding {
  slot: Slot; generation: number; phase: Phase; nonce?: Uint32Array;
  resources: Lease; worker?: Worker; auth?: { binding?: Binding };
  stop?: () => unknown[]; running?: boolean; result: TerminalResult; owner?: TerminalOwner;
}
export interface TerminalResult {
  native: { state: 'NOT_STARTED' | 'IN_PROGRESS' | 'SUCCEEDED' } | { state: 'FAILED'; error: unknown };
  settlement: { state: 'NOT_STARTED' | 'RUNNING' | 'DONE' } | { state: 'FAILED'; error: unknown };
  cleanupErrors: unknown[];
}
export interface TerminalControl { readonly result: TerminalResult; request(): void }
interface TerminalOwner {
  begin(cause?: unknown): void;
  cleanup(): unknown[];
  settle(result: TerminalResult): void;
  finished(result: TerminalResult): void;
}
function invalid(): never { throw Object.assign(new Error('Invalid pool input'), { code: 'INVALID_INPUT' }); }
/** Trusted internal composition only; not a user/provider/URL extension point. */
export function createWorkerPool(ledger: ResourceLedger, factory: (kind: WorkerKind) => Worker) {
  return createWorkerPoolCore(ledger, factory);
}
/** Private trusted composition bridge; not re-exported by compute/index. */
export function createWorkerPoolCore(ledger: ResourceLedger, factory: (kind: WorkerKind) => Worker,
  attach?: (control: TerminalControl) => TerminalOwner, observeNativeErrors = true) {
  // Main + two logical slot domains, not physical JavaScript realm identities.
  const domains = Object.freeze([ledger.createRealm(), ledger.createRealm(), ledger.createRealm()]);
  const slots: Slot[] = domains.slice(1).map((domain, ordinal) => ({ domain, ordinal, incarnation: 0 }));
  const leases = new WeakMap<PoolLease, { binding?: Binding }>();
  const boundWorkers = new WeakSet<Worker>();
  let disposed = false, generation = 0;
  function terminal(binding: Binding, cause?: unknown) {
    const result = binding.result;
    if (binding.running || result.native.state === 'SUCCEEDED' || result.native.state === 'FAILED') return;
    const first = result.native.state === 'NOT_STARTED';
    if (first) {
      result.native = { state: 'IN_PROGRESS' }; binding.phase = 'REVOKING';
      if (binding.auth) binding.auth.binding = undefined;
      try { binding.owner?.begin(cause); } catch (error) { result.cleanupErrors.push(error); }
    }
    if (!binding.worker) return; // STARTING stays occupied until the constructor returns.
    binding.running = true;
    for (const cleanup of [binding.stop, binding.owner && (() => binding.owner!.cleanup())]) {
      try { if (cleanup) result.cleanupErrors.push(...cleanup()); } catch (error) { result.cleanupErrors.push(error); }
    }
    try { binding.worker.terminate(); result.native = { state: 'SUCCEEDED' }; }
    catch (error) { result.native = { state: 'FAILED', error }; binding.phase = 'FAILED'; }
    result.settlement = { state: 'RUNNING' };
    try {
      binding.owner?.settle(result);
      if (result.native.state === 'SUCCEEDED') {
        binding.resources.close();
        if (binding.slot.current === binding) binding.slot.current = undefined;
      }
      result.settlement = { state: 'DONE' };
    } catch (error) { result.settlement = { state: 'FAILED', error }; binding.phase = 'FAILED'; }
    try { binding.owner?.finished(result); }
    catch (error) { result.settlement = { state: 'FAILED', error }; binding.phase = 'FAILED'; }
    binding.running = false;
    if (result.native.state === 'FAILED') throw result.native.error;
    if (result.settlement.state === 'FAILED') throw result.settlement.error;
    if (result.cleanupErrors.length) throw result.cleanupErrors[0];
  }
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    const active = slots.flatMap(s => s.current ? [s.current] : []);
    // Revoke ALL public auth before the first listener removal or native termination.
    for (const b of active) if (b.auth) b.auth.binding = undefined;
    const failures: unknown[] = [];
    for (const b of active) {
      try { terminal(b); } catch (error) { failures.push(error); }
    }
    if (failures.length) throw failures[0];
  }
  return Object.freeze({
    snapshot() {
      return Object.freeze({ disposed, ownershipDomains: domains.length, occupied: slots.filter(s => s.current).length,
        slots: Object.freeze(slots.map(s => Object.freeze({ ordinal: s.ordinal, incarnation: s.incarnation,
          generation: s.current?.generation ?? 0, phase: s.current?.phase ?? 'FREE' as Phase }))) });
    },
    dispose,
    release(lease: PoolLease): void {
      const auth = leases.get(lease); if (!auth) invalid();
      const binding = auth.binding;
      // Retained result identity does not retain authority to start termination.
      if (!binding || binding.auth?.binding !== binding) return;
      terminal(binding);
    },
    acquire(kind: WorkerKind, plan: InternalPlan): PoolLease | PoolRefusal {
      if (disposed) throw Object.assign(new Error('Closed pool'), { code: 'CLOSED' });
      if (kind !== 'compute' && kind !== 'display' && kind !== 'index' && kind !== 'owner') invalid();
      const slot = slots.find(s => !s.current);
      if (!slot) return { ok: false, code: 'BUSY' };
      if (generation >= Number.MAX_SAFE_INTEGER || slot.incarnation >= Number.MAX_SAFE_INTEGER) {
        dispose(); throw Object.assign(new Error('Pool ordinal capacity'), { code: 'BUDGET' });
      }
      if (!Array.isArray(plan)) invalid();
      if (plan.length > 16) return { ok: false, code: 'BUDGET' };
      // Only bounded control records are copied here, never payloads. The same G1a core
      // validates the dense complete plan and atomically reserves every category/byte.
      const resources = ledger.reserve(plan.map(p => ({ ...p, owner: slot.domain })));
      if ('code' in resources) return resources;
      slot.incarnation++;
      const binding: Binding = { slot, generation: ++generation, phase: 'STARTING', resources,
        result: { native: { state: 'NOT_STARTED' }, settlement: { state: 'NOT_STARTED' }, cleanupErrors: [] } }; slot.current = binding;
      try {
        binding.owner = attach?.(Object.freeze({ result: binding.result, request() { terminal(binding); } }));
        binding.nonce = globalThis.crypto.getRandomValues(new Uint32Array(4));
        binding.worker = factory(kind);
        if (boundWorkers.has(binding.worker)) invalid();
        boundWorkers.add(binding.worker);
      }
      catch (error) { resources.close(); slot.current = undefined; throw error; }
      if (disposed || binding.result.native.state === 'IN_PROGRESS') {
        terminal(binding);
        throw Object.assign(new Error('Closed pool'), { code: 'CLOSED' });
      }
      const lease = Object.freeze({}) as PoolLease;
      binding.phase = 'IDLE';
      const auth = { binding }; binding.auth = auth; leases.set(lease, { binding });
      const native = binding.worker;
      const onError = () => {
        if (!binding.auth?.binding || binding.slot.current !== binding || binding.worker !== native) return;
        try { terminal(binding, Object.assign(new Error('NATIVE_ERROR'), { code: 'NATIVE_ERROR' })); } catch { /* Native terminate failed: retain slot/charge. */ }
      };
      binding.stop = () => {
        const errors: unknown[] = [];
        for (const type of observeNativeErrors ? ['error', 'messageerror'] : []) {
          try { native.removeEventListener(type, onError); } catch (error) { errors.push(error); }
        }
        return errors; // Cleanup cannot prevent the native terminal attempt or another removal.
      };
      try { if (observeNativeErrors) { native.addEventListener('error', onError); native.addEventListener('messageerror', onError); } }
      catch (error) { terminal(binding); throw error; }
      return lease;
    },
  });
}
export type WorkerPool = ReturnType<typeof createWorkerPool>;
export type WorkerPoolSnapshot = ReturnType<WorkerPool['snapshot']>;
