// Small standalone TEST-ONLY CLI: serves own static page + actual-source Worker bundle.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, isAbsolute } from 'node:path';
import { createServer } from 'node:http';
import { connect } from 'node:net';
const scratch = dirname(fileURLToPath(import.meta.url));
const repo = 'C:/Users/sandr/OrthoSculptCAD';
const require = createRequire(repo + '/package.json');
const { chromium } = require('@playwright/test');
const { build, version: viteVersion } = await import(pathToFileURL(require.resolve('vite')).href);
assert.match(process.env.NODE_OPTIONS ?? '', /--max-old-space-size=(128|256)/, 'Run with NODE_OPTIONS=--max-old-space-size=256 --max-semi-space-size=8');
assert.match(process.env.NODE_OPTIONS, /--max-semi-space-size=8/);
const sha = data => createHash('sha256').update(data).digest('hex');
const json = value => JSON.stringify(value, (_k, v) => typeof v === 'bigint' ? v.toString() : v, 2) + '\n';
const persist = async (name, value) => writeFile(join(scratch, name), json(value));
const frozenInputs = {
  'src/trimline/source-candidate.ts': '983f07ae42f458e27a253b401e56838fb41c562c70524409510d1abe10b4254b',
  'tests/v03-source-candidate.test.ts': '8939b5b676194c3b5bca29f9d0f2cd7b889ce2c4d22ccf06327309fb08a97188',
  'tests/fixtures/v03-source-candidate-oracle.json': 'cca26c881316cbebf35b0950483f00596dce8e02460ab2103180f0b987b10ac9',
  'docs/plans/v03-source-bound-spans-design.md': 'c17ba16b281b81239aeaf8e65bf828ad0ef9f545fcbfafda9646edbd6507acbf',
  'src/trimline/numerics.ts': '543f25344bcf6b7c4f1139623c13a344e720e073c80eb243a38731d504999b25',
  'src/trimline/face-cubic.ts': 'bc637b6f6274788cdc4395998f52930a23ac28885ce3a6a315a67ff07f61cfb1',
  'src/io/validation.ts': 'fc1c411d0a4c678d5b31db9df67864aff9d91705d605e8b1309e5f5396215832',
};
async function readHashes() { return Object.fromEntries(await Promise.all(Object.keys(frozenInputs).map(async p => [p, sha(await readFile(join(repo, p)))]))); }
const hashesStart = await readHashes(); assert.deepEqual(hashesStart, frozenInputs);
const fixture = JSON.parse(await readFile(join(repo, 'tests/fixtures/v03-source-candidate-oracle.json'), 'utf8'));
// Independent Node-side byte assembly. The literal oracle stays untouched.
function canonicalBytes(m, stamp) {
  const chunks = [Buffer.from('OrthoSculptSourceCandidate\0', 'ascii')];
  const u8 = n => chunks.push(Buffer.from([n]));
  const u32 = n => { assert.ok(Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff); const b = Buffer.alloc(4); b.writeUInt32LE(n); chunks.push(b); };
  const text = s => { const b = Buffer.from(s, 'utf8'); u32(b.length); chunks.push(b); };
  u32(1); u32(m.positionsBits.length / 3); u32(m.indices.length / 3);
  for (const n of m.positionsBits) u32(n); for (const n of m.indices) u32(n);
  for (const bits of [m.colorsBits, m.uvsBits]) { u8(bits === undefined ? 0 : 1); if (bits) for (const n of bits) u32(n); }
  u8(m.source === undefined ? 0 : m.source === 'synthetic' ? 1 : 2); text(m.name);
  u8(m.textureUrl === undefined ? 0 : 1); if (m.textureUrl !== undefined) text(m.textureUrl);
  text(stamp.units); u8(1); text(stamp.frameId);
  return Buffer.concat(chunks);
}
const st = { projectEpoch: 1, revision: 2, generation: 3, units: 'mm', unitsConfirmed: true, frameId: 'frame_1' };
const words = f => Array.from(new Uint32Array(new Float32Array(f).buffer));
const testMesh = { name: 'TESTDATA S 🦴', source: 'synthetic', positionsBits: words([2, 0, -0, 3, 0, 0, 2, 1, 0, 2, 0, 1]),
  indices: [0, 2, 1, 0, 1, 3, 1, 2, 3, 2, 0, 3], colorsBits: words(Array(12).fill(0.5)), uvsBits: words(Array(8).fill(0)), textureUrl: 'data:image/png;base64,AAAA' };
