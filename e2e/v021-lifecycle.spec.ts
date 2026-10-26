import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { importRGB, project, undoCount, replaceSyntheticProject, observePrivacy } from './helpers';

// Native constructors, messages, computations and termination only. Observers
// never inject application state, manufacture replies, or delay computation.
const folder = 'docs/verification/v021-lifecycle-evidence';
// Keep a foreground window for actual tab-focus transitions. Playwright's
// forced focus is disabled explicitly below; never synthesize a blur event.
test.use({ headless: false });
function installLifecycleObserver() {
  const NativeWorker = globalThis.Worker;
  const records = new Map<Worker, any>();
  const events: any[] = [], pointers: any[] = [], blurs: any[] = [];
  let nextId = 0;
  const snapshot = () => [...records.values()].filter(r => r.alive).map(r => ({ ...r }));
  const log = (type: string, details: any = {}) => events.push({ t: performance.now(), type, ...details, alive: snapshot() });
  (globalThis as any).__lifecycle = { events, pointers, blurs, snapshot, mark: (label: string) => log('checkpoint', { label }) };
  for (const type of ['gotpointercapture', 'lostpointercapture', 'pointercancel', 'pointerup']) {
    document.addEventListener(type, event => {
      const e = event as PointerEvent;
      pointers.push({ type, trusted: e.isTrusted, pointerId: e.pointerId, pointerType: e.pointerType, canvas: e.target instanceof HTMLCanvasElement });
    }, true);
  }
  window.addEventListener('blur', event => blurs.push({ trusted: event.isTrusted, focused: document.hasFocus() }));
  const send = NativeWorker.prototype.postMessage, terminate = NativeWorker.prototype.terminate;
  NativeWorker.prototype.postMessage = function(message: any, ...args: any[]) {
    const r = records.get(this);
    if (r) { r.kind = message?.kind; r.op = message?.op; r.requestId = message?.id; }
    log('postMessage', { workerId: r?.workerId, kind: message?.kind, op: message?.op, requestId: message?.id,
      positions: message?.mesh?.positions ? Array.from(message.mesh.positions) : message?.payload?.mesh?.positions ? Array.from(message.payload.mesh.positions) : undefined });
    return (send as any).call(this, message, ...args);
  };
  NativeWorker.prototype.terminate = function() {
    const r = records.get(this);
    const result = terminate.call(this);
    if (r) r.alive = false;
    log('terminate', { workerId: r?.workerId });
    return result;
  };
  globalThis.Worker = new Proxy(NativeWorker, {
    construct(target, args) {
      const worker = Reflect.construct(target, args) as Worker;
      const r = { workerId: ++nextId, url: String(args[0]), category: /display\.worker-/.test(String(args[0])) ? 'display' : 'compute', alive: true };
      records.set(worker, r); log('constructor', { workerId: r.workerId, url: r.url });
      worker.addEventListener('message', event => log('response', { workerId: r.workerId, requestId: event.data?.id, ok: event.data?.ok,
        positions: event.data?.result?.mesh?.positions ? Array.from(event.data.result.mesh.positions) : event.data?.result?.positions ? Array.from(event.data.result.positions) : undefined }));
      worker.addEventListener('error', event => log('worker-error', { workerId: r.workerId, trusted: event.isTrusted }));
      return worker;
    }
  });
  const alerts = new Set<string>();
  new MutationObserver(() => {
    for (const el of document.querySelectorAll('[role="alert"]')) {
      const text = el.textContent || '';
      if (!alerts.has(text)) { alerts.add(text); log('alert', { text }); }
    }
  }).observe(document, { subtree: true, childList: true, characterData: true });
}
const state = (page: Page) => page.evaluate(() => {
  const s = (globalThis as any).__lifecycle;
  return { events: s.events, pointers: s.pointers, blurs: s.blurs, alive: s.snapshot() };
});
const mark = (page: Page, label: string) => page.evaluate(label => (globalThis as any).__lifecycle.mark(label), label);
const between = (events: any[], a: string, b?: string) => {
  const start = events.findIndex(e => e.type === 'checkpoint' && e.label === a);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = b ? events.findIndex(e => e.type === 'checkpoint' && e.label === b) : events.length;
  expect(end).toBeGreaterThan(start);
  return events.slice(start + 1, end);
};
function auditBeforeIndex(events: any[], expectedPositions: number[]) {
  const firstInit = events.findIndex(e => e.type === 'postMessage' && e.kind === 'init');
  expect(firstInit, 'index must be rebuilt').toBeGreaterThan(0);
  for (const op of ['topology', 'analyze']) {
    const i = events.findIndex(e => e.type === 'postMessage' && e.op === op);
    expect(i, `${op} must run on this mesh`).toBeGreaterThanOrEqual(0);
    const task = events[i];
    expect(task.positions).toEqual(expectedPositions);
    const response = events.findIndex((e, n) => n > i && e.type === 'response' && e.workerId === task.workerId && e.requestId === task.requestId && e.ok === true);
    const release = events.findIndex((e, n) => n > response && e.type === 'terminate' && e.workerId === task.workerId);
    expect(response).toBeGreaterThan(i);
    expect(release).toBeGreaterThan(response);
    expect(release).toBeLessThan(firstInit);
  }
}
async function comparison(page: Page) {
  await expect(page.locator('svg .reference-contour')).toHaveCount(1);
  const contour = page.locator('.section-view svg polygon:not(.reference-contour)');
  await expect(contour).toHaveCount(1);
  expect((await contour.getAttribute('points'))!.trim().split(' ').length).toBeGreaterThan(20);
  await expect(page.locator('.engine-caption')).toContainText(/Web Worker.*ms/);
  await expect.poll(async () => (await state(page)).alive.filter((w: any) => w.category === 'compute').length).toBe(2);
  return contour.getAttribute('points');
}
async function setup(page: Page) {
  await importRGB(page);
  await page.locator('.step-button').nth(3).click();
}
async function twoReaders(page: Page) {
  await page.getByLabel('Wysokość przekroju Z', { exact: true }).fill('50');
  await page.getByLabel('Porównaj z referencją roboczą 3D / 2D').check();
  return comparison(page);
}
async function prepareBrush(page: Page) {
  const enable = page.getByRole('button', { name: 'Włącz pędzel na modelu', exact: true });
  await expect(enable).toBeEnabled();
  await page.getByRole('button', { name: 'Widok z przodu', exact: true }).click();
  await expect(page.locator('.renderer-status')).toContainText(/WebGPU|WebGL2/);
  await enable.click();
  const canvas = page.locator('.three-viewport canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
async function holdMouse(page: Page, p: { x: number; y: number }) {
  const previous = (await state(page)).pointers.filter((e: any) => e.type === 'gotpointercapture').length;
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + 1, p.y);
  await expect.poll(async () => (await state(page)).pointers.filter((e: any) => e.type === 'gotpointercapture').length).toBe(previous + 1);
  const capture = (await state(page)).pointers.filter((e: any) => e.type === 'gotpointercapture').at(-1);
  expect(capture).toMatchObject({ trusted: true, canvas: true, pointerType: 'mouse' });
}
async function cancellationPreservesAndNextWorks(page: Page, before: any, history: number) {
  await expect(page.locator('.notification')).toContainText('Anulowano niezakończone pociągnięcie');
  // Bounded negative publication window, then exact public project snapshot.
  await page.waitForTimeout(1000);
  await expect(page.locator('.busy-overlay')).toHaveCount(0);
  expect((await state(page)).events.filter((e: any) => e.type === 'postMessage' && e.kind === 'stroke')).toEqual([]);
  expect(await project(page)).toEqual(before);
  expect(await undoCount(page)).toBe(history);
  // Cancellation deliberately disables the brush. Re-enable through the UI.
  const p = await prepareBrush(page);
  await holdMouse(page, p);
  for (let i = 1; i <= 5; i++) { await page.waitForTimeout(50); await page.mouse.move(p.x + i, p.y - i * 2); }
  await page.mouse.up();
  await expect(page.locator('.notification')).toContainText('Jedna rewizja i jedna pozycja cofania');
  const painted = await project(page);
  expect(painted.mesh.positions).not.toEqual(before.mesh.positions);
  expect(painted.mesh.colors).toEqual(before.mesh.colors);
  expect(painted.originalPositions).toEqual(before.originalPositions);
  expect(painted.workspace.revision).toBe(before.workspace.revision + 1);
  expect(painted.workspace.events.slice(0, -1)).toEqual(before.workspace.events);
  expect(painted.workspace.events).toHaveLength(before.workspace.events.length + 1);
  expect(painted.workspace.events.at(-1).kind).toBe('brush-relief');
  expect(painted.workspace.events.at(-1).parameters.dabCount).toBeGreaterThan(1);
  expect(painted.workspace.events.at(-1).parameters.dabCount).toBeLessThanOrEqual(128);
  expect(await undoCount(page)).toBe(history + 1);
  expect((await state(page)).events.filter((e: any) => e.type === 'postMessage' && e.kind === 'stroke')).toHaveLength(1);
  await page.getByRole('button', { name: `Cofnij (${history + 1})`, exact: true }).click();
  const restored = await project(page);
  expect(restored.mesh).toEqual(before.mesh);
  expect(restored.originalPositions).toEqual(before.originalPositions);
  expect(restored.tapes).toEqual(before.tapes);
  expect(await undoCount(page)).toBe(history);
}

test.beforeEach(async ({ page, request, browser }, info) => {
  test.setTimeout(120000);
  await mkdir(folder, { recursive: true });
  const html = await (await request.get('/')).text();
  const asset = html.match(/src="([^"]+\.js)"/)?.[1];
  expect(asset).toBeTruthy();
  const sha256 = createHash('sha256').update(await (await request.get(asset!)).body()).digest('hex');
  if (process.env.ORTHO_FROZEN_SHA) expect(sha256).toBe(process.env.ORTHO_FROZEN_SHA);
  (info as any).lifecycleOrigin = { baseURL: info.project.use.baseURL, asset, sha256, chromium: browser.version() };
  (info as any).lifecyclePrivacy = observePrivacy(page);
  await page.addInitScript(installLifecycleObserver);
});
test.afterEach(async ({ page }, info) => {
  const id = info.title.replace(/[^a-zA-Z0-9-]+/g, '-');
  const observed = await state(page).catch(error => ({ unavailable: String(error) }));
  const result = { title: info.title, status: info.status, expectedStatus: info.expectedStatus, origin: (info as any).lifecycleOrigin,
    privacy: (info as any).lifecyclePrivacy, errors: info.errors, observed };
  const path = `${folder}/${id}.json`;
  await writeFile(path, JSON.stringify(result, null, 2));
  await info.attach('native-lifecycle-evidence', { path, contentType: 'application/json' });
  await page.screenshot({ path: `${folder}/${id}.png`, fullPage: true });
});
async function clean(page: Page) {
  const privacy = (test.info() as any).lifecyclePrivacy;
  expect(privacy.errors).toEqual([]); expect(privacy.external).toEqual([]); expect(privacy.violations).toEqual([]);
  const observed = await state(page);
  expect(observed.events.filter((e: any) => e.type === 'alert')).toEqual([]);
  expect(Math.max(0, ...observed.events.map((e: any) => e.alive.filter((w: any) => w.category === 'compute').length))).toBeLessThanOrEqual(2);
}

