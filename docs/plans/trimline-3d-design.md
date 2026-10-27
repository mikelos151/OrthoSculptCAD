# Ręczna linia obrzeża 3D — projekt techniczny do zatwierdzenia

**Status: historyczna propozycja przed wyborem zakresu. Użytkownik wybrał szerszy wariant B — ciągłą linię 3D i obsługującą ją powłokę. Wariant A nie jest zatwierdzony do implementacji jako zamiennik; dokument zachowano jako analizę porównawczą.**
Cel: operator wskazuje linię na powierzchni 3D, ogląda rzeczywisty podział, świadomie wybiera zachowywaną część i dopiero zatwierdza jedną odwracalną operację.
Poza zakresem: automatyczny dobór anatomii, naciski, adapter, CNC, przymiarki, deklaracje kliniczne, remeshing i nowy algorytm powłoki.

## 1. Kontrakty przeczytane w kodzie
- `src/types.ts`: mm, prawoskrętny układ z Z proksymalnie; `MeshData` ma indeksy, RGB/UV/teksturę i `source`, ale nie trimline. Atrybuty są per-wierzchołek.
- `src/geometry/core.ts`: `validateMesh` sprawdza krawędzie i pętle; `watertight` NIE dowodzi pojedynczej składowej, poprawnych wachlarzy ani braku przecięć.
- `src/geometry/audit.ts`, `intersections.ts`: osobne kontrole składowych, wachlarzy i przecięć; ponad 200 000 wierzchołków lub trójkątów audyt jest UNKNOWN; domyślnie 2 000 000 par. Niejednoznaczność numeryczna także daje niekompletność.
- `src/geometry/planar.ts`: `simplePolygon` dotyczy 2D, a false obejmuje wyczerpanie budżetu; rzut XY nie rozstrzyga prostoty krzywej 3D.
- `src/manufacturing/shell.ts:buildShell`: przyjmuje otwartą powierzchnię ALBO zamkniętą siatkę z rozpoznawalną płaską pokrywą; pokrywę usuwa dopiero wewnątrz. Dalej wymaga jednej pętli, spójności, wachlarzy, audytu wejścia i wyniku.
- `src/manufacturing/proximal.ts:readProximalPlane`: płaskość z tolerancją `max(1e-5, przekątna*1e-5)` mm, normalna do 30° od +Z, górne 25% wysokości i płaszczyzna podpierająca całą powierzchnię.
- `src/App.tsx`: referencja to bieżące indeksy + `baseline`; `updateMesh` unieważnia powłokę/pomiary/audyt; `editMesh(..., true)` ustanawia nową bazę i usuwa taśmy — nie nadaje się wprost do trimline.
- `src/hooks/workbenchState.ts`: snapshot nie obejmuje rejestracji; obecne Undo w `App.tsx` ją zeruje. Historia: 20 pozycji / 128 MiB, z możliwością wyrzucenia nawet zbyt dużego najnowszego wpisu.
- `src/workspace/{types,index}.ts`: workspace v1, zamknięta lista zdarzeń, do 2000 wpisów; parametry wyłącznie proste. Rejestrację nie-null można obecnie ustawić tylko zdarzeniem `register`.
- `src/io/project.ts`: projekt v1 bez workspace / v2 z workspace v1; ścisłe pola; `originalPositions.length === mesh.positions.length`; historia Undo nie jest zapisywana.
- `src/components/{Viewport.tsx,meshView.ts}`: renderowana geometria zachowuje kolejność indeksów; picking zwraca dziś tylko `Vec3`, a referencja nie jest celem raycastu.
- `src/compute/{client,index,copy,protocol,types,execute}.ts`: dwa Workery compute, własne kopie, generacje i anulowanie transportu; `src/hooks/runDisplayTask.ts` ma ODDZIELNY licznik aktywności, nie wspólną pulę.
Źródłem tych ustaleń jest kod; `docs/plans/trimline-existing-contracts.md` jest pomocniczym raportem, bez zmian w tym projekcie.

