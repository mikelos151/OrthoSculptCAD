# M0c3 — niezmienne pełne S, source-bound candidate i wykonalność seams

**Status: projekt, bez implementacji i bez odbioru funkcji.** Punkt odniesienia odczytany z Git: `feature/trimline-v03`, HEAD `bd9faa6b10945ea30ed6711ae5d180e66d9ea4f9`, początkowo czysty worktree. M0a/b, M0c1 i M0c2 pozostają odebranym rdzeniem; ten dokument nie cofa ich statusu. Pierwszeństwo: `trimline-v03-integrated-design.md`, następnie plan M0 i `v03-face-cubic-containment.md` §§8–9.

## 1. Decyzja i granica najbliższego kroku

**Wybrać M0c3a: mały, niepodłączony do App magazyn owned pełnego kandydata S + resolver konkretnej ściany + konstruktor powiązanego cubica. Równolegle zamknąć niżej opisany proof-spike seams, zanim powstanie wielościanowy curve builder.** Wynik nazywa się `SourceCandidate` / `CandidateBoundSpan`, nie `AuditedSource`, `VerifiedSource` ani gotowy trimline. Prawdziwe powiązanie bitowe jest użyteczne, ale nie dostarcza brakującego admission.

Rozważono trzy warianty:

1. **Wybrany:** owned candidate, exact binding i jawnie zablokowane admission produktowe. Mały krok; można niezależnie sprawdzić bity, kolejność i containment bez przebudowy workbench.
2. Pełne audit-admission + trwały Worker-owned source + wspólny ledger/fences od razu. Docelowo konieczne, lecz obecne API nie zapewnia całego kontraktu; rozszerzenie teraz mieszałoby kilka bramek M0 i pracę UI/Worker przed dowodem seams.
3. `createVerifiedSource(mesh, report)` albo etykieta `sourceFace` przy istniejącym certyfikacie. **Odrzucone:** dowolny zapisany PASS/hash i dowolna mutable tablica mogłyby podszyć się pod dowód.

S oznacza **cały skorygowany model bezpośrednio przed cut**, nie raw import, B, retained R ani konstrukcję C. Sam `MeshData` nie mówi, na którym etapie geometrii powstał; żaden string `role: S` tego nie dowodzi. Dopiero przyszły adapter musi pobrać autorytatywne pełne S z bieżącej transakcji przed cut. M0c3a wiąże dokładnie przekazany pełny kandydat i nie udaje dowodu, że caller przekazał właściwy etap lub nie uciął odległej części.

Zakres produktowy bez zmiany: gładka linia 3D przez wnętrza ścian, niepłaski cut/shell, zewnętrzny kołnierz; lokalny browser/lab TT, bez kont/chmury/telemetrii/uploadu pacjentów; STL/3MF do CAM, nie sterowanie CNC. C0, edge-only ani brak powłoki nie są wariantem zastępczym.

## 2. Rzeczywiste API repo i wynikające ograniczenia

| Odczytany kod | Co istnieje / czego nie wolno mu dopisać w opisie |
|---|---|
| `src/types.ts:1–4` | `MeshData` ma mutable `Float32Array positions`, `Uint32Array indices`, opcjonalne RGB/UV/teksturę, name/source. Nie ma source epoch, pełności S ani immutable lease. Komentarz o mm nie potwierdza jednostek importu. |
| `src/geometry/core.ts:5–44` | `assertMesh` sprawdza strukturę/finite/zakres; `copyMesh` kopiuje bufory, lecz nie rezerwuje RAM ani nie zamyka dostępu do nich. Cap strukturalny 2 mln V / 4 mln F nie jest capem audytu. |
| `src/geometry/audit.ts:7–69`, `auditTypes.ts:3–14` | Rzeczywiste `auditMesh(mesh, options): MeshAudit`; pełny raport, nie autentykowany token. Audyt ma cap **200 000 V i F**, pary domyślnie 2 mln, maksymalnie 10 mln; outward wymaga zamkniętej jednej powierzchni, poprawnych fans/winding, braku degeneracji/przecięć i rozstrzygniętego znaku objętości. |
| `src/geometry/intersections.ts:11–76,80–123` | BVH i bounded testy; istnieją obliczenia Number, normalizacja i tolerancje, możliwe UNKNOWN. `complete` jest kompletnością tego audytu, nie exact-rational dowodem geometrii. Nie powstaje tu nowy exact certyfikat S. |
| `src/workspace/index.ts:5–13`, `workspace/types.ts:31–40` | `fingerprintMesh` = SHA-256 liczności+pozycji+indeksów w LE. Nie obejmuje attrs, jednostek, frame, baseline, recipe; nie zmieniać jego znaczenia. Workspace revision jest rewizją dziennika, nie nowym snapshot ID/digest. |
| `src/compute/{types.ts:3–18,execute.ts:14}` | Operacja `analyze` faktycznie wywołuje `auditMesh`. Nie ma `admitSource`, trwałego magazynu S ani resolvera audited face. |
| `src/compute/{copy.ts:16–53,index.ts:10–27,client.ts:4–25}` | Istnieje bounded kopia/transfer, cap 128 MiB **pojedynczego** payloadu, rezerwacja slotu przed kopią, max 2 Workery; Node/test-only direct executor. To nie całościowy ledger RAM. |
| `src/compute/{service.ts:6–35,protocol.ts:4–9}` | Worker ma jedynie cache SliceIndex i id/generation odpowiedzi; wynik audytu nie pozostawia źródła jako opaque handle do późniejszego bindingu. |
| `src/hooks/workbenchState.ts:40–85`, `src/App.tsx:181–201,255,322–328,403–415` | Istnieją stroke fence epoch/revision/mesh/unit i task generation oraz `auditedMesh === mesh`. Nie ma kompletnego fence źródła nowej funkcji; tożsamość mutable obiektu nie chroni przed zmianą jego bufora in-place. |
| `src/trimline/{numerics.ts:167–189,face-cubic.ts:51–94,bezier.ts:102–142}` | Publiczne `fromFloat32Bits`, `certifyFaceCubic`, `sampleCubic`; autentyczne Rational i wspólny ctx. To reuse bez zmian ich API. |

