# UI-STATE-01 — izolacja aktywnego gestu pędzla

## Wynik i zakres

Naprawiono odtworzenie cofniętej geometrii oraz poprzedniego projektu przez `pointerup` starego gestu. Wyłącznie syntetyczny lokalny cylinder RGB (354 wierzchołki / 704 trójkąty); bez skanów pacjentów, haseł, zewnętrznych żądań i trwałego magazynu danych.

Zmiany kodu: `src/App.tsx`, `src/components/Viewport.tsx`, `src/hooks/workbenchState.ts`. Nowe regresje: `tests/v02-gesture-isolation.test.ts`, `e2e/v02-gesture-isolation.spec.ts`. Nie zmieniono geometry/compute/IO/reports, koordynacji puli Workerów, innych E2E ani root `dist`; bez stage/commit.

## Przyczyna i zachowanie

`beginStroke` przechowywał głęboką kopię siatki, ale bez tożsamości projektu i rewizji. Bramka zadania rozpoczynała się dopiero na `pointerup`; Undo i New Project były więc dostępne podczas rejestrowania, a stary snapshot mógł zostać opublikowany później.

Dodano synchroniczny fence gestu: unikalny ticket, epoka projektu (nie kod przypadku), rewizja, tożsamość aktualnej siatki, jednostka i jej potwierdzenie. Źródło jest sprawdzane na zakończeniu, po asynchronicznej granicy planowania przed dispatch oraz bezpośrednio przed publikacją; geometria jest walidowana przed przyjęciem gestu, dispatch i zmianą stanu. Fence nie zastępuje istniejącej bramki/AbortSignal Workera.

Undo działa również przy trzymanym przycisku myszy: najpierw anuluje niezakończony gest, następnie cofa poprzednią ukończoną operację. Zastąpienie/import/nowy projekt, zmiany rewizji (w tym strony), inne zadanie i reset również unieważniają gest synchronicznie. Prośba o zastąpienie anuluje gest nawet po późniejszym wybraniu „Zostań”. Anulowanie gestu samo nie zmienia siatki, baseline, historii ani dirty/revision. Nieakceptowany start nie przechwytuje wskaźnika. Viewport rozróżnia poprawny `pointerup` od `pointercancel`, utraty capture i blur, pilnuje pointerId i przywraca OrbitControls. Limit 128 próbek i obliczanie całego gestu w Workerze pozostały niezmienione.

## Strict TDD — rzeczywiste RED i GREEN

Przed zmianami produkcyjnymi oba E2E zostały wykonane na osobnym buildzie aktualnego źródła, nie na starej dystrybucji:

1. Import RGB → mm → rektyfikacja → strefa -10% → rzeczywisty mouse down/capture w połowie modelu → focus Undo + keyboard Enter → mouse up. **RED:** końcowa siatka różna od oryginału, punkt Z90 pozostawał X18 zamiast X20; dodatkowy brush publikował strefę po Undo.
2. Import RGB → mm → rektyfikacja → rzeczywisty mouse down/capture → focus Nowy projekt + Enter → focus Zastąp + Enter → mouse up. **RED:** po początkowym r0 wracał `CASE · r1 · Skan lokalny`.

Początkowy próbny harness czekał na `gotpointercapture` bez kolejnego pointer event i nie stanowił RED błędu aplikacji. Dodanie rzeczywistego ruchu o 1 px po mouse-down naprawiło synchronizację; dopiero opisane wyżej błędy geometrii/projektu były właściwym RED. Dowody zachowano w scratch `gesture-e2e-red.json` i `gesture-e2e-red-artifacts/`.

Następnie 9 testów czystego fence było RED z powodu braku `createStrokeFence`; po implementacji wszystkie są GREEN. Dwa główne E2E przeszły GREEN przed kolejną zmianą. Dodatkowy RED pokazał, że natywne `releasePointerCapture` błędnie zatwierdza gest; po rozdzieleniu cancel/end trzeci E2E jest GREEN.

Ostateczny Chromium: **3 PASS, 0 FAIL, 0 flaky** (86.8 s):

- Undo: r4, X20 na Z90, zdarzenia kończą się na `undo`, 0 dispatch pędzla, dokładnie oryginalna siatka/RGB/baseline i właściwa liczba undo.
- Nowy projekt: `CASE · r0 · Nowy projekt`, pusty viewport, zapis wyłączony, brak dirty i 0 dispatch pędzla.
- Natywna utrata capture: brak zmiany całego pobranego projektu/historii, potem poprawny gest 7 dabs → 1 zdarzenie/1 rewizja/1 undo; RGB i baseline bez zmian, Undo przywraca dokładną siatkę/baseline/taśmy. 0 pageerror i 0 żądań zewnętrznych we wszystkich trzech testach.

