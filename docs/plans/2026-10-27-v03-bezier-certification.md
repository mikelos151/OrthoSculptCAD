# M0c1 — certyfikowana aproksymacja pojedynczego kubicznego odcinka 3D

> Dla implementera: pionowe TDD. Najpierw test zachowania i rzeczywisty assertion RED, potem minimalna implementacja i GREEN.

**Cel:** działający lokalny prymityw zamieniający kubiczną krzywą 3D na łamaną z dokładną, dwustronną granicą błędu, a nie tylko z gęstymi próbkami.
**Architektura:** zatwierdzony zakres B i integrator pozostają normatywne. Używamy odebranego `numerics.ts`, adaptacyjnego de Casteljau oraz dokładnego ograniczenia odchylenia w tej samej parametryzacji. Niezależny Python sprawdza rzeczywiste wyniki TS przez wielomiany potęgowe i współczynniki Bernsteina stopnia 6.
**Stos:** TypeScript, Vitest, Python stdlib/Fraction. Bez nowych zależności, zmian starej aplikacji, dist, wersji i ZIP.

M0a/b przyjęte po dwóch niezależnych PASS: `../verification/v03-m0-independent-reviews.json`. Ostatni pełny run 1148 PASS, bez pominięć, oraz 12 unittest Pythona; to punkt odniesienia, nie wynik tego nowego etapu.

## 1. Granica produktu i prymitywu

- Użytkownik zatwierdził gładką linię przez wnętrza ścian, niepłaską powłokę i zewnętrzny kołnierz. Nie pytać ponownie o zakres i nie zastępować go wariantem po krawędziach.
- Ten etap to JEDEN kubiczny odcinek w 3D. Nie dobiera jeszcze korytarza na siatce, nie konstruuje globalnie gładkich złączeń, nie dowodzi prostoty krzywej ani jej osadzenia na źródle, nie tnie i nie generuje powłoki. Te bramki pozostają obowiązkowe w M0c/M0d/M0e.
- Wynik zawiera dokładne liczby wymierne, nie Float32. Wspólna kwantyzacja i konstrukcja OBU części następują później; sampler nie zaokrągla już teraz ani nie zmienia źródła.
- Całkowicie stały odcinek może mieć poprawny certyfikat błędu zero. NIE oznacza to poprawnej linii do cięcia. Tak samo certyfikat aproksymacji nie dowodzi braku pętli/samoprzecięcia.

## 2. Wybrana metoda i dowód granicy

Dla kubicznego B(u) o kontrolach P0..P3 i cięciwy L(u)=(1-u)P0+uP3, u∈[0,1]:

- D0=D3=0,
- D1=P1−(2P0+P3)/3,
- D2=P2−(P0+2P3)/3.

Dokładna tożsamość: `B(u)−L(u) = Σ Bernstein3_i(u) Di`. Rodzic sprawdził ją symbolicznie w narzędziu przez współczynniki dla czterech formalnych kontroli; nie jest to jeszcze test implementacji.

Wagi Bernsteina są nieujemne i sumują się do 1. Zatem `||B(u)−L(u)||² ≤ U = max(dot(D1,D1),dot(D2,D2))` dla wszystkich u. Jest to konserwatywna granica tego samego parametru, silniejsza od potrzebnej dwustronnej granicy Hausdorffa. Nie wyznacza się pierwiastka ani maksimum przez próbki. Nie jest to deklaracja rzeczywistego maksymalnego błędu.

Jeżeli `U ≤ tolerance²`, przyjąć liść. Inaczej dokładnie podzielić de Casteljau przy u=1/2, z jednym wspólnym punktem obu dzieci, i kontynuować w ramach limitów. Dla normatywnej granicy 1/200 mm kwadrat to 1/40000 mm², sprawdzone narzędziem.

## 3. Zamrożone API i własność implementera A

Własność: `src/trimline/bezier.ts`, `tests/v03-bezier.test.ts`. Nie zmieniać odebranego `numerics.ts`, starych testów, indeksów geometrii ani plików drugiego autora. Logi wyłącznie w Hermes scratch/v03-bezier-agent/.