`qualitySummary` z `workbenchState.ts:25–29` wymaga także minimum-thickness, które `auditMesh` jawnie zostawia UNKNOWN. Nie używać tej funkcji jako source-admission ani słabszego `normalsUsable` jako pełnego audytu.

## 3. Zamrożone API M0c3a — tylko nowy moduł, bez adaptera

Przyszła własność implementera: `src/trimline/source-candidate.ts` i jego nowe focused testy. Bez edycji starych modułów. Poniższe nazwy są literalnym kontraktem, a nie deklaracją istniejących API:

```ts
import type { MeshData } from '../types';
import type { ArithmeticContext } from './numerics';
import type { ExactTriangle3, CubicBarycentricControls,
  FaceCubicContainment } from './face-cubic';

declare const sourceCandidateBrand: unique symbol;
export interface SourceCandidate { readonly [sourceCandidateBrand]: true }
export interface SourceStamp {
  readonly projectEpoch: number;
  readonly revision: number;
  readonly generation: number;
  readonly units: 'mm';
  readonly unitsConfirmed: true;
  readonly frameId: string;
}
export interface SourceCandidateLimits { readonly maxOwnedBufferBytes: number }
export interface SourceDescription {
  readonly kind: 'owned-source-candidate-v1';
  readonly sourceId: string;
  readonly sourceDigest: string;
  readonly stamp: SourceStamp;
  readonly vertexCount: number;
  readonly faceCount: number;
}
export type VertexIDs = readonly [number, number, number];
export type PositionBits = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number]
];
export interface ResolvedCandidateFace {
  readonly source: SourceDescription;
  readonly sourceFace: number;
  readonly vertexIDs: VertexIDs;
  readonly positionBits: PositionBits;
  readonly triangle: ExactTriangle3;
}
export interface CandidateBoundSpan {
  readonly kind: 'candidate-source-face-cubic-v1';
  readonly face: ResolvedCandidateFace;
  readonly containment: FaceCubicContainment;
}
export interface SourceCandidateStore {
  capture(mesh: MeshData, stamp: SourceStamp): Promise<SourceCandidate>;
  describe(source: SourceCandidate): SourceDescription;
  resolveFace(source: SourceCandidate, sourceFace: number,
    ctx: ArithmeticContext): ResolvedCandidateFace;
  bindFaceCubic(source: SourceCandidate, sourceFace: number,
    controls: CubicBarycentricControls, ctx: ArithmeticContext): CandidateBoundSpan;
  release(source: SourceCandidate): void;
  dispose(): void;
}
export function createSourceCandidateStore(
  limits: SourceCandidateLimits
): SourceCandidateStore;
export class SourceCandidateError extends Error {
  constructor(code: SourceCandidateError['code']);
  readonly code: 'INVALID_INPUT' | 'BUDGET_EXCEEDED' |
    'SOURCE_IN_USE' | 'STALE_SOURCE' | 'UNAVAILABLE';
}
```

