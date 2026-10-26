# Macierz wymagań — zakres 0.2 / odbiór techniczny

Ta macierz odróżnia gotowy kod, wykonane testy i niezaimplementowane wymagania. „Działa” oznacza sprawdzone zachowanie inżynierskie, nie walidację kliniczną.

| Wymaganie briefu | Stan | Dowód / granica |
|---|---|---|
| React19/TS/Vite/Tailwind/Lucide | Wykonane | Build TypeScript/Vite, rzeczywisty interfejs |
| Shadcn UI | Częściowo | Własny dostępny interfejs; nie jest pełną instalacją generatora Shadcn |
| Tauri2 + Rust + pojedynczy .exe | Kod + blocker | Rust/MSVC/WebView2 dostępne; rzeczywisty build powtórzony 2026-10-26: AppControl4551 generic-array, exit101; brak gotowego exe |
| Three WebGPU + fallback WebGL2 | Kod + częściowa weryfikacja | Sprawdzony działający WebGL2; sprzętowy WebGPU niezweryfikowany |
| Binarne IPC / TypedArrays | Kod + testy protokołu/stanu | Rzeczywisty natywny WebView IPC niezweryfikowany; to nie true zero-copy |
| Rust BVH/przedziały | Wykonane i testowane | Własny rdzeń, test pruning; brak gwarancji <0,5ms |
| Wszystkie operacje geometryczne w Rust | Niepełne | Rust: import pakietu siatki, indeks i slicing; pozostałe operacje obecnie TS |
| Pełna half-edge / Liepa / Delaunay repair | Niezaimplementowane w tej postaci | Są adjacency/edge topology, degeneracje i konserwatywny earcut płaskich pętli |
| PLY z RGB ASCII/binary | Wykonane | Testy parsera i rzeczywisty browser zachowania kolorów; tylko trójkąty, bez teksturowanego PLY |
| OBJ+MTL+PNG/JPEG | Wykonane w ograniczonym zakresie | Jedna lokalna diffuse texture, UV, brak URL; inne przypadki jawnie odrzucane |
| STL ASCII/binary | Wykonane | Roundtrip, normalne i rozmiar binarny |
| Ogólna automatyczna szczelność i outward normals | Częściowo, fail-closed | Konserwatywne caps i jawna orientacja prostych zamkniętych powierzchni; otwarte/złożone/nieprzebadane nie otrzymują outward. Nie jest to pełny repair CAD |
| PCA | Wykonane inżyniersko | Zintegrowane momenty powierzchni trójkątów/Jacobi; kontrola retriangulacji, obrotu, translacji i niejednoznaczności |
| Rejestracja 3 punktów | Wykonane inżyniersko | Jawna strona R/L; X ku prawej pacjenta; dodatnia chiralia bez odbicia; zapis landmarków i macierzy; kliniczny protokół nadal do oceny |
| Automatyczne kliniczne 5° | Celowo zmienione | 0° neutralnie, opcjonalne5° operatora; brak podstaw uniwersalnej recepty |
| Przekroje co10/20mm, suwak i2D | Wykonane + Worker | Rzeczywisty indeks w cached Worker, koordynacja/anulowanie; osobne exact-height porównanie referencji; bez60FPS/0,5ms gwarancji |
| Obwód/AP/ML/pole/objętość segmentu | Wykonane z ograniczeniami | Objętość przybliżona; niejednoznaczny kontur invalid; brak pełnej obsługi zagnieżdżonych otworów |
| Tabela taśmy i kalibracja promieniowa | Wykonane przybliżenie | Z niezmienione, zachowane ręczne taśmy, jawny raport reszt; po zmianie trzeba przeliczyć tabelę |
| Relief/compress/smooth + Hermite | CPU/TS w Workerze | Rzeczywisty raycast, maks128 wskazań na gest; atomowe obliczenie po zwolnieniu, anulowanie i undo; bez live-deform preview/GPU compute/Rust multithread |
| Parametryczna strefa obwodu | Wykonane | Radial XY, Z unchanged, twarde granice strefy |
| Heatmapa green0/blue+/red− | Wykonane | Podpisana referencyjna normalna, granice wizualizacji+8/−10mm; nie biomechanika |
| Powłoka offset4mm i flare15°/R15 | Eksperymentalne | Rzeczywista zszyta geometria, ograniczony audit przecięć; wykryty crossing lub UNKNOWN blokuje shell. Offset nie gwarantuje minimalnej/stałej grubości, wytrzymałości lub dopasowania |
| Boolean4-hole pyramid adapter | Poza uzgodnionym zakresem0.2 | Użytkownik wybrał STL/3MF do dalszego CAM; bez zgadywanego adaptera |
| STL/3MF powłoki | Wykonane badawczo | Pliki faktycznie pobrane i sprawdzone; brak niezależnej certyfikacji slicera/lib3mf |
| Helical4axis CNC G-code | Poza uzgodnionym zakresem0.2 | Użytkownik wybrał STL/3MF; brak profilu konkretnej maszyny i symulacji nie jest maskowany fikcyjnym G-code |
| Pięcioetapowy dotykowy kreator | Wykonane | Browser desktop/tablet; obsługa małych ekranów dodatkowa, nie kliniczny kiosk deployment |
| Produkcyjność / MDR / bezpieczeństwo kliniczne | Niepotwierdzone | Konieczna odrębna kwalifikacja, plan ryzyka, walidacja i badania |


