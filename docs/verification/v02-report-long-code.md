# Regresja wydruku długiego caseCode — RED → GREEN

## Zakres poprawki

Jedyna zmiana produkcyjna w tej poprawce: `overflow-wrap:anywhere` w istniejącej regule `h1` w `src/reports/reviewReport.ts`.

```css
h1{font-size:28pt;margin:6px 0;overflow-wrap:anywhere}
```

Identyfikator pozostaje literalny, bez skracania, dopisywania separatorów, zmiany limitu walidacji lub zmniejszania czcionki. Bez zmian API raportera, geometrii, SHA-256, CSP, ostrzeżeń prywatności i stopek CSS `@bottom-left`. Nie przebudowano współdzielonego `dist` ani nie nadpisano wcześniejszych przykładów HTML/PDF.

## RED: rzeczywisty błąd przed zmianą źródła

Najpierw dodano `tests/v02-reports-long-code.test.ts` i uruchomiono testy wraz z rzeczywistym wydrukiem Chromium **156.0.8078.4** oraz inspekcją PyMuPDF **2.0**. Wynik przed poprawką: **5 FAIL, 2 PASS**. Trzy szybkie testy wykryły brak reguły łamania H1, dwa testy PDF odtworzyły automatyczne pomniejszenie treści:

| caseCode | Wiersze | Strony przed zmianą | Minimum fontu PDF | Overflow ekran / szerokość druku |
|---|---:|---:|---:|---|
| `DEMO-TT-REVIEW` | 25 | 6 | 12 pt | nie / nie |
| `'W'.repeat(39)` | 25 | 4 | 8.464888572692871 pt | tak / tak |
| `'W'.repeat(40)` | 25 | 4 | 8.253249168395996 pt | tak / tak |
| kontrola jednowierszowa | 1 | 3 | 12 pt | nie / nie |

Źródłem był niełamliwy długi wyraz H1. Sam zapis `body{font:12pt...}` nie chronił przed skalowaniem strony przez silnik wydruku. Stopka nadal miała 12 pt; dlatego nie wystarczało sprawdzenie wyłącznie stopki.

## GREEN: faktyczna inspekcja PDF po poprawce

**46/46 testów raportów PASS w 6 plikach**, w tym **7/7 nowych testów**: trzy szybkie regresje i cztery rzeczywiste wydruki. Każdy PDF powstał bez `scale`, bez szablonów nagłówka/stopki Playwright, przez:

```js
page.pdf({preferCSSPageSize:true,printBackground:true})
```

| Wariant | Strony po zmianie | Minimum fontu na każdej stronie | Pełny caseCode / rewizja / skrót SHA-256 w każdej stopce |
|---|---:|---:|---|
| normalny, 25 wierszy | 6 | 12 pt | PASS |
| 39 szerokich znaków, 25 wierszy | 6 | 12 pt | PASS |
| 40 szerokich znaków, 25 wierszy | 6 | 12 pt | PASS |
| normalny, fixture jednowierszowy | 3 | 12 pt | PASS |

Łącznie sprawdzono **4 PDF / 21 stron**:

- Font wszystkich niepustych spanów PDF: minimum **12 pt**, próg regresji **11.99 pt**.
- Pełny literalny nagłówek odzyskany z warstwy tekstowej pierwszej strony, również gdy H1 łamie się na dwa wiersze; H1 zachowuje 28 pt.
- Wszystkie spany mieszczą się na stronie; brak overflow przy szerokości ekranu 1400 px oraz obszaru druku 1032 px.
- Stopka każdej strony zawiera pełny identyfikator, rewizję i właściwy skrót SHA-256; najmniejszy odstęp treść–stopka: **29.0390625 pt** (wymagane >5 pt).
- **0 błędnych glifów** w źródłowej warstwie PDF: brak glifu `.notdef` dla znaków niebędących białymi znakami, kodu NUL i U+FFFD. Nie oceniano tego wyłącznie na podstawie obrazu.
- **0 błędów strony, 0 żądań zewnętrznych, 0 elementów script/iframe/img/link**; CSP zachowane.
- Obejrzano raster pierwszej i ostatniej strony `wide40`: nagłówek łamany bez przycinania, czytelny tekst, stopka odseparowana.

