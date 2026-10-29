export function createResourceLedger(_limits) {
    return Object.freeze({
        createRealm() { return Object.freeze({}); },
        reserve(_plan) { return Object.freeze({ ok: false, code: 'BUDGET' }); },
        snapshot() { return Object.freeze({ managed: 0, job: 0, history: 0 }); },
    });
}
