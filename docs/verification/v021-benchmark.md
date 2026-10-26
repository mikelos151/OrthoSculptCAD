# v0.2.1 — powtarzalny benchmark geometrii w natywnym Chromium

## Zakres i stan weryfikacji

Harness działa na rzeczywistych `Worker` w Chromium Playwright, z istniejącymi API `createWorkerSliceEngine` i `runGeometryTask` z `src/compute`. Nie zmienia aplikacji, limitu puli (2), geometrii produkcyjnej, zależności, wersji ani `dist`. Vite serwuje wyłącznie lokalny harness źródłowy na `127.0.0.1:4182`; nie używa/restartuje serwera 4176.

**Pełny szeregowy benchmark został wykonany przez rodzica po zakończeniu pozostałych prac przeglądarkowych.** Cztery modele 1k/10k/50k/100k zakończyły się prawidłowo; dodatkową kontrolę 400k jawnie pominięto przed alokacją zgodnie z budżetem. Raport: `v021-benchmark-parent-serial/report.json`; czytelne podsumowanie: `v021-parent-results.md`. Poniższy wcześniejszy smoke pozostaje wyłącznie historycznym dowodem poprawności, nie końcowym baseline.

Nowe pliki:

- `scripts/benchmark-geometry.mjs` — generator, admission/budżety, walidacja wyników, statystyki i sterownik Chromium/Vite;
- `tests/fixtures/benchmark-harness.html` — prawdziwe wywołania API, obserwacja natywnych Workerów i kontrole niepowodzeń;
- `tests/v021-benchmark.test.ts` — 8 testów helperów/schema, pisanych i uruchamianych RED → GREEN;
- niniejszy dokument.

Oczekiwany wcześniej `tests/fixtures/worker-harness.html` nie istnieje w tym checkout; nie tworzono go ani nie zmieniano cudzych fixture'ów.

## Uruchomienie

Z katalogu `C:/Users/sandr/OrthoSculptCAD`, bez instalacji nowych pakietów:

```bash
# Helpery oraz kontrola typów; nie tworzą root dist.
npx vitest run tests/v021-benchmark.test.ts
npx tsc --noEmit --incremental false

# Mały smoke. --out MUSI wskazywać nowy, nieistniejący katalog.
node scripts/benchmark-geometry.mjs --smoke --out=C:/Users/sandr/AppData/Local/hermes/cache/scratch/orthosculpt-benchmark-smoke-NEW

# PEŁNE POMIARY: dopiero po zakończeniu innych zadań Chromium.
node scripts/benchmark-geometry.mjs --budget-control --out=C:/Users/sandr/AppData/Local/hermes/cache/scratch/orthosculpt-benchmark-serial-NEW

# Własne wymiary: liczba pierścieni x liczba boków; stała płaszczyzna wewnętrzna.
node scripts/benchmark-geometry.mjs --cases=16x64,100x100 --cold-runs=3 --warm-samples=10 --warmups=2 --out=C:/Users/sandr/AppData/Local/hermes/cache/scratch/orthosculpt-benchmark-custom-NEW
```

Bez `--out` sterownik tworzy unikalny katalog w `TMPDIR` Hermesa. Istniejący katalog wyjściowy jest odrzucany, nie nadpisywany. Wynik to kompaktowy `report.json`, aktualizowany atomowo po kolejnych obserwacjach, także przy błędach. Nie zapisuje tablic siatki, RGB, skanów ani dużych logów.

Najważniejsze opcje (`--nazwa=wartość`):

