# M0 — wykonanie zatwierdzonego zakresu B metodą TDD

Status: plan aktywny — niezależny rereview poprawionego integratora zakończył się PASS do rozpoczęcia M0. Zatwierdzony produkt: gładka linia 3D + niepłaska powłoka + zewnętrzny kołnierz. Nie zastępujemy go łamaną po krawędziach ani samym szkicem. Ten plik nie jest wynikiem testów i nie oznacza ukończenia funkcji.

Normatywne źródło: `trimline-v03-integrated-design.md`, w szczególności S/B/C/R, trzy osobne limity błędu, certyfikat osadzenia i zakaz niezależnego refinamentu inner po zamrożeniu. Bazowy pełny run po odtworzeniu narzędzia PDF: `../verification/v03-baseline-restored-tools.json`, 334 PASS/0 FAIL/0 pending i TypeScript exit0. Pierwszy run z brakującym PyMuPDF zachowano, nie osłabiono testów.

## 0. Warunki rozpoczęcia i granice własności

- Odebrać niezależny rereview integratora; pozostały blocker zatrzymuje kod. Nie pytać ponownie o wybrane gładka/powłoka/kołnierz.
- Utworzyć osobną gałąź rozwojową od obecnego checkoutu po sprawdzeniu nazwy/stanu; zachować niecommitowane dokumenty. Nigdy reset/clean/discard cudzych zmian, push ani nadpisanie ZIP 0.2.0.
- Wydane `dist/` i ZIP pozostają niezmienione. Nowy kod trafia na gałąź rozwojową; nie zmieniać wersji wydania ani istniejących modułów bez potrzebnego testu.
- Każdy pionowy krok: jeden test zachowania → rzeczywisty oczekiwany FAIL → minimalna implementacja → PASS → następny krok. Błąd importu/literówka nie zastępuje RED. Dopuszczalny pusty/type-only scaffold nowego modułu nie ma implementować zachowania; pierwszy test ma zgłosić brak wymaganej operacji, nie błędną ścieżkę.
- Wszystkie dane przypadków poniżej są syntetyczne. Zero pacjentów, danych osobowych, nowych usług sieciowych i bibliotek runtime.

## 1. M0a — dokładna arytmetyka i jedno zaokrąglenie Float32

Właściciel implementera A wyłącznie:
- `src/trimline/numerics.ts`
- `tests/v03-numerics.test.ts`

To nowy niepodłączony do aplikacji moduł. Nie edytować geometry/index, compute, App, typów starego projektu ani testów innych właścicieli.

### Zamrożony kontrakt eksportów M0a

```ts
export interface Rational { readonly n: bigint; readonly d: bigint }
export interface ArithmeticLimits { maxBits: number; maxOperations: number }
export interface ArithmeticContext { /* nieprzezroczyste, własne liczniki */ }
export function createArithmeticContext(limits: ArithmeticLimits): ArithmeticContext;
export function rational(n: bigint, d: bigint, ctx: ArithmeticContext): Rational;
export function add(a: Rational, b: Rational, ctx: ArithmeticContext): Rational;
export function subtract(a: Rational, b: Rational, ctx: ArithmeticContext): Rational;
export function multiply(a: Rational, b: Rational, ctx: ArithmeticContext): Rational;
export function divide(a: Rational, b: Rational, ctx: ArithmeticContext): Rational;
export function compare(a: Rational, b: Rational, ctx: ArithmeticContext): -1 | 0 | 1;
export function fromFloat32Bits(bits: number, ctx: ArithmeticContext): Rational;
export function toFloat32Bits(value: Rational, ctx: ArithmeticContext): number;
export class NumericsError extends Error {
  readonly code: 'INVALID_INPUT' | 'BUDGET_EXCEEDED' | 'FLOAT32_OVERFLOW';
}
```

- BigInt n/d znormalizowane, d>0, gcd usunięty, zero matematyczne 0/1; wartości niemutowalne. Walidacja bez Number/string coercion. Sfałszowane wartości i konteksty nie mogą omijać invariantów/liczników; sposób enkapsulacji jest wewnętrzny.
- Limity dodatnie całkowite, do 4096 bitów i 2 mln operacji. Każda operacja/pętla algorytmiczna rozliczona, sprawdzenie przed niebezpiecznie dużym wynikiem pośrednim; brak nieograniczonego iloczynu/gcd/shift. Konserwatywna odmowa przy limicie jest dozwolona i jawna, nie częściowy wynik.
- fromFloat32Bits przyjmuje wyłącznie całkowity uint32 i odrzuca NaN/Infinity. Ujemne zero wejścia przechodzi do matematycznego 0/1; starych wierzchołków nie rekonstruuje się przez tę utratną względem znaku zera ścieżkę, tylko kopiuje ich bity.
- toFloat32Bits to dokładne round-to-nearest, ties-to-even z liczby wymiernej, bez pośredniego Number(n)/Number(d). Wynik uint32, także subnormal/underflow. Matematyczne zero daje +0; ujemna niezerowa wartość zaokrąglająca się do zera daje IEEE -0. Overflow odrzucany kodem, nie Infinity w siatce.
- Pierwszy test zaokrąglania musi odtworzyć rzeczywisty obliczony kontrprzykład: `1 + 2^-24 + 2^-200` → `0x3f800001`, a droga przez Float64 daje `0x3f800000`. Obliczenie pomocnicze wykonano, nie jest to jeszcze test nowego modułu.
- Pozostałe pionowe przypadki: normalizacja znaków/zera, cztery działania i porównanie, dzielenie przez zero, wielkości i kroki limit/limit+1, niemutowalność/forge, oba znaki, dokładnie połowy między F32 o parzystej/nieparzystej mantysie, zero/minsubnormal, subnormal/normal, maksymalna finite i próg overflow.

