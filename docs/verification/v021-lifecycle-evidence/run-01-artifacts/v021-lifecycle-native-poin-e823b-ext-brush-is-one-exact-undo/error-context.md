# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: v021-lifecycle.spec.ts >> native pointercancel cancels captured touch and next brush is one exact undo
- Location: e2e\v021-lifecycle.spec.ts:184:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('.notification')
Expected substring: "Jedna rewizja i jedna pozycja cofania"
Received string:    "Pobrano kopię rewizji r2. Sprawdź plik w folderze pobierania; przeglądarka nie potwierdza trwałego zapisu na dysku."
Timeout: 15000ms

Call log:
  - Expect "toContainText" locator('.notification') with timeout 15000ms
  - waiting for locator('.notification')
    31 × locator resolved to <div role="status" class="notification ">…</div>
       - unexpected value "Pobrano kopię rewizji r2. Sprawdź plik w folderze pobierania; przeglądarka nie potwierdza trwałego zapisu na dysku."

```

```yaml
- status:
  - img
  - text: Pobrano kopię rewizji r2. Sprawdź plik w folderze pobierania; przeglądarka nie potwierdza trwałego zapisu na dysku.
  - button "Zamknij komunikat":
    - img
```

# Test source

```ts
  33  |     const r = records.get(this);
  34  |     const result = terminate.call(this);
  35  |     if (r) r.alive = false;
  36  |     log('terminate', { workerId: r?.workerId });
  37  |     return result;
  38  |   };
  39  |   globalThis.Worker = new Proxy(NativeWorker, {
  40  |     construct(target, args) {
  41  |       const worker = Reflect.construct(target, args) as Worker;
  42  |       const r = { workerId: ++nextId, url: String(args[0]), category: /display\.worker-/.test(String(args[0])) ? 'display' : 'compute', alive: true };
  43  |       records.set(worker, r); log('constructor', { workerId: r.workerId, url: r.url });
  44  |       worker.addEventListener('message', event => log('response', { workerId: r.workerId, requestId: event.data?.id, ok: event.data?.ok,
  45  |         positions: event.data?.result?.mesh?.positions ? Array.from(event.data.result.mesh.positions) : undefined }));
  46  |       worker.addEventListener('error', event => log('worker-error', { workerId: r.workerId, trusted: event.isTrusted }));
  47  |       return worker;
  48  |     }
  49  |   });
  50  |   const alerts = new Set<string>();
  51  |   new MutationObserver(() => {
  52  |     for (const el of document.querySelectorAll('[role="alert"]')) {
  53  |       const text = el.textContent || '';
  54  |       if (!alerts.has(text)) { alerts.add(text); log('alert', { text }); }
  55  |     }
  56  |   }).observe(document, { subtree: true, childList: true, characterData: true });
  57  | }
  58  | const state = (page: Page) => page.evaluate(() => {
  59  |   const s = (globalThis as any).__lifecycle;
  60  |   return { events: s.events, pointers: s.pointers, blurs: s.blurs, alive: s.snapshot() };
  61  | });
  62  | const mark = (page: Page, label: string) => page.evaluate(label => (globalThis as any).__lifecycle.mark(label), label);
  63  | const between = (events: any[], a: string, b?: string) => {
  64  |   const start = events.findIndex(e => e.type === 'checkpoint' && e.label === a);
  65  |   expect(start).toBeGreaterThanOrEqual(0);
  66  |   const end = b ? events.findIndex(e => e.type === 'checkpoint' && e.label === b) : events.length;
  67  |   expect(end).toBeGreaterThan(start);
  68  |   return events.slice(start + 1, end);
  69  | };
  70  | function auditBeforeIndex(events: any[], expectedPositions: number[]) {
  71  |   const firstInit = events.findIndex(e => e.type === 'postMessage' && e.kind === 'init');
  72  |   expect(firstInit, 'index must be rebuilt').toBeGreaterThan(0);
  73  |   for (const op of ['topology', 'analyze']) {
  74  |     const i = events.findIndex(e => e.type === 'postMessage' && e.op === op);
  75  |     expect(i, `${op} must run on this mesh`).toBeGreaterThanOrEqual(0);
  76  |     const task = events[i];
  77  |     expect(task.positions).toEqual(expectedPositions);
  78  |     const response = events.findIndex((e, n) => n > i && e.type === 'response' && e.workerId === task.workerId && e.requestId === task.requestId && e.ok === true);
  79  |     const release = events.findIndex((e, n) => n > response && e.type === 'terminate' && e.workerId === task.workerId);
  80  |     expect(response).toBeGreaterThan(i);
  81  |     expect(release).toBeGreaterThan(response);
  82  |     expect(release).toBeLessThan(firstInit);
  83  |   }
  84  | }
  85  | async function comparison(page: Page) {
  86  |   await expect(page.locator('svg .reference-contour')).toHaveCount(1);
  87  |   const contour = page.locator('.section-view svg polygon:not(.reference-contour)');
  88  |   await expect(contour).toHaveCount(1);
  89  |   expect((await contour.getAttribute('points'))!.trim().split(' ').length).toBeGreaterThan(20);
  90  |   await expect(page.locator('.engine-caption')).toContainText(/Web Worker.*ms/);
  91  |   await expect.poll(async () => (await state(page)).alive.filter((w: any) => w.category === 'compute').length).toBe(2);
  92  |   return contour.getAttribute('points');
  93  | }
  94  | async function setup(page: Page) {
  95  |   await importRGB(page);
  96  |   await page.locator('.step-button').nth(3).click();
  97  | }
  98  | async function twoReaders(page: Page) {
  99  |   await page.getByLabel('Wysokość przekroju Z', { exact: true }).fill('50');
  100 |   await page.getByLabel('Porównaj z referencją roboczą 3D / 2D').check();
  101 |   return comparison(page);
  102 | }
  103 | async function prepareBrush(page: Page) {
  104 |   const enable = page.getByRole('button', { name: 'Włącz pędzel na modelu', exact: true });
  105 |   await expect(enable).toBeEnabled();
  106 |   await page.getByRole('button', { name: 'Widok z przodu', exact: true }).click();
  107 |   await expect(page.locator('.renderer-status')).toContainText(/WebGPU|WebGL2/);
  108 |   await enable.click();
  109 |   const canvas = page.locator('.three-viewport canvas');
  110 |   await canvas.scrollIntoViewIfNeeded();
  111 |   const box = (await canvas.boundingBox())!;
  112 |   return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  113 | }
  114 | async function holdMouse(page: Page, p: { x: number; y: number }) {
  115 |   const previous = (await state(page)).pointers.filter((e: any) => e.type === 'gotpointercapture').length;
  116 |   await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + 1, p.y);
  117 |   await expect.poll(async () => (await state(page)).pointers.filter((e: any) => e.type === 'gotpointercapture').length).toBe(previous + 1);
  118 | }
  119 | async function cancellationPreservesAndNextWorks(page: Page, before: any, history: number) {
  120 |   // Bounded negative publication window, then exact public project snapshot.
  121 |   await page.waitForTimeout(1000);
  122 |   await expect(page.locator('.busy-overlay')).toHaveCount(0);
  123 |   expect((await state(page)).events.filter((e: any) => e.type === 'postMessage' && e.kind === 'stroke')).toEqual([]);
  124 |   expect(await project(page)).toEqual(before);
  125 |   expect(await undoCount(page)).toBe(history);
  126 |   // The cancellation does not toggle brush mode; use a fresh native gesture.
  127 |   const canvas = page.locator('.three-viewport canvas');
  128 |   await canvas.scrollIntoViewIfNeeded(); const box = (await canvas.boundingBox())!;
  129 |   const p = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  130 |   await holdMouse(page, p);
  131 |   for (let i = 1; i <= 5; i++) { await page.waitForTimeout(50); await page.mouse.move(p.x + i, p.y - i * 2); }
  132 |   await page.mouse.up();
> 133 |   await expect(page.locator('.notification')).toContainText('Jedna rewizja i jedna pozycja cofania');
      |                                               ^ Error: expect(locator).toContainText(expected) failed
  134 |   const painted = await project(page);
  135 |   expect(painted.mesh.positions).not.toEqual(before.mesh.positions);
  136 |   expect(painted.mesh.colors).toEqual(before.mesh.colors);
  137 |   expect(painted.originalPositions).toEqual(before.originalPositions);
  138 |   expect(painted.workspace.revision).toBe(before.workspace.revision + 1);
  139 |   expect(painted.workspace.events.slice(0, -1)).toEqual(before.workspace.events);
  140 |   expect(painted.workspace.events).toHaveLength(before.workspace.events.length + 1);
  141 |   expect(painted.workspace.events.at(-1).kind).toBe('brush-relief');
  142 |   expect(painted.workspace.events.at(-1).parameters.dabCount).toBeGreaterThan(1);
  143 |   expect(painted.workspace.events.at(-1).parameters.dabCount).toBeLessThanOrEqual(128);
  144 |   expect(await undoCount(page)).toBe(history + 1);
  145 |   expect((await state(page)).events.filter((e: any) => e.type === 'postMessage' && e.kind === 'stroke')).toHaveLength(1);
  146 |   await page.getByRole('button', { name: `Cofnij (${history + 1})`, exact: true }).click();
  147 |   const restored = await project(page);
  148 |   expect(restored.mesh).toEqual(before.mesh);
  149 |   expect(restored.originalPositions).toEqual(before.originalPositions);
  150 |   expect(restored.tapes).toEqual(before.tapes);
  151 |   expect(await undoCount(page)).toBe(history);
  152 | }
  153 | 
  154 | test.beforeEach(async ({ page, request, browser }, info) => {
  155 |   test.setTimeout(120000);
  156 |   await mkdir(folder, { recursive: true });
  157 |   const html = await (await request.get('/')).text();
  158 |   const asset = html.match(/src="([^"]+\.js)"/)?.[1];
  159 |   expect(asset).toBeTruthy();
  160 |   const sha256 = createHash('sha256').update(await (await request.get(asset!)).body()).digest('hex');
  161 |   if (process.env.ORTHO_FROZEN_SHA) expect(sha256).toBe(process.env.ORTHO_FROZEN_SHA);
  162 |   (info as any).lifecycleOrigin = { baseURL: info.project.use.baseURL, asset, sha256, chromium: browser.version() };
  163 |   (info as any).lifecyclePrivacy = observePrivacy(page);
  164 |   await page.addInitScript(installLifecycleObserver);
  165 | });
  166 | test.afterEach(async ({ page }, info) => {
  167 |   const id = info.title.replace(/[^a-zA-Z0-9-]+/g, '-');
  168 |   const observed = await state(page).catch(error => ({ unavailable: String(error) }));
  169 |   const result = { title: info.title, status: info.status, expectedStatus: info.expectedStatus, origin: (info as any).lifecycleOrigin,
  170 |     privacy: (info as any).lifecyclePrivacy, errors: info.errors, observed };
  171 |   const path = `${folder}/${id}.json`;
  172 |   await writeFile(path, JSON.stringify(result, null, 2));
  173 |   await info.attach('native-lifecycle-evidence', { path, contentType: 'application/json' });
  174 |   await page.screenshot({ path: `${folder}/${id}.png`, fullPage: true });
  175 | });
  176 | async function clean(page: Page) {
  177 |   const privacy = (test.info() as any).lifecyclePrivacy;
  178 |   expect(privacy.errors).toEqual([]); expect(privacy.external).toEqual([]); expect(privacy.violations).toEqual([]);
  179 |   const observed = await state(page);
  180 |   expect(observed.events.filter((e: any) => e.type === 'alert')).toEqual([]);
  181 |   expect(Math.max(0, ...observed.events.map((e: any) => e.alive.filter((w: any) => w.category === 'compute').length))).toBeLessThanOrEqual(2);
  182 | }
  183 | 
  184 | test('native pointercancel cancels captured touch and next brush is one exact undo', async ({ page, context }) => {
  185 |   await setup(page); const before = await project(page), history = await undoCount(page);
  186 |   const p = await prepareBrush(page), cdp = await context.newCDPSession(page);
  187 |   await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  188 |   await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...p, id: 1 }] });
  189 |   await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x + 1, y: p.y, id: 1 }] });
  190 |   await expect.poll(async () => (await state(page)).pointers.filter((e: any) => e.type === 'gotpointercapture' && e.pointerType === 'touch' && e.trusted && e.canvas).length).toBe(1);
  191 |   await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  192 |   await expect.poll(async () => (await state(page)).pointers.filter((e: any) => e.type === 'pointercancel' && e.pointerType === 'touch' && e.trusted && e.canvas).length).toBe(1);
  193 |   await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false }); await cdp.detach();
  194 |   await cancellationPreservesAndNextWorks(page, before, history); await clean(page);
  195 | });
  196 | 
  197 | test('native window blur cancels captured mouse and next brush is one exact undo', async ({ page, context }) => {
  198 |   await setup(page); const before = await project(page), history = await undoCount(page);
  199 |   const p = await prepareBrush(page); await holdMouse(page, p);
  200 |   const other = await context.newPage(); await other.goto('/'); await other.bringToFront();
  201 |   await expect.poll(async () => (await state(page)).blurs.filter((e: any) => e.trusted).length).toBeGreaterThan(0);
  202 |   expect(await page.evaluate(() => document.hasFocus())).toBe(false);
  203 |   await page.bringToFront(); await page.mouse.up(); await other.close();
  204 |   await cancellationPreservesAndNextWorks(page, before, history); await clean(page);
  205 | });
  206 | 
  207 | test('two native readers release before mutation and fresh mesh audit precedes indexes including undo and New Project', async ({ page }) => {
  208 |   await setup(page); const before = await project(page), history = await undoCount(page);
  209 |   const original = await twoReaders(page);
  210 |   const readers = (await state(page)).alive.filter((w: any) => w.category === 'compute');
  211 |   expect(readers).toHaveLength(2);
  212 |   await mark(page, 'before-zone');
  213 |   await page.getByLabel('Zmiana obwodu · %', { exact: true }).fill('-10');
  214 |   await page.getByRole('button', { name: 'Zastosuj korektę strefy' }).click();
  215 |   await expect(page.locator('.notification')).toContainText('Zmieniono obwód');
  216 |   expect(await comparison(page)).not.toBe(original); await mark(page, 'after-zone');
  217 |   const zoneEvents = between((await state(page)).events, 'before-zone', 'after-zone');
  218 |   const dispatch = zoneEvents.findIndex(e => e.type === 'postMessage' && e.op === 'zone');
  219 |   expect(dispatch).toBeGreaterThan(0);
  220 |   for (const r of readers) {
  221 |     const release = zoneEvents.findIndex(e => e.type === 'terminate' && e.workerId === r.workerId);
  222 |     expect(release).toBeGreaterThanOrEqual(0); expect(release).toBeLessThan(dispatch);
  223 |   }
  224 |   expect(zoneEvents[dispatch].alive).toHaveLength(1);
  225 |   const response = zoneEvents.find(e => e.type === 'response' && e.workerId === zoneEvents[dispatch].workerId && e.ok);
  226 |   expect(response.positions).not.toEqual(before.mesh.positions);
  227 |   auditBeforeIndex(zoneEvents, response.positions);
  228 |   await expect(page.locator('.quality-summary > summary')).toContainText('UNKNOWN');
  229 |   const changed = await project(page);
  230 |   expect(changed.mesh.positions).toEqual(response.positions); expect(changed.mesh.colors).toEqual(before.mesh.colors);
  231 |   expect(changed.originalPositions).toEqual(before.originalPositions); expect(await undoCount(page)).toBe(history + 1);
  232 |   await comparison(page); await mark(page, 'before-undo');
  233 |   await page.getByRole('button', { name: `Cofnij (${history + 1})`, exact: true }).click();
```