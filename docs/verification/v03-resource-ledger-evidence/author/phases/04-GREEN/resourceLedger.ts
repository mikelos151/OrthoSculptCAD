export type Category = 'resident' | 'job' | 'history';
export type Refusal = Readonly<{ ok: false; code: 'BUDGET' }>;
export interface Realm { readonly realmBrand: unique symbol }
export interface Ref { readonly refBrand: unique symbol }
export interface PlanEntry { key: string; bytes: number; category: Category; owner: Realm }
export interface Lease {
  ref(key: string): Ref;
  allocateBuffer(ref: Ref): ArrayBuffer;
  retain(from: Ref, category: Category, owner: Realm): Ref | Refusal;
  reclassify(ref: Ref, category: Category): void | Refusal;
  release(ref: Ref): void;
  close(): void;
  transfer(ref: Ref, target: Realm): void;
}
export interface Limits { managed: number; job: number; history: number }
/** Trusted composition / allocator fault-injection seam; never a file/JSON option. */
export interface LedgerInternals { allocate?: (bytes: number) => ArrayBuffer }
const BUDGET: Refusal = Object.freeze({ ok: false, code: 'BUDGET' });
function invalid(): never { throw Object.assign(new Error('Invalid ledger input'), { code: 'INVALID_INPUT' }); }
function category(c: unknown): asserts c is Category { if (c !== 'resident' && c !== 'job' && c !== 'history') invalid(); }
function size(n: unknown): asserts n is number { if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0) invalid(); }
interface Allocation { id: number; bytes: number; owner: Realm; buffer?: ArrayBuffer; refs: Set<Ref> }
interface RefState { id: number; lease: Lease; category: Category; allocation?: Allocation; key?: string }
interface LeaseState { closed: boolean; refs: Set<Ref>; keys: Map<string, Ref> }
export function createResourceLedger(limits: Limits, internals: LedgerInternals = {}) {
  for (const n of [limits.managed, limits.job, limits.history]) size(n);
  const caps = Object.freeze({ ...limits });
  const allocate = internals.allocate ?? (n => new ArrayBuffer(n));
  const realms = new WeakSet<Realm>();
  const refs = new WeakMap<Ref, RefState>();
  const leases = new WeakMap<Lease, LeaseState>();
  const allocations = new Set<Allocation>();
  let allocationId = 0, refId = 0;
  function realm(r: Realm) { if (!realms.has(r)) invalid(); }
  function counts() {
    let managed = 0, job = 0, history = 0;
    for (const a of allocations) {
      managed += a.bytes;
      const cs = new Set([...a.refs].map(r => refs.get(r)!.category));
      if (cs.has('job')) job += a.bytes;
      if (cs.has('history')) history += a.bytes;
    }
    return { managed, job, history };
  }
  function fits(n: Limits) { return (['managed', 'job', 'history'] as const).every(k => Number.isSafeInteger(n[k]) && n[k] <= caps[k]); }
  function issue(lease: Lease, a: Allocation, c: Category, key?: string) {
    const r = Object.freeze({}) as Ref;
    refs.set(r, { id: ++refId, lease, allocation: a, category: c, key });
    a.refs.add(r); leases.get(lease)!.refs.add(r);
    if (key !== undefined) leases.get(lease)!.keys.set(key, r);
    return r;
  }
  function leaseState(l: Lease) { const s = leases.get(l); if (!s) invalid(); return s; }
  function open(l: Lease) { const s = leaseState(l); if (s.closed) throw Object.assign(new Error('Closed lease'), { code: 'CLOSED' }); return s; }
  function makeLease(): Lease {
    const l: Lease = Object.freeze({
      retain(this: Lease, from: Ref, c: Category, owner: Realm): Ref | Refusal {
        leaseState(this);
        const s = refs.get(from); if (!s?.allocation?.buffer) invalid();
        category(c); realm(owner); if (owner !== s.allocation.owner) invalid();
        open(this);
        const a = s.allocation, n = counts();
        if (c !== 'resident' && ![...a.refs].some(r => refs.get(r)!.category === c)) n[c] += a.bytes;
        if (!fits(n)) return BUDGET;
        return issue(this, a, c);
      },
      reclassify(this: Lease, r: Ref, c: Category): void | Refusal {
        const s = refs.get(r); if (!s || s.lease !== this) invalid();
        category(c); open(this); if (!s.allocation) invalid();
        const a = s.allocation, n = counts();
        const other = [...a.refs].filter(x => x !== r).map(x => refs.get(x)!.category);
        if (s.category !== 'resident' && !other.includes(s.category)) n[s.category] -= a.bytes;
        if (c !== 'resident' && !other.includes(c)) n[c] += a.bytes;
        if (!fits(n)) return BUDGET;
        s.category = c;
      },
      release(_ref: Ref): void { return invalid(); },
      close(): void { return invalid(); },
      transfer(_ref: Ref, _target: Realm): void { return invalid(); },
      ref(this: Lease, key: string) { const r = open(this).keys.get(key); if (!r) invalid(); return r; },
      allocateBuffer(this: Lease, r: Ref) {
        const s = refs.get(r); if (!s || s.lease !== this) invalid();
        open(this); if (!s.allocation || s.allocation.buffer) invalid();
        const b = allocate(s.allocation.bytes); s.allocation.buffer = b; return b;
      },
    });
    leases.set(l, { closed: false, refs: new Set(), keys: new Map() }); return l;
  }
  return Object.freeze({
    createRealm(): Realm { const r = Object.freeze({}) as Realm; realms.add(r); return r; },
    reserve(plan: readonly PlanEntry[]): Lease | Refusal {
      if (!Array.isArray(plan)) invalid();
      const keys = new Set<string>(), n = counts();
      const checked = plan.map(p => {
        if (!p || typeof p.key !== 'string' || !p.key.length || keys.has(p.key)) invalid();
        keys.add(p.key); size(p.bytes); category(p.category); realm(p.owner);
        n.managed += p.bytes; if (p.category !== 'resident') n[p.category] += p.bytes;
        return { ...p };
      });
      if (!fits(n)) return BUDGET;
      const l = makeLease();
      for (const p of checked) {
        const a: Allocation = { id: ++allocationId, bytes: p.bytes, owner: p.owner, refs: new Set() };
        allocations.add(a); issue(l, a, p.category, p.key);
      }
      return l;
    },
    snapshot() { return Object.freeze(counts()); },
  });
}
