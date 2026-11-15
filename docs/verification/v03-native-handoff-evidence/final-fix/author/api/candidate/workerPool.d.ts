/**
 * G1b1a internal primitive only: no App singleton, dispatch, transport or source authority.
 * The trusted composition owns its constructor URLs; this factory is not user-configurable.
 * Callers must acquire here before payload work. Existing legacy constructors are NOT migrated.
 * Slot release proves one successful terminate API invocation, not a thread/GC/RSS join.
 */
import type { Category, ResourceLedger } from './resourceLedger';
export type WorkerKind = 'compute' | 'display' | 'index' | 'owner';
export interface InternalPlanEntry {
    readonly key: string;
    readonly bytes: number;
    readonly category: Category;
}
export type InternalPlan = readonly InternalPlanEntry[];
export interface PoolLease {
    readonly poolLeaseBrand: unique symbol;
}
export type PoolRefusal = Readonly<{
    ok: false;
    code: 'BUSY' | 'BUDGET';
}>;
type Phase = 'FREE' | 'STARTING' | 'IDLE' | 'REVOKING' | 'FAILED';
/** Trusted internal composition only; not a user/provider/URL extension point. */
export declare function createWorkerPool(ledger: ResourceLedger, factory: (kind: WorkerKind) => Worker): Readonly<{
    snapshot(): Readonly<{
        disposed: boolean;
        ownershipDomains: number;
        occupied: number;
        slots: readonly Readonly<{
            ordinal: number;
            incarnation: number;
            generation: number;
            phase: Phase;
        }>[];
    }>;
    dispose: () => void;
    release(lease: PoolLease): void;
    acquire(kind: WorkerKind, plan: InternalPlan): PoolLease | PoolRefusal;
}>;
export type WorkerPool = ReturnType<typeof createWorkerPool>;
export type WorkerPoolSnapshot = ReturnType<WorkerPool['snapshot']>;
export {};
