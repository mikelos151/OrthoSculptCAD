# 0.2.1 — trwałe rzeczywiste regresje lifecycle

## Wynik

**5 przypadków, każdy wykonany dwa razy: 10 PASS, 0 FAIL, 0 unsupported, 0 skipped, 0 flaky.** Końcowy przebieg: 2026-10-26T18:40:30.841Z, 65,244 s. Natywny Chromium 156.0.8078.4, Windows, tryb headed. Osobny TypeScript check nowego speca: PASS.

Nie odtworzono nowego błędu produkcyjnego. Nie zmieniono produkcji, istniejących testów, konfiguracji, wersji, pakietów ani root `dist`. Brak stagingu i commitów. `git diff --exit-code` oraz `git diff --cached --exit-code`: exit 0. Inne pliki untracked dodawane równolegle przez pozostałych wykonawców nie należą do tego zadania.

## Zamrożony przedmiot badania

- Repozytorium: `C:/Users/sandr/OrthoSculptCAD`.
- HEAD: `5fc4dbe95a617e317197305126a9474a2d5fc0be`.
- Serwer rodzica, nieprzebudowany i niezatrzymany: `http://127.0.0.1:4176`.
- Faktycznie pobrany moduł: `/assets/index-Ct_H4HMR.js`.
- SHA256 modułu: `08b834a1b18f73ec18e9017daca67a271dbab44d1e7492eed5c5ab320293d3dd`. Każde wykonanie sprawdzało tę wartość przed startem scenariusza.
- Drzewo `src` (66 plików) SHA256: `f543589f4720eb21f69366a8f1ecc0a5ca07374029b81faafbbddc6e21b301a1`. Algorytm w `v021-lifecycle-evidence/summary.json`.
- SHA256 końcowego speca: `f779af0d542ce774e20b99295204264f654c07fec5a14dc3f4c5ce7373f4a0c0`.

## Pokrycie i niezależne obserwacje

| Przypadek | Rzeczywisty bodziec i sprawdzone niezmienniki | Wynik |
|---|---|---|
| Native pointercancel | CDP `touchStart` → `touchMove` → obserwowany trusted `gotpointercapture` na canvas → `touchCancel` → trusted `pointercancel`. Komunikat aplikacji potwierdza anulowanie rozpoczętego pociągnięcia. Brak dispatchu stroke i dokładnie ten sam publicznie pobrany projekt: pozycje, RGB, baza, rewizja, dziennik; licznik undo bez zmian. Ponowne włączenie pędzla przez UI i rzeczywisty gest wielu dabów: zmieniona geometria, jeden dispatch, jeden wpis, jedna rewizja, jedno undo i dokładne odtworzenie siatki/bazy/taśm. | 2/2 PASS |
| Native window blur | Wyłączona automatyczna emulacja focusu Playwright na obu targetach. Aplikacja ma rzeczywisty focus, gest myszy ma trusted capture; `bringToFront` drugiej rzeczywistej strony wywołuje nowy trusted blur i `document.hasFocus() === false`. Żaden DOM blur nie jest fabrykowany. Anulowanie i kolejny prawidłowy gest mają te same ścisłe bramki co wyżej. | 2/2 PASS |
| Czytelnicy → mutacja → audyt → undo → New Project | Oba natywne Workery przekrojów żyją przed korektą strefy. Dwa `terminate` występują **przed** natywnym dispatch `zone`; przy dispatch żyje wyłącznie Worker mutacji. Prawdziwa odpowiedź mutacji dostarcza zmienione współrzędne; `topology` i `analyze` otrzymują dokładnie te współrzędne i oba kończą się oraz zwalniają Worker przed pierwszym `init`. Undo wymaga nowego audytu przywróconych dokładnych współrzędnych przed `init`; wraca oryginalny kontur, siatka/RGB/baza i licznik undo. UNKNOWN pozostaje UNKNOWN. New Project zwalnia wszystkich żywych czytelników i przez dodatkową sekundę nie odtwarza indeksów. | 2/2 PASS |
| **Celowa awaria ładowania audytu topology** | `route.abort('failed')` przerywa rzeczywiste żądanie modułu nowego Workera po zakończonej mutacji. Obserwowany trusted natywny `Worker.onerror`, alert i zwolnienie Workera. **Zero `init`** w całym przedziale awarii, brak obu konturów i żywych Workerów. Publiczny download przy nadal aktywnym uszkodzeniu zachowuje rzeczywisty wynik mutacji, RGB, bazę, rewizję, dziennik i undo. Po przywróceniu ładowania kolejny download użytkownika uruchamia prawdziwy ponowny audyt i odbudowuje oba kontury; projekt pozostaje dokładnie równy, alert znika. | 2/2 PASS |
| **Celowa awaria ładowania audytu analyze** | Analogiczna odmowa i recovery, ale po udanym topology rzeczywiście pada Worker analyze. Asercja koreluje jego dispatch, identyfikator Workera i natywny error. Nowy udany topology/analyze ponownie poprzedza indeksowanie. | 2/2 PASS |

