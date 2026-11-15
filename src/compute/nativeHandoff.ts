/**
 * G1b1b trusted input roundtrip, NOT App/global-cap migration or source authority.
 * One-shot endpoint with bounded graceful cleanup and optional native SHA; no remote-new grants.
 * Transport factory and rebind capabilities never leave this composition's closure.
 */
import { createNativeLedger } from './resourceLedger';
import type { Lease, Limits, NativeOutputGrant, Realm, Ref } from './resourceLedger';
import { createWorkerPoolCore } from './workerPool';
import type { PoolLease, TerminalControl, TerminalResult } from './workerPool';
export type InputRole = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export interface NativeRequest { readonly nativeRequestBrand: unique symbol }
export interface NativeInput { readonly ref: Ref; readonly role: InputRole }
type Descriptor = readonly [ordinal: number, role: InputRole, bytes: number];
interface Packet { header: ArrayBuffer; descriptors: ArrayBuffer; buffers: ArrayBuffer[] }
type FrameType = 1 | 2 | 3 | 4 | 5 | 6;
interface Frame { type: FrameType; tuple: number[]; nonce: number[]; plan: Descriptor[]; buffers: ArrayBuffer[] }
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
  const type = h.getUint32(8, true); if (type !== 1 && type !== 2 && type !== 3 && type !== 4 && type !== 5 && type !== 6) invalid();
  const tuple = Array.from({ length: 7 }, (_, i) => h.getUint32(12 + 4 * i, true));
  const nonce = Array.from({ length: 4 }, (_, i) => h.getUint32(40 + 4 * i, true));
  const plan: Descriptor[] = [], ordinals = new Set<number>();
  for (let i = 0; i < dbytes / 12; i++) {
    const ordinal = d.getUint32(i * 12, true), r = d.getUint32(i * 12 + 4, true), n = d.getUint32(i * 12 + 8, true);
    role(r); if (ordinal >= 16 || ordinals.has(ordinal)) invalid(); ordinals.add(ordinal); plan.push([ordinal, r, n]);
  }
  if (type >= 4) {
    if (plan.length || p.buffers.length || tuple[5] !== 0) invalid();
  } else if (!plan.length || (type === 2 ? p.buffers.length !== 0 : p.buffers.length !== plan.length)) invalid();
  const seen = new Set<ArrayBuffer>([p.header, p.descriptors]);
  for (let i = 0; i < p.buffers.length; i++) {
    const b = p.buffers[i]; if (seen.has(b) || bytes(b) !== plan[i][2]) invalid(); seen.add(b);
  }
  return { type, tuple, nonce, plan, buffers: [...p.buffers] };
}
export function encodeInputPacket(type: FrameType, tuple: readonly number[], nonce: readonly number[], plan: readonly Descriptor[], buffers: readonly ArrayBuffer[]): Packet {
  if (tuple.length !== 7 || nonce.length !== 4 || plan.length > 16) invalid();
  const header = new ArrayBuffer(64), descriptors = new ArrayBuffer(12 * plan.length), h = new DataView(header), d = new DataView(descriptors);
  for (const n of [...tuple, ...nonce, ...plan.flat()]) if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) invalid();
  [0x3142474e, 1, type, ...tuple, ...nonce].forEach((n, i) => h.setUint32(i * 4, n, true));
  plan.forEach((p, i) => p.forEach((n, j) => d.setUint32(i * 12 + j * 4, n, true)));
  const packet = { header, descriptors, buffers: [...buffers] }; decodeInputPacket(packet); return packet;
}
function equal(a: readonly number[], b: readonly number[]) { return a.length === b.length && a.every((n, i) => n === b[i]); }
function samePlan(a: readonly Descriptor[], b: readonly Descriptor[]) { return a.length === b.length && a.every((p, i) => equal(p, b[i])); }
type RequestPhase = 'STARTING' | 'IN_FLIGHT' | 'REMOTE' | 'WAIT_MAIN' | 'RETURNED' | 'RETIRED' | 'REVOKED' | 'FAILED';
interface RequestState {
  slot: number; phase: RequestPhase; deadline: number; nonce: number[]; tuple: number[]; plan: Descriptor[];
  poolLease?: PoolLease; worker?: Worker; ticket?: object; timer?: ReturnType<typeof setTimeout>;
  remove?: () => unknown[]; stopping?: boolean; revokeError?: unknown; revoked?: boolean; explicitRevoke?: boolean; returning?: boolean; settled?: boolean; terminal?: TerminalControl;
  cleanup?: { tuple: number[]; graceEnd: number };
  sha?: { grant: NativeOutputGrant; pending: boolean; token: boolean };
  done: Promise<void>; resolve: () => void; reject: (error: unknown) => void;
}
/** No caller Worker/URL/transport/nonce/deadline/ACK hooks. Not re-exported by compute/index. */
export function createNativeHandoff(limits?: Limits) {
  return createHandoff(false, limits);
}
/** Internal G1b1c composition: explicitly opts into bounded protocol cleanup.
 * The accepted one-shot factory above retains synchronous terminal release/dispose.
 * Both paths use the same production endpoint and accepted TerminalControl.
 */