| Opcja | Domyślnie | Granice/znaczenie |
|---|---:|---|
| `--port` | 4182 | 4182–4199, strictPort; 4176 jest odrzucany |
| `--cases` | 1k,10k,50k,100k | presety lub `ringsxsides`, maks. 8, bez duplikatów |
| `--cold-runs` | 3 | 1–10 nowych silników/zadań na model |
| `--warm-samples` | 10 | 1–100 próbek ostatniego cached indeksu |
| `--warmups` | 2 | 0–20, osobna grupa, poza warm median/p95 |
| `--timeout-ms` | 30000 | 1–120000, pojedyncza operacja; AbortSignal + TimeoutError |
| `--case-timeout-ms` | 120000 | 100–300000, abort przypadku + zewnętrzny watchdog strony |
| `--total-timeout-ms` | 300000 | 1000–900000; zamknięcie własnego Chromium przy limicie |
| `--max-vertices` | 150002 | twardy limit harnessu 500002 |
| `--max-input-mib` | 32 | 1–64; positions + Float32 RGB + indices |
| `--max-working-mib` | 256 | 1–1024; konserwatywna heurystyka admission, NIE pomiar RAM |
| `--budget-control` | wyłączone | dodatkowy 400k: zwykle pominięty przed alokacją |
| `--headed` | wyłączone | zmienia jawnie zapisane `headless` |

Nie należy podnosić limitów bez przeglądu dostępnych zasobów. Heurystyka working-set to `4 * inputBytes + 192 * vertices + 512 * triangles`, nie gwarancja braku OOM. Nie próbuje się doprowadzać Chromium do OOM. Pojedynczy mesh/job, brak równoległych pomiarów i brak zmiany produkcyjnego limitu Workerów.

Kod wyjścia 0 oznacza kompletne, prawidłowe wyniki albo oczekiwany skip dodatkowej kontroli 400k. Błąd, timeout, brak wyników lub nieoczekiwane pominięcie zwykłego przypadku daje 1. `counts` odróżnia liczbę udanych przypadków od skipów; skip nigdy nie jest podawany jako rzeczywiście zmierzony model.

## Modele i wzorzec

Deterministyczne **SYNTHETIC**, zamknięte, indeksowane cylindry: promień 40 mm, wysokość 300 mm, Float32 positions/RGB i Uint32 indices. Wierzchołki denek współdzielą obrzeża. Pochodzenie jest zawsze `source: 'synthetic'`; generator odrzuca próbę relabelowania na `imported`. Osobny test rzeczywistego helpera kopiowania potwierdza zachowanie obu jawnych wartości `synthetic`/`imported`.

| Preset | Pierścienie | Boki | Rzeczywiste wierzchołki | Trójkąty |
|---|---:|---:|---:|---:|
| 1k | 16 | 64 | 1026 | 2048 |
| 10k | 100 | 100 | 10002 | 20000 |
| 50k | 250 | 200 | 50002 | 100000 |
| 100k | 500 | 200 | 100002 | 200000 |
| opcjonalna kontrola 400k | 2000 | 200 | 400002 planowane | 800000 planowane |

Admission wylicza rozmiary przed alokacją. Harness sprawdza także rzeczywiste długości utworzonych buforów i topologię przez prawdziwe zadanie Worker. Wszystkie zapytania pomiarowe używają `Z = 123.4567 mm`, z dala od denek.

Wzorzec obwodu/AP/ML/pola wyliczany jest niezależnie z **zapisanych Float32 wierzchołków wielokąta**: długości krawędzi, extents oraz shoelace. Nie podmienia wyniku CAD wzorem idealnego koła. Test z 13 bokami wykazuje różnicę względem idealnego obwodu. Najpierw sprawdzane są `valid`, właściwe Z, skończone dodatnie metryki i zamknięty pojedynczy kontur (jeśli API go zwraca). Dopiero wtedy powstają błędy bezwzględne. Nieprawidłowy wynik zachowuje metryki/status/ostrzeżenia, ale ma `absoluteErrors: null`.

Brak progów wydajnościowych, klinicznych lub zapewnień o przydatności produkcyjnej. Błędy liczbowe są raportowane, nie automatycznie kwalifikowane klinicznie.

## Znaczenie pomiarów

