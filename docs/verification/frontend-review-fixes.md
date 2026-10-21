# Frontend — poprawki regresji z przeglądu

Zakres: trzy potwierdzone regresje oraz jawne raportowanie przybliżenia kalibracji. Bez zmiany architektury, remeshingu, kodu Rust, protokołu natywnego lub zakresu klinicznego. Wszystkie dane testowe są syntetyczne. Aplikacja pozostaje wersją badawczą, nie zwalidowanym narzędziem klinicznym.

## Naprawy

1. **Konwersja jednostek / Float32** — `scaledMesh` odrzuca skalę niedodatnią/nieskończoną i sprawdza skończoność `Math.fround(value * scale)` dla każdej współrzędnej przed kopiowaniem tablic. `confirmUnits` korzysta z kontrolowanego `run`, a `updateMesh` wyznacza granice i waliduje kandydat przez `getBounds`/`assertMesh` przed zapisem stanu/ref. Nieudana konwersja pozostawia źródłowy model, niepotwierdzone jednostki i widoczny polski komunikat zamiast awarii React.
2. **Pusta strefa / no-op** — `scaleZone` porównuje rzeczywiście zapisane współrzędne Float32. Brak zmiany (brak wierzchołków w strefie, 0%, zmiana poniżej rozdzielczości Float32) kończy się jawnym ostrzeżeniem, zanim UI zapisze historię lub opublikuje model. Nie dodano interpolowanych wierzchołków ani pozornego sukcesu.
3. **Listowe RGB w PLY** — nagłówek musi deklarować wszystkie trzy kanały skalarne albo nie deklarować RGB. Listowe/mieszane RGB są odrzucane przed odczytem treści i alokacją tablic modelu. Poprawne skalarne `uchar` RGB pozostaje obsługiwane w ASCII i obu kolejnościach bajtów binary.
4. **Kalibracja jako przybliżenie** — UI używa dostarczonego `evaluateCalibration` przed publikacją geometrii; nieprawidłowe przekroje kontrolne blokują publikację. Zachowuje kopię ręcznych taśm, ponieważ Z nie zmienia się, oraz pokazuje maksymalną bezwzględną resztę w mm. Tabela i historia zostają unieważnione, nowa baza jest zapisywana. Nie deklaruje dokładnego dopasowania.

## TDD — zaobserwowane RED → GREEN

- `tests/review-fixes-units.test.ts`: przed poprawką 6 niepowodzeń — brak wyjątku przy przepełnieniu i błędnej skali; po poprawce **7/7**.
- Rzeczywisty Chromium, produkcyjny `dist`: scenariusz PLY z wierzchołkami `[1e36,0,0]`, `[0,1e36,0]`, `[0,0,1e36]`, jednostka m, potwierdzenie. Przed poprawką oczekiwany alert nie istniał. Po poprawce alert Float32, zachowany nagłówek/UI, niezmienione metryki, blokada dalszego kroku i zapisu, możliwość późniejszego potwierdzenia mm, **brak `pageerror`**.
- `tests/review-fixes-zone.test.ts`: przed poprawką 3 niepowodzenia — dwupierścieniowy cylinder r20, Z=0/100, strefa 25–75 i −10%, 0%, oraz procent poniżej rozdzielczości Float32 nie zgłaszały no-op; po poprawce **4/4**, w tym rzeczywista redukcja obwodu gęstszej siatki do 90% przy niezmienionym Z i źródle.
- `tests/review-fixes-ply.test.ts`: przed poprawką 4 niepowodzenia — pełne listowe RGB przechodziło po cichu, a nieobsługiwany nagłówek nie był odrzucany na etapie kontroli RGB; po poprawce **7/7**, z pozytywnymi testami skalarnego RGB.
- Kalibracja Chromium: przed integracją komunikat nie zawierał reszty i zapowiadał wyczyszczenie taśm. Po integracji dwupierścieniowy cylinder, taśmy Z25/Z75 z docelowymi skalami 1/1,5: UI pokazuje **maksymalną resztę 15,68 mm**, zachowuje obie taśmy i zapisuje je w rzeczywistym pobranym projekcie.

## Końcowa weryfikacja wykonana na tej wersji

```text
npm test -- tests/review-fixes-units.test.ts tests/review-fixes-zone.test.ts tests/review-fixes-ply.test.ts
Test Files  3 passed (3)
Tests       18 passed (18)

npm test
Test Files  26 passed (26)
Tests       108 passed (108)

npm run build
TypeScript + Vite: exit 0
assets/index-DXBcVluP.js

npx playwright test e2e/review-fixes.spec.ts --reporter=list
4 passed

npx playwright test --reporter=list
9 passed

git diff --check -- src/components/meshView.ts src/App.tsx src/geometry/deformation.ts src/io/ply.ts
exit 0
```

Playwright korzystał z serwera statycznego `http://127.0.0.1:4176` i produkcyjnego `dist/`, nie HMR. Cztery nowe scenariusze sprawdzają brak `pageerror`. Scenariusz strefy dodatkowo porównuje pobrane projekty, zachowanie pomiarów po odmowie, brak nowego undo, rzeczywistą edycję oraz dokładne odtworzenie współrzędnych przez undo. Istniejący pełny pięcioetapowy workflow, eksporty, RGB, kontrola rozmiaru projektu przed `File.text` i test tabletu również przechodzą.

Build nadal ostrzega o dużym bundlu oraz nieskutecznym dynamicznym imporcie modułu geometrycznego; nie są to błędy kompilacji. Git ostrzega o przyszłej konwersji LF→CRLF; bez zmian konfiguracji repozytorium.

## Dowody przeglądarkowe

Zrzuty generowane przez wykonywalny `e2e/review-fixes.spec.ts` w `test-results/`:

- `review-fixes-overflowing-m-7fcd2-med-model-without-pageerror/unit-overflow-controlled.png`
- `review-fixes-empty-and-zer-ec4ea-seline-measurements-or-undo/zone-noop-controlled.png`
- `review-fixes-list-RGB-PLY--28048-eserves-the-current-project/list-rgb-refused.png`
- `review-fixes-coarse-calibr-659a7-etains-manual-tape-evidence/calibration-residual.png`

Zrzuty konwersji oraz kalibracji zostały również odczytane wizualnie: interfejs pozostaje kompletny; komunikat reszty i obie taśmy są widoczne. To dowody zachowania na syntetycznych danych, nie dowód poprawności klinicznej dowolnego skanu.

## Zachowane granice

Nie zmieniono heatmapy: zielony 0, niebieski +8 mm, czerwony −10 mm. Nie podniesiono ograniczenia wywinięcia ponad 30°. Nie dodano funkcji powłoki; offset normalnych pozostaje eksperymentalny. Nie zmieniono strażnika rozmiaru `File.size` przed `File.text`, pakietów ani konfiguracji. Nie wykonano stage ani commita.
