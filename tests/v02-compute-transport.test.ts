import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDemoMesh, validateMesh, SliceIndex } from '../src/geometry';
import { runGeometryTask } from '../src/compute';

// Transport double ONLY: structured-clone/transfer is real; computation uses the real worker service.
class TransportWorker {
  static all: TransportWorker[] = [];
  static hold = false;
  service = import('../src/compute/service').then(({ createWorkerService }) => createWorkerService());
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onmessageerror: ((e: unknown) => void) | null = null;
  terminated = false;
  sent: unknown[] = [];
  constructor(readonly url: URL, readonly options: WorkerOptions) { TransportWorker.all.push(this); }
  postMessage(message: unknown, transfer: Transferable[]) {
    const copy = structuredClone(message, { transfer });
    this.sent.push(copy);
    if (TransportWorker.hold) return;
    void this.service.then(async service => {
      const response = await service.handle(copy as import('../src/compute/protocol').WorkerRequest);
      if (!this.terminated) this.onmessage?.({ data: structuredClone(response) } as MessageEvent);
    });
  }
  terminate() { this.terminated = true; }
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); TransportWorker.all = []; TransportWorker.hold = false; });

describe('worker transport double (not browser acceptance)', () => {
  it('bounds the entire module pool at two and does not silently cancel mutation jobs', async () => {
    vi.stubGlobal('window', {}); vi.stubGlobal('Worker', TransportWorker); TransportWorker.hold = true;
    const controllers = [new AbortController(), new AbortController()];
    const jobs = controllers.map(controller => runGeometryTask('zone', { mesh: createDemoMesh(), percent: 2, minZ: 0, maxZ: 300 }, { signal: controller.signal }).catch(e => e.name));
    await vi.waitFor(() => expect(TransportWorker.all).toHaveLength(2));
    try {
      await expect(runGeometryTask('topology', { mesh: createDemoMesh() })).rejects.toThrow('limit');
      expect(TransportWorker.all.every(w => !w.terminated)).toBe(true);
    } finally { controllers.forEach(c => c.abort()); }
    expect(await Promise.all(jobs)).toEqual(['AbortError', 'AbortError']);
    TransportWorker.hold = false;
    expect(await runGeometryTask('topology', { mesh: createDemoMesh() })).toHaveProperty('triangles');
  });
  it('checks both request ID and engine generation before resolving a task', async () => {
    vi.stubGlobal('window', {}); vi.stubGlobal('Worker', TransportWorker); TransportWorker.hold = true;
    const job = runGeometryTask('topology', { mesh: createDemoMesh() });
    let settled = false; void job.then(() => { settled = true; });
    await vi.waitFor(() => expect(TransportWorker.all[0]?.sent.length).toBe(1));
    const worker = TransportWorker.all[0], request = worker.sent[0] as { id: number; generation: number };
    worker.onmessage?.({ data: { ...request, id: request.id + 1, ok: true, result: 'wrong ID' } } as MessageEvent);
    worker.onmessage?.({ data: { ...request, generation: request.generation + 1, ok: true, result: 'wrong generation' } } as MessageEvent);
    await Promise.resolve(); expect(settled).toBe(false);
    const service = await worker.service;
    worker.onmessage?.({ data: await service.handle(request as never) } as MessageEvent);
    expect(await job).toHaveProperty('triangles');
  });
  it('transfers mutation results while retaining source RGB, UV, texture and attached caller buffers', async () => {
    vi.stubGlobal('window', {}); vi.stubGlobal('Worker', TransportWorker);
    const mesh = createDemoMesh(); mesh.source = 'imported';
    mesh.colors = new Float32Array(mesh.positions.length).fill(0.5);
    mesh.uvs = new Float32Array(mesh.positions.length / 3 * 2).fill(0.25);
    mesh.textureUrl = 'data:image/png;base64,AAAA';
    const before = mesh.positions.slice();
    const result = await runGeometryTask('zone', { mesh, percent: 2, minZ: 0, maxZ: 300 });
    expect(result.source).toBe('imported'); expect(result.textureUrl).toBe(mesh.textureUrl);
    expect(result.colors).toEqual(mesh.colors); expect(result.uvs).toEqual(mesh.uvs);
    expect(result.positions).not.toEqual(before); expect(mesh.positions).toEqual(before);
    expect(result.colors!.buffer).not.toBe(mesh.colors.buffer);
  });
  it.each(['onerror', 'onmessageerror'] as const)('surfaces %s without data-bearing diagnostics or a TypeScript retry', async eventName => {
    vi.stubGlobal('window', {}); vi.stubGlobal('Worker', TransportWorker); TransportWorker.hold = true;
    const job = runGeometryTask('topology', { mesh: createDemoMesh() });
    const rejected = expect(job).rejects.toThrow('Worker');
    await vi.waitFor(() => expect(TransportWorker.all[0]?.sent.length).toBe(1));
    const worker = TransportWorker.all[0];
    worker[eventName]?.({ message: 'PRIVATE-SCAN-NAME', preventDefault() {} });
    await rejected; expect(worker.terminated).toBe(true); expect(TransportWorker.all).toHaveLength(1);
  });
  it('times out a blocked in-flight request, terminating its worker', async () => {
    vi.stubGlobal('window', {}); vi.stubGlobal('Worker', TransportWorker); TransportWorker.hold = true;
    const { WorkerClient, WORKER_TIMEOUT_MS } = await import('../src/compute/client');
    vi.useFakeTimers(); const client = new WorkerClient();
    try {
      const request = client.request({ kind: 'slice', z: 100 });
      const rejected = expect(request).rejects.toThrow('czas');
      await vi.advanceTimersByTimeAsync(WORKER_TIMEOUT_MS + 1);
      await rejected; expect(TransportWorker.all[0].terminated).toBe(true);
    } finally { client.dispose(); }
  });
  it('rejects pending reads on dispose and terminates even during cached-index slicing', async () => {
    vi.stubGlobal('window', {}); vi.stubGlobal('Worker', TransportWorker);
    const { createWorkerSliceEngine } = await import('../src/compute');
    const engine = await createWorkerSliceEngine(createDemoMesh());
    TransportWorker.hold = true;
    const first = engine.slice(50).catch(e => e.name), last = engine.slice(60).catch(e => e.name);
    engine.dispose(); engine.dispose();
    expect(await first).toBe('AbortError'); expect(await last).toBe('AbortError');
    expect(TransportWorker.all[0].terminated).toBe(true);
  });

  it('bounds cold worker startup with a timeout that terminates and releases its slot', async () => {
    vi.stubGlobal('Worker', TransportWorker); vi.useFakeTimers();
    const { WorkerClient, WORKER_TIMEOUT_MS } = await import('../src/compute/client');
    const client = new WorkerClient();
    try {
      await vi.advanceTimersByTimeAsync(WORKER_TIMEOUT_MS + 1);
      expect(TransportWorker.all[0].terminated).toBe(true);
      await expect(client.request({ kind: 'slice', z: 0 })).rejects.toThrow();
    } finally { client.dispose(); }
  });

  it('routes the browser slice engine through Worker and never falls back after startup failure', async () => {
    vi.stubGlobal('window', {}); vi.stubGlobal('Worker', TransportWorker);
    const { createSliceEngine } = await import('../src/native');
    const dependencies = { native: false, invoke: async () => { throw Error('native must not be called'); } };
    const engine = await createSliceEngine(createDemoMesh(), dependencies);
    expect(engine.kind).toBe('worker');
    expect((await engine.slice(100)).valid).toBe(true);
    engine.dispose?.();
    vi.stubGlobal('Worker', class { constructor() { throw Error('private scan identifier'); } });
    await expect(createSliceEngine(createDemoMesh(), dependencies)).rejects.toThrow('Worker');
    vi.stubGlobal('Worker', undefined);
    await expect(createSliceEngine(createDemoMesh(), dependencies)).rejects.toThrow('Worker');
  });

  it('keeps only the newest pending slice, rejects superseded reads, and never uploads again', async () => {
    vi.stubGlobal('window', {}); vi.stubGlobal('Worker', TransportWorker);
    const { createWorkerSliceEngine } = await import('../src/compute');
    const engine = await createWorkerSliceEngine(createDemoMesh());
    try {
      const worker = TransportWorker.all[0];
      TransportWorker.hold = true;
      const old = engine.slice(50).catch(e => e.name);
      const reads = Array.from({ length: 30 }, (_, i) => engine.slice(60 + i).catch(e => e.name));
      await expect(Promise.all([old, ...reads.slice(0, -1)])).resolves.toEqual(Array(30).fill('AbortError'));
      expect(worker.sent).toHaveLength(2); // init + one active; only one pending lives on client
      const service = await worker.service;
      worker.onmessage?.({ data: await service.handle(worker.sent[1] as never) } as MessageEvent);
      await vi.waitFor(() => expect(worker.sent).toHaveLength(3));
      worker.onmessage?.({ data: await service.handle(worker.sent[2] as never) } as MessageEvent);
      expect(await reads.at(-1)).toHaveProperty('z', 89);
      expect((worker.sent as { kind: string }[]).filter(m => m.kind === 'init')).toHaveLength(1);
    } finally { engine.dispose(); }
  });
  it('uploads one private mesh, caches its slice index, and disposes the worker', async () => {
    vi.stubGlobal('window', {}); vi.stubGlobal('Worker', TransportWorker);
    const { createWorkerSliceEngine } = await import('../src/compute');
    const mesh = createDemoMesh();
    const reference = new SliceIndex(mesh);
    const engine = await createWorkerSliceEngine(mesh);
    try {
      expect(engine.kind).toBe('worker');
      mesh.positions.fill(0);
      for (const z of [50, 100, 150]) {
        const actual = await engine.slice(z), expected = reference.slice(z);
        expect({ ...actual, queryMs: 0 }).toEqual({ ...expected, queryMs: 0 });
      }
      const messages = TransportWorker.all[0].sent as { kind: string }[];
      expect(messages.map(m => m.kind)).toEqual(['init', 'slice', 'slice', 'slice']);
    } finally { engine.dispose(); }
    expect(TransportWorker.all[0].terminated).toBe(true);
    await expect(engine.slice(100)).rejects.toThrow();
  });

  it('omits appearance for read-only work and rejects malformed input before worker allocation', async () => {
    vi.stubGlobal('window', {}); vi.stubGlobal('Worker', TransportWorker);
    const mesh = createDemoMesh();
    mesh.colors = new Float32Array(mesh.positions.length).fill(0.5);
    mesh.uvs = new Float32Array(mesh.positions.length / 3 * 2);
    mesh.textureUrl = 'data:image/png;base64,AAAA';
    await runGeometryTask('topology', { mesh });
    const request = TransportWorker.all[0].sent[0] as { payload: { mesh: unknown } };
    expect(request.payload.mesh).not.toHaveProperty('colors');
    expect(request.payload.mesh).not.toHaveProperty('uvs');
    expect(request.payload.mesh).not.toHaveProperty('textureUrl');
    await expect(runGeometryTask('topology', { mesh: { ...mesh, indices: new Uint32Array() } })).rejects.toThrow();
    expect(TransportWorker.all).toHaveLength(1);
    expect(mesh.colors.byteLength).toBeGreaterThan(0);
  });
  it('yields and cancels cold large-array copying before upload without detaching caller arrays', async () => {
    vi.stubGlobal('window', {}); vi.stubGlobal('Worker', TransportWorker);
    const mesh = { name: 'copy budget', positions: new Float32Array(3_000_000), indices: new Uint32Array([0, 1, 2]) };
    const controller = new AbortController();
    const job = runGeometryTask('topology', { mesh }, { signal: controller.signal });
    const rejected = expect(job).rejects.toMatchObject({ name: 'AbortError' });
    setTimeout(() => controller.abort(), 0);
    await rejected;
    expect(TransportWorker.all.every(worker => worker.terminated && worker.sent.length === 0)).toBe(true);
    expect(mesh.positions.byteLength).toBe(12_000_000);
  });

  it('aborts a running job by terminating its worker and ignores a saved late response', async () => {
    vi.stubGlobal('window', {}); vi.stubGlobal('Worker', TransportWorker);
    TransportWorker.hold = true;
    const controller = new AbortController();
    const job = runGeometryTask('topology', { mesh: createDemoMesh() }, { signal: controller.signal });
    const rejected = expect(job).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(TransportWorker.all[0]?.sent.length).toBe(1));
    const worker = TransportWorker.all[0];
    const late = worker.onmessage!;
    controller.abort();
    // Race observation is bounded even before implementation supports cancellation.
    await Promise.race([rejected, new Promise((_, reject) => setTimeout(() => reject(Error('abort did not settle')), 200))]);
    expect(worker.terminated).toBe(true);
    const request = worker.sent[0] as { id: number; generation: number };
    late({ data: { ...request, ok: true, result: 'stale' } } as MessageEvent);
    TransportWorker.hold = false;
    expect(await runGeometryTask('topology', { mesh: createDemoMesh() })).toHaveProperty('triangles');
  });

  it('uses a module worker, transfers private copies, executes real topology, then terminates', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('Worker', TransportWorker);
    const mesh = createDemoMesh();
    const before = mesh.positions.slice();
    expect(await runGeometryTask('topology', { mesh })).toEqual(validateMesh(mesh));
    const worker = TransportWorker.all[0];
    expect(worker).toBeDefined();
    expect(worker.options).toEqual({ type: 'module' });
    expect(worker.url.pathname).toMatch(/worker\.ts$/);
    expect(worker.terminated).toBe(true);
    expect(mesh.positions).toEqual(before);
    expect(mesh.indices.byteLength).toBeGreaterThan(0);
  });
});
