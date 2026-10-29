import type { Category, Lease, Realm, ResourceLedger } from './resourceLedger';
export type WorkerKind = 'compute' | 'display' | 'index' | 'owner';
export interface InternalPlanEntry { readonly key: string; readonly bytes: number; readonly category: Category }
export type InternalPlan = readonly InternalPlanEntry[];
export interface PoolLease { readonly poolLeaseBrand: unique symbol }
export type PoolRefusal = Readonly<{ ok: false; code: 'BUSY' | 'BUDGET' }>;
interface Slot { domain: Realm; current?: Binding }
interface Binding { slot: Slot; resources: Lease; worker?: Worker; auth?: { binding?: Binding }; stop?: () => void; terminalAttempted?: boolean }
function invalid(): never { throw Object.assign(new Error('Invalid pool input'), { code: 'INVALID_INPUT' }); }
/** Trusted internal composition only; not a user/provider/URL extension point. */
export function createWorkerPool(ledger: ResourceLedger, factory: (kind: WorkerKind) => Worker) {
  ledger.createRealm(); // Stable main ownership domain, reserved for future composition.
  const slots: Slot[] = [ledger.createRealm(), ledger.createRealm()].map(domain => ({ domain }));
  const leases = new WeakMap<PoolLease, { binding?: Binding }>();
  let disposed = false;
  function terminal(binding: Binding) {
    if (binding.terminalAttempted || binding.slot.current !== binding) return;
    if (binding.auth) binding.auth.binding = undefined;
    if (!binding.worker) return; // STARTING is still occupied until the trusted constructor returns.
    binding.terminalAttempted = true;
    binding.stop?.();
    binding.worker!.terminate(); // If this throws, the occupied slot and charge stay fail-closed.
    binding.resources.close(); binding.slot.current = undefined;
  }
  return Object.freeze({
    snapshot() { return Object.freeze({ disposed, occupied: slots.filter(s => s.current).length }); },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      const active = slots.flatMap(s => s.current ? [s.current] : []);
      for (const b of active) if (b.auth) b.auth.binding = undefined;
      let failure: unknown;
      for (const b of active) {
        try { terminal(b); } catch (error) { failure ??= error; }
      }
      if (failure) throw failure;
    },
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
      if (!Array.isArray(plan)) invalid();
      if (plan.length > 16) return { ok: false, code: 'BUDGET' };
      const resources = ledger.reserve(plan.map(p => ({ ...p, owner: slot.domain })));
      if ('code' in resources) return resources;
      const binding: Binding = { slot, resources }; slot.current = binding;
      try { binding.worker = factory(kind); }
      catch (error) { resources.close(); slot.current = undefined; throw error; }
      if (disposed) {
        terminal(binding);
        throw Object.assign(new Error('Closed pool'), { code: 'CLOSED' });
      }
      const lease = Object.freeze({}) as PoolLease;
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