## 2. Porównanie wariantów i rekomendacja
| Wariant | Rzeczywiste zachowanie | Koszt / ograniczenie |
|---|---|---|
| **A — rekomendowany pierwszy etap** | Ręczne kotwice na istniejących wierzchołkach; deterministyczne odcinki grafu krawędzi; zamknięty prosty cykl rozdziela ściany. Bez nowych wierzchołków. | Dyskretna, schodkowa linia zależna od triangulacji; możliwy objazd najkrótszej drogi. Dokładne remapowanie RGB/UV/bazy bez interpolacji. |
| B — ciągła krzywa przez wnętrza trójkątów | Kotwice barycentryczne, jawna marszruta po ścianach, przecięcia krawędzi, podział trójkątów i nowa topologia. | Osobny większy etap: robust predicates, przejścia przez wierzchołki, slivery, interpolacja bazy/RGB i osobne UV na szwach; większe ryzyko przecięć i nieodwracalnych uproszczeń. |
| C — płaszczyzna | Jedno płaskie cięcie z podglądem stron. | Prostszym narzędziem NIE zastępuje swobodnej linii na powierzchni 3D; nowe przecięcia nadal wymagają bezpiecznej triangulacji i atrybutów. |
**Rekomendacja A:** pełny, używalny etap „Obrzeże 3D po krawędziach”, nie stub i nie obietnica gładkiej anatomicznej krzywej. Najpierw korekty powierzchni, potem obrzeże; nie obiecywać powłoki z niepłaskiej granicy.

## 3. Interfejs i draft bez skutków ubocznych
1. W kroku korekt oddzielny, wzajemnie wykluczający się z pędzlem/rejestracją tryb obrzeża; wymagane potwierdzone mm i ukończona kontrola wejścia według §4.
2. Lewy krótki klik wybiera kotwicę, prawy obraca, kółko skaluje; przeciągnięcie nie dodaje punktu. Raycast wyłącznie bieżącego modelu, nigdy referencji, markerów ani powłoki.
3. Rozszerzyć callback o `faceIndex`, trzy indeksy ściany, barycentryczne współrzędne i punkt; wybrać najbliższy wierzchołek TEJ ściany (remis: mniejszy indeks), pokazać przesunięcie snap w mm. Nie szukać punktu przez ścianę ani scalać współrzędnych na szwie.
4. Numerowane kotwice i dokładna łamana po krawędziach; odcinki zasłonięte wyróżnione jako zasłonięte, nie prezentowane jak widoczna powierzchnia. Tylko zatwierdzona wersja obliczonego draftu jest linią podglądu.
5. Usuń ostatnią / wybierz i zastąp kotwicę / wyczyść / jawne „Zamknij linię”; 3–64 różne kotwice. Edycja po zamknięciu unieważnia podział i wybrany fragment.
6. Po poprawnym cyklu dwie składowe mają odrębne kolory i liczby ścian; klik wnętrza ściany wybiera „ZACHOWAJ”, druga część ma wzór usunięcia. Bez domyślnej strony z Z, objętości, normalnej ani kierunku rysowania.
7. Osobne „Pokaż tylko zachowywaną” i „Zastosuj usunięcie N ścian”; potwierdzenie wymienia utratę fragmentu, zmianę referencji na jej podzbiór i status powłoki. Nie stosować automatycznie przy zamknięciu/zmianie kroku.
8. Escape/anuluj usuwa draft; opuszczenie trybu/kroku, import, nowy projekt, Undo, zmiana jednostek/strony/metadanych/taśm i inna operacja unieważniają draft. Zapis/eksport z draftem zablokowany do „Porzuć draft” albo zastosowania; draft nie trafia do projektu ani journal.
9. Utrata fokusu, `pointercancel`/`lostpointercapture` anulują bieżący klik/drag i zadanie w locie, nie stosują linii; poprawne wcześniejsze kotwice mogą pozostać do jawnego ponowienia. Przed wyjściem z aplikacji chronić także niezastosowany draft.

