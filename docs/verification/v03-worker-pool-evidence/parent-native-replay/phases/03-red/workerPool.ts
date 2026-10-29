import type { Category, ResourceLedger } from './resourceLedger';
export type WorkerKind = 'compute' | 'display' | 'index' | 'owner';
export interface InternalPlanEntry { readonly key: string; readonly bytes: number; readonly category: Category }
export type InternalPlan = readonly InternalPlanEntry[];
export interface PoolLease { readonly poolLeaseBrand: unique symbol }
export type PoolRefusal = Readonly<{ ok: false; code: 'BUSY' | 'BUDGET' }>;
/** Trusted internal composition only; not a user/provider/URL extension point. */
export function createWorkerPool(ledger: ResourceLedger, factory: (kind: WorkerKind) => Worker) {
  ledger.createRealm(); // Stable main ownership domain, reserved for future composition.
  const slots = [ledger.createRealm(), ledger.createRealm()].map(domain => ({ domain, held: false }));
  return Object.freeze({
    acquire(kind: WorkerKind, plan: InternalPlan): PoolLease | PoolRefusal {
      const slot = slots.find(s => !s.held);
      if (!slot) return { ok: false, code: 'BUSY' };
      const resources = ledger.reserve(plan.map(p => ({ ...p, owner: slot.domain })));
      if ('code' in resources) return resources;
      slot.held = true;
      factory(kind);
      return Object.freeze({}) as PoolLease;
    },
  });
}
