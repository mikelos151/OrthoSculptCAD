// Pure helpers are shared by Vitest and the real Chromium harness. No mesh is serialized.
export const DEFAULT_CASES = [
  { id: '1k', rings: 16, sides: 64 },
  { id: '10k', rings: 100, sides: 100 },
  { id: '50k', rings: 250, sides: 200 },
  { id: '100k', rings: 500, sides: 200 },
];
export function summarizeSamples(samplesMs) {
  if (!Array.isArray(samplesMs) || samplesMs.some(n => !Number.isFinite(n) || n < 0)) throw new Error('Invalid duration samples');
  const sorted = [...samplesMs].sort((a, b) => a - b), n = sorted.length;
  return { count: n, samplesMs: [...samplesMs], medianMs: n ? (sorted[(n - 1) >> 1] + sorted[n >> 1]) / 2 : null,
    p95Ms: n ? sorted[Math.ceil(n * 0.95) - 1] : null };
}

export function assessResponse(response, reference, expectedZ, kind = 'slice') {
  const keys = ['perimeter', 'ap', 'ml', 'area'];
  const metrics = Object.fromEntries(keys.map(k => [k, response?.[kind === 'measureAt' && k === 'perimeter' ? 'circumference' : k]]));
  const finiteMetrics = keys.every(k => Number.isFinite(metrics[k]) && metrics[k] > 0);
  const contourValid = kind === 'measureAt' || (response?.loops?.length === 1 && response.loops[0].closed === true);
  const valid = response?.valid === true && response.z === expectedZ && finiteMetrics && contourValid;
  // Invalid numbers become explicit nulls, never plausible zero errors or accidental JSON NaN conversion.
  return { status: valid ? 'ok' : 'invalid', reportedValid: response?.valid === true, z: Number.isFinite(response?.z) ? response.z : null,
    metrics: Object.fromEntries(keys.map(k => [k, Number.isFinite(metrics[k]) ? metrics[k] : null])),
    absoluteErrors: valid ? Object.fromEntries(keys.map(k => [k, Math.abs(metrics[k] - reference[k])])) : null,
    warnings: Array.isArray(response?.warnings) ? response.warnings.map(String) : [],
    loopCount: Array.isArray(response?.loops) ? response.loops.length : null,
    workerQueryMs: Number.isFinite(response?.queryMs) ? response.queryMs : null };
}

export async function boundedOperation(operation, timeoutMs, externalSignal) {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw new Error('Invalid operation timeout');
  if (externalSignal?.aborted) throw new DOMException('Benchmark cancelled', 'AbortError');
  const controller = new AbortController();
  let timer, onAbort;
  const cancelled = new Promise((_, reject) => {
    onAbort = () => { reject(new DOMException('Benchmark cancelled', 'AbortError')); controller.abort(); };
    externalSignal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => {
      // Settle timeout BEFORE dispatching abort, so native AbortError cannot conceal the deadline.
      reject(new DOMException('Benchmark operation deadline exceeded', 'TimeoutError')); controller.abort();
    }, timeoutMs);
  });
  try { return await Promise.race([Promise.resolve().then(() => operation(controller.signal)), cancelled]); }
  finally { clearTimeout(timer); externalSignal?.removeEventListener('abort', onAbort); }
}