- Store jest opaque runtime authority przez prywatną mapę; pusty frozen handle nie zawiera buforów. Brand TS nie jest zabezpieczeniem sam w sobie. `sourceId` to wygenerowany, niepowtarzalny w runtime identyfikator snapshotu, nigdy caller-provided tożsamość. JSON/structuredClone handle nie odtwarza authority. Autentyczność wycofanych handle przechowywać słabo (weak bookkeeping), bez silnego zachowania S lub jego buforów.
- Jeden żywy lub przechwytywany source na store. Po udanym capture `release(h1)` wycofuje h1 i zwalnia własność S oraz jego rezerwację; kolejne release autentycznego wycofanego h1 jest no-op, także po dispose. Release najpierw uwierzytelnia handle: forged/foreign → INVALID_INPUT, również po dispose. Stare release nie wpływa na inny pending capture, jego preimage ani rezerwację. `dispose` jest idempotentne, zamyka store i wycofuje żywe handle; nie rozpoczyna się żaden nowy capture. Dla pending SHA dispose unieważnia capture: Promise odrzuca STALE_SOURCE i nigdy nie publikuje handle, także gdy SHA równocześnie odrzuci. Dispose nie anuluje WebCrypto; pending preimage, owned buffers i ich rezerwacje są zwalniane/wycofywane dokładnie raz po rzeczywistym zakończeniu wewnętrznego SHA, które może nadal trzymać bufor. Nie obiecuje to zwolnienia RAM ani GC przed tym zakończeniem.
- Stamp ma własne frozen dane. Epoch/revision/generation: nieujemne safe integers, bez coercion. `frameId`: ASCII `[A-Za-z0-9_-]`, 1..64 znaków, nowa tożsamość po zmianie rejestracji/PCA. Przekazane mm/frame to deklaracja konfiguracji candidate, nie dowód pomiaru/rejestracji. Przyszły adapter ma je wystawić z autorytatywnego stanu, nie z niezaufanego pliku.
- Każdy wynik, wszystkie tuple, description/stamp, binding i containment głęboko frozen; nigdzie publiczny TypedArray/ArrayBuffer/DataView ani prywatny `MeshData`. Nie wystarczy `readonly` lub zamrożenie obiektu otaczającego mutable TypedArray. Caller może dalej modyfikować własny mesh bez zmiany snapshotu.
- `sourceFace` to **numer trójkąta**, nie offset indeksów: IDs dokładnie `indices[3*f + 0..2]`, bez sortowania/rotacji. `positionBits[j][axis]` to raw uint32 F32 wskazanego V z tej konkretnej ściany. Zachować -0; Rational ma 0/1, więc nie odtwarza znaku zera.
- `resolveFace`: uwierzytelnij handle, sprawdź f jako number/integer/range przed odczytem, pobierz IDs i bity z private S, każdą z 9 wartości dekoduj **publicznym `fromFloat32Bits(bits,ctx)`**. Nie przechodź przez Number → rational, projekcję lub najbliższą ścianę.
- `bindFaceCubic`: wywołuje powyższy resolver i `certifyFaceCubic(face.triangle,controls,ctx)`, **ten sam ctx**. Trójkąt wyniku musi być exact równy temu konkretnemu resolved S, z tym samym orderingiem wag. Nie przyjmuje dostarczonego certyfikatu lub dowolnego triangle jako „już sprawdzonego”.
- Certyfikat saved/reload w przyszłości: oddzielnie sprawdzić ID/order/raw bits oraz exact równość każdego triangle scalar z dekodowanymi bitami; następnie ponownie wykonać containment/mapowanie i porównać controls. Równość geometryczna innego płata, najbliższy trójkąt ani równoważna permutacja bez przestawienia wag nie wystarcza. Legalne -0/+0 mają ten sam Rational, ale różne raw bits.

### Preflight, koszty i błędy

1. Stałe wymagane pola odczytać jako own data descriptors bez getterów; zwykłe tablice macierzy/controls dense i własne indeksy jak M0c2. Nie obiecywać izolacji executable Proxy. Wejście z pliku to dane, nie JS sandbox.
2. Capture przyjmuje wyłącznie zwykłe fixed, niedetached ArrayBuffer-backed F32/U32 views; odrzucić SharedArrayBuffer, resizable buffer i exotic/subclass views. Do sprawdzenia typu, właściwych rozmiarów, backing buffer i byteOffset oraz kopiowania właściwego zakresu bajtów użyć przechwyconych intrinsic accessorów TypedArray/ArrayBuffer, nie caller-overridden `length`, `buffer`, `slice` ani iteratora. Liczności całkowite: 3..200000 V, 1..200000 F, stride 3; attrs stride RGB3/UV2. Sprawdzić bez pełnej kopii wszystkie wymagane rozmiary, bounded metadata i wynik byte arithmetic jako safe integer. Zero nieograniczonych iteracji po dodatkowych polach.
3. **Przed alokacją** zarezerwować w store sumę nowych owned buforów S oraz pełnego preimage SHA-256; rezerwacja obu naraz, nie per tablica. Długość UTF-8 policzyć bez tymczasowej, niezarezerwowanej encoded kopii tekstury; ewentualne kodowanie `encodeInto` wykonać bezpośrednio do zarezerwowanego preimage. Limit `maxOwnedBufferBytes` jest dodatnim safe integer ≤128 MiB. Capture ma blokadę od początku preflight aż do końca hash. Ten limit nazywa się buffer-bytes celowo: nie jest całym RAM aplikacji ani gwarancją RSS WebCrypto/JS.
4. S kopiować bitowo synchronicznie przed pierwszym await; ordinary ArrayBuffer w tym realm nie może zmieniać się między częściami przez event loop. Kopiować dokładnie view range, nie cały backing buffer. Source snapshot nie zachowuje aliasu do caller buffers. Po alokacji walidować prywatny snapshot: finite wszystkie pozycje/attrs, IDs < V, RGB w [0,1], poprawne metadane/tekstura według `src/io/validation.ts`; błąd niczego nie publikuje. Alokacji/kopiowania nie wykonywać dla wadliwego rozmiaru lub braku rezerwacji.
5. Po rzeczywistym zakończeniu SHA ponownie sprawdzić disposed przed publikacją. Przy sukcesie otwartego store zwolnić preimage i jego rezerwację, zachować S i jego rezerwację do release/dispose. Przy błędzie albo pending dispose nie publikować handle; wycofać referencje do preimage/owned buffers i rezerwacje dokładnie raz, po zakończeniu wewnętrznego SHA, jeśli zostało uruchomione. Pending dispose ma pierwszeństwo STALE_SOURCE także przed odmową SHA. To nie obietnica natychmiastowego GC lub anulowania wewnętrznego WebCrypto.