```ts
import type { Rational, ArithmeticContext } from './numerics';
export type ExactPoint3 = readonly [Rational, Rational, Rational];
export type CubicControls = readonly [ExactPoint3, ExactPoint3, ExactPoint3, ExactPoint3];
export interface BezierLimits { maxDepth: number; maxSegments: number; maxNodes: number }
export interface ParameterSample { readonly t: Rational; readonly point: ExactPoint3 }
export interface LeafCertificate {
  readonly t0: Rational; readonly t1: Rational;
  readonly controls: CubicControls;
  readonly upperSquared: Rational;
}
export interface CubicApproximation {
  readonly kind: 'cubic-parametric-bound-v1';
  readonly samples: readonly ParameterSample[];
  readonly leaves: readonly LeafCertificate[];
  readonly maxUpperSquared: Rational;
}
export class BezierError extends Error {
  readonly code: 'INVALID_INPUT' | 'BUDGET_EXCEEDED';
}
export function sampleCubic(
  controls: CubicControls, tolerance: Rational,
  limits: BezierLimits, ctx: ArithmeticContext
): CubicApproximation;
```

- Gęste własne tablice, prawdziwe wartości z fabryk `numerics`; snapshot bez wywoływania getterów/niestandardowych map. Wynik i zagnieżdżone tablice niemutowalne. Własność wejścia pozostaje bez zmian, kontekst arytmetyczny z założenia zużywa budżet.
- Tolerance dodatnia i ≤1/200 mm. Bez pożyczania z innych składników. Nieautentyczne rational/context i wyczerpanie arytmetyki zachowują istniejący `NumericsError`; własne błędy kształtu/limitów i limitów podziału to statyczne `BezierError`, bez współrzędnych w komunikacie.
- Limity snapshotowane z własnych deskryptorów danych: maxDepth całkowite 0..32; maxSegments 1..20000; maxNodes 1..40000. Root to głębokość0 i jeden zaalokowany node. Każdy podział rezerwuje dwa dzieci przed alokacją, liście są rozliczane przed dołączeniem. MaxDepth0 pozwala przyjąć płaski odcinek, ale odmawia wymaganego podziału.
- Wszystkie operacje wymierne przez JEDEN przekazany ctx. Nie tworzyć nowego kontekstu na każdy liść ani resetować krokomierza. Nie konwertować n/d do Number/Math.sqrt dla decyzji.
- DFS/iteracja z ograniczonym stosem; liście rosnąco według parametru. Przed podziałem kontrolować też minimalną liczbę przyszłych liści z już oczekujących node, nie odkładać odmowy do pełnej alokacji.
- Samples = pierwszy początek i końce kolejnych liści. T od0do1 bez luk/powtórzeń, sąsiednie odcinki współdzielą dokładny punkt; wewnętrzny wspólny midpoint konstruowany raz. Każdy liść odtwarza dokładny subodcinek pierwotnej krzywej. maxUpperSquared to max zgłoszonych U, nie zmierzony błąd rzeczywisty.
- Nie zwracać częściowego certyfikatu po błędzie/budżecie. Maksymalne limity nie są obietnicą, że każdy dopuszczalny odcinek zmieści się w budżecie BigInt/czasie.

### Pionowe kroki A

1. Test parametrycznie liniowego odcinka (0,0,0),(1,1,1),(2,2,2),(3,3,3): jedna cięciwa, t0=0/t1=1, U=0. Assertion RED przed zachowaniem.
2. Dokładny de Casteljau i krzywy odcinek z wymaganym podziałem; RED→GREEN. Test wspólnych punktów, uporządkowania i pokrycia całego parametru.
3. Zero-chord, stały odcinek, ujemne współrzędne i niepłaski cubic. Zdarzenia te nie są świadectwem prostoty/cut.
4. Każdy limit dokładnie i limit+1, maxDepth0, mały shared ctx, sparse/getters/forgeries, niemutowalność i brak częściowego wyniku.
5. Kontrola dokładnego bound dla każdego liścia. Dodatkowe próbkowanie może wykrywać regresje, ale nie zastępuje bound.
6. Test eksportujący rzeczywiste udane wyniki tylko przy `ORTHO_BEZIER_EVIDENCE_OUT` do wskazanej przez rodzica ścieżki scratch. Domyślnie żadnych zapisów. Niepisany ręcznie bundle obejmuje przynajmniej liniowy, zakrzywiony, niepłaski, zero-chord, stały i ujemny przykład. To wejścia syntetyczne, nie dane pacjentów.

## 4. Niezależny weryfikator B

