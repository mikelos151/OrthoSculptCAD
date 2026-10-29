import type { Category, Lease, Realm, ResourceLedger } from './resourceLedger';
export type WorkerKind = 'compute' | 'display' | 'index' | 'owner';
export interface InternalPlanEntry { readonly key: string; readonly bytes: number; readonly category: Category }
export type InternalPlan = readonly InternalPlanEntry[];
export interface PoolLease { readonly poolLeaseBrand: unique symbol }
export type PoolRefusal = Readonly<{ ok: false; code: 'BUSY' | 'BUDGET' }>;
interface Slot { domain: Realm; current?: Binding }
interface Binding { slot: Slot; resources: Lease; worker?: Worker; auth?: { binding?: Binding } }
function invalid(): never { throw Object.assign(new Error('Invalid pool input'), { code: 'INVALID_INPUT' }); }
/** Trusted internal composition only; not a user/provider/URL extension point. */
export function createWorkerPool(ledger: ResourceLedger, factory: (kind: WorkerKind) => Worker) {
  ledger.createRealm(); // Stable main ownership domain, reserved for future composition.
  const slots: Slot[] = [ledger.createRealm(), ledger.createRealm()].map(domain => ({ domain }));
  const leases = new WeakMap<PoolLease, { binding?: Binding }>();
  return Object.freeze({
    release(lease: PoolLease): void {
      const auth = leases.get(lease); if (!auth) invalid();
      const binding = auth.binding; if (!binding) return;
      auth.binding = undefined; // Revoke authority before any native effect/reentrant callback.
      binding.worker!.terminate();
      binding.resources.close(); binding.slot.current = undefined;
    },
    acquire(kind: WorkerKind, plan: InternalPlan): PoolLease | PoolRefusal {
      if (kind !== 'compute' && kind !== 'display' && kind !== 'index' && kind !== 'owner') invalid();
      const slot = slots.find(s => !s.current);
      if (!slot) return { ok: false, code: 'BUSY' };
      const resources = ledger.reserve(plan.map(p => ({ ...p, owner: slot.domain })));
      if ('code' in resources) return resources;
      const binding: Binding = { slot, resources }; slot.current = binding;
      try { binding.worker = factory(kind); }
      catch (error) { resources.close(); slot.current = undefined; throw error; }
      const lease = Object.freeze({}) as PoolLease;
      const auth = { binding }; binding.auth = auth; leases.set(lease, auth);
      return lease;
    },
  });
}
