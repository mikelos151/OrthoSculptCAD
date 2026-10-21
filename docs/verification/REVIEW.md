# Niezależne przeglądy i obsługa uwag

## Wynik przed poprawkami

Nie utożsamiamy zielonego zestawu początkowych testów z brakiem błędów. Niezależni reviewerzy odtworzyli konkretne luki, których wcześniejsze zestawy nie obejmowały. Przegląd całości dał FAIL/PARTIAL, a wydanie paczki zostało wstrzymane do poprawek.

| ID | Priorytet | Odtworzony problem | Obsługa |
|---|---|---|---|
| IPC-01 | P2 | Frontend odrzucał 10001 pętli, mimo poprawnego pakietu backendu | Parent odtworzył RED, ujednolicił 250000 pętli /500000 punktów i limit bajtów; GREEN |
| IPC-02 | P3 | Frontend pakował współrzędne2e6, Rust dopuszcza1e6 | Parent odtworzył RED, ujednolicił limit1e6; GREEN |
| RUST-01 | P1 | Samoprzecinający się kontur graniastosłupa uznany za valid | Naprawiono i odtworzono realny RED→GREEN; parent wykonał20/20 testów Rust; ponowny niezależny odbiór PASS, patrzre-review.json |
| RUST-02 | P1 | Powtórzony trójkąt przecinający płaszczyznę znikał przy deduplikacji | Rozdzielono przecięcia wnętrza od krawędzi na płaszczyźnie; parent20/20, w tym poprawne pierścienie i duplikaty |
| UI-01 | P2 | Metry×1000 mogły przepełnić Float32 doInfinity i opublikować błędny stanReact | Naprawiono sprawdzanie Math.fround i atomową publikację; parent potwierdził test overflow bez pageerror |
| ZONE-01 | P2 | Strefa bez wierzchołków zgłaszała sukces bez zmiany geometrii | Naprawiono wykrywanie rzeczywistego braku zmiany Float32; parent potwierdził brak mutacji, utraty pomiarów lub dodania undo |
| PLY-01 | P3 | RGB zapisane jako listy było po cichu ignorowane | Listowe/mieszane RGB odrzucane w nagłówku; scalar RGB zachowane; testy i browser parenta przechodzą |
| CAL-01 | PARTIAL | Deformacja istniejących wierzchołków nie gwarantuje dokładnego tape-fitting na grubych trójkątach | Raport zintegrowano przed publikacją; browser parenta potwierdził numeryczną resztę i zachowane ręczne taśmy |

Dodatkowe własne regresje parenta: poprawiono odwróconą konwencję kolorów heatmapy (teraz green0/blue+/red−), kontrolę File.size przed File.text oraz separację Vitest/Playwright. Pełny workflow ujawnił też problem rozpoznania płaskiej, lekko pochylonej pokrywy poPCA; właściciel CAM naprawił go bez omijania kroku naprawy.

## Osobne, nierozwiązane granice wydania

- Full Tauri build/launch/real WebView IPC nadal zablokowane przez Windows AppControl4551. To blocker środowiskowy, nie zaliczony test.
- Walidacja kliniczna, adapter producenta, CNC, globalna detekcja samoprzecięć3D/minimalnej grubości i benchmarki dużych siatek pozostają poza wykonanym zakresem, jak w README/REQUIREMENTS.
- Dotychczasowe review nie wykazały potwierdzonej eksfiltracji ani ukrytego połączenia zewnętrznego; nie jest to certyfikat bezpieczeństwa.

Końcowy stan: wszystkie powyższe poprawki wdrożono i sprawdzono. Parent wykonał108/108 testów jednostkowych,9/9 E2E,20/20 geometrii Rust,5/5 stanu i2/2 konfiguracji. Niezależny ponowny przegląd dał PASS w zakresie poprawek; dowody wFINAL.md i re-review.json. Pełne Tauri/EXE i granice produkcyjne nadal pozostają poza potwierdzonym zakresem.
