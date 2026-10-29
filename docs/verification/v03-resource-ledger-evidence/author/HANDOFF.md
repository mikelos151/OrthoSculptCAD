# HANDOFF — pełny prymityw G1a resourceLedger

## Wynik i zakres

Implementacja kompletnego kontraktu G1a (§5.1.1, dziewięć wierszy macierzy) gotowa do niezależnego replay/review rodzica. Nie jest to source admission, AuditedSource, App/Worker integration, native transport, potwierdzenie G1b/G2–G4 ani odbiór kliniczny/native EXE. Brak stage/commit/reset/stash, instalacji, zmian deps/config/skills/profiles/dist/ZIP.

Utworzono dokładnie dwa pliki w repo (przed pierwszym zapisem potwierdzono brak obu):
- `src/compute/resourceLedger.ts`
- `tests/v03-resource-ledger.test.ts`

Własne dowody i ten handoff: `C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-resource-ledger-ts/`.
147 istniejących plików src/tests ma identyczne SHA start/end. SourceCandidate pozostaje `983f07ae42f458e27a253b401e56838fb41c562c70524409510d1abe10b4254b`; plan pozostaje `800d85f0f368d76b3c7e8ae4ed908ebc9dec6b11f51c5c5eaf0c5112374ad3ce`. HEAD pozostaje `f288ffccb0d1eb2f2f901d9a03e1daa408b289db`. Zmieniające się untracked docs są własnością rodzica i nie były zapisywane tutaj. Hash obu nowych plików: `handoff.json`.

## API / exports

Runtime exports: `createResourceLedger`, zamrożone `DEFAULT_RESOURCE_LIMITS`.
Type exports: `Category`, `Refusal`, `Realm`, `Ref`, `PlanEntry`, `Lease`, `Limits`, `ControlLimits`, `LedgerInternals`, `ResourceLedger`, `ResourceLedgerSnapshot`.

```ts
const ledger = createResourceLedger(); // managed 402653184, job/history 134217728 B
const main = ledger.createRealm(); // wyłącznie trusted composition
const result = ledger.reserve([{ key: 'arena', bytes: 256, category: 'job', owner: main }]);
// Refusal ma { ok: false, code: 'BUDGET' }; lease/ref nie ma kodu.
if (!('code' in result)) {
  const ref = result.ref('arena');
  const nativeBacking = result.allocateBuffer(ref);
  // anotherLease.retain(ref, category, main) => odrębny Ref tego samego allocation
  result.close(); // wygasza wyłącznie własne owning refs
}
```

- `lease.ref(key)`, `allocateBuffer(ref)`, `retain(from, category, owner)`, `reclassify(ref, category)`, `release(ref)`, `close()`, `transfer(ref, target)`.
- `ledger.registerExisting(actualArrayBuffer, targetLease, category, owner)` to **wewnętrzny trusted ingress UI/history**, nie authority pochodząca z pliku/JSON. Wejście tylko ArrayBuffer; adapter widoku musi przekazać rzeczywiste `view.buffer`. SAB/RAB/detached/views/wrappers są odrzucane. Intrinsic byteLength ignoruje own-property override.
- `ledger.snapshot()` zwraca głęboko zamrożony diagnostyczny graf: liczniki oraz allocation `id`, `bytes`, `realm`, `phase` i refs `{id, category}`. Żadnych backing buffers, capability objects ani mutowalnej tabeli. Numery ID nie są authority.
- Realm/Ref/Lease są sprawdzane prywatnymi ledger-local weak identities. `structuredClone(ref)` / JSON / string / foreign ledger / cudzy lease nie tworzą authority. Lease methods sprawdzają również receiver (`call`). Retired release i ponowne close są no-op; retired transfer/retain są INVALID_INPUT, closed authentic operation CLOSED, foreign/forged przed CLOSED.
- Rezerwacja liczy cały plan przed pierwszym native payload allocation. Cały backing raz managed i raz w każdej obecnej kategorii job/history, także jednocześnie 2D przy managed D. `reclassify` dotyczy jednego ref. `close` nie usuwa refs innego lease. Controlled hold jest realnym owning ref w drugim lease.
- `allocateBuffer` raz na reserved own ref, rzeczywisty fixed native ArrayBuffer o dokładnym rozmiarze. Błąd allocator/validation wycofuje wyłącznie tę niezmaterializowaną rezerwację; inne klucze/refs pozostają. Nie wolno retain reserved ani allocate retained.
- `transfer` jest **wyłącznie checked logical handoff**: tylko jeden live owning ref backing (controlled też liczy się), ten sam ID/bytes/category, nowy realm. Bez detach/postMessage/ACK/SHA/Worker. Aliasy dają TRANSFER_ALIASED bez zmiany; retain do innego realm zwykłego AB odmawia. Native transport i lifecycle należą do G1b.

## Bounded control bookkeeping i ograniczenia

Domyślne techniczne limity control records: 1024 aktywne lease, 8192 aktywne refs (więc też nie więcej allocations), 32 realm registrations na życie ledgeru, 1024 wpisy jednego planu, key max 128 UTF-16 code units. Close/release oddaje sloty lease/ref; realm cap nie jest recyklingowany. ID monotonically increasing safe integers; wyczerpanie odmawia. Weak retired auth nie trzyma payload allocation; jego liczba zależy od zachowanych przez callera obiektów, nie rosnącej silnej tabeli ledgeru. Snapshot jest bounded bieżącym grafem. To nie dowód pamięci JS/GC/WeakMap overhead/RSS ani sandbox dla arbitralnego JS.

