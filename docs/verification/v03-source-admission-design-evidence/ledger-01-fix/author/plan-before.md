# v0.3 — source-admission i retained owner pełnego S

**Status: kompletny projekt do niezależnego review, nie implementacja ani odbiór admission.**
**Dla implementera:** TDD: test zachowania → rzeczywisty RED → minimalny GREEN; nie zaliczać błędu importu jako RED. Bez zmian zamrożonego wydania 0.2, `dist/` lub ZIP.

**Cel:** dopuścić pełne, skorygowane źródło S dopiero po świeżym audycie jego prywatnych bajtów, zachować je w rzeczywistym Workerze i udostępniać autentyczne capabilities tylko aktualnym konsumentom.
**Architektura:** jeden broker ≤2 rzeczywistych Workerów dla dotychczasowego compute/display/indeksów i nowego ownera; centralny ledger rezerwowany przed alokacją; audyt z ograniczonymi arenami TypedArray; prywatny immutable snapshot, opaque authority i transakcyjne fences.
**Technologie:** istniejące TypeScript, Web Workers, WebCrypto, Vitest/Playwright i Python stdlib do małych niezależnych świadków. Bez nowej zależności runtime.

## 1. Zakres, pierwszeństwo i odczytana baza

Normatywne: `trimline-v03-integrated-design.md`, plan M0 oraz `v03-source-bound-spans-design.md` §5 i tracery 4/5 §6. Odczytany checkout: `feature/trimline-v03`, `f288ffccb0d1eb2f2f901d9a03e1daa408b289db`, początkowo czysty. Odebrane M0c3a pozostaje candidate-only: `capture/describe/resolveFace/bindFaceCubic/release/dispose`, prywatne pełne S w WeakMap, whole digest, publiczne `fromFloat32Bits` i `certifyFaceCubic` w tym samym ctx. Nie zmieniać candidate na audited przez type-cast.

Produkt bez zmiany: lokalny polski CAD dla laboratoriów TT; gładka ciągła linia 3D we wnętrzach ścian, rzeczywisty podział OBU części, zachowane całe skorygowane S i osobna B, niepłaska powłoka i zewnętrzny kołnierz, STL/3MF do downstream CAM. Ten krok nie realizuje linii/seams/cut/shell/reload-v3 ani klinicznego odbioru, skanów i native EXE. Bez chmury, kont, płatności i sterowania CNC. Edge-only, dowolne C0 lub płaska linia bez powłoki nie zastępują produktu. Lokalny algebraic-reference→Rat bridge ma status LOCAL_ONLY; nie dowodzi globalnej krzywej i nie jest zależnością source-admission.

- **S**: całe skorygowane źródło bezpośrednio przed cut, immutable; **B**: osobna pełna baza, nie S.
- **C**: pełna konstrukcja Float32 obu części po exact podziale i jednokrotnym rounding; **R**: bitowy podzbiór C. **Q**: ciągłe kawałkami afiniczne odwzorowanie całego S→C zgodne na E/V.
- Osobne bramki: hit/kanonizacja ≤0,005 mm; aproksymacja krzywej ≤0,005 mm; kwantyzacja całego C ≤0,010 mm. Admission S nie dowodzi żadnej z nich, osadzenia Q, strony C–outer/rim ani grubości. Nie dodawać mocniejszej zamrożonej metryki klienta.

Ograniczenia faktycznego kodu:

| Miejsce | Fakt wymuszający zmianę |
|---|---|
| `src/geometry/audit.ts:7–69`, `core.ts:88–127`, `intersections.ts:80–123` | `auditMesh` istnieje; Map/Set, tablice JS i obiektowe BVH nie uczestniczą w ledgerze. Cap 200000 V/F; rozstrzygnięcia numeryczne mogą być UNKNOWN. |
| `src/compute/client.ts:4–64`, `index.ts:10–27` | Obecny licznik max 2; Worker kończony w finally zadania. Nie pozostawia authority S. |
| `src/compute/copy.ts:16–53` | Limit pojedynczego payloadu 128 MiB, kopia chunkowana/yield; nie jest spójnym snapshotem mutable źródła ani całym working setem. |
| `src/compute/service.ts:6–35` | Retained jedynie SliceIndex; raport analyze nie jest handlem źródła. |
| `src/hooks/workbenchState.ts:5–14,25–34,40–85` | Undo kopiuje przed limitem; qualitySummary wymaga thickness PASS, normalsUsable jest za słabe; task/stroke fences nie obejmują całego S. |
| `src/App.tsx:181–201,255,292–415,539–555,700–710,797–833` | `auditedMesh === mesh` to nie immutable authority; import/Undo/jednostki, commity i eksport wymagają adaptera, nie tylko nowego interfejsu TS. |

**Decyzja:** wymagany nowy budgeted backend audytu i kontrolowana migracja wejść compute. Wrapper starego audytu z arbitralną rezerwacją, raport od callera i nowa trzecia pula są odrzucone. Pełna przebudowa workbench nie jest pierwszym krokiem; mały dodatni pion source→audit→retained→consumer będzie możliwy po G1–G4 poniżej.

## 2. Zamrożona polityka admission i wynik

Właściciel wykonuje **rzeczywiste `auditMesh(privateFullS, {maxPairTests: 2_000_000, maxIntersections: 100}, internalArenaExecution)`**, na tym samym prywatnym snapshotcie co digest i późniejszy resolver. Trzeci argument jest **proponowanym nowym, wewnętrznym** kontekstem backendu, nie istniejącą funkcją ani callbackiem do prywatnej siatki. Bez niego dotychczasowe API i regresje pozostają zachowane, ale stara niebudżetowana ścieżka nie może działać w sesji retained-owner.

Warunek tokenu, łącznie:

