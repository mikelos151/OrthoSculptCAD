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
export interface ControlLimits { maxLeases: number; maxRefs: number; maxRealms: number; maxPlanEntries: number; maxKeyLength: number }
export interface LedgerInternals { allocate?: (bytes: number) => ArrayBuffer; controls?: Partial<ControlLimits> }
const DEFAULT_CONTROLS: Readonly<ControlLimits> = Object.freeze({ maxLeases: 1024, maxRefs: 8192, maxRealms: 32, maxPlanEntries: 1024, maxKeyLength: 128 });
const NativeBuffer = ArrayBuffer;
const nativeLength = Object.getOwnPropertyDescriptor(NativeBuffer.prototype, 'byteLength')!.get!;
const nativeResizable = Object.getOwnPropertyDescriptor(NativeBuffer.prototype, 'resizable')?.get;
/** ArrayBuffer only: ingress adapters must pass a view's actual .buffer. */
function backingBytes(b: ArrayBuffer): number {
  try {
    const n: number = nativeLength.call(b);
    if (nativeResizable?.call(b)) invalid();
    new Uint8Array(b, 0, 0); // Also rejects detached zero-byte buffers.
    size(n); return n;
  } catch { return invalid(); }
}
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
  const controls = Object.freeze({ ...DEFAULT_CONTROLS, ...internals.controls });
  for (const n of Object.values(controls)) size(n);
  let activeLeases = 0, activeRefs = 0;
  function room(n: number, a = 0) { return activeRefs + n <= controls.maxRefs && refId <= Number.MAX_SAFE_INTEGER - n && allocationId <= Number.MAX_SAFE_INTEGER - a; }
  const allocate = internals.allocate ?? (n => new ArrayBuffer(n));
  const realms = new WeakMap<Realm, number>();
  let realmId = 0;
  const refs = new WeakMap<Ref, RefState>();
  const leases = new WeakMap<Lease, LeaseState>();
  const allocations = new Set<Allocation>();
  const backings = new WeakMap<ArrayBuffer, Allocation>();
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
    activeRefs++;
    const r = Object.freeze({}) as Ref;
    refs.set(r, { id: ++refId, lease, allocation: a, category: c, key });
    a.refs.add(r); leases.get(lease)!.refs.add(r);
    if (key !== undefined) leases.get(lease)!.keys.set(key, r);
    return r;
  }
  function leaseState(l: Lease) { const s = leases.get(l); if (!s) invalid(); return s; }
  function open(l: Lease) { const s = leaseState(l); if (s.closed) throw Object.assign(new Error('Closed lease'), { code: 'CLOSED' }); return s; }
  function retire(r: Ref) {
    const s = refs.get(r)!, a = s.allocation;
    if (!a) return;
    a.refs.delete(r); const ls = leases.get(s.lease)!;
    ls.refs.delete(r); if (s.key !== undefined) ls.keys.delete(s.key);
    s.allocation = undefined; activeRefs--;
    if (!a.refs.size) { allocations.delete(a); if (a.buffer) backings.delete(a.buffer); }
  }
  function makeLease(): Lease {
    const l: Lease = Object.freeze({
      retain(this: Lease, from: Ref, c: Category, owner: Realm): Ref | Refusal {
        leaseState(this);
        const s = refs.get(from); if (!s?.allocation?.buffer) invalid();
        category(c); realm(owner); if (owner !== s.allocation.owner) invalid();
        open(this);
        const a = s.allocation, n = counts();
        if (c !== 'resident' && ![...a.refs].some(r => refs.get(r)!.category === c)) n[c] += a.bytes;
        if (!fits(n) || !room(1)) return BUDGET;
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
      release(this: Lease, r: Ref): void {
        leaseState(this); const s = refs.get(r); if (!s || s.lease !== this) invalid(); retire(r);
      },
      close(this: Lease): void {
        const s = leaseState(this); if (s.closed) return;
        for (const r of s.refs) retire(r);
        s.closed = true; activeLeases--;
      },
      /** Checked logical handoff only: no detach/postMessage/ACK/native lifecycle. */
      transfer(this: Lease, r: Ref, target: Realm): void {
        const s = refs.get(r); if (!s || s.lease !== this) invalid(); realm(target);
        if (!s.allocation) invalid(); // A retired transfer source never regains authority.
        open(this); if (!s.allocation.buffer) invalid();
        backingBytes(s.allocation.buffer);
        if (s.allocation.refs.size !== 1) throw Object.assign(new Error('Aliased backing'), { code: 'TRANSFER_ALIASED' });
        s.allocation.owner = target;
      },
      ref(this: Lease, key: string) { const r = open(this).keys.get(key); if (!r) invalid(); return r; },
      allocateBuffer(this: Lease, r: Ref) {
        const s = refs.get(r); if (!s || s.lease !== this) invalid();
        open(this); if (!s.allocation || s.allocation.buffer) invalid();
        try {
          const b = allocate(s.allocation.bytes);
          if (backingBytes(b) !== s.allocation.bytes) invalid();
          s.allocation.buffer = b; backings.set(b, s.allocation); return b;
        } catch (error) { retire(r); throw error; }
      },
    });
    leases.set(l, { closed: false, refs: new Set(), keys: new Map() }); activeLeases++; return l;
  }
  return Object.freeze({
    createRealm(): Realm {
      if (realmId >= controls.maxRealms || realmId >= Number.MAX_SAFE_INTEGER) throw Object.assign(new Error('Realm capacity'), { code: 'BUDGET' });
      const r = Object.freeze({}) as Realm; realms.set(r, ++realmId); return r;
    },
    reserve(plan: readonly PlanEntry[]): Lease | Refusal {
      if (!Array.isArray(plan)) invalid();
      if (plan.length > controls.maxPlanEntries) return BUDGET;
      const keys = new Set<string>(), n = counts();
      const checked = plan.map(p => {
        if (!p || typeof p.key !== 'string' || !p.key.length || p.key.length > controls.maxKeyLength || keys.has(p.key)) invalid();
        keys.add(p.key); size(p.bytes); category(p.category); realm(p.owner);
        n.managed += p.bytes; if (p.category !== 'resident') n[p.category] += p.bytes;
        return { ...p };
      });
      if (!fits(n) || !room(checked.length, checked.length) || activeLeases >= controls.maxLeases) return BUDGET;
      const l = makeLease();
      for (const p of checked) {
        const a: Allocation = { id: ++allocationId, bytes: p.bytes, owner: p.owner, refs: new Set() };
        allocations.add(a); issue(l, a, p.category, p.key);
      }
      return l;
    },
    /** Trusted UI/history mode ingress only; does not claim prior allocation was budgeted. */
    registerExisting(backing: ArrayBuffer, lease: Lease, c: Category, owner: Realm): Ref | Refusal {
      leaseState(lease); category(c); realm(owner); const bytes = backingBytes(backing);
      const known = backings.get(backing);
      if (known?.refs.size && known.owner !== owner) invalid();
      open(lease);
      if (known?.refs.size) return lease.retain(known.refs.values().next().value!, c, owner);
      const n = counts(); n.managed += bytes; if (c !== 'resident') n[c] += bytes;
      if (!fits(n) || !room(1, 1)) return BUDGET;
      const a: Allocation = { id: ++allocationId, bytes, owner, buffer: backing, refs: new Set() };
      allocations.add(a); backings.set(backing, a); return issue(lease, a, c);
    },
    snapshot() {
      return Object.freeze({ ...counts(), allocations: Object.freeze([...allocations].map(a => Object.freeze({
        id: a.id, bytes: a.bytes, realm: realms.get(a.owner)!, phase: a.buffer ? 'live' as const : 'reserved' as const,
        refs: Object.freeze([...a.refs].map(r => { const s = refs.get(r)!; return Object.freeze({ id: s.id, category: s.category }); })),
      }))) });
    },
  });
}