- `generationMs`: tylko utworzenie syntetycznego fixture'u.
- `topologyVerificationMs`: odrębna kontrola poprawności, nie próbka warm slicing.
- `copyGeometryOnlyMs`: rzeczywisty `copyMeshForWorker(mesh, false)`; ten sam wariant kopiowania co slice/measureAt. Nie zawiera RGB, choć model RGB posiada. Nie odejmuje się go od init.
- `initCopyStartIndexMs`: całe rzeczywiste `createWorkerSliceEngine` — preflight/kopia/start natywnego Workera/transfer/walidacja/snapshot/budowa indeksu. Bez zmian produkcyjnych API nie rozdziela się tych wewnętrznych etapów; nie udaje się oddzielnego pomiaru samej budowy indeksu.
- `measureAtColdMs`: nowy `runGeometryTask('measureAt')`, zawierający start/kopię/indeks i jedną fizyczną odpowiedź.
- `firstCachedSliceMs`: pierwsze zapytanie po zakończonym init, osobno od kolejnych próbek.
- `warmupSliceMs`: odrzucane z agregatu warm, ale zachowane w JSON.
- `warmCachedSliceRoundTripMs`: kolejne zapytania tego samego silnika/indeksu, ten sam Z, bez ponownego uploadu.
- `warmCachedWorkerQueryMs`: `queryMs` rzeczywiście zwrócony przez Worker, bez narzutu komunikacji.

Każda grupa zachowuje surowe próbki, liczność, medianę (średnia dwóch środkowych dla parzystej liczby) i nearest-rank p95. Mała liczba próbek w smoke nie jest miarodajnym rozkładem wydajności. Cold oznacza nowego Workera/silnik, a nie pusty cache Vite/OS/modułów. Checkpointy są poza mierzonym czasem, lecz mogą wpływać na harmonogram między zapytaniami.

Raport zawiera wersję przeglądarki, tryb headless, hardwareConcurrency, UA, Node/platformę, commit oraz SHA-256 jawnej listy źródeł i harnessu. Pamięć to wyłącznie próbkowane `process.memoryUsage()` **sterownika Node wraz z Vite**, nie Chromium/Workerów. Nieobsługiwane browser peak RSS/heap oraz FPS są `null`; brak twierdzeń o FPS. Ruch harnessu poza własny loopback origin jest blokowany, service workers wyłączone. Brak żądań do danych lub usług zewnętrznych.

## Kontrole niepowodzeń i cleanup

Na pierwszym przypadku wykonywanym przez harness (standardowo 1k), po pomiarach:

1. Anulowanie prawdziwego `runGeometryTask('topology')` **po natywnym `postMessage`**, z oryginalnym AbortSignal, bez sfabrykowanej odpowiedzi; zapis AbortError i faktycznej terminacji.
2. Usunięcie trójkąta przecinającego płaszczyznę daje rzeczywisty otwarty kontur. Oba API muszą zachować `valid: false` i `absoluteErrors: null`.
3. Deadline kontrolny 1 ms przy rzeczywistym init sprawdza ścieżkę TimeoutError i terminacji. To celowy test timeoutu, NIE próg wydajności. Jeśli init zdąży wcześniej, zapisuje się jawnie `deadline-not-triggered`, nie wymyślony timeout.

Każdy własny silnik jest dispose'owany w finally; monitor natywnego Worker liczy created/terminated/maxAlive/alive bez emulacji transportu. Pozostawione workery powodują błąd i terminację. Sterownik ma osobny watchdog zamykający własną stronę przy braku odpowiedzi renderera; finally zamyka własny kontekst/przeglądarkę i serwer. Niedokończone przypadki/nieprawidłowe odpowiedzi i błędy uruchomienia pozostają w JSON. Ręczne przerwanie procesu lub awaria OS może zostawić ostatni checkpoint zamiast końcowego podsumowania.

## Faktycznie wykonane polecenia i wyniki