export function createGracefulNativeHandoff(limits?: Limits) {
  return createHandoff(true, limits);
}
function createHandoff(gracefulCleanup: boolean, limits?: Limits) {
  const { ledger, handoff, nativeOutput } = createNativeLedger(limits), domains: Realm[] = [];
  const building: RequestState[] = [], current = new Map<number, RequestState>(), active = new Set<RequestState>();
  const handles = new WeakMap<NativeRequest, RequestState>();
  let disposed = false;
  let mainHolds = 0;
  // Same private core; this facade only captures the accepted pool's three domains.
  const pool = createWorkerPoolCore(Object.freeze({ ...ledger, createRealm() { const r = ledger.createRealm(); domains.push(r); return r; } }), () => {
    const r = building[building.length - 1]; if (!r) invalid();
    return r.worker = new Worker(new URL('./nativeHandoff.worker.ts', import.meta.url), { type: 'module' });
  }, control => { const r = building[building.length - 1]; if (!r) invalid(); return terminalOwner(r, control); });
  const mainRealm = domains[0];
  function auth(h: NativeRequest) { const r = handles.get(h); if (!r) invalid(); return r; }
  function rejectOnce(r: RequestState, error: unknown) {
    if (!r.settled) { r.settled = true; r.reject(error); }
  }
  function retire(r: RequestState) {
    if (r.sha?.pending) { r.phase = 'WAIT_MAIN'; return; }
    if (r.sha) {
      nativeOutput.retire(r.sha.grant, r);
      if (r.sha.token) { r.sha.token = false; mainHolds--; }
    }
    clearTimeout(r.timer);
    if (r.ticket) handoff.terminated(r.ticket, r);
    r.phase = 'RETIRED'; r.plan = []; r.nonce = []; r.worker = undefined; active.delete(r);
  }
  function terminalOwner(r: RequestState, control: TerminalControl) {
    r.terminal = control;
    return {
      begin(cause?: unknown) {
        r.stopping = true;
        if (cause !== undefined && !r.revoked) { r.revoked = true; r.revokeError = cause; }
        if (current.get(r.slot) === r) current.delete(r.slot);
      },
      cleanup() {
        const errors: unknown[] = [];
        try { if (!r.sha?.pending) clearTimeout(r.timer); } catch (error) { errors.push(error); }
        const remove = r.remove; r.remove = undefined;
        try { if (remove) errors.push(...remove()); } catch (error) { errors.push(error); }
        return errors;
      },
      settle(result: TerminalResult) {
        if (result.native.state !== 'SUCCEEDED') return;
        if (r.returning && performance.now() >= r.deadline && !r.revoked) {
          r.revoked = true; r.revokeError = failure('DEADLINE');
        }
        if (r.revoked || result.cleanupErrors.length || !r.returning) retire(r);
      },
      finished(result: TerminalResult) {
        r.stopping = false;
        if (result.native.state === 'FAILED') { r.phase = 'FAILED'; rejectOnce(r, result.native.error); return; }
        if (result.settlement.state === 'FAILED') { r.phase = 'FAILED'; rejectOnce(r, result.settlement.error); return; }
        r.worker = undefined;
        if (r.explicitRevoke) { rejectOnce(r, r.revokeError); return; }
        if (result.cleanupErrors.length) { rejectOnce(r, result.cleanupErrors[0]); return; }
        if (r.revoked) { rejectOnce(r, r.revokeError); return; }
        if (r.returning) {
          if (r.sha?.pending) { r.phase = 'WAIT_MAIN'; return; }
          r.phase = 'RETURNED';
          if (!r.settled) { r.settled = true; r.resolve(); }
        }
      },
    };
  }
  function stopWorker(r: RequestState) {
    if (!r.terminal) invalid();
    r.terminal.request();
  }
  function drop(r: RequestState, error: unknown, explicitRevoke = false) {
    if (r.phase === 'RETIRED' || r.phase === 'FAILED') return;
    if (!r.revoked) { r.revoked = true; r.revokeError = error; r.explicitRevoke = explicitRevoke; }
    if (explicitRevoke && r.cleanup) return; // Duplicate public revoke never shortens grace.
    if (r.stopping) return; // IN_PROGRESS only latches revoke; the pool owns completion.
    if (r.terminal?.result.native.state === 'SUCCEEDED') {
      try { retire(r); rejectOnce(r, r.revokeError); }
      catch (settlementError) { r.phase = 'FAILED'; rejectOnce(r, settlementError); }
      return;
    }
    const graceful = gracefulCleanup && explicitRevoke && !r.cleanup && performance.now() < r.deadline && (r.phase === 'IN_FLIGHT' || r.phase === 'REMOTE');
    r.phase = 'REVOKED';
    if (graceful) {
      const tuple = [...r.tuple]; tuple[5] = 0;
      const graceEnd = Math.min(performance.now() + 1000, r.deadline);
      r.cleanup = { tuple, graceEnd }; // Private correlation exists BEFORE send/reentrant delivery.
      clearTimeout(r.timer);
      r.timer = setTimeout(() => { try { stopWorker(r); } catch { /* finished retains exact outcome */ } }, Math.max(0, graceEnd - performance.now()));
      try { r.worker!.postMessage(encodeInputPacket(disposed ? 6 : 4, tuple, r.nonce, [], [])); return; }
      catch { /* Failed control send falls through to the accepted terminal latch. */ }
    }
    try { stopWorker(r); } catch { /* Exact native/completion outcome is delivered by finished. */ }
  }
  function timely(r: RequestState) {
    if (performance.now() >= r.deadline) { drop(r, failure('DEADLINE')); throw failure('DEADLINE'); }
  }
  function startSha(r: RequestState) {
    const sha = r.sha!; timely(r); sha.pending = true;
    let promise: Promise<ArrayBuffer>;
    try { promise = crypto.subtle.digest('SHA-256', handoff.mainBuffers(r.ticket!, r)[0]); }
    catch (error) { promise = Promise.reject(error); }
    void promise.then(actual => settleSha(r, actual), error => settleSha(r, undefined, error));
  }
  function settleSha(r: RequestState, actual?: ArrayBuffer, error?: unknown) {
    const sha = r.sha!;
    // Real continuation settlement, not revoke/workerTerminal, releases this token.
    sha.pending = false; sha.token = false; mainHolds--;
    try {
      if (performance.now() >= r.deadline && !r.revoked) { r.revoked = true; r.revokeError = failure('DEADLINE'); }
      if (actual !== undefined) nativeOutput.bindNativeResult(sha.grant, r, actual);
      else if (!r.revoked) { r.revoked = true; r.revokeError = error; }
    } catch (cause) { if (!r.revoked) { r.revoked = true; r.revokeError = cause; } }
    const native = r.terminal!.result.native;
    if (native.state === 'SUCCEEDED') {
      if (r.revoked) { retire(r); rejectOnce(r, r.revokeError); }
      else { clearTimeout(r.timer); r.phase = 'RETURNED'; if (!r.settled) { r.settled = true; r.resolve(); } }
    } else if (r.revoked) drop(r, r.revokeError);
  }
  function dispose() {
    if (disposed) return; disposed = true;
    for (const r of [...active]) drop(r, failure('CLOSED'), true);
    // Pool joins IN_PROGRESS and defers STARTING without masking native failure.
    // Do not bypass a pending graceful interval; completed/in-progress terminals
    // still join the accepted pool disposal semantics (including failure sealing).
    if (![...active].some(r => r.cleanup && r.terminal?.result.native.state === 'NOT_STARTED')) {
      try { pool.dispose(); } catch { /* Exact request outcome is retained. */ }
    }
  }
  return Object.freeze({ ledger, mainRealm,
    snapshot() { return Object.freeze({ disposed, mainHolds, pool: pool.snapshot(), pending: active.size,
      requests: Object.freeze([...active].map(r => Object.freeze({ slot: r.slot, phase: r.phase }))) }); },
    submit(source: Lease, input: readonly NativeInput[]) { return submit(source, input, false); },
    submitSha(source: Lease, input: readonly NativeInput[]) { return submit(source, input, true); },
    wait(handle: NativeRequest): Promise<void> { return auth(handle).done; },
    accept(handle: NativeRequest, consumer: Lease) {
      const r = auth(handle); if (r.phase !== 'RETURNED' || disposed || r.revoked) throw failure('STALE'); timely(r);
      const result = handoff.publish(r.ticket!, r, consumer, r.sha?.grant);
      r.phase = 'RETIRED'; r.plan = []; r.nonce = []; active.delete(r); return result;
    },
    release(handle: NativeRequest): void { const r = auth(handle); if (r.phase !== 'RETIRED') drop(r, failure('RELEASED'), true); },
    dispose,
  });
  function submit(source: Lease, input: readonly NativeInput[], sha: boolean): NativeRequest | Readonly<{ ok: false; code: 'BUSY' | 'BUDGET' }> {
      if (disposed) throw failure('CLOSED');
      if (active.size >= 2 || (sha && mainHolds >= 2)) return Object.freeze({ ok: false, code: 'BUSY' });
      if (sha && !globalThis.crypto?.subtle?.digest) throw failure('CRYPTO_UNAVAILABLE');
      dense(input); if (!input.length) invalid();
      const copied = Array.from(input, p => { if (!p) invalid(); role(p.role); return { ref: p.ref, role: p.role }; });
      const slot = pool.snapshot().slots.find(s => s.phase === 'FREE'); if (!slot) return Object.freeze({ ok: false, code: 'BUSY' });
      if (slot.incarnation >= 0xffffffff) { dispose(); throw failure('BUDGET'); }
      let resolve!: () => void, reject!: (error: unknown) => void;
      const done = new Promise<void>((a, b) => { resolve = a; reject = b; }); void done.catch(() => {});
      const r: RequestState = { slot: slot.ordinal, phase: 'STARTING', deadline: performance.now() + 120000,
        nonce: [...crypto.getRandomValues(new Uint32Array(4))], tuple: [slot.ordinal, slot.incarnation + 1, 1, 1, 1, 1, 1], plan: [], done, resolve, reject };
      if (sha) {
        const grant = nativeOutput.reserve(mainRealm, r); if ('code' in grant) return grant;
        r.sha = { grant, pending: false, token: true }; mainHolds++;
      }
      active.add(r); building.push(r);
      try {
        const lease = pool.acquire('compute', []);
        if ('code' in lease) { retire(r); return lease; }
        r.poolLease = lease;
      } catch (error) { retire(r); throw error; }
      finally { building.pop(); }
      try {
        if (r.terminal?.result.native.state !== 'NOT_STARTED' || disposed) throw failure('CLOSED');
        timely(r);
        r.ticket = handoff.prepare(source, copied.map(p => p.ref), mainRealm, domains[r.slot + 1], r);
        const p = handoff.packet(r.ticket, r);
        r.plan = p.bytes.map((n, i) => [i, copied[i].role, n]);
        const packet = encodeInputPacket(1, r.tuple, r.nonce, r.plan, p.buffers);
        const worker = r.worker!;
        const onMessage = (event: MessageEvent<unknown>) => {
          if (current.get(r.slot) !== r || r.worker !== worker) return; // Captured binding FIRST.
          try {
            if (r.cleanup && performance.now() >= r.cleanup.graceEnd) { stopWorker(r); return; }
            timely(r);
            const f = decodeInputPacket(event.data); // Schema BEFORE exact correlation.
            if (r.cleanup) {
              if (f.type !== 5 || !equal(f.tuple, r.cleanup.tuple) || !equal(f.nonce, r.nonce)) invalid();
              stopWorker(r); return;
            }
            if (!equal(f.tuple, r.tuple) || !equal(f.nonce, r.nonce) || !samePlan(f.plan, r.plan)) invalid();
            if (f.type === 2 && r.phase === 'IN_FLIGHT') { handoff.received(r.ticket!, r); r.phase = 'REMOTE'; }
            else if (f.type === 3 && r.phase === 'REMOTE') {
              handoff.returned(r.ticket!, r, f.buffers); r.returning = true;
              if (r.sha) startSha(r);
              stopWorker(r);
            } else invalid();
          } catch (error) { drop(r, error); }
        };
        const onError = () => { if (current.get(r.slot) === r && r.worker === worker) drop(r, failure('NATIVE_ERROR')); };
        r.remove = () => {
          const errors: unknown[] = [];
          for (const remove of [() => worker.removeEventListener('message', onMessage), () => worker.removeEventListener('error', onError), () => worker.removeEventListener('messageerror', onError)]) {
            try { remove(); }
            catch (error) { errors.push(error); } // Cleanup failure is not native failure.
          }
          return errors;
        };
        current.set(r.slot, r);
        worker.addEventListener('message', onMessage); worker.addEventListener('error', onError); worker.addEventListener('messageerror', onError);
        if (r.terminal?.result.native.state !== 'NOT_STARTED') throw failure('CLOSED');
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
        if ((error as { code?: string } | null)?.code === 'BUDGET') return Object.freeze({ ok: false, code: 'BUDGET' });
        throw error;
      }
    }
}