## 4. Algorytm A i warunki odrzucenia
- Preflight przed kopiowaniem; wejście: jedna indeksowana, orientowalna, spójna przez krawędzie powierzchnia manifold, bez degeneracji i przecięć; zamknięta albo z dokładnie jedną prostą pętlą brzegową, bez izolowanych wierzchołków.
- Wymagać kompletnych PASS dla `edge-manifold`, `vertex-manifold`, `components`, `degenerate-triangles`, `winding`, `self-intersections`. Dla otwartej powierzchni `watertight=fail`, `outward=unknown` są prawdziwymi wynikami, nie błędem protokołu i nie wolno ich przemalować na PASS.
- Nie naprawiać/weldować po cichu: rozcięte UV, face-RGB lub nieindeksowany STL mogą nie spełniać warunku manifold. Jawna odmowa; przygotowanie źródła jest osobną operacją z własnym Undo i kopią projektu.
- Budować ograniczoną tablicową strukturę krawędź→ściany oraz graf sąsiedztwa z dodatnią długością 3D w Float64. Dijkstra między kolejnymi kotwicami, również ostatnia→pierwsza; stabilna kolejność sąsiadów i priorytet `(długość, liczba krawędzi, indeks)`, remis poprzednika: mniejszy indeks.
- To najkrótsza droga W GRAFIE, nie dokładna geodezyjna ani rozpoznanie anatomii. Rozstrzygnięty remis jest jawnie wyświetlonym przebiegiem; operator koryguje go dodatkową kotwicą. Nie wymuszać ukrytego objazdu przez zakaz poprzednich odcinków.
- Złożyć cykl bez podwajania wspólnych końców: co najmniej 3 wierzchołki, brak powtórzeń wierzchołków/krawędzi, zawracania, zerowych odcinków; każdy wierzchołek cyklu ma stopień 2. Krawędzie cyklu muszą mieć dokładnie dwie ściany; cykl nie dotyka starej granicy nawet wierzchołkiem.
- Wykluczyć geometryczne samoprzecięcia, nakładanie i styki nieprzyległych odcinków w 3D, z ograniczonym broad/narrow phase; sąsiednie mogą dzielić tylko wspólny koniec. Przypadek bliski tolerancji → UNKNOWN/odmowa. Nie oceniać prostoty rzutem XY.
- Zablokować przejścia przez krawędzie cyklu w grafie dualnym ścian; flood-fill wszystkich ścian ma dać DOKŁADNIE dwie niepuste składowe. Jedna = cykl nierozdzielający (np. na torusie); >2 = niespójność/niedopuszczalność, nie wybór dwóch największych.
- Każda krawędź cyklu musi graniczyć z różnymi składowymi; suma ich ścian równa wejściu, brak brakujących/powielonych ścian. Klik wyboru nie może należeć do linii ani niejednoznacznego trafienia.
- Zachowana składowa musi mieć dokładnie jedną pętlę, równą zadanemu cyklowi (do rotacji/odwrócenia), jeden spójny wachlarz na każdym wierzchołku i jedną składową. Na wejściu otwartym wybór strony zachowującej także stary brzeg daje dwie pętle i jest odrzucany, nie automatycznie odwracany.
- Kompaktować tylko użyte wierzchołki w rosnących indeksach wejścia; zachować kolejność i winding wybranych ścian. Zwrócić `newToOldVertex`, identyfikatory zachowanych ścian, nowy cykl i kandydat siatki; żadnego wygładzania/capowania/offsetu.
- Ponowny audyt kandydata według powyższych wymaganych kontroli + sprawdzenie mapowania i pętli przed publikacją. Odrzucenie, UNKNOWN, brak drogi, budżet lub niezgodność protokołu → zero zmian modelu, historii, journal i pochodzenia.

