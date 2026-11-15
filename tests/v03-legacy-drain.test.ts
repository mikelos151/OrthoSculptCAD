import { afterEach, expect, it, vi } from 'vitest';
import { runGeometryTask } from '../src/compute';
import { WorkerClient } from '../src/compute/client';
import * as broker from '../src/compute/legacyBroker';
class W { static all: W[] = []; onmessage: Worker['onmessage'] = null; onerror = null; onmessageerror = null; terminate = vi.fn(); postMessage = vi.fn<(value: unknown, transfer: Transferable[]) => void>(); constructor() { W.all.push(this); } }
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('keeps a cancelled yielded copy held after worker terminal until actual settle', async () => {
 vi.useFakeTimers(); vi.stubGlobal('Worker', W);
 const mesh = { name: 'large', positions: new Float32Array(262146), indices: new Uint32Array([0,1,2]) };
 const a = new AbortController(), b = new AbortController();
 const p = runGeometryTask('topology', { mesh }, { signal: a.signal }).catch(e => e);
 const q = runGeometryTask('topology', { mesh }, { signal: b.signal }).catch(e => e);
 a.abort(); b.abort();
 expect(() => broker.assertLegacyAdmission()).toThrow(/limit/);
 await vi.runAllTimersAsync(); await Promise.all([p,q]);
 expect(broker.legacySnapshot().mainHolds).toBe(0);
});
it('closes synchronously, waits for main settle, and rolls back without reviving retired handles', async () => {
 vi.stubGlobal('Worker', W);
 const old = new WorkerClient();
 const settle = broker.beginLegacyMain();
 const drain = broker.drainLegacy();
 expect(broker.legacySnapshot()).toMatchObject({ mode: 'CLOSING', occupied: 0, mainHolds: 1 });
 expect(() => new WorkerClient()).toThrow();
 let done = false; void drain.then(() => { done = true; });
 await Promise.resolve(); expect(done).toBe(false);
 settle(); const closing = await drain;
 expect(() => new WorkerClient()).toThrow();
 closing.rollback(); const next = new WorkerClient(); old.dispose();
 expect(broker.legacySnapshot().occupied).toBe(1); next.dispose(); closing.rollback();
});
it('does not reset acquire deadline at first request, even if timer dispatch is delayed', async () => {
 vi.useFakeTimers(); vi.stubGlobal('Worker', W);
 const now = vi.spyOn(performance, 'now'); now.mockReturnValue(0);
 const client = new WorkerClient(); now.mockReturnValue(120001);
 const pending = client.request({ kind: 'slice', z: 0 }).catch(e => e);
 const sends = W.all.at(-1)!.postMessage.mock.calls.length; client.dispose(); await pending; now.mockRestore();
 expect(sends).toBe(0);
});
it('drain timeout preserves the hold and reopens only after actual settle', async () => {
 vi.useFakeTimers();
 const settle = broker.beginLegacyMain();
 const drain = broker.drainLegacy().catch(e => e);
 await vi.advanceTimersByTimeAsync(120000); expect(await drain).toBeInstanceOf(Error);
 expect(broker.legacySnapshot()).toMatchObject({ mode: 'CLOSING', mainHolds: 1 });
 settle(); expect(broker.legacySnapshot().mode).toBe('LEGACY');
});
it('idle initialized client has no lifetime timeout and receives a fresh read deadline', async () => {
 vi.useFakeTimers(); vi.stubGlobal('Worker', W);
 const client = new WorkerClient();
 const init = client.request({ kind: 'slice', z: 0 });
 const w = W.all.at(-1)!; const command = w.postMessage.mock.calls[0][0] as unknown as { id: number; generation: number };
 w.onmessage?.call(w as unknown as Worker, { data: { ...command, ok: true, result: {} } } as MessageEvent); await init;
 await vi.advanceTimersByTimeAsync(240000);
 expect(w.terminate).not.toHaveBeenCalled();
 const read = client.request({ kind: 'slice', z: 1 }).catch(e => e);
 expect(w.postMessage).toHaveBeenCalledTimes(2); client.dispose(); await read;
});
it('constructor failure leaves no binding or main hold', () => {
 vi.stubGlobal('Worker', class { constructor() { throw new Error('construction'); } });
 expect(() => new WorkerClient()).toThrow(/uruchomić/);
 expect(broker.legacySnapshot()).toMatchObject({ occupied: 0, mainHolds: 0 });
});
