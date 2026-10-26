# Reports 0.2 — stan przed niezależnym review

## Wykonane
- Strict vertical RED→GREEN dla porównań, limitów, rzeczywistego SHA geometrii, starej rewizji, daty, metadanych/XSS, UNKNOWN/synthetic, dziennika, self-contained druku, migawki async, progu operatora i niepełnego audytu.
- Parent wykonał 21/21 focused Vitest po refaktoryzacji. To licznik modułu, nie całego wydania 0.2.
- `node scripts/verify-review-report.mjs` wykonał rzeczywiste funkcje źródłowe przez Vite SSR, naprawę demo, strefę −3%, przekroje, audit i report, następnie Chromium i PDF.
- Przykład jest syntetyczny: 5857 wierzchołków, 11710 trójkątów, 25 poziomów / 24 ważne; zero dostarczonych pomiarów taśmą. Nie wymyślono pomiarów ręcznych.
- SHA sprawdzono niezależnie przez Node crypto nad udokumentowanym formatem LE; liczba wierszy DOM równa wynikowi solvera, bez pageerror/zewnętrznych żądań i overflow.
- PDF: 5 stron A4 landscape, wszystkie z tekstem, minimalny font każdej strony 12pt; ekstrakcja polskich znaków i oznaczenia synthetic poprawna. Obejrzano strony 1,2,5.

## Otwarte przed finalną akceptacją
- Niezależny spec/code-security review zlecony. Nie oznaczać modułu jako finalnie zatwierdzonego przed wynikiem.
- Druk: powtarzać caseCode/rewizję/identyfikator na każdej stronie, aby uniknąć pomylenia wydruków; obecnie tylko pierwsza ma nagłówek identyfikacyjny.
- Poprawić łamanie `NIEUSTALONO`, `Rewizja`, ISO dat i liczbowych wartości dziennika. Nie zmniejszać fontu poniżej12pt.
- Polska warstwa prezentacji dla angielskich etykiet/detali audit; zachować identyfikatory i literalne klucze parametrów.
- Po zmianach powtórzyć generację, sprawdzić wszystkie strony i realny eksport z UI, nie tylko source-module acceptance.

## Granice
Raport nie jest podpisem, pełnym archiwum odtwarzalnych rewizji ani dopuszczeniem klinicznym/wytwórczym. Minimum grubości pozostaje UNKNOWN. Hash dotyczy pozycji/indeksów/liczników, nie całego projektu ani operatora. Szyfrowanie projektu nie szyfruje automatycznie raportu.
