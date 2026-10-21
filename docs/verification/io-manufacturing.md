# IO i eksperymentalne wytwarzanie — wykonanie i weryfikacja

## Wynik

Zaimplementowano pełny zatwierdzony kontrakt w `src/io/index.ts` i `src/manufacturing/index.ts`, bez edycji wspólnych typów, zależności ani cudzych modułów. Użyto współdzielonych `getBounds` i `validateMesh`; nie utworzono konkurencyjnej biblioteki geometrii. Nie wykonywano stage ani commit.

### IO

- `importFiles(File[])`, czyste `parsePLY(Uint8Array)`, `parseSTL(Uint8Array)` i `parseOBJ(text, assets)`.
- STL ASCII i binarny LE: rzeczywiste fasety, sprawdzanie długości i liczb, dokładne łączenie identycznych współrzędnych w indeksowaną siatkę. Binarny STL działa również z nagłówkiem zaczynającym się od `solid`, bo rozpoznanie opiera się na długości pakietu.
- PLY ASCII oraz binarny LE/BE: RGB `uchar`/`ushort` normalizowane do 0–1, RGB float sprawdzane w tym zakresie. Własny parser nie zakłada typu `Three.BufferAttribute.array` ani zachowania integer accessorów w nowych Three. Obsługiwane są ściany trójkątne; wielokątny/teksturowany PLY jest jawnie odrzucany z instrukcją triangulacji lub użycia OBJ, bez cichego usunięcia tekstury/UV.
- OBJ: trójkąty i płaskie wielokąty triangulowane przez earcut z zachowaniem oryginalnego nawinięcia, indeksy ujemne, RGB i materiały Kd, lokalny MTL + PNG/JPEG, zachowane UV, tekstura osadzona w data URL. Obsługiwany jeden wspólny obraz diffuse; mieszanie tekstur, niepełne UV, przezroczystość i nieobsługiwane mapy/opcje MTL kończą import błędem. Więcej obiektów OBJ jest scalane z ostrzeżeniem.
- Referencje zasobów są wyłącznie nazwami plików z jawnej mapy. Odrzucane są URL, ścieżki bezwzględne, katalogi, `..`, backslash, procentowe kodowanie, query/fragment i brakujące pliki. Żaden parser nie korzysta z fetch ani loadera sieciowego. PNG/JPEG rozpoznawane po nagłówku i limitowanych wymiarach, nie samym rozszerzeniu.
- Projekt JSON `format: OrthoSculptCAD`, `version: 1`, `units: mm`: pozycje Float32, indeksy Uint32, RGB, UV, osadzona tekstura, niezależne pozycje bazowe i taśmy. Nieznane pola (także np. `patient`) są odrzucane. Liczby surowe walidowane PRZED TypedArray: typ number, finite, reprezentowalność Float32, całkowite nieujemne indeksy i ich zakres, RGB przed zaokrągleniem, zgodność wszystkich długości. Żadnego zawijania ujemnych/ułamkowych indeksów.
- `source: synthetic|imported` zachowywane i walidowane w projekcie i powłoce. Parsery plików ustawiają `imported` (to oznacza pochodzenie z pliku, nie potwierdzenie autentyczności skanu). Brak source w starszym projekcie pozostaje brakiem informacji — nie jest dowodem danych klinicznych.
- CSV zawiera prawdziwe wiersze pomiarów, osobne jednostki, taśmę dopasowaną po Z i delta = obwód modelu − taśma. Nieważne pomiary i nieznana objętość to puste komórki, nie zero. Opcjonalny trzeci argument `sourceName` dodaje kolumnę źródła, np. `Dane syntetyczne`; etykieta jest escapowana i chroniona przed formułą CSV.
- `downloadBlob` używa lokalnego URL Blob, jawnej nazwy i zwalnia URL po pobraniu. Test jednostkowy sprawdza sterowanie DOM/URL przez kontrolowany adapter; rzeczywiste pobranie sprawdza dodatkowo E2E.

### Limity i granice

Łączny import/projekt maks. 128 MiB, 16 plików, dokładnie jeden plik siatki, 1 000 000 wierzchołków, 2 000 000 trójkątów. Tekstura maks. 16 MiB, 8192 px na oś i 32 MP; 1000 taśm i 100 000 wierszy CSV. Dodatkowe limity nagłówka/właściwości PLY, linii/obiektów/materiałów OBJ i budżetu XML 3MF. Liczebność/rozmiar są sprawdzane przed dużymi alokacjami tablic docelowych; binarny PLY ma także minimalny budżet bajtowy wynikający z nagłówka. Operacje nadal są synchroniczne na dużej geometrii; nie deklaruje się benchmarku ani maksymalnej płynności UI.