Drugi argument factory `LedgerInternals` jest oznaczonym **trusted composition/testing seam**, nigdy parametrem pliku: `allocate(bytes)` do obserwacji rzeczywistych alokacji/fault injection oraz `controls` do małych testów. Zwrócony backing jest walidowany intrinsic; duplikat już śledzonego backing odrzucony. Test awarii rzuca deterministyczny RangeError przy drugim małym allocation; nie próbowano wyczerpywać hosta. Konsument nie może używać backing po release własnego ref ani wykonywać zewnętrznych niekontrolowanych detach; takie zachowania nie są sandboxowane. Wykryty detached live backing nie zostaje ponownie retain/reclassify/transfer ani automatycznie uznany za zwolniony.

## Pionowe TDD — rzeczywiste logi

14 funkcjonalnych cykli, każdy z rzeczywistym exit 1 przed minimalnym kodem i exit 0 po nim. Pierwszy RED: istniejący scaffold odmawia poprawnej rezerwacji, nie import/missing module i nie celowo dodany over-cap bug.

1. native exact-limit reserve/allocate;
2. atomic managed/category/overflow/plan validation przed allocator;
3. shared retain, reserved-phase rejection, history refusal/acceptance;
4. pojedynczy reclassify i category rollback;
5. close własnego lease, controlled hold, retired h1 vs pending h2;
6. allocator throw rollback, fixed native buffer validation;
7. intrinsic backing registration/subviews, graph snapshot i distinct copy;
8. sole-ref checked logical realm handoff;
9. auth wszystkich capability granic / retired-transfer priorytet;
10. bounded controls (także zero-byte i empty lease);
11. allocator backing reuse / real detached backing;
12. sparse malformed plan atomically rejected;
13. proposed defaults;
14. reserved-phase vs closed-target priority po auth.

Każda faza ma `NN-RED.command.txt`, `.log`, `.exit.txt`, analogiczne GREEN i pełny mały snapshot dwóch plików w `phases/<label>/`. Zachowano również nieudaną konstrukcję testu `12-RED`: test niespodziewanie przeszedł, bo sparse fixture miała duplicate key i wcześniejsza walidacja maskowała hole. Poprawiono fixture na distinct drugi key (bez zmiany kodu), `12b-RED` rzeczywiście zawiódł, potem minimalny `Array.from` usunął hole/partial-publication risk. Nie przedstawiamy pierwszego jako RED. Dwa dodatkowe testy `conformance` (dokładny wiersz 1024 i existing ingress) to późniejsze characterization testy zachowania rozwiniętego wcześniej, nie nowe cykle RED.

`tsc-01` ujawnił TS7053 przy indeksowaniu po Array.isArray; poprawiono typed PlanEntry callback i pojedynczy snapshot pól przed walidacją. `tsc-final` przechodzi. Nie osłabiano asercji ani nie kopiowano SPEC modelu/witness jako runtime implementacji.

## Weryfikacja wykonana

- Ledger: **16/16 PASS**, zero skip.
- Ledger + SourceCandidate + numerics/oracle + face cubic + Bezier: **890/890 PASS, 6 plików**, zero skip (`17-final`).
- Pełny projekt `node node_modules/typescript/bin/tsc --noEmit`: exit 0 (`tsc-final`).
- Samodzielna kompilacja modułu do własnego scratch: exit 0 (`tsc-emit`).
- Rzeczywisty standalone Node/V8 smoke skompilowanego produkcyjnego modułu: exit 0; native AB 768 B, overlap caller/controlled, alias refusal, sole logical transfer, cloned ref rejection, końcowe zero (`native-smoke.log`). Node v24.19.0 / V8 13.6.233.17-node.51. To nie native Worker test.
- `verify-artifacts.py`: exit 0, sprawdza logi/exit/snapshot każdej fazy, baseline SHA 147 plików, dokładnie dwa nowe src/tests, liczby testów i hashes (`artifact-verification.log`, `handoff.json`).
- Tracked diff i staged diff puste. Nowe dwa pliki nadal untracked, zgodnie z poleceniem.

Replay:
```bash
bash C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-resource-ledger-ts/run.sh parent-replay tests/v03-resource-ledger.test.ts
bash C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-resource-ledger-ts/verify.sh
python C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-resource-ledger-ts/verify-artifacts.py
```

Vitest ograniczony process-only NODE_OPTIONS 256 MiB/semi8, maxWorkers=1, no-file-parallelism. TSC 512 MiB/semi8. Nie uruchamiano pełnej bazy 1208/PDF/browser ani Python 71 — te bramki pozostają rodzicowi do serial acceptance. Nie zaliczano ich na podstawie wybranych 890 testów. Nie ma source admission, private S, audit/geometry hooks, areny, pool, owner ani integracji App. Zgodnie ze scope nie zapisywano skills, nawet mimo odkrytego powtarzalnego workflow; dowody i run helper wyłącznie we własnym scratch.
