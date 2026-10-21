# Research techniczny i granice OrthoSculpt CAD

## Materiały wejściowe

Przeczytano specyfikację tekstową użytkownika i obejrzano wszystkie pięć stron `jo.pdf`. PDF nie ma warstwy tekstowej, dlatego odczytano wyrenderowane strony. Dokument jest strategią produktu, nie dowodem klinicznym, ofertą handlową konkurencji ani pomiarem wydajności.

## Najważniejsze korekty projektu

### 1. Obwód, pole i objętość są różnymi wielkościami
Skalowanie X i Y przez `s`, bez zmiany Z, zmienia obwód przez `s`, pole przekroju i objętość przez `s²`. Dlatego redukcja obwodu nie może być podpisana jako redukcja objętości. W interfejsie stosujemy jednoznaczny parametr procentowej zmiany obwodu. Pomiary mm, mm² oraz cm³ są odrębnie oznaczone.

### 2. Binarne IPC nie oznacza zero-copy
Oficjalna dokumentacja Tauri opisuje surowe `ArrayBuffer`/`Uint8Array` w żądaniu i `tauri::ipc::Response` w odpowiedzi. To eliminuje duże tablice JSON, ale nie stanowi gwarancji wspólnej pamięci między Rust i WebView.[1] Nasz wersjonowany protokół jawnie koduje kolejność bajtów i waliduje długości przed alokacją. Zmiana siatki wymaga nowego indeksu; generacja siatki chroni przed odczytem starego stanu.

Źródła:
- https://v2.tauri.app/develop/calling-rust/
- https://v2.tauri.app/concept/inter-process-communication/
- https://raw.githubusercontent.com/tauri-apps/tauri-docs/v2/src/content/docs/develop/calling-rust.mdx (odczytano treść pierwotną)

### 3. Kolor skanu to informacja, nie dekoracja
PLY może zawierać RGB w wierzchołkach, a OBJ korzystać z MTL i lokalnej tekstury. Należy zachować RGB/UV przy przekształceniach. W nowych Three.js PLYLoader respektuje typy pól wejściowych, zatem nie można zakładać, że `attribute.array` zawsze zawiera już Float32 z zakresem 0–1.[2][3] Należy odczytywać znormalizowane atrybuty i testować czerwony/zielony/niebieski znacznik. STL nie przechowuje tej informacji w standardowej postaci. Pliki tekstur nie mogą powodować żądań sieciowych.

Źródła:
- https://threejs.org/docs/pages/PLYLoader.html
- https://github.com/mrdoob/three.js/wiki/Migration-Guide (sekcja 184→185)

### 4. WebGPU musi mieć rzeczywisty fallback
WebGPURenderer może użyć WebGPU lub WebGL2.[4] Sama obecność `navigator.gpu` nie dowodzi gotowości adaptera ani poprawnej inicjalizacji. Etykieta renderera powinna wynikać z działającego backendu. Nie ma podstaw do deklarowania 60–120 FPS lub obsługi 2 mln trójkątów bez pomiaru na docelowym sprzęcie.

Źródła:
- https://threejs.org/docs/pages/WebGPURenderer.html
- https://threejs.org/manual/pages/webgpurenderer.html

### 5. Zamknięta topologia nie dowodzi poprawności geometrii
CGAL wyraźnie rozdziela ograniczenia kombinatoryczne siatki i jej defekty geometryczne.[5] Nawet 2-manifold może mieć samoprzecięcia. Prosty offset normalnych nie zapewnia minimalnej grubości ani braku kolizji w wklęsłościach. Triangulacja płaskiej pętli nie jest pełnym algorytmem Liepy. Nie nazywamy prostego cappingu pełną naprawą dowolnego skanu.

Źródło pierwotne, pobrano i odczytano:
- https://doc.cgal.org/latest/Polygon_mesh_processing/index.html

### 6. Przekroje nie mogą po cichu gubić pętli
Wiele oddzielnych pętli może oznaczać kilka elementów, jamę lub niewłaściwy poziom cięcia. Nie sumujemy ich automatycznie jako obwodu kikuta. Kontur otwarty lub rozgałęziony daje nieważny pomiar. Kolejność punktów musi wynikać z łączenia przeciętych krawędzi, nie z sortowania po kącie ani convex hull, które fałszują wklęsłe kształty. Pole obliczamy regułą shoelace/Greena; objętość między poziomami jest przybliżeniem całki z pól i wymaga takiego oznaczenia.

### 7. Parametry kliniczne nie są uniwersalnymi domyślnymi receptami
Wartości 5° zgięcia, redukcje procentowe i naciski milimetrowe podane w briefie wymagają decyzji specjalisty. Rejestracja trzech punktów ustala układ współrzędnych, nie dobiera bezpiecznego rozkładu obciążeń. Ustawienie 0° jest neutralnym startem narzędzia, a 5° może być tylko jawnym parametrem operatora.