export function parseOptions(args) {
  const smoke = args.includes('--smoke');
  const config = { port: 4182, headless: !args.includes('--headed'), coldRuns: smoke ? 1 : 3, warmSamples: smoke ? 3 : 10,
    warmups: smoke ? 1 : 2, timeoutMs: 30000, caseTimeoutMs: 120000, totalTimeoutMs: 300000,
    maxVertices: 150002, maxInputBytes: 32 * 1024 ** 2, maxEstimatedWorkingBytes: 256 * 1024 ** 2,
    mode: smoke ? 'correctness-smoke' : 'serial-performance', cases: smoke ? [DEFAULT_CASES[0]] : [...DEFAULT_CASES], out: null };
  const numeric = {
    port: ['port', 4182, 4199, 1], 'cold-runs': ['coldRuns', 1, 10, 1], 'warm-samples': ['warmSamples', 1, 100, 1],
    warmups: ['warmups', 0, 20, 1], 'timeout-ms': ['timeoutMs', 1, 120000, 1], 'case-timeout-ms': ['caseTimeoutMs', 100, 300000, 1],
    'total-timeout-ms': ['totalTimeoutMs', 1000, 900000, 1], 'max-vertices': ['maxVertices', 3, 500002, 1],
    'max-input-mib': ['maxInputBytes', 1, 64, 1024 ** 2], 'max-working-mib': ['maxEstimatedWorkingBytes', 1, 1024, 1024 ** 2],
  };
  for (const arg of args) {
    if (['--smoke', '--headed', '--budget-control'].includes(arg)) continue;
    const match = /^--([a-z-]+)=(.+)$/.exec(arg);
    if (!match) throw new Error(`Unknown or malformed option: ${arg}`);
    const [, key, raw] = match;
    if (key === 'out') { config.out = raw; continue; }
    if (key === 'cases') {
      config.cases = raw.split(',').map(id => {
        const preset = DEFAULT_CASES.find(c => c.id === id);
        if (preset) return preset;
        const dimensions = /^(\d+)x(\d+)$/.exec(id);
        if (!dimensions) throw new Error(`Unknown case: ${id}`);
        const c = { id, rings: Number(dimensions[1]), sides: Number(dimensions[2]) };
        planCase(c); return c;
      });
      if (new Set(config.cases.map(c => c.id)).size !== config.cases.length || config.cases.length > 8) throw new Error('Duplicate or excessive cases');
      continue;
    }
    const rule = numeric[key];
    if (!rule || !/^\d+$/.test(raw)) throw new Error(`Unknown or invalid numeric option: ${key}`);
    const n = Number(raw), [field, min, max, scale] = rule;
    if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`Option out of bounds: ${key}`);
    config[field] = n * scale;
  }
  if (args.includes('--budget-control')) config.cases.push({ id: '400k-budget-control', rings: 2000, sides: 200 });
  return config;
}

export function planCase({ rings, sides }, limits = {}) {
  if (!Number.isSafeInteger(rings) || rings < 2 || !Number.isSafeInteger(sides) || sides < 3 ||
      !Number.isSafeInteger(rings * sides)) throw new Error('Invalid cylinder dimensions');
  const vertices = rings * sides + 2, triangles = 2 * rings * sides;
  const inputBytes = vertices * 24 + triangles * 12; // positions + RGB + Uint32 indices
  // Admission heuristic only. This is NOT observed browser heap/RSS or a no-OOM guarantee.
  const estimatedWorkingBytes = inputBytes * 4 + vertices * 192 + triangles * 512;
  const { maxVertices = 150_002, maxInputBytes = 32 * 1024 ** 2, maxEstimatedWorkingBytes = 256 * 1024 ** 2 } = limits;
  for (const n of [maxVertices, maxInputBytes, maxEstimatedWorkingBytes]) if (!Number.isSafeInteger(n) || n < 1) throw new Error('Invalid resource budget');
  const reasons = [];
  if (vertices > Math.min(maxVertices, 500_002)) reasons.push('vertex-budget');
  if (inputBytes > Math.min(maxInputBytes, 64 * 1024 ** 2)) reasons.push('input-byte-budget');
  if (estimatedWorkingBytes > Math.min(maxEstimatedWorkingBytes, 1024 ** 3)) reasons.push('estimated-working-budget');
  return { vertices, triangles, inputBytes, estimatedWorkingBytes, admitted: reasons.length === 0, reasons };
}
export function createCylinder({ rings, sides, radius = 40, height = 300, source = 'synthetic' }) {
  if (source !== 'synthetic') throw new Error('Generated fixtures must remain synthetic');
  if (!Number.isSafeInteger(rings) || rings < 2 || !Number.isSafeInteger(sides) || sides < 3 ||
      rings * sides + 2 > 500_002 || !Number.isFinite(radius) || radius <= 0 || radius > 1000 ||
      !Number.isFinite(height) || height <= 0 || height > 10000) throw new Error('Invalid bounded cylinder parameters');
  const vertices = rings * sides + 2;
  const positions = new Float32Array(vertices * 3), colors = new Float32Array(vertices * 3);
  const indices = new Uint32Array(2 * sides * rings * 3);
  for (let r = 0; r < rings; r++) for (let s = 0; s < sides; s++) {
    const i = (r * sides + s) * 3, theta = 2 * Math.PI * s / sides;
    positions[i] = radius * Math.cos(theta); positions[i + 1] = radius * Math.sin(theta); positions[i + 2] = height * r / (rings - 1);
    colors[i] = s / (sides - 1); colors[i + 1] = r / (rings - 1); colors[i + 2] = 0.5;
  }
  const bottom = rings * sides, top = bottom + 1;
  positions[top * 3 + 2] = height;
  colors.set([0.25, 0.5, 0.75], bottom * 3); colors.set([0.75, 0.5, 0.25], top * 3);
  let at = 0;
  const tri = (a, b, c) => { indices[at++] = a; indices[at++] = b; indices[at++] = c; };
  for (let r = 0; r < rings - 1; r++) for (let s = 0; s < sides; s++) {
    const a = r * sides + s, b = r * sides + (s + 1) % sides, c = a + sides, d = b + sides;
    tri(a, b, c); tri(b, d, c);
  }
  for (let s = 0; s < sides; s++) {
    const next = (s + 1) % sides;
    tri(bottom, next, s); tri(top, (rings - 1) * sides + s, (rings - 1) * sides + next);
  }
  // Shoelace, edge lengths and extents of the STORED Float32 polygon, not ideal-circle values.
  let perimeter = 0, twiceArea = 0, xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (let s = 0; s < sides; s++) {
    const i = s * 3, j = ((s + 1) % sides) * 3, x = positions[i], y = positions[i + 1];
    perimeter += Math.hypot(positions[j] - x, positions[j + 1] - y);
    twiceArea += x * positions[j + 1] - positions[j] * y;
    xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); ymin = Math.min(ymin, y); ymax = Math.max(ymax, y);
  }
  return { mesh: { positions, indices, colors, source, name: `SYNTHETIC benchmark cylinder ${rings}x${sides}` },
    reference: { perimeter, area: Math.abs(twiceArea) / 2, ap: ymax - ymin, ml: xmax - xmin } };
}

