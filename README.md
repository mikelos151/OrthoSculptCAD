# OrthoSculpt CAD 0.1 — wersja badawcza

Lokalne narzędzie inżynierskie do importu kolorowych siatek, orientacji, pomiarów przekrojów i kontrolowanych korekt powierzchni. Polski pięcioetapowy kreator React/Three.js, testowalny rdzeń Rust oraz kod powłoki desktopowej Tauri 2.

> **To nie jest zwalidowany produkt kliniczny ani gotowy proces wytwarzania protez.** Pliki mogą służyć do niezależnej analizy technicznej. Nie stosuj ich bez walidacji geometrii, materiału, procesu, wytrzymałości i dopasowania przez odpowiednich specjalistów.

## Uruchomienie dostarczonej wersji lokalnej

1. Rozpakuj cały ZIP do zwykłego katalogu.
2. Uruchom **Uruchom-OrthoSculpt.cmd**. Wymagany Node.js 22 lub nowszy (sprawdzono Node 24).
3. Otwórz `http://127.0.0.1:4174`, jeżeli przeglądarka nie otworzy się sama.
4. Zacznij od **Otwórz przykład** albo wybierz własny plik. Przykład jest jawnie syntetyczny.
5. Potwierdź jednostki źródłowe. Program nie rozpoznaje ich automatycznie.
6. Okno terminala pozostaje otwarte podczas pracy. `Ctrl+C` kończy lokalny serwer.

Gotowy `dist/` jest dołączony. Do uruchomienia go nie potrzeba `npm install`, konta, Rust, chmury ani internetu. Serwer korzysta wyłącznie z wbudowanych modułów Node i nasłuchuje tylko na `127.0.0.1`. Nie udostępnia API uploadu, zapisu ani dostępu do plików użytkownika. Import odbywa się po jawnym wyborze plików przez operatora. Jeżeli port jest zajęty, nie kończ cudzych procesów; możesz uruchomić `node scripts/server.mjs --port 4177` i otworzyć wskazany adres.

## Status aplikacji .exe

**Nie dostarczono gotowego .exe.** Zainstalowano i sprawdzono Rust/MSVC/WebView2, ale Windows zablokował uruchomienie skryptu budowania zależności `camino` kodem **4551 — zasady kontroli aplikacji**. Nie wyłączano zabezpieczeń. Kod Tauri jest dołączony, lecz pełna kompilacja, rzeczywisty transport IPC WebView oraz natywne pobieranie Blob pozostają niezweryfikowane. Nie należy mylić przechodzących testów rdzenia Rust z uruchomioną aplikacją desktopową.

Dalszy natywny build wymaga zatwierdzonego przez administratora środowiska kompilacji/podpisywania. Nie jest zalecane wyłączanie ochrony systemu tylko po to, żeby uruchomić build.

## Pięć etapów

### 1. Import i kontrola
- PLY ASCII/binary little/big endian z RGB, z siatką trójkątną.
- STL ASCII/binary; standardowy STL nie przenosi kolorów i jednostek.
- OBJ z lokalnym MTL i PNG/JPEG. Wybierz wszystkie pliki jednocześnie. Jeden wspólny obraz diffuse; nieobsługiwane kombinacje są odrzucane, a nie po cichu upraszczane.
- Diagnostyka krawędzi, nawinięcia i degeneracji. Naprawa usuwa degeneracje i domyka bezpieczne płaskie obrysy przez earcut. To nie pełny Liepa/Delaunay ani automatyczne usuwanie samoprzecięć.

Limit importu/projektu: 128 MiB, 16 plików, jeden model, 1 mln wierzchołków / 2 mln trójkątów. Tekstury tylko z podanych plików — bez URL, katalogów i żądań sieciowych. Nieobsługiwany PLY z UV/teksturą należy przekonwertować do obsługiwanego OBJ, zachowując informację o wyglądzie.

### 2. Orientacja
PCA proponuje główną oś geometryczną. Rejestracja przyjmuje środek ścięgna rzepki, głowę strzałki i punkt dystalny. Zachowuje oś podłużną z PCA i rzutuje kierunki przedni/boczny na płaszczyznę poprzeczną. Punkty współliniowe, niejednoznaczna oś i sprzeczna prawoskrętność są odrzucane. Konwencja strony kończyny wymaga kontroli operatora; nie ma automatycznego klinicznego rozpoznania lewej/prawej kończyny. Domyślne dodatkowe zgięcie 0°; 5° jest opcjonalnym ustawieniem operatora, nie uniwersalną receptą.

### 3. Pomiary
Suwak przekroju i rzeczywisty kontur 2D. Tabela co 10/20 mm: obwód, AP, ML, pole i **przybliżona** objętość segmentu. Nieważne/otwarte/wielopętlowe przekroje nie otrzymują pozornego prawidłowego obwodu. Taśmę wpisuje się na ważnym poziomie. Kalibracja działa promieniowo w XY, zależnie od Z; Z pozostaje bez zmian. Po każdej zmianie siatki trzeba przeliczyć tabelę. Jeden obwód nie potwierdza osobno AP i ML, a wklęsły obrys nie jest pomiarem napiętej taśmy.

