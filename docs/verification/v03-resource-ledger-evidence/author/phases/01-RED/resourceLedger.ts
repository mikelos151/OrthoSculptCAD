export type Category = 'resident' | 'job' | 'history';
export type Refusal = Readonly<{ ok: false; code: 'BUDGET' }>;
export interface Realm { readonly realmBrand: unique symbol }
export interface Ref { readonly refBrand: unique symbol }
export interface PlanEntry { key: string; bytes: number; category: Category; owner: Realm }
export interface Lease {
  ref(key: string): Ref;
  allocateBuffer(ref: Ref): ArrayBuffer;
}
export interface Limits { managed: number; job: number; history: number }
export function createResourceLedger(_limits: Limits) {
  return Object.freeze({
    createRealm(): Realm { return Object.freeze({}) as Realm; },
    reserve(_plan: readonly PlanEntry[]): Lease | Refusal { return Object.freeze({ ok: false, code: 'BUDGET' }); },
    snapshot() { return Object.freeze({ managed: 0, job: 0, history: 0 }); },
  });
}
