# Niezależny SPEC / ownership review

**Scoped PASS — G1b1bInputOnly.** Brak znalezionych blokerów security/logic w dostarczonych czterech plikach. To opinia review dla rodzica, nie odbiór pełnego G1b ani CAD.

## Co sprawdzono
- Wszystkie cztery rzeczywiste pliki, diff ledgeru i pełny oryginalny ledger z `git show HEAD:src/compute/resourceLedger.ts`; odniesienie do zamrożonych reguł same-core, ownership, kategorii i ABI. Istniejący pool przeczytany readonly jako zależność kompozycji; publiczny compute/index nie eksportuje nowej authority.
- `resourceLedger.ts:56–61,63–90,144–184`: jeden rdzeń allocations/backings/refs; PREPARED przenosi ref do prywatnego lease, usuwa caller key, blokuje zwykłe operacje. Attached rollback zachowuje oryginalny ref, klucz, allocation, owner i licznik. Nie ma shadow payload copy.
- `resourceLedger.ts:92–142`: detach obraca ref, usuwa stary wrapper z backing map; stare refy nie odzyskują allocation. Powrót waliduje całą grupę przed zmianą. Publish tworzy najpierw consumer refs, potem usuwa controlled refs; nie zamyka source ani consumer. Refusal closed/foreign/capacity jest atomowy. Kategorie są zachowane; późniejsze retain/reclassify egzekwują union/caps G1a.
- `nativeHandoff.ts:72–82,113–178`: prywatny Worker/URL/binding i dokładna korelacja przed przejściem. Maks. dwa pending/nieodebrane wyniki na instancję; wynik nie wychodzi przez wait. Accept uwierzytelnia lease tego samego rdzenia. Fizyczny pool pochodzi z zaakceptowanego G1b1a, a trzy domeny są przechwycone bez drugiego ledgeru.
- `nativeHandoff.ts:30–60` i `nativeHandoff.worker.ts:9–30`: dokładny envelope, 64 B LE header, reserved zero, 12 B descriptors, role 1–9, maks.16, intrinsic fixed/distinct AB; jawny podzbiór typów 1/2/3. Endpoint zwraca dokładnie przyjęte backingi i sprawdza detach. Jednorazowe generation=n=1 to jawny zakres, nie reuse/owner implementation.
- Cleanup usuwa własne controlled refs, a nie unrelated source/history refs. Main RETURNED i release po publikacji nie zdejmują consumer charge. Domyślny ledger zachowuje runtime reserved/live.

## Własne wykonanie
`bash C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-handoff-spec-review/run-witness.sh <nowa-etykieta>`

- Strict TS, `types: []`, ES2022+DOM, heap128/semi8: exit0. Kompilowane rzeczywiste moduły repository; wyłącznie specifiery importów w emitowanym scratch JS są relinkowane dla Node.
- **153 assertions / 10 scenarios PASS**, actual API + structuredClone. Obejmuje trzy kategorie, dokładny rollback, partial-detach cleanup, malformed batch, category refusal, partial release, foreign/closed consumer, atomowy batch-publish przy 8191 refs, cap2 i retired-handle isolation.
- **5 constructors / 5 terminates** dotyczą wyłącznie jawnego **UNIT Worker double**, nie native proof. Native/browser/full-suite replay pozostawiono rodzicowi; nie uruchamiałem ich równolegle.
- Pierwszy strict compile świadka odrzucił źle zawężony generic w mojej uprzęży; poprawiono tylko uprząż. To nie RED implementacji. Zachowane command/exits/rawlogs i snapshot. Początkowy audyt z child-process git nie miał stdout i skończył TypeError; shell git uzyskał oryginał z exit0.

## Audyt TDD / pochodzenia
- Manifest autora: SHA256 `4d84e1210ab8911966020b5beb264c656b444b05798edcfe01292b7e9f37480d`; **369/369** entries bytes+hash zgodne. Dodatkowo **125/125** source/test snapshot hash checks zgodne.
- **6 rzeczywistych par exit1→exit0**, z identycznymi testami/fixture w parze: prepare, structuredClone roundtrip, native-composition scaffold, private PREPARED owner/key, native RESERVED phase, native header-control bound. Przeczytane failure logs i konkretne snapshoty/diffy; trzy scaffold failures odmawiają legalnego API, nie są import/bootstrap errors ani negatywną mutacją gotowego kodu.
- Legacy native failure jest oddzielnym gap witness na niezmienionym G1a, nie siódmą parą implementacyjną. Coverage od razu GREEN, oba wcześniejsze TS exit2 i OOM exit134 nie są liczone jako behavioral RED.
- Finalne 68 UNIT / 71 native checks są danymi autora z zamrożonych artefaktów, nie moim ponownym native/full-suite wykonaniem.

## Sugestia nieblokująca
Przenieść po odbiorze przypadki partial-detach i batch-publish przy ref-cap do testów regresyjnych projektu. Zachowanie obecnej implementacji przeszło niezależny świadek; brak tych dwóch konkretnych testów w dostawie nie jest znalezionym błędem.

## Granica opinii
Nie przyznaję tutaj G1b1c graceful lifecycle/main-SHA holds/deadline matrix, worker-clock, remote-new/native-output grants, App singleton/global cap migration/G1b2, ACTIVE/admission/G2/G3, pełnego CAD ani RSS. Nie używam późniejszych bramek jako wymówki dla błędów bieżących ścieżek — w sprawdzonych ścieżkach takich blokerów nie znaleziono. Wszystkie zapisy są w dedykowanym scratch review; repo/skills/config/index/dependencies pozostają bez zmian.