## 5. Atrybuty, referencja, rejestracja i dokładne Undo
- Dla każdego `j`: pozycja/RGB/UV kandydata to bitowo odpowiedni element `newToOldVertex[j]`; `textureUrl`, obecność atrybutów, nazwa i `source` zachowane. Nie zmieniać `synthetic` na `imported`, nie zespawać szwu; eksport STL nadal nie przenosi atrybutów.
- `baseline[j] = staraBaseline[newToOldVertex[j]]`; referencja zachowuje stare współrzędne i tę samą wybraną topologię. NIE zastępować bazy bieżącymi pozycjami. Zestawić podgląd z przyciętą referencją; interfejs wyraźnie mówi „referencja — zachowany podzbiór”, nie „pełny skan źródłowy”.
- `Reset` po trimline przywraca pozycje podzbioru bazy, NIE usunięte ściany. Pełne źródło wymaga kopii sprzed cięcia albo Undo w tej sesji; zaproponować lokalny zapis przed zastosowaniem, bez deklaracji potwierdzonego zapisu na dysku.
- Taśmy zachować z niezmienionymi Z/obwodami; nie usuwać poza nowym zakresem. Unieważnić pomiary i reszty; ponownie pokazać „brak prawidłowego przekroju”, nie zero/ekstrapolację. Dotyczy też CSV i raportu.
- Cięcie nie zmienia układu współrzędnych: zachować historyczną `RegistrationRecord` wraz ze `sourceRevision`, nawet gdy punkt leży w usuniętym fragmencie. Opisać ją jako rejestrację układu sprzed cięcia, NIE potwierdzenie landmarków na zachowanej powierzchni; robocze markery wyczyścić.
- Atomowy commit musi wcześniej przygotować i zwalidować siatkę, bazę, metadane trimline, snapshot oraz nowy workspace. Jedno zastosowanie = jedna rewizja + `trimline-edge` + jedna pozycja Undo. Unieważnić audyt, indeksy, mapę, tabelę, raport i cache powłoki; nie wywoływać ogólnego `newBaseline=true`.
- Rozszerzyć snapshot o rejestrację i zapisany rekord trimline; obecne kopie geometrii/bazy/taśm/jednostek zostają. Undo odtwarza bitowo wszystkie tablice/atrybuty i te metadane, bez odtwarzania nieaktualnych cache. Dziennik pozostaje append-only: nowy `undo`, nie cofanie rewizji/czasu i nie fałszywe `register`.
- Potrzebna kontrolowana ścieżka Undo przywracająca zwalidowaną historyczną rejestrację z wewnętrznego snapshotu; nie poluzować ogólnego przyjmowania `registration` od dowolnego zdarzenia/importu. Jej dawny wpis `register` musi nadal istnieć w journal.
- Przed cięciem zagwarantować zachowanie najnowszego snapshotu w 128 MiB (wliczyć bazę, atrybuty, konserwatywnie teksturę i metadane); gdy sam nie mieści się, ODMÓWIĆ zamiast wykonać cięcie bez Undo. Starsze wpisy mogą być jawnie usunięte według dotychczasowej polityki 20 pozycji.
- Zapewnić rezerwę wpisów journal dla dostępnych cofnięć: `liczba zdarzeń + planowany wpis + wynikowa liczba snapshotów <= 2000`; metadata-only też nie zużywa rezerwy. Undo zużywa wpis i zdejmuje snapshot. Nie obcinać dziennika przy limicie. Cofanie wcześniejszej sesji nadal niedostępne.

## 6. Powłoka i flare: świadomie oddzielna bramka
- Niepłaskie otwarte obrzeże jest prawidłowym wynikiem etapu A, ale NIE wejściem obsługiwanym przez obecny `buildShell`: `readProximalPlane` jest wywoływane także przy `flareAngle=0`.
- Nie wystarczy wyłączyć flare; nie projektować best-fit plane, spłaszczenia, ukrytej pokrywy ani tolerancji „anatomicznej”. Generowanie i eksport powłoki dla tego wyniku zablokowane z konkretną przyczyną. Projekt, raport i jawnie opisany otwarty pozytyw powierzchniowy można zapisać/wyeksportować.
- Płaski wynik może przejść obecną ścieżkę tylko gdy rzeczywiście spełnia wszystkie warunki `proximal.ts`, skali, topologii i audytu. Bez automatycznego wyboru strony „dystalnej”. Dotychczasowa ścieżka zamkniętego wejścia z usuwaniem pokrywy pozostaje obsługiwana bez zmian.
- Podgląd pokazuje status zgodności z obecną powłoką; nie jest to dowód powodzenia offsetu. Przed generowaniem potrzebny jest aktualny preflight, a sam `buildShell` nadal ostatecznie rozstrzyga.
- Flare pozostaje profilem względem jednej płaszczyzny na istniejących wierzchołkach; flare wzdłuż niepłaskiej krzywej wymaga odrębnego projektu. Po otwarciu `normalsUsable` daje false: pędzel podpisany/mapa normalna nadal zablokowane, nie obchodzimy tego dla trimline.
- Każdy eksport powłoki wymaga cache związanego z bieżącą geometrią i parametrami oraz niezmienionych bramek audytu. FAIL/UNKNOWN przecięć blokuje wynik; brak gwarancji minimalnej grubości pozostaje jawny (dziś UNKNOWN), nie staje się PASS od szczelnych krawędzi.