- Kolejne ukierunkowane `npx vitest run tests/v021-benchmark.test.ts -t ...`: potwierdzone RED na brakujących helperach, następnie GREEN. Końcowo `npx vitest run tests/v021-benchmark.test.ts`: **8 PASS, exit 0**.
- `node --check scripts/benchmark-geometry.mjs`, `npx tsc --noEmit --incremental false`, `git diff --check`: **exit 0**. Bez buildu i zmian `dist`.
- Pierwsza próba `node scripts/benchmark-geometry.mjs --smoke --out=C:/Users/sandr/AppData/Local/hermes/cache/scratch/orthosculpt-v021-smoke-first`: **exit 1**, `spawn EPERM` przy opcjonalnym uruchomieniu child git, przed Chromium i przed utworzeniem modelu. Raport błędu zachowany. Przyczynę odtworzono osobno: spawn git odrzucany, spawn Node/Chromium działa. Metadane commita czytane są teraz read-only z `.git` bez subprocessu; ich brak daje `null`, nie blokuje pomiarów.
- `node scripts/benchmark-geometry.mjs --smoke --out=C:/Users/sandr/AppData/Local/hermes/cache/scratch/orthosculpt-v021-smoke-native`: **exit 0**, `completed`, 1/1 przypadek, rzeczywiste **1026 vertices / 2048 triangles**, `source: synthetic`, niezmienione positions/indices/RGB. Chromium **156.0.8078.4**, headless, hardwareConcurrency **24**.
- Ten smoke zachował 1 próbkę cold-init, 1 first-cached, 1 warmup i 3 warm: cold-init **21.4 ms**, standalone copy **0.1 ms**, warm round-trip median **0.5 ms**, p95 **0.6 ms**. To wyłącznie dowód wykonania, **nie finalny baseline**. Maksymalne błędy w prawidłowych odpowiedziach: obwód/AP/ML **0 mm**, pole **9.094947017729282e-13 mm²** względem dokładnego wielokąta.
- Kontrole smoke: natywny AbortError po dispatch i terminacja **PASS**; rzeczywisty timeout i terminacja **PASS**; oba prawdziwe nieprawidłowe wyniki zachowane z błędami numerycznymi `null`. **7 created / 7 terminated, maxAlive 1, alive 0**, 0 pageerrors, 0 prób żądań poza loopback. Browser/server cleanup oba true.
- `node scripts/benchmark-geometry.mjs --cases=1k --max-vertices=3 --out=C:/Users/sandr/AppData/Local/hermes/cache/scratch/orthosculpt-v021-budget-rejection`: **exit 1 zgodnie z oczekiwaniem**, `completed-with-failures`, 0 sukcesów, 1 `skipped-budget`, `unexpectedBudgetSkips: 1`, rzeczywiste counts `null` — model nie był alokowany. Raport odczytany i asercje potwierdzone, cleanup obu zasobów true.
- Odczyt i programowe asercje raportów oraz próba ponownego bind `127.0.0.1:4182`: **exit 0**, port zwolniony.

Późniejsze poprawki wyłącznie sterownika (sumowanie coverage, argument timeout Playwright i bezpośredni cleanup kontekstu) przeszły testy helperów/typów i próbę budget rejection. Następnie rodzic wykonał pełny szeregowy run finalnej wersji: **4 zmierzone modele poprawne, 1 oczekiwany skip budżetowy, 0 niepowodzeń**, cleanup obu zasobów true. Fingerprint: `be1bc6e468513da308fd7cfe06918342d023f6a6332367f400f38cc497de1f0e`. Raport `v021-benchmark-parent-serial/report.json` zastępuje wcześniejszy smoke jako lokalny baseline dla tych syntetycznych cylindrów. Niezależny reviewer przeliczył wszystkie 32 grupy statystyk i błędy oraz potwierdził zgodność fingerprintu. Nie wykonano pomiaru modelu 400k, rzeczywistych skanów, FPS ani szczytowego RAM Chromium.
