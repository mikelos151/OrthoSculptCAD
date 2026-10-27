# M0c2 — exact cubic w jednej zadanej zamkniętej ścianie

> **Dla implementera:** jedna pionowa sekcja TDD naraz: test zachowania → zaobserwowany, oczekiwany assertion RED → minimalna implementacja → GREEN. Ten dokument jest projektem, nie implementacją ani raportem PASS.

**Cel:** certyfikować, że cztery dokładne kontrole kubiczne, a stąd cała krzywa i jej dokładna wpisana łamana, należą do jednego supplied triangle; jawnie złożyć ten certyfikat z odebranym `sampleCubic`.

**Architektura:** osobny stałowymiarowy prymityw afiniczny `certifyFaceCubic`, bez własnego samplera i bez nowych zależności. Wszystkie działania geometryczne przez odebrany `numerics.ts` i jeden przekazany `ArithmeticContext`. Niezależna referencja odwraca chart przez exact minor 2×2, a certyfikat aproksymacji sprawdza istniejącym publicznym verifierem M0c1.

**Stos:** TypeScript/Vitest oraz Python stdlib/Fraction wyłącznie jako referencja. Bez integracji App/Worker, zmian źródła siatki, Float32/Float64 geometrii, dist i archiwum wydania.

## 1. Status, pierwszeństwo i granica zakresu

Niezależny review projektu `deleg_939a309c`: PASS bez blokerów; to zgoda techniczna na rozpoczęcie M0c2, nie odbiór implementacji. Dwie sugestie nieblokujące poniżej doprecyzowują test ujemnego determinantu i kumulacji budżetu, bez zmiany API/metody/zakresu.

Normatywne: `trimline-v03-integrated-design.md`, dalej `trimline-v03-m0-implementation-plan.md` i kontrakt samplera w `2026-10-27-v03-bezier-certification.md`. Przed projektem odczytano rzeczywiste `src/trimline/{numerics,bezier}.ts`, test samplera i jego Python verifier. Punkt odniesienia odczytany z Git: gałąź `feature/trimline-v03`, HEAD `3b9dc0d1d5507d04880f5f7c4ed1056cebb898c9`; początkowy `git status --short` pusty. Nie powtarzano odbioru M0a/b ani M0c1.

Zatwierdzony produkt pozostaje: **gładka linia 3D przez wnętrza ścian + niepłaski cut/shell + zewnętrzny kołnierz**. Łamana z samplera jest certyfikowaną reprezentacją obliczeniową gładkiej krzywej, nie docelowym produktem zamiast gładkości. M0c2 jest tylko fundamentem tej metody.

Ten krok NIE certyfikuje: przynależności supplied triangle do pełnego S, source identity, pełnego audytu S, wyboru trasy/korytarza, przejść i szwów między ścianami, gładkości złączeń, regularności, prostoty ani zamknięcia krzywej, rozdzielenia powierzchni, podziału obu części, C/Q, cut, shellu, kołnierza lub bezpieczeństwa klinicznego. Stały cubic i zero-chord mogą otrzymać certyfikat zawierania; to nie dopuszczenie do cięcia. Krzywa w jednej ścianie jest płaska, choć ściana ma dowolne położenie w 3D; nie nazywać jej niepłaskim odcinkiem. Pełna krzywa na wielu ścianach nadal ma być przestrzenna.

### Rozważone warianty i decyzja

1. **Wybrany:** map/certificate-only primitive + jawne złożenie z istniejącym samplerem w teście/producerze. Najmniejsze API, osobne twierdzenia i brak drugiej implementacji podziału.
2. Wrapper `sampleFaceCubic(...)`: niepotrzebne dodatkowe publiczne API i polityka publikacji na tym etapie; nie dodawać w M0c2.
3. Sampler w chartach barycentrycznych, a dopiero później mapowanie próbek: odrzucony. Tolerancja musi być sprawdzana w metryce świata; norma wagi/chartu nie jest normą mm i może ukrywać skalę/ścięcie ściany.

## 2. Twierdzenie, które naprawdę dostarczamy

Niech `T=(A,B,C)` będzie uporządkowaną trójką niekolinearnych punktów exact w R³ i `F=conv{A,B,C}` zamkniętym trójkątem. Dla `i=0..3` wymagamy `w_i=(a_i,b_i,c_i)`, każda współrzędna ≥0 i `a_i+b_i+c_i=1` **dokładnie**. Definiujemy:

`P_i = a_i A + b_i B + c_i C`.

1. Niezerowy co najmniej jeden minor 2×2 wektorów `B−A`, `C−A` dowodzi niekolinearności; nie trzeba normy, pierwiastka ani jednostkowej normalnej.
2. Każdy `P_i` należy do F z definicji kombinacji wypukłej. Bez projekcji, epsilon-normalize i zaokrąglenia.
3. Dla każdego rzeczywistego `t∈[0,1]`, wagi Bernsteina stopnia 3 są nieujemne i sumują się do 1. Zatem `B(t)=Σ beta_i(t) P_i ∈ conv{P_i} ⊆ F`. Równoważnie każda współrzędna barycentryczna `Σ beta_i(t) w_ij` jest nieujemna, a ich suma wynosi 1. To dowód całego kontinuum, nie próbkowanie.
4. Odebrany `sampleCubic` daje exact punkty `B(t_k)` i liście będące exact subcubicami na pełnym, bezlukowym [0,1]. Każdy punkt próbki należy do F; każdy cały odcinek między kolejnymi próbkami należy do F przez wypukłość F. Dokładne kontrolki liści też są w F (kolejne kombinacje wypukłe de Casteljau), ale nie trzeba osobnego nowego algorytmu do ich tworzenia.
5. Dla parametrycznie sparowanej łamanej `L(t)` certyfikat M0c1 daje na każdym liściu `||B(t)−L(t)||² ≤ U_leaf ≤ tolerance²`. Z pokrycia parametrów wynika także dwustronna granica Hausdorffa ≤tolerance dla obrazów, bez założenia iniektywności.

Warunki 1–3 wystarczają dla `certifyFaceCubic`. Dopiero warunki 1–5 oraz kompletne sprawdzenie rzeczywistej aproksymacji wystarczają dla **złożonego** certyfikatu M0c2. Sam poprawny output `sampleCubic` nie dowodzi 1–3.

To warunek wystarczający, nie konieczny dla dowolnej krzywej leżącej w F. Kontrola poza simplexem jest odrzucana nawet wtedy, gdy inna metoda mogłaby dowieść zawierania samej krzywej. Nie próbować takiej alternatywnej certyfikacji w tym kroku.

## 3. Zamrożone publiczne API TypeScript

