# OrthoSculpt CAD 0.2.0 — odbiór techniczny

## Status i zakres

Lokalna, polskojęzyczna pracownia TT: import kolorowego skanu, orientacja, pomiary i taśmy, rektyfikacja z referencją, kontrolowane rewizje, szyfrowany projekt, raport oraz STL/3MF do dalszego CAM. Dostawa zawiera gotowy dist, serwer Node stdlib, kod i testy. Nie wymaga kont ani internetu do normalnego uruchomienia.

**Zaakceptowano wskazany zakres techniczno-badawczy. Nie jest to gotowy wyrób kliniczny, zwalidowany proces produkcji ani aplikacja natywna EXE.** Macierz pełnego briefu i odstępstwa: `../REQUIREMENTS.md`.

## Końcowe wykonanie rodzica

| Próba | Wynik | Raport |
|---|---|---|
| Pełny Vitest, rzeczywiste Chromium Workers i PDF, maxWorkers=1 | **326 PASS, 0 FAIL, 0 SKIP; 53 pliki** | `v02-release-unit-serial.json` |
| Pełny Playwright na zamrożonym produkcyjnym buildzie | **22 PASS, 0 FAIL, 0 SKIP, 0 flaky** | `../screenshots/v02-e2e/candidate-final-summary.json` |
| TypeScript / Vite build | exit 0; WebGL2 sprawdzony w działaniu | bundle poniżej |
| Rust geometry / native state / security config | **20 / 5 / 2 PASS**, osobne harnessy | rzeczywiste cargo test i security_config.py |
| npm audit | 0 zgłoszonych znanych podatności | `v02-final-npm-audit.json` |
| Cztery rzeczywiste PDF, w tym maksymalny kod 40×W | 21 stron; minimum 12pt; identyfikacja każdej strony; bez overflow | `v02-report-print-re-review.json` |

Nie sumujemy historycznych testów subagentów z wynikiem pełnego przebiegu. Maszynowy punkt wejścia: `v02-release-acceptance.json`.

Równoległe powtórzenie pełnego zestawu miało timeouty i jest zachowane w `v02-release-unit.json`. Kompletny kolejny przebieg, bez równoległego E2E i z jednym procesem testującym, przeszedł bez pominięć. Nie zwiększano limitów czasowych ani nie osłabiano asercji. Przyczyna sprzętowa nie została osobno dowiedziona; do powtarzalnego odbioru zalecamy uruchomienie sekwencyjne.

## Co rzeczywiście sprawdzono

- Import RGB i topologia, bez rozcinania wspólnych indeksów dla zgodnych face-RGB; konflikty są odrzucane jawnie. Niepewne cienkie nakładanie nie otrzymuje PASS, nieznana baza mapy nie staje się zielonym zerem.
- Parametry zadań odrzucane przed konstrukcją Workera i kopiowaniem; wyłącznie własne bufory transferowe. Rzeczywiste Chromium: oryginalne bufory pozostają podłączone i niezmienione.
- Pseudonimowy projekt i dziennik; migracja v1 bez wymyślonej historii; błędne i dziurawe dane odrzucane przed Blob/KDF.
- Szyfrowany download/reload, niezależne Node crypto, błędne hasło i tamper bez utraty poprzedniego projektu. Stay/Escape i rzeczywisty beforeunload, także po pobraniu kopii.
- Aktywny gest + keyboard Undo/Nowy projekt nie odtwarza starej geometrii. Utrata capture anuluje gest; poprawny gest ma jeden wpis/rewizję/undo, zachowuje RGB i bazę.
- Pomiary/taśmy/kalibracja z rzeczywistymi resztami, przekroje CAD i referencji na tym samym Z, rzeczywisty canvas 3D. Anulowanie kończy natywnego Workera i nie publikuje starego wyniku.
- Konflikt audytu i indeksów po zapisie: odtworzony RED w 4 kontekstach; po poprawce niezmieniona regresja obejmuje 20 pobrań, maksymalnie 2 Workery compute, bez chwilowych lub trwałych alertów. Niezależny reviewer powtórzył stres i dodatkowy lifecycle.
- Raport ma faktyczny hash geometrii i rewizję, ograniczoną listę parametrów dziennika, ścisłe statusy, ochronę przed niepełnym audytem; PDF sprawdzony również dla szerokiego maksymalnego kodu.
- Rzeczywiste pliki STL/3MF, poprawny kontener/relacje/jednostki 3MF, reload projektu; CSP, brak zewnętrznych żądań i błędów strony w badanych scenariuszach; pięć etapów bez overflow przy 1024/390 px.