Dla JSON/raw-number importu **wcześniejszy parser** musi sprawdzać dense/type/finite/integer/uint32/range i capy **przed** `new Uint32Array` / `new Float32Array`: -1, ułamek, >uint32 i NaN nie mogą zostać „naprawione” coercion. Typed `MeshData` nie pozwala odzyskać już utraconego oryginalnego ułamkowego indeksu. Nowy resolver nie zastępuje tej bramki pliku.

`SourceCandidateError.name = 'SourceCandidateError'`, message=code, bez współrzędnych/id/ścieżek. Kolejność i pierwszeństwo odmów:

| Operacja | Reguła |
|---|---|
| `capture` | Closed → STALE_SOURCE przed wejściem/getterami; inaczej live lub pending → SOURCE_IN_USE przed inspekcją wejścia. Następnie shape/caps → rezerwacja → owned copy/validation → hash → ponowne sprawdzenie dispose → publikacja. |
| `describe`, `resolveFace`, `bindFaceCubic` | Closed → STALE_SOURCE; w open najpierw uwierzytelnienie: forged/foreign → INVALID_INPUT, retired → STALE_SOURCE; dopiero potem pozostałe argumenty. Binding: f → decode → containment. |
| `release` | Najpierw uwierzytelnienie, także po dispose: forged/foreign → INVALID_INPUT; autentyczny retired → no-op; live → wycofanie i zwolnienie S. Nie dotyka innego pending capture. |
| `dispose` | Idempotentne zamknięcie i unieważnienie; pending SHA kończy się bez handle z STALE_SOURCE, a cleanup następuje po rzeczywistym zakończeniu SHA. |

`NumericsError` i `FaceCubicError` przechodzą niezmienione; budżet arytmetyczny nie resetuje się i oznacza UNKNOWN. Nie obiecywać uniwersalnej kolejności pozostałych błędów przy niedostatecznym budżecie ctx. Błąd budżetu store też oznacza UNKNOWN, nie dowód wadliwej geometrii. STALE_SOURCE/SOURCE_IN_USE są odmową transakcji, nie geometrycznym FAIL. Bez częściowego sukcesu/callbacku controls. OOM/hash failure → `UNAVAILABLE` (odmowa/UNKNOWN), z wyjątkiem powyższego pierwszeństwa pending dispose, bez arbitralnego echo wyjątku; nie zamieniać nieoczekiwanego błędu w geometryczny PASS.

## 4. Digest snapshotu — pełna zawartość, nie podpis ani admission

Nie zmieniać `fingerprintMesh`. Nowy `sourceDigest` ma postać `sha256:<64 lowercase hex>` i osobną domenę. Jego canonical preimage jest następujący, bez paddingu:

- ASCII `OrthoSculptSourceCandidate`, potem bajt NUL, uint32 LE wersja=1.
- `vertexCount`, `faceCount`: uint32 LE; potem wszystkie `positions` jako raw uint32 LE w kolejności xyz, wszystkie `indices` jako uint32 LE w kolejności źródła.
- `colors`, potem `uvs`: presence uint8 0/1, przy 1 wszystkie raw uint32 LE (liczności wyznaczone przez V×stride).
- `source`: uint8 0=absent, 1=synthetic, 2=imported; `name`: długość uint32 LE UTF-8, potem bajty; `textureUrl`: presence uint8 i, przy 1, tak samo długość+bajty całego osadzonego URI.
- UTF-8 pole `units` z długością uint32 LE (wyłącznie `mm`), uint8 potwierdzenia=1, pole `frameId` tym samym encodingiem długość+bajty.

Epoch/revision/generation i runtime sourceId są porównywane osobno, nie uznawane za stan geometryczny. Zmiana wyłącznie odległego V/indeksu/atrybutu też zmienia preimage; sourceFace-local hash byłby błędem. Nie jest to jeszcze pełny digest projektu v3: B, C, provenance i recipe mają późniejszy osobny kontrakt. Także nazwa/tekstura zostają lokalne, nie do diagnostyki.

Recomputed digest zmienionego pliku nie wykrywa fałszerstwa sam przez się. Runtime zna private źródło i handle; ponownie wczytany plik nie ma takiego trust root. Poprawna geometrycznie zmiana całego S wraz ze spójnymi dowodami/digestem jest innym kandydatem, nie wykrywalnym „fałszerstwem” bez zewnętrznego uwierzytelnienia. Wada geometrii odległego S musi być wykryta **świeżym pełnym audytem**, nie porównaniem zapisanego PASS.

