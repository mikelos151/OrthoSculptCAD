import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { chromium, type Browser, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { runGeometryTask } from '../src/compute';
import { copyMeshForWorker, copyParameters } from '../src/compute/copy';
import { WorkerClient } from '../src/compute/client';
import type { ComputePayloads } from '../src/compute/types';
import type { MeshData } from '../src/types';

function triangle(): MeshData {
  return { name: 'synthetic transport regression', source: 'synthetic', positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]) };
}
const attacks = [
  ['measure.interval', 'measure', (mesh: MeshData) => ({ mesh, interval: { uiBuffer: mesh.positions } })],
  ['zone.percent', 'zone', (mesh: MeshData) => ({ mesh, percent: { uiBuffer: mesh.positions }, minZ: 0, maxZ: 1 })],
  ['calibrate.tapes[0].circumference', 'calibrate', (mesh: MeshData) => ({ mesh, tapes: [{ z: 0, circumference: { uiBuffer: mesh.positions } }] })],
  ['analyze.options.maxPairTests', 'analyze', (mesh: MeshData) => ({ mesh, options: { maxPairTests: { uiBuffer: mesh.positions } } })],
  ['shell.options.thickness', 'shell', (mesh: MeshData) => ({ mesh, options: { thickness: { uiBuffer: mesh.positions }, flareAngle: 0, flareRadius: 0 } })],
] as const;

// Transport double only. It genuinely transfers via structuredClone, but is NOT Chromium proof.
class TransferDouble {
  static created = 0;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror = null;
  onmessageerror = null;
  constructor() { TransferDouble.created++; }
  postMessage(message: unknown, transfer: Transferable[]) {
    const request = structuredClone(message, { transfer }) as { id: number; generation: number };
    queueMicrotask(() => this.onmessage?.({ data: { ...request, ok: false, error: 'invalid fixture' } } as MessageEvent));
  }
  terminate() {}
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); TransferDouble.created = 0; });

describe('malformed geometry parameters: transport-double regressions', () => {
  it('transfers only the explicit owned mesh copies, never arbitrary parameter buffers', async () => {
    vi.stubGlobal('Worker', TransferDouble);
    const caller = triangle(), before = caller.positions.slice(), owned = await copyMeshForWorker(caller, false);
    const client = new WorkerClient();
    try {
      await expect(client.request({ kind: 'task', op: 'measure', payload: { mesh: owned, interval: { uiBuffer: caller.positions } } } as never)).rejects.toThrow();
      expect(caller.positions.byteLength).toBe(36); expect(caller.positions).toEqual(before);
      expect(owned.positions.byteLength).toBe(0); // The real structuredClone transfer happened.
    } finally { client.dispose(); }
  });
  it('refuses a directly supplied non-owned mesh at the transport boundary', async () => {
    vi.stubGlobal('Worker', TransferDouble);
    const mesh = triangle(), before = mesh.positions.slice(), client = new WorkerClient();
    try {
      await expect(client.request({ kind: 'init', mesh })).rejects.toThrow();
      expect(mesh.positions.byteLength).toBe(36); expect(mesh.positions).toEqual(before);
    } finally { client.dispose(); }
  });
  it('snapshots numeric array entries without executing caller-supplied map methods', () => {
    const mesh = triangle(), heights = [0, 1];
    const map = vi.fn(() => [{ uiBuffer: mesh.positions }]);
    Object.defineProperty(heights, 'map', { value: map });
    expect(copyParameters('measureAt', { mesh, heights })).toEqual({ heights: [0, 1] });
    expect(map).not.toHaveBeenCalled();
  });
  it('keeps the bounded array length fixed even if a caller getter grows it during snapshotting', () => {
    const mesh = triangle(), heights = [0];
    Object.defineProperty(heights, 0, { get() { heights.push(...Array(2500).fill(1)); return 0; } });
    expect(copyParameters('measureAt', { mesh, heights })).toEqual({ heights: [0] });
  });
  it('validates every scalar field and static range at the pre-copy boundary', () => {
    const mesh = triangle();
    const cases: [keyof ComputePayloads, object][] = [
      ...[0, -1, NaN, Infinity, '5', null].map(interval => ['measure', { mesh, interval }] as [keyof ComputePayloads, object]),
      ...[-1, 0.5, 10_000_001, null, false].map(maxPairTests => ['analyze', { mesh, options: { maxPairTests } }] as [keyof ComputePayloads, object]),
      ...[0, 10_001, 1.5, {}, null].map(maxIntersections => ['analyze', { mesh, options: { maxIntersections } }] as [keyof ComputePayloads, object]),
      ['analyze', { mesh, options: null }],
      ...[-51, 51, NaN, '2'].map(percent => ['zone', { mesh, percent, minZ: 0, maxZ: 1 }] as [keyof ComputePayloads, object]),
      ['zone', { mesh, percent: 2, minZ: {}, maxZ: 1 }], ['zone', { mesh, percent: 2, minZ: 1, maxZ: 0 }], ['zone', { mesh, percent: 2, minZ: 0, maxZ: Infinity }],
      ['calibrate', { mesh, tapes: [{ z: NaN, circumference: 1 }] }], ['calibrate', { mesh, tapes: [{ z: 0, circumference: 0 }] }],
      ['calibrate', { mesh, tapes: [{ z: 0, circumference: 1 }, { z: 0, circumference: 2 }] }],
      ...[0.4, 21, {}, null].map(thickness => ['shell', { mesh, options: { thickness, flareAngle: 0, flareRadius: 0 } }] as [keyof ComputePayloads, object]),
      ['shell', { mesh, options: { thickness: 3, flareAngle: 31, flareRadius: 1 } }],
      ['shell', { mesh, options: { thickness: 3, flareAngle: 1, flareRadius: 0 } }],
      ['shell', { mesh, options: { thickness: 3, flareAngle: 0, flareRadius: -1 } }],
      ['shell', { mesh, options: null }],
      ['register', { mesh, side: 'left', flexionDegrees: 0, landmarks: [[0, 0, 0], [0, 1, 0], [Infinity, 0, 0]] }],
    ];
    for (const [op, payload] of cases) expect(() => copyParameters(op, payload as never), `${op}: ${JSON.stringify(payload)}`).toThrow();
  });
  it.each(attacks)('rejects %s before worker creation/copy without detaching caller buffers', async (_, op, payload) => {
    vi.stubGlobal('window', {}); vi.stubGlobal('Worker', TransferDouble);
    const mesh = triangle(), positions = mesh.positions.slice(), indices = mesh.indices.slice();
    const copy = vi.spyOn(Float32Array.prototype, 'set');
    await expect(runGeometryTask(op, payload(mesh) as never)).rejects.toThrow();
    expect(mesh.positions.byteLength).toBe(36);
    expect(mesh.positions).toEqual(positions); expect(mesh.indices).toEqual(indices);
    expect(TransferDouble.created).toBe(0); expect(copy).not.toHaveBeenCalled();
  });
});