test('native pointercancel cancels captured touch and next brush is one exact undo', async ({ page, context }) => {
  await setup(page); const before = await project(page), history = await undoCount(page);
  const p = await prepareBrush(page), cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...p, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x + 1, y: p.y, id: 1 }] });
  await expect.poll(async () => (await state(page)).pointers.filter((e: any) => e.type === 'gotpointercapture' && e.pointerType === 'touch' && e.trusted && e.canvas).length).toBe(1);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect.poll(async () => (await state(page)).pointers.filter((e: any) => e.type === 'pointercancel' && e.pointerType === 'touch' && e.trusted && e.canvas).length).toBe(1);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false }); await cdp.detach();
  await cancellationPreservesAndNextWorks(page, before, history); await clean(page);
});

test('native window blur cancels captured mouse and next brush is one exact undo', async ({ page, context }) => {
  await setup(page); const before = await project(page), history = await undoCount(page);
  // Playwright enables focus emulation on every Chromium target by default.
  // Remove that automation setting, then switch actual pages; do not dispatch blur.
  const other = await context.newPage(); await other.goto('/');
  const appCDP = await context.newCDPSession(page), otherCDP = await context.newCDPSession(other);
  await appCDP.send('Emulation.setFocusEmulationEnabled', { enabled: false });
  await otherCDP.send('Emulation.setFocusEmulationEnabled', { enabled: false });
  await page.bringToFront(); await expect.poll(() => page.evaluate(() => document.hasFocus())).toBe(true);
  const p = await prepareBrush(page); await holdMouse(page, p);
  const previous = (await state(page)).blurs.length;
  await other.bringToFront();
  await expect.poll(async () => (await state(page)).blurs.filter((e: any) => e.trusted).length).toBeGreaterThan(previous);
  expect(await page.evaluate(() => document.hasFocus())).toBe(false);
  await page.bringToFront(); await page.mouse.up(); await other.close(); await appCDP.detach();
  await cancellationPreservesAndNextWorks(page, before, history); await clean(page);
});