### Powłoka i eksport

- `buildShell`: wewnętrzna rektyfikowana powierzchnia pozostaje w tych samych współrzędnych; powierzchnia zewnętrzna jest offsetem znormalizowanych, ważonych powierzchnią normalnych. Wewnętrzne trójkąty mają odwrotną orientację, zewnętrzne oryginalną, a pierścień proksymalny jest zszywany. Dystalne zamknięcie pochodzi z wejścia i jest odwzorowane na obu powierzchniach; dodatkowy otwór dystalny jest odrzucany, nie zgadywany.
- Wejście może mieć jeden płaski otwór proksymalny albo rozpoznawalną pokrywę, również pochyloną po PCA. Usuwana jest wyłącznie szeroka, spójna, współpłaszczyznowa pokrywa na płaszczyźnie podpierającej, z normalną do 30° od +Z. Sprawdzany jest jeden zamknięty obrys pokrywy, jej rozpiętość i pole; nie są usuwane po prostu najwyższe ściany. Dla geometrii niejednoznacznej wymagane jest ręczne otwarcie. Nie przesuwa się punktów wewnętrznych na płaszczyznę.
- Dodatkowa bramka wytwarzania sprawdza wachlarze trójkątów w wierzchołkach: pinched vertex może być non-manifold mimo poprawnej liczby użyć każdej krawędzi. Wymagana jedna spójna powierzchnia. Usuwane są wyłącznie nieużywane wierzchołki po zdjęciu pokrywy, bez ukrytej naprawy/zmiany kształtu.
- Grubość 0,5–20 mm i nie więcej niż 10% najmniejszego wymiaru; wysokość 10–1000 mm, X/Y 10–600 mm. Są to konserwatywne bramki inżynierskie, NIE automatyczny dowód jednostek lub przydatności klinicznej. UI musi nadal wymagać jawnego potwierdzenia mm.
- `flareAngle=0` wyłącza wywinięcie. `flareRadius` jest promieniem kołowego profilu wywinięcia, nie docelowym promieniem całego leja. Profil zewnętrzny ma rozpiętość osiową `R sin(kąt)` i przyrost promienia na brzegu `R(1−cos(kąt))`, w płaszczyźnie pierścienia. Kąt 0–30°, R od 0 do połowy wysokości (dla kąta >0 wymagany R>0). Profil jest próbkowany na istniejących wierzchołkach: rzadka siatka nie daje gładkiego łuku i nie jest automatycznie remeshowana. Wnętrze jest niezmieniane, również przy wywinięciu.
- Wynik musi ponownie przejść kontrolę watertight i dodatniej objętości. To nie wykrywa wszystkich kolizji. Powłoka zawiera wyłącznie geometrię, z wyraźnym ostrzeżeniem o pozostawieniu wyglądu w projekcie.
- STL jest rzeczywistym binarnym plikiem z 80-bajtowym nagłówkiem, liczbą faset i obliczonymi jednostkowymi normalnymi. SYNTHETIC trafia do nagłówka dla danych syntetycznych; STL jest eksportem bez koloru.
- 3MF to rzeczywisty ZIP/OPC z `[Content_Types].xml`, `_rels/.rels`, `3D/3dmodel.model`, relacją StartPart, `unit=millimeter`, zasobem mesh i build item. `type=model` wymaga zamkniętego, niezdegenerowanego manifold, dodatniej objętości i co najmniej czterech trójkątów; nie opakowuje otwartej pojedynczej ściany jako gotowego modelu. XML escapuje nazwę; metadata zawiera opis badań, brak walidacji, brak wyglądu i SYNTHETIC, kiedy dotyczy.
- `manufacturingAvailability` jawnie blokuje adapter bez geometrii producenta i CNC bez profilu maszyny/postprocesora. Nie powstaje udawany adapter ani machine-ready G-code.

## Rzeczywiste RED → GREEN

Poniższe przebiegi były uruchamiane przed implementacją danego zachowania; końcowe liczby są z rzeczywistego Vitest, nie symulacji. Pierwsze tracer bullets zgłaszały brak pliku modułu (0 wykonanych testów) lub brak eksportu; jest to odróżnione od późniejszych błędów asercji zachowania.

