# OrthoSculpt CAD 0.2 — pracownia leja podudzia

## Potwierdzone przez użytkownika
- Segment: pracownie protetyczne, leje podudzia.
- Użytkownik może dostarczyć zanonimizowane skany i ocenę protetyka. Nowych skanów jeszcze nie dostarczono; nie zaliczać walidacji klinicznej ani testów realnych skanów na podstawie tej deklaracji.
- Wytwarzanie w tym wydaniu: eksport STL/3MF do dalszego CAM; bez adaptera i G-code.
- Zachować zatwierdzoną architekturę lokalną React/TS/Vite/Three + Rust/Tauri. Nie dodawać kont, usług AI, chmury i telemetrii. Nie osłabiać kontroli aplikacji Windows.

## Wybór kierunku
1. Sam lifting marketingowy nie usuwa ryzyka utraty pracy ani nie pomaga ocenić korekt — odrzucony.
2. Nowa platforma chmurowa zwiększyłaby zakres prywatności i nie odpowiada zatwierdzonemu local-only — odrzucona.
3. Lokalna pracownia do kontrolowanej oceny technicznej: wersje, bezpieczny zapis, porównanie, raport i jawne bramki jakości — wybrana jako rozwinięcie zatwierdzonego kreatora.

Powierzchnia UI: **Operate / Inspect**, nadal pięć kroków. Bez marketingowego hero, fikcyjnych wskaźników i obietnic dopasowania do pacjenta. Oprzeć styl na istniejącej palecie navy/mint i Segoe; poprawić hierarchy, czytelność i dostępność, nie tworzyć klonu konkurencji.

## Rezultat użytkowy
Operator potrafi wczytać skan, określić stronę i jednostki, skontrolować geometrię, ustawić układ odniesienia, porównać z taśmą, wykonać odwracalne korekty i przekazać konkretną rewizję do oceny protetyka wraz z raportem. Program nie zwalnia automatycznie wyrobu do produkcji.

## Nowe moduły i kontrakty

### A. Przestrzeń projektu (src/workspace)
Pseudonimowy caseCode (ASCII letters/digits/_/-, 1–40), strona unspecified/left/right, opcjonalna uwaga techniczna bez danych osobowych (max500). Bez nazwisk, PESEL, dat urodzenia, kont i automatycznej bazy pacjentów. Przy imporcie v1 nie wymyślać historii; utworzyć jawny wpis migracji/importu, stan orientacji unconfirmed.

Dziennik: start + kolejne wpisy z revision, atISO, kind, label, bounded primitive parameters. Max2000, monotonic revision, niemutowalne kopie. To dziennik roboczy, nie podpis cyfrowy ani niezależny dowód tożsamości. Zmiana widoku/kroku nie jest edycją; geometria, taśmy i metadane są edycjami. Pędzel zapisuje jeden wpis na zakończone pociągnięcie, nie na każdy pointermove. Undo przywraca geometrię i odpowiednią bazę; samo cofnięcie również jest wydarzeniem. Nowy projekt/import/reload oraz zamknięcie z niezapisanymi zmianami wymagają ochrony przed utratą pracy. Brak autosave danych medycznych do localStorage/IndexedDB.

API src/workspace/index.ts: createWorkspace(caseDetails?, nowISO?):WorkspaceState; validateWorkspace(value):WorkspaceState; appendWorkspaceEvent(state,event,nowISO?):WorkspaceState; fingerprintMesh(mesh):Promise<string>. Typy w src/workspace/types.ts należą do parenta.

IO zachowuje v1 i dodaje v2 tylko gdy przekazano workspace: saveProject(mesh,baseline,tapes,workspace?) i loadProject(text) -> dotychczasowe pola + optional workspace. Root v2 ma dotychczasowe mesh/originalPositions/tapes oraz workspace, strict keys; nie przenosi dowolnych danych pacjenta. Pseudonimizacja to nie pełna anonimizacja. Hash SHA256 dotyczy geometrii (positions+indices+liczniki LE), nie całego projektu i nie podpisuje operatora.

### B. Opcjonalny szyfrowany zapis (src/io/protectedProject.ts)
Standard WebCrypto: PBKDF2-HMAC-SHA256 + AES-256-GCM, losowy salt16B, IV12B, tag128; stała, wersjonowana liczba iteracji oparta na sprawdzonym źródle. Nie pisać własnych szyfrów/KDF. Walidacja koperty i wszystkich rozmiarów przed kosztownym KDF/dużą alokacją. Parametry z pliku nie mogą wymusić dowolnej liczby iteracji. Associated data obejmuje wersję/format. Wymagaj hasła co najmniej12 znaków i bounded length. Hasła wpisuje sam operator do UI, nie do czatu; nie logować ani utrwalać. Brak obietnicy pełnego wyzerowania pamięci JS. Wiadomość błędu: nieprawidłowe hasło lub uszkodzony plik, bez publikacji częściowo wczytanego stanu.