## 5. Obowiązkowe real audit-admission — osobna, obecnie zablokowana bramka

**M0c3a nie ma eksportu `admit`, nie zwraca `audited: true` i nie wolno podłączyć jego handle do cut/shell/export.** To świadome ograniczenie kroku, nie usunięcie wymogu audytowanego S z M0c2 §8. Sam candidate może wiązać odcinek także na wadliwej siatce; kontrakt nie obiecuje wykrycia zdalnej wady bez poniższej bramki.

Najmniejsza przyszła ścieżka admission: wewnątrz właściciela snapshotu, bez przekazania prywatnych tablic callerowi, wykonać **rzeczywiste** `auditMesh(privateFullS, {maxPairTests: 2_000_000, maxIntersections: 100})`. Stałe te są obecną polityką domyślną, nie wolno podnieść 200k V/F. Nie przyjmować raportu parametrem factory ani `runGeometryTask` zakończonego na innej kopii jako autentykowanego źródła.

Admission wymaga jednocześnie:

- `complete === true`, `triangleCount === faceCount`, `orientation === 'outward'`, finite signedVolume > 0, intersections puste;
- dokładnie rozpoznane wymagane checks: `edge-manifold`, `watertight`, `vertex-manifold`, `components`, `degenerate-triangles`, `winding`, `self-intersections`, `outward`, wszystkie `pass`; brak/duplicate/unknown/fail → brak admission;
- `minimum-thickness` pozostaje jawnie UNKNOWN i nie jest dowodem ani wymaganiem materiałowym samego źródła; brak tego dowodu nie może zmienić się w PASS grubości;
- source handle/digest/stamp ważne przed audytem i przy publikacji; nowy opaque token wydaje wyłącznie kod, który uruchomił pełny audyt na tych samych private bytes. Known fail blokuje, niekompletność/cap/numeric ambiguity → UNKNOWN i blokada. Nie wykonywać repair/orient w admission; korekta tworzy nowe S i ponowny audyt.

**Dlaczego nie eksportować tego teraz:** stary audyt alokuje JS Map/Set/arrays/BVH bez udziału wspólnego ledgeru; obecny compute niszczy Worker po zadaniu i oddaje raport, nie retained-source capability. Nie ma dowodu całego owned RAM ani połączenia nowej authority z aktualną transakcją App. Zewnętrzna rezerwacja „128 MiB payload” nie pokrywa tych braków. Nie dopisywać nieistniejącego TrustedAudit API lub arbitralnego stałego narzutu pamięci jako zmierzonego limitu.

Do odblokowania wystarczy mały adapter/owner z policzonym konserwatywnie working set audytu albo odmową, trwałą prywatną własnością S i realnym współdzielonym admission; nie trzeba od razu przebudować całego workbench. Jeden wspólny pool ≤2 rzeczywistych Workerów, rezerwacja source copy **przed** alokacją, liczenie jednocześnie żywych S, C obu części, R, B/referencji, provenance, audytów, serializacji, kopii i Undo. Współdzielony immutable bufor raz; kopia osobno. Proposed 128/128/384 MiB z integratora to nie zmierzone RSS. Bez nowej puli, podnoszenia capu audytu albo hidden main-thread fallbacku.

Przyszły fence porównuje przy dispatch, po kopii/audycie, po każdym await i **bezpośrednio przed commit/export**: projectEpoch, revision, runtime sourceId+digest, mm+confirmation, frameId i generation; później także tożsamości B/geometrii/recipe. Import, Undo nawet do identycznych bitów, cancel, unit/PCA/registration i zmiana parametrów unieważniają wynik oraz starą powłokę jako aktualną. Transport id/generation sam tego nie robi. M0c3a nie obserwuje App; przechowanie stamp nie implementuje tych fences.

Reload JSON nie odtwarza opaque tokenu; nawet kompletne saved PASS i ponownie obliczony digest wymagają nowego full-S audit, potem ponownego bindingu, a dla v3 także pełnego podziału/provenance OBU części i wszystkich dalszych dowodów. Nie instalować projektu na podstawie zgodnego retained. To pozostaje blocked, dopóki adapter/bramki nie istnieją.

## 6. Kilka pionowych tracerów i niezależna referencja

Każdy tracer osobno RED → minimalne GREEN → następny; nie implementować poziomo całego store. Poniżej oczekiwania, **nie wykonane testy**:

