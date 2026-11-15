/**
 * G1a managed-payload primitive for trusted internal composition, not file/JSON authority.
 * Capabilities authenticate by ledger-local weak identity; diagnostic IDs are not capabilities.
 * Ref ownership is logical: consumers must not keep using a backing after releasing its ref.
 * This is not a sandbox, native transport, heap/RSS bound, or source-admission integration.
 */
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
type NativePhase = 'MAIN' | 'PREPARED' | 'IN_FLIGHT' | 'REMOTE' | 'RETURNING';
interface Allocation { id: number; bytes: number; owner: Realm; buffer?: ArrayBuffer; phase?: NativePhase; refs: Set<Ref> }
interface HandoffState {
  binding: object; phase: 'PREPARED' | 'IN_FLIGHT' | 'REMOTE' | 'MAIN' | 'RETIRED';
  source: Lease; controlled: Lease; input: Ref[]; allocations: Allocation[];
  main: Realm; target: Realm; buffers: ArrayBuffer[]; controlledRefs: Ref[];
}
interface RefState { id: number; lease: Lease; category: Category; allocation?: Allocation; key?: string }
interface LeaseState { closed: boolean; refs: Set<Ref>; keys: Map<string, Ref> }
/** Proposed managed-payload policy; not a process/JS heap/RSS limit. */
export const DEFAULT_RESOURCE_LIMITS: Readonly<Limits> = Object.freeze({ managed: 402653184, job: 134217728, history: 134217728 });
export function createResourceLedger(limits: Limits = DEFAULT_RESOURCE_LIMITS, internals: LedgerInternals = {}) {
  return createLedgerCore(limits, internals).ledger;
}
/** Internal composition only; never re-export from the public compute API. */
export function createNativeLedger(limits: Limits = DEFAULT_RESOURCE_LIMITS) {
  return Object.freeze(createLedgerCore(limits, {}, true));
}
function createLedgerCore(limits: Limits, internals: LedgerInternals, native = false) {
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
  const tickets = new WeakMap<object, HandoffState>();
  function accessible(a: Allocation) { if (a.phase && a.phase !== 'MAIN') invalid(); }
  function ticket(t: object, binding: object, phase?: HandoffState['phase']) {
    const s = tickets.get(t); if (!s || s.binding !== binding || (phase && s.phase !== phase)) invalid(); return s;
  }
  const handoff = Object.freeze({
    prepare(source: Lease, input: readonly Ref[], main: Realm, target: Realm, binding: object): object {
      if (!native) invalid();
      open(source); realm(main); realm(target);
      if (!binding || typeof binding !== 'object' || main === target || !Array.isArray(input) || !input.length || input.length > 16) invalid();
      const seen = new Set<Allocation>();
      const aa = Array.from(input, r => {
        const s = refs.get(r), a = s?.allocation;
        if (!s || s.lease !== source || !a || a.owner !== main || !a.buffer) invalid();
        accessible(a); if (seen.has(a)) invalid(); seen.add(a);
        if (a.refs.size !== 1) throw Object.assign(new Error('Aliased backing'), { code: 'TRANSFER_ALIASED' });
        if (backingBytes(a.buffer) !== a.bytes) invalid();
        return a;
      });
      if (activeLeases >= controls.maxLeases || !room(input.length)) throw Object.assign(new Error('Handoff capacity'), { code: 'BUDGET' });
      const controlled = makeLease(), t = Object.freeze({});
      const buffers = aa.map(a => a.buffer!);
      for (const a of aa) a.phase = 'PREPARED';
      tickets.set(t, { binding, phase: 'PREPARED', source, controlled, input: [...input], allocations: aa, main, target, buffers, controlledRefs: [] });
      return t;
    },
    packet(t: object, binding: object) {
      const s = ticket(t, binding, 'PREPARED');
      return { buffers: [...s.buffers], bytes: s.allocations.map(a => a.bytes) };
    },
    sendThrew(t: object, binding: object) {
      const s = ticket(t, binding, 'PREPARED');
      for (let i = 0; i < s.buffers.length; i++) if (backingBytes(s.buffers[i]) !== s.allocations[i].bytes) invalid();
      for (const a of s.allocations) a.phase = 'MAIN';
      s.phase = 'RETIRED'; s.buffers = []; s.controlled.close();
    },
  });
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
        const s = refs.get(from); if (!s?.allocation) invalid();
        category(c); realm(owner); if (owner !== s.allocation.owner) invalid();
        open(this); accessible(s.allocation); if (!s.allocation.buffer) invalid();
        backingBytes(s.allocation.buffer);
        const a = s.allocation, n = counts();
        if (c !== 'resident' && ![...a.refs].some(r => refs.get(r)!.category === c)) n[c] += a.bytes;
        if (!fits(n) || !room(1)) return BUDGET;
        return issue(this, a, c);
      },
      reclassify(this: Lease, r: Ref, c: Category): void | Refusal {
        const s = refs.get(r); if (!s || s.lease !== this) invalid();
        category(c); open(this); if (!s.allocation) invalid(); accessible(s.allocation);
        if (s.allocation.buffer) backingBytes(s.allocation.buffer);
        const a = s.allocation, n = counts();
        const other = [...a.refs].filter(x => x !== r).map(x => refs.get(x)!.category);
        if (s.category !== 'resident' && !other.includes(s.category)) n[s.category] -= a.bytes;
        if (c !== 'resident' && !other.includes(c)) n[c] += a.bytes;
        if (!fits(n)) return BUDGET;
        s.category = c;
      },
      release(this: Lease, r: Ref): void {
        leaseState(this); const s = refs.get(r); if (!s || s.lease !== this) invalid();
        if (s.allocation) accessible(s.allocation); retire(r);
      },
      close(this: Lease): void {
        const s = leaseState(this); if (s.closed) return;
        for (const r of s.refs) accessible(refs.get(r)!.allocation!);
        for (const r of s.refs) retire(r);
        s.closed = true; activeLeases--;
      },
      /** Checked logical handoff only: no detach/postMessage/ACK/native lifecycle. */
      transfer(this: Lease, r: Ref, target: Realm): void {
        const s = refs.get(r); if (!s || s.lease !== this) invalid(); realm(target);
        if (!s.allocation) invalid(); // A retired transfer source never regains authority.
        open(this); accessible(s.allocation); if (!s.allocation.buffer) invalid();
        backingBytes(s.allocation.buffer);
        if (s.allocation.refs.size !== 1) throw Object.assign(new Error('Aliased backing'), { code: 'TRANSFER_ALIASED' });
        s.allocation.owner = target;
      },
      ref(this: Lease, key: string) { const r = open(this).keys.get(key); if (!r) invalid(); return r; },
      allocateBuffer(this: Lease, r: Ref) {
        const s = refs.get(r); if (!s || s.lease !== this) invalid();
        open(this); if (!s.allocation || s.allocation.buffer) invalid(); accessible(s.allocation);
        try {
          const b = allocate(s.allocation.bytes);
          if (backingBytes(b) !== s.allocation.bytes || backings.has(b)) invalid();
          s.allocation.buffer = b; backings.set(b, s.allocation); return b;
        } catch (error) { retire(r); throw error; }
      },
    });
    leases.set(l, { closed: false, refs: new Set(), keys: new Map() }); activeLeases++; return l;
  }
  return { ledger: Object.freeze({
    createRealm(): Realm {
      if (realmId >= controls.maxRealms || realmId >= Number.MAX_SAFE_INTEGER) throw Object.assign(new Error('Realm capacity'), { code: 'BUDGET' });
      const r = Object.freeze({}) as Realm; realms.set(r, ++realmId); return r;
    },
    reserve(plan: readonly PlanEntry[]): Lease | Refusal {
      if (!Array.isArray(plan)) invalid();
      if (plan.length > controls.maxPlanEntries) return BUDGET;
      const keys = new Set<string>(), n = counts();
      const checked = Array.from(plan, (p: PlanEntry) => {
        if (!p) invalid();
        const { key, bytes, category: c, owner } = p;
        if (typeof key !== 'string' || !key.length || key.length > controls.maxKeyLength || keys.has(key)) invalid();
        keys.add(key); size(bytes); category(c); realm(owner);
        n.managed += bytes; if (c !== 'resident') n[c] += bytes;
        return { key, bytes, category: c, owner };
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
      if (known?.refs.size) { accessible(known); if (known.owner !== owner) invalid(); }
      open(lease);
      if (known?.refs.size) return lease.retain(known.refs.values().next().value!, c, owner);
      const n = counts(); n.managed += bytes; if (c !== 'resident') n[c] += bytes;
      if (!fits(n) || !room(1, 1)) return BUDGET;
      const a: Allocation = { id: ++allocationId, bytes, owner, buffer: backing, refs: new Set() };
      allocations.add(a); backings.set(backing, a); return issue(lease, a, c);
    },
    snapshot() {
      return Object.freeze({ ...counts(), allocations: Object.freeze([...allocations].map(a => Object.freeze({
        id: a.id, bytes: a.bytes, realm: realms.get(a.owner)!, phase: native ? (a.phase ?? (a.buffer ? 'MAIN' as const : 'reserved' as const)) : (a.buffer ? 'live' as const : 'reserved' as const),
        refs: Object.freeze([...a.refs].map(r => { const s = refs.get(r)!; return Object.freeze({ id: s.id, category: s.category }); })),
      }))) });
    },
  }), handoff };
}
export type ResourceLedger = ReturnType<typeof createResourceLedger>;
export type ResourceLedgerSnapshot = ReturnType<ResourceLedger['snapshot']>;