W wersji przeglądarkowej oblicza TypeScript. Kod Rust używa własnego indeksu przedziałowego BVH. Tabela jest liczona w TypeScript niezależnie od silnika interaktywnego, co UI jawnie opisuje. Wyniki obu implementacji nie są automatycznie równoważną walidacją dla dowolnego modelu.

### 4. Rektyfikacja
Rzeczywisty raycast i pędzle relief/kompresja/wygładzanie; Hermite falloff i lokalni sąsiedzi siatki. Korekta obwodu w strefie Z, cofanie i reset do bazy. Mapa pokazuje podpisane przemieszczenie względem normalnych bazowych: zielony = 0, niebieski = odciążenie na zewnątrz, czerwony = kompresja do wewnątrz. Nie jest mapą nacisku, naprężeń ani dowodem dopasowania. Kolory źródłowe nie są nadpisywane.

Zmiana orientacji lub kalibracja tworzy nową bazę i czyści poprzednią historię. Orientacja usuwa nieaktualne taśmy; kalibracja zachowuje pomiary ręczne, ponownie sprawdza przekroje i pokazuje maksymalną pozostałą różnicę. Nie gwarantuje dokładnego dopasowania na rzadkiej siatce. Redukcja obwodu **nie jest** tą samą procentową redukcją objętości. Strefa ma twarde granice; nie dodano ukrytego wygładzania przejścia. Edycja nie gwarantuje zachowania braku kolizji ani topologii.

### 5. Eksport
- Binarny STL powierzchni po korekcie, CSV pomiarów.
- Ręczny zapis/odczyt projektu JSON z geometrią, bazą, RGB/UV/teksturowaniem, taśmami i pochodzeniem syntetycznym.
- Eksperymentalna powłoka: offset normalnych na zewnątrz, zachowane wnętrze, zszyty brzeg, obsługa bezpiecznej proksymalnej pokrywy również po lekkim pochyleniu PCA. Parametry grubości i kołowego wywinięcia obrzeża.
- Powłoka do STL lub rzeczywistego kontenera ZIP/OPC 3MF z jednostką mm.

**Normal-offset nie gwarantuje stałej grubości ani braku samoprzecięć.** Niezależna kontrola jest konieczna. Adapter producenta i CNC/G-code są jawnie niezrealizowane: brak danych producenta, tolerancji, badań połączenia oraz profilu maszyny/narzędzia/mocowania. Program nie generuje udawanych bezpiecznych komponentów lub ścieżek.

## Dane i prywatność

Bez kont, analityki, zewnętrznych fontów, usług AI i chmury. Pliki robocze są w pamięci; nie ma automatycznego zapisu danych pacjenta. Zapis projektu i eksport są jawne. Pliki JSON/STL/3MF/CSV **nie są szyfrowane** — operator odpowiada za właściwe miejsce zapisu, uprawnienia i retencję. Lokalna aplikacja nie oznacza automatycznej zgodności z RODO/MDR. Do czasu odrębnego przeglądu używaj danych syntetycznych lub odpowiednio przygotowanych danych testowych.

## Rozwój i testy

```bash
npm ci
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm start
```

E2E używa zbudowanego `dist/` i naszego lokalnego serwera na porcie 4176, nie HMR. Najpierw wykonaj build. Zmiany kodu: `npm run dev` na porcie 4174. Rust (Cargo na PATH):

```bash
cargo test --release --manifest-path crates/ortho-geometry/Cargo.toml
cargo test --release --manifest-path src-tauri/state-tests/Cargo.toml
python src-tauri/tests/security_config.py
npm run desktop:build
```

Na tym Windows Cargo jest w `%USERPROFILE%\.cargo\bin\cargo.exe`; instalacja nie zmieniła globalnego PATH. Ostatnia komenda desktopowa jest obecnie zablokowana przez politykę aplikacji, jak opisano wyżej. Python nie jest potrzebny do działania gotowej wersji lokalnej.

## Dokumentacja

- `docs/RESEARCH.md` — odczytane źródła i uzasadnienie korekt briefu.
- `docs/REQUIREMENTS.md` — jawna realizacja i luki specyfikacji.
- `docs/verification/FINAL.md` — zbiorczy raport rzeczywistej weryfikacji.
- `docs/verification/geometry.md`, `io-manufacturing.md`, `ui.md`, `native.md` — szczegółowe dowody i ograniczenia modułów.
- `docs/screenshots/` — zrzuty rzeczywistej aplikacji, nie makiety.

Nie deklaruje się FPS, opóźnienia <0,5 ms, wytrzymałości, gotowości produkcyjnej ani zgodności regulacyjnej bez właściwych badań. To działający etap inżynierski, nie ukończony produkt production-grade z pełnej specyfikacji.