## Wykonane polecenia

Uruchamiane z `C:/Users/sandr/OrthoSculptCAD`; `NODE` poniżej oznacza dokładnie `"C:/Program Files/nodejs/node.exe"`.

```text
NODE node_modules/vite/bin/vite.js build --outDir C:/Users/sandr/AppData/Local/hermes/cache/scratch/gesture-candidate-dist --emptyOutDir
NODE node_modules/@playwright/test/cli.js test --config C:/Users/sandr/AppData/Local/hermes/cache/scratch/gesture-playwright.config.mjs
NODE node_modules/vitest/vitest.mjs run tests/v02-gesture-isolation.test.ts
NODE node_modules/typescript/bin/tsc -b
NODE node_modules/vitest/vitest.mjs run --reporter=json --outputFile=C:/Users/sandr/AppData/Local/hermes/cache/scratch/gesture-full-vitest.json
NODE node_modules/vitest/vitest.mjs run tests/v02-gesture-isolation.test.ts tests/v02-ui-state.test.ts tests/v02-ui-worker.test.ts tests/v02-ui-comparison.test.ts tests/v02-ui-dialogs.test.ts tests/v02-ui-panels.test.ts tests/ui-viewport.test.ts --reporter=json --outputFile=C:/Users/sandr/AppData/Local/hermes/cache/scratch/gesture-focused-vitest.json
```

`tsc -b`: PASS. Poprawiono zgodność sygnatury callbacku z istniejącym testem Viewport (`boolean | void`, jawne false odrzuca start). Skupiony zestaw: **26/26 PASS**. Cały zestaw w równolegle zmienianym repo: **313 testów, 304 PASS / 1 FAIL / 8 pominiętych**; jedyny FAIL to nowy RED innego właściciela `tests/v02-worker-diagnostics.test.ts` (komunikat no-change nie przechodzi przez service/client), nie dotykano tego testu/modułów. Nie deklarujemy pełnego GREEN repo. Vite zgłasza istniejące ostrzeżenie dużego chunku.

## Izolacja i dowody

Serwer używał istniejącego `createStaticServer` z `scripts/server.mjs`, wyłącznie `127.0.0.1:4184`, z rootem `C:/Users/sandr/AppData/Local/hermes/cache/scratch/gesture-candidate-dist`. Nie restartowano ani nie przebudowano serwera/dystrybucji 4176. Wszystkie JS root dist nadal mają SHA-256 identyczne z niezależnym przeglądem `tt02-independent-ui-review.json`.

- Bundle: `assets/index-BWy-CZGw.js`.
- SHA-256 tego pliku: `c9e38ee0bf5db94cd89435f434e33164713b374d8c532d4b187a7c233d1485e5`.
- Rzeczywisty GET z portu 4184: HTTP 200, identyczny SHA-256; CSP z `connect-src 'self'` i `worker-src 'self' blob:`.
- Hash zestawu posortowanego manifestu: `c6c27ac86ea6b320dfc24aaf34b1833e503ec567c3cc2d6ae5713f04a23b0f2b`.
- Pełny manifest i hashe źródeł: scratch `gesture-candidate-manifest.json`.
- Wyniki GREEN z obserwacjami: scratch `gesture-e2e-result.json`.
- Screenshoty rzeczywistego Chromium, obejrzane dla obu głównych repro:
  - scratch `gesture-e2e-artifacts/v02-gesture-isolation-held-4f1ff-re-the-undone-zone-geometry/undo-held-brush.png`
  - scratch `gesture-e2e-artifacts/v02-gesture-isolation-held-cf0bd-ever-resurrect-the-old-scan/new-project-held-brush.png`
  - scratch `gesture-e2e-artifacts/v02-gesture-isolation-nati-99634-ture-remains-one-exact-undo/cancel-and-legitimate-one-undo.png`

Właściciel zatrzymuje wyłącznie swój proces serwera 4184. Znany niezależny problem E2E-02 z limitem Workerów podczas wznowienia porównania pozostaje poza zakresem i do analizy rodzica; nie zmieniano rezerwacji/planowania audytu ani silników porównania.
