/** Controlled one-shot input endpoint. No caller replacement buffer, copy, kernel or remote allocation. */
import { decodeInputPacket } from './nativeHandoff';
const scope = globalThis;
let issued = false;
let held;
scope.onmessage = event => {
    if (issued)
        throw new Error('INVALID_INPUT');
    const f = decodeInputPacket(event.data);
    const [slot, incarnation, generation, job, request, transfer, window] = f.tuple;
    if (f.type !== 1 || slot > 1 || incarnation < 1 || generation !== 1 || job !== 1 || request !== 1 || transfer !== 1 || window !== 1 || f.plan.some((p, i) => p[0] !== i))
        throw new Error('INVALID_INPUT');
    issued = true;
    held = f.buffers; // Exact native-received backings, validated and recorded BEFORE ACK.
    // Reuse the actual validated incoming controls, not a new header per reply.
    // Main START + worker START + two native reply clones are at most four
    // logically owned headers; this does not claim an engine/GC allocation bound.
    const controls = event.data;
    const header = new DataView(controls.header);
    header.setUint32(8, 2, true);
    scope.postMessage({ header: controls.header, descriptors: controls.descriptors, buffers: [] });
    const returned = held;
    header.setUint32(8, 3, true);
    scope.postMessage({ header: controls.header, descriptors: controls.descriptors, buffers: returned }, returned);
    for (const b of returned) {
        let detached = false;
        try {
            new Uint8Array(b, 0, 0);
        }
        catch {
            detached = true;
        }
        if (!detached)
            throw new Error('NATIVE_DETACH');
    }
    held = undefined;
    scope.onmessage = null;
};
