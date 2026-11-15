/** G1b1b trusted input-handoff composition only; not source admission or App integration. */
import { createNativeLedger } from './resourceLedger.js';
export function createNativeHandoff(limits) {
    const { ledger } = createNativeLedger(limits), mainRealm = ledger.createRealm();
    return Object.freeze({ ledger, mainRealm,
        submit(_lease, _input) {
            throw Object.assign(new Error('Native START unavailable'), { code: 'UNAVAILABLE' });
        },
        wait(_handle) { throw Error('Unavailable'); },
        accept(_handle, _consumer) { throw Error('Unavailable'); },
        release(_handle) { throw Error('Unavailable'); },
        dispose() { },
    });
}
