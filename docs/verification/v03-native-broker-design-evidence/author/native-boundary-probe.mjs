import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const root = 'C:/Users/sandr/OrthoSculptCAD/';
const scratch = 'C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-broker-g1b-design/';
const require = createRequire(root + 'package.json');
const ts = require('typescript');
const { chromium } = require('@playwright/test');
const source = await readFile(root + 'src/compute/resourceLedger.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }, fileName: 'resourceLedger.ts' }).outputText;
await writeFile(scratch + 'resourceLedger.existing.mjs', compiled);
const observations = { scope: 'Existing G1a gap probe, NOT G1b implementation/acceptance', sourceSHA256: createHash('sha256').update(source).digest('hex'), compiledSHA256: createHash('sha256').update(compiled).digest('hex'), errors: [] };
let browser;
try {
  browser = await chromium.launch({ headless: true });
  observations.browserVersion = browser.version();
  const page = await browser.newPage();
  page.on('pageerror', e => observations.errors.push(String(e)));
  page.on('request', r => { if (/^https?:/.test(r.url())) observations.errors.push('Unexpected network ' + r.url()); });
  observations.result = await page.evaluate(async (url) => {
    const { createResourceLedger } = await import(url);
    const ledger = createResourceLedger({ managed: 1024, job: 1024, history: 1024 });
    const main = ledger.createRealm(), remote = ledger.createRealm();
    const lease = ledger.reserve([{ key: 'input', bytes: 16, category: 'job', owner: main }]);
    const ref = lease.ref('input'), backing = lease.allocateBuffer(ref);
    new Uint8Array(backing).set([7, 11, 13, 17]);
    const events = [], snapshots = {};
    const snapshot = (name) => { snapshots[name] = ledger.snapshot(); };
    const check = (condition, name) => { if (!condition) throw new Error(name); events.push({ check: name, pass: true }); };
    snapshot('main');
    lease.transfer(ref, remote);
    check(backing.byteLength === 16, 'G1a logical transfer does not detach');
    snapshot('logicalTransfer');
    const workerText = `let held; self.onmessage = e => { if(e.data.kind === 'start') { held = e.data.buffer; const view = new Uint8Array(held); self.postMessage({kind:'received',length:held.byteLength,first:[...view.subarray(0,4)]}); } else if(e.data.kind === 'return') { const result = held; held = undefined; self.postMessage({kind:'returned',buffer:result},[result]); self.postMessage({kind:'detached',length:result.byteLength}); } };`;
    const blobURL = URL.createObjectURL(new Blob([workerText], {type:'text/javascript'}));
    const worker = new Worker(blobURL); events.push({native:'constructor'});
    const messages = [], waiters = new Map();
    worker.onmessage = e => { events.push({native:'response',kind:e.data.kind}); const resolve = waiters.get(e.data.kind); if(resolve) { waiters.delete(e.data.kind); resolve(e.data); } else messages.push(e.data); };
    const take = (kind) => { const i = messages.findIndex(m => m.kind === kind); return i >= 0 ? Promise.resolve(messages.splice(i,1)[0]) : new Promise(resolve => waiters.set(kind, resolve)); };
    let timeout;
    try {
      const timeoutPromise = new Promise((_,reject) => { timeout = setTimeout(() => reject(new Error('native probe deadline')), 10000); });
      const work = async () => {
        const sendFailure = new ArrayBuffer(4);
        let thrown;
        try { worker.postMessage({ kind:'bad', buffer:sendFailure, bad:()=>0 }, [sendFailure]); } catch(e) { thrown = e.name; }
        check(thrown === 'DataCloneError' && sendFailure.byteLength === 4, 'native synchronous DataCloneError leaves AB attached');
        events.push({native:'postMessage',kind:'start'}); worker.postMessage({kind:'start',buffer:backing},[backing]);
        check(backing.byteLength === 0, 'native transfer detached main AB');
        const ack = await take('received');
        check(ack.length === 16 && JSON.stringify(ack.first) === '[7,11,13,17]', 'real Worker received original payload');
        snapshot('detachedButLedgerStillLive');
        for(const [name,fn] of [['retain',()=>lease.retain(ref,'job',remote)],['reclassify',()=>lease.reclassify(ref,'history')],['transfer',()=>lease.transfer(ref,main)]]) {
          let code; try { fn(); } catch(e) { code=e.code; }
          check(code === 'INVALID_INPUT', 'existing G1a ' + name + ' refuses detached backing');
        }
        events.push({native:'postMessage',kind:'return'}); worker.postMessage({kind:'return'});
        const returned = (await take('returned')).buffer;
        check(returned !== backing && returned.byteLength === 16 && new Uint8Array(returned)[0] === 7, 'native returned wrapper differs, bytes preserved');
        check((await take('detached')).length === 0, 'Worker-side native return detaches held AB');
        const ingress = ledger.reserve([]);
        const newRef = ledger.registerExisting(returned, ingress, 'job', main);
        check(newRef.ok !== false, 'existing registerExisting accepts returned wrapper as new allocation');
        snapshot('naiveRegisterDoubleCharge');
        check(snapshots.naiveRegisterDoubleCharge.managed === 32 && snapshots.naiveRegisterDoubleCharge.allocations.length === 2, 'naive registerExisting duplicates accounting, proving adapter requirement');
        lease.close(); ingress.close(); snapshot('closed');
        check(ledger.snapshot().managed === 0, 'explicit cleanup closes both old and new charges');
      };
      await Promise.race([work(),timeoutPromise]);
    } finally {
      clearTimeout(timeout); worker.terminate(); events.push({native:'terminate-invoked'}); URL.revokeObjectURL(blobURL);
    }
    return { events, snapshots, noG1bAdapterImplemented: true, nativeTerminationMeans: 'terminate invoked, not physical-thread/GC/RSS proof' };
  }, 'data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
  observations.status = observations.errors.length ? 'FAIL' : 'EXISTING_BOUNDARY_CONFIRMED';
} catch(e) {
  observations.status = 'BLOCKED_OR_FAIL'; observations.errors.push(String(e.stack || e)); process.exitCode = 1;
} finally {
  if(browser) { await browser.close(); observations.browserClosed = true; }
  await writeFile(scratch + 'native-probe-results.json', JSON.stringify(observations,null,2)+'\n');
  console.log(JSON.stringify(observations,null,2));
}