## 7. Zapis i zgodność wersji — proponowana decyzja
- Nowy zapis: projekt **v3**, workspace **v2** z nowym `trimline-edge`; odczyt starych projektów v1/v2 i workspace v1 zachowany. Migracja nie zmienia dawnych rewizji, dat ani zapisów rejestracji; v1 bez historii zachowuje obecną jawną migrację.
- Pole projektu `trimline: null | {algorithm:'edge-cycle-v1', createdRevision, sourceFingerprint, resultFingerprint, boundaryVertexIds}`; indeksy dotyczą bieżącej siatki, limit 20 000, brak powtórzeń, zgodność z jej jedyną pętlą. To opis ostatniego aktualnego cięcia, nie archiwum usuniętej części ani edytowalny draft.
- Fingerprint według `workspace/index.ts` obejmuje tylko geometrię, NIE RGB/UV/teksturę; nie jest podpisem. Rekord wymaga związku z istniejącym zdarzeniem cięcia; zgodność fingerprint/pętli zweryfikować przed instalacją. Nie twierdzić, że nieobecne źródło można zweryfikować z samego hash.
- Zdarzenie zawiera ograniczone scalars: wersję algorytmu, liczbę kotwic, ścian przed/po, długość cyklu, hash źródła/wyniku, status zgodności powłoki; bez współrzędnych/tekstury w parametrach. Po kolejnej zmianie geometrii bieżący rekord wyzerować, ale zachować historyczny wpis; Undo przywraca rekord ze snapshotu.
- Zaktualizować walidatory, typy i świadome allowlisty w `src/reports/{journalPrivacy,reviewReport}.ts` oraz polskie etykiety w `src/reports/qualityLabels.ts`; raport nie ujawnia kotwic ani nowego wolnego tekstu. Zasady prywatności i szyfrowana otoczka projektu pozostają, wymagają round-trip v3.
- Stara aplikacja 0.2.0 odrzuci v3 jako nieobsługiwany — to bezpieczne, jawne ograniczenie kompatybilności, nie błąd migracji. Bez eksportu v2 pozorującego zachowanie nowej semantyki. Nigdy nie nadpisywać ZIP 0.2.0.

## 8. Transakcje, dwa Workery i budżety
- Draft otrzymuje `projectEpoch`, rewizję workspace, tożsamość mesh i baseline, jednostki/potwierdzenie, własne `draftId/generation`; sprawdzać przed dispatch, po każdej granicy async i przy commit. Zmiana kotwicy/strony fragmentu unieważnia wcześniejszy preview; samo `busy` React nie jest blokadą.
- Rozszerzyć wzorzec `createStrokeFence`/`createTaskGate`; klik ma ticket od pointerdown do pointerup z progiem ruchu. Podczas aktywnego kliknięcia/obliczeń wzajemne wykluczenie mutacji, pędzla i eksportu; żadnego późnego callbacku na nowy projekt z tym samym caseCode.
- Trimline przez istniejący compute Worker/protokół, nie trzeci dedykowany Worker. Wspólna rezerwacja maks. **2 rzeczywistych Workerów** obejmuje compute, display, indeks bieżący i referencyjny; zastąpić rozdzielne liczniki wspólnym admission także w `runDisplayTask`.
- Rezerwować slot przed kopiami; na obliczenie draftu wstrzymać background audit, anulować oba indeksy/czytniki tak jak `App.run`; nie wznawiać ich z efektów podczas obliczeń. Po zwolnieniu slotu odtworzyć potrzebne czytniki, po commit dopiero po audycie nowej geometrii.
- `AbortSignal`/timeout ma kończyć rzeczywistego Workera i zwalniać slot dokładnie raz; sam komunikat cancel nie przerywa synchronicznej Dijkstry. Transferować wyłącznie własne kopie, również bazy/mapowań; bufory Three, Undo i źródła nigdy detached. Bez main-thread fallback w przeglądarce/native.
- Proponowane początkowe limity techniczne, nie kliniczne: 200 000 V i 200 000 F; 64 kotwice; 20 000 krawędzi cyklu; 600 000 unikalnych krawędzi; CSR/tablice zamiast nieograniczonych obiektowych map grafu.
- Na pełną generację draftu łącznie ≤20 000 000 odwiedzin sąsiadów i ≤4 000 000 operacji heap, z heap indeksowanym ≤V elementów; każdy etap budowy, flood-fill i kontroli ścian ma limit liniowy liczony od V/F/E, nie tylko licznik znalezionych przecięć.
- Prostota cyklu: ≤2 000 000 odwiedzin broad/narrow phase; audyty wejścia/kandydata zachowują istniejące limity par. Łączne jawnie rezerwowane bufory zadania ≤128 MiB (źródło/baza, kopie, graf, wynik, mapowania; osobno ograniczona historia), deadline całej generacji 120 s; przekroczenie → odmowa, nie ucięta linia.
- Limit 200 000 dla trimline NIE oznacza obsługi powłoki tej wielkości: jej dwie warstwy i rim mogą przekroczyć cap audytu wyniku. Preflight liczy finalne V/F i blokuje nieaudytowalną powłokę; nie podnosi limitu ani nie osłabia audytu.

