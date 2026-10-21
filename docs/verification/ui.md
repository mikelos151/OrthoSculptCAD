# Weryfikacja interfejsu OrthoSculpt CAD

## Zakres i pliki

Właściciel UI utworzył `src/App.tsx`, `src/main.tsx`, `src/styles.css`, `src/components/{Viewport,SectionView}.tsx`, `src/components/{workflow,meshView,diagnostics}.ts` i sześć plików `tests/ui-*.test.ts`. Nie zmieniano modułów geometrii, IO, wytwarzania, natywnego mostu ani konfiguracji. Brak stage/commit.

Powierzchnia Configure/Operate: pięć etapów z ikonami i polskimi etykietami, duży rzeczywisty widok Three, przewijany inspektor, surowy RGB/UV i lokalne tekstury, jawne jednostki, rzeczywiste raporty i liczniki, bez fikcyjnych danych pacjenta. Parametr strefy opisuje zmianę **obwodu**, nie objętości. Eksport powłoki jest eksperymentem wymagającym potwierdzenia. Adapter i CNC są jawnie niezrealizowane.

## TDD / testy jednostkowe

Obserwowano RED przed implementacją: brak `workflow`, `SectionView`, `meshView`, `Viewport`, `App` i `diagnostics`; następnie osobne regresje dla taśmy, pochodzenia syntetycznego, ograniczenia siły wygładzania, jawnej etykiety formularza oraz kadrowania przesuniętego przekroju. Każda końcowa implementacja przechodzi odpowiedni test.

Ostatnie wykonanie:

```text
npx vitest run tests/ui-workflow.test.ts tests/ui-mesh.test.ts tests/ui-view.test.ts tests/ui-viewport.test.ts tests/ui-app.test.ts tests/ui-diagnostics.test.ts
Test Files  6 passed (6)
Tests       12 passed (12)
```

Testowane: bramki kroków i jednostek, dodatnie skończone wejścia z przecinkiem, taśma wyłącznie na prawidłowym poziomie, clamp siły smoothing, niezależne kopie siatki, skala jednostek bez mutacji źródła, zachowanie RGB/UV/indeksów i pochodzenia syntetycznego, otwarte vs zamknięte kontury SVG, kadrowanie przekroju po translacji, dostępny punkt montowania viewportu, etykiety początkowego interfejsu i tłumaczenie znanych błędów bez ukrywania nieznanych.

## Kompilacja

`npm run build` ukończone: `tsc -b && vite build`, 1605 modułów, kod wyjścia 0. Bundle JS 1510,52 kB (gzip 418,80 kB). Pozostają ostrzeżenia Vite o rozmiarze chunka i o tym, że dynamiczny import geometrii w `native.ts` nie wydziela chunka, ponieważ moduł jest również importowany statycznie. Brak pozostałych błędów typów w ostatnim wykonaniu.

## Rzeczywista przeglądarka

Narzędzie browser-use było zablokowane przez zajęty profil Brave; **nie zamykano przeglądarki użytkownika**. Zastosowano izolowany Chromium Playwright (`@playwright/test`) i prawdziwy serwer `http://127.0.0.1:4174/`. Aktywny backend w tym środowisku: **WebGL2**, odczytany po `WebGPURenderer.init()`, nie zgadywany z `navigator.gpu`. Brak `pageerror` w zakończonych próbach.

Przeprowadzony rzeczywisty smoke (skrypt pomocniczy w scratch, bez atrap API):