1. `complete === true`, `triangleCount === F`, `orientation === 'outward'`, `Number.isFinite(signedVolume) && signedVolume > 0`, `intersections.length === 0`.
2. Dokładny zbiór dziewięciu ID, każde raz. Osiem wymaganych: `edge-manifold`, `watertight`, `vertex-manifold`, `components`, `degenerate-triangles`, `winding`, `self-intersections`, `outward` — każde `pass`. Dziewiąte `minimum-thickness` dokładnie `unknown`.
3. Missing/duplicate/nieznane ID, nieznany status, nieliteralne pole, nieprawidłowy count/volume/schema → UNKNOWN/`AUDIT_PROTOCOL`, zero tokenu. Znany wymagany `fail` → FAIL; wymagany `unknown`, incomplete/cap/numeric ambiguity → UNKNOWN. Jednoczesny znany fail i incomplete pozostaje odmową z geometrycznym świadkiem i informacją niekompletności; nie emitować PASS. Thickness nie staje się bramką źródła ani clinical/thickness PASS.
4. Polityka jest stałą właściciela; caller nie może podać luźniejszych opcji, raportu, sourceID lub oczekiwanego digest jako authority. Niższe budżety tylko w prywatnym teście backendu; nie nowa opcja produktu.
5. Przed publikacją ponowne uwierzytelnienie scope/stamp, deadline i live lease. Repair/orient nie są częścią admission: tworzą nowe S, nową tożsamość i świeży audyt. Cap **200000 V i F bez podnoszenia**.

Raport ma literalny `auditVersion`, `policyVersion`, kompletność, dziewięć checków i obiektywne liczniki; nie zawiera danych pacjenta/współrzędnych w błędach. PASS oznacza wynik zdefiniowanego bounded audytu (obecnie numerycznego), nie exact-rational ogólny certyfikat geometrii. Zmiana metody/polityki wymaga wersji i ponownego admission.

## 3. Publiczne API, authority i własność

Poniżej **propozycja kontraktu**, nie obecne eksporty. Publiczny adapter przyjmuje wyłącznie opaque snapshot ticket z autorytatywnego project-source registry, nie dowolne `MeshData` opatrzone stringiem `S`.

```ts
// src/trimline/source-admission.ts (fasada, bez buforów)
declare const snapshotBrand: unique symbol;
declare const auditedBrand: unique symbol;
export interface FullSourceTicket { readonly [snapshotBrand]: true }
export interface AuditedSource { readonly [auditedBrand]: true }
export interface AdmissionStamp {
  readonly projectEpoch: number;
  readonly revision: number;
  readonly generation: number;
  readonly units: 'mm';
  readonly unitsConfirmed: true;
  readonly frameId: string;
}
export interface AuditedSourceDescription {
  readonly kind: 'audited-full-source-v1';
  readonly sourceId: string;       // nowe runtime ID, nie JSON
  readonly sourceDigest: string;  // obecny whole-S canonical SHA-256
  readonly stamp: AdmissionStamp;
  readonly vertexCount: number;
  readonly faceCount: number;
  readonly auditVersion: 'arena-audit-v1';
  readonly policyVersion: 'source-admission-v1';
}
export type AdmissionResult =
  | { readonly kind: 'admitted'; readonly source: AuditedSource;
      readonly description: AuditedSourceDescription }
  | { readonly kind: 'refused'; readonly status: 'fail' | 'unknown';
      readonly code: 'GEOMETRY' | 'AUDIT_INCOMPLETE' | 'AUDIT_PROTOCOL' |
        'BUDGET' | 'BUSY' | 'STALE' | 'UNAVAILABLE' };
export interface SourceAdmission {
  admit(ticket: FullSourceTicket, signal?: AbortSignal): Promise<AdmissionResult>;
  describe(source: AuditedSource): AuditedSourceDescription;
  checkCurrent(source: AuditedSource): Promise<AuditedSourceDescription>;
  release(source: AuditedSource): void;
  dispose(): void;
}
```

`createSourceAdmission` jest składany raz przez workbench composition root z prywatnym registry, brokerem i ledgerem, nie z caller-supplied audit lub `getPrivateMesh` callbackiem. Te zależności nie są rozszerzeniami publicznego API. `FullSourceTicket` uwierzytelniany w WeakMap registry; pochodzi z bieżącego **pełnego pre-cut source slot**, nie aktywnego R/B. Registry nie uznaje etykiety roli z pliku. Pierwsza sesja legacy bez cut: pełny corrected mesh staje się nowym source slot; późniejsze cut może zmienić aktywny widok na R, nigdy podmienić source slot. V3 reload ma osobny staging slot, nie instaluje projektu przez samo admission S.

Oba publiczne handle to frozen puste obiekty; WeakMap wiąże je z połączeniem, owner nonce, source ID, stamp i rezerwacją. Brand TS, digest i JSON nie są authority. Clone/foreign/forged → kontrolowany INVALID_INPUT (bez odczytu parametrów geometrii); autentyczny wycofany handle → STALE. `release` autentycznego retired jest idempotentne, forged/foreign jest błędem, również po dispose; dispose idempotentne. Publiczne wyniki i tuple głęboko frozen; brak TypedArray/ArrayBuffer/DataView, całego MeshData i publicznego hooka do private S.

Jeden source per owner/Worker i najwyżej jedno żądanie w locie. Brak kolejki przechowującej niezarezerwowane meshe. Live owner zajmuje slot także w idle. Późniejsze replace wymaga miejsca na równoczesny stary i nowy snapshot/Undo albo jawnej odmowy; nie niszczyć aktywnego projektu, żeby zrobić miejsce na kandydata. Ten krok nie obiecuje płynnego replace przy każdym capie.

**Reuse M0c3a:** potrzebna reviewowana ekstrakcja do `src/trimline/internal/owned-source.ts`: preflight intrinsic views, synchroniczna bitowa kopia, walidacja, canonical preimage i ordered resolver. Candidate i owner delegują do tej samej implementacji; publiczne API i bajty digest candidate bez zmian. Wewnętrzny moduł nie jest re-exportowany i nie przyjmuje callbacku; prywatny `OwnedSourceRecord` nigdy nie opuszcza Workera. Audyt i resolver dostają ten sam record. Nie robić candidate capture + ponowna kopia S do audytu. Przed tą refaktoryzacją pozostają obowiązkowe regresje M0c3a.

Publiczny zdalny `resolveFace`/`bindFaceCubic` nie powstaje teraz: autentyczne Rational/ctx nie przechodzą structuredClone. Przyszły consumer kernel działa **w tym samym owner realm**, uwierzytelnia worker-local audited token i wywołuje istniejący ordered resolver → publiczne `fromFloat32Bits` → `certifyFaceCubic` w jednym ctx. W tym pionie wystarcza real `checkCurrent`: backend uwierzytelnia token i odsyła frozen opis, nie tworzy seam API ani certyfikatu cut. Konsument przyjmujący tylko candidate albo plain opis zawsze odmawia.