Badanie walidacyjne Artec Eva na modelach kikuta opisuje wprost, że trzy landmarki mogą wyznaczać przekroje niepoprzeczne do przybliżonej osi kikuta.[10] Dlatego nie wolno utożsamiać normalnej płaszczyzny trzech dowolnie położonych markerów z osią kończyny. W naszym solverze oś podłużna jest propozycją geometryczną z PCA, kierunek wynika z punktu dystalnego, a kierunki przedni i boczny są rzutowane do płaszczyzny poprzecznej. Sprzeczny zwrot układu musi być odrzucony; konwencja +X bocznie/+Y przednio/+Z proksymalnie wymaga jawnej kontroli strony kończyny i prawoskrętności. To korekta matematyczna narzędzia, nie potwierdzenie klinicznego dopasowania.

### 8. STL/3MF to model, nie walidacja wyrobu
3MF wymaga poprawnego kontenera ZIP/OPC, relacji StartPart, części modelu i jednostki.[6] Eksport binarnego STL powinien mieć sprawdzalną liczbę faset i skończone współrzędne. Nazwa pliku ani poprawne otwarcie w slicerze nie potwierdzają wytrzymałości mechanicznej.

Źródło pierwotne, pobrano:
- https://raw.githubusercontent.com/3MFConsortium/spec_core/master/3MF%20Core%20Specification.md
- https://3mf.io/spec/

### 9. Adapter i CNC wymagają danych, których nie dostarczono
Nie ma rysunku producenta adaptera, tolerancji, materiału, obciążeń, mocowania i walidacji połączenia. Nie ma również modelu frezarki, układu osi, zera, geometrii narzędzia, stocku ani parametrów bezpiecznych przejazdów. Zmyślony adapter lub helical G-code stwarzałby pozór gotowości. Te ścieżki są zablokowane i opisane jako niezrealizowane, zamiast generować pliki udające bezpieczny wyrób.

### 10. Wdrożenie kliniczne to oddzielny program walidacji
FDA w Technical Considerations for Additive Manufactured Medical Devices omawia integralność konwersji plików, współrzędne i domyślne parametry, walidację workflow, ochronę danych, materiał, orientację druku, badania mechaniczne, tolerancje i powtarzalność.[7] Pobrano i odczytano 32-stronicowy dokument, szczególnie rozdziały V.C Software Workflow, V.D Material Controls, VI.C Dimensional Measurements. To wytyczne techniczne, nie deklaracja dopuszczenia tej aplikacji. W UE należy ustalić przeznaczenie i kwalifikację oprogramowania na podstawie MDR/MDCG; nie zakładamy automatycznej klasy wyrobu.[8][9]

Źródła:
- https://www.fda.gov/media/97633/download (odczytano dokument)
- https://www.fda.gov/regulatory-information/search-fda-guidance-documents/technical-considerations-additive-manufactured-medical-devices
- https://health.ec.europa.eu/latest-updates/update-mdcg-2019-11-rev1-qualification-and-classification-software-regulation-eu-2017745-and-2025-06-17_en
- https://health.ec.europa.eu/document/download/385d7e20-d8b5-49d0-abd7-8daf269bf1b8_en (custom-made devices)
- https://www.iso.org/standard/70205.html (ISO 10328 — badania strukturalne, NIE instrukcja doboru indywidualnego zaopatrzenia)

## Dowody a obietnice

Wyniki testów są raportowane osobno w `docs/verification/`. Test analitycznego walca nie dowodzi poprawności dla dowolnego skanu pacjenta. Test transportu z kontrolowanym wywołaniem nie dowodzi natywnego IPC; to wymaga uruchomionej aplikacji Tauri. Poprawna kompilacja nie zastępuje przeglądu interfejsu ani walidacji klinicznej. Brakujące wymagania pozostają jawnie w statusie niezrealizowane/niezweryfikowane.

## Sources

[1] https://raw.githubusercontent.com/tauri-apps/tauri-docs/v2/src/content/docs/develop/calling-rust.mdx
[2] https://threejs.org/docs/pages/PLYLoader.html
[3] https://github.com/mrdoob/three.js/wiki/Migration-Guide
[4] https://threejs.org/docs/pages/WebGPURenderer.html
[5] https://doc.cgal.org/latest/Polygon_mesh_processing/index.html
[6] https://raw.githubusercontent.com/3MFConsortium/spec_core/master/3MF%20Core%20Specification.md
[7] https://www.fda.gov/media/97633/download
[8] https://health.ec.europa.eu/latest-updates/update-mdcg-2019-11-rev1-qualification-and-classification-software-regulation-eu-2017745-and-2025-06-17_en
[9] https://health.ec.europa.eu/document/download/385d7e20-d8b5-49d0-abd7-8daf269bf1b8_en
[10] https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0184498
