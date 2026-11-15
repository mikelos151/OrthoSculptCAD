import { afterEach, expect, it, vi } from 'vitest';
import { WorkerClient } from '../src/compute/client';
import { runDisplayTask } from '../src/hooks/runDisplayTask';
const mesh = { name: 'fixture', positions: new Float32Array([0,0,0,1,0,0,0,1,0]), indices: new Uint32Array([0,1,2]) };
class NativeDouble {
 static all: NativeDouble[] = [];
 onmessage: Worker['onmessage'] = null; onerror: Worker['onerror'] = null; onmessageerror: Worker['onmessageerror'] = null;
 terminate = vi.fn(); postMessage = vi.fn();
 constructor() { NativeDouble.all.push(this); if (NativeDouble.all.length === 3 && !NativeDouble.all[0].terminate.mock.calls.length) throw new Error('Unexpected third construction'); }
}
afterEach(() => { vi.unstubAllGlobals(); NativeDouble.all = []; });
it('rejects a third cross-client acquisition before display clone or construction and reuses a released slot', async () => {
 vi.stubGlobal('Worker', NativeDouble);
 const first = new WorkerClient(), second = new WorkerClient();
 const clone = vi.spyOn(globalThis, 'structuredClone');
 const task = { kind: 'stroke' as const, mesh, points: [], mode: 'smooth' as const, radius: 1, strength: 1 };
 try {
  await expect(runDisplayTask(task)).rejects.toThrow(/limit|BUSY/);
  expect(clone).not.toHaveBeenCalled(); expect(NativeDouble.all).toHaveLength(2);
  first.dispose();
  const controller = new AbortController();
  const display = runDisplayTask(task, { signal: controller.signal });
  expect(NativeDouble.all).toHaveLength(3);
  const late = NativeDouble.all[2].onmessage;
  controller.abort();
  await expect(display).rejects.toMatchObject({ name: 'AbortError' });
  late?.call(NativeDouble.all[2] as unknown as Worker, { data: { ok: true, result: { kind: 'stroke', mesh, dabCount: 0 } } } as MessageEvent);
  const replacement = new WorkerClient(); replacement.dispose();
 } finally { first.dispose(); second.dispose(); clone.mockRestore(); }
});