## 4. Wire contract, retained lifecycle i fences

`src/compute/sourceProtocol.ts`: zamknięta allowlista protokołu `source-owner-v1`, bez rekursywnego odkrywania transferables. Request envelope: `{protocol, id, workerGeneration, ownerNonce, stamp, command}`. Safe integer id/generacje, bounds frame jak M0c3a; nonce wygenerowany przez brokera dla konkretnego połączenia i nigdy zapisany w projekcie. Nie jest kryptograficznym uwierzytelnieniem względem dowolnego kodu w aplikacji — granicą jest prywatny realm/połączenie.

| command | payload / skutek |
|---|---|
| `captureAudit` | owned wire mesh z jawnie wyliczonymi transferami + opaque reservation ID + source-slot ID. Owner przejmuje bufory, waliduje całość, oblicza whole digest, faktycznie audytuje i zatrzymuje S. Nie przyjmuje raportu ani caller sourceId. |
| `checkCurrent` | worker-issued token ID + sourceId/digest i pełny stamp. Porównanie worker-local token table, nigdy sam digest. |
| `release` | dokładnie token ID; usuwa authority i własność S, odpowiada potwierdzeniem bez danych. |
| `dispose` | normalne zamknięcie; cancel/deadline używa bezpośrednio terminate, nie czeka na obsługę wiadomości w zajętym Workerze. |

Reply envelope powtarza wszystkie pola korelacji i ma zamknięty union `admitted {tokenId, description, report}`, `current {description}`, `released`, `refused {status, code}`. `report` to nowy fixed ArrayBuffer **256 B**, rezerwowany przed alokacją i transferowany jawnie; brak klonowania nieograniczonego `MeshAudit.detail`. Wire LE v1: ASCII `OSA1` na offset 0; u32 version na 4; dziewięć u8 statusów na 8..16 w kolejności z §2; u32 triangleCount/candidateTests/intersectionCount na 20/24/28; f64 signedVolume/elapsedMs na 32/40; u8 orientation/complete na 48/49; pozostałe bajty zero. Status enum pass=1/fail=2/unknown=3, orientation unknown=0/outward=1/inward=2/inconsistent=3, complete=0/1; admitted wymaga intersectionCount=0. ID są w wire implicit, ale **przed** kodowaniem owner sprawdza literalne ID pełnego rzeczywistego raportu dokładnie według §2. Witness pairs do 100 pozostają w arenie; odmowa nie przenosi ich do publicznych logów. Description/envelope mają wyłącznie bounded scalars/strings: frame 64 ASCII, runtime IDs max 96 ASCII, digest dokładnie `sha256:`+64 lowercase hex, bez nazwy/tekstury w reply. Ich logical string charge rozliczyć osobno; JS obiekty pozostają wyłączeniem opisanym w §5, nie ukrytą tablicą geometrii.

Parse strict przed mintowaniem main-thread handle; report nie daje authority. Token ID nie jest publicznym capability ani rehydratowalnym obiektem. Main facade nie przyjmuje wire reply od callera; handler jest związany z rzeczywistym Workerem i nonce. Worker ma własny opaque audited token w WeakMap + bounded tabelę wire ID. Utrata Workera wycofuje wszystkie main handles tego połączenia.

Przepływ własności i rezerwacji:

1. Registry pobiera synchronicznie aktualny autorytatywny source slot i stamp; fence przy dispatch. Musi już śledzić jego pełne live bufory w ledgerze. Brak potwierdzonych mm/frame lub właściwego source slot → odmowa przed kopią.
2. Zarezerwować slot i **cały** znany plan bytes: wire snapshot, preimage, output hash, arena, ograniczony raport i ewentualne kopie przejściowe. Dopiero potem utworzyć Worker/kopię. Dla source capu kopia S jest synchroniczna przed pierwszym await jak M0c3a (nie chunk/yield po mutable danych). Jeśli później potrzebne chunkowanie: wyłącznie z sealed immutable registry snapshotu; dodatkowa kopia i lease osobno rozliczone.
3. Snapshot nie aliasuje UI; transfer do Workera tylko jawnych owned buffers. Transfer zmienia realm właściciela, nie zwalnia i nie dubluje lease. UI oryginał i worker S są dwoma allocation IDs. Worker nie kopiuje przyjętego unaliased snapshotu drugi raz. Shared/resizable/detached/exotic views odrzucane; wire ma zwykłe fixed bufory, walidację capów/strides/attrs/metadanych po odbiorze.
4. `capturing → hashing → auditing → live` lub `refused/retired`. Przed/po każdym await, po kopii/audycie oraz przed odpowiedzią sprawdzić stamp/generację i deadline. S nie jest nigdy naprawiane in-place. Digest i audit czytają ten sam record. Preimage znika dopiero po zakończeniu SHA. Pending SHA w żywym realm nie zwalnia się na samo żądanie cancel.
5. W main po odebraniu reply znów pełny fence; dopiero wtedy main mintuje handle i może atomowo ustawić admission bieżącego slotu. Stale reply: zero zmiany projektu, revoke/terminate owner i cleanup. Nigdy instalacja „na chwilę” i późniejsze cofnięcie.
6. Normalny release wymaga ACK zanim ledger zwolni live S; unresponsive → terminate i cleanup. Cancel/crash/deadline zamyka transport, wycofuje authority natychmiast, terminate całego Workera; slot i rozliczenia kończą się dokładnie raz według brokera. Browser terminate nie daje pomiaru RSS/GC: nie deklarować natychmiastowego uwolnienia fizycznego RAM. Pending transport buffers są rozliczane do końca kontrolowanego lifecycle, nie na samym AbortSignal.

Fence = `(projectEpoch, revision, generation, runtime source-slot identity, sourceId+sourceDigest po capture, units='mm', unitsConfirmed=true, frameId, ownerNonce/workerGeneration)`. Przed poznaniem sourceId/digest fence jest związany z autentycznym registry ticket/slotem, nie z caller-provided skrótem. Po capture ticket jest promowany dokładnie raz do nowej pary ID/digest. Późniejsze zależne operacje dodają osobno B ID+digest, C/R identities, recipe ID/version/generation i parametry; nigdy opuszczenie tych pól jako „opcjonalne” obejście.

