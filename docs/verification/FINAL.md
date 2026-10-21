# OrthoSculpt CAD 0.1 — odbiór techniczny

## Co dostarczono

Działającą wersję lokalną React/Three.js, gotowy bundle `dist/`, serwer statyczny Node bez dodatkowych zależności do normalnego uruchomienia, źródła Rust/Tauri, testy, instrukcję, research i macierz braków. To wersja badawcza/inżynierska, **nie pełny produkt production-grade ani zwalidowane oprogramowanie kliniczne**.

## Własne wykonanie parenta po poprawkach

| Polecenie / próba | Rzeczywisty wynik |
|---|---|
| `npm test` | 108/108;26 plików;0 niepowodzeń |
| `npm run build` | TypeScript/Vite exit0;bundle `index-DXBcVluP.js` |
| `npx playwright test --reporter=list,json` | 9/9, produkcyjny dist i rzeczywisty lokalny serwer |
| `cargo test --release --manifest-path crates/ortho-geometry/Cargo.toml` | 20/20, realny harness Windows |
| `cargo test --release --manifest-path src-tauri/state-tests/Cargo.toml` | 5/5, stan/generacje/nawigacja/syntetyczny smoke rdzenia |
| `python src-tauri/tests/security_config.py` | 2/2 |
| `npm audit --json` | 0 zgłoszonych znanych podatności w zainstalowanym drzewie; nie jest to audyt kompletnego bezpieczeństwa |
| Skan dodanych linii kodu: sekrety literalne, wykonanie powłoki i eval | Brak dopasowań w sprawdzonych wzorcach; nie zastępuje review |

Raporty maszynowe: `vitest.json`, `playwright.json`, `test-summary.json`, `npm-audit.json`, `static-scan.json`. Liczby pochodzą z wykonania, nie ze zliczania nazw testów w opisie.

### Zakres przeglądarki

Sprawdzono PLY RGB i odrzucenie NaN/listowego RGB, blokadę zewnętrznej tekstury OBJ, granicę File.size przed File.text, tablet1024px, kontrolowany błąd overflow jednostek bez pageerror i utraty UI, pustą strefę bez mutacji/historii, reszty przybliżonej kalibracji z zachowaniem ręcznych taśm oraz pełną ścieżkę: demo→mm→repair→PCA→pomiary→taśma→CSV→kalibracja→strefa/undo→rzeczywisty pędzel/undo→powłoka→STL/3MF→projekt/reload. Test pełnej ścieżki sprawdza brak zewnętrznych żądań HTTP i pageerror. Backend rzeczywiście działający w sprawdzonym Chromium: **WebGL2**.

Zrzuty w `docs/screenshots/` pochodzą z uruchomionej aplikacji. Nie są makietami ani dowodem klinicznej poprawności kształtu.

### Zakres Rust

Oprócz walca, uporządkowanych konturów, BVH i protokołu sprawdzono dokładne regresje review: samoprzecinający się obrys o niezerowym polu, powielone/przeciwnie nawinięte/nieweldowane ściany, nieprzyległe dotykanie/nakładanie oraz poprawne współdzielone krawędzie płaszczyzny. Kontrola prostoty ma jawny budżet pracy; po jego wyczerpaniu wynik jest nieważny, a nie pozornie prawidłowy.

## Niezależne review

Pierwszy przegląd dał FAIL/PARTIAL i odtworzył błędy; poprawki nie były kosmetyczne. Ich reprodukcje RED→GREEN i zakres opisują `REVIEW.md`, `native-review-fixes.md`, `frontend-review-fixes.md`. Parent powtórzył końcowe polecenia powyżej.

Status końcowego ponownego przeglądu: **PASS w ścisłym zakresie poprawek**. Niezależnie wykonano108/108 Vitest,20/20 rdzenia Rust,5/5 stanu,2/2 konfiguracji i TypeScript --noEmit. Dodatkowo sprawdzono maksymalny pakiet250000 konturów/500000 punktów/18000032 bajtów oraz odrzucanie przekroczeń. Nie zgłoszono dalszych błędów lub obaw bezpieczeństwa w tym zakresie. Szczegóły: `re-review.json`. To nie certyfikat całego produktu, kliniczności lub niezweryfikowanego Tauri.

## Pakowanie

Wstępny rzeczywisty ZIP został rozpakowany do odrębnego katalogu scratch. Bez `node_modules` uruchomiono dołączony serwer Node i prawdziwy Chromium: model syntetyczny, WebGL2, tabela przekrojów, brak pageerror i żądań zewnętrznych. Po wszystkich poprawkach powtórzono tę próbę na nowym, rozpakowanym ZIP-ie: PASS,13 rzeczywistych wierszy pomiarowych, WebGL2, brak pageerror i zewnętrznych żądań. Dokładny wynik i SHA256 badanego bundla zapisuje `packaging.json`; końcowy ZIP dystrybucyjny jest dodatkowo sprawdzany względem tych samych bajtów bundla.

Nie pakuje się `node_modules`, Cargo target, instalatorów/toolchainów, `.git`, prywatnych dokumentów wejściowych ani nieistniejącego exe. Gotowy dist i notices licencji są dołączane. Zapis JSON/STL/3MF/CSV nie jest szyfrowany.

## Blokery i granice pozostające po odbiorze

- **Nie ma gotowego .exe.** Parent i reviewerzy odtworzyli Windows AppControl4551 przy uruchomieniu skryptu budowania `camino` (także inne zależności w trybie debug). Zainstalowano i niezależnie wykryto Rust/MSVC/SDK/WebView2, ale pełnego Tauri nie skompilowano/nie uruchomiono. Nie zmieniano ochrony systemu. Realny WebView IPC i natywne pobrania Blob nie są zweryfikowane.
- Sprzętowe WebGPU,60FPS,<0,5ms, milionowe skany i zużycie pamięci nie zostały potwierdzone benchmarkami. Operacje TS są synchroniczne. Build ma ostrzeżenia o dużym chuncku i niewydzielanym dynamicznym imporcie.
- Nie ma pełnego Liepa/Delaunay, ogólnej naprawy/weld/remeshingu z transferem atrybutów, globalnej kontroli samoprzecięć3D, minimalnej grubości i zwalidowanego shellingu.
- Nie ma adaptera producenta, boolean jego połączenia ani G-code CNC. Nie dostarczono potrzebnych danych komponentu i maszyny; UI jawnie blokuje te ścieżki.
- Rejestracja i propozycja PCA nie potwierdzają anatomii lub obu stron kończyny. Kalibracja jest przybliżeniem na istniejących wierzchołkach i pokazuje reszty. Powłoka normal-offset pozostaje eksperymentalna.
- Nie wykonano prób na reprezentatywnym uprawnionym zbiorze skanów pacjentów ani walidacji metrologicznej/klinicznej/mechanicznej/regulacyjnej. Testy syntetyczne potwierdzają kod dla badanych przypadków, nie bezpieczeństwo protezy.

Szczegóły: `README.md`, `docs/REQUIREMENTS.md`, `docs/RESEARCH.md`. Ta jawna lista luk jest częścią dostawy, nie deklaracją wykonania pełnego pierwotnego zakresu.