## 9. Kryteria odbioru po osobnym zatwierdzeniu implementacji
- **TDD RED→GREEN:** syntetyczne zamknięte/otwarte cylindry z niepłaskim cyklem, oba wybory strony, zgodność grafu, deterministyczne remisy, brak nowych V, zachowanie winding i dokładny podzbiór ścian; poprawna pojedyncza granica.
- Negatywne: powtórzenia/zawracanie/wspólny odcinek, geometryczne przecięcia i near-touch, dotknięcie starego brzegu, dwa brzegi wybranej strony, torus/nonseparating, wejście i wynik >2 składowych, pinched vertex, degeneracje, UV split, brak drogi i każda granica budżetu (dokładnie limit / limit+1).
- Bitowe asercje RGB/UV/pozycji/bazy i `source` dla obecnych/nieobecnych atrybutów; test po korekcie różnej od bazy; Reset vs Undo; rejestracja, taśmy poza zakresem, ograniczenia historii i rezerwa journal. Każda odmowa porównuje pełny stan przed/po.
- **Integracja/protokół:** walidacja fałszywych wyników/mapowań, dwa równoległe preview, cancel w trakcie kopii/obliczeń/commit, spóźniona odpowiedź po import/Undo/zmianie jednostek; <=2 wszystkich Workerów, brak wycieków i detached buffers. v1/v2→nowa aplikacja, v3 zwykły/szyfrowany round-trip i odmowa starym czytnikiem bez publikacji.
- **E2E realnego UI:** rzeczywiste kliknięcia i obrót 3D, snap, nieplanarna łamana, jawny wybór i preview przed zastosowaniem, jedna rewizja/Undo; Escape, blur, pointercancel, zmiana kroku i nowy projekt. Browser WebGL2 i Windows native WebView; zachować regresje `e2e/v02-gesture-isolation.spec.ts`, `v02-worker-budget.spec.ts`, `v021-lifecycle.spec.ts`.
- E2E powłoki: niepłaska linia blokuje generowanie/eksport również przy flare=0; płaska spełniająca kontrakt i dawna zamknięta pokrywa zachowują ścieżkę; edycja/Undo nie eksportuje starej powłoki. Raport/CSV nie podają starych pomiarów ani PASS grubości; zapis/ponowny odczyt odtwarza dokładny podzbiór.
- **Niezależny audyt:** drugi reviewer odtwarza negatywne przypadki inną implementacją analizy dualnej/wachlarzy oraz narzędziem przecięć 3D; porównuje zachowane indeksy i byte arrays, rzeczywiste pobrane projekty/eksporty, brak ukrytej pokrywy i ślad transakcji. Osobno pomiar minimalnej grubości ewentualnej powłoki; żaden wynik techniczny nie jest walidacją kliniczną.
- Obecnie wykonano wyłącznie przegląd kontraktów i ten projekt; powyższe testy są przyszłymi kryteriami, NIE wynikami. Po zgodzie powstaje odrębny plan TDD; bez zmian aplikacji, wersji i wydania przed zatwierdzeniem.

## 10. Decyzje wymagające potwierdzenia użytkownika
1. **Czy zatwierdzić A jako pierwszy zakres:** dyskretna ręczna linia 3D po krawędziach, z rzeczywistym usunięciem wybranej części, ale bez gwarancji gładkości i bez powłoki z niepłaskiego brzegu? Jeśli potrzebna od razu ciągła krzywa B lub gotowa powłoka z niej, ten zakres nie spełnia celu i trzeba go przeprojektować.
2. Czy zaakceptować przyciętą referencję/bazę, zachowane historyczne taśmy i rejestrację układu oraz dokładne Undo tylko w bieżącej sesji (pełne źródło zachowywane osobnym projektem)?
3. Czy zaakceptować zapis v3/workspace v2 nieotwierany w 0.2.0 oraz konserwatywne limity i odmowy dla nieindeksowanych/szwowych albo niejednoznacznych źródeł? Zgoda na projekt nie jest zgodą na zmianę zamrożonego wydania.
