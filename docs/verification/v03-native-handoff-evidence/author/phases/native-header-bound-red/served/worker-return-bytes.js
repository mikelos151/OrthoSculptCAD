const __mode="return-bytes",__nativePost=self.postMessage;let __input;self.addEventListener('message',e=>{__input=e.data;}); self.postMessage=function(frame,transfer){const type=new DataView(frame.header).getUint32(8,true),before=frame.buffers.map(b=>b.byteLength);if(type===3){if(__mode==='return-reserved')new DataView(frame.header).setUint32(56,1,true);if(__mode==='return-envelope')frame.extra=0;if(__mode==='return-bytes')new DataView(frame.descriptors).setUint32(8,before[0]+1,true);if(__mode==='return-nonce')new DataView(frame.header).setUint32(40,new DataView(frame.header).getUint32(40,true)^1,true);}console.info('NATIVE-WORKER-OBS '+JSON.stringify({mode:__mode,stage:'before-post',type,lengths:before,headerSame:frame.header===__input.header,descriptorsSame:frame.descriptors===__input.descriptors}));const r=__nativePost.call(this,frame,transfer);console.info('NATIVE-WORKER-OBS '+JSON.stringify({mode:__mode,stage:'after-post',type,lengths:frame.buffers.map(b=>b.byteLength),detached:frame.buffers.map(b=>{try{new Uint8Array(b,0,0);return false;}catch{return true;}})}));return r;};
/** Controlled one-shot input endpoint. No caller replacement buffer, copy, kernel or remote allocation. */
import { decodeInputPacket, encodeInputPacket } from './nativeHandoff.js';
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
    scope.postMessage(encodeInputPacket(2, f.tuple, f.nonce, f.plan, []));
    const returned = held;
    scope.postMessage(encodeInputPacket(3, f.tuple, f.nonce, f.plan, returned), returned);
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