Przyszłe nowe pliki implementera A: `src/trimline/face-cubic.ts`, `tests/v03-face-cubic.test.ts`. Odebrane `numerics.ts` i `bezier.ts` pozostają bez zmian. Poniższe to literalne eksporty; nie dodawać wrappera, wejścia world-controls, opcjonalnych sourceFace ani factory kontekstu.

```ts
import type { Rational, ArithmeticContext } from './numerics';
import type { ExactPoint3, CubicControls } from './bezier';

export type ExactTriangle3 = readonly [ExactPoint3, ExactPoint3, ExactPoint3];
export type ExactBarycentric3 = readonly [Rational, Rational, Rational];
export type CubicBarycentricControls = readonly [
  ExactBarycentric3, ExactBarycentric3, ExactBarycentric3, ExactBarycentric3
];
export interface FaceCubicContainment {
  readonly kind: 'supplied-face-cubic-hull-v1';
  readonly triangle: ExactTriangle3;
  readonly barycentricControls: CubicBarycentricControls;
  readonly controls: CubicControls;
}
export class FaceCubicError extends Error {
  constructor(code: 'INVALID_INPUT' | 'DEGENERATE_TRIANGLE' | 'INVALID_BARYCENTRIC');
  readonly code: 'INVALID_INPUT' | 'DEGENERATE_TRIANGLE' | 'INVALID_BARYCENTRIC';
}
export function certifyFaceCubic(
  triangle: ExactTriangle3,
  barycentricControls: CubicBarycentricControls,
  ctx: ArithmeticContext
): FaceCubicContainment;
```

`FaceCubicError.name === 'FaceCubicError'`; `message === code`, bez współrzędnych/id/path w diagnostyce. `FaceCubicContainment` jest certyfikatem względem **dołączonego trójkąta**, nie typem audited source face ani globalnym PASS. To nie publiczny parser danych z JSON: JSON rational trzeba odtworzyć przez `rational` i wspólny ctx, nie przez cast obiektu `{n,d}`.

### Literalne błędy, kolejność i atomowość

Kolejność faz jest normatywna, żeby nie uzależniać błędu od przypadkowego mapowania:

1. Ograniczony snapshot kształtu obu wejść; błąd → `FaceCubicError('INVALID_INPUT')`.
2. Utworzenie exact 0 i 1 przez `rational(...,ctx)`; sprawdzenie autentyczności wszystkich 21 wartości (9 triangle + 12 weights) przez publiczne operacje numerics, np. `compare(value,zero,ctx)`. Nie odczytywać `value.n/d` przed taką autentykacją. Fałszywy rational/ctx → niezmieniony `NumericsError('INVALID_INPUT')`.
3. Exact test niekolinearności T; wszystkie minory zerowe → `FaceCubicError('DEGENERATE_TRIANGLE')`.
4. Sprawdzenie wszystkich wag ≥0 i sumy każdej trójki równej exact 1; naruszenie → `FaceCubicError('INVALID_BARYCENTRIC')`.
5. Mapowanie wszystkich 12 współrzędnych świata; dopiero potem głęboko niemutowalny wynik.

Każda operacja arytmetyczna/porównanie używa **tego samego** ctx; także test degeneracji, sumy i tworzenie stałych. Brak nowego kontekstu/resetu/ukrytej puli operacji. Istniejący `NumericsError('BUDGET_EXCEEDED')` przechodzi bez przepakowania; ma znaczenie UNKNOWN, nigdy PASS ani dowiedzione geometryczne FAIL. Konserwatywna odmowa przed dużym pośrednim iloczynem jest legalna także dla ostatecznie małego wyniku. `FLOAT32_OVERFLOW` nie jest nowym błędem tej operacji: nie ma tu konwersji F32. Nie łapać ogólnie wszystkich błędów jako INVALID_BARYCENTRIC.

Wyczerpanie budżetu może przerwać wcześniejszą fazę przed poznaniem późniejszego błędu geometrii. Nie obiecujemy diagnostyki degeneracji przy niewystarczającym budżecie.

### Preflight/shape bez coercion i getterów

- Tylko rzeczywiste `Array.isArray`, exact długości 3×3 i 4×3, wszystkie indeksy jako **własne deskryptory danych**. Root length i stałe indeksy odczytywać przez deskryptory. Sparse, odziedziczone indeksy, accessor na wymaganym polu, TypedArray, array-like, zły wymiar → INVALID_INPUT.
- Najpierw sprawdzić stałe długości przed jakąkolwiek pętlą/kopią. Maksymalnie 7 wewnętrznych tuple wejścia i 21 rationali; bez rekurencyjnego przechodzenia nieznanych obiektów. Nigdy spread/map/iterator/slice dostarczonego wejścia ani `Object.keys` całego wejścia o nieograniczonej liczbie dodatków. Dodatkowe nierelewantne właściwości tablic są ignorowane, nie kopiowane i nie czytane (jak w M0c1).
- Nie wywoływać `valueOf`, `toString`, getterów `n/d` sfałszowanej liczby ani niestandardowych metod tablic. Nie naprawiać liczb przez `Number`, BigInt coercion lub `Math.fround`.
- Snapshoty triangle i barycentricControls są własne i zamrożone; caller arrays pozostają niezmienione i nie są zamrażane. Autentyczne Rational są już immutable i mogą być współdzielone. World controls, każda tuple i obiekt wyniku też frozen. Późniejsza podmiana komórki wejścia nie zmienia wyniku.
- Stały wymiar nie potrzebuje nowego `FaceCubicLimits`. Duże liczby ogranicza publiczny numerics preflight (przed mnożeniem/gcd); nie robić własnej nieograniczonej inspekcji BigInt. Limit geometrii samplera zostaje w `BezierLimits`.
- Gwarancja „bez getterów” dotyczy zwykłych kontenerów JS i wymaganych właściwości. JS nie daje bezpiecznego, ogólnego wykrywania dowolnego złośliwego `Proxy`; reflective traps/revoked Proxy nie są izolowanym sandboxem i nie mogą mieć obiecanej zerowej aktywności. Nie twierdzić inaczej. Granica niezaufanego pliku to osobny ścisły JSON parser, nie wykonywalne obiekty JS.
- Sukces publikuje cały obiekt albo nic. Nie ma callbacków/postępu z częściowymi controls. Wyjątek nie cofa zużycia ctx. W złożeniu wynik containment może istnieć lokalnie po nieudanym samplerze, ale **nie wolno publikować go jako sukcesu całego złożenia**.

## 4. Jawne złożenie z M0c1 i budżet błędu

Poniższy kod jest kontraktem użycia istniejących operacji, nie nową funkcją produkcyjną:

