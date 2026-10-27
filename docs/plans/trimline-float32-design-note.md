# Uwaga projektowa: punkt cięcia Float32 a strona oryginalnej powierzchni

Status: rzeczywiste obliczenie pomocnicze podczas projektu, NIE test gotowej funkcji CAD. Kontrprzykład został potwierdzony przez niezależnego reviewera. Zakres produktowy (gładka linia 3D, niepłaska powłoka i zewnętrzny kołnierz) jest zatwierdzony; doprecyzowany kontrakt uzyskał niezależny rereview PASS do M0, `Reviewpassed=true` dla projektu. Wynik: `../verification/v03-design-rereview.json`. Nie zmieniono kodu aplikacji i nie wykonano testów implementacji. Normatywny integrator: `trimline-v03-integrated-design.md`, §2–5.1 i kryteria §7.1; ma pierwszeństwo nad sprzecznymi zdaniami dwóch opracowań wejściowych.

## Obserwacja

W narzędziu Python obliczono punkt ze źródłowych Float32 za pomocą `fractions.Fraction`, po czym zapisano jego współrzędne przez `struct.pack('<f', ...)` i odczytano Float32. Dla tego konkretnego przykładu konwersja przechodziła przez Float64; nie jest to algorytm poprawnie zaokrąglający każdą dowolną liczbę wymierną.

- Ściana: `(0,0,0)`, `(1,0,1)`, `(0,1,a)`, gdzie `a = Float32(0.3) = 0.30000001192092896`.
- Wagi: dokładne `1/3, 1/3, 1/3`.
- Punkt Float32: `(0.3333333432674408, 0.3333333432674408, 0.4333333373069763)`.
- Dokładne residuum płaszczyzny `z - x - a*y`, obliczone z reprezentowanych liczb, wyniosło `-7270127/562949953421312`.
- Jest ujemne: jeśli ta półprzestrzeń jest wnętrzem, punkt znajduje się po stronie wewnętrznej zamiast dokładnie na pierwotnej ścianie.

Nie wynika z tego awaria aktualnego programu, nieprawidłowość kliniczna ani uniwersalny rozmiar błędu. Wynika, że projekt nowego cięcia nie może jednocześnie zakładać dowolnych nowych punktów Float32 oraz ich ścisłej współpłaszczyznowości z każdym oryginalnym trójkątem.

## Konsekwencja i doprecyzowany kontrakt do rereview

Test żądający, by każdy punkt nowego rimu poza samym brzegiem leżał ściśle poza pierwotną niepodzieloną powierzchnią, może odmawiać także z powodu samej kwantyzacji. Nie wolno obchodzić tego globalnym epsilon ani ogłaszać pełnego PASS po pominięciu par źródło–rim.

### 1. Źródło, odwzorowanie całej powierzchni i osadzenie (bloker B1)

- S oznacza **pełny skorygowany model bezpośrednio przed cut**, zachowany bez zmian; nie surowy skan ani pełną bazę B. Podział exact w chartach obejmuje OBA fragmenty i definiuje pełną domenę D. Każdy exact subtrójkąt o pozycjach `p_i` na S ma odpowiadające mu `q_i` w pełnej zamkniętej konstrukcji Float32 C, po pojedynczym poprawnym zaokrągleniu wspólnych zdarzeń. Definiuje to `Q(sum λ_i p_i)=sum λ_i q_i`; Q jest ciągłe, kawałkami afiniczne, zgodne na wszystkich wspólnych E/V, także między retained a discarded. Nie jest to pokrywa, nearest-point ani rekonstrukcja brakującego skanu.
- **Certyfikować `δ_C=max_{x∈S} ||Q(x)−x||₂ ≤0,010 mm` na całej powierzchni obu części**, nie tylko na linii ani próbkach. Na każdym subtrójkącie przemieszczenie jest afiniczne; norma jest ograniczona przez maksimum norm przemieszczeń w jego wierzchołkach, które należą do domeny. Maksimum zdarzeń jest więc maksimum całej powierzchni. Porównania wymagają exact/konserwatywnej granicy (np. kwadratów norm), nie zaokrąglonego wyświetlenia. To dowód metryczny, nie topologiczny.
- Wspólny budżet: hit/kanonizacja ≤0,005 mm, dwustronna certyfikowana aproksymacja gładkiej krzywej ≤0,005 mm, kwantyzacja C ≤0,010 mm; suma **0,020 mm**, sprawdzona wymiernie. Każdy składnik jest obowiązkowy, bez pożyczania tolerancji i ukrytych dodatków. Dawne 0,01+0,01 mm jest zastąpione; sampler profilu outer/ramki nie ma prawa dodawać ruchu inner/linii. Są to tolerancje obliczeniowe, nie kliniczne.
- Zachować topologię exact podziału i orientację, bez sklejeń różnych zdarzeń, T-junction, epsilon-weld, jitter, sliver collapse ani innych napraw. C wymaga pełnego audytu niezależnie od S. Małe δ_C i poprawne siatki końcowe nie wykluczają zamiany położenia bliskich płatów.
- Dla bliskich płatów wymagany certyfikat zachowania osadzenia, np. konserwatywna separacja nieincydentnych obszarów większa od sumy ich przemieszczeń z osobnym dowodem lokalnych incydentnych wachlarzy, albo bezkolizyjność `Q_t=(1−t)id+tQ` dla całego `t∈[0,1]`, również bez degeneracji/zmiany orientacji. Nie wymagać separacji na legalnych E/V ani nie zwalniać całych sąsiednich par. **Wybór i niezależna walidacja metody należą do M0; niczego takiego obecnie nie wdrożono ani nie potwierdzono.** Brak dowodu/near-touch/limit → UNKNOWN; utrata osadzenia → FAIL. Oba blokują powłokę.
- Podział, provenance i zaokrąglenie OBU części muszą odtwarzać C po reload; skażenie wyłącznie discarded przy zgodnym retained odrzuca projekt przed instalacją, nawet po przeliczeniu digestów. Pełna baza B i interpolowana referencja wymagają osobnej rekonstrukcji, limitu kwantyzacji ≤0,010 mm i audytu przydatności; ten limit nie jest dodatkowym błędem S→C. Ich FAIL/UNKNOWN blokuje zależne porównanie/eksport referencji, nie nadaje outward bazie lub otwartej referencji. Owned RAM obejmuje S, C obu części, retained, bazy, provenance, audyty/certyfikaty, kopie i Undo według rzeczywistej własności; współdzielone bufory raz, każda kopia osobno.