W `src/hooks/sourceAdmissionState.ts` registry ma synchroniczny `invalidate(reason)`: zwiększa generation **przed** import/Undo/cancel/change units/PCA/register/edit/param changes, wycofuje handles/derived eligibility, odcina eksport starej powłoki jako aktualnej i przerywa transport. Dla przyjętej zmiany podczas pending admission kolejność to invalidate/cancel → staging nowego stanu → commit jego własnej transakcji; obecne `undo()` wracające przy `gate.current.busy` nie jest dowodem tego scenariusza. Test musi naprawdę przyjąć zmianę przez ten sam transition adapter, a nie tylko kliknąć disabled przycisk lub ręcznie zmienić stamp. Undo do identycznych bitów nadal ma nową rewizję/generację. Wszystkie mutacje source slotu są copy-on-write przez tę ścieżkę; żadnych zapisów in-place przez brush/render/legacy. Nie polegać na React state odświeżanym po await.

Konsument sprawdza autentyczność i scope przy dispatch, po każdym await i synchronicznie tuż przed commitem/download. Worker-local kernel ponownie sprawdza token i stamp przy starcie i publikacji wyniku. `checkCurrent` ACK nie jest trwałym zezwoleniem: main musi porównać bieżący stan ponownie po ACK. Żaden sam raport ani przycisk disabled nie jest fence. Sam admission nie zezwala na STL/3MF nowego shellu; bramki C/Q/R/B/recipe nadal muszą istnieć. W tym kroku testowalna blokada eligibility i commit source-audit, nie fikcyjny eksport gotowego shellu.

## 5. Wspólne accounting i ograniczona migracja legacy

### 5.1. Ledger — konkretne reguły

`src/compute/resourceLedger.ts` to pojedyncza authority main realm; Workery dostają nieprzekraczalny plan/alokator arena z tego samego lease, nie własny niezależny cap. Proponowane wartości integratora: jobs 134217728 B, history 134217728 B, managed 402653184 B; **nie zmierzone RSS**. Jobs/history są podzbiorami managed, nie dodatkowymi pulami. Każdy jednocześnie żywy allocation ID liczy się raz globalnie, dodatkowo w odpowiedniej kategorii. Dzielenie immutable bufora przez S/history ma refcount, ale nie zerowy koszt; niezależna kopia ma nowy ID.

Wewnętrzny kontrakt: `reserve(plan) → Lease | refusal`, `lease.allocateBuffer(key, bytes)`, `lease.transfer(key, realm)`, `lease.reclassify(key, category)`, `lease.release(key)`, `lease.close()`. Plan: skończona lista `{key, bytes, category: resident|job|history, owner}`; wszystkie rozmiary safe integer, overflow → refusal. Brak API „najpierw allocate, potem charge”. Dopasować backing byteLength, nie sumę nakładających się view. Arena jest jednym zarezerwowanym ArrayBuffer, widoki nie alokują nowych danych. Rezerwacja całego etapu atomowa; upgrade/reclassification sprawdza wszystkie kategorie **przed** zmianą. Stan transfer-in-flight nie podlega ponownej alokacji ani premature release. Rollback błędu/throw/terminate dokładnie raz. Nie wykorzystywać release retired h1 do zdjęcia rezerwacji pending h2.

Śledzić wszystkie owned payloads: UI corrected source, worker S, C **obu części**, R (view raz, kopia osobno), B i pełne/interpolowane references, provenance/certyfikaty, wire/hash/preimage/audyt, display/slice cache, import decoded/staging buffers, serialization plaintext/base64/encryption/export buffers i Undo. Dla jeszcze nieistniejącego C/B/recipe serializer brak wzoru → **nie uruchamiać tej operacji**, nie rezerwować „0”. To nie blokuje funkcjonalnego admission małego S. Wszystkie tryby używają tego samego managed ledger; nazwy 128/128/384 nie są trzema osobnymi allowancami.

Tekstury/metadane: zachować bity i whole digest M0c3a; przed encoding liczyć UTF-8 bez encoded kopii. Jawny dodatkowy logiczny charge dla każdego owned tekstu `2*UTF16 length`; kopia realm/serializacja osobno, nawet jeśli silnik czasem internuje. To konserwatywny **model payloadu tekstowego**, nie dowód narzutu JS stringów. Małe bounded control records, obiekty Promise/WeakMap/MessageEvent, engine/native crypto/SHA working buffers, JS heap/GC, kod, renderer/GPU nie mają udowodnionego byte bound. Ograniczyć liczbę handles/requests/reports, nie rosnące kolekcje geometrii; osobny pomiar working set/RSS pozostaje otwartą bramką. Nie nazywać sumy ledgeru całą pamięcią procesu. Nie istnieje browser `Worker` heap-limit analogiczny do opcji Node.

Undo: przed jakąkolwiek kopią zarezerwować pełny najnowszy snapshot + bazę/rejestrację/taśmy/recipe i journal allowance. Najnowszego pełnego Undo nie można silently wyciąć dla przejścia capu; odmowa transakcji. Usunięcie starszych historii jest jawną bounded polityką przed reserve, bez mutacji aktywnego projektu przy niepowodzeniu. `makeUndoSnapshot`/`pushUndoHistory` bez ledgeru nie wolno używać w nowym trybie. Gotowy zapis ma nadal cap 128 MiB, encrypted envelope razem z base64/tag/metadanymi; source admission nie implementuje zapisu v3.

### 5.2. Jeden broker i rzeczywista granica migracji

`src/compute/workerPool.ts` zastępuje lokalne `activeWorkers`. Jeden max=2, zero trzeciej puli dla owner/display/index. `WorkerClient` korzysta z brokera przed kopią; retained owner korzysta z dokładnie tego samego brokera, ma affinity i utrzymuje slot. Zajęte dwa sloty → BUSY przed kopią; bez ukrytej kolejki/fallbacku. Max 120 s obejmuje całą generację (kopię/hash/audyt), nie reset na każdym message. Idle owner nie ma arbitralnego timeoutu 120 s; osobny deadline jest dla żądania. Cancel liczy się jako zakończenie lifecycle, nigdy ponowne użycie starego tokenu.