test('two native readers release before mutation and fresh mesh audit precedes indexes including undo and New Project', async ({ page }) => {
  await setup(page); const before = await project(page), history = await undoCount(page);
  const original = await twoReaders(page);
  const readers = (await state(page)).alive.filter((w: any) => w.category === 'compute');
  expect(readers).toHaveLength(2);
  await mark(page, 'before-zone');
  await page.getByLabel('Zmiana obwodu · %', { exact: true }).fill('-10');
  await page.getByRole('button', { name: 'Zastosuj korektę strefy' }).click();
  await expect(page.locator('.notification')).toContainText('Zmieniono obwód');
  expect(await comparison(page)).not.toBe(original); await mark(page, 'after-zone');
  const zoneEvents = between((await state(page)).events, 'before-zone', 'after-zone');
  const dispatch = zoneEvents.findIndex(e => e.type === 'postMessage' && e.op === 'zone');
  expect(dispatch).toBeGreaterThan(0);
  for (const r of readers) {
    const release = zoneEvents.findIndex(e => e.type === 'terminate' && e.workerId === r.workerId);
    expect(release).toBeGreaterThanOrEqual(0); expect(release).toBeLessThan(dispatch);
  }
  expect(zoneEvents[dispatch].alive).toHaveLength(1);
  const response = zoneEvents.find(e => e.type === 'response' && e.workerId === zoneEvents[dispatch].workerId && e.ok);
  expect(response.positions).not.toEqual(before.mesh.positions);
  auditBeforeIndex(zoneEvents, response.positions);
  await expect(page.locator('.quality-summary > summary')).toContainText('UNKNOWN');
  const changed = await project(page);
  expect(changed.mesh.positions).toEqual(response.positions); expect(changed.mesh.colors).toEqual(before.mesh.colors);
  expect(changed.originalPositions).toEqual(before.originalPositions); expect(await undoCount(page)).toBe(history + 1);
  await comparison(page); await mark(page, 'before-undo');
  await page.getByRole('button', { name: `Cofnij (${history + 1})`, exact: true }).click();
  expect(await comparison(page)).toBe(original); await mark(page, 'after-undo');
  auditBeforeIndex(between((await state(page)).events, 'before-undo', 'after-undo'), before.mesh.positions);
  await expect(page.locator('.quality-summary > summary')).toContainText('UNKNOWN');
  const restored = await project(page);
  expect(restored.mesh).toEqual(before.mesh); expect(restored.originalPositions).toEqual(before.originalPositions);
  expect(restored.workspace.revision).toBe(changed.workspace.revision + 1); expect(restored.workspace.events.at(-1).kind).toBe('undo');
  expect(await undoCount(page)).toBe(history);
  await comparison(page); const finalReaders = (await state(page)).alive;
  await mark(page, 'before-new-project');
  await page.locator('.workspace-summary > summary').click();
  await page.getByRole('button', { name: 'Nowy projekt', exact: true }).click(); await replaceSyntheticProject(page);
  await expect(page.locator('.case-label')).toContainText('r0 · Nowy projekt');
  await expect(page.locator('.empty-viewport')).toBeVisible();
  await expect.poll(async () => (await state(page)).alive.length).toBe(0);
  await page.waitForTimeout(1000); // Reject delayed reader recreation after reset.
  expect((await state(page)).alive).toEqual([]);
  const afterNew = between((await state(page)).events, 'before-new-project');
  for (const r of finalReaders) expect(afterNew.some(e => e.type === 'terminate' && e.workerId === r.workerId)).toBe(true);
  expect(afterNew.filter(e => e.type === 'postMessage' && e.kind === 'init')).toEqual([]);
  await clean(page);
});