describe.skipIf(process.env.ORTHO_REAL_WORKER !== '1')('malformed geometry parameters: actual Chromium', () => {
  let server: ViteDevServer, browser: Browser, page: Page;
  const errors: string[] = [];
  beforeAll(async () => {
    server = await createServer({ configFile: false, root: process.cwd(), logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
    await server.listen(); browser = await chromium.launch({ headless: true }); page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${server.resolvedUrls!.local[0]}tests/fixtures/web/index.html`);
  }, 30_000);
  afterAll(async () => { await browser?.close(); await server?.close(); });

  it('rejects all five original buffer injection paths before Worker startup and keeps exact caller bytes', async () => {
    const result = await page.evaluate(async () => {
      const { runGeometryTask } = await new Function('p', 'return import(p)')('/src/compute/index.ts');
      const OriginalWorker = window.Worker;
      let created = 0;
      window.Worker = class extends OriginalWorker {
        constructor(url: string | URL, options?: WorkerOptions) { super(url, options); created++; }
      };
      const results = [];
      try {
        for (const op of ['measure', 'zone', 'calibrate', 'analyze', 'shell']) {
          const mesh = { name: 'synthetic hostile parameter fixture', source: 'synthetic', positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]) };
          const before = Array.from(new Uint8Array(mesh.positions.buffer)), indexBefore = Array.from(mesh.indices);
          const injected = { uiBuffer: mesh.positions };
          const parameters: Record<string, object> = {
            measure: { interval: injected }, zone: { percent: injected, minZ: 0, maxZ: 1 },
            calibrate: { tapes: [{ z: 0, circumference: injected }] }, analyze: { options: { maxPairTests: injected } },
            shell: { options: { thickness: injected, flareAngle: 0, flareRadius: 0 } },
          };
          let rejected = false;
          try { await runGeometryTask(op, { mesh, ...parameters[op] }); } catch { rejected = true; }
          const attached = mesh.positions.byteLength === 36 && mesh.indices.byteLength === 12;
          const unchanged = attached && JSON.stringify(before) === JSON.stringify(Array.from(new Uint8Array(mesh.positions.buffer))) && JSON.stringify(indexBefore) === JSON.stringify(Array.from(mesh.indices));
          results.push({ op, rejected, attached, unchanged });
        }
      } finally { window.Worker = OriginalWorker; }
      return { created, results, userAgent: navigator.userAgent };
    });
    process.stdout.write(`REAL_CHROMIUM_MALFORMED_PARAMETERS ${JSON.stringify(result)}\n`);
    expect(result.results).toHaveLength(5);
    for (const row of result.results) expect(row, row.op).toMatchObject({ rejected: true, attached: true, unchanged: true });
    expect(result.created).toBe(0); expect(errors).toEqual([]);
  }, 30_000);
});