Własność: `tests/reference/v03_bezier_verify.py`, `tests/reference/test_v03_bezier_verify.py`. Nie czytać `bezier.ts` ani jego testu i nie pisać fixture z rzekomymi wynikami TS. Używać wyłącznie tego kontraktu i stdlib Fraction.

Format rzeczywistego eksportu A:

```text
{format:'OrthoSculptBezierProof',version:1,cases:[
 {id:string,input:{controls:[4][3] Rat,tolerance:Rat},
  result:{kind:'cubic-parametric-bound-v1',samples:[{t:Rat,point:[3]Rat}],
          leaves:[{t0:Rat,t1:Rat,controls:[4][3]Rat,upperSquared:Rat}],maxUpperSquared:Rat}}
]}
Rat = {n:canonicalDecimalString,d:canonicalPositiveDecimalString}, gcd-reduced, zero0/1.
```

- Użyć metody innej niż produkcyjny de Casteljau + maksimum norm D: przekształcić root cubic do bazy potęgowej, exact podstawić `t=t0+(t1−t0)u`, porównać tożsamość wszystkich współczynników z liściem. Sprawdzić dokładnie próbki, końce i ciągłe pokrycie [0,1].
- Odjąć cięciwę od subwielomianu w bazie potęgowej, obliczyć squared norm wielomianu stopnia≤6 i przeliczyć do bazy Bernsteina stopnia6. Jego największy współczynnik jest niezależną konserwatywną granicą na całym [0,1]. Musi być ≤ zgłoszonego upperSquared i ≤ tolerance²; nie używać gęstych próbek jako PASS.
- Sprawdzić dokładnie `0 ≤ upperSquared ≤ tolerance²` dla każdego liścia, normatywny zakres tolerance i równość maxUpperSquared z max liści. Mniejsze od zgłoszonego współczynniki są poprawne: bound może być konserwatywny. Nie żądać identycznego algorytmu ani rzeczywistego maksimum krzywej.
- Publiczny `verify_bundle(document)` zwraca małe podsumowanie kompletnego PASS albo odmawia (TypeError/ValueError lub własny błąd budżetu); CLI `--input <plik>` zwraca JSON z `passed` i liczbami, exit0 tylko przy pełnymPASS. Error bez surowych punktów, nie zwracać połowicznego sukcesu.
- Bramka pliku16MiB przed read/JSON; max64cases, sumarycznie≤20000liści; liczby/rozmiary/kształty/densekeys kontrolowane. Max4096bitów na wejściowy integer i limit długości przed int. Weryfikator też ma ograniczony licznik operacji/rozmiaru pośredniego; budżet odmowy nigdy nie staje się PASS. Nie jest to gwarancja RSS/czasu całego procesu.
- TDD: poprawny syntetyczny liniowy certyfikat, potem negatywne: podmienione punkty/kontrola/ułamki, nieprawidłowy bound, luka/nakładanie parametrów, fałszywy subodcinek z dobrymi endpointami, zmiana max, zła tolerancja/typy/puste/wejście oversize. Celowo skażone dane są negatywnymi kontrolami, nie rzekomymi wynikami TS.
- Testy mogą konstruować własne dokładnie uzasadnione przypadki w pamięci; nie twierdzić, że uruchomiono TS dopóki rodzic nie przekaże rzeczywistego bundle. Obsługę obu metod dowodowych oceni niezależny reviewer.

## 5. Odbiór rodzica i dalsze bramki

- Sam uruchamiać targeted Vitest z eksportem do nowego scratch pliku oraz unittest weryfikatora; sprawdzić plik faktycznie powstały i uruchomić na nim niezależny CLI. Nie zastępować nieudanego kroku sfabrykowanym bundle.
- Sprawdzić minimum jedno skażenie kopii rzeczywistego bundle (bez zmiany oryginału) i jego odmowę; policzyć rzeczywiste cases/leaves w kodzie.
- Spec/math i quality/security review, pełny sekwencyjny Node zestaw z realWorker/PDF, wszystkie Python unittest oraz TypeScript. Zachować każdy FAIL i naprawiać przyczynę, bez osłabiania bound.
- Commit dopiero po odebraniu. Nie nadpisywać freeze0.2.0. Ten etap to tylko lokalna aproksymacja; światowa krzywa na siatce/prostota, pełny cut/embedding i shell+kołnierz pozostają osobnymi nieukończonymi bramkami.