**Finite migration gate, nie udawane pełne accounting legacy:** stary `analyze` zostaje pierwszym zmigrowanym compute operation: arena-audit na jego owned transferze, wynik nadal zwykły report, Worker kończony jak dotąd. Test mieszany: jeden retained owner + jeden real legacy `analyze` przez ten sam broker/ledger. Reszta unbudgeted legacy operations i SliceIndex/display cache nie mogą wykonywać się równolegle z retained session. Wejście w tę sesję wymaga zakończenia/zwolnienia legacy cache, rejestracji istniejących UI/history buffers, i jawnego zablokowania niezmigrowanych dispatches **przed** alokacją; nie force-terminate cudzych aplikacji. Wyjście wycofuje owner i dopiero przywraca legacy mode. Ta blokada to techniczny pion do review, nie kompletna integracja użytkowego CAD; nie należy ukrywać jej jako działającej pełnej funkcji.

Wszystkie entrypoints (`runGeometryTask`, `createWorkerSliceEngine`, `runDisplayTask`, import/Undo/export adapters) muszą sprawdzać mode gate. Brak rejestracji choć jednego aktywnego bufora albo nieogrodzona ścieżka → nie włączać source session. Nie wolno dopuścić starego `executeGeometry`/obiektowego `auditMesh` na głównym wątku z nowego trybu. Istniejący Node-only direct executor pozostaje tylko legacy test path, nie dowód native owner i nie fallback przy błędzie Workera. Migracje pozostałych operacji wymagają własnych allocation plans; są poza następnym małym krokiem. Nie ma obowiązku od razu implementować całego C/shell, ale ich przyszłych alokacji nie wolno omijać.

## 6. Wymagany arena-auditor: układ i dowody do wykonania

Stare Map/Set/BVH nie dają przenośnego byte bound. Dlatego G2 musi dostarczyć **nowy backend** pod rzeczywistym `auditMesh`, a nie uruchomić stary i zadeklarować stały narzut. Opcjonalny internal execution jest branded/uwierzytelniany, tworzony tylko przez worker composition, nie publiczny `privateMesh` hook. Stare dwuargumentowe API zachowuje dotychczasową ścieżkę do czasu oddzielnej migracji; retained path i migrated analyze zawsze wymagają areny, brak areny → UNKNOWN bez fallbacku.

Poniższe count bounds są propozycją layoutu, nie pomiarem ani ukończonym dowodem algorytmu. `a(x)=8*ceil(x/8)`, E=3F, N=2F−1, H=ceil(log2 F) (dla F=1 H=0). Każdy segment align8; preflight oblicza sumę i rezerwuje przed allocation. Bufor fazowy ma rozmiar `max(T,P)`; obie fazy nie żyją naraz. Retain jedynie wynik stałego rozmiaru + do 100 par świadków; dane topologii potrzebne spatial należy policzyć/redukować przed reuse. UI/request/hash/output istnieją niezależnie, nie w ukrytym overlay.

| Faza | Segmenty w bajtach, każdy align8 | Zastosowanie |
|---|---|---|
| T | `12E, 4F, F, 4E, E, 4V, 4V, V` | triplets `(minV,maxV,corner)`; DSU twarzy; flagi degeneracji; twin/adjacency corner; visited corners; head/incidence count V; stan V. |
| P | `24F, 48F, 4F, 48N, 4N, 4N, 4N, 4N, 4(H+2), 8(4H+3), 2048, 128, 800` | normals Float64; bounds F; face order; bounds nodes; left/right/start/count; build stack; para-stack; fixed scalar scratch; fixed counters; 100 par U32. |

T: in-place lexicographic heapsort triplets (bez `Array.sort` i slice), run edge incidence/winding/twin, union twarzy, potem vertex fans po twin i indexed corners. Każdy corner odwiedzić ograniczoną liczbę razy; head/count i corner flags pozwalają wykryć rozłączone wachlarze i isolated V, nie tylko zamknięte krawędzie. Obsługa wadliwych runów/degeneracji nie może zapisać poza areną; fail/unknown zamiast nieograniczonej listy sąsiadów. Fan walk musi mieć twardy cap E, DSU parent chain F, brak rekursji/Map/Set. Osobny test bow-tie vertex i repeated-index triangles.

P: współrzędne/IDs czytać bezpośrednio z S, nie przechowywać kopii 9 doubles na F. Balanced median BVH przez in-place bounded sort podzakresu face order i midpoint split; leaf ≤4 (N=2F−1 konserwatywnie). Iteracyjny DFS. H jest granicą wysokości tej konkretnej balanced konstrukcji, nie dowolnego drzewa. Build stack H+2; para-stack cap 4H+3 wymaga osobnego dowodu dla wybranego self/cross traversal (jedno rozgałęzienie zwiększa stack najwyżej o 2, para-depth najwyżej 2H); test instrumentalny adversarial trees. Overflow stack → UNKNOWN, nigdy realokacja. Wszystkie granice i monotoniczny postęp mają być sprawdzone runtime.

Narrow phase: port istniejących pair predicates do stałego scalar scratch, bez `map/filter/slice`, arrays per pair ani obiektowych triangles. Dwa przekroje triangle-plane ≤6 punktów każdy (konserwatywnie endpoints/crossings), coplanar convex triangle clipping ≤6 różnych wierzchołków; layout przyjmuje cap 16 punktów na polygon i dwa ping-pong bufory, a pozostałe pola muszą zmieścić się w 256 Float64. Należy rozpisać offsety/lifetimes i sprawdzać każdą append; overflow → UNKNOWN. Nie udawać, że sam przydział 2048 B dowodzi poprawności portu. Legalny kontakt wyłącznie na indexed shared simplex; nie zwalniać całych sąsiadujących par. Powierzchnia większa niż simplex, thin coplanar overlap i numeric ambiguity wymagają fail/unknown, nie tolerancyjnego auto-clear.

