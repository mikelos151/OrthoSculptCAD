import type { Lease, Limits, Realm, Ref } from './resourceLedger';
export type InputRole = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export interface NativeRequest {
    readonly nativeRequestBrand: unique symbol;
}
export interface NativeInput {
    readonly ref: Ref;
    readonly role: InputRole;
}
type Descriptor = readonly [ordinal: number, role: InputRole, bytes: number];
interface Packet {
    header: ArrayBuffer;
    descriptors: ArrayBuffer;
    buffers: ArrayBuffer[];
}
interface Frame {
    type: 1 | 2 | 3;
    tuple: number[];
    nonce: number[];
    plan: Descriptor[];
    buffers: ArrayBuffer[];
}
/** Internal input-only ABI codec; decoded data NEVER mints authority. */
export declare function decodeInputPacket(value: unknown): Frame;
export declare function encodeInputPacket(type: 1 | 2 | 3, tuple: readonly number[], nonce: readonly number[], plan: readonly Descriptor[], buffers: readonly ArrayBuffer[]): Packet;
type RequestPhase = 'STARTING' | 'IN_FLIGHT' | 'REMOTE' | 'RETURNED' | 'RETIRED' | 'REVOKED' | 'FAILED';
/** No caller Worker/URL/transport/nonce/deadline/ACK hooks. Not re-exported by compute/index. */
export declare function createNativeHandoff(limits?: Limits): Readonly<{
    ledger: Readonly<{
        createRealm(): Realm;
        reserve(plan: readonly import("./resourceLedger").PlanEntry[]): Lease | import("./resourceLedger").Refusal;
        registerExisting(backing: ArrayBuffer, lease: Lease, c: import("./resourceLedger").Category, owner: Realm): Ref | import("./resourceLedger").Refusal;
        snapshot(): Readonly<{
            allocations: readonly Readonly<{
                id: number;
                bytes: number;
                realm: number;
                phase: ("MAIN" | "PREPARED" | "IN_FLIGHT" | "REMOTE" | "RETURNING") | "RESERVED" | "live" | "reserved";
                refs: readonly Readonly<{
                    id: number;
                    category: import("./resourceLedger").Category;
                }>[];
            }>[];
            managed: number;
            job: number;
            history: number;
        }>;
    }>;
    mainRealm: Realm;
    snapshot(): Readonly<{
        disposed: boolean;
        pool: Readonly<{
            disposed: boolean;
            ownershipDomains: number;
            occupied: number;
            slots: readonly Readonly<{
                ordinal: number;
                incarnation: number;
                generation: number;
                phase: "FREE" | "STARTING" | "IDLE" | "REVOKING" | "FAILED";
            }>[];
        }>;
        pending: number;
        requests: readonly Readonly<{
            slot: number;
            phase: RequestPhase;
        }>[];
    }>;
    submit(source: Lease, input: readonly NativeInput[]): NativeRequest | Readonly<{
        ok: false;
        code: "BUSY" | "BUDGET";
    }>;
    wait(handle: NativeRequest): Promise<void>;
    /** Trusted consumer retains ownership BEFORE buffers leave the broker. */
    accept(handle: NativeRequest, consumer: Lease): {
        refs: readonly Ref[];
        buffers: readonly ArrayBuffer[];
    };
    release(handle: NativeRequest): void;
    dispose: () => void;
}>;
export {};