Standardowe trzy raporty wykorzystują rzeczywisty ciąg `repairMesh(createDemoMesh())` → `scaleZone(...,-3,...)` → `measureMesh(...,10)` oraz rzeczywisty audyt. **25 poziomów, 24 ważne wyniki, 0 ręcznych taśm**; nie dodawano ani nie powielano wierszy dla uzyskania liczby stron. Jednowierszowy wariant jest małym fixture jednostkowym, nie pomiarem pacjenta.

SHA-256 standardowej geometrii zweryfikowano niezależnie przez Node `createHash`, odtwarzając układ binarny liczników, pozycji Float32 LE i indeksów UInt32 LE:

```text
ba4d91b59f1173d98c402ab390d1c727244e11d068f762edfa365f42934214bf
```

Porównanie wszystkich czterech plików HTML RED/GREEN potwierdziło identyczną treść po uwzględnieniu wyłącznie dodanej deklaracji CSS H1. Nie zmieniono wartości pomiarów ani dowodów audytu.

## Pozostała regresja

- `npx vitest run`: **295 PASS, 8 SKIP, 0 FAIL**, 50 plików (49 PASS, 1 SKIP). Cztery nowe testy PDF są domyślnie opt-in; wykonano je osobno w pełnym zestawie raportów powyżej.
- `npx tsc -p tsconfig.json --noEmit`: **exit 0**.
- Istniejące testy prywatności dziennika, walidacji statusów audytu, niepełnego zestawu dowodów i niezmienności snapshotu pozostają PASS.
- Pierwsza próba typecheck wskazywała nieistniejący `tsconfig.app.json`; po odczytaniu konfiguracji uruchomiono poprawny plik `tsconfig.json`. Nie zmieniano konfiguracji ani interpretera Python.

## Odtworzenie

Z katalogu repozytorium, w bash, z interpreterem mającym PyMuPDF i zainstalowanym Chromium Playwright:

```bash
export REPORT_PDF_PYTHON="$(python -c 'import sys; print(sys.executable)')"
# Jeżeli PyMuPDF znajduje się poza site-packages interpretera, ustaw PYTHONPATH.
ORTHO_REAL_REPORT_PDF=1 \
REPORT_PDF_ARTIFACT_DIR="$TMPDIR/ortho-report-long-code-rerun" \
npx vitest run tests/v02-reports-long-code.test.ts
```

Na tym hoście użyto istniejącego bazowego `python`, a `PYTHONPATH` wskazywał `C:/Users/sandr/AppData/Local/hermes/cache/scratch/ortho-pdf-site`. Nie tworzono venv ani alternatywnych launcherów.

## Artefakty wykonania

Katalog bazowy: `C:/Users/sandr/AppData/Local/hermes/cache/scratch/`.

- `ortho-report-long-code-red/`: `normal`, `wide39`, `wide40`, `normal-one-row` — każdy jako `.html`, `.pdf`, `.json`, plus rastry pierwszej/ostatniej strony. Dowody sprzed poprawki.
- `ortho-report-long-code-green/`: analogiczne cztery komplety po poprawce; zwłaszcza `wide40.pdf` i `wide40.json`.
- `ortho-report-long-code-green/summary.json`: agregacja 21 stron i porównanie treści RED/GREEN.
- `ortho-report-long-code-green/focused-tests.json`: 46/46 testów raportów.
- `ortho-report-long-code-green/full-suite.json`: wynik pełnego zestawu jednostkowego.

Weryfikacja dotyczy rzeczywistego PDF silnika Chromium, nie fizycznej drukarki ani klinicznej gotowości całej aplikacji. Pełny niezależny re-review pozostaje zadaniem nadrzędnym.
