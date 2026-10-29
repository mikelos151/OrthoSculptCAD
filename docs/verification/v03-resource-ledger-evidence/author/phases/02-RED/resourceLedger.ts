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
  let managed = 0, job = 0, history = 0;
  return Object.freeze({
    createRealm(): Realm { return Object.freeze({}) as Realm; },
    reserve(plan: readonly PlanEntry[]): Lease | Refusal {
      const refs = new Map<string, Ref>();
      const sizes = new WeakMap<Ref, number>();
      for (const p of plan) {
        const ref = Object.freeze({}) as Ref;
        refs.set(p.key, ref); sizes.set(ref, p.bytes);
        managed += p.bytes;
        if (p.category === 'job') job += p.bytes;
        if (p.category === 'history') history += p.bytes;
      }
      return Object.freeze({
        ref(key: string) { return refs.get(key)!; },
        allocateBuffer(ref: Ref) { return new ArrayBuffer(sizes.get(ref)!); },
      });
    },
    snapshot() { return Object.freeze({ managed, job, history }); },
  });
}
