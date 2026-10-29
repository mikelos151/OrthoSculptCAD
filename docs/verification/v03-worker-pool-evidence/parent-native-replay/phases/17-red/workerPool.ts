import type { Category, Lease, Realm, ResourceLedger } from './resourceLedger';
export type WorkerKind = 'compute' | 'display' | 'index' | 'owner';
export interface InternalPlanEntry { readonly key: string; readonly bytes: number; readonly category: Category }
export type InternalPlan = readonly InternalPlanEntry[];
export interface PoolLease { readonly poolLeaseBrand: unique symbol }
export type PoolRefusal = Readonly<{ ok: false; code: 'BUSY' | 'BUDGET' }>;
type Phase = 'FREE' | 'STARTING' | 'IDLE' | 'REVOKING' | 'FAILED';
interface Slot { domain: Realm; ordinal: number; incarnation: number; current?: Binding }
interface Binding { slot: Slot; generation: number; phase: Phase; nonce?: Uint32Array; resources: Lease; worker?: Worker; auth?: { binding?: Binding }; stop?: () => void; terminalAttempted?: boolean }
function invalid(): never { throw Object.assign(new Error('Invalid pool input'), { code: 'INVALID_INPUT' }); }
/** Trusted internal composition only; not a user/provider/URL extension point. */
export function createWorkerPool(ledger: ResourceLedger, factory: (kind: WorkerKind) => Worker) {
  ledger.createRealm(); // Stable main ownership domain, reserved for future composition.
  const slots: Slot[] = [ledger.createRealm(), ledger.createRealm()].map((domain, ordinal) => ({ domain, ordinal, incarnation: 0 }));
  const leases = new WeakMap<PoolLease, { binding?: Binding }>();
  let disposed = false, generation = 0;
  function terminal(binding: Binding) {
    if (binding.terminalAttempted || binding.slot.current !== binding) return;
    binding.phase = 'REVOKING';
    if (binding.auth) binding.auth.binding = undefined;
    if (!binding.worker) return; // STARTING is still occupied until the trusted constructor returns.
    binding.terminalAttempted = true;
    binding.stop?.();
    try { binding.worker.terminate(); }
    catch (error) { binding.phase = 'FAILED'; throw error; } // Occupied slot and charge stay fail-closed.
    binding.resources.close(); binding.slot.current = undefined;
  }
  function dispose(): void {
      if (disposed) return;
      disposed = true;
      const active = slots.flatMap(s => s.current ? [s.current] : []);
      for (const b of active) if (b.auth) b.auth.binding = undefined;
      let failure: unknown;
      for (const b of active) {
        try { terminal(b); } catch (error) { failure ??= error; }
      }
      if (failure) throw failure;
  }
  return Object.freeze({
    snapshot() {
      return Object.freeze({ disposed, occupied: slots.filter(s => s.current).length,
        slots: Object.freeze(slots.map(s => Object.freeze({ ordinal: s.ordinal, incarnation: s.incarnation,
          generation: s.current?.generation ?? 0, phase: s.current?.phase ?? 'FREE' as Phase }))) });
    },
    dispose,
    release(lease: PoolLease): void {
      const auth = leases.get(lease); if (!auth) invalid();
      const binding = auth.binding; if (!binding) return;
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
      const resources = ledger.reserve(plan.map(p => ({ ...p, owner: slot.domain })));
      if ('code' in resources) return resources;
      slot.incarnation++;
      const binding: Binding = { slot, generation: ++generation, phase: 'STARTING', resources }; slot.current = binding;
      try {
        binding.nonce = globalThis.crypto.getRandomValues(new Uint32Array(4));
        binding.worker = factory(kind);
      }
      catch (error) { resources.close(); slot.current = undefined; throw error; }
      if (disposed) {
        terminal(binding);
        throw Object.assign(new Error('Closed pool'), { code: 'CLOSED' });
      }
      const lease = Object.freeze({}) as PoolLease;
      binding.phase = 'IDLE';
      const auth = { binding }; binding.auth = auth; leases.set(lease, auth);
      const native = binding.worker;
      const onError = () => {
        if (binding.slot.current !== binding || binding.worker !== native) return;
        try { terminal(binding); } catch { /* Native terminate failed: retain slot/charge. */ }
      };
      native.addEventListener('error', onError);
      binding.stop = () => native.removeEventListener('error', onError);
      return lease;
    },
  });
}
