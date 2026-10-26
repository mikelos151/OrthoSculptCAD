# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: v021-lifecycle.spec.ts >> native window blur cancels captured mouse and next brush is one exact undo
- Location: e2e\v021-lifecycle.spec.ts:198:1

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 0
Received:   0

Call Log:
- Timeout 15000ms exceeded while waiting on the predicate
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
      - strong [ref=e18]: CASE · r2 · Skan lokalny
      - generic [ref=e19]: Kopia rewizji pobrana — sprawdź dysk
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
        - button "03 Pomiary Przekroje i kalibracja" [active] [ref=e59] [cursor=pointer]:
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
              - generic [ref=e149]: WebGPU
          - status [ref=e151]:
            - generic [ref=e155]: Anulowano niezakończone pociągnięcie. Geometria i historia gestu nie zostały zmienione.
            - button "Zamknij komunikat" [ref=e156] [cursor=pointer]
        - complementary "Narzędzia bieżącego kroku" [ref=e160]:
          - generic [ref=e161]:
            - heading "Rektyfikacja" [level=2] [ref=e163]
            - generic [ref=e164]: "04"
          - group [ref=e165]:
            - group [ref=e166]:
              - generic "CASE · strona ? · r2" [ref=e167] [cursor=pointer]
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
                - checkbox "Porównaj z referencją roboczą 3D / 2D" [ref=e181]
                - generic [ref=e182]: Porównaj z referencją roboczą 3D / 2D
              - paragraph [ref=e183]: Referencja po ostatniej orientacji / kalibracji, nie surowy skan. Oba kontury na tym samym Z.
              - generic [ref=e184]:
                - generic [ref=e185]:
                  - generic [ref=e186]: PRZEKRÓJ XY
                  - generic [ref=e187]: Z 50,0 mm
                - img "Rzeczywisty przekrój poprzeczny modelu" [ref=e188]
                - generic [ref=e191]:
                  - generic [ref=e192]:
                    - generic [ref=e193]: Obwód
                    - strong [ref=e194]:
                      - text: 125,5
                      - emphasis [ref=e195]: mm
                  - generic [ref=e196]:
                    - generic [ref=e197]: Pole
                    - strong [ref=e198]:
                      - text: 1248,6
                      - emphasis [ref=e199]: mm²
                  - generic [ref=e200]:
                    - generic [ref=e201]: AP
                    - strong [ref=e202]:
                      - text: 40,0
                      - emphasis [ref=e203]: mm
                  - generic [ref=e204]:
                    - generic [ref=e205]: ML
                    - strong [ref=e206]:
                      - text: 40,0
                      - emphasis [ref=e207]: mm
              - paragraph [ref=e208]: Web Worker · lokalny indeks · zapytanie 0,80 ms
            - generic [ref=e209]:
              - heading "Pędzel powierzchniowy" [level=3] [ref=e211]
              - generic [ref=e217]:
                - button "Odciążenie" [ref=e218] [cursor=pointer]
                - button "Kompresja" [ref=e219] [cursor=pointer]
                - button "Wygładzanie" [ref=e220] [cursor=pointer]
              - generic [ref=e221]:
                - generic [ref=e222]: Promień · 20 mm
                - slider "Promień pędzla" [ref=e223] [cursor=pointer]: "20"
              - generic [ref=e224]:
                - generic [ref=e225]: Siła · 1,0 mm / krok
                - slider "Siła pędzla" [ref=e226] [cursor=pointer]: "1"
              - button "Włącz pędzel na modelu" [ref=e227] [cursor=pointer]
              - paragraph [ref=e230]: Zaznacz pociągnięcie na powierzchni. Po puszczeniu przycisku Worker obliczy i opublikuje całą korektę naraz. Do 128 punktów w pociągnięciu; możesz anulować obliczenie. Podgląd geometrii nie zmienia się w trakcie gestu.
              - generic [ref=e231]:
                - button "Cofnij (1)" [ref=e232] [cursor=pointer]
                - button "Reset bazy" [ref=e236] [cursor=pointer]
              - generic [ref=e240] [cursor=pointer]:
                - checkbox "Podpisana mapa deformacji" [ref=e241]
                - generic [ref=e242]: Podpisana mapa deformacji
            - generic [ref=e243]:
              - heading "Korekta obwodu w strefie" [level=3] [ref=e244]
              - generic [ref=e245]:
                - generic [ref=e246]:
                  - generic [ref=e247]: Z min · mm
                  - spinbutton "Z min · mm" [ref=e248]: "0"
                - generic [ref=e249]:
                  - generic [ref=e250]: Z max · mm
                  - spinbutton "Z max · mm" [ref=e251]: "100"
              - generic [ref=e252]:
                - generic [ref=e253]: Zmiana obwodu · %
                - spinbutton "Zmiana obwodu · %" [ref=e254]: "-3"
                - generic [ref=e255]: − kompresja / + powiększenie promieniowe
              - button "Zastosuj korektę strefy" [ref=e256] [cursor=pointer]
      - generic [ref=e258]:
        - generic [ref=e259]:
          - text: 354 wierzchołków
          - generic [ref=e261]: /
          - text: 704 trójkątów
          - generic [ref=e262]: /
          - text: mm
        - generic [ref=e263]:
          - button "Wstecz" [ref=e264] [cursor=pointer]
          - 'button "Dalej: Eksport" [ref=e267] [cursor=pointer]'
