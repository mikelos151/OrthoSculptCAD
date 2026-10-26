# Kontynuacja po 0.2.0 — własne wykonanie rodzica

To dodatkowa weryfikacja niezmienionej aplikacji, nie nowe odebrane wydanie ani ocena kliniczna. ZIP 0.2.0 pozostaje nienaruszony. Niezależny review nowych testów/narzędzia i formularzy zakończył się PASS, bez blokujących ustaleń. Reviewer niezależnie przeliczył 32 grupy statystyk i błędy liczbowe, sprawdził fingerprint źródeł oraz dowody natywnych zdarzeń. To review istniejących dowodów, nie dodatkowy przebieg benchmarku.

## Regresje

- Pełny Vitest: **334 PASS, 0 FAIL, 0 SKIP**, 54 pliki; prawdziwe Chromium Workers i rzeczywisty PDF, maxWorkers=1. Raport `v021-parent-unit-final.json`.
- Nowy spec lifecycle: **5 przypadków × 2 = 10 PASS**, bez pominięć lub flaky. Natywny touchCancel i trusted blur; prawdziwe zwalnianie czytelników przed mutacją; awarie ładowania topology/analyze jawnie wstrzyknięte przez odcięcie żądania modułu, nie przez fałszowanie odpowiedzi. Raport `v021-lifecycle-parent.json`.
- TypeScript: exit 0. Kod produkcji i root dist nie były zmieniane.

## Pełny szeregowy benchmark rodzica

Rzeczywisty Chromium 156.0.8078.4, headless, Windows, Node v24.19.0; zgłoszone hardwareConcurrency 24. Cztery zamknięte cylindry syntetyczne z RGB, trzy nowe silniki na model i dziesięć próbek warm po dwóch warmupach. Zawsze ten sam wewnętrzny poziom Z=123.4567 mm.

| Wierzchołki | Trójkąty | Przygotowanie indeksu — mediana ms | Przekrój warm z komunikacją — mediana ms | Warm p95 ms |
|---:|---:|---:|---:|---:|
| 1026 | 2048 | 19,00 | 0,40 | 0,80 |
| 10002 | 20000 | 31,90 | 0,50 | 0,70 |
| 50002 | 100000 | 80,90 | 0,75 | 1,10 |
| 100002 | 200000 | 154,90 | 1,10 | 1,50 |

„Przygotowanie” obejmuje łącznie preflight/kopiowanie/start Workera/transfer/snapshot i budowę indeksu. Nie jest pomiarem samego BVH. Cold nie czyści cache systemu/modułów. Warm używa tego samego indeksu i tej samej płaszczyzny; nie dowodzi wydajności pełnego renderera lub przesuwanego po dowolnym skanie suwaka.

- Raport źródłowy: `v021-benchmark-parent-serial/report.json`, ze wszystkimi próbkami, rzeczywistymi licznikami i fingerprintem.
- Kontrola planowanego modelu 400002 wierzchołków została **pominięta przed alokacją** z powodu jawnego budżetu. Nie został zmierzony; nie dopisujemy mu czasu ani wyniku.
- Topologia i ważność pomiarów sprawdzone rzeczywistymi API. Wartości porównano do dokładnego zapisanego wielokąta Float32, nie idealnego koła. Zgodność numeryczna konkretnego modelu nie dowodzi dokładności skanera ani klinicznej tolerancji.
- Zachowano pozycje, indeksy, RGB i syntetyczne pochodzenie. Ostatnia obserwacja: 32 Workery utworzone / 32 zakończone, 0 żywych; w tym benchmarku maksymalnie jeden naraz. Przeglądarka i własny serwer zakończone.
- Mierzona pamięć dotyczy tylko procesu sterownika Node/Vite. Brak pomiaru szczytowej pamięci Chromium/Workerów i FPS. Zapisane zero czasu kopiowania małego modelu jest odczytem zegara o ograniczonej rozdzielczości, nie dowodem kopiowania bez kosztu.

## Co nadal pozostaje

Dane reprezentatywne, pomiary niezależne i odbiór z protetykiem; zatwierdzony native build/WebView IPC; potwierdzenie grubości, poprawności offsetu i mechaniki; osobny projekt rozszerzeń CAD. Nie wyłączano ochrony Windows ani nie uznano tych bramek za zaliczone. Procedura pilota i trzy puste formularze: `../pilot/README.md`.