## Dodatkowy zakres pracowni TT w 0.2

| Funkcja | Stan | Granica odbioru |
|---|---|---|
| Workspace v2 / v1 migration | Kod i testy | Pseudonim, strona, liner/kontekst, rejestracja, dziennik; wcześniejsza historia v1 nieznana |
| Szyfrowany projekt | Realny WebCrypto i niezależny Node crypto | PBKDF2/AES-GCM; osobno przeglądarkowy download/reload i hasło/tamper |
| Dirty guard / undo units | Kod i testy | Pobranie nie kasuje ostrzeżenia i nie dowodzi trwałości dysku |
| Referencja 3D/2D | Kod i testy | Robocza baza po orientacji/kalibracji, ten samZ; nie raw scan ani automatyczna rejestracja różnych skanów |
| Raport rewizji HTML/PDF | Kod, testy i realny wydruk Chromium | SHA tylko geometrii, identyfikacja każdej strony, UNKNOWN i jawny plaintext; nie certyfikat |
| Bounded3D audit | Wdrożony; niezależny re-review PASS | Osobno edge/vertex manifold, komponenty, winding, przecięcia i outward; budżet/precyzja => UNKNOWN |
| Pełny replay/branching wszystkich siatek | Niezaimplementowane | Dziennik nie zawiera archiwum każdego stanu; zapisuj ważne rewizje w osobnych plikach |
| Swobodna anatomiczna linia obrzeża / przymiarki | Niezaimplementowane | Parametr flare i płaska granica nie zastępują pełnego trimline CAD |

Źródła kierunku produktu: `RESEARCH-v02.md`. Liczniki testów i wyniki końcowego odbioru należy odczytywać z finalnego raportu wydania, nie sumować historycznych raportów poszczególnych agentów.

## Co blokuje pełne wydanie

1. Zatwierdzone środowisko kompilacji Tauri oraz uruchomienie prawdziwego desktopowego IPC i eksportu.
2. Reprezentatywne, uprawnione do użycia skany testowe i niezależne wzorce pomiarowe. Bieżące demo jest syntetyczne.
3. Kontrola przecięć3D w określonym budżecie jest wdrożona i audytowana; globalnej gwarancji numerycznej, minimalnej grubości, stabilnego solid-offset i bezpiecznego remeshingu nadal nie potwierdzono.
4. Jawna strona i prawoskrętna rama są wdrożone; zatwierdzenie protokołu anatomicznego/pomiarowego z protetykiem pozostaje zewnętrzną bramką.
5. Dane katalogowe adapterów i walidacja połączeń; osobno rzeczywisty postprocesor i symulacja dla każdej maszyny CNC.
6. Geometry Workers oraz oddzielny Worker pędzla/mapy są wdrożone. Wykonano syntetyczne testy rzeczywistego anulowania i heartbeat; pamięć szczytowa/FPS/opóźnienia na docelowych skanach nadal wymagają pomiarów.
7. Przegląd regulacyjny i właściwy program walidacji oprogramowania oraz wyrobów/procesu.
