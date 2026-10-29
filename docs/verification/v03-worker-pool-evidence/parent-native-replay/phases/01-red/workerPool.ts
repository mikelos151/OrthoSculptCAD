import type { Category, ResourceLedger } from './resourceLedger';
export type WorkerKind = 'compute' | 'display' | 'index' | 'owner';
export interface InternalPlanEntry { readonly key: string; readonly bytes: number; readonly category: Category }
export type InternalPlan = readonly InternalPlanEntry[];
export interface PoolLease { readonly poolLeaseBrand: unique symbol }
export type PoolRefusal = Readonly<{ ok: false; code: 'BUSY' | 'BUDGET' }>;
/** Nonfunctional API scaffold: no constructors, reservations or payload operations. */
export function createWorkerPool(_ledger: ResourceLedger, _factory: (kind: WorkerKind) => Worker) {
  return Object.freeze({
    acquire(_kind: WorkerKind, _plan: InternalPlan): PoolLease | PoolRefusal { return { ok: false, code: 'BUSY' }; },
  });
}
