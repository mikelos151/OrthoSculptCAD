const DEFAULT_CONTROLS = Object.freeze({ maxLeases: 1024, maxRefs: 8192, maxRealms: 32, maxPlanEntries: 1024, maxKeyLength: 128 });
const NativeBuffer = ArrayBuffer;
const nativeLength = Object.getOwnPropertyDescriptor(NativeBuffer.prototype, 'byteLength').get;
const nativeResizable = Object.getOwnPropertyDescriptor(NativeBuffer.prototype, 'resizable')?.get;
/** ArrayBuffer only: ingress adapters must pass a view's actual .buffer. */
function backingBytes(b) {
    try {
        const n = nativeLength.call(b);
        if (nativeResizable?.call(b))
            invalid();
        new Uint8Array(b, 0, 0); // Also rejects detached zero-byte buffers.
        size(n);
        return n;
    }
    catch {
        return invalid();
    }
}
const BUDGET = Object.freeze({ ok: false, code: 'BUDGET' });
function invalid() { throw Object.assign(new Error('Invalid ledger input'), { code: 'INVALID_INPUT' }); }
function category(c) { if (c !== 'resident' && c !== 'job' && c !== 'history')
    invalid(); }
function size(n) { if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0)
    invalid(); }
/** Proposed managed-payload policy; not a process/JS heap/RSS limit. */
export const DEFAULT_RESOURCE_LIMITS = Object.freeze({ managed: 402653184, job: 134217728, history: 134217728 });
export function createResourceLedger(limits = DEFAULT_RESOURCE_LIMITS, internals = {}) {
    for (const n of [limits.managed, limits.job, limits.history])
        size(n);
    const caps = Object.freeze({ ...limits });
    const controls = Object.freeze({ ...DEFAULT_CONTROLS, ...internals.controls });
    for (const n of Object.values(controls))
        size(n);
    let activeLeases = 0, activeRefs = 0;
    function room(n, a = 0) { return activeRefs + n <= controls.maxRefs && refId <= Number.MAX_SAFE_INTEGER - n && allocationId <= Number.MAX_SAFE_INTEGER - a; }
    const allocate = internals.allocate ?? (n => new ArrayBuffer(n));
    const realms = new WeakMap();
    let realmId = 0;
    const refs = new WeakMap();
    const leases = new WeakMap();
    const allocations = new Set();
    const backings = new WeakMap();
    let allocationId = 0, refId = 0;
    function realm(r) { if (!realms.has(r))
        invalid(); }
    function counts() {
        let managed = 0, job = 0, history = 0;
        for (const a of allocations) {
            managed += a.bytes;
            const cs = new Set([...a.refs].map(r => refs.get(r).category));
            if (cs.has('job'))
                job += a.bytes;
            if (cs.has('history'))
                history += a.bytes;
        }
        return { managed, job, history };
    }
    function fits(n) { return ['managed', 'job', 'history'].every(k => Number.isSafeInteger(n[k]) && n[k] <= caps[k]); }
    function issue(lease, a, c, key) {
        activeRefs++;
        const r = Object.freeze({});
        refs.set(r, { id: ++refId, lease, allocation: a, category: c, key });
        a.refs.add(r);
        leases.get(lease).refs.add(r);
        if (key !== undefined)
            leases.get(lease).keys.set(key, r);
        return r;
    }
    function leaseState(l) { const s = leases.get(l); if (!s)
        invalid(); return s; }
    function open(l) { const s = leaseState(l); if (s.closed)
        throw Object.assign(new Error('Closed lease'), { code: 'CLOSED' }); return s; }
    function retire(r) {
        const s = refs.get(r), a = s.allocation;
        if (!a)
            return;
        a.refs.delete(r);
        const ls = leases.get(s.lease);
        ls.refs.delete(r);
        if (s.key !== undefined)
            ls.keys.delete(s.key);
        s.allocation = undefined;
        activeRefs--;
        if (!a.refs.size) {
            allocations.delete(a);
            if (a.buffer)
                backings.delete(a.buffer);
        }
    }
    function makeLease() {
        const l = Object.freeze({
            retain(from, c, owner) {
                leaseState(this);
                const s = refs.get(from);
                if (!s?.allocation?.buffer)
                    invalid();
                category(c);
                realm(owner);
                if (owner !== s.allocation.owner)
                    invalid();
                open(this);
                backingBytes(s.allocation.buffer);
                const a = s.allocation, n = counts();
                if (c !== 'resident' && ![...a.refs].some(r => refs.get(r).category === c))
                    n[c] += a.bytes;
                if (!fits(n) || !room(1))
                    return BUDGET;
                return issue(this, a, c);
            },
            reclassify(r, c) {
                const s = refs.get(r);
                if (!s || s.lease !== this)
                    invalid();
                category(c);
                open(this);
                if (!s.allocation)
                    invalid();
                if (s.allocation.buffer)
                    backingBytes(s.allocation.buffer);
                const a = s.allocation, n = counts();
                const other = [...a.refs].filter(x => x !== r).map(x => refs.get(x).category);
                if (s.category !== 'resident' && !other.includes(s.category))
                    n[s.category] -= a.bytes;
                if (c !== 'resident' && !other.includes(c))
                    n[c] += a.bytes;
                if (!fits(n))
                    return BUDGET;
                s.category = c;
            },
            release(r) {
                leaseState(this);
                const s = refs.get(r);
                if (!s || s.lease !== this)
                    invalid();
                retire(r);
            },
            close() {
                const s = leaseState(this);
                if (s.closed)
                    return;
                for (const r of s.refs)
                    retire(r);
                s.closed = true;
                activeLeases--;
            },
            /** Checked logical handoff only: no detach/postMessage/ACK/native lifecycle. */
            transfer(r, target) {
                const s = refs.get(r);
                if (!s || s.lease !== this)
                    invalid();
                realm(target);
                if (!s.allocation)
                    invalid(); // A retired transfer source never regains authority.
                open(this);
                if (!s.allocation.buffer)
                    invalid();
                backingBytes(s.allocation.buffer);
                if (s.allocation.refs.size !== 1)
                    throw Object.assign(new Error('Aliased backing'), { code: 'TRANSFER_ALIASED' });
                s.allocation.owner = target;
            },
            ref(key) { const r = open(this).keys.get(key); if (!r)
                invalid(); return r; },
            allocateBuffer(r) {
                const s = refs.get(r);
                if (!s || s.lease !== this)
                    invalid();
                open(this);
                if (!s.allocation || s.allocation.buffer)
                    invalid();
                try {
                    const b = allocate(s.allocation.bytes);
                    if (backingBytes(b) !== s.allocation.bytes || backings.has(b))
                        invalid();
                    s.allocation.buffer = b;
                    backings.set(b, s.allocation);
                    return b;
                }
                catch (error) {
                    retire(r);
                    throw error;
                }
            },
        });
        leases.set(l, { closed: false, refs: new Set(), keys: new Map() });
        activeLeases++;
        return l;
    }
    return Object.freeze({
        createRealm() {
            if (realmId >= controls.maxRealms || realmId >= Number.MAX_SAFE_INTEGER)
                throw Object.assign(new Error('Realm capacity'), { code: 'BUDGET' });
            const r = Object.freeze({});
            realms.set(r, ++realmId);
            return r;
        },
        reserve(plan) {
            if (!Array.isArray(plan))
                invalid();
            if (plan.length > controls.maxPlanEntries)
                return BUDGET;
            const keys = new Set(), n = counts();
            const checked = Array.from(plan, (p) => {
                if (!p)
                    invalid();
                const { key, bytes, category: c, owner } = p;
                if (typeof key !== 'string' || !key.length || key.length > controls.maxKeyLength || keys.has(key))
                    invalid();
                keys.add(key);
                size(bytes);
                category(c);
                realm(owner);
                n.managed += bytes;
                if (c !== 'resident')
                    n[c] += bytes;
                return { key, bytes, category: c, owner };
            });
            if (!fits(n) || !room(checked.length, checked.length) || activeLeases >= controls.maxLeases)
                return BUDGET;
            const l = makeLease();
            for (const p of checked) {
                const a = { id: ++allocationId, bytes: p.bytes, owner: p.owner, refs: new Set() };
                allocations.add(a);
                issue(l, a, p.category, p.key);
            }
            return l;
        },
        /** Trusted UI/history mode ingress only; does not claim prior allocation was budgeted. */
        registerExisting(backing, lease, c, owner) {
            leaseState(lease);
            category(c);
            realm(owner);
            const bytes = backingBytes(backing);
            const known = backings.get(backing);
            if (known?.refs.size && known.owner !== owner)
                invalid();
            open(lease);
            if (known?.refs.size)
                return lease.retain(known.refs.values().next().value, c, owner);
            const n = counts();
            n.managed += bytes;
            if (c !== 'resident')
                n[c] += bytes;
            if (!fits(n) || !room(1, 1))
                return BUDGET;
            const a = { id: ++allocationId, bytes, owner, buffer: backing, refs: new Set() };
            allocations.add(a);
            backings.set(backing, a);
            return issue(lease, a, c);
        },
        snapshot() {
            return Object.freeze({ ...counts(), allocations: Object.freeze([...allocations].map(a => Object.freeze({
                    id: a.id, bytes: a.bytes, realm: realms.get(a.owner), phase: a.buffer ? 'live' : 'reserved',
                    refs: Object.freeze([...a.refs].map(r => { const s = refs.get(r); return Object.freeze({ id: s.id, category: s.category }); })),
                }))) });
        },
    });
}