## 2. M0b — niezależny oracle, równolegle z M0a

Właściciel implementera B wyłącznie:
- `tests/reference/v03_f32_oracle.py`
- `tests/reference/test_v03_f32_oracle.py`
- `tests/fixtures/v03-f32-oracle.json`

- Python stdlib, Fraction i monotoniczne wyszukiwanie po dodatnich finite kodach Float32 z dokładnym porównaniem odległości i ties-even. Nie kopiować algorytmu TS ani używać float(Fraction) jako rozstrzygnięcia nearest; ta droga ma podany kontrprzykład.
- Oracle waliduje kanoniczne dziesiętne n/d i limity; oddziela finite od overflow. Znaki i underflow zgodne z kontraktem M0a. Python nie jest zależnością aplikacji.
- Testy unittest najpierw RED, potem implementacja; osobne testy oracle, także kontrprzykład i granice. Generator musi zostać naprawdę uruchomiony, a JSON pochodzić z jego wykonania, nie z ręcznie wpisanych rzekomych wyników.
- Zamrożony format fixture: `{format:'OrthoSculptFloat32Oracle',version:1,cases:[{id:string,n:string,d:string,expected:{kind:'finite',bits:number}|{kind:'overflow'}}]}`. Wartości n/d kanoniczne i d dodatnie. Id unikalny; pokrycie obu znaków, połówek, subnormalnych, overflow i ustalonych deterministycznych dodatkowych przypadków. Faktyczną liczbę przypadków odczytuje rodzic, nie deklarować z góry wyniku.
- Nie czytać implementacji A; niezależność metody jest częścią odbioru. Granice typu/liczby bitów wejścia przed kosztownym parse.

## 3. Integracja i niezależny odbiór samego M0a/b

Własność rodzica: `tests/v03-numerics-oracle.test.ts` i raporty z faktycznych przebiegów, po dostarczeniu obu modułów i fixture.

1. Uruchomić polecenia dostarczone przez autorów oraz unittest oracle. Sprawdzić wygenerowany fixture i liczbę/id, potem dołączyć porównanie każdego przypadku z TS. Nie tworzyć fikcyjnych expected.
2. Spec-review i quality-review w świeżym kontekście dla kodu (nie aprobata autora). Konkretny blocker najpierw odtworzyć; naprawa w oddzielnym kontekście i ponowny odbiór.
3. Rodzic uruchamia targeted, cały zestaw z real Worker/PDF i TypeScript sekwencyjnie. PyMuPDF w `node_modules/.cache/orthosculpt-report-python`; interpreter rozwiązać przez sys.executable. TEMP/TMP/TMPDIR do Hermes scratch. Nie nadpisywać wcześniejszych raportów.
4. Nie przebudowywać wspólnego dist. Zweryfikować brak zmiany starego runtime i archiwum. Dopiero po zielonym odbiorze dokładnie wybranych plików commit na gałęzi rozwojowej, bez cudzych plików.
5. Wynik tej fazy to działający, przetestowany fundament liczbowy, NIE ukończone M0 ani działająca linia/powłoka.

## 4. Następne obowiązkowe bramki M0 — nie wykonane

- M0c: gładkie odcinki w ścianach, certyfikowany dwustronny błąd aproksymacji ≤0,005 mm i prostota/topologia; ciągłość lokalna przez ściany z pełną identyfikacją trasy, bez obietnicy euklidesowej C1 przez ostre fasety.
- M0d: exact arrangements/triangulacja pełnego podziału OBU części, kanoniczne wspólne zdarzenia i C, Q oraz całopowierzchniowy błąd ≤0,010 mm; osobny certyfikat osadzenia/bliskich płatów, bez którego UNKNOWN blokuje.
- M0e: normatywne normalne i strona względem C, source–rim/offset włącznie z discarded, bez pomijania całych par; niepłaski shell i zewnętrzny kołnierz, refinament bez cichej zmiany R.
- Każda bramka ma nowe konkretne interfejsy i pionowe testy przed implementacją. Nie rozwijać dużego UI ani deklarować pełnego feature PASS, jeśli nie uda się zamknąć dowodu rdzenia. Nie przechodzić do innego/niedokładnego kernela po cichu.

## 5. Późniejszy pełny odbiór produktu

Dopiero po M0: wspólne Worker admission i fences, pełny v3/source/recipe/crypto, undo/rejestracja/taśmy, UI z prawdziwym pickingiem i preview, niepłaski cut→shell+kołnierz→zapis/reload→rzeczywiste STL/3MF→niezależny audyt pobranych plików. Wszystkie to nadal zadania, nie obecne wyniki. Nowy release ma własny zamrożony build/ZIP/smoke; żadnego nadpisania 0.2.0. Native WebView i kliniczny odbiór pozostają odrębnymi bramkami.
