# Dodatkowe narzędzia kontroli po wydaniu 0.2.0

To uzupełnienie do kodu źródłowego OrthoSculpt CAD 0.2.0, nie samodzielna aplikacja i nie nowe wydanie kliniczne. Nie zastępuje i nie zmienia wydanego ZIP 0.2.0. W folderze docs/verification znajduje się czytelny v021-parent-results.md oraz surowe raporty.

## Wynik odebranego etapu

- 334 testy pełnego zestawu, bez niepowodzeń i pominięć; rzeczywiste Workers/PDF włączone.
- 5 nowych przypadków lifecycle wykonanych po dwa razy: 10 PASS. Natywne zdarzenia i realne Workery; awarie ładowania modułu są świadomym testem odmowy, nie twierdzeniem o normalnej awaryjności.
- 4 modele syntetyczne zmierzone kolejno; kontrola 400k jawnie pominięta przed alokacją. Wyniki nie dowodzą czasu na skanach pacjentów, FPS ani szczytowego zużycia RAM Chromium.
- Niezależne review obu zakresów PASS, bez blockerów. Sugestie dalszego wzmocnienia asercji są zachowane.

## Korzystanie z narzędzi

1. Utwórz oddzielną roboczą kopię źródeł 0.2.0. Nie używaj jedynej kopii projektu lub danych.
2. Dodaj do niej pliki z katalogów scripts, tests, e2e i docs tego uzupełnienia, zachowując strukturę. Kod src/compute i src/geometry pochodzi z aplikacji 0.2.0; nie jest powielony w tym dodatku.
3. Narzędzia deweloperskie wymagają zależności: `npm ci` i `npx playwright install chromium`. Ta instalacja może wymagać internetu; nie dotyczy zwykłego uruchamiania gotowej aplikacji.
4. Benchmark: `node scripts/benchmark-geometry.mjs --budget-control --out=NOWY_ABSOLUTNY_KATALOG`. Wyjście musi być nowym katalogiem. Dostępne opcje i znaczenie czasu opisuje docs/verification/v021-benchmark.md.
5. Regresje lifecycle: `npx playwright test e2e/v021-lifecycle.spec.ts --repeat-each=2`. Potrzebna aktywna sesja graficzna, bo sprawdzamy prawdziwy focus. Konfiguracja projektu uruchamia lokalny serwer z gotowego dist na 4176; sprawdź, czy nie używasz serwera innej kopii programu. Każdy test zapisuje faktyczny hash modułu.
6. Helpery benchmarku: `npx vitest run tests/v021-benchmark.test.ts`. Metadane Git są opcjonalne; test używa własnych kontrolowanych plików, nie wymaga .git z oryginalnego repozytorium.

Uruchamiaj benchmark bez równoległych testów/browserów. Niczego nie wyłączaj w zabezpieczeniach Windows. Nie zwiększaj limitów tylko po to, by otrzymać zielony wynik.

## Zestaw dla protetyka

Procedura i puste formularze są w docs/pilot/. Są do ręcznego prowadzenia pilota technicznego, nie do importu CSV do CAD. Wypełnione dokumenty i skany trzymaj poza repozytorium i katalogami pakowanymi. Nie dostarczono rzeczywistych pomiarów, progów klinicznych ani zgody na wytwarzanie.

Natywny EXE/IPC, reprezentatywne skany, odbiór z protetykiem, grubość/offset/mechanika i duże rozszerzenia CAD nadal wymagają osobnej realizacji lub materiałów.