| Przekrój | RED zaobserwowane | GREEN po implementacji |
|---|---|---|
| ASCII PLY RGB | brak modułu IO | pierwszy test passed |
| binarny PLY LE/BE | dwa błędy `Nieobsługiwany format PLY` | cztery testy PLY passed |
| STL roundtrip/normalna | brak modułu manufacturing | PLY+STL: sześć passed |
| OBJ/MTL/lokalne obrazy | brak parseOBJ/importFiles, trzy failures | IO: piętnaście passed |
| projekt i CSV | trzy failures brakujących eksportów | IO: osiemnaście passed |
| analityczna powłoka | brak buildShell | trzy testy shell passed |
| ZIP 3MF/download/blokady | trzy failures brakujących eksportów | komplet wówczas: dwadzieścia cztery passed |
| source i surowe RGB | utrata source i akceptacja −1e−50 RGB | dwadzieścia sześć passed |
| twarde budżety PLY/UV/XML | trzy failures | trzydzieści jeden passed |
| nawinięcie OBJ | dodatnia normalna dla CW wielokąta | trzydzieści dwa passed |
| kołowy promień flare | 5,45955 zamiast 0,90461 mm | trzydzieści trzy passed |
| otwarta siatka w 3MF | brak odmowy eksportu | trzydzieści cztery passed |
| pinched vertex | brak odmowy powłoki mimo non-manifold wierzchołka | regression passed |
| pełny pipeline po PCA | dokładny błąd pokrywy z rzeczywistego E2E | pipeline i rzeczywisty browser E2E passed |

Dodatkowe pokrycie po GREEN obejmuje rzeczywisty 1-pikselowy JPEG, wygenerowany przez Windows System.Drawing, zachowanie jego bajtów i dokładnych UV. Pillow nie było zainstalowane; nie instalowano nowych zależności tylko dla fixture.

### Przyczyna i korekta błędu integracji

Przed poprawką test `demo → repairMesh → alignPCA → measureMesh → calibrateMesh(1,01) → buildShell` odtwarzał błąd pokrywy. Diagnostyka wykazała 94 trójkąty pokrywy i zakres Z jej wierzchołków 0,0574493408203125 mm po PCA; sprawdzanie wyłącznie `z≈maxZ` odrzucało nadal płaski, ale pochylony cap. Pomiar normalnej na bardzo małym trójkącie earcut był dodatkowo źle uwarunkowany. Nowa detekcja zaczyna od dużych faset, grupuje współpłaszczyznową pokrywę, sprawdza jej obrys i używa sumowanej normalnej pętli. Usunięto tymczasowe logi diagnostyczne. Wersji E2E nie zmieniano ani nie pomijano kroku repair.

## Końcowe komendy i wyniki

```
npx vitest run tests/io.test.ts tests/io-stl.test.ts tests/io-obj.test.ts tests/io-project.test.ts tests/io-security.test.ts tests/manufacturing-shell.test.ts tests/manufacturing-export.test.ts
# Test Files 7 passed; Tests 37 passed

npm test
# Test Files 18 passed; Tests 82 passed

npx tsc --noEmit
# exit 0

npm run build
# exit 0, Vite production build

npx playwright test e2e/workflow.spec.ts
# 1 passed (45.1s)
```

Rzeczywisty browser E2E przechodzi przykład syntetyczny, potwierdzenie mm, naprawę, PCA, pomiar i kalibrację, korektę/undo i pędzel/undo, generowanie powłoki, pobranie STL, rozpakowanie pobranego 3MF i ponowne otwarcie projektu. Test sprawdza brak zewnętrznych żądań HTTP i błędów pageerror.

Wcześniejsze `npm test` błędnie zbierało Playwright jako suite Vitest; parent naprawił konfigurację poza zakresem IO. Końcowy pełny przebieg jest zielony. Build ostrzega o dużym bundle i nieskutecznym dynamicznym imporcie geometrii — nie jest to błąd kompilacji ani dowód problemu bezpieczeństwa.

## Źródła i uczciwe ograniczenia

Odczytano rzeczywisty 3MF Core Specification (metadata, ST_Number, vertex/triangle i minimalna liczba ścian modelu), także przez urllib po niedostępności backendu web_extract:
- https://raw.githubusercontent.com/3MFConsortium/spec_core/master/3MF%20Core%20Specification.md
- Kontekst i dodatkowe źródła: `docs/RESEARCH.md`.

Testy rozpakowują rzeczywiste ZIP, porównują liczbę i indeksy trójkątów, normalne STL, RGB, UV i roundtrip projektu. Nie wykonano niezależnej certyfikacji lib3mf/slicera ani badań mechanicznych. Offset normalny NIE gwarantuje minimalnej grubości, braku samoprzecięć, wytrzymałości, zgodności adaptera, dopasowania do pacjenta ani gotowości klinicznej/produkcyjnej. Geometria wejścia niejednoznacznego jest odrzucana zamiast zgadywana.