Zachować policy 200000 V/F, 2000000 narrow pairs, 100 witnesses; broad visits ≤`8*maxPairTests+4F` jak obecnie. Nowe wewnętrzne liczniki mają skończone proponowane limity: topology/fan/DSU steps `32E+16V+16F`; topology heapsort comparisons `8E*(ceil(log2(max(2,E)))+1)`; spatial sort comparisons `16F*(H+1)^2`; node writes/visits przy build `64N`; scalar volume/degeneracy passes `128F`. To konserwatywne **proponowane limity operacyjne**, nie dowód zamortyzowanej złożoności ani zmierzona wydajność; definicja kroku/comparison musi być jednolita i rozliczana bez pominięć. Mają dopuścić małe dodatnie fixtures, a przy wyczerpaniu odmówić nawet poprawnemu modelowi, nie wyłączyć accounting. Deadline sprawdzany w pętlach (nie tylko przy await). Wynik cap/time/numeric unresolved → complete=false, UNKNOWN i brak tokenu. Volume: translation-relative compensated sum i finite checks, tolerance jak istniejący audit; brak domniemania exact sign przy near-zero.

### Arytmetyka z zachowanej inwentaryzacji

S buffer bytes `D = 12V + 12F + (RGB?12V:0) + (UV?8V:0)`. Digest preimage `J` dokładnie według `source-candidate.ts:143–168`: domain+wersja+liczności+wszystkie raw words/flags+UTF-8 metadane/mm/frame. Dla nazwy `S`, frame `frame-1`, bez tekstury: `J=D+66`. Domain ma 27 B. Epoka/revision/runtime sourceId porównywane osobno, nie zmiana dotychczasowego canonical digest.

| V,F / attrs | D | J | stary capture D+J | T | P=max(T,P) | D+arena |
|---|---:|---:|---:|---:|---:|---:|
| 4,4 / none | 96 | 162 | 258 | 272 | 3848 | 3944 |
| 200000,200000 / none | 4800000 | 4800066 | 9600066 | 13000000 | 40803608 | 45603608 |
| 200000,200000 / RGB+UV | 8800000 | 8800066 | 17600066 | 13000000 | 40803608 | 49603608 |

To dokładne sumy **proponowanych segmentów**, nie working set obecnego audytu. Najprostszy bezpieczny początkowy plan rezerwuje jednocześnie D+J+arena+32 B hash output+bounded wire/report/metadata. Można reuse J po rzeczywistym zakończeniu SHA dopiero w oddzielnie sprawdzonym lease transition; nie wymagamy takiej optymalizacji na start. UI oryginał, historia, drugi Worker i przyszłe C/B są dodatkowymi jednoczesnymi danymi. Tabela nie jest obietnicą obsługi każdego modelu o 200k ani limitu RSS.

## 7. Granice plików i pionowe bramki RED→GREEN

Poniższe ścieżki to **przyszła własność implementacji**, teraz nie powstają. Kolejność G1→G2→G3→G4 jest obowiązkowa; żaden wcześniejszy PASS nie oznacza end-to-end admission. Każdy wiersz rozbić na małe oddzielne testy/commity w przyszłej implementacji; w tej pracy bez stage/commit.

| Gate / pliki | Pierwszy behawioralny RED → minimalny GREEN i kryteria |
|---|---|
| **G1a ledger primitive** `src/compute/resourceLedger.ts`, `tests/v03-resource-ledger.test.ts` | Alokator spy: reserve limit+1 musi odmówić **przed** pierwszą alokacją; limit dokładny przechodzi. Transfer/refcount/reclassify/rollback i retired h1/pending h2; shared view raz, kopia dwa razy; managed/job/history jednocześnie. Bez pozytywnego testu real ArrayBuffer nie zamykać bramki. |
| **G1b broker + legacy entry fence** `src/compute/workerPool.ts`; zmiany `client.ts`, `index.ts`, `copy.ts`, `sliceEngine.ts`, `src/hooks/runDisplayTask.ts`; `tests/v03-worker-pool.test.ts` | Dwa rzeczywiste Worker slots occupied → trzecie żądanie BUSY bez kopii. Cancel/error/deadline zwalnia raz; live idle owner nadal zajmuje slot. Public dispatch bez lease lub niedozwolony source-session op odmawia przed allocation. Bez hidden main-thread fallback. Ten krok jeszcze bez tokenu audited. |
| **G2a topology arena** `src/geometry/internal/auditArena.ts`, `auditTopologyArena.ts`; `tests/v03-audit-arena-topology.test.ts` | Dodatni zamknięty outward tetra i subdivided tetra; hole/duplicate/reverse/repeated index/isolated V/two components/bow-tie fans nie przechodzą. Exact fixture oracle niezależnie potwierdza wyniki. Nie zaliczać edge-manifold jako vertex-manifold. Instrumentować arena high-water i work caps. |
| **G2b spatial + entry** `auditSpatialArena.ts`; zmiany `src/geometry/audit.ts`; `tests/v03-audit-arena.test.ts` | Dodatni model musi mieć complete, outward, finite positive volume i osiem PASS przy thickness UNKNOWN. Real przecięcie → FAIL; pairs=0 → UNKNOWN (wyłącznie test backendu); coplanar/thin/near-zero/stack/work/deadline → jawne bounded wyniki. Porównać stare i nowe poprawne zachowania, ale exact kontrprzykład ma pierwszeństwo nad starym błędem. Brak alokacji O(V/F) poza areną; nie resetować liczników w podprocedurach. |
| **G2c migrated analyze** zmiany `src/compute/service.ts`, `execute.ts`, `protocol.ts`; `tests/v03-budgeted-analyze.test.ts` | Real stary analyze uruchamia ten sam auditMesh z areną i zwraca report bez tokenu. Payload + audit + reply charge przed kopiami. Brak areny przy source mode → UNKNOWN, bez fallbacku. Dotychczasowe regresje nadal obowiązują. |
| **G3a private extraction** `src/trimline/internal/owned-source.ts`; zmiana `source-candidate.ts`; `tests/v03-owned-source-regression.test.ts` | Zachować native/Python whole SHA i ordered raw face bits M0c3a, -0/subviews/attrs, caller mutation, pending SHA dispose; zero publicznego private-buffer hooka. Audit/resolver używają jednego record bez nowego S-copy. |
| **G3b real retained owner** `src/compute/sourceProtocol.ts`, `sourceOwner.ts`; zmiany `worker.ts`, `service.ts`; `src/trimline/source-admission.ts`; `tests/v03-source-admission.test.ts` | Świeży full audit pozytywnego S daje autentyczny token, real worker checkCurrent działa po zakończeniu admit; stary analizator zakończonego zadania nie może go udawać. Distant invalid-S + recomputed digest + stale PASS odrzucone; missing/duplicate/unknown check IDs testować osobno predicate, ale native negatywy muszą używać rzeczywistego audit. Clone/foreign/retired/JSON handles odrzucane; release/dispose/worker loss/deadline/hash rejection nigdy nie publikują późnego handle. |
| **G4 registry i consumers** `src/hooks/sourceAdmissionState.ts`; zmiany `src/App.tsx`, `workbenchState.ts`; `tests/v03-source-admission-fence.test.ts`, `e2e/v03-source-admission.spec.ts` | Registry bierze pełny pre-cut slot, nie B/R. Zatrzymać prawdziwą odpowiedź po real audycie; wykonać osobno import, Undo nawet same bits, units, frame/register/PCA, source edit, params change, cancel. Zwolnić reply → brak commit, bieżącego handle i eligibility eksportu; aktywny nowy projekt bez zmian. Dodatni niezmieniony scope pozwala commit. Test mixed owner+legacy analyze max=2 i dodatkowe display/index blocked przed kopią. |