const testPreimage = canonicalBytes(testMesh, st), testDigest = 'sha256:' + sha(testPreimage);
const rat = (n, d = '1') => ({ n: String(n), d: String(d) });
const faceTriangle = [[rat(2), rat(0), rat(0)], [rat(3), rat(0), rat(0)], [rat(2), rat(0), rat(1)]];
const faceBits = [[0x40000000, 0, 0x80000000], [0x40400000, 0, 0], [0x40000000, 0, 0x3f800000]];
const descriptionExpected = { kind: 'owned-source-candidate-v1', sourceDigest: testDigest, stamp: st, vertexCount: 4, faceCount: 4 };
function descriptionCheck(d, expected) { assert.match(d.sourceId, /^source-candidate-[1-9][0-9]*$/); const { sourceId, ...rest } = d; assert.deepEqual(rest, expected); assert.ok(!Object.hasOwn(d, 'audited')); }
function testFaceCheck(f) { descriptionCheck(f.source, descriptionExpected); assert.equal(f.sourceFace, 1); assert.deepEqual(f.vertexIDs, [0, 1, 3]); assert.deepEqual(f.positionBits, faceBits); assert.deepEqual(f.triangle, faceTriangle); }
const checks = [], raw = {};
const result = { status: 'RUNNING', testOnly: true, hashesStart, checks, pageErrors: [], workerErrors: [], externalRequests: [], requests: [], serverRequests: [],
  cleanup: { nativeWorkerConstructed: 0, nativeWorkerTerminated: 0, playwrightWorkerClosed: 0, browserDisconnected: false, serverStopped: false, serverPortRefused: false } };
