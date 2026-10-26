# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: v021-lifecycle.spec.ts >> two native readers release before mutation and fresh mesh audit precedes indexes including undo and New Project
- Location: e2e\v021-lifecycle.spec.ts:207:1

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

Expected: undefined
Received: [18, 0, 0, 17.65413475036621, 3.5116257667541504, 0, 16.629831314086914, 6.888301849365234, 0, 14.966453552246094, …]
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - button "Wybierz skan i lokalne tekstury" [ref=e4]
  - button "Wybierz zapisany projekt" [ref=e5]
  - banner [ref=e6]:
    - link "OrthoSculpt — import" [ref=e7] [cursor=pointer]:
      - /url: "#"
      - generic [ref=e13]:
        - text: OrthoSculpt
        - superscript [ref=e14]: CAD
    - generic [ref=e16]:
      - generic [ref=e17]: PRZESTRZEŃ ROBOCZA
      - strong [ref=e18]: CASE · r3 · Skan lokalny
      - generic [ref=e19]: Zmiany bez kopii bieżącej rewizji
    - generic [ref=e20]:
      - generic [ref=e21]:
        - text: Działa lokalnie
        - generic [ref=e23]: · offline
      - button "Otwórz projekt" [ref=e24] [cursor=pointer]
      - button "Zapisz projekt" [ref=e27] [cursor=pointer]
      - button "Pomoc" [ref=e33] [cursor=pointer]
  - generic [ref=e37]:
    - complementary "Etapy projektu" [ref=e38]:
      - generic [ref=e39]: PROCES PROJEKTOWANIA
      - navigation [ref=e40]:
        - button "01 Import i kontrola Skan i jednostki" [ref=e41] [cursor=pointer]:
          - generic [ref=e46]:
            - generic [ref=e47]: "01"
            - strong [ref=e48]: Import i kontrola
            - generic [ref=e49]: Skan i jednostki
        - button "02 Orientacja Układ anatomiczny" [ref=e50] [cursor=pointer]:
          - generic [ref=e55]:
            - generic [ref=e56]: "02"
            - strong [ref=e57]: Orientacja
            - generic [ref=e58]: Układ anatomiczny
        - button "03 Pomiary Przekroje i kalibracja" [ref=e59] [cursor=pointer]:
          - generic [ref=e67]:
            - generic [ref=e68]: "03"
            - strong [ref=e69]: Pomiary
            - generic [ref=e70]: Przekroje i kalibracja
        - button "04 Rektyfikacja Kontrolowana korekta" [ref=e71] [cursor=pointer]:
          - generic [ref=e74]:
            - generic [ref=e75]: "04"
            - strong [ref=e76]: Rektyfikacja
            - generic [ref=e77]: Kontrolowana korekta
        - button "05 Eksport Model i dokumentacja" [ref=e80] [cursor=pointer]:
          - generic [ref=e85]:
            - generic [ref=e86]: "05"
            - strong [ref=e87]: Eksport
            - generic [ref=e88]: Model i dokumentacja
      - generic [ref=e89]:
        - generic [ref=e90]: WERSJA BADAWCZA
        - paragraph [ref=e93]: Narzędzie inżynierskie.Nie zastępuje oceny klinicznej ani walidacji wytwarzania.
        - generic [ref=e94]: Pliki pozostają na urządzeniu.
    - main [ref=e99]:
      - generic [ref=e100]:
        - generic [ref=e101]:
          - generic [ref=e102]:
            - text: Projekt
            - generic [ref=e105]: Krok 04 / 05
          - heading "Rektyfikacja" [level=1] [ref=e106]
          - paragraph [ref=e107]: Modyfikuj powierzchnię, zachowując punkt odniesienia.
        - generic [ref=e108]: Plik lokalny
      - generic [ref=e110]:
        - generic [ref=e111]:
          - region "Widok modelu" [ref=e112]:
            - generic [ref=e113]:
              - generic [ref=e114]: Model powierzchniowy
              - generic [ref=e120]:
                - button "Widok izometryczny" [ref=e121] [cursor=pointer]
                - button "Widok z przodu" [ref=e125] [cursor=pointer]: PRZ
                - button "Widok z boku" [ref=e126] [cursor=pointer]: BOK
                - button "Przełącz siatkę trójkątów" [ref=e127] [cursor=pointer]
                - button "Dopasuj model do widoku" [ref=e134] [cursor=pointer]
            - generic [ref=e140]:
              - region "Obszar roboczy 3D" [ref=e141]:
                - generic "Interaktywny model 3D — obrót, zoom i narzędzia powierzchniowe" [ref=e142]
              - generic: Perspektywa · widok 3D
              - generic "Osie modelu":
                - generic: Z
                - generic: "Y"
                - generic: X
            - generic [ref=e143]:
              - generic [ref=e144]:
                - text: "Obrót: przeciągnij"
                - generic [ref=e147]: ·
                - text: "Zoom: kółko"
                - generic [ref=e148]: ·
                - text: "Przesunięcie: prawy przycisk"
              - generic [ref=e149]: WebGL2
          - status [ref=e151]:
            - generic [ref=e155]: Zmieniono obwód -10% w strefie Z. Nie jest to procent objętości ani zalecenie kliniczne.
            - button "Zamknij komunikat" [ref=e156] [cursor=pointer]
        - complementary "Narzędzia bieżącego kroku" [ref=e160]:
          - generic [ref=e161]:
            - heading "Rektyfikacja" [level=2] [ref=e163]
            - generic [ref=e164]: "04"
          - group [ref=e165]:
            - group [ref=e166]:
              - generic "CASE · strona ? · r3" [ref=e167] [cursor=pointer]
              - option "Nieokreślona" [selected]
              - option "Lewa"
              - option "Prawa"
              - option "Brak informacji" [selected]
              - option "Z linerem"
              - option "Bez linera"
            - group [ref=e168]:
              - generic "Jakość · UNKNOWN" [ref=e169] [cursor=pointer]
            - generic [ref=e170]:
              - generic [ref=e171]:
                - heading "Przekrój poprzeczny" [level=3] [ref=e172]
                - generic [ref=e173]: mm
              - generic [ref=e174]:
                - generic [ref=e175]: Wysokość Z · 50,0 mm
                - slider "Wysokość przekroju Z" [ref=e176] [cursor=pointer]: "50"
              - generic [ref=e177]:
                - generic [ref=e178]: 0,0
                - generic [ref=e179]: 100,0
              - generic [ref=e180] [cursor=pointer]:
                - checkbox "Porównaj z referencją roboczą 3D / 2D" [checked] [ref=e181]
                - generic [ref=e182]: Porównaj z referencją roboczą 3D / 2D
              - paragraph [ref=e183]: Referencja po ostatniej orientacji / kalibracji, nie surowy skan. Oba kontury na tym samym Z.
              - generic [ref=e184]:
                - generic [ref=e185]:
                  - generic [ref=e186]: PRZEKRÓJ XY
                  - generic [ref=e187]: Z 50,0 mm
                - img "Rzeczywisty przekrój poprzeczny modelu" [ref=e188]
                - generic [ref=e192]:
                  - generic [ref=e193]: CAD — mięta
                  - generic [ref=e194]: Referencja robocza — bursztyn
                  - paragraph [ref=e195]: "Δ obwodu: -12,5 mm · ref 125,5 mm"
                - generic [ref=e196]:
                  - generic [ref=e197]:
                    - generic [ref=e198]: Obwód
                    - strong [ref=e199]:
                      - text: 112,9
                      - emphasis [ref=e200]: mm
                  - generic [ref=e201]:
                    - generic [ref=e202]: Pole
                    - strong [ref=e203]:
                      - text: 1011,3
                      - emphasis [ref=e204]: mm²
                  - generic [ref=e205]:
                    - generic [ref=e206]: AP
                    - strong [ref=e207]:
                      - text: 36,0
                      - emphasis [ref=e208]: mm
                  - generic [ref=e209]:
                    - generic [ref=e210]: ML
                    - strong [ref=e211]:
                      - text: 36,0
                      - emphasis [ref=e212]: mm
              - paragraph [ref=e213]: Web Worker · lokalny indeks · zapytanie 0,70 ms
            - generic [ref=e214]:
              - heading "Pędzel powierzchniowy" [level=3] [ref=e216]
              - generic [ref=e222]:
                - button "Odciążenie" [ref=e223] [cursor=pointer]
                - button "Kompresja" [ref=e224] [cursor=pointer]
                - button "Wygładzanie" [ref=e225] [cursor=pointer]
              - generic [ref=e226]:
                - generic [ref=e227]: Promień · 20 mm
                - slider "Promień pędzla" [ref=e228] [cursor=pointer]: "20"
              - generic [ref=e229]:
                - generic [ref=e230]: Siła · 1,0 mm / krok
                - slider "Siła pędzla" [ref=e231] [cursor=pointer]: "1"
              - button "Włącz pędzel na modelu" [ref=e232] [cursor=pointer]
              - paragraph [ref=e235]: Zaznacz pociągnięcie na powierzchni. Po puszczeniu przycisku Worker obliczy i opublikuje całą korektę naraz. Do 128 punktów w pociągnięciu; możesz anulować obliczenie. Podgląd geometrii nie zmienia się w trakcie gestu.
              - generic [ref=e236]:
                - button "Cofnij (2)" [ref=e237] [cursor=pointer]
                - button "Reset bazy" [ref=e241] [cursor=pointer]
              - generic [ref=e245] [cursor=pointer]:
                - checkbox "Podpisana mapa deformacji" [ref=e246]
                - generic [ref=e247]: Podpisana mapa deformacji
            - generic [ref=e248]:
              - heading "Korekta obwodu w strefie" [level=3] [ref=e249]
              - generic [ref=e250]:
                - generic [ref=e251]:
                  - generic [ref=e252]: Z min · mm
                  - spinbutton "Z min · mm" [ref=e253]: "0"
                - generic [ref=e254]:
                  - generic [ref=e255]: Z max · mm
                  - spinbutton "Z max · mm" [ref=e256]: "100"
              - generic [ref=e257]:
                - generic [ref=e258]: Zmiana obwodu · %
                - spinbutton "Zmiana obwodu · %" [ref=e259]: "-10"
                - generic [ref=e260]: − kompresja / + powiększenie promieniowe
              - button "Zastosuj korektę strefy" [ref=e261] [cursor=pointer]
      - generic [ref=e263]:
        - generic [ref=e264]:
          - text: 354 wierzchołków
          - generic [ref=e266]: /
          - text: 704 trójkątów
          - generic [ref=e267]: /
          - text: mm
        - generic [ref=e268]:
          - button "Wstecz" [ref=e269] [cursor=pointer]
          - 'button "Dalej: Eksport" [ref=e272] [cursor=pointer]'