### Wykonywalne przyszłe komendy, nie wyniki tej pracy

Z repo `C:/Users/sandr/OrthoSculptCAD`, dla osobnych powyższych plików testowych:

```bash
npx vitest run tests/v03-resource-ledger.test.ts tests/v03-worker-pool.test.ts
npx vitest run tests/v03-audit-arena-topology.test.ts tests/v03-audit-arena.test.ts tests/v03-budgeted-analyze.test.ts
npx vitest run tests/v03-owned-source-regression.test.ts tests/v03-source-admission.test.ts tests/v03-source-admission-fence.test.ts
npx playwright test e2e/v03-source-admission.spec.ts
npx tsc --noEmit
```

Oczekiwane przyszłe GREEN: zero FAIL/skip, native Worker tests rzeczywiście uruchomione; liczby wyłącznie z kompletnego rzeczywistego przebiegu. Po integracji pełne `npm test` z dotychczasowymi real Worker/PDF i oddzielne Python regresje M0c3a według istniejących poleceń; nie wymyślać ich liczby. Nie budować frozen dist dla tego kroku. Błąd narzędzia/resource to jawny blocker, nie zwolnienie testu/obniżenie asercji.

Native browser tests uruchamiają produkcyjny moduł Workera przez izolowany dev/test server, nie mock/Node direct executor. Test-only harness może **wstrzymać dostarczenie otrzymanej rzeczywistej odpowiedzi** w transport adapterze przed publication; bez podmiany wyniku lub przyjęcia zewnętrznego raportu. Dodatkowy lifecycle test wstrzymuje rzeczywistego Workera po audycie przed postMessage przez test entry, nie przez produkcyjne publiczne API. Sprawdzić też cancel w real CPU loop (terminate), pending SHA i utratę transportu. Native WebView/IPC/EXE nie są tu zaliczane przez Chromium.

## 8. Małe niezależne fixtures, zdalna wada i próby zasobów

Fixture oracle: `tests/reference/v03_source_admission_oracle.py` i jego unittest (przyszłe). Python Fraction z ręcznym decode Float32 sign/exponent/significand, bez produkcyjnego topology/BVH i bez `float(Fraction)` do rozstrzygnięć. Dla małych syntetycznych modeli: słownik unoriented edge→directed uses, osobny graf linków każdego V, BFS komponentów, exact signed volume przez determinanty. Enumerować wszystkie małe pary triangle/triangle exact: orient3d, przekroje płaszczyzn i exact intervals, coplanar rzut przez niezerowy minor; porównać cały intersection z dozwolonym indexed simplex, nie tylko endpoints. To niezależny verifier konkretnych fixtures, nie runtime general exact auditor ani dowód izotopii.

1. Jednostkowy outward tetra: V=(0,0,0),(1,0,0),(0,1,0),(0,0,1), faces `(0,2,1),(0,1,3),(0,3,2),(1,2,3)`, exact volume=1/6. Wariant S różny od raw i B przez jawne całkowite skale/przesunięcia. Attributes RGB/UV i -0 w osobnych bitowych fixtures, nie zmianie oracle geometrii.
2. Subdivide wszystkie F przez rational dyadic midpoints (jedna indexed kopia wspólnej E) → closed full mesh z zachowaną lokalną wybraną F. Następnie osobne mutanty poza tą F i jej V/attrs: remove face, duplicate face, lub wstawić nieincydentne przecinające się trójkąty/zmienić odległą geometrię. Oracle dokumentuje, czy mutant ma również inne wady; nie twierdzić, że intersection jest jedyną przyczyną odmowy. Dla testu wyłącznie spatial użyć pary analitycznej: A=(-2,-2,0),(2,-2,0),(0,2,0); B=(0,-1,-1),(0,-1,1),(0,1,0), rozłączne IDs; ich niezerowy odcinek przecięcia na z=0 jest świadkiem niedozwolonego kontaktu.
3. Dla każdego mutant: zachowane ordered local face raw bits, świeżo obliczony canonical whole digest, dopisany stary/fake saved PASS. Fresh owner audit ma odmówić. Pozytywny candidate binding może nadal przejść — to celowy dowód rozdzielenia candidate/admission, nie luka. Przyjęcie zmienionego, ale geometrycznie poprawnego S po pełnym nowym audycie jest poprawne; digest bez zewnętrznego podpisu nie ma wykrywać wszystkich zmian jako fałszerstwa.
4. UNKNOWN musi być wykonane realnie: maxPairTests=0 dla tetra w prywatnym backend teście, near-zero volume/numeric ambiguity, arena/work cap, allocation failure/worker unavailable. Produkcyjne fixed policy nie udostępnia caller override. Dodatnia fixture przy zwykłych capach obowiązkowa — system „wszystko UNKNOWN” nie spełnia G2/G3.
5. Zasoby: dokładny limit i +1, dwie równoległe generacje, refused copy bez alokacji, source+UI+arena+preimage, B/history równocześnie, phantom R view kontra prawdziwa kopia, obie części C/provenance jako **syntetyczne allocation manifests**, serialization/import/Undo. Manifest test sprawdza ledger, nie dowodzi gotowego C/reload/shell. Source native path musi potwierdzić real allocation IDs przed copy i brak podwójnego zwolnienia po detach/cancel. Metadata/texture długość i signed safe arithmetic też przed allocation.

