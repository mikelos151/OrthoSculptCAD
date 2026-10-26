import { afterEach, expect, it, vi } from 'vitest';
import { createWorkerService } from '../src/compute/service';
import { ZONE_NO_CHANGE_MESSAGE } from '../src/compute/protocol';
import { runGeometryTask } from '../src/compute';
import type { MeshData } from '../src/types';
import type { WorkerRequest } from '../src/compute/protocol';

// Transport double only: actual structured clone, service and geometry execute.
class ServiceTransport {
  static all: ServiceTransport[] = [];
  service = createWorkerService();
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessageerror: ((event: unknown) => void) | null = null;
  terminated = false;
  constructor() { ServiceTransport.all.push(this); }
  postMessage(message: WorkerRequest, transfer: Transferable[]) {
    const copied = structuredClone(message, { transfer });
    void this.service.handle(copied).then(response => {
      if (!this.terminated) this.onmessage?.({ data: structuredClone(response) } as MessageEvent);
    });
  }
  terminate() { this.terminated = true; }
}
class InjectedTransport extends ServiceTransport {
  static reply: { ok: unknown; code?: unknown; error: string };
  postMessage(message: WorkerRequest, transfer: Transferable[]) {
    const copied = structuredClone(message, { transfer });
    queueMicrotask(() => {
      if (!this.terminated) this.onmessage?.({ data: structuredClone({ id: copied.id, generation: copied.generation, ...InjectedTransport.reply }) } as MessageEvent);
    });
  }
}
function mesh(): MeshData {
  return { positions: new Float32Array([0, 0, 0, 20, 0, 0, 0, 20, 100, 0, 0, 100]), indices: new Uint32Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 2, 0, 3]), name: 'SYNTHETIC diagnostics', source: 'synthetic' };
}
afterEach(() => { vi.unstubAllGlobals(); ServiceTransport.all = []; });

it.each([
  { percent: 0, minZ: 0, maxZ: 100 },
  { percent: -10, minZ: 25, maxZ: 75 },
])('preserves the explicit no-change explanation through the actual service/client seam: %j', async parameters => {
  vi.stubGlobal('window', {});
  vi.stubGlobal('Worker', ServiceTransport);
  const source = mesh(), before = source.positions.slice();
  await expect(runGeometryTask('zone', { mesh: source, ...parameters }))
    .rejects.toMatchObject({ message: ZONE_NO_CHANGE_MESSAGE });
  expect(source.positions).toEqual(before);
  expect(source.positions.byteLength).toBeGreaterThan(0);
  expect(ServiceTransport.all).toHaveLength(1);
  expect(ServiceTransport.all[0].terminated).toBe(true);
});

it.each([undefined, null, ['ZONE_NO_CHANGE'], new String('ZONE_NO_CHANGE'), 'constructor', '__proto__', 1, {}])('does not coerce an unknown diagnostic code or display Worker exception text: %j', async code => {
  vi.stubGlobal('window', {}); vi.stubGlobal('Worker', InjectedTransport);
  InjectedTransport.reply = { ok: false, code, error: 'PRIVATE-SCAN-PLACEHOLDER' };
  await expect(runGeometryTask('zone', { mesh: mesh(), percent: 0, minZ: 0, maxZ: 100 }))
    .rejects.toMatchObject({ message: 'Nie udało się wykonać obliczenia geometrii.' });
});

it('does not authorize a zone diagnostic for a different operation', async () => {
  vi.stubGlobal('window', {}); vi.stubGlobal('Worker', InjectedTransport);
  InjectedTransport.reply = { ok: false, code: 'ZONE_NO_CHANGE', error: 'PRIVATE-SCAN-PLACEHOLDER' };
  await expect(runGeometryTask('topology', { mesh: mesh() }))
    .rejects.toMatchObject({ message: 'Nie udało się wykonać obliczenia geometrii.' });
});

it('keeps arbitrary service exception details private', async () => {
  const source = mesh();
  Object.defineProperty(source, 'positions', { get() { throw new Error('PRIVATE-SCAN-PLACEHOLDER'); } });
  const result = await createWorkerService().handle({ id: 1, generation: 1, kind: 'task', op: 'zone', payload: { mesh: source, percent: 0, minZ: 0, maxZ: 100 } });
  expect(result).toEqual({ id: 1, generation: 1, ok: false, error: 'Nie udało się wykonać obliczenia geometrii.' });
});

it('does not accept a malformed ok flag as an authorized public diagnostic', async () => {
  vi.stubGlobal('window', {}); vi.stubGlobal('Worker', InjectedTransport);
  InjectedTransport.reply = { ok: 'false', code: 'ZONE_NO_CHANGE', error: 'PRIVATE-SCAN-PLACEHOLDER' };
  await expect(runGeometryTask('zone', { mesh: mesh(), percent: 0, minZ: 0, maxZ: 100 }))
    .rejects.toMatchObject({ message: 'Nie udało się wykonać obliczenia geometrii.' });
});
