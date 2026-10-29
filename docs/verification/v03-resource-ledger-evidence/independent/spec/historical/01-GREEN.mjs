export function createResourceLedger(_limits) {
    let managed = 0, job = 0, history = 0;
    return Object.freeze({
        createRealm() { return Object.freeze({}); },
        reserve(plan) {
            const refs = new Map();
            const sizes = new WeakMap();
            for (const p of plan) {
                const ref = Object.freeze({});
                refs.set(p.key, ref);
                sizes.set(ref, p.bytes);
                managed += p.bytes;
                if (p.category === 'job')
                    job += p.bytes;
                if (p.category === 'history')
                    history += p.bytes;
            }
            return Object.freeze({
                ref(key) { return refs.get(key); },
                allocateBuffer(ref) { return new ArrayBuffer(sizes.get(ref)); },
            });
        },
        snapshot() { return Object.freeze({ managed, job, history }); },
    });
}