Nie przechowywać realnych skanów ani współrzędnych w logach. Raporty fixture są syntetyczne. JSON nigdy nie przywraca tokenu: reload musi zacząć od nowego ticket, full audit S i rebinding, a przyszłe v3 odtworzyć i skontrolować OBA podziały/provenance/C/Q/B/references przed instalacją. Skażenie wyłącznie discarded z recomputed digest blokuje v3; source-admission nie udaje sprawdzenia niezaimplementowanych konstrukcji.

## 9. Co można wdrażać dalej; co pozostaje zablokowane

**Bez dalszej decyzji produktowej, po niezależnym review tego projektu:** G1a, potem G1b. Ich dostawą jest ledger/broker, nie publiczny AuditedSource. Następnie G2a→G2b→G2c; dodatnie/negatywne/UNKNOWN fixtures, zgodność z poprawnym starym zachowaniem i niezależny oracle to bramka do G3. G3 tworzy realne funkcjonalne source admission wyłącznie w izolowanej source session. Dopiero G4 pozwala podpiąć je do source slotu i consumer fences. Nie dopuścić API audited tokenu przed zamknięciem accounting+arena+nativeowner.

**Otwarte dowody techniczne przed GREEN:** konkretne offsety scratch i brak ukrytych O(V/F) JS allocation; twin/fan correctness przy degeneracji; stack i work bounds balanced BVH; konserwatywność numerycznych predicates/near-touch; resource ownership przy terminate/SHA/transfer; kompletność wszystkich App mutation/dispatch/export entry fences. Static sumy nie dowodzą tych własności. Przenośny limit RSS/working-set/GPU nie jest zapewniony; pomiary i odmowy operacyjne pozostają obowiązkowe, bez podnoszenia caps i bez deklaracji browser heap-limit.

Najbliższy mikro-pion **G1a** ma zamrożony pierwszy scenariusz: świeży ledger z limitami testowymi managed=1024/job=768/history=512 B; reserve job 768 B → rzeczywisty ArrayBuffer 768 B; reserve resident 257 B → refusal przed allocator call; resident 256 B → sukces. Następnie retain/view tego samego backing store nie powiększa managed, ale próba niezależnej kopii 1 B przy managed=1024 odmawia. Close obu lease daje zero, ponowne close nie zmienia licznika; foreign lease odrzucany. To limity wyłącznie fixture, nie zmiana polityki 128/128/384 MiB. Osobny test przeniesienia istniejącego job buffer do history musi odmówić przed reclassification, jeśli przekracza 512 B, zachowując poprzedni stan. Pierwszy RED ma wykazać dopuszczoną alokację ponad rezerwację albo błędne podwójne liczenie/release, nie brak modułu; scaffold może deklarować API i odmawiać, ale nie realizować zachowania przed testem.

**Nadal poza tym krokiem / blokują zależny produkt:** globalne smooth seams/route/fans/regularność, exact arrangements obu części, C/Q i osadzenie bliskich płatów, B/references/provenance pełnego v3, strona względem całego C, shell+kołnierz/refinement, v3 serializers/crypto/Undo pełnej transakcji, real STL/3MF roundtrip i kliniczny/native EXE odbiór. Nie oznaczać ich PASS z samego admission, tuple fence ani manifestu pamięci. Nie włączać niezmigrowanych legacy geometrii równolegle z retained owner.

## 10. Faktycznie wykonana weryfikacja tego dokumentu

Odczytano wskazane dokumenty i rzeczywiste API; ponownie użyto historycznych, niezmienionych plików `design_inventory.py`, `inventory-and-arithmetic.json`, `design-inventory.log` w Hermes scratch `v03-source-admission-design/`. W tej pracy powstał wyłącznie ten plan w repo oraz nowe pliki w jego własnym scratch. **Nie wykonano testów implementacji admission, benchmarku ani pomiaru RSS.**

Własny ograniczony świadek (wykonany przed informacją o równoległym eksperymencie cube) zakończył się exit0:

```bash
python C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-source-admission-design/owner-design/verify_design.py "$(git rev-parse HEAD)" "$(git status --short)" > C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-source-admission-design/owner-design/witness-success.log
```

`witness-results.json` potwierdza zgodność wszystkich trzech layoutów z zachowaną inwentaryzacją; tetra V4/F4/E6 i subdivided tetra V10/F16/E24 mają exact volume 1/6, jeden komponent i zamknięte links; distant hole ma trzy boundary edges, duplicate trzy nonmanifold edges przy niezmienionej/disjoint lokalnej ścianie. Fraction potwierdził analityczny odcinek przecięcia z §8, osobne raw/S/B volumes i sumę budżetów 1/50 mm. Skończona kontrola dziewięciu abstrakcyjnych balanced trees mieściła się w proponowanym capie stack; **nie jest dowodem future traversal**. To świadki matematyczne, nie uruchomienie produkcyjnego audytu/tokenów. Nie duplikowano później równoległego cube eksperymentu i nie czytano jego inflight artefaktów; niezależny odbiór tych wyników należy do rodzica.

Pierwsza próba tego skryptu doszła do odczytu Git przez Python subprocess i zakończyła się `PermissionError/WinError 5`; bez zmiany systemu poprawiono ją przez przekazanie rzeczywistych wyników Git z dozwolonego Git Bash jako argumentów. Udany run nie nadpisuje historycznej trójki inwentaryzacji. Końcowy hash planu i kontrola scope są w nowym scratch `owner-design/artifact-verification.json`, poza samohashującym dokumentem. Brak zmian src/tests/pozostałych docs/config/skills/profiles, deps, git add/commit/reset/stash; końcowe Git status ma wskazywać wyłącznie ten nowy plan, tracked i staged diff puste. To zakończenie projektu do świeżego review, nie faux end-to-end PASS.
