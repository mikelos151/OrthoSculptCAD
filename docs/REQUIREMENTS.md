# Macierz wymagań — stan wersji 0.1

Ta macierz odróżnia gotowy kod, wykonane testy i niezaimplementowane wymagania. „Działa” oznacza sprawdzone zachowanie inżynierskie, nie walidację kliniczną.

| Wymaganie briefu | Stan | Dowód / granica |
|---|---|---|
| React19/TS/Vite/Tailwind/Lucide | Wykonane | Build TypeScript/Vite, rzeczywisty interfejs |
| Shadcn UI | Częściowo | Własny dostępny interfejs; nie jest pełną instalacją generatora Shadcn |
| Tauri2 + Rust + pojedynczy .exe | Kod + blocker | Rust/MSVC/WebView2 wykryte; Tauri build zablokowany przez AppControl4551; brak gotowego exe |
| Three WebGPU + fallback WebGL2 | Kod + częściowa weryfikacja | Sprawdzony działający WebGL2; sprzętowy WebGPU niezweryfikowany |
| Binarne IPC / TypedArrays | Kod + testy protokołu/stanu | Rzeczywisty natywny WebView IPC niezweryfikowany; to nie true zero-copy |
| Rust BVH/przedziały | Wykonane i testowane | Własny rdzeń, test pruning; brak gwarancji <0,5ms |
| Wszystkie operacje geometryczne w Rust | Niepełne | Rust: import pakietu siatki, indeks i slicing; pozostałe operacje obecnie TS |
| Pełna half-edge / Liepa / Delaunay repair | Niezaimplementowane w tej postaci | Są adjacency/edge topology, degeneracje i konserwatywny earcut płaskich pętli |
| PLY z RGB ASCII/binary | Wykonane | Testy parsera i rzeczywisty browser zachowania kolorów; tylko trójkąty, bez teksturowanego PLY |
| OBJ+MTL+PNG/JPEG | Wykonane w ograniczonym zakresie | Jedna lokalna diffuse texture, UV, brak URL; inne przypadki jawnie odrzucane |
| STL ASCII/binary | Wykonane | Roundtrip, normalne i rozmiar binarny |
| Ogólna automatyczna szczelność i outward normals | Częściowo | Diagnostyka i bezpieczne caps; złożone błędy/winding wymagają operatora |
| PCA | Wykonane | Kowariancja/Jacobi, test obrotu i translacji |
| Rejestracja 3 punktów | Wykonane inżyniersko | Rzutowanie na PCA transverse plane, Gram–Schmidt, reject ambiguity/chirality; brak klinicznej walidacji strony kończyny |
| Automatyczne kliniczne 5° | Celowo zmienione | 0° neutralnie, opcjonalne5° operatora; brak podstaw uniwersalnej recepty |
| Przekroje co10/20mm, suwak i2D | Wykonane | Analityczne testy i realny E2E; brak60FPS/large-mesh benchmark |
| Obwód/AP/ML/pole/objętość segmentu | Wykonane z ograniczeniami | Objętość przybliżona; niejednoznaczny kontur invalid; brak pełnej obsługi zagnieżdżonych otworów |
| Tabela taśmy i kalibracja promieniowa | Wykonane przybliżenie | Z niezmienione, zachowane ręczne taśmy, jawny raport reszt; po zmianie trzeba przeliczyć tabelę |
| Relief/compress/smooth + Hermite | Wykonane CPU/TS | Rzeczywisty raycast i undo sprawdzone; nie GPU compute ani multithread Rust |
| Parametryczna strefa obwodu | Wykonane | Radial XY, Z unchanged, twarde granice strefy |
| Heatmapa green0/blue+/red− | Wykonane | Podpisana referencyjna normalna, granice wizualizacji+8/−10mm; nie biomechanika |
| Powłoka grubość4mm i flare15°/R15 | Eksperymentalne | Rzeczywista zszyta geometria; brak certyfikacji minimalnej grubości/samoprzecięć/wytrzymałości |
| Boolean4-hole pyramid adapter | Niezaimplementowane | Brak geometrii producenta i walidacji; UI jawnie blokuje |
| STL/3MF powłoki | Wykonane badawczo | Pliki faktycznie pobrane i sprawdzone; brak niezależnej certyfikacji slicera/lib3mf |
| Helical4axis CNC G-code | Niezaimplementowane | Brak maszyny, narzędzia i symulacji kolizji; UI jawnie blokuje |
| Pięcioetapowy dotykowy kreator | Wykonane | Browser desktop/tablet; obsługa małych ekranów dodatkowa, nie kliniczny kiosk deployment |
| Produkcyjność / MDR / bezpieczeństwo kliniczne | Niepotwierdzone | Konieczna odrębna kwalifikacja, plan ryzyka, walidacja i badania |

## Co blokuje pełne wydanie

1. Zatwierdzone środowisko kompilacji Tauri oraz uruchomienie prawdziwego desktopowego IPC i eksportu.
2. Reprezentatywne, uprawnione do użycia skany testowe i niezależne wzorce pomiarowe. Bieżące demo jest syntetyczne.
3. Globalna kontrola samoprzecięć, minimalnej grubości i stabilności offsetu; pełna topologia i bezpieczny remeshing z transferem kolorów.
4. Jawna obsługa strony kończyny i zatwierdzona konwencja rejestracji, protokół pomiarowy i kliniczny.
5. Dane katalogowe adapterów i walidacja połączeń; osobno rzeczywisty postprocesor i symulacja dla każdej maszyny CNC.
6. Benchmarki pamięci, FPS i opóźnień na skanach docelowej wielkości; przeniesienie ciężkich operacji poza główny wątek.
7. Przegląd regulacyjny i właściwy program walidacji oprogramowania oraz wyrobów/procesu.