### 2. Normatywne wnętrze, normalne i strona (bloker B2)

- Retained cut R jest **bitowo zachowanym podzbiorem C**. Wnętrze shellu to dokładnie R, z tymi samymi pozycjami, atrybutami, mapowaniem i triangulacją; dla granicy materiału odwraca się winding, nie geometrię. Nie obiecuje to współpłaszczyznowości z pierwotnymi F w S.
- Kandydat pola normalnych może pochodzić z pełnego outward S (proponowane ważenie kątami Float64, interpolacja i normalizacja z provenance). Metodę trzeba wersjonować i zamrozić w M0. Nie dowodzi ona poprawnego kierunku na C: potrzebna niezależna weryfikacja względem jego incydentnych F, również discarded na granicy, oraz gotowej geometrii Float32 względem CAŁEGO C.
- Outside, całe odcinki offsetu, outer/kołnierz i wnętrza pasów rimu kontrolować względem **OBU części C**. Legalny kontakt rimu z C wyłącznie na granicy z provenance; odcinek offsetu startuje w p na R, a cała reszta musi być outside bez ponownego kontaktu/wejścia. Outer/kołnierz nie ma zwolnienia; nie wyłączać całych par F. Inward offset/ponowne wejście lub kolizja tylko z discarded także blokuje, nawet przy dodatniej objętości finalnego shellu. Brak kompletnej klasyfikacji → UNKNOWN/blokada.
- Etykieta PASS dotyczy strony względem C i wymaga osobnego certyfikatu S→C; **nie oznacza ścisłego no-penetration pierwotnych niepodzielonych F w S**. Audyty S, C, bazy/referencji i shellu pozostają rozdzielone. Ujemne residuum powyżej nie jest naprawiane liberalnym epsilon ani pomijaniem par źródło–rim.

### 3. Refinament zatwierdzonego kołnierza (bloker B3)

- Po zamrożeniu C/R nie dodawać niezależnie zaokrąglanych inner V ani punktów linii. Nowy barycentryczny V Float32 nie musi leżeć w istniejącej F/E, więc nie ma bezwarunkowego zachowania PL. Refinament outer/rim-only jest dopuszczalny tylko bez zmiany inner/linii i bez T-junction, z pełnym ponownym audytem.
- Jeśli potrzebny jest inner refinement, włączyć go do wspólnego exact podziału OBU części przed akceptacją final cut albo jawnie zregenerować pełną konstrukcję z nowym preview obu części, zgodą operatora, provenance, bazą/referencją, tożsamościami i wszystkimi audytami/certyfikatami, w tym samym budżecie. Stare dowody i eksport są nieważne; jeden przepis v3 zostaje zastąpiony, bez ukrytego drzewa cięć. Nierozstrzygnięcie → odmowa bez publikacji.

## Powiązanie z odbiorem

Integrator §7.1 określa konkretne, dopiero przyszłe kryteria: B1-AC1–3 (maksimum na całej powierzchni/budżet, bliskie płaty, discarded-only reload/baza/RAM), B2-AC1–2 (bitowe inner i uczciwa etykieta, kierunek/offset/rim względem obu części C), B3-AC1–2 (outer-only bez zmiany inner, odmowa lub jawna pełna regeneracja inner). Pozostałe ograniczenia nie są osłabione: brak ukrytej cap, korekty na pełnym zamkniętym S i ponowny cut, legacy osobno, geometryczne FAIL/UNKNOWN blokuje, ogólne minimum-thickness pozostaje UNKNOWN i dopuszcza wyłącznie oznaczony eksport badawczy z potwierdzeniem. To niezależnie przyjęty projekt do M0, nie wykonane testy funkcji ani odbiór kliniczny; `Reviewpassed=true` nie oznacza ukończenia implementacji.