let browser, context, page, server, origin, port, failure, pageDiagnostics;
let resolveWorkerClosed;
const workerClosed = new Promise(resolve => { resolveWorkerClosed = resolve; });
const modules = [];
const check = (name, fn) => { fn(); checks.push({ name, pass: true }); console.log('PASS ' + name); };
async function request(name, payload) {
  const output = await page.evaluate(async ({ name, payload }) => {
    const value = name === 'auth-return' ? await window.harness.roundtripAuth() : await window.harness.request(name, payload);
    return JSON.parse(JSON.stringify(value, (_k, v) => typeof v === 'bigint' ? v.toString() : v));
  }, { name, payload });
  raw[name] = output; await persist('raw-results.json', raw); return output;
}
try {
  const bundleDir = join(scratch, 'bundle'); await mkdir(bundleDir, { recursive: true });
  await build({ configFile: false, root: scratch, publicDir: false, logLevel: 'info',
    resolve: { alias: { '@accepted': repo + '/src/trimline/source-candidate.ts', '@numerics': repo + '/src/trimline/numerics.ts' } },
    plugins: [{ name: 'test-only-record-actual-bundled-modules', generateBundle() { for (const id of this.getModuleIds()) { const info = this.getModuleInfo(id); if (!id.startsWith('\0') && isAbsolute(id)) modules.push({ path: id.replaceAll('\\', '/'), included: info?.isIncluded ?? null }); } } }],
    build: { outDir: bundleDir, emptyOutDir: true, minify: false, sourcemap: true, target: 'esnext', reportCompressedSize: false,
      lib: { entry: join(scratch, 'worker.ts'), formats: ['es'], fileName: () => 'worker.js' } } });
  for (const m of modules) m.sha256 = sha(await readFile(m.path));
  for (const p of ['src/trimline/source-candidate.ts', 'src/trimline/numerics.ts', 'src/trimline/face-cubic.ts', 'src/io/validation.ts']) assert.ok(modules.some(m => m.path === repo + '/' + p), 'Missing actual bundled module: ' + p);
  const indexBytes = await readFile(join(scratch, 'index.html')), workerBytes = await readFile(join(bundleDir, 'worker.js'));
  const sourceMap = JSON.parse(await readFile(join(bundleDir, 'worker.js.map'), 'utf8'));
  const sourceMapProvenance = sourceMap.sources.map((source, i) => ({ source, sha256: sha(sourceMap.sourcesContent[i]) }));
  for (const m of modules) assert.ok(sourceMapProvenance.some(p => p.sha256 === m.sha256), 'Source map is not byte-identical to actual module: ' + m.path);
  result.bundle = { workerSha256: sha(workerBytes), workerBytes: workerBytes.length, pageSha256: sha(indexBytes), modules, sourceMapProvenance };
  const served = new Map([['/', { bytes: indexBytes, type: 'text/html; charset=utf-8' }], ['/worker.js', { bytes: workerBytes, type: 'text/javascript; charset=utf-8' }]]);
  server = createServer((req, res) => {
    result.serverRequests.push({ method: req.method, url: req.url });
    const asset = served.get(req.url);
    if (req.method !== 'GET' || !asset) { res.writeHead(404); res.end('Test-only asset not found'); return; }
    res.writeHead(200, { 'Content-Type': asset.type, 'Cache-Control': 'no-store', 'Content-Length': asset.bytes.length, 'X-Content-Type-Options': 'nosniff' }); res.end(asset.bytes);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  port = server.address().port; origin = 'http://127.0.0.1:' + port; result.origin = origin;
  browser = await chromium.launch({ headless: true });
  browser.on('disconnected', () => { result.cleanup.browserDisconnected = true; });
  result.browser = { version: browser.version(), executable: chromium.executablePath(), playwrightVersion: require('@playwright/test/package.json').version, viteVersion, node: process.version, nodeOptions: process.env.NODE_OPTIONS, launch: 'headless Chromium defaults; no added security flags' };
  context = await browser.newContext({ serviceWorkers: 'block' });
  context.on('request', req => { const item = { method: req.method(), url: req.url(), type: req.resourceType() }; result.requests.push(item); if (new URL(req.url()).origin !== origin) result.externalRequests.push(item); });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort('blockedbyclient'));
  page = await context.newPage();
  page.on('pageerror', e => result.pageErrors.push({ name: e.name, message: e.message, stack: e.stack }));
  page.on('worker', w => { result.cleanup.playwrightWorkerCreated = (result.cleanup.playwrightWorkerCreated ?? 0) + 1; w.on('close', () => { result.cleanup.playwrightWorkerClosed++; resolveWorkerClosed(true); }); });
  await page.goto(origin, { waitUntil: 'load', timeout: 20000 });
  await page.waitForFunction(() => !!window.harness, { timeout: 10000 });
  const oracle = await request('oracle', fixture);
  check('independent-oracle', () => {
    assert.equal(oracle.sharedCumulativeArithmeticContext, true); assert.equal(oracle.cases.length, fixture.cases.length);
    const ids = new Set(), runtimeIds = new Set(); let faces = 0;
    for (const [i, actual] of oracle.cases.entries()) {
      const c = fixture.cases[i]; assert.equal(actual.id, c.id); assert.ok(!ids.has(actual.id)); ids.add(actual.id);
      const e = c.expected;
      descriptionCheck(actual.description, { kind: 'owned-source-candidate-v1', sourceDigest: e.sourceDigest, stamp: c.stamp, vertexCount: e.vertexCount, faceCount: e.faceCount });
      assert.ok(!runtimeIds.has(actual.description.sourceId)); runtimeIds.add(actual.description.sourceId);
      assert.ok(actual.frozenNodes > 0); assert.equal(actual.publicBuffers, 0); assert.equal(actual.faces.length, e.faces.length);
      for (const [f, face] of actual.faces.entries()) { const { source, ...literalFace } = face; assert.deepEqual(source, actual.description); assert.deepEqual(literalFace, e.faces[f]); faces++; }
    }
    result.oracle = { cases: ids.size, faces, uniqueRuntimeIds: runtimeIds.size };
    assert.deepEqual(result.oracle, { cases: 31, faces: 121, uniqueRuntimeIds: 31 });
  });
  result.cloneFreezeObservation = await page.evaluate(() => ({ structuredClonePreservesFreeze: Object.isFrozen(structuredClone(Object.freeze({}))), expected: false }));
  const mutation = await request('mutation');
  check('worker-local-input-mutation', () => { descriptionCheck(mutation.description, descriptionExpected); testFaceCheck(mutation.face); assert.equal(mutation.getterTouches, 0); assert.equal(mutation.mutatedViews, 4); assert.equal(mutation.nonzeroByteOffset, 8); assert.ok(mutation.frozenNodes > 0); });
  const gateStart = await request('gate-start'), gateDispose = await request('gate-dispose'), gateOpen = await request('gate-open');
  check('pending-native-digest-dispose', () => {
    assert.deepEqual(gateStart, { busyCode: 'SOURCE_IN_USE', captureSettled: false });
    assert.deepEqual(gateDispose, { nativePromiseFulfillmentObserved: true, captureSettled: false, published: false, closedCode: 'STALE_SOURCE' });
    assert.deepEqual(gateOpen, { published: false, name: 'SourceCandidateError', message: 'STALE_SOURCE', code: 'STALE_SOURCE', captureSettled: true, nativePromiseFulfillmentObserved: true, describeClosed: 'STALE_SOURCE' });
  });
  const authStart = await request('auth-start'), authReturn = await request('auth-return');
  check('opaque-handle-authentication', () => {
    assert.notEqual(authStart.primaryId, authStart.foreignId); assert.deepEqual(authStart.authHandle, {});
    for (const attempts of Object.values(authStart.attempts)) assert.deepEqual(attempts, { describe: 'INVALID_INPUT', resolve: 'INVALID_INPUT', bind: 'INVALID_INPUT', release: 'INVALID_INPUT' });
    assert.equal(authReturn.nativePostMessageRoundTrip, true); assert.deepEqual(authReturn.open, { describe: 'INVALID_INPUT', resolve: 'INVALID_INPUT', bind: 'INVALID_INPUT', release: 'INVALID_INPUT' });
    assert.deepEqual(authReturn.retired, { real: 'STALE_SOURCE', clone: 'INVALID_INPUT' });
    assert.deepEqual(authReturn.closed, { real: 'STALE_SOURCE', clone: 'STALE_SOURCE', resolveClone: 'STALE_SOURCE', bindClone: 'STALE_SOURCE', releaseClone: 'INVALID_INPUT', releaseRetired: 'ACCEPTED' });
  });
  const bind = await request('bind');
  check('real-bind-cumulative-context', () => {
    testFaceCheck(bind.face); assert.equal(bind.span.kind, 'candidate-source-face-cubic-v1'); assert.deepEqual(bind.span.face, bind.face);
    assert.equal(bind.span.containment.kind, 'supplied-face-cubic-hull-v1'); assert.deepEqual(bind.span.containment.triangle, bind.face.triangle);
    assert.deepEqual(bind.span.containment.barycentricControls, [[rat(1), rat(0), rat(0)], [rat(2, 3), rat(1, 3), rat(0)], [rat(1, 3), rat(2, 3), rat(0)], [rat(0), rat(1), rat(0)]]);
    assert.deepEqual(bind.span.containment.controls, [[rat(2), rat(0), rat(0)], [rat(7, 3), rat(0), rat(0)], [rat(8, 3), rat(0), rat(0)], [rat(3), rat(0), rat(0)]]);
    assert.equal(bind.sharedCumulativeArithmeticContext, true); assert.deepEqual(bind.exhaustedCodes, ['BUDGET_EXCEEDED', 'BUDGET_EXCEEDED']); assert.ok(bind.frozenNodes > 0);
  });
  const issuedIds = [...oracle.cases.map(c => c.description.sourceId), mutation.description.sourceId, authStart.primaryId, authStart.foreignId, bind.face.source.sourceId];
  result.runtimeIdentities = { issued: issuedIds.length, unique: new Set(issuedIds).size };
  assert.equal(result.runtimeIdentities.unique, result.runtimeIdentities.issued);
  const finish = await request('finish'); assert.equal(finish.digestRestored, true); assert.equal(finish.secureContext, true);
  result.browser.userAgent = finish.userAgent; result.browser.nativeDigestFunction = finish.nativeFunction;
  result.browser.crossOriginIsolated = finish.crossOriginIsolated; result.browser.sharedArrayBufferAvailable = finish.sharedArrayBufferAvailable;
  result.nativeDigests = finish.digests; result.workerTrace = finish.trace;
  assert.equal(finish.digests.length, fixture.cases.length + 5);
  const expectedLabels = [...fixture.cases.map(c => c.id), 'mutation', 'pending-dispose', 'auth-primary', 'auth-foreign', 'bind'];
  assert.deepEqual(finish.digests.map(d => d.label), expectedLabels);
  for (const [i, d] of finish.digests.entries()) {
    const expectedBytes = i < fixture.cases.length ? canonicalBytes(fixture.cases[i].mesh, fixture.cases[i].stamp) : testPreimage;
    assert.equal(d.algorithm, 'SHA-256'); assert.equal(d.nativeSettled, true); assert.equal(d.preimageHex, expectedBytes.toString('hex')); assert.equal(d.digestHex, sha(expectedBytes));
    if (i < fixture.cases.length) assert.equal('sha256:' + d.digestHex, fixture.cases[i].expected.sourceDigest);
  }
  const chronology = finish.trace.map(e => e.kind);
  for (const kind of ['capture-returned-promise-before-caller-mutation', 'worker-local-caller-input-mutated-before-await', 'store-disposed-with-test-gate-closed', 'test-gate-opened', 'real-native-hash-returned-after-test-gate', 'capture-rejected']) assert.ok(chronology.includes(kind));
  assert.ok(chronology.indexOf('capture-returned-promise-before-caller-mutation') < chronology.indexOf('worker-local-caller-input-mutated-before-await'));
  assert.ok(chronology.indexOf('store-disposed-with-test-gate-closed') < chronology.indexOf('test-gate-opened'));
  assert.ok(chronology.indexOf('test-gate-opened') < chronology.indexOf('capture-rejected'));
  result.status = 'PASS';
} catch (e) {
  failure = e; result.status = 'FAIL'; result.error = { name: e.name, message: e.message, stack: e.stack }; console.error(e.stack);
} finally {
  if (page && !page.isClosed()) {
    try { pageDiagnostics = await page.evaluate(() => window.harness?.stop()); } catch (e) { result.cleanup.pageCleanupError = e.message; }
    if (pageDiagnostics) {
      result.pageDiagnostics = pageDiagnostics; result.workerErrors = pageDiagnostics.errors;
      result.cleanup.nativeWorkerConstructed = pageDiagnostics.trace.filter(e => e.kind === 'native-worker-constructed').length;
      result.cleanup.nativeWorkerTerminated = pageDiagnostics.trace.filter(e => e.kind === 'native-worker-terminate').length;
    }
  }
  if (result.cleanup.nativeWorkerTerminated === 1) {
    let timer;
    result.cleanup.workerClosedBeforeContextClose = await Promise.race([workerClosed, new Promise(resolve => { timer = setTimeout(() => resolve(false), 5000); })]);
    clearTimeout(timer);
  }
  if (context) { try { await context.close(); } catch (e) { result.cleanup.contextError = e.message; } }
  if (browser) { try { await browser.close(); } catch (e) { result.cleanup.browserError = e.message; } }
  if (server) {
    await new Promise(resolve => { server.close(() => { result.cleanup.serverStopped = !server.listening; resolve(); }); server.closeAllConnections(); });
    if (port) result.cleanup.serverPortRefused = await new Promise(resolve => { const socket = connect({ host: '127.0.0.1', port }); socket.once('error', e => resolve(e.code === 'ECONNREFUSED')); socket.once('connect', () => { socket.destroy(); resolve(false); }); socket.setTimeout(2000, () => { socket.destroy(); resolve(false); }); });
  }
  result.hashesEnd = await readHashes();
  try {
    assert.deepEqual(result.hashesEnd, hashesStart); assert.deepEqual(result.externalRequests, []); assert.deepEqual(result.pageErrors, []); assert.deepEqual(result.workerErrors, []);
    assert.equal(result.cleanup.nativeWorkerConstructed, 1); assert.equal(result.cleanup.nativeWorkerTerminated, 1); assert.equal(result.cleanup.playwrightWorkerCreated, 1); assert.equal(result.cleanup.playwrightWorkerClosed, 1);
    assert.equal(result.cleanup.workerClosedBeforeContextClose, true);
    assert.equal(result.cleanup.browserDisconnected, true); assert.equal(result.cleanup.serverStopped, true); assert.equal(result.cleanup.serverPortRefused, true);
    assert.equal(result.pageDiagnostics.pending, 0);
    assert.equal(result.serverRequests.length, 2); assert.deepEqual(result.serverRequests.map(r => r.url).sort(), ['/', '/worker.js']);
  } catch (e) { failure ??= e; result.status = 'FAIL'; result.verificationError = { message: e.message, stack: e.stack }; }
  await persist('raw-results.json', raw); await persist('results.json', result);
  const artifactNames = ['cli.mjs', 'worker.ts', 'index.html', 'acceptance.mjs', 'bundle/worker.js', 'bundle/worker.js.map', 'raw-results.json', 'results.json'];
  const artifacts = [];
  for (const name of artifactNames) { try { const b = await readFile(join(scratch, name)); artifacts.push({ path: join(scratch, name), bytes: b.length, sha256: sha(b) }); } catch {} }
  await persist('manifest.json', { status: result.status, testOnly: true, sourceHashes: hashesStart, modules, artifacts, browser: result.browser });
  await persist('handoff.json', { status: result.status, scope: 'NONPRODUCTION native Chromium Worker harness only; synthetic TESTDATA; no actual scans/PHI',
    checks, oracle: result.oracle, nativeDigests: result.nativeDigests?.length ?? 0, cleanup: result.cleanup, sourceSha256: hashesStart['src/trimline/source-candidate.ts'],
    evidence: ['results.json', 'raw-results.json', 'manifest.json', 'bundle/worker.js', 'bundle/worker.js.map', 'run.log'],
    replay: "NODE_OPTIONS='--max-old-space-size=256 --max-semi-space-size=8' node " + scratch.replaceAll('\\', '/') + '/cli.mjs',
    limits: ['Not product retained-owner/RPC authority/admission/pool integration; no audit/cut/shell/UI acceptance.', 'Only private S + SHA preimage buffer accounting; no total RAM/RSS/GC/native-thread measurement.', 'Gate delays return of actual native SHA bytes after JS-observed native promise fulfillment; no hash stub or native cancel claim.', 'SAB not tested; absence without cross-origin isolation is not a SAB-case PASS.', 'TESTDATA-source-imported-metadata-only is synthetic TESTDATA, not imported patient data.', 'Existing full product scope and budgets unchanged. No repository/config/skills/dependencies edits.'] });
}
console.log(json({ status: result.status, checks: checks.length, oracle: result.oracle, nativeDigests: result.nativeDigests?.length ?? 0, cleanup: result.cleanup, artifacts: scratch }));
if (failure) process.exitCode = 1;
