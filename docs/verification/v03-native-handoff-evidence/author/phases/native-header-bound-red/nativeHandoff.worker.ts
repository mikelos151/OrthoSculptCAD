/** Controlled one-shot input endpoint. No caller replacement buffer, copy, kernel or remote allocation. */
import { decodeInputPacket, encodeInputPacket } from './nativeHandoff';
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};
let issued = false;
let held: ArrayBuffer[] | undefined;
scope.onmessage = event => {
  if (issued) throw new Error('INVALID_INPUT');
  const f = decodeInputPacket(event.data);
  const [slot, incarnation, generation, job, request, transfer, window] = f.tuple;
  if (f.type !== 1 || slot > 1 || incarnation < 1 || generation !== 1 || job !== 1 || request !== 1 || transfer !== 1 || window !== 1 || f.plan.some((p, i) => p[0] !== i)) throw new Error('INVALID_INPUT');
  issued = true; held = f.buffers; // Exact native-received backings, validated and recorded BEFORE ACK.
  scope.postMessage(encodeInputPacket(2, f.tuple, f.nonce, f.plan, []));
  const returned = held;
  scope.postMessage(encodeInputPacket(3, f.tuple, f.nonce, f.plan, returned), returned);
  for (const b of returned) {
    let detached = false;
    try { new Uint8Array(b, 0, 0); } catch { detached = true; }
    if (!detached) throw new Error('NATIVE_DETACH');
  }
  held = undefined; scope.onmessage = null;
};