1. **Owned source → konkretny span.** Mały syntetyczny pełny zamknięty model, S skorygowane względem raw i inne niż B; dwie bliskie, nieincydentne ściany. Capture, resolver dla f, real `certifyFaceCubic`, następnie real `sampleCubic(span.containment.controls,1/200,limits,ctx)` na tym samym ctx. Porównać konkretne ID/order/raw bits i exact controls; zmiana caller V/indices/attrs po capture nie zmienia źródła. Dowód nadal candidate, nie full feature PASS.
2. **Wrong plate/order/-0.** Geometria podobna lub identyczna nie daje authority innego f/source/store. Zamiana B/C bez wag zmienia mapowanie; z permutacją wag może zachować world curve, ale zmienia ordered source binding. -0/+0 dają ten sam Rational i różne raw bits/digest. Nonfinite w odległym V odrzuca capture, choć lokalna ściana jest poprawna.
3. **Ownership, lifecycle i limity.** Limit buffer-bytes dokładnie/sum+1, przed pierwszą alokacją brak rezerwacji → odmowa; dwie równoległe capture nie mnożą budżetu. Podczas pending SHA wykonać dispose: capture odrzuca STALE_SOURCE bez późnego handle, również gdy SHA odrzuci; powtórne dispose jest no-op. Sprawdzić, że referencje preimage/owned buffers i rezerwacje są wycofane dokładnie raz po rzeczywistym zakończeniu wewnętrznego SHA, nie wcześniej na podstawie samego dispose; nie zakładać anulowania WebCrypto ani natychmiastowego GC. Zamknięty store nie rozpoczyna capture.

   Osobno udany `h1 = capture`; `release(h1)` wycofuje i zwalnia S; powtórny release autentycznego h1 to no-op także po dispose, a forged/foreign release → INVALID_INPUT. W open `describe`/`resolveFace`/`bindFaceCubic` dla retired h1 → STALE_SOURCE; forged/foreign → INVALID_INPUT przed pozostałymi argumentami. W closed te trzy operacje i capture → STALE_SOURCE; capture closed przed getterami, a open busy/live/pending → SOURCE_IN_USE przed inspekcją wejścia. Test kolejności: `h1 = capture; release(h1); p2 = capture` zatrzymane w SHA; ponowne `release(h1)` nie zwalnia preimage ani rezerwacji p2 i nie anuluje p2, które może legalnie opublikować h2 po SHA. Słaba ewidencja retired nie utrzymuje silnie S.

   Test valid subview z niezerowym byteOffset i ordinary view z własnymi fałszywymi accessorami: wynik nie może ufać nadpisanym właściwościom. Detached/resizable/shared odrzucić; limity sprawdzić przed alokacją, również dla UTF-8 tekstury bez niezarezerwowanej encoded kopii. Sparse/accessor/coercion i ułamkowy/ujemny/za duży f bez odczytu S. Brak resetu ctx pomiędzy resolve/containment/sampler i brak częściowego złożenia przy exhaustion; nie wymagać uniwersalnej kolejności błędów przy niedostatecznym ctx.
4. **Distant invalid-S z recomputed digest — bramka admission, nie sukces M0c3a.** Na gęstszym syntetycznym zamkniętym modelu pozostawić sourceFace i wszystkie jej V/attrs bez zmian. Osobno: usunąć odległą ścianę; zdublować odległą F; stworzyć odległe przecięcie bez zmiany lokalnej ściany. Przeliczyć prawidłowy digest, dołączyć stary albo sfałszowany saved PASS. Rzeczywiste świeże `auditMesh` ma odrzucić pełne źródło; candidate binding lokalny może nadal przejść i właśnie dlatego nie daje admission. Kontrola dodatnia: poprawna pełna siatka przechodzi wymagane checks, minimum-thickness nadal UNKNOWN. Budżet par=0 → UNKNOWN, nie auto-PASS. Tego tracera nie nazywać odebranym, dopóki prywatny owner/admission/consumer blokada nie istnieją.
5. **Stale publikacja — bramka adaptera.** Zatrzymać prawdziwą odpowiedź po audycie i w międzyczasie import/Undo/units/frame/cancel; brak commit/export i brak zmiany aktywnego projektu. Sam test porównania tuple stamp albo mock odpowiedzi nie jest odbiorem native Worker fence.

Niezależna metoda referencyjna: Python stdlib/Fraction, dekodowanie sign/exponent/significand uint32 bez `float`, porównanie **wszystkich** pozycji/indeksów/attrs snapshotu i hashlib canonical preimage, direct indexed face lookup; następnie inverse minor 2×2 + trzeci-axis residual według odebranego `v03_face_cubic_verify.py`, a jego publiczny verifier aproksymacji bez kopiowania algorytmu. Reference nie używa produkcyjnego resolvera/forward sum ani `float(Fraction)`. Dla małych syntetycznych pełnych modeli niezależnie policzyć edge incidence, vertex links, komponenty i exact signed volume; mutanty przecięć mają analitycznego exact świadka. To walidacja określonych fixtures, nie nowy ogólny certyfikator S lub izotopii.

Nie wprowadzamy w tym kroku JSON reload/nowego proof file formatu. Referencja może dostarczać małe niezależnie obliczone fixtures do focused testów; M0c2 producer/verifier nadal mają niezmieniony literalny format. Przed późniejszym real TS→Python export/reload trzeba osobno zamrozić pełny literalny format źródła+bindingu, capy i roundtrip, nigdy ad hoc aliasy typu `triangle3x3Rat`. Żaden JSON cast nie tworzy autentycznego Rational/handle.