for (const failedAudit of ['topology', 'analyze'] as const) test(`deliberate native module-load fault in ${failedAudit} refuses indexes and user action recovers without revision loss`, async ({ page }) => {
  await setup(page); const before = await project(page), history = await undoCount(page);
  await twoReaders(page); await mark(page, 'before-fault');
  // Explicit fault injection: abort the real compute Worker module request, not
  // its constructor/postMessage/replies. Native Worker.onerror must be observed.
  let modules = 0, blocked = 0;
  const faultOrdinal = failedAudit === 'topology' ? 2 : 3; // zone, topology, analyze
  const routePattern = /\/assets\/worker-[^/]+\.js(?:\?.*)?$/;
  await page.route(routePattern, async route => {
    modules++;
    if (modules >= faultOrdinal) { blocked++; await route.abort('failed'); }
    else await route.continue();
  });
  await page.getByLabel('Zmiana obwodu · %', { exact: true }).fill('-10');
  await page.getByRole('button', { name: 'Zastosuj korektę strefy' }).click();
  await expect(page.getByRole('alert')).toContainText('Błąd silnika Worker');
  expect(blocked).toBe(1);
  await expect.poll(async () => (await state(page)).events.filter((e: any) => e.type === 'worker-error' && e.trusted).length).toBe(1);
  await page.waitForTimeout(750); await mark(page, 'fault-observed');
  let faultEvents = between((await state(page)).events, 'before-fault', 'fault-observed');
  const failedTask = faultEvents.find(e => e.type === 'postMessage' && e.op === failedAudit);
  expect(failedTask).toBeTruthy();
  expect(faultEvents.some(e => e.type === 'worker-error' && e.workerId === failedTask.workerId)).toBe(true);
  expect(faultEvents.filter(e => e.type === 'postMessage' && e.kind === 'init')).toEqual([]);
  expect((await state(page)).alive).toEqual([]);
  await expect(page.locator('svg .reference-contour')).toHaveCount(0);
  await expect(page.locator('.section-view svg polygon:not(.reference-contour)')).toHaveCount(0);
  await expect(page.locator('.case-label')).toContainText(`r${before.workspace.revision + 1}`);
  const changedPositions = faultEvents.find(e => e.type === 'response' && e.positions)?.positions;
  expect(changedPositions).toBeTruthy(); expect(changedPositions).not.toEqual(before.mesh.positions);
  // Keep fault active while taking the exact public snapshot, so the download
  // cannot accidentally prove recovery before loading is explicitly restored.
  const failedState = await project(page);
  expect(failedState.mesh.positions).toEqual(changedPositions);
  expect(failedState.mesh.colors).toEqual(before.mesh.colors);
  expect(failedState.originalPositions).toEqual(before.originalPositions);
  expect(failedState.workspace.revision).toBe(before.workspace.revision + 1);
  expect(failedState.workspace.events.slice(0, -1)).toEqual(before.workspace.events);
  expect(failedState.workspace.events.at(-1).kind).toBe('scale-zone');
  expect(await undoCount(page)).toBe(history + 1);
  // Wait for the download-triggered audit attempt to fail before recovery.
  await expect.poll(() => blocked).toBeGreaterThan(1);
  await expect.poll(async () => (await state(page)).alive.length).toBe(0);
  await mark(page, 'before-recovery'); await page.unroute(routePattern);
  // User action: another real project download toggles busy and retries audit.
  const recoveredState = await project(page); expect(recoveredState).toEqual(failedState);
  await comparison(page); await expect(page.getByRole('alert')).toHaveCount(0); await mark(page, 'after-recovery');
  auditBeforeIndex(between((await state(page)).events, 'before-recovery', 'after-recovery'), changedPositions);
  await expect(page.locator('.quality-summary > summary')).toContainText('UNKNOWN');
  expect(await undoCount(page)).toBe(history + 1);
  faultEvents = between((await state(page)).events, 'before-fault', 'before-recovery');
  expect(faultEvents.filter(e => e.type === 'postMessage' && e.kind === 'init')).toEqual([]);
  const privacy = (test.info() as any).lifecyclePrivacy;
  expect(privacy.errors).toEqual([]); expect(privacy.external).toEqual([]); expect(privacy.violations).toEqual([]);
  const alerts = (await state(page)).events.filter((e: any) => e.type === 'alert');
  expect(alerts.length).toBeGreaterThan(0);
  for (const alert of alerts) expect(alert.text).toContain('Błąd silnika Worker');
});
