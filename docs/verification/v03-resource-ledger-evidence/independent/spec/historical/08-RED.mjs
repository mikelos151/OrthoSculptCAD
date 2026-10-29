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
export function createResourceLedger(limits, internals = {}) {
    for (const n of [limits.managed, limits.job, limits.history])
        size(n);
    const caps = Object.freeze({ ...limits });
    const allocate = internals.allocate ?? (n => new ArrayBuffer(n));
    const realms = new WeakSet();
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
        if (!a.refs.size)
            allocations.delete(a);
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
                const a = s.allocation, n = counts();
                if (c !== 'resident' && ![...a.refs].some(r => refs.get(r).category === c))
                    n[c] += a.bytes;
                if (!fits(n))
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
            },
            transfer(_ref, _target) { return invalid(); },
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
                    if (backingBytes(b) !== s.allocation.bytes)
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
        return l;
    }
    return Object.freeze({
        createRealm() { const r = Object.freeze({}); realms.add(r); return r; },
        reserve(plan) {
            if (!Array.isArray(plan))
                invalid();
            const keys = new Set(), n = counts();
            const checked = plan.map(p => {
                if (!p || typeof p.key !== 'string' || !p.key.length || keys.has(p.key))
                    invalid();
                keys.add(p.key);
                size(p.bytes);
                category(p.category);
                realm(p.owner);
                n.managed += p.bytes;
                if (p.category !== 'resident')
                    n[p.category] += p.bytes;
                return { ...p };
            });
            if (!fits(n))
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
            if (!fits(n))
                return BUDGET;
            const a = { id: ++allocationId, bytes, owner, buffer: backing, refs: new Set() };
            allocations.add(a);
            backings.set(backing, a);
            return issue(lease, a, c);
        },
        snapshot() {
            return Object.freeze({ ...counts(), allocations: Object.freeze([...allocations].map(a => Object.freeze({
                    id: a.id, bytes: a.bytes, phase: a.buffer ? 'live' : 'reserved',
                    refs: Object.freeze([...a.refs].map(r => { const s = refs.get(r); return Object.freeze({ id: s.id, category: s.category }); })),
                }))) });
        },
    });
}
