# Pilot techniczny OrthoSculpt — zestaw dla pracowni

## Co to jest

Procedura oceny oprogramowania poza zastosowaniem klinicznym. Nie jest protokołem badania klinicznego, certyfikacją wyrobu ani zgodą na wykonanie lub przymiarkę leja. Nie zastępuje oceny protetyka, metrologa i właściwego procesu regulacyjnego. Wersja 0.2.0 nie ma zatwierdzonego EXE ani gwarancji grubości/wytrzymałości powłoki.

## Bezpieczeństwo danych

- Zacznij od fantomu lub modelu testowego. Rzeczywiste skany można wykorzystywać tylko z odpowiednim uprawnieniem i według zasad placówki; pseudonim nie oznacza pełnej anonimizacji.
- Skany i wypełnione formularze przechowuj **poza katalogiem OrthoSculptCAD, repozytorium i docs/**, w oddzielnym chronionym katalogu. Narzędzia pakujące źródła mogą dołączać pliki z dokumentacji.
- Nie przesyłaj danych pacjentów do czatu, usług zewnętrznych ani synchronizowanej chmury bez osobnego ustalenia zasad i uprawnień. W formularzach stosuj kody operatorów i przypadków, nie nazwiska, PESEL, datę urodzenia lub nazwy plików zawierające takie dane.
- CSV, raport HTML/PDF i eksporty STL/3MF nie są szyfrowane. Projekt zapisuj w trybie szyfrowanym; silne hasło zachowaj w bezpiecznym magazynie. Nie wpisuj go do formularza, logu ani argumentów poleceń.
- Oryginalny plik zachowaj bez zmian. Pracuj na kopii; pobranie pliku przez przeglądarkę nie dowodzi trwałości ani zabezpieczenia folderu.

## Przygotowanie z protetykiem

1. Wybierz przypadek testowy i zapisz kod, stronę oraz rzeczywistą jednostkę skanera. Nie zgaduj jednostki z wyglądu modelu.
2. Ustal układ odniesienia oraz fizyczny sposób odtwarzania poziomów Z. Porównanie przekrojów w innych płaszczyznach nie mierzy błędu aplikacji.
3. Przed oglądaniem wyniku CAD ustal metodę wzorcową, niepewność pomiaru, liczbę powtórzeń i dopuszczalne różnice. **W tym zestawie nie ma domyślnych tolerancji klinicznych.**
4. Obwód napiętej taśmy na ciele nie jest tym samym co długość wklęsłego konturu geometrycznego. Zapisz metodę; osobno oceniaj AP i ML, nie wyprowadzaj ich poprawności z jednego obwodu.
5. Zapisz wersję aplikacji i rewizję. W miarę możliwości osoba wykonująca pomiar odniesienia nie powinna wcześniej znać wyniku CAD.

## Przebieg techniczny

1. Import: sprawdź RGB/markery i komplet lokalnych tekstur. Potwierdź jednostki; przed pomiarem zweryfikuj znany wymiar kontrolny.
2. Orientacja: wybierz stronę i świadomie wskaż landmarki. PCA jest propozycją geometryczną, nie rozpoznaniem anatomii. Zapisz projekt przed i po orientacji.
3. Pomiary: oblicz przekroje i porównaj **te same poziomy Z** z niezależnymi wartościami. Wypełnij każde powtórzenie osobno. Brakujący pomiar pozostaw pusty, nie wpisuj zera.
4. Kalibracja: zachowaj niezależne wartości wzorcowe sprzed dopasowania. Obwody użyte do kalibracji nie są niezależnym testem jej dokładności. Wyniki na innych poziomach/modele kontrolne oceniaj osobno; odnotuj reszty przybliżenia.
5. Rektyfikacja: sprawdź pojedynczy gest, Undo, anulowanie oraz zachowanie RGB i referencji. Przerwanie nie powinno dopisywać zmiany geometrii lub historii.
6. Projekty: na kopiach testowych sprawdź szyfrowany zapis/reload, błędne hasło, Stay/Escape i ochronę przy zamknięciu. Nie uszkadzaj jedynej kopii danych.
7. Raport: sprawdź kod, rewizję i skrót geometrii na każdej stronie. Porównaj raport z bieżącą siatką, nie ze starą tabelą.
8. Eksport: otwórz STL/3MF w niezależnym narzędziu do kontroli technicznej. Sprawdź jednostki, rozmiar, kontury, topologię i ograniczenia audytu. **UNKNOWN nie jest PASS.** Nie zatwierdzaj wytwarzania na podstawie samego eksportu.

## Formularze

Skopiuj trzy pliki `.template.csv` do chronionego katalogu poza projektem i dopiero tam wypełniaj:

- `case-record.template.csv`: identyfikacja pseudonimowa i metoda badania.
- `measurements.template.csv`: niezależny wzorzec, CAD, niepewności i progi ustalone przed próbą.
- `scenario-results.template.csv`: oczekiwane/zaobserwowane zachowanie i odnośnik do lokalnego dowodu.

To puste formularze do ręcznego prowadzenia oceny, **nie automatyczny import danych do CAD**. Format: UTF-8, separator średnik; kolumny liczbowe z kropką dziesiętną. Przy imporcie do arkusza ustaw jawnie separator i interpretację liczb. Puste komórki oznaczają brak danych. Nie dopisano przykładowych wyników, zer ani progów.

Status wpisuj jako `NIE_WYKONANO`, `NIEUSTALONO`, `ZGODNE_Z_KRYTERIUM` lub `NIEZGODNE`. Zgodność oznacza wyłącznie wskazane, wcześniej zdefiniowane kryterium techniczne, nie kliniczną akceptację wyrobu. Przy wpisywaniu swobodnego tekstu do CSV uważaj na znaki rozpoczynające formułę arkusza (`=`, `+`, `-`, `@`); nie wklejaj nieufnych formuł.

## Wynik i decyzja

Oddziel wyniki pomiarów, błędy interfejsu, wydajność oraz ocenę specjalisty. Zapisz wszystkie próby, także nieudane i niejednoznaczne. Nie uzupełniaj braków przypuszczeniem i nie wybieraj tylko udanych przypadków. Zanonimizowane podsumowanie ustaleń może posłużyć do ustalenia kolejnego zakresu prac; sam formularz nie jest podpisem cyfrowym ani zgodą kliniczną.