## 7. Krytyczna WYKONALNOŚĆ gładkich seams

### 7.1. Konkretna przeszkoda, nie problem kondycji

Wybierz F=(A,B,C), G=(B,A,D), gdzie A=(0,0,0), B=(1,0,0), C=(0,1,0), D=(0,-1,1). Winding sąsiadów po AB jest zgodny. Wspólny punkt E=(1/2,0,0). Conormale w płaszczyznach: nF=(0,1,0), nG=(0,-1,1), kwadraty długości 1 i 2. Wszystko zapisuje się dokładnie w F32/Rational.

Dla transwersalnego przejścia z F do G weź końcową pochodną `v=(a,-b,0)` i początkową `w=(c,-d,d)`, b,d>0. Rational-only cubic controls dają rational a,b,c,d. Izometryczne rozwinięcie G do płaszczyzny F ma `U(w)=(c,-sqrt(2)*d,0)`.

- **Intrinsic G1** wymaga dodatnio współliniowych v i U(w), zatem `b*c = sqrt(2)*a*d` oraz zgodnego zwrotu. Dla rational a,b,c,d i a,c≠0 to niemożliwe. Nie pomaga rational zmiana długości uchwytów: stosunek nadal byłby wymierny. Wyjątek a=c=0 daje prostopadłe do seam przejście G1, nie dowolny kierunek wybranej krzywej.
- **Intrinsic C1** przy wspólnym parametrze wymaga a=c i b=sqrt(2)*d; dla rational niezerowego transwersalnego d jest niemożliwe nawet w powyższym wyjątku. Algebraiczne długości przedziałów parametrów mogłyby zmienić reprezentację, lecz nie są obecną rational-only umową.
- **World G1/C1** przy niezerowej pochodnej muszą mieć kierunek wspólny obu płaszczyznom, czyli wzdłuż AB. Nie dają ogólnego transwersalnego crossing. Przejście styczne do krawędzi wyższego rzędu jest inną, szczególną klasą — nie dowodzi niemożliwości wszystkich world-C1 krzywych ani nie rozwiązuje ogólnej trasy. Zerowanie obu pochodnych nie jest dowodem regularnej gładkości.
- **Geodezyjna gładkość lokalnie na seam**: brak kąta w izometrycznym rozwinięciu; dla krzywej niegeodezyjnej oznacza brak dodatkowego skoku kierunku, nie zerową krzywiznę we wnętrzu F. Całkowita krzywa geodezyjna wymaga dodatkowo prostoliniowego biegu na fasetach. PL geometria S pozostaje bez zmian; sam fakt poprawnego C0 sklejenia na S nie daje żadnego z tych warunków.

To **bloker reprezentacji generic intrinsic smooth crossings** dla obecnych rational-only kontroli, a nie twierdzenie, że cały zatwierdzony produkt jest niemożliwy. Sam dokładniejszy sampler, większy ctx lub dodatkowy inverse nie usuwa irrationality. M0c2 pozostaje poprawne dla swojego zakresu.

### 7.2. Rational chart-dependent gładkość — realny, ale inny kontrakt

Można zdefiniować afiniczne charty na obu stronach: F `PhiF(x,s)=(x,s,0)` dla s≥0 i G `PhiG(x,s)=(x,s,-s)` dla s≤0. Wtedy chart-C1 wymaga a=c i b=d; chart-G1 wymaga bc=ad oraz dodatniego zwrotu i niezerowej pochodnej. **Nie jest to dowolne C0**: dwa endpointy zgodne, lecz dowolne tangenty o innym ilorazie składowych nie przejdą.

Jednak metryki chartów to diag(1,1) i diag(1,2): dla a=b=c=d=1 chart-C1 przechodzi, a intrinsic determinant wynosi `1-sqrt(2)≠0`; world tangenty też nie są współliniowe. To gładkość w wybranej niemet­rycznej strukturze chartów, nie zachowanie kąta/geodezyjnej stycznej. Ogólny chart z unnormalizowanym conormalem zależy od reguły skali i retriangulacji; trzeba zamrozić atlas i pokazać niezmienniczość/ograniczenia, nie wybrać mapy po obejrzeniu dowolnych tangentów. Nie proponujemy po cichu takiego zamiennika jako rozwiązania zatwierdzonego wymagania; kontrakt gładkości pozostaje otwartą bramką techniczną.

### 7.3. Zdarzenia krawędzi i minimalny następny proof-spike

Z góry zaprojektowany seam point `E=(1-t)Vi+tVj`, rational t∈[0,1], można obliczyć raz; dla sąsiada odwrócenie indeksów wymaga t→1-t i odpowiedniej permutacji wag. To pozwala budować cubics z seam jako endpointem, a containment hull ogranicza bieg do wybranej ściany. Nie dowodzi jeszcze dozwolonego wachlarza/route/hit error ani nie czyni rational wszystkich zdarzeń już istniejącej krzywej. Przykład signed edge-height cubica o kontrolach (1,1,0,-2) to `1-3t²`; pierwsze dodatnie przecięcie ma t=1/sqrt(3), nie rational. Bezpośredni podział dyadyczny nie zmienia tego faktu.