export function summarizeRun(cases, requestedCases) {
  const ids = cases.map(c => c.id), wanted = requestedCases.map(c => c.id);
  const successful = cases.filter(c => c.status === 'ok').length;
  const skippedBudget = cases.filter(c => c.status === 'skipped-budget').length;
  const unexpectedBudgetSkips = cases.filter(c => c.status === 'skipped-budget' && c.id !== '400k-budget-control').length;
  const unsuccessful = cases.filter(c => c.status !== 'ok' && c.status !== 'skipped-budget').length;
  const covered = ids.length === wanted.length && new Set(ids).size === ids.length && wanted.every(id => ids.includes(id));
  return { requested: wanted.length, recorded: ids.length, successful, skippedBudget, unsuccessful, unexpectedBudgetSkips,
    complete: covered && unsuccessful === 0 && unexpectedBudgetSkips === 0 };
}

export async function readRepositoryCommit(root) {
  // Optional provenance only. No git subprocess is required or allowed to block a benchmark.
  const modules = ['node:fs/promises', 'node:path', 'node:url'];
  const [fs, path, url] = await Promise.all(modules.map(name => import(/* @vite-ignore */ name)));
  try {
    const directory = root instanceof URL ? url.fileURLToPath(root) : root;
    const git = path.join(directory, '.git');
    const head = (await fs.readFile(path.join(git, 'HEAD'), 'utf8')).trim();
    if (/^[0-9a-f]{40}$/.test(head)) return head;
    const ref = /^ref: (refs\/[a-zA-Z0-9_./-]+)$/.exec(head)?.[1];
    if (!ref || ref.includes('..')) return null;
    try {
      const loose = (await fs.readFile(path.join(git, ref), 'utf8')).trim();
      return /^[0-9a-f]{40}$/.test(loose) ? loose : null;
    } catch {
      const packed = await fs.readFile(path.join(git, 'packed-refs'), 'utf8');
      const row = packed.split(/\r?\n/).find(line => line.endsWith(` ${ref}`));
      return row && /^[0-9a-f]{40} /.test(row) ? row.slice(0, 40) : null;
    }
  } catch { return null; }
}