```

# Test source

```ts
  1   | import { test, expect, type Page, type TestInfo } from '@playwright/test';
  2   | import { mkdir, writeFile } from 'node:fs/promises';
  3   | import { createHash } from 'node:crypto';
  4   | import { importRGB, project, undoCount, replaceSyntheticProject, observePrivacy } from './helpers';
  5   | 
  6   | // Native constructors, messages, computations and termination only. Observers
  7   | // never inject application state, manufacture replies, or delay computation.
  8   | const folder = 'docs/verification/v021-lifecycle-evidence';
  9   | function installLifecycleObserver() {
  10  |   const NativeWorker = globalThis.Worker;
  11  |   const records = new Map<Worker, any>();
  12  |   const events: any[] = [], pointers: any[] = [], blurs: any[] = [];
  13  |   let nextId = 0;
  14  |   const snapshot = () => [...records.values()].filter(r => r.alive).map(r => ({ ...r }));
  15  |   const log = (type: string, details: any = {}) => events.push({ t: performance.now(), type, ...details, alive: snapshot() });
  16  |   (globalThis as any).__lifecycle = { events, pointers, blurs, snapshot, mark: (label: string) => log('checkpoint', { label }) };
  17  |   for (const type of ['gotpointercapture', 'lostpointercapture', 'pointercancel', 'pointerup']) {
  18  |     document.addEventListener(type, event => {
  19  |       const e = event as PointerEvent;
  20  |       pointers.push({ type, trusted: e.isTrusted, pointerId: e.pointerId, pointerType: e.pointerType, canvas: e.target instanceof HTMLCanvasElement });
  21  |     }, true);
  22  |   }
  23  |   window.addEventListener('blur', event => blurs.push({ trusted: event.isTrusted, focused: document.hasFocus() }));
  24  |   const send = NativeWorker.prototype.postMessage, terminate = NativeWorker.prototype.terminate;
  25  |   NativeWorker.prototype.postMessage = function(message: any, ...args: any[]) {
  26  |     const r = records.get(this);
  27  |     if (r) { r.kind = message?.kind; r.op = message?.op; r.requestId = message?.id; }
  28  |     log('postMessage', { workerId: r?.workerId, kind: message?.kind, op: message?.op, requestId: message?.id,
  29  |       positions: message?.mesh?.positions ? Array.from(message.mesh.positions) : message?.payload?.mesh?.positions ? Array.from(message.payload.mesh.positions) : undefined });
  30  |     return (send as any).call(this, message, ...args);
  31  |   };
  32  |   NativeWorker.prototype.terminate = function() {
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
> 77  |     expect(task.positions).toEqual(expectedPositions);
      |                            ^ Error: expect(received).toEqual(expected) // deep equality
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
  133 |   await expect(page.locator('.notification')).toContainText('Jedna rewizja i jedna pozycja cofania');
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
```