**Najpierw proof-spike bez App i bez implementacji buildera:**

1. Zamrozić techniczną kandydaturę intrinsic G1 z regularnymi spanami i kanonicznym rational endpointem; nie obiecywać world-C1 ani globalnej geodezyjności. Na powyższej parze wykazać rational-only odmowę dla kierunku (1,-1,0), a następnie dokładną konstrukcję w Q(sqrt(2)) z `w=(1,-1/sqrt(2),1/sqrt(2))`. Konkretny świadek istnienia poza obecną reprezentacją: dla k=0..3 kontrole `P_k=E+(k-3)*v/12` na F i `Q_k=E+k*w/12` na G. To dwa proste cubics o seam derivatives v/4 i w/4, zgodnych po unfolding nawet w C1. Dla G wagi względem (B,A,D) to `(1/2+k/12, 1/2-k/12-k*sqrt(2)/24, k*sqrt(2)/24)`; sqrt(2)<3/2 daje drugiej wadze dolne ograniczenie co najmniej 1/16, pozostałe też są nieujemne. F ma rational kontrole i simplex; G ma algebraiczne kontrole. Nie jest to jeszcze konstruktor zakrzywionej trasy ani runtime test.
2. Niezależnie zweryfikować znaki, hull i warunek unfolded tangent w arytmetyce algebraicznej. Nie wystarczy dodać algebraicznego verifiera do rational-only generatora: konieczne są również reprezentacja **i sampler** dla algebraicznych controls albo inna dowiedziona reprezentacja całej krzywej. Obecne Rational/`sampleCubic` nie przyjmują tych liczb.
3. Osobny najmniejszy świadek exact root isolation dla `1-3t²`: rational isolating interval, dokładnie jeden pierwiastek i porządek zdarzeń; zdecydować, czy generowanie endpointów pozwala ominąć taki root-finding w pierwszym builderze. Pozostałe korzenie, regularność i kolizje nadal mogą go wymagać. Interval arithmetic bez dowodu równości nie potwierdza G1 tylko dlatego, że przedział zawiera zero.
4. Ustalić bounded reprezentację/minimal polynomial, test równości/znaku i niezależny verifier dla dwóch kolejnych niekomensurabilnych faset. Jedno Q(sqrt(2)) na jedną seam nie dowodzi bounded złożenia całej trasy; rosnący stopień/liczby → UNKNOWN/blokada, nie Float64 fallback. Wynik spike może nakazać ponowną ocenę reprezentacji przed dalszym kodem.

Nie wdrażać tego spike jako części source bindingu. Nie dodawać epsilon, Float64 tangent matching ani nowego error budget: hit/kanonizacja ≤1/200 mm, aproksymacja ≤1/200 mm i kwantyzacja **całego C** ≤1/100 mm, osobno; suma 1/50 mm. Algebraiczne przybliżenie kontroli nie dostaje czwartego składnika i nie może po cichu naruszyć exact seam.

## 8. Bramy pozostające otwarte i wykonana weryfikacja projektu

M0c3a nie rozwiązuje corridor/route selection, kanonicznych przejść E/V i vertex fans, regularności, globalnej prostoty/izotopii, rozdzielenia S, arrangements obu części, C/Q, osadzenia bliskich płatów, baz, strony shellu/rimu i refinamentu kołnierza. Brak tych dowodów blokuje zależny produkt; nie odraczać istotnego seam representation blocker do dużego UI.

W tej pracy utworzono wyłącznie ten nowy plan w repo oraz własne scratch obliczenia matematyczne. Bez src/tests, pełnych testów, tsc, przeglądarki, zmian starego runtime/ZIP, config, skills, stage/commit/reset/stash. Odczyt rzeczywistych API nie jest odbiorem adaptera. Nie czytano credentials ani realnych skanów.

Wykonane read-only Git: `git -C C:/Users/sandr/OrthoSculptCAD status --short`, `rev-parse HEAD`, `branch --show-current`. Mały reprodukowalny **design-math witness, nie test implementacji**:

```bash
python C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-source-span-design/seam-witness.py
```

Rzeczywisty exit0; log obok jako `seam-witness.log`. Fraction potwierdził conormal length squares 1 i 2, ratio=2 niebędące kwadratem rational, world cross=(-1,-1,0), chart determinant=0 i unfolded determinant coefficients [1,sqrt(2)]=(1,-1), dodatnie dolne ograniczenie wag konstrukcji algebraicznej ≥1/16, edge-height polynomial `1-3*t²`, sumę budżetów 1/50 mm. Niewymierność sqrt(2) wynika z parzystości wykładnika 2 w kwadracie ułamka; kontrola `isqrt` potwierdza wybrany mały świadek, nie jest ogólną procedurą symboliczną runtime. Końcowe `git status --short` pokazało wyłącznie ten nowy dokument; `git diff --name-only` i `git diff --cached --name-only` były puste.