export async function runBenchmark(config) {
  // Dynamic imports remain Node-only; the same file's pure helpers run unchanged in Chromium.
  const imports = ['vite', '@playwright/test', 'node:fs/promises', 'node:path', 'node:os', 'node:crypto', 'node:url'];
  const [{ createServer }, { chromium }, fs, path, os, crypto, url] = await Promise.all(imports.map(name => import(/* @vite-ignore */ name)));
  const root = url.fileURLToPath(new URL('..', import.meta.url));
  const out = config.out ? path.resolve(config.out) : path.join(process.env.TMPDIR || os.tmpdir(), `orthosculpt-benchmark-${Date.now()}-${process.pid}`);
  await fs.mkdir(path.dirname(out), { recursive: true });
  // Exclusive run directory: never overwrite another owner's report.
  await fs.mkdir(out);
  const reportPath = path.join(out, 'report.json');
  const report = { schemaVersion: 1, status: 'starting', startedAt: new Date().toISOString(), completedAt: null,
    mode: config.mode, config: { ...config, out }, environment: { node: process.version, platform: process.platform, arch: process.arch,
      headless: config.headless, browserVersion: null, hardwareConcurrency: null, repositoryCommit: null, sourceFingerprintSha256: null },
    memory: { scope: 'Node benchmark driver ONLY, including in-process Vite; NOT Chromium or Workers', sampledDriverPeakRssBytes: null,
      sampledDriverPeakHeapUsedBytes: null, samplingIntervalMs: 500, browserPeakRssBytes: null, browserHeapPeakBytes: null },
    externalRequestsBlocked: 0, pageErrors: [], cases: [], fatalError: null, cleanup: { browserClosed: false, serverClosed: false },
    limitations: [
      'Synthetic straight closed indexed cylinders only; not patient scans, clinical validation or manufacturing acceptance.',
      'Init aggregates actual API preflight/copy/native-worker startup/transport/index snapshot and build; component internals are not separately instrumented.',
      'Standalone geometry-only copy uses the actual helper; not subtracted from init. RGB exists and input remains unchanged, but slicing and measureAt intentionally omit appearance in transport.',
      'Cold means a new engine/job, NOT an empty OS/module/network cache. Warm samples reuse one initialized Worker/index at the same interior Z.',
      'Checkpoints persist compact results between queries; checkpoint overhead is outside measured calls and may influence scheduling.',
      'No GC forcing, FPS, clinical tolerance, real-browser peak RSS or worst-case no-OOM claim. Working-set admission is a heuristic, not measured memory.',
      config.mode === 'correctness-smoke' ? 'Correctness/smoke run while other work may be active; NOT a final performance baseline.' : 'Caller must ensure serial execution without competing browser work; no contention isolation is claimed.',
    ] };
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), { flag: 'wx' });
  let saves = Promise.resolve();
  const save = () => {
    const snapshot = JSON.stringify(report, null, 2);
    saves = saves.then(async () => { await fs.writeFile(`${reportPath}.tmp`, snapshot); await fs.rename(`${reportPath}.tmp`, reportPath); });
    return saves;
  };
  const memorySample = () => {
    const m = process.memoryUsage();
    report.memory.sampledDriverPeakRssBytes = Math.max(report.memory.sampledDriverPeakRssBytes || 0, m.rss);
    report.memory.sampledDriverPeakHeapUsedBytes = Math.max(report.memory.sampledDriverPeakHeapUsedBytes || 0, m.heapUsed);
  };
  const serializeError = e => ({ name: e?.name || 'Error', message: String(e?.message || e).slice(0, 2000) });
  let server, browser, context, page, interrupted = false;
  const memoryTimer = setInterval(memorySample, 500); memorySample();
  const started = performance.now();
  const shutdown = () => { interrupted = true; void page?.evaluate(() => window.__benchmark?.cancel()).catch(() => {}); void browser?.close().catch(() => {}); };
  const totalTimer = setTimeout(shutdown, config.totalTimeoutMs);
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
  try {
    report.environment.repositoryCommit = await readRepositoryCommit(root);
    const fingerprintFiles = ['package-lock.json', 'scripts/benchmark-geometry.mjs', 'tests/fixtures/benchmark-harness.html'];
    for (const directory of ['src/compute', 'src/geometry']) {
      const entries = await fs.readdir(path.join(root, directory));
      for (const name of entries.filter(n => n.endsWith('.ts')).sort()) fingerprintFiles.push(`${directory}/${name}`);
    }
    const hash = crypto.createHash('sha256');
    for (const file of fingerprintFiles) { hash.update(file); hash.update(await fs.readFile(path.join(root, file))); }
    report.environment.sourceFingerprintSha256 = hash.digest('hex'); report.environment.fingerprintFiles = fingerprintFiles;
    server = await createServer({ configFile: false, root, cacheDir: path.join(out, 'vite-cache'), appType: 'mpa', logLevel: 'error',
      server: { host: '127.0.0.1', port: config.port, strictPort: true, hmr: false, watch: { ignored: ['**/*'] } } });
    await server.listen();
    if (interrupted) throw new DOMException('Total benchmark deadline exceeded', 'TimeoutError');
    browser = await chromium.launch({ headless: config.headless, timeout: Math.min(30000, config.totalTimeoutMs),
      args: ['--disable-background-networking', '--disable-component-update', '--disable-domain-reliability', '--no-first-run'] });
    report.environment.browserVersion = browser.version();
    context = await browser.newContext({ serviceWorkers: 'block' });
    const origin = `http://127.0.0.1:${config.port}`;
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      report.externalRequestsBlocked++; return route.abort('blockedbyclient');
    });
    await context.exposeBinding('__benchmarkCheckpoint', async (_source, snapshot) => {
      const at = report.cases.findIndex(c => c.id === snapshot.id);
      if (at < 0) report.cases.push(snapshot); else report.cases[at] = snapshot;
      memorySample(); await save();
    });
    report.status = 'running'; await save();
    for (let index = 0; index < config.cases.length; index++) {
      const parameters = config.cases[index], plan = planCase(parameters, config);
      if (interrupted || performance.now() - started >= config.totalTimeoutMs) {
        report.cases.push({ id: parameters.id, parameters, source: 'synthetic', plan, status: 'not-run-total-deadline', actualVertices: null, actualTriangles: null });
        await save(); continue;
      }
      if (!plan.admitted) {
        report.cases.push({ id: parameters.id, parameters, source: 'synthetic', plan, status: 'skipped-budget', actualVertices: null, actualTriangles: null });
        await save(); continue;
      }
      let watchdog;
      try {
        if (!page || page.isClosed()) {
          page = await context.newPage();
          page.on('pageerror', error => report.pageErrors.push(serializeError(error)));
          await page.goto(`${origin}/tests/fixtures/benchmark-harness.html`, { waitUntil: 'load', timeout: Math.min(30000, config.caseTimeoutMs) });
          await page.waitForFunction(() => !!window.__benchmark, undefined, { timeout: Math.min(30000, config.caseTimeoutMs) });
          Object.assign(report.environment, await page.evaluate(() => window.__benchmark.metadata()));
        }
        const remaining = Math.max(1, config.totalTimeoutMs - (performance.now() - started));
        const result = await Promise.race([
          page.evaluate(({ parameters, config }) => window.__benchmark.runCase(parameters, config), { parameters, config: { ...config, controls: index === 0 } }),
          new Promise((_, reject) => { watchdog = setTimeout(() => reject(new DOMException('Driver case watchdog exceeded', 'TimeoutError')), Math.min(config.caseTimeoutMs + 2000, remaining)); }),
        ]);
        const at = report.cases.findIndex(c => c.id === parameters.id);
        if (at < 0) report.cases.push(result); else report.cases[at] = result;
      } catch (error) {
        const at = report.cases.findIndex(c => c.id === parameters.id);
        const failed = { ...(at >= 0 ? report.cases[at] : { id: parameters.id, parameters, source: 'synthetic', plan }),
          status: error.name === 'TimeoutError' ? 'timed-out' : 'failed', driverError: serializeError(error) };
        if (at < 0) report.cases.push(failed); else report.cases[at] = failed;
        await save();
        // Closing the owned page terminates any Worker even if renderer timers stopped responding.
        await page?.close({ runBeforeUnload: false }).catch(() => {});
      } finally { clearTimeout(watchdog); memorySample(); await save(); }
    }
    report.counts = summarizeRun(report.cases, config.cases);
    report.status = report.counts.complete && !report.pageErrors.length && !report.externalRequestsBlocked ? 'completed' : 'completed-with-failures';
  } catch (error) { report.status = 'failed'; report.fatalError = serializeError(error); }
  finally {
    clearTimeout(totalTimer); clearInterval(memoryTimer); process.removeListener('SIGINT', shutdown); process.removeListener('SIGTERM', shutdown);
    try { await context?.close(); await browser?.close(); report.cleanup.browserClosed = true; }
    catch (error) { report.cleanup.browserError = serializeError(error); report.status = 'failed'; }
    try { await server?.close(); report.cleanup.serverClosed = true; }
    catch (error) { report.cleanup.serverError = serializeError(error); report.status = 'failed'; }
    memorySample(); report.completedAt = new Date().toISOString(); report.elapsedDriverMs = performance.now() - started; await save();
  }
  // No model/attribute arrays are written; the durable JSON contains compact samples, failures and metadata only.
  console.log(JSON.stringify({ report: reportPath, status: report.status, counts: report.counts || null, cases: report.cases.map(c => ({ id: c.id, status: c.status, vertices: c.actualVertices, triangles: c.actualTriangles })) }, null, 2));
  return { report, reportPath, exitCode: report.status === 'completed' ? 0 : 1 };
}

if (typeof process !== 'undefined' && process.versions?.node && process.argv[1]?.replaceAll('\\', '/').endsWith('/benchmark-geometry.mjs')) {
  runBenchmark(parseOptions(process.argv.slice(2))).then(result => { process.exitCode = result.exitCode; }, error => {
    console.error(`${error.name}: ${error.message}`); process.exitCode = 1;
  });
}
