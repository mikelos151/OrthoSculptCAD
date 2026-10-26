import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

// Opt-in REAL Chromium acceptance. Not a Worker mock and not the default Node adapter.
describe.skipIf(process.env.ORTHO_REAL_WORKER !== '1')('real Chromium module Workers', () => {
  let server: ViteDevServer, browser: Browser, page: Page;
  const errors: string[] = [];
  const workerUrls: string[] = [];
  beforeAll(async () => {
    server = await createServer({ configFile: false, root: process.cwd(), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false } });
    await server.listen();
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('worker', worker => workerUrls.push(worker.url()));
    await page.goto(`${server.resolvedUrls!.local[0]}tests/fixtures/web/index.html`);
  }, 30_000);
  afterAll(async () => { await browser?.close(); await server?.close(); });

  it('executes every operation in actual module workers and reuses a real cached slicing index', async () => {
    const initialWorkerCount = workerUrls.length;
    const result = await page.evaluate(async () => {
      const computePath = '/src/compute/index.ts', geometryPath = '/src/geometry/index.ts', shellPath = '/src/manufacturing/shell.ts';
      // Test-only loader avoids Vitest rewriting imports inside serialized page.evaluate.
      const browserImport = new Function('path', 'return import(path)');
      const { runGeometryTask, createWorkerSliceEngine } = await browserImport(computePath);
      const geometry = await browserImport(geometryPath), { buildShell } = await browserImport(shellPath);
      const mesh = geometry.alignPCA(geometry.repairMesh(geometry.createDemoMesh()).mesh);
      mesh.source = 'synthetic';
      mesh.colors = new Float32Array(mesh.positions.length).fill(0.5);
      mesh.uvs = new Float32Array(mesh.positions.length / 3 * 2).fill(0.25);
      const before = mesh.positions.slice();
      const operations: string[] = [];
      const checks: boolean[] = [];
      const options = { thickness: 3, flareAngle: 0, flareRadius: 0 };
      const landmarks = [[0, 30, 100], [30, 0, 100], [0, 0, 0]];
      const circumference = new geometry.SliceIndex(mesh).slice(100).perimeter;
      for (const [op, payload, reference] of [
        ['analyze', { mesh, options: { maxPairTests: 20 } }, () => geometry.auditMesh(mesh, { maxPairTests: 20 })],
        ['topology', { mesh }, () => geometry.validateMesh(mesh)],
        ['measure', { mesh, interval: 50 }, () => geometry.measureMesh(mesh, 50)],
        ['repair', { mesh }, () => { const r = geometry.repairMesh(mesh); return { mesh: r.mesh, report: { ...r.report, warnings: [...new Set([...r.report.warnings, ...r.warnings])] } }; }],
        ['orient', { mesh }, () => geometry.orientMesh(mesh)],
        ['pca', { mesh }, () => geometry.alignPCA(mesh)],
        ['register', { mesh, landmarks, flexionDegrees: 0, side: 'right' }, () => geometry.registerLandmarksDetailed(mesh, { anterior: landmarks[0], lateral: landmarks[1], distal: landmarks[2] }, 0, 'right')],
        ['calibrate', { mesh, tapes: [{ z: 100, circumference }] }, () => geometry.calibrateMesh(mesh, [{ z: 100, circumference }])],
        ['zone', { mesh, percent: 2, minZ: 0, maxZ: 300 }, () => geometry.scaleZone(mesh, 2, 0, 300)],
        ['shell', { mesh, options }, () => buildShell(mesh, options)],
      ] as const) {
        const actual = await runGeometryTask(op, payload), expected = reference();
        if (op === 'analyze') actual.elapsedMs = expected.elapsedMs = 0;
        checks.push(JSON.stringify(actual) === JSON.stringify(expected)); operations.push(op);
      }
      const exact = await runGeometryTask('measureAt', { mesh, heights: [150, 50, 100, 50] });
      checks.push(JSON.stringify(exact.map((r: { z: number }) => r.z)) === '[50,100,150]'); operations.push('measureAt');
      const engine = await createWorkerSliceEngine(mesh);
      const index = new geometry.SliceIndex(mesh), sliceChecks: boolean[] = [];
      try {
        for (const z of [50, 100, 150]) {
          const actual = await engine.slice(z), expected = index.slice(z);
          sliceChecks.push(JSON.stringify({ ...actual, queryMs: 0 }) === JSON.stringify({ ...expected, queryMs: 0 }));
        }
      } finally { engine.dispose(); }
      return { operations, checks, sliceChecks, kind: engine.kind, attached: mesh.positions.byteLength > 0 && mesh.indices.byteLength > 0 && mesh.colors.byteLength > 0 && mesh.uvs.byteLength > 0,
        unchanged: before.every((x: number, i: number) => x === mesh.positions[i]) };
    });
    expect(result.operations).toHaveLength(11);
    expect(result.checks.every(Boolean)).toBe(true); expect(result.sliceChecks.every(Boolean)).toBe(true);
    expect(result.kind).toBe('worker'); expect(result.attached).toBe(true); expect(result.unchanged).toBe(true);
    expect(workerUrls.length - initialWorkerCount).toBe(12);
    expect(workerUrls.every(url => url.includes('/src/compute/worker.ts'))).toBe(true);
    expect(errors).toEqual([]);
    process.stdout.write(`REAL_WORKER_OPERATIONS ${JSON.stringify(result)}\n`);
  }, 60_000);

  it('terminates an actual busy worker, preserves UI arrays and keeps the main-thread heartbeat alive', async () => {
    const result = await page.evaluate(async () => {
      const path = '/src/compute/index.ts';
      const { runGeometryTask } = await new Function('path', 'return import(path)')(path);
      const OriginalWorker = window.Worker;
      let posted = false, terminated = 0, created = 0;
      const controller = new AbortController();
      window.Worker = class extends OriginalWorker {
        constructor(url: string | URL, options?: WorkerOptions) { super(url, options); created++; }
        override postMessage(message: unknown, transferOrOptions?: Transferable[] | StructuredSerializeOptions) {
          if (Array.isArray(transferOrOptions)) super.postMessage(message, transferOrOptions);
          else super.postMessage(message, transferOrOptions);
          posted = true;
          setTimeout(() => controller.abort(), 20);
        }
        override terminate() { terminated++; super.terminate(); }
      };
      const triangles = 200_000, positions = new Float32Array(triangles * 9), indices = new Uint32Array(triangles * 3);
      for (let t = 0; t < triangles; t++) {
        const at = t * 9, z = t / 1000;
        positions.set([0, 0, z, 1, 0, z, 0, 1, z], at);
        indices.set([t * 3, t * 3 + 1, t * 3 + 2], t * 3);
      }
      let ticks = 0; const heartbeat = setInterval(() => ticks++, 5), started = performance.now();
      let error = '';
      try { await runGeometryTask('analyze', { mesh: { positions, indices, name: 'synthetic cancellation fixture', source: 'synthetic' }, options: { maxPairTests: 1_000_000 } }, { signal: controller.signal }); }
      catch (e) { error = (e as Error).name; }
      finally { clearInterval(heartbeat); window.Worker = OriginalWorker; }
      return { error, posted, created, terminated, ticks, elapsedMs: performance.now() - started, positionBytes: positions.byteLength, indexBytes: indices.byteLength, triangles };
    });
    expect(result.error).toBe('AbortError'); expect(result.posted).toBe(true);
    expect(result.created).toBe(1); expect(result.terminated).toBe(1); expect(result.ticks).toBeGreaterThan(0);
    expect(result.positionBytes).toBeGreaterThan(0); expect(result.indexBytes).toBeGreaterThan(0);
    expect(errors).toEqual([]);
    process.stdout.write(`REAL_WORKER_CANCEL_HEARTBEAT ${JSON.stringify(result)}\n`);
  }, 30_000);
});