## Niezależne odbiory

`v02-re-review-core.json`, `v02-gesture-re-review.json`, `v02-worker-budget-re-review.json` i `v02-report-print-re-review.json` potwierdzają poszczególne poprawki. Brak findingów w ich zakresie nie jest globalną gwarancją bezpieczeństwa. Zalecenia nieblokujące, m.in. dodatkowe trwałe testy blur/pointercancel i awarii audytu, są zachowane w raportach.

Aktualny entry: `index-Ct_H4HMR.js`; SHA-256: `08b834a1b18f73ec18e9017daca67a271dbab44d1e7492eed5c5ab320293d3dd`. Maszynowe zestawy manifestów potwierdzają niezmienność bundla podczas całego E2E.

## Paczka i uruchomienie

Rozpakuj cały ZIP i uruchom `Uruchom-OrthoSculpt.cmd`; wymagany Node.js 22+ (sprawdzony Node 24). Adres domyślny: `http://127.0.0.1:4174`. Nie trzeba npm install ani Rust. Kontrola rzeczywistego rozpakowanego runtime ZIP bez node_modules: model WebGL2, 13 wierszy tabeli pomiarowej, jawny przykład syntetyczny, zero błędów strony i zewnętrznych żądań (`packaging.json`).

Odbiór finalnego pełnego ZIP jest zapisywany po jego rozpakowaniu w osobnym pliku `OrthoSculptCAD-0.2.0-lokalny.verification.json`, dostarczanym obok archiwum i SHA-256. Ten sidecar wiąże wynik z dokładnymi bajtami archiwum; nie należy utożsamiać kontroli checkoutu z kontrolą dowolnego późniejszego ZIP. Kod, notices i instrukcja są dołączone; node_modules, target, .git, instalatory, prywatne wejścia i nieistniejący EXE nie są pakowane.

## Pozostające granice

- **Brak EXE i testu rzeczywistego WebView IPC.** Ostatnia odnotowana próba Tauri zakończyła się AppControl 4551, m.in. generic-array build-script. Nie wyłączano ochrony Windows. Potrzebne zatwierdzone środowisko build/signing; metadata Cargo 0.2.0 nie oznaczają udanego buildu.
- Bez zweryfikowanego sprzętowego WebGPU, 60FPS, <0,5ms lub benchmarku milionowych skanów. Build nadal ostrzega o dużym głównym chuncku.
- Audyt ma budżety i UNKNOWN; nie ma globalnej gwarancji braku przecięć, minimalnej grubości, solid-offset, wytrzymałości czy dopasowania. Nie ma pełnego Liepa/Delaunay, ogólnego remeshingu ani dowolnego trimline.
- Gest oblicza się po zwolnieniu, bez live-deform preview. PCA/rejestracja nie rozpoznają anatomii; kalibracja jest przybliżona, powłoka eksperymentalna.
- Adapter/CNC są poza uzgodnionym zakresem 0.2. Projekty i raport nie stanowią podpisu cyfrowego, pełnego replay wszystkich siatek ani certyfikatu.
- Nie otrzymano reprezentatywnych uprawnionych skanów ani oceny protetyka. Odbiór kliniczny, metrologiczny, mechaniczny i regulacyjny pozostaje otwarty.

Historyczny raport 0.1 zachowano jako `FINAL-v01.md`; nie opisuje aktualnego wydania.