```

# Test source

```ts
  102 |   await page.getByLabel('Wysokość przekroju Z', { exact: true }).fill('50');
  103 |   await page.getByLabel('Porównaj z referencją roboczą 3D / 2D').check();
  104 |   return comparison(page);
  105 | }
  106 | async function prepareBrush(page: Page) {
  107 |   const enable = page.getByRole('button', { name: 'Włącz pędzel na modelu', exact: true });
  108 |   await expect(enable).toBeEnabled();
  109 |   await page.getByRole('button', { name: 'Widok z przodu', exact: true }).click();
  110 |   await expect(page.locator('.renderer-status')).toContainText(/WebGPU|WebGL2/);
  111 |   await enable.click();
  112 |   const canvas = page.locator('.three-viewport canvas');
  113 |   await canvas.scrollIntoViewIfNeeded();
  114 |   const box = (await canvas.boundingBox())!;
  115 |   return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  116 | }
  117 | async function holdMouse(page: Page, p: { x: number; y: number }) {
  118 |   const previous = (await state(page)).pointers.filter((e: any) => e.type === 'gotpointercapture').length;
  119 |   await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + 1, p.y);
  120 |   await expect.poll(async () => (await state(page)).pointers.filter((e: any) => e.type === 'gotpointercapture').length).toBe(previous + 1);
  121 | }
  122 | async function cancellationPreservesAndNextWorks(page: Page, before: any, history: number) {
  123 |   // Bounded negative publication window, then exact public project snapshot.
  124 |   await page.waitForTimeout(1000);
  125 |   await expect(page.locator('.busy-overlay')).toHaveCount(0);
  126 |   expect((await state(page)).events.filter((e: any) => e.type === 'postMessage' && e.kind === 'stroke')).toEqual([]);
  127 |   expect(await project(page)).toEqual(before);
  128 |   expect(await undoCount(page)).toBe(history);
  129 |   // Cancellation deliberately disables the brush. Re-enable through the UI.
  130 |   const p = await prepareBrush(page);
  131 |   await holdMouse(page, p);
  132 |   for (let i = 1; i <= 5; i++) { await page.waitForTimeout(50); await page.mouse.move(p.x + i, p.y - i * 2); }
  133 |   await page.mouse.up();
  134 |   await expect(page.locator('.notification')).toContainText('Jedna rewizja i jedna pozycja cofania');
  135 |   const painted = await project(page);
  136 |   expect(painted.mesh.positions).not.toEqual(before.mesh.positions);
  137 |   expect(painted.mesh.colors).toEqual(before.mesh.colors);
  138 |   expect(painted.originalPositions).toEqual(before.originalPositions);
  139 |   expect(painted.workspace.revision).toBe(before.workspace.revision + 1);
  140 |   expect(painted.workspace.events.slice(0, -1)).toEqual(before.workspace.events);
  141 |   expect(painted.workspace.events).toHaveLength(before.workspace.events.length + 1);
  142 |   expect(painted.workspace.events.at(-1).kind).toBe('brush-relief');
  143 |   expect(painted.workspace.events.at(-1).parameters.dabCount).toBeGreaterThan(1);
  144 |   expect(painted.workspace.events.at(-1).parameters.dabCount).toBeLessThanOrEqual(128);
  145 |   expect(await undoCount(page)).toBe(history + 1);
  146 |   expect((await state(page)).events.filter((e: any) => e.type === 'postMessage' && e.kind === 'stroke')).toHaveLength(1);
  147 |   await page.getByRole('button', { name: `Cofnij (${history + 1})`, exact: true }).click();
  148 |   const restored = await project(page);
  149 |   expect(restored.mesh).toEqual(before.mesh);
  150 |   expect(restored.originalPositions).toEqual(before.originalPositions);
  151 |   expect(restored.tapes).toEqual(before.tapes);
  152 |   expect(await undoCount(page)).toBe(history);
  153 | }
  154 | 
  155 | test.beforeEach(async ({ page, request, browser }, info) => {
  156 |   test.setTimeout(120000);
  157 |   await mkdir(folder, { recursive: true });
  158 |   const html = await (await request.get('/')).text();
  159 |   const asset = html.match(/src="([^"]+\.js)"/)?.[1];
  160 |   expect(asset).toBeTruthy();
  161 |   const sha256 = createHash('sha256').update(await (await request.get(asset!)).body()).digest('hex');
  162 |   if (process.env.ORTHO_FROZEN_SHA) expect(sha256).toBe(process.env.ORTHO_FROZEN_SHA);
  163 |   (info as any).lifecycleOrigin = { baseURL: info.project.use.baseURL, asset, sha256, chromium: browser.version() };
  164 |   (info as any).lifecyclePrivacy = observePrivacy(page);
  165 |   await page.addInitScript(installLifecycleObserver);
  166 | });
  167 | test.afterEach(async ({ page }, info) => {
  168 |   const id = info.title.replace(/[^a-zA-Z0-9-]+/g, '-');
  169 |   const observed = await state(page).catch(error => ({ unavailable: String(error) }));
  170 |   const result = { title: info.title, status: info.status, expectedStatus: info.expectedStatus, origin: (info as any).lifecycleOrigin,
  171 |     privacy: (info as any).lifecyclePrivacy, errors: info.errors, observed };
  172 |   const path = `${folder}/${id}.json`;
  173 |   await writeFile(path, JSON.stringify(result, null, 2));
  174 |   await info.attach('native-lifecycle-evidence', { path, contentType: 'application/json' });
  175 |   await page.screenshot({ path: `${folder}/${id}.png`, fullPage: true });
  176 | });
  177 | async function clean(page: Page) {
  178 |   const privacy = (test.info() as any).lifecyclePrivacy;
  179 |   expect(privacy.errors).toEqual([]); expect(privacy.external).toEqual([]); expect(privacy.violations).toEqual([]);
  180 |   const observed = await state(page);
  181 |   expect(observed.events.filter((e: any) => e.type === 'alert')).toEqual([]);
  182 |   expect(Math.max(0, ...observed.events.map((e: any) => e.alive.filter((w: any) => w.category === 'compute').length))).toBeLessThanOrEqual(2);
  183 | }
  184 | 
  185 | test('native pointercancel cancels captured touch and next brush is one exact undo', async ({ page, context }) => {
  186 |   await setup(page); const before = await project(page), history = await undoCount(page);
  187 |   const p = await prepareBrush(page), cdp = await context.newCDPSession(page);
  188 |   await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  189 |   await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...p, id: 1 }] });
  190 |   await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x + 1, y: p.y, id: 1 }] });
  191 |   await expect.poll(async () => (await state(page)).pointers.filter((e: any) => e.type === 'gotpointercapture' && e.pointerType === 'touch' && e.trusted && e.canvas).length).toBe(1);
  192 |   await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  193 |   await expect.poll(async () => (await state(page)).pointers.filter((e: any) => e.type === 'pointercancel' && e.pointerType === 'touch' && e.trusted && e.canvas).length).toBe(1);
  194 |   await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false }); await cdp.detach();
  195 |   await cancellationPreservesAndNextWorks(page, before, history); await clean(page);
  196 | });
  197 | 
  198 | test('native window blur cancels captured mouse and next brush is one exact undo', async ({ page, context }) => {
  199 |   await setup(page); const before = await project(page), history = await undoCount(page);
  200 |   const p = await prepareBrush(page); await holdMouse(page, p);
  201 |   const other = await context.newPage(); await other.goto('/'); await other.bringToFront();
> 202 |   await expect.poll(async () => (await state(page)).blurs.filter((e: any) => e.trusted).length).toBeGreaterThan(0);
      |                                                                                                 ^ Error: expect(received).toBeGreaterThan(expected)
  203 |   expect(await page.evaluate(() => document.hasFocus())).toBe(false);
  204 |   await page.bringToFront(); await page.mouse.up(); await other.close();
  205 |   await cancellationPreservesAndNextWorks(page, before, history); await clean(page);
  206 | });
  207 | 
  208 | test('two native readers release before mutation and fresh mesh audit precedes indexes including undo and New Project', async ({ page }) => {
  209 |   await setup(page); const before = await project(page), history = await undoCount(page);
  210 |   const original = await twoReaders(page);
  211 |   const readers = (await state(page)).alive.filter((w: any) => w.category === 'compute');
  212 |   expect(readers).toHaveLength(2);
  213 |   await mark(page, 'before-zone');
  214 |   await page.getByLabel('Zmiana obwodu · %', { exact: true }).fill('-10');
  215 |   await page.getByRole('button', { name: 'Zastosuj korektę strefy' }).click();
  216 |   await expect(page.locator('.notification')).toContainText('Zmieniono obwód');
  217 |   expect(await comparison(page)).not.toBe(original); await mark(page, 'after-zone');
  218 |   const zoneEvents = between((await state(page)).events, 'before-zone', 'after-zone');
  219 |   const dispatch = zoneEvents.findIndex(e => e.type === 'postMessage' && e.op === 'zone');
  220 |   expect(dispatch).toBeGreaterThan(0);
  221 |   for (const r of readers) {
  222 |     const release = zoneEvents.findIndex(e => e.type === 'terminate' && e.workerId === r.workerId);
  223 |     expect(release).toBeGreaterThanOrEqual(0); expect(release).toBeLessThan(dispatch);
  224 |   }
  225 |   expect(zoneEvents[dispatch].alive).toHaveLength(1);
  226 |   const response = zoneEvents.find(e => e.type === 'response' && e.workerId === zoneEvents[dispatch].workerId && e.ok);
  227 |   expect(response.positions).not.toEqual(before.mesh.positions);
  228 |   auditBeforeIndex(zoneEvents, response.positions);
  229 |   await expect(page.locator('.quality-summary > summary')).toContainText('UNKNOWN');
  230 |   const changed = await project(page);
  231 |   expect(changed.mesh.positions).toEqual(response.positions); expect(changed.mesh.colors).toEqual(before.mesh.colors);
  232 |   expect(changed.originalPositions).toEqual(before.originalPositions); expect(await undoCount(page)).toBe(history + 1);
  233 |   await comparison(page); await mark(page, 'before-undo');
  234 |   await page.getByRole('button', { name: `Cofnij (${history + 1})`, exact: true }).click();
  235 |   expect(await comparison(page)).toBe(original); await mark(page, 'after-undo');
  236 |   auditBeforeIndex(between((await state(page)).events, 'before-undo', 'after-undo'), before.mesh.positions);
  237 |   await expect(page.locator('.quality-summary > summary')).toContainText('UNKNOWN');
  238 |   const restored = await project(page);
  239 |   expect(restored.mesh).toEqual(before.mesh); expect(restored.originalPositions).toEqual(before.originalPositions);
  240 |   expect(restored.workspace.revision).toBe(changed.workspace.revision + 1); expect(restored.workspace.events.at(-1).kind).toBe('undo');
  241 |   expect(await undoCount(page)).toBe(history);
  242 |   await comparison(page); const finalReaders = (await state(page)).alive;
  243 |   await mark(page, 'before-new-project');
  244 |   await page.locator('.workspace-summary > summary').click();
  245 |   await page.getByRole('button', { name: 'Nowy projekt', exact: true }).click(); await replaceSyntheticProject(page);
  246 |   await expect(page.locator('.case-label')).toContainText('r0 · Nowy projekt');
  247 |   await expect(page.locator('.empty-viewport')).toBeVisible();
  248 |   await expect.poll(async () => (await state(page)).alive.length).toBe(0);
  249 |   const afterNew = between((await state(page)).events, 'before-new-project');
  250 |   for (const r of finalReaders) expect(afterNew.some(e => e.type === 'terminate' && e.workerId === r.workerId)).toBe(true);
  251 |   await clean(page);
  252 | });
  253 | 
  254 | for (const failedAudit of ['topology', 'analyze'] as const) test(`deliberate native module-load fault in ${failedAudit} refuses indexes and user action recovers without revision loss`, async ({ page }) => {
  255 |   await setup(page); const before = await project(page), history = await undoCount(page);
  256 |   await twoReaders(page); await mark(page, 'before-fault');
  257 |   // Explicit fault injection: abort the real compute Worker module request, not
  258 |   // its constructor/postMessage/replies. Native Worker.onerror must be observed.
  259 |   let modules = 0, blocked = 0;
  260 |   const faultOrdinal = failedAudit === 'topology' ? 2 : 3; // zone, topology, analyze
  261 |   const routePattern = /\/assets\/worker-[^/]+\.js(?:\?.*)?$/;
  262 |   await page.route(routePattern, async route => {
  263 |     modules++;
  264 |     if (modules >= faultOrdinal) { blocked++; await route.abort('failed'); }
  265 |     else await route.continue();
  266 |   });
  267 |   await page.getByLabel('Zmiana obwodu · %', { exact: true }).fill('-10');
  268 |   await page.getByRole('button', { name: 'Zastosuj korektę strefy' }).click();
  269 |   await expect(page.getByRole('alert')).toContainText('Błąd silnika Worker');
  270 |   expect(blocked).toBe(1);
  271 |   await expect.poll(async () => (await state(page)).events.filter((e: any) => e.type === 'worker-error' && e.trusted).length).toBe(1);
  272 |   await page.waitForTimeout(750); await mark(page, 'fault-observed');
  273 |   let faultEvents = between((await state(page)).events, 'before-fault', 'fault-observed');
  274 |   const failedTask = faultEvents.find(e => e.type === 'postMessage' && e.op === failedAudit);
  275 |   expect(failedTask).toBeTruthy();
  276 |   expect(faultEvents.some(e => e.type === 'worker-error' && e.workerId === failedTask.workerId)).toBe(true);
  277 |   expect(faultEvents.filter(e => e.type === 'postMessage' && e.kind === 'init')).toEqual([]);
  278 |   expect((await state(page)).alive).toEqual([]);
  279 |   await expect(page.locator('svg .reference-contour')).toHaveCount(0);
  280 |   await expect(page.locator('.section-view svg polygon:not(.reference-contour)')).toHaveCount(0);
  281 |   await expect(page.locator('.case-label')).toContainText(`r${before.workspace.revision + 1}`);
  282 |   const changedPositions = faultEvents.find(e => e.type === 'response' && e.positions)?.positions;
  283 |   expect(changedPositions).toBeTruthy(); expect(changedPositions).not.toEqual(before.mesh.positions);
  284 |   // Keep fault active while taking the exact public snapshot, so the download
  285 |   // cannot accidentally prove recovery before loading is explicitly restored.
  286 |   const failedState = await project(page);
  287 |   expect(failedState.mesh.positions).toEqual(changedPositions);
  288 |   expect(failedState.mesh.colors).toEqual(before.mesh.colors);
  289 |   expect(failedState.originalPositions).toEqual(before.originalPositions);
  290 |   expect(failedState.workspace.revision).toBe(before.workspace.revision + 1);
  291 |   expect(failedState.workspace.events.slice(0, -1)).toEqual(before.workspace.events);
  292 |   expect(failedState.workspace.events.at(-1).kind).toBe('zone');
  293 |   expect(await undoCount(page)).toBe(history + 1);
  294 |   // Wait for the download-triggered audit attempt to fail before recovery.
  295 |   await expect.poll(() => blocked).toBeGreaterThan(1);
  296 |   await expect.poll(async () => (await state(page)).alive.length).toBe(0);
  297 |   await mark(page, 'before-recovery'); await page.unroute(routePattern);
  298 |   // User action: another real project download toggles busy and retries audit.
  299 |   const recoveredState = await project(page); expect(recoveredState).toEqual(failedState);
  300 |   await comparison(page); await mark(page, 'after-recovery');
  301 |   auditBeforeIndex(between((await state(page)).events, 'before-recovery', 'after-recovery'), changedPositions);
  302 |   await expect(page.locator('.quality-summary > summary')).toContainText('UNKNOWN');
```