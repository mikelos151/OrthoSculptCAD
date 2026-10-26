# Kontynuacja po 0.2.0 — gotowość do pilota technicznego

Punkt wyjścia: wydana lokalna wersja 0.2.0, commit 5fc4dbe. Ten etap realizuje pozostałe wymagania weryfikacji i przygotowania do oceny pracowni, bez zmiany zatwierdzonej architektury i bez rozszerzania zakresu o CNC/adaptery/chmurę.

## Zamrożenie wydania

Nie nadpisywać ZIP 0.2.0, jego SHA ani raportów odbioru. Root dist pozostaje zamrożony do odebrania nowych testów. Dodatkowe testy i narzędzia nie oznaczają automatycznie nowego odebranego wydania aplikacji.

## Podział prac

1. Agent lifecycle: nowe utrzymywane E2E natywnego anulowania/fokusu, awarii audytu i cyklu życia indeksów. Wyłącznie nowy test/dowody; konkretny błąd produkcji odtworzyć i przekazać rodzicowi.
2. Agent benchmarku: deterministyczne modele syntetyczne, rzeczywisty Chromium/Workers, osobno budowa indeksu i zapytania cached; testy narzędzia oraz mały rzeczywisty smoke. Pełny pomiar dopiero po zakończeniu innych obciążeń przeglądarkowych.
3. Rodzic: lokalny zestaw procedury i pustych formularzy do pilota z protetykiem. Brak zmyślonych pomiarów, progów lub klinicznej akceptacji.
4. Rodzic po handoffach: samodzielnie uruchomić nowe narzędzia/testy sekwencyjnie, odebrać ewentualne RED→GREEN, uzyskać niezależny przegląd i dopiero wtedy zdecydować o kolejnej paczce.

## Kryteria tego etapu

- Trwałe regresje opisują rzeczywiste zdarzenia i nie podmieniają wyników obliczeń; kontrolowany błąd sieci/Worker jest jawnie opisany jako fault injection.
- Benchmark zapisuje także timeout, UNKNOWN i niepowodzenie; porównuje pomiary do dokładnego dyskretnego modelu i nie deklaruje klinicznych tolerancji, FPS ani pamięci procesu Chromium, której nie zmierzył.
- Formularze są puste. Brak pomiaru nie staje się zerem. Progi dopuszczalności ustala specjalista przed próbą. Wypełnione dokumenty i skany przechowywać poza repozytorium/archiwizowanym katalogiem projektu.
- Dostarczony zestaw pilota nie jest badaniem klinicznym ani zgodą na wytworzenie lub zastosowanie wyrobu.

## Nadal wymagające osobnej decyzji lub materiałów

- Natywny build/start i rzeczywiste WebView IPC: zatwierdzone środowisko build/signing, bez obchodzenia AppControl.
- Reprezentatywne uprawnione skany, wzorce i protetyk: materiały nie zostały jeszcze dostarczone.
- Grubość/offset/mechanika, pełna naprawa/remeshing, dowolny trimline i live-preview wymagają odrębnej implementacji/projektu i walidacji; nie zaliczać ich na podstawie tego etapu.