```ts
const containment = certifyFaceCubic(triangle, barycentricControls, ctx);
const tolerance = rational(1n, 200n, ctx);
const approximation = sampleCubic(containment.controls, tolerance, limits, ctx);
// Dopiero tu wolno dołączyć kompletny case/bundle albo opublikować sukces złożenia.
```

`ExactPoint3`, `CubicControls`, `CubicApproximation`, `BezierLimits` i `sampleCubic` importować z `./bezier`, bez kopii tych typów/algorytmu. To dokładnie światowe `containment.controls`, nie źródłowe wagi ani ponownie przeliczone/zaokrąglone kontrole. Tolerance można zaostrzyć: `0 < tolerance ≤ 1/200 mm`. Shape/tolerance/subdivision błędy samplera nadal są jego `BezierError('INVALID_INPUT'|'BUDGET_EXCEEDED')`; ostatni oznacza UNKNOWN złożenia. Bez translacji na FaceCubicError.

Mapowanie i certyfikat containment mają błąd **zero**; nie zużywają dodatkowego składnika milimetrowego. Sampler używa już przyjętego składnika aproksymacji ≤0,005 mm, w światowej normie euklidesowej. Exact porównanie kwadratów: `tolerance² ≤ 1/40000 mm²`. Nie dodawać drugiego 0,005, tolerancji chartu, odległości od płaszczyzny ani epsilon-normalize. Składniki hit/kanonizacji ≤0,005 i późniejszej kwantyzacji całej konstrukcji ≤0,010 pozostają oddzielnymi, nieodebranymi tu bramkami; suma normatywna to nadal 0,020 mm. Nie wykonywać żadnej kwantyzacji controls/samples w M0c2.

## 5. Zamrożony format niezależnego dowodu

Nowy, oddzielny dokument: `format: "OrthoSculptFaceCubicProof", version: 1`. Nie rozszerzać `OrthoSculptBezierProof/v1`, nie luzować jego parsera i nie dodawać aliasów. Każdy case jest dokładnie:

- `id`: unikalny syntetyczny identyfikator;
- `tolerance`: serializowane exact Rational użyte w rzeczywistym `sampleCubic`;
- `containment`: **pełny, nieprzerabiany** wynik rzeczywistego `certifyFaceCubic`;
- `approximation`: **pełny, nieprzerabiany** wynik rzeczywistego `sampleCubic(containment.controls,...)`.

Jedyna transformacja serializacyjna to bigint → kanoniczny dziesiętny string. Nie obliczać ponownie results, nie podmieniać nazw, nie dodawać współrzędnych/id pacjentów. Nie ma top-level `input`/`result`; brak tych pól jest celowy, bo wejście geometryczne zachowuje containment. Nie ma pól `controls4x3Rat`, `triangle3x3Rat`, `weights`, `vertices`, `sourceFace`, `sourceIdentity`, `passed` ani `status` w dowodzie. Twierdzenie source provenance jest celowo nieobecne.

### Kompletny JSON Schema (Draft 2020-12)