- Start bez modelu, przycisk demonstratora; krok pomiarowy zablokowany do potwierdzenia mm.
- Proceduralna geometria ma 5857 wierzchołków i 11616 trójkątów; widoczny surowy RGB w postaci kolorowych oznaczeń.
- Zapis JSON źródła: `source: synthetic`.
- PCA → zapis projektu: `mesh.positions` równe skopiowanemu `originalPositions`.
- Tabela co 20 mm: 14 rzeczywiście obliczonych poziomów, 11 ważnych. Nieważne brzegi są jawnie oznaczone, nie wypełniane zerowym "pomiarem".
- Wybór ważnego poziomu → rzeczywisty numeryczny wpis taśmy 300 mm → kalibracja. Współrzędne Z pozostały identyczne; nowe `originalPositions` odpowiadają skalibrowanej powierzchni. UI opisuje kalibrację promieniowo w XY po Z.
- Pędzel: rzeczywisty raycast kliknięcia/przeciągnięcia po modelu zmienił 342 współrzędne; zapis JSON potwierdził zmianę. Cofnięcie przywróciło dokładnie wszystkie współrzędne sprzed pociągnięcia. Nawigacja OrbitControls blokowana tylko podczas pociągnięcia, nie stale po wyborze narzędzia.
- Następnie generowanie eksperymentalnej powłoki po PCA i kalibracji oraz rzeczywiste pobrania: STL 1171284 bajty, 3MF 438172 bajty.
- Oddzielny eksport na demonstratorze bez rejestracji: STL 23424 trójkąty, 1171284 bajty i zgodność długości `84 + 50 * count`; 3MF 388094 bajty, nagłówek ZIP `504b0304`. Różne bajty 3MF dotyczą różnej geometrii, nie deklarowanej deterministyczności ZIP.
- Zapis → wczytanie JSON zachowuje widoczny badge **Dane syntetyczne**. CSV dostaje opis źródła; powłoka i projekt zachowują metadata źródła przez uzgodnione API.
- Oddzielnie 3 kliknięcia na rzeczywistej powierzchni: trzy oznaczone punkty z numerycznymi współrzędnymi; prawidłowo prawoskrętny zestaw umożliwia rejestrację. Po zastosowaniu geometria zmieniona, baza skopiowana i wszystkie markery wyczyszczone. Niezgodna chiralia daje błąd, bez automatycznego odbicia.
- Wykryto i odtworzono RED dla mobile: szerokość dokumentu 459 przy viewport 390 oraz sześć przycisków o szerokości 36 px. Po naprawie `minmax(0,1fr)` / `min-width:0` i celów dotykowych wynik: viewport 390, scrollWidth 390; zero widocznych aktywnych przycisków mniejszych niż 44×44 px w sprawdzonym widoku wejściowym.

## Zrzuty obejrzane przez właściciela UI

Rzeczywiste zrzuty w katalogu scratch (nietrwałe, podlegają automatycznemu czyszczeniu):

- `C:/Users/sandr/AppData/Local/hermes/cache/scratch/orthosculpt-ui-initial.png` — 1440×1000, pusty interfejs.
- `.../orthosculpt-ui-export.png` — 1440×1000, rzeczywista powłoka, ostrzeżenia i eksport STL/3MF.
- `.../orthosculpt-ui-mobile.png` — 390 px, brak poziomego overflow, rzeczywisty model RGB.
- `.../orthosculpt-ui-landmarks.png` — rzeczywiste punkty anatomiczne na powierzchni.

Audyt wizualny: kompozycja narzędziowa, bez kafelków marketingowych, agresywnych gradientów, szklanych kart, zmyślonych metryk i udawanej geometrii SVG. Lokalna typografia Segoe UI Variable dobrana do desktopowego narzędzia Windows; żadnych zewnętrznych fontów. Ujawnienie ograniczeń jest częścią inspektora, nie ukrytym przypisem.

## Granice weryfikacji

To weryfikacja oprogramowania, nie walidacja kliniczna, metrologiczna ani mechaniczna. Nie mierzono deklarowanych FPS ani gwarantowanej wydajności dla dużych skanów. Nie wykonano tutaj sprzętowego WebGPU ani uruchomienia natywnego IPC Tauri (parent przeprowadza niezależny odbiór). Test RGB/UV potwierdza przekazanie atrybutów i widoczny syntetyczny RGB; pełny odbiór importów paczek PLY/STL/OBJ i natywnej aplikacji należy do integracji parenta. Wczesne timeouty pojedynczych zrzutów/oczekiwania w próbach ze SwiftShader nie są przedstawiane jako pomyślne; końcowy smoke, zrzuty wymienione wyżej, rejestracja i eksporty zakończyły się rzeczywistym wynikiem.
