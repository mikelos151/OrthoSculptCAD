/** Controlled one-shot endpoint with bounded cleanup. */
import { decodeInputPacket } from './nativeHandoff';
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};
let issued: ReturnType<typeof decodeInputPacket> | undefined;
let held: ArrayBuffer[] | undefined;
let continuation: ReturnType<typeof setTimeout> | undefined;
let released = false;
const equal = (a: number[], b: number[]) => a.length === b.length && a.every((n, i) => n === b[i]);
scope.onmessage = event => {
  const f = decodeInputPacket(event.data);
  const controls = event.data as { header: ArrayBuffer; descriptors: ArrayBuffer };
  const header = new DataView(controls.header);
  if (issued) {
    const target = [...issued.tuple]; target[5] = 0;
    if ((f.type !== 4 && f.type !== 6) || !equal(f.tuple, target) || !equal(f.nonce, issued.nonce) || released) throw new Error('INVALID_INPUT');
    clearTimeout(continuation); continuation = undefined;
    held = undefined; // Drop payload and pending continuation before RELEASED.
    released = true;
    header.setUint32(8, 5, true);
    scope.postMessage({ header: controls.header, descriptors: controls.descriptors, buffers: [] });
    return;
  }
  const [slot, incarnation, generation, job, request, transfer, window] = f.tuple;
  if (f.type !== 1 || slot > 1 || incarnation < 1 || generation !== 1 || job !== 1 || request !== 1 || transfer !== 1 || window !== 1 || f.plan.some((p, i) => p[0] !== i)) throw new Error('INVALID_INPUT');
  issued = { ...f, buffers: [] }; held = f.buffers;
  header.setUint32(8, 2, true);
  scope.postMessage({ header: controls.header, descriptors: controls.descriptors, buffers: [] });
  continuation = setTimeout(() => {
    continuation = undefined;
    const returned = held!; held = undefined;
    header.setUint32(8, 3, true);
    scope.postMessage({ header: controls.header, descriptors: controls.descriptors, buffers: returned }, returned);
    for (const b of returned) {
      let detached = false;
      try { new Uint8Array(b, 0, 0); } catch { detached = true; }
      if (!detached) throw new Error('NATIVE_DETACH');
    }
  // One bounded control-turn window before this one-shot echo completes.
  // This is not a worker-clock deadline or a kernel execution budget.
  }, 16);
};
