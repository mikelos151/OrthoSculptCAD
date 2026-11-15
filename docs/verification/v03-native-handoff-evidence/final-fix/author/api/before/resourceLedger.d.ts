/**
 * G1a managed-payload primitive for trusted internal composition, not file/JSON authority.
 * Capabilities authenticate by ledger-local weak identity; diagnostic IDs are not capabilities.
 * Ref ownership is logical: consumers must not keep using a backing after releasing its ref.
 * This is not a sandbox, native transport, heap/RSS bound, or source-admission integration.
 */
export type Category = 'resident' | 'job' | 'history';
export type Refusal = Readonly<{
    ok: false;
    code: 'BUDGET';
}>;
export interface Realm {
    readonly realmBrand: unique symbol;
}
export interface Ref {
    readonly refBrand: unique symbol;
}
export interface PlanEntry {
    key: string;
    bytes: number;
    category: Category;
    owner: Realm;
}
export interface Lease {
    ref(key: string): Ref;
    allocateBuffer(ref: Ref): ArrayBuffer;
    retain(from: Ref, category: Category, owner: Realm): Ref | Refusal;
    reclassify(ref: Ref, category: Category): void | Refusal;
    release(ref: Ref): void;
    close(): void;
    transfer(ref: Ref, target: Realm): void;
}
export interface Limits {
    managed: number;
    job: number;
    history: number;
}
/** Trusted composition / allocator fault-injection seam; never a file/JSON option. */
export interface ControlLimits {
    maxLeases: number;
    maxRefs: number;
    maxRealms: number;
    maxPlanEntries: number;
    maxKeyLength: number;
}
export interface LedgerInternals {
    allocate?: (bytes: number) => ArrayBuffer;
    controls?: Partial<ControlLimits>;
}
type NativePhase = 'MAIN' | 'PREPARED' | 'IN_FLIGHT' | 'REMOTE' | 'RETURNING';
/** Proposed managed-payload policy; not a process/JS heap/RSS limit. */
export declare const DEFAULT_RESOURCE_LIMITS: Readonly<Limits>;
export declare function createResourceLedger(limits?: Limits, internals?: LedgerInternals): Readonly<{
    createRealm(): Realm;
    reserve(plan: readonly PlanEntry[]): Lease | Refusal;
    /** Trusted UI/history mode ingress only; does not claim prior allocation was budgeted. */
    registerExisting(backing: ArrayBuffer, lease: Lease, c: Category, owner: Realm): Ref | Refusal;
    snapshot(): Readonly<{
        allocations: readonly Readonly<{
            id: number;
            bytes: number;
            realm: number;
            phase: NativePhase | "RESERVED" | "live" | "reserved";
            refs: readonly Readonly<{
                id: number;
                category: Category;
            }>[];
        }>[];
        managed: number;
        job: number;
        history: number;
    }>;
}>;
/** Internal composition only; never re-export from the public compute API. */
export declare function createNativeLedger(limits?: Limits): Readonly<{
    ledger: Readonly<{
        createRealm(): Realm;
        reserve(plan: readonly PlanEntry[]): Lease | Refusal;
        /** Trusted UI/history mode ingress only; does not claim prior allocation was budgeted. */
        registerExisting(backing: ArrayBuffer, lease: Lease, c: Category, owner: Realm): Ref | Refusal;
        snapshot(): Readonly<{
            allocations: readonly Readonly<{
                id: number;
                bytes: number;
                realm: number;
                phase: NativePhase | "RESERVED" | "live" | "reserved";
                refs: readonly Readonly<{
                    id: number;
                    category: Category;
                }>[];
            }>[];
            managed: number;
            job: number;
            history: number;
        }>;
    }>;
    handoff: Readonly<{
        sent(t: object, binding: object): void;
        received(t: object, binding: object): void;
        returned(t: object, binding: object, buffers: readonly ArrayBuffer[]): void;
        publish(t: object, binding: object, consumer: Lease): {
            refs: readonly Ref[];
            buffers: readonly ArrayBuffer[];
        };
        /** Only the owned native composition calls this AFTER successful terminate. */
        terminated(t: object, binding: object): void;
        prepare(source: Lease, input: readonly Ref[], main: Realm, target: Realm, binding: object): object;
        packet(t: object, binding: object): {
            buffers: ArrayBuffer[];
            bytes: number[];
        };
        sendThrew(t: object, binding: object): void;
    }>;
}>;
export type ResourceLedger = ReturnType<typeof createResourceLedger>;
export type ResourceLedgerSnapshot = ReturnType<ResourceLedger['snapshot']>;
export {};