API protectProject(blob:Blob,password:string):Promise<Blob>; unprotectProject(text:string,password:string):Promise<string>; isProtectedProject(text:string):boolean. Nowy zapis główny umożliwia wybór szyfrowania (preferowane), jawny zapis nieszyfrowany pozostaje po ostrzeżeniu; plaintext i raporty nadal wymagają ochrony operatora. Potwierdzenie pobrania nie jest gwarancją trwałego zapisu na dysku — UI nie może bez podstaw obiecywać inaczej. Dobierać limity tak, by narzut base64 nie omijał/psuł File.size gate.

### C. Jakość geometrii i strona (src/geometry/audit.ts, orientation.ts, alignment.ts)
Oddzielić edge-manifold, vertex-manifold, spójność, winding/outward, samoprzecięcia i minimalną grubość. PASS/FAIL/UNKNOWN, jawny zakres algorytmu i budżet. Brak wyniku nie staje się PASS. Bounded prawdziwe przecięcia trójkątów + broad phase, z testami coplanar/shared-edge/overlap; trudna numeryka/budżet => UNKNOWN zamiast gwarancji. Jeśli pełna kontrola nie jest wiarygodna, uczciwie zwracać UNKNOWN i zachować blokadę wydania klinicznego. Minimum thickness pozostaje niezależną niepotwierdzoną właściwością, nie wnioskować jej z parametru offsetu.

auditMesh(mesh,options?):MeshAudit, orientMesh(mesh):{mesh,changed,warnings}. Bez cichego welding/deformacji kolorów. Kierunek pędzla musi odpowiadać sprawdzonej orientacji; odwrócona/niejednoznaczna powierzchnia nie może po cichu zmienić relief w kompresję.

registerLandmarks(mesh,points,flexion=0,side='right') rozszerzyć wstecznie kompatybilnie. Układ zawsze prawoskrętny, X ku prawej stronie pacjenta, Y do przodu, Z proksymalnie. Dla lewej kończyny marker boczny leży po −X; nie odbijać siatki. Wymagać odpowiedniej projekcji i zgodnej chiralii dla wybranej strony. Strona unspecified nie daje zatwierdzonej orientacji. Zmiana strony unieważnia poprzednie potwierdzenie, nie lustrzuje geometrii.

### D. Obliczenia poza głównym wątkiem (src/compute)
Slicing/serie pomiarowe/naprawa/audyt/PCA/kalibracja/strefa/powłoka uruchamiane w prawdziwym module WebWorker z TypedArrays i jawnymi kopiami przed transferem. Nie odłączać buforów UI. Ograniczyć liczbę aktywnych zadań, identyfikować żądania i rewizję; anulowanie faktycznie kończy kosztowny Worker, a spóźniony wynik nie publikuje starego stanu. Bez cichego fallbacku na fikcyjne dane. Testy transportu osobno od rzeczywistych testów Worker w Chromium. Native Rust branch nie może zostać zastąpiony mockiem ani opisany jako uruchomiony bez exe.

API runGeometryTask(operation,payload,{signal?}):Promise<typed result>; createWorkerSliceEngine(mesh):Promise<{kind:'worker';slice(z):Promise<SliceResult>;dispose():void}>. src/native.ts może używać Worker dla przeglądarki, zachowując Rust w Tauri i jawny Node/test fallback TypeScript. Nie obiecywać60FPS lub0,5ms; zmierzyć reprezentatywne syntetyczne obciążenia i opisać sprzęt/metodę.

### E. Porównanie i raport (src/reports, components)
Nakładka referencji roboczej 3D i porównanie przekrojów 2D. Nazywać referencję po orientacji/kalibracji dokładnie, nie udawać nieprzekształconego raw scan. Mierzyć prawdziwe różnice, nie fake KPIs. Raport HTML do druku/PDF z caseCode/stroną/rewizją/hash geometrii, parametrami/jednostkami, tabelą CAD/ref/taśma/reszta, kontrolami PASS/FAIL/UNKNOWN, dziennikiem i ograniczeniami. Escape wszystkich tekstów, tylko lokalne style/SVG, bez skryptów/remote assets. Nie utożsamiać technicznego reportu/checkboxa z kliniczną akceptacją lub certyfikatem. Raport może zawierać dane zdrowotne mimo pseudonimu; jawne ostrzeżenie przed nieszyfrowanym eksportem.

## Wydanie i dowody
Nowe wydanie 0.2 zachowuje poprzedni ZIP0.1 jako kopię, osobne nowe raporty i aktualizację README/REQUIREMENTS. Wykonać baseline, red-green, independent spec+security review, reprodukcje każdego blockera, ponowny review, full E2E, audit dependencies, build i test rzeczywiście rozpakowanego artefaktu bez node_modules. Pełne exe tylko po rzeczywistej kompilacji/launch; polityki4551 nie obchodzić. Zewnętrzne skany/protetyk i badania wyrobu pozostają osobnym krokiem pilotażowym.
