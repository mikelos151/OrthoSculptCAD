import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { connect } from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';
const dir = fileURLToPath(new URL('.', import.meta.url));
const repo = 'C:/Users/sandr/OrthoSculptCAD';
const { transformWithOxc } = await import(pathToFileURL(repo + '/node_modules/vite/dist/node/index.js'));
const { chromium } = await import(pathToFileURL(repo + '/node_modules/playwright/index.mjs'));
const sha = data => createHash('sha256').update(data).digest('hex');
const served = new Map(), hashes = { source: {}, served: {} };
await mkdir(dir + '/served', { recursive: true });
for (const [name, source] of [['workerPool', 'src/compute/workerPool.ts'], ['resourceLedger', 'src/compute/resourceLedger.ts']]) {
  const data = await readFile(repo + '/' + source, 'utf8'); hashes.source[source] = sha(Buffer.from(data));
  const transformed = await transformWithOxc(data, repo + '/' + source, { sourcemap: false });
  served.set('/' + name + '.js', transformed.code);
  hashes.served[name + '.js'] = sha(Buffer.from(transformed.code));
  await writeFile(dir + '/served/' + name + '.js', transformed.code);
}
const fixture = await readFile(dir + '/fixture.mjs', 'utf8'); served.set('/fixture.mjs', fixture);
hashes.served['fixture.mjs'] = sha(Buffer.from(fixture));
served.set('/', '<!doctype html><meta charset="utf-8"><title>G1b1a native fixture</title>');
const pageErrors = [], externalRequests = [], workerEvents = [], responses = [];
let browser, context, server, address, result, failure;
const closed = { context: false, browser: false, server: false, portRefuses: false };
try {
  server = createServer((req, res) => {
    if (!served.has(req.url)) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', req.url === '/' ? 'text/html' : 'text/javascript');
    res.setHeader('Cache-Control', 'no-store'); res.end(served.get(req.url));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); address = server.address();
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('worker', w => { const id = workerEvents.filter(e => e.type === 'created').length + 1; workerEvents.push({ type: 'created', id, url: w.url() }); w.on('close', () => workerEvents.push({ type: 'close-notification', id })); });
  page.on('request', req => { if (!req.url().startsWith(`http://127.0.0.1:${address.port}/`) && !req.url().startsWith('blob:')) externalRequests.push(req.url()); });
  page.on('response', res => responses.push({ url: res.url(), status: res.status() }));
  await page.goto(`http://127.0.0.1:${address.port}/`);
  result = await page.evaluate(async () => { const { run } = await import('/fixture.mjs'); return await run(); });
  await page.waitForTimeout(100);
  const nativeCreated = workerEvents.filter(e => e.type === 'created').length;
  const nativeClosed = workerEvents.filter(e => e.type === 'close-notification').length;
  result.browser = { version: browser.version(), nativeCreated, nativeCloseNotificationsBeforeContextClose: nativeClosed };
  result.checks.push({ name: 'all native worker close notifications observed before context teardown', pass: nativeCreated === nativeClosed && nativeCreated === result.metrics.created });
  result.checks.push({ name: 'no external requests or unexpected page errors', pass: externalRequests.length === 0 && pageErrors.length === 0 });
  for (const [path, oldHash] of Object.entries(hashes.source)) if (sha(await readFile(repo + '/' + path)) !== oldHash) throw Error('Source changed during native run: ' + path);
  if (!result.checks.every(c => c.pass)) throw Error('Native check failed');
} catch (error) { failure = String(error.stack ?? error); }
finally {
  if (context) { await context.close(); closed.context = true; }
  if (browser) { await browser.close(); closed.browser = true; }
  if (server) { await new Promise(resolve => server.close(resolve)); closed.server = true; }
  if (address) closed.portRefuses = await new Promise(resolve => { const socket = connect(address.port, '127.0.0.1'); socket.once('error', () => resolve(true)); socket.once('connect', () => { socket.destroy(); resolve(false); }); });
}
await writeFile(dir + '/native-results.json', JSON.stringify({ passed: !failure && Object.values(closed).every(Boolean), failure, hashes, result, pageErrors, externalRequests, workerEvents, responses, closed }, null, 2));
await writeFile(dir + '/native-hashes.json', JSON.stringify(hashes, null, 2));
console.log(JSON.stringify({ passed: !failure, failure, checks: result?.checks.length, failedChecks: result?.checks.filter(c => !c.pass), metrics: result?.metrics, browser: result?.browser, closed, pageErrors, externalRequests }, null, 2));
process.exitCode = failure || !Object.values(closed).every(Boolean) ? 1 : 0;
