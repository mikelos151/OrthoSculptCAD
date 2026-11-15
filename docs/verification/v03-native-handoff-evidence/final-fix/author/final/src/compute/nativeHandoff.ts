/**
 * G1b1b trusted input roundtrip, NOT App/global-cap migration or source authority.
 * One-shot endpoint only: no remote-new grants, native SHA or graceful CANCEL/RELEASE.
 * Transport factory and rebind capabilities never leave this composition's closure.
 */
import { createNativeLedger } from './resourceLedger';
import type { Lease, Limits, Realm, Ref } from './resourceLedger';
import { createWorkerPool } from './workerPool';
import type { PoolLease } from './workerPool';
export type InputRole = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export interface NativeRequest { readonly nativeRequestBrand: unique symbol }
export interface NativeInput { readonly ref: Ref; readonly role: InputRole }
type Descriptor = readonly [ordinal: number, role: InputRole, bytes: number];
interface Packet { header: ArrayBuffer; descriptors: ArrayBuffer; buffers: ArrayBuffer[] }
interface Frame { type: 1 | 2 | 3; tuple: number[]; nonce: number[]; plan: Descriptor[]; buffers: ArrayBuffer[] }
const length = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!;
const resizable = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable')?.get;
function failure(code: string) { return Object.assign(new Error(code), { code }); }
function invalid(): never { throw failure('INVALID_INPUT'); }
function bytes(b: ArrayBuffer): number {
  try { const n: number = length.call(b); if (resizable?.call(b)) invalid(); new Uint8Array(b, 0, 0); return n; }
  catch { return invalid(); }
}
function role(n: number): asserts n is InputRole { if (!Number.isInteger(n) || n < 1 || n > 9) invalid(); }
function dense(a: unknown): void {
  if (!Array.isArray(a) || a.length > 16 || Reflect.ownKeys(a).length !== a.length + 1) invalid();
  for (let i = 0; i < a.length; i++) if (!Object.getOwnPropertyDescriptor(a, String(i))?.hasOwnProperty('value')) invalid();
}
/** Internal input-only ABI codec; decoded data NEVER mints authority. */
export function decodeInputPacket(value: unknown): Frame {
  if (!value || typeof value !== 'object' || Reflect.ownKeys(value).length !== 3) invalid();
  for (const key of ['header', 'descriptors', 'buffers']) if (!Object.getOwnPropertyDescriptor(value, key)?.hasOwnProperty('value')) invalid();
  const p = value as Packet;
  if (bytes(p.header) !== 64) invalid();
  const dbytes = bytes(p.descriptors); if (dbytes > 192 || dbytes % 12 || p.header === p.descriptors) invalid();
  dense(p.buffers);
  const h = new DataView(p.header), d = new DataView(p.descriptors);
  if (h.getUint32(0, true) !== 0x3142474e || h.getUint32(4, true) !== 1 || h.getUint32(56, true) || h.getUint32(60, true)) invalid();
  const type = h.getUint32(8, true); if (type !== 1 && type !== 2 && type !== 3) invalid();
  const tuple = Array.from({ length: 7 }, (_, i) => h.getUint32(12 + 4 * i, true));
  const nonce = Array.from({ length: 4 }, (_, i) => h.getUint32(40 + 4 * i, true));
  const plan: Descriptor[] = [], ordinals = new Set<number>();
  for (let i = 0; i < dbytes / 12; i++) {
    const ordinal = d.getUint32(i * 12, true), r = d.getUint32(i * 12 + 4, true), n = d.getUint32(i * 12 + 8, true);
    role(r); if (ordinal >= 16 || ordinals.has(ordinal)) invalid(); ordinals.add(ordinal); plan.push([ordinal, r, n]);
  }
  if (!plan.length || (type === 2 ? p.buffers.length !== 0 : p.buffers.length !== plan.length)) invalid();
  const seen = new Set<ArrayBuffer>([p.header, p.descriptors]);
  for (let i = 0; i < p.buffers.length; i++) {
    const b = p.buffers[i]; if (seen.has(b) || bytes(b) !== plan[i][2]) invalid(); seen.add(b);
  }
  return { type, tuple, nonce, plan, buffers: [...p.buffers] };
}
export function encodeInputPacket(type: 1 | 2 | 3, tuple: readonly number[], nonce: readonly number[], plan: readonly Descriptor[], buffers: readonly ArrayBuffer[]): Packet {
  if (tuple.length !== 7 || nonce.length !== 4 || plan.length > 16) invalid();
  const header = new ArrayBuffer(64), descriptors = new ArrayBuffer(12 * plan.length), h = new DataView(header), d = new DataView(descriptors);
  for (const n of [...tuple, ...nonce, ...plan.flat()]) if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) invalid();
  [0x3142474e, 1, type, ...tuple, ...nonce].forEach((n, i) => h.setUint32(i * 4, n, true));
  plan.forEach((p, i) => p.forEach((n, j) => d.setUint32(i * 12 + j * 4, n, true)));
  const packet = { header, descriptors, buffers: [...buffers] }; decodeInputPacket(packet); return packet;
}
function equal(a: readonly number[], b: readonly number[]) { return a.length === b.length && a.every((n, i) => n === b[i]); }
function samePlan(a: readonly Descriptor[], b: readonly Descriptor[]) { return a.length === b.length && a.every((p, i) => equal(p, b[i])); }
type RequestPhase = 'STARTING' | 'IN_FLIGHT' | 'REMOTE' | 'RETURNED' | 'RETIRED' | 'REVOKED' | 'FAILED';
interface RequestState {
  slot: number; phase: RequestPhase; deadline: number; nonce: number[]; tuple: number[]; plan: Descriptor[];
  poolLease?: PoolLease; worker?: Worker; ticket?: object; timer?: ReturnType<typeof setTimeout>;
  remove?: () => void; removeError?: unknown; stopAttempted?: boolean; stopping?: boolean; stopped?: boolean; stopError?: unknown; revokeError?: unknown;
  done: Promise<void>; resolve: () => void; reject: (error: unknown) => void;
}
/** No caller Worker/URL/transport/nonce/deadline/ACK hooks. Not re-exported by compute/index. */
export function createNativeHandoff(limits?: Limits) {
  const { ledger, handoff } = createNativeLedger(limits), domains: Realm[] = [];
  const building: RequestState[] = [], current = new Map<number, RequestState>(), active = new Set<RequestState>();
  const handles = new WeakMap<NativeRequest, RequestState>();
  let disposed = false, poolDisposePending = false;
  // Same private core; this facade only captures the accepted pool's three domains.
  const pool = createWorkerPool(Object.freeze({ ...ledger, createRealm() { const r = ledger.createRealm(); domains.push(r); return r; } }), () => {
    const r = building[building.length - 1]; if (!r) invalid();
    return r.worker = new Worker(new URL('./nativeHandoff.worker.ts', import.meta.url), { type: 'module' });
  });
  const mainRealm = domains[0];
  function auth(h: NativeRequest) { const r = handles.get(h); if (!r) invalid(); return r; }
  function stopWorker(r: RequestState) {
    if (r.stopped) return;
    if (r.stopAttempted) throw r.stopError ?? failure('NATIVE_TERMINATE');
    r.stopAttempted = true; r.stopping = true;
    try {
      clearTimeout(r.timer);
      if (current.get(r.slot) === r) current.delete(r.slot);
      r.remove?.(); r.remove = undefined;
      if (!r.poolLease) invalid();
      try { pool.release(r.poolLease); }
      catch (error) {
        if (pool.snapshot().slots[r.slot].phase !== 'FREE') throw error; // A genuine native failure keeps its exact error.
        r.revokeError ??= error; // Pool listener cleanup failed, but this binding's native stop succeeded.
      }
      if (pool.snapshot().slots[r.slot].phase !== 'FREE') throw failure('NATIVE_TERMINATE');
      r.stopped = true; r.worker = undefined;
    } catch (error) { r.stopError = error; r.phase = 'FAILED'; throw error; }
    finally {
      r.stopping = false;
      if (poolDisposePending && ![...active].some(request => request.stopping)) {
        poolDisposePending = false; pool.dispose();
      }
    }
  }
  function drop(r: RequestState, error: unknown) {
    if (r.phase === 'RETIRED') return;
    r.phase = 'REVOKED'; r.revokeError ??= error;
    if (r.stopping) return; // Latch revoke; the original terminal call owns completion.
    try {
      stopWorker(r); if (r.ticket) handoff.terminated(r.ticket, r);
      r.phase = 'RETIRED'; r.plan = []; r.nonce = []; active.delete(r);
    } catch (stopError) { r.phase = 'FAILED'; r.reject(stopError); return; }
    r.reject(r.revokeError);
  }
  function timely(r: RequestState) {
    if (performance.now() >= r.deadline) { drop(r, failure('DEADLINE')); throw failure('DEADLINE'); }
  }
  function dispose() {
    if (disposed) return; disposed = true;
    for (const r of [...active]) drop(r, failure('CLOSED'));
    // An in-progress stop owns native completion, including its original thrown error.
    if ([...active].some(r => r.stopping)) poolDisposePending = true;
    else pool.dispose();
  }
  return Object.freeze({ ledger, mainRealm,
    snapshot() { return Object.freeze({ disposed, pool: pool.snapshot(), pending: active.size,
      requests: Object.freeze([...active].map(r => Object.freeze({ slot: r.slot, phase: r.phase }))) }); },
    submit(source: Lease, input: readonly NativeInput[]): NativeRequest | Readonly<{ ok: false; code: 'BUSY' | 'BUDGET' }> {
      if (disposed) throw failure('CLOSED');
      if (active.size >= 2) return Object.freeze({ ok: false, code: 'BUSY' });
      dense(input); if (!input.length) invalid();
      const copied = Array.from(input, p => { if (!p) invalid(); role(p.role); return { ref: p.ref, role: p.role }; });
      const slot = pool.snapshot().slots.find(s => s.phase === 'FREE'); if (!slot) return Object.freeze({ ok: false, code: 'BUSY' });
      if (slot.incarnation >= 0xffffffff) { dispose(); throw failure('BUDGET'); }
      let resolve!: () => void, reject!: (error: unknown) => void;
      const done = new Promise<void>((a, b) => { resolve = a; reject = b; }); void done.catch(() => {});
      const r: RequestState = { slot: slot.ordinal, phase: 'STARTING', deadline: performance.now() + 120000,
        nonce: [...crypto.getRandomValues(new Uint32Array(4))], tuple: [slot.ordinal, slot.incarnation + 1, 1, 1, 1, 1, 1], plan: [], done, resolve, reject };
      active.add(r); building.push(r);
      try {
        const lease = pool.acquire('compute', []);
        if ('code' in lease) { active.delete(r); return lease; }
        r.poolLease = lease;
      } catch (error) { active.delete(r); throw error; }
      finally { building.pop(); }
      try {
        timely(r);
        r.ticket = handoff.prepare(source, copied.map(p => p.ref), mainRealm, domains[r.slot + 1], r);
        const p = handoff.packet(r.ticket, r);
        r.plan = p.bytes.map((n, i) => [i, copied[i].role, n]);
        const packet = encodeInputPacket(1, r.tuple, r.nonce, r.plan, p.buffers);
        const worker = r.worker!;
        const onMessage = (event: MessageEvent<unknown>) => {
          if (current.get(r.slot) !== r || r.worker !== worker) return; // Captured binding FIRST.
          try {
            timely(r);
            const f = decodeInputPacket(event.data); // Schema BEFORE exact correlation.
            if (!equal(f.tuple, r.tuple) || !equal(f.nonce, r.nonce) || !samePlan(f.plan, r.plan)) invalid();
            if (f.type === 2 && r.phase === 'IN_FLIGHT') { handoff.received(r.ticket!, r); r.phase = 'REMOTE'; }
            else if (f.type === 3 && r.phase === 'REMOTE') {
              handoff.returned(r.ticket!, r, f.buffers); stopWorker(r);
              if (r.revokeError !== undefined) { drop(r, r.revokeError); return; }
              timely(r);
              r.phase = 'RETURNED'; r.resolve();
            } else invalid();
          } catch (error) { drop(r, error); }
        };
        const onError = () => { if (current.get(r.slot) === r && r.worker === worker) drop(r, failure('NATIVE_ERROR')); };
        r.remove = () => {
          for (const remove of [() => worker.removeEventListener('message', onMessage), () => worker.removeEventListener('error', onError), () => worker.removeEventListener('messageerror', onError)]) {
            try { remove(); }
            catch (error) { r.removeError ??= error; r.revokeError ??= error; } // Cleanup failure is not terminate failure.
          }
        };
        current.set(r.slot, r);
        worker.addEventListener('message', onMessage); worker.addEventListener('error', onError); worker.addEventListener('messageerror', onError);
        r.timer = setTimeout(() => drop(r, failure('DEADLINE')), Math.max(0, r.deadline - performance.now()));
        timely(r);
        try { worker.postMessage(packet, packet.buffers); }
        catch (error) {
          try { handoff.sendThrew(r.ticket, r); } catch { /* Partial detach: terminal, not rollback. */ }
          throw error;
        }
        handoff.sent(r.ticket, r); r.phase = 'IN_FLIGHT';
        const handle = Object.freeze({}) as NativeRequest; handles.set(handle, r); return handle;
      } catch (error) {
        drop(r, error);
        if ((error as { code?: string }).code === 'BUDGET') return Object.freeze({ ok: false, code: 'BUDGET' });
        throw error;
      }
    },
    wait(handle: NativeRequest): Promise<void> { return auth(handle).done; },
    /** Trusted consumer retains ownership BEFORE buffers leave the broker. */
    accept(handle: NativeRequest, consumer: Lease) {
      const r = auth(handle); if (r.phase !== 'RETURNED' || disposed) throw failure('STALE'); timely(r);
      const result = handoff.publish(r.ticket!, r, consumer);
      r.phase = 'RETIRED'; r.plan = []; r.nonce = []; active.delete(r); return result;
    },
    release(handle: NativeRequest): void { const r = auth(handle); if (r.phase !== 'RETIRED') drop(r, failure('RELEASED')); },
    dispose,
  });
}