To rzeczywisty schema, nie pseudoklucze ani notacja `[4][3]Rat`. $defs nazywają typy, nie zmieniają literalnych nazw pól danych. Identyczna maszynowo czytelna kopia kontraktu znajduje się w `tests/fixtures/v03-face-cubic-proof.schema.json`; obaj implementerzy korzystają z tych samych literalnych kluczy.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "OrthoSculptFaceCubicProof/v1",
  "type": "object",
  "additionalProperties": false,
  "required": ["format", "version", "cases"],
  "properties": {
    "format": {"const": "OrthoSculptFaceCubicProof"},
    "version": {"type": "integer", "const": 1},
    "cases": {
      "type": "array", "minItems": 1, "maxItems": 64,
      "items": {"$ref": "#/$defs/Case"}
    }
  },
  "$defs": {
    "Rat": {
      "type": "object", "additionalProperties": false,
      "required": ["n", "d"],
      "properties": {
        "n": {"type": "string", "minLength": 1, "maxLength": 1235, "pattern": "^(0|-?[1-9][0-9]*)$"},
        "d": {"type": "string", "minLength": 1, "maxLength": 1234, "pattern": "^[1-9][0-9]*$"}
      }
    },
    "Point3": {
      "type": "array", "minItems": 3, "maxItems": 3,
      "items": {"$ref": "#/$defs/Rat"}
    },
    "Triangle": {
      "type": "array", "minItems": 3, "maxItems": 3,
      "items": {"$ref": "#/$defs/Point3"}
    },
    "BarycentricControls": {
      "type": "array", "minItems": 4, "maxItems": 4,
      "items": {"$ref": "#/$defs/Point3"}
    },
    "Controls": {
      "type": "array", "minItems": 4, "maxItems": 4,
      "items": {"$ref": "#/$defs/Point3"}
    },
    "Containment": {
      "type": "object", "additionalProperties": false,
      "required": ["kind", "triangle", "barycentricControls", "controls"],
      "properties": {
        "kind": {"const": "supplied-face-cubic-hull-v1"},
        "triangle": {"$ref": "#/$defs/Triangle"},
        "barycentricControls": {"$ref": "#/$defs/BarycentricControls"},
        "controls": {"$ref": "#/$defs/Controls"}
      }
    },
    "Sample": {
      "type": "object", "additionalProperties": false,
      "required": ["t", "point"],
      "properties": {
        "t": {"$ref": "#/$defs/Rat"},
        "point": {"$ref": "#/$defs/Point3"}
      }
    },
    "Leaf": {
      "type": "object", "additionalProperties": false,
      "required": ["t0", "t1", "controls", "upperSquared"],
      "properties": {
        "t0": {"$ref": "#/$defs/Rat"},
        "t1": {"$ref": "#/$defs/Rat"},
        "controls": {"$ref": "#/$defs/Controls"},
        "upperSquared": {"$ref": "#/$defs/Rat"}
      }
    },
    "Approximation": {
      "type": "object", "additionalProperties": false,
      "required": ["kind", "samples", "leaves", "maxUpperSquared"],
      "properties": {
        "kind": {"const": "cubic-parametric-bound-v1"},
        "samples": {
          "type": "array", "minItems": 2, "maxItems": 20001,
          "items": {"$ref": "#/$defs/Sample"}
        },
        "leaves": {
          "type": "array", "minItems": 1, "maxItems": 20000,
          "items": {"$ref": "#/$defs/Leaf"}
        },
        "maxUpperSquared": {"$ref": "#/$defs/Rat"}
      }
    },
    "Case": {
      "type": "object", "additionalProperties": false,
      "required": ["id", "tolerance", "containment", "approximation"],
      "properties": {
        "id": {"type": "string", "minLength": 1, "maxLength": 128, "pattern": "^[ -~]+$"},
        "tolerance": {"$ref": "#/$defs/Rat"},
        "containment": {"$ref": "#/$defs/Containment"},
        "approximation": {"$ref": "#/$defs/Approximation"}
      }
    }
  }
}
```

Schema jest konieczne, ale nie wystarczające dla PASS. Dodatkowe normatywne walidacje semantyczne/parsera:

- JSON UTF-8, bez duplicate keys, NaN/Infinity, float tokens (także `1.0` jako version), bool zamiast int, BOM/niestandardowych aliasów. Używać ASCII full-match, nie pobieżnego regex prefix: końcowy newline w n/d/id jest niedopuszczalny nawet jeśli biblioteka interpretuje `$` przed final newline.
- Kanoniczne ASCII n/d: bez plusa/leading zeros/`-0`, d>0, gcd=1, zero tylko 0/1; długość n bez znaku i d ≤1234 **przed** regex/int; po parse bit_length obu ≤4096. Sam JSON Schema nie egzekwuje gcd, bitów ani tych zależności długości.
- ≤16 MiB pliku przed read/JSON, powtórny fstat i bounded read limit+1 (również rosnący plik). ≤64 cases, unikalne id; sumarycznie ≤20000 leaves i samples=leaves+1 w każdym case. Wszystkie liczności policzyć przed parse rational payloadów. Nie ograniczać tylko pierwszego case.
- Dokładna niekolinearność, simplex wag, tożsamość odwzorowania i pełny kontrakt M0c1 są obowiązkowe. Zgodność schema/hash nie jest certyfikatem matematycznym.
- Liczniki operacji, limb-work, znaków i rozmiaru pośredniego po stronie referencji też ograniczone (§6). Limit oznacza UNKNOWN, a nie zaakceptowanie prefiksu cases.

## 6. Referencja niezależna: inverse chart + istniejący verifier aproksymacji

Przyszły właściciel B: `tests/reference/v03_face_cubic_verify.py`, `tests/reference/test_v03_face_cubic_verify.py`. Autor referencji korzysta z tego kontraktu i publicznego kontraktu M0c1, nie czyta nowego `face-cubic.ts` ani testów implementera A.

### Niezależna metoda containment

Dla `E=B−A`, `G=C−A` wybrać **pierwszy niezerowy** minor w kolejności `(x,y),(x,z),(y,z)`:

`D = E_r G_s − E_s G_r`.

Jeśli żaden nie istnieje, odrzucić degenerate triangle. Dla każdej globalnej kontroli P ustawić `H=P−A` i **odzyskać**, nie przepisać z wejściowych wag:

- `b = (H_r G_s − H_s G_r)/D`,
- `c = (E_r H_s − E_s H_r)/D`,
- `a = 1−b−c`.

Następnie sprawdzić exact residuum w niewykorzystanej trzeciej osi `k`: `H_k = b E_k + c G_k`. To niezbędny test współpłaszczyznowości; sam poprawny rzut 2D może przyjąć punkt poza płaszczyzną. Sprawdzić odzyskane `(a,b,c)` ≥0, sumę=1 i **dokładną równość** z zadeklarowaną trójką `barycentricControls[i]`. Zadeklarowane trójki też muszą być simplexami. D≠0 zapewnia jednoznaczność rozwiązania. Nie rozstrzygać „prawie zera” progiem/normalizacją. Ta metoda nie kopiuje produkcyjnego forward weighted sum.

Convex hull dla odzyskanych kontroli certyfikuje całą krzywą; prawdziwość wpisanej łamanej uzyskujemy dopiero z poprawnego certyfikatu samplera. Nie trzeba odwracać chartu dla każdej próbki jako zastępstwa dowodu ciągłego.

### Reuse M0c1 bez zmiany jego formatu

Nowy publiczny Python `verify_bundle(document)` przyjmuje bezpośrednio **oryginalny nowy bundle**. `main(argv=None)` obsługuje `--input <plik>`. Nowy loader najpierw sprawdza cały nowy format, limity i containment. Potem wewnątrz verifiera tworzy jedną jawnie typowaną projekcję do starego publicznego `v03_bezier_verify.verify_bundle`, z następującymi literalnymi polami dla każdego case:

```text
old.format = "OrthoSculptBezierProof"
old.version = 1
old.cases[i].id = new.cases[i].id
old.cases[i].input.controls = new.cases[i].containment.controls
old.cases[i].input.tolerance = new.cases[i].tolerance
old.cases[i].result = new.cases[i].approximation
```

To **wewnętrzne złożenie już odebranego kontraktu**, nie translacja pliku w celu ratowania niezgodności interop. Pola controls/tolerance/result są nowymi kontenerami starego, jawnego kontraktu; same liczby, tablice kontroli i approximation pozostają bez zmiany wartości. Nie obsługiwać alternatywnych nazw, nie poprawiać ułamków i nie „naprawiać” outputu producenta. Stary verifier nie przyjmuje nowego formatu i nie twierdzi, że sprawdził containment. Nowy verifier nie przyjmuje starego formatu jako dowodu containment.

Wywołać stary `verify_bundle` **raz na całej projekcji**, nie osobno dla każdego case: zachowuje to jego sumaryczny budżet i limit leaves. Nie importować ani modyfikować jego prywatnych funkcji/klasy arytmetyki, nie kopiować de Casteljau ani degree-6 verifiera. Nowa część inverse ma własny jeden licznik wspólny dla wszystkich przypadków, z preflight przed Fraction operations, także dzieleniem. Zamrożone maksima inverse: 4096 bitów input; 32768 bitów unreduced intermediate; 20000000 operacji; 500000000 jednostek limb-work; 16 MiB znaków liczbowych. Każda iteracja parsowania/testu ma koszt; brak nieograniczonego mnożenia/gcd przed preflight. To ograniczenia algorytmiczne, nie zmierzona gwarancja RSS/czasu. Dzielenie wymaga osobnego preflight dla iloczynów z odwróconym operandem i denominator≠0, nie używania przypadkiem limitów samego dodawania.

Są **dwa jawne ograniczone budżety referencyjne** (nowy inverse oraz istniejący M0c1), nie udawany pojedynczy ctx obejmujący prywatne wnętrze starego modułu. W aplikacyjnym TS nadal obowiązuje **jeden** przekazany ArithmeticContext dla mapowania + samplera. Nie traktować limitów referencji jako dodatkowego budżetu błędu geometrycznego.

Publiczny `BudgetExceeded` nowego modułu to alias `v03_bezier_verify.BudgetExceeded`; wyczerpanie dowolnego z dwóch budżetów kończy całe wywołanie. `verify_bundle` zwraca dokładnie `{ "passed": true, "cases": N, "leaves": L, "samples": K }` wyłącznie po kompletnym sprawdzeniu obu twierdzeń dla wszystkich przypadków; liczby z rzeczywistych danych. Nie zwracać częściowego podsumowania przed starym verifierem. CLI: exit0 z tym podsumowaniem; exit1 z `{ "passed": false, "status": "FAIL", "error": "certificate rejected" }` dla odmowy/malformed, a dla błędu pliku `error: "cannot read proof"`; exit2 z `{ "passed": false, "status": "UNKNOWN", "error": "verification budget exhausted" }` przy budżecie. Bez echo surowych danych/path/id. TypeError/ValueError oznacza odmowę, nie PASS.

## 7. Konkretne pionowe sekcje TDD — do wykonania, nie wyniki

Każdy podpunkt to odrębny test/cykl. Nie pisać wszystkich testów lub całego walidatora przed pierwszym GREEN. Nazwy poniżej są kontraktem przyszłych focused komend.

### A1. Pierwszy tracer: mapowanie w nieosiowej ścianie

Nowy moduł może początkowo być pustym/type-only scaffoldem (`export {}`); import namespace ma działać. Pierwsza asercja `expect(faceCubic.certifyFaceCubic).toBeTypeOf('function')` daje oczekiwany assertion RED „undefined zamiast function”, a nie MODULE_NOT_FOUND/literówkę. Po dodaniu eksportu ten sam test musi sprawdzić konkretne mapped controls i frozen kind, zanim będzie GREEN. Alternatywnie poprawnie eksportowana funkcja rzucająca jawne `not implemented` daje behavior RED; nie udawać, że to ukończona implementacja.

Test `maps a non-axis triangle exactly`:

- T: `A=(1,2,3)`, `B=(4,4,4)`, `C=(2,6,5)`.
- W: `(1,0,0)`, `(1/2,1/3,1/6)`, `(1/6,1/3,1/2)`, `(0,0,1)`.
- Oczekiwane P: `(1,2,3)`, `(13/6,10/3,11/3)`, `(5/2,14/3,13/3)`, `(2,6,5)`.
- Minory XY/XZ/YZ: `10,5,0`; nie wpisywać obliczonej przybliżonej normalnej.

Najpierw tylko zachowanie wymagane przez ten test i kontrakt bieżącej sekcji. Późniejszy test, który już przechodzi dzięki wcześniejszemu kodowi, jest dodatkowym coverage, nie nowo udowodnionym RED.

### A2. Granica zamknięta: E/V i brak „strict interior”

Kolejno test `accepts exact edge and vertex controls`: na T z A1 użyć kontrolnych wag wzdłuż AB `(1,0,0),(2/3,1/3,0),(1/3,2/3,0),(0,1,0)`; otrzymać parametrycznie liniowy cubic. Osobno cztery `(0,1,0)` dają constant-at-vertex. Nie odrzucać zera w wadze, styku ze ścianą ani braku ruchu jako błędu containment. Nie wyprowadzać z tego regularności/cut.

### A3. Degeneracja i near-degenerate bez epsilon

- `rejects an exactly degenerate triangle`: powtórzony wierzchołek, osobno `A=(0,0,0), B=(1,2,3), C=(2,4,6)` → DEGENERATE_TRIANGLE.
- `accepts an exactly nondegenerate thin triangle`: `A=(0,0,0), B=(1,0,0), C=(1,2^-600,0)`; wszystkie wagi `(1,0,0)`; exact minor XY `2^-600≠0`. Przy dostatecznym ctx ma być sukces, bez progu area. Przy małym maxBits dopuszczalne wyłącznie NumericsError/BUDGET_EXCEEDED (UNKNOWN), nie DEGENERATE_TRIANGLE.
- Referencja osobno sprawdza wybór XZ, gdy XY=0: T `((0,0,0),(1,0,0),(0,0,1))`; oraz YZ, gdy XY=XZ=0: T `((0,0,0),(0,1,0),(0,0,1))`.

Dodatkowy osobny test po review: zamienić B/C w triangle i drugą/trzecią składową każdej wagi. World controls pozostają exact identyczne, wybrany determinant zmienia znak; inverse musi odzyskać przestawione wagi. Nie stosować abs(D) ani założenia dodatniej orientacji.

### A4. Wagi, suma i underflow/coercion

- `rejects a tiny negative exact weight`: jedna trójka `(-2^-1100,1+2^-1100,0)` przy sumie exact 1 → INVALID_BARYCENTRIC; osobno każda pozycja wagi/kontrolki. Nie wolno Number/F32 underflow zamienić minusa w zero. Pełny ctx ma wystarczyć dla walidacji tego świadka.
- `rejects a nonunit exact sum`: `(1,2^-1100,0)` oraz `(1/2,1/3,1/7)` → INVALID_BARYCENTRIC, bez renormalizacji. Osobno suma mniejsza/większa od1 i zwykła ujemna waga.
- `does not coerce rational lookalikes`: numbers/string/bigint zamiast Rational, kopia `{n:0n,d:1n}`, Object.create autentycznego rational, gettery n/d i valueOf counters → NumericsError INVALID_INPUT, counters0. Macierze o złym kształcie nadal FaceCubicError INVALID_INPUT, a nie ten sam błąd co forged scalar.

### A5. Shape, niezmienność i limity

- `snapshots owned dense tuples without getters`: zły root length/inner length, sparse i inherited index w każdym wymaganym miejscu, accessor index/length tam gdzie JS pozwala; tablice z getterami `map`/Symbol.iterator nie są wywoływane. Nie wymagać niemożliwej podmiany nonconfigurable Array.length.
- `returns a deeply immutable owned certificate`: wszystkie obiekty/tuple frozen, caller arrays nadal mutable i niezmienione; po sukcesie modyfikacja caller nie zmienia triangle/weights/controls wyniku.
- `shares arithmetic budget and publishes no partial result`: wyznaczyć w teście minimalny operacyjny próg sukcesu deterministycznego małego świadka przez bounded binary search w dozwolonym zakresie (nie zakodować przypadkowej liczby operacji implementacji). Próg daje sukces, próg−1 BUDGET_EXCEEDED i zmienna docelowa undefined. Osobno autentyczny wielki rational z szerszego kontekstu użyty z mniejszym maxBits → BUDGET_EXCEEDED. Nie kopiować go przez coercion.
- `preserves phase error ownership`: malformed shape przed forged ctx; poprawny shape i forged scalar przed testem geometrii; degenerate + invalid weights po poprawnej autentykacji → DEGENERATE_TRIANGLE. Wyczerpanie budżetu może legalnie wyprzedzić błąd późniejszej fazy.

### A6. Pierwsze prawdziwe złożenie z odebranym samplerem

Test `composes mapped world controls with sampleCubic` używa A1 i jednego ctx dla `certifyFaceCubic`, `rational(1,200)` i `sampleCubic`. Sprawdza controls bez zmiany, dokładne samples/endpoints, kompletne liście i normatywny bound; nie powiela samplera produkcyjnego. Dodatkowa asercja w teście może odzyskać barycentrics próbek niezależną metodą albo sprawdzić je w referencji, lecz nie zastępuje dowodu hull.

Osobny test `uses world metric rather than chart tolerance` musi naprawdę rozróżniać te metryki: na T z A1 przyjąć `h=1/1000` i wagi `(1,0,0)`, `(2/3−h,1/3,h)`, `(1/3−h,2/3,h)`, `(0,1,0)`. Dla chartowych kontroli obie wewnętrzne odchyłki od cięciwy to `(-h,0,h)`, więc chartowe U=`1/500000`. Światowe odchyłki to `h(C−A)`, więc U=`21/1000000`: nieprzeskalowane T pozwala na jeden liść przy tolerance=1/200. Po przeskalowaniu wszystkich pozycji T ×1000, przy **tych samych wagach**, światowe U=`21`, podczas gdy chartowe U pozostaje `1/500000`. `BezierLimits={maxDepth:0,maxSegments:1,maxNodes:1}` musi więc przyjąć wersję nieprzeskalowaną i odmówić wersji ×1000. Sam test krzywej, którą obie metryki i tak odrzucają, nie byłby świadkiem tego kontraktu. Duże limity mogą pozwolić na podział, ale nie na przyjęcie root przez porównanie w chart. Nie żądać identycznej liczby liści po skalowaniu.

Test `does not reset context between containment and sampling`: oddzielne świeże konteksty mogą wystarczyć dla każdego składnika, lecz celowo dobrany **jeden** łączny za mały budżet ma przerwać złożenie i nie opublikować case. Wyznaczyć próg pełnego złożenia przez bounded search; próg−1 to UNKNOWN. Nie wyciągać sukcesu ze wcześniej obliczonego local containment.

Test `propagates sampler refusal without partial composition`: depth0 wymaganego podziału → oryginalny BezierError BUDGET_EXCEEDED; zła tolerance → BezierError INVALID_INPUT. M0c2 nie musi ponownie wykonać pełnego TDD wszystkich istniejących bound/de Casteljau przypadków.

### A7. Real producer, referencja i mutant — pionowy interop

Test `exports untouched real face cubic proofs` produkuje kompletne wyniki wyłącznie przez realne dwie funkcje. Obowiązkowe literalne id i wejścia: `nonaxis-curved` = A1; `edge-linear` = T z A1 i edge wagi z A2; `vertex-constant` = T z A1 i cztery `(0,1,0)`; `xz-chart` oraz `yz-chart` = odpowiednie T z A3 i edge wagi z A2; `thin-constant` = thin T z A3 i cztery `(1,0,0)`. Wszystkie z tolerance=1/200. Dodatkowe cases są dozwolone w cap64. Nie wpinać invalid cases do bundle sukcesów. Wszystkie wejścia syntetyczne. Liczby przypadków/liści zliczać z JSON programowo, nie deklarować wyników z góry.

Eksport tylko gdy podano `ORTHO_FACE_CUBIC_EVIDENCE_OUT`: ścieżka absolutna pod Hermes scratch, realpath rodzica, ochrona wyjścia poza scratch i istniejących linków; zapis exclusive `wx` do nowego pliku. Domyślny run testu nie zapisuje plików. Pattern bezpieczeństwa istnieje w `tests/v03-bezier.test.ts`; nie zmieniać go. Po złożeniu obiekty containment i approximation wkładać do bundle bez przepisywania pól; stringify bigint-replacer jest jedyną zmianą reprezentacji liczb.

Autor B zaczyna od własnego syntetycznego edge-linear certyfikatu (jawnie matematycznego, nie nazywanego TS outputem), behavior RED publicznego verify_bundle, potem GREEN inverse i delegowanego M0c1. Następne niezależne pionowe negatywy: zły format/aliasy, degenerate, poza płaszczyzną przy niezmienionym rzucie, zła odzyskana waga, tinynegative/suma, korupcja samples/leaf/bound/pokrycia i każdy parser/budget limit. `getattr(...,None)` z asercją callable albo działający namespace scaffold daje uczciwy assertion RED, nie import typo.

Konkrety limitów referencji sprawdzać w osobnych cyklach: case count64/65, aggregate leaves20000/20001 i per-case samples=leaves+1/±1; 4096/4097 bitów wejściowego integer; długość tokenu1234/1235 bez znaku; plik dokładnie16MiB/16MiB+1 (legalne dopełnienie whitespace), duplicate keys i final-newline w n/d/id. Wielkie count-boundary fixtures mogą osobno badać bounded preflight parsera, bez deklaracji matematycznego PASS całego dużego dokumentu: legalny count nie gwarantuje, że plik/arithmetic mieści się w innych capach. Budżety inverse oraz starego verifiera ćwiczyć niezależnie przez kontrolowaną odmowę przed operacją, a na złożonym wywołaniu wymagać exit2 i braku podsumowania PASS. Nie dodawać test-only publicznego przełącznika do podnoszenia capów w CLI.

Dodatkowe osobne testy po review: dwa przypadki mają przechodzić inverse osobno przy kontrolowanym wystarczającym limicie, lecz ich połączenie przy tym samym limicie ma wyczerpać wspólny budżet i dać UNKNOWN. Osobno obserwować dokładnie jedno wywołanie publicznego starego verify_bundle na całej projekcji (np. wraps prawdziwej funkcji); nie zastępować wyniku atrapą ani nie uruchamiać starego verifiera osobno dla każdego case.

Rodzic przekazuje **oryginalny plik producenta bez edycji** do nowego CLI. Następnie tworzy osobny canonical mutant: w case A1 zmienić tylko `containment.barycentricControls[1]` z `(1/2,1/3,1/6)` na `(1/3,1/2,1/6)`. Wszystkie ułamki kanoniczne, suma=1, wagi≥0, controls/approximation/tolerance nietknięte. Nowy verifier musi FAIL (inverse mismatch), podczas gdy wewnętrzna projekcja samej aproksymacji do starego verifiera pozostaje PASS. To dowodzi, że nowa bramka naprawdę sprawdza związek containment, a nie tylko uruchamia M0c1 lub odrzuca składnię. Oryginał zachować bitowo; mutant nie jest rzekomym wynikiem implementacji.

Dodatkowy canonical off-plane mutant: w osobnej kopii jednolicie dodać exact δ=1/997 do z każdej world control, world leaf control i sample.point, redukując Fraction. Przesunięcie zachowuje aproksymację i rzut XY, ale pozostawia T i weights bez zmiany. Na non-axis A1 musi zawieść trzeci-axis residual, mimo PASS starego verifiera. Wykonać jako negatywną kontrolę, nie jako real producer evidence.

Odwrotna zgodność też jest negatywem: nowy bundle ma być odrzucony przez niezmieniony stary CLI; stary bundle przez nowy CLI. Zakaz tolerowania `controls4x3Rat` i innych aliasów ma osobne testy.

### Przyszłe polecenia focused (nie wykonano ich w pracy nad planem)

Z katalogu `C:/Users/sandr/OrthoSculptCAD`; pliki muszą najpierw powstać we właściwej przyszłej sekcji:

```bash
node node_modules/vitest/vitest.mjs run tests/v03-face-cubic.test.ts -t 'maps a non-axis triangle exactly'
node node_modules/vitest/vitest.mjs run tests/v03-face-cubic.test.ts -t 'composes mapped world controls with sampleCubic'
python -m unittest discover -s tests/reference -p test_v03_face_cubic_verify.py -v
ORTHO_FACE_CUBIC_EVIDENCE_OUT='C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-face-cubic-design/m0c2-real-001.json' node node_modules/vitest/vitest.mjs run tests/v03-face-cubic.test.ts -t 'exports untouched real face cubic proofs'
python tests/reference/v03_face_cubic_verify.py --input 'C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-face-cubic-design/m0c2-real-001.json'
python tests/reference/v03_face_cubic_verify.py --input 'C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-face-cubic-design/m0c2-mutant-001.json'
```

Oczekiwania (nie wyniki): pierwszy run focused testu przed implementacją ma assertion RED; po sekcji GREEN. Real producer CLI exit0; canonical mutant exit1/FAIL; kontrolowane wyczerpanie verifier budget exit2/UNKNOWN. Nigdy przyjmować exit2 jako PASS. Ścieżki evidence muszą być świeże; nie nadpisywać poprzednich przebiegów. Pełny regression/tsc i świeże spec/math + quality review to późniejszy odbiór rodzica, nie zadanie autora tego planu. Teraz nie uruchamiać pełnych testów ani przeglądarki.

## 8. Source binding i legalne E/V — co nie wynika z containment

Supplied triangle może pochodzić z dowolnego miejsca. Zamiana go na inną ścianę z takim samym kształtem albo z pobliskiego płata **nie jest wykrywalna przez ten prymityw**. Żadne pole kind ani udane inverse nie nadaje source provenance. Nie dodawać teraz „sourceFace” jako niezweryfikowanej etykiety sugerującej taki dowód.

Przed użyciem na siatce kolejna bramka musi powiązać dokładnie: niezmienny snapshot/revision/digest pełnego skorygowanego S (nie B, raw scan ani retained R), potwierdzone mm i układ, `sourceFace`, uporządkowane oryginalne `vertexIDs` i raw uint32 Float32 bits wszystkich 3×3 składowych tej konkretnej ściany. Resolver ma pobrać je z **audytowanego** pełnego S, sprawdzić zgodność face→vertexIDs, winding i bitów, a potem dekodować exact przez odebrane `fromFloat32Bits`; bez roundtrip przez Number lub reconstruct z wyniku. Raw bity zachować również dla -0: exact Rational zeruje znak, więc sam rational nie dowodzi zgodności bitowej. Digest jest powiązaniem stanu, nie dowodem audytu ani podpisem. Zmiana revision/układu/jednostek/bits unieważnia powiązanie i zależne dowody.

Jeżeli zapisany certificate zawiera własny T, resolver ma sprawdzić exact równość z T odtworzonym z tych **konkretnych** bitów i zgodną kolejność wag; nie wystarcza geometrycznie zbieżny trójkąt/inny płat. Nie należy wymagać, by dowolny rational triangle przyjmowany przez M0c2 był representable w F32: M0c2 jest exact prymitywem; source-bound builder ma własny bardziej restrykcyjny kontrakt.

- Zera wag są legalne i dają edge/vertex bez epsilon. Ściana nie staje się niepoprawna przez legalny kontakt ze swoją zamkniętą granicą.
- To nie kanonizacja wspólnego zdarzenia między twarzami. Kolejna bramka wylicza wspólne exact zdarzenie raz i wiąże je z kanonicznym E/V źródła, vertex IDs, orientacją edge-parametru oraz dozwolonym incydentnym wachlarzem; nie utożsamia dwóch pobliskich zdarzeń po odległości.
- Nie zakładać unikalnej „ściany właściciela” punktu E/V ani dodatniej separacji legalnego styku. Zarazem nie zwalniać całych par sąsiednich ścian z kontroli przecięć tylko dlatego, że dzielą E/V.
- Zdarzenie vertex na niejednoznacznym wachlarzu, nieustalona strona wyjścia, edge-following między wieloma chartami, kilka możliwych route continuation lub sąsiedni bliski nieincydentny płat pozostają **zablokowane do kolejnej bramki**. Brak decyzji nie jest automatycznym odrzuceniem całej klasy legalnych E/V i nie usprawiedliwia ukrytego przeskoku.

## 9. M0c3 i dalsze obowiązkowe bramki

Proponowana najbliższa bramka M0c3 ma najpierw zamrozić source-bound span/transition API: resolver powyżej, operatorowy korytarz, kanoniczne seam events E/V i dozwolone lokalne przejścia. Nie przyjmować, że M0c2 rozwiązało dobór kontroli w wielu twarzach. Curve builder powinien dopiero konstruować wewnątrzfasetowe cubics zgodne z ograniczeniami simplex, kotwicami, korytarzem i jawną definicją lokalnej gładkości, a następnie używać containment+sampleCubic jako obowiązkowych verifierów kandydatów.

Nadal trzeba osobno udowodnić:

1. Pełne pokrycie trasy, endpoint identity na E/V, brak skoków i luka/powtórzenie przy sklejaniu spanów; legalne vertex/edge-following oraz przypadki wielu odcinków/cyklu w jednej ścianie.
2. Precyzyjną definicję gładkości lokalnej i reguły złączeń na fasetowanym S. **Nie obiecujemy globalnej euklidesowej C1 przez ostre fasety** i nie wygładzamy po cichu geometrii S. M0c2 nie redukuje produktu do dowolnego C0 łańcucha: brak rozstrzygniętej zgodnej metody gładkich spanów/przejść blokuje produkt, nie usuwa wymagania.
3. Regularność i globalną prostotę zarówno dokładnej zamkniętej krzywej, jak i obliczeniowej reprezentacji używanej przez cut. Sama mała odległość Hausdorffa, nieujemne barycentrics lub zgodne endpointy nie zapobiegają pętlom ani nie zachowują automatycznie izotopii. Bliskie gałęzie, kontakty i self-intersections wymagają kompletnego dowodu/świadka lub UNKNOWN. Rozdzielenie S na dwie części jest dodatkowym warunkiem, nie konsekwencją dowolnego zamknięcia.
4. Exact arrangements/triangulację podziału **obu** części, wspólne zdarzenia i późniejsze pojedyncze F32 rounding, C/Q, całopowierzchniowy błąd ≤0,010 i niezależny certyfikat osadzenia; dalej strona względem pełnego C, niepłaski shell, kołnierz i kontrakt inner refinement z integratora.

M0c3 może potrzebować kolejnych małych podbramek — nie upychać całej prostoty/globalnego cut do implementacji M0c2. Te obowiązki pozostają otwarte niezależnie od nazwy kolejnego numeru.

### Jawne blokery reprezentacji przy przejściach

Dla M0c2 wystarcza bounded Rational: finite sums/products i exact nonzero minor/inverse nie potrzebują sqrt ani algebraic roots. Near-degenerate może wyczerpać liczby/operacje; wtedy UNKNOWN. Nie dodawać Float64, żeby „naprawić kondycję”.

Dla dalszych bramek: dokładny unit tangent/unfolding przez kąt faset może wymagać pierwiastków, a czasy przecięcia cubica z krawędzią lub izolacja zderzeń mogą być algebraiczne, nie wymierne. De Casteljau przy dyadycznych czasach daje exact racionalne pododcinki, ale nie czyni dowolnego czasu zdarzenia wymiernym. Można rozważyć konstrukcję seam endpointów z góry w dozwolonych racionalnych chartach albo osobny certyfikat algebraic/interval z izolacją pierwiastków; metodę i kompletność trzeba zatwierdzić oraz niezależnie sprawdzić przed implementacją. Jeżeli istotny kontrakt gładkości/trasy/prostoty wymaga nierozwiązanej reprezentacji, jest to blocker tej bramki. Nie zastępować go dopasowaniem Float64, tolerancją lub dowolnym C0 złączeniem.

## 10. Kryteria odbioru M0c2

M0c2 można odebrać wyłącznie, gdy:

- literalne nowe API/błędy i wszystkie semantyczne warunki z §§2–4 mają rzeczywiste focused testy, z zapisanym oczekiwanym RED dla każdej nowej sekcji;
- exact mapowanie i simplex/niekolinearność dowodzą całej krzywej, a rzeczywisty sampler na tych samych world controls i ctx dowodzi całej wpisanej łamanej i normatywnego bound;
- format z §5 jest wspólnym literalnym kontraktem producenta i niezależnej referencji; stary format/parser pozostają bez zmiany znaczenia;
- oryginalny real producer bundle przechodzi nowy verifier, a canonical containment-specific mutant i off-plane mutant mają FAIL mimo poprawności samego M0c1; sztucznie ograniczony budżet daje UNKNOWN i brak częściowego PASS;
- real evidence ma nieprzerabiany oryginał, oddzielne mutanty i programowo sprawdzone liczności; brak sfabrykowanych expected/results;
- świeży spec/math review i quality/security review obejmują dowód convex hull, inverse third-axis residual, preflight/immutability i kompozycję, nie tylko samą liczbę testów;
- późniejszy odbiór rodzica potwierdzi regresje i brak integracji/zmiany freeze, bez utożsamiania tego z zakończeniem M0c, M0 ani produktu.

## 11. Rzeczywiste czynności autora planu

W tym zadaniu utworzono wyłącznie ten nowy dokument w repo i własne pomocnicze scratch evidence. Nie zaimplementowano API/verifiera, nie wykonano RED/GREEN implementacji, pełnych testów, tsc, przeglądarki, stage/commit/reset ani zmian config. Odczyty istniejących testów nie są ponownym odbiorem samplera.

Wykonane polecenie read-only Git z `C:/Users/sandr`:

```bash
git -C C:/Users/sandr/OrthoSculptCAD status --short && git -C C:/Users/sandr/OrthoSculptCAD rev-parse HEAD && git -C C:/Users/sandr/OrthoSculptCAD branch --show-current
```

Dodatkowo małe obliczenia stdlib Fraction dla świadka A1, odzyskania wag przez minor, sumy tinynegative i kwadratu tolerance; to **obliczenia projektu, nie testy implementacji**. Reprodukowalny skrypt i log: `C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-face-cubic-design/design-witness.py` oraz `design-witness.log`. Polecenie:

```bash
python C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-face-cubic-design/design-witness.py
```

Wcześniejsze jednorazowe `python -c` wykonywało te same Fraction wzory i wypisało minory `10,5,0`, powyższe 4 mapped controls i odzyskane W, exact tinynegative sum=1/negative=True oraz tolerance²=1/40000. Log/skrypt jest świadkiem matematycznym, nie fixture udającym wynik TS. Witness dodatkowo potwierdził U chartu=`1/500000`, U świata=`21/1000000`, po skali ×1000 U=`21`; JSON Schema ma poprawną składnię, wszystkie lokalne $ref rozwiązane oraz zgodne required/properties.

Wykonano także kontrolę meta-schema przez już zainstalowany `jsonschema` (bez instalacji/zależności runtime produktu):

```bash
python -c "from pathlib import Path; import json,re; from jsonschema import Draft202012Validator; p=Path('C:/Users/sandr/OrthoSculptCAD/docs/plans/v03-face-cubic-containment.md'); s=json.loads(re.search(r'\x60\x60\x60json\n(.*?)\n\x60\x60\x60',p.read_text(encoding='utf-8'),re.S).group(1)); Draft202012Validator.check_schema(s); print('Draft 2020-12 meta-schema: valid; no implementation tests run')"
```

Wynik: exit0, `Draft 2020-12 meta-schema: valid; no implementation tests run`. To kontrola planu, nie odbiór przyszłego verifiera/produktu. Końcowa kontrola zakresu: `git status --short` pokazuje wyłącznie nowy `docs/plans/v03-face-cubic-containment.md`; `git diff --name-only` i `git diff --cached --name-only` puste. Żadnych zmian tracked/staged poza nowym, niestage'owanym dokumentem.