Obserwator opakowuje natywny konstruktor/prototyp wyłącznie do zapisu chronologii. Wszystkie konstrukcje, `postMessage`, odpowiedzi, obliczenia i `terminate` przechodzą przez prawdziwe API. Brak opóźniania obliczeń, dublerów Workerów, sztucznych odpowiedzi i zapisu do stanu aplikacji. Kopie współrzędnych w dowodach pochodzą wyłącznie z publicznej syntetycznej siatki inżynierskiej. Maksimum zaobserwowanych natywnych compute Workerów wyniosło 2; zero pageerror, zewnętrznych żądań i naruszeń CSP we wszystkich 10 końcowych załącznikach.

## Odtworzenie

Z katalogu repozytorium, w bash, przy działającym zamrożonym serwerze rodzica:

```bash
set -o pipefail
ORTHO_FROZEN_SHA=08b834a1b18f73ec18e9017daca67a271dbab44d1e7492eed5c5ab320293d3dd \
PLAYWRIGHT_JSON_OUTPUT_NAME=docs/verification/v021-lifecycle-evidence/final-run.json \
"C:/Program Files/nodejs/node.exe" node_modules/@playwright/test/cli.js test \
  e2e/v021-lifecycle.spec.ts --repeat-each=2 --reporter=list,json \
  --output=docs/verification/v021-lifecycle-evidence/final-artifacts \
  2>&1 | tee docs/verification/v021-lifecycle-evidence/final-list.txt

"C:/Program Files/nodejs/node.exe" node_modules/typescript/bin/tsc \
  --noEmit --target ES2022 --module ESNext --moduleResolution bundler \
  --lib ES2022,DOM,DOM.Iterable --skipLibCheck --strict e2e/v021-lifecycle.spec.ts
```

Aby testować przyszły build, pomiń `ORTHO_FROZEN_SHA` lub ustaw hash wyraźnie wybranego nowego artefaktu. Spec zawsze zapisuje faktycznie pobrany hash. Headed Chromium jest jawnie ustawiony w tym specu — potrzebna jest dostępna sesja graficzna; nie maskujemy braku natywnego focusu syntetycznym eventem ani skipem.

## Dowody i problemy harnessu

- Źródło: `e2e/v021-lifecycle.spec.ts`.
- Główny wynik i liczby: `v021-lifecycle-evidence/final-run.json`, `final-list.txt`, `summary.json`.
- `final-artifacts/**/attachments/*.json`: **10 oddzielnych, odczytanych i zweryfikowanych załączników**, po jednym dla każdego końcowego wykonania. JSON zawiera chronologię natywnych Workerów, snapshoty żywych Workerów, obserwacje pointer/focus, hash i privacy. Pliki JSON/PNG bezpośrednio w folderze to ostatnie wykonanie każdego z 5 przypadków.
- Wstępne przebiegi pozostawiono jawnie jako `run-01`–`run-04`: nie są dodatkowymi końcowymi wynikami. Run01: 5 nieudanych scenariuszy podczas dopracowania harnessu (błędne założenie, że anulowanie nie wyłącza pędzla; obserwator pomijał bezpośredni `result.positions`; wymuszony focus Playwright blokował blur). Run02: błąd konfiguracji Playwright przed wykonaniem testów (`headless` nie może być ustawiony wewnątrz describe). Run03: 1 PASS i 4 FAIL (jednorazowe zamknięcie procesu Chromium przy launch, nadal wymuszony focus i niewłaściwy oczekiwany identyfikator dziennika `zone` zamiast rzeczywistego `scale-zone`). Run04: 5 PASS. Żadnej z tych pomyłek harnessu nie naprawiano zmianą produkcji ani osłabieniem niezmienników. Duże ZIP-y trace wstępnych pomyłek harnessu usunięto; zachowano ich surowe reportery, konteksty błędów i JSON-y obserwacji.

## Granice

Wyłącznie techniczna regresja przeglądarkowa na syntetycznym RGB PLY. Celowe awarie modułu **nie** są twierdzeniem o awarii podczas normalnego użycia. Brak prawdziwych skanów, odbioru klinicznego, EXE/Tauri IPC, walidacji urządzenia, gwarancji wydajności lub globalnej jakości geometrii. UNKNOWN nie jest PASS.
