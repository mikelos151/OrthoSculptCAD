# HANDOFF — G1b1b input native handoff

**Dostarczona implementacja do niezależnego review/odbioru rodzica; nie deklaracja odbioru G1b ani CAD.**

Repo: `C:/Users/sandr/OrthoSculptCAD`, HEAD bez zmian `25980b612ced5dc79ce966208cb7ce4edbb1546b`.
Scratch/dowody: `C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-handoff-core/`.

## Wynik
- Rzeczywisty Chromium `156.0.8078.4`: G1a materializuje/rejestruje rzeczywisty AB → native START odłącza main wrapper → endpoint waliduje i zachowuje dokładnie odebrane backingi → RECEIVED → native RETURN odłącza worker wrappers → prywatny same-core rebind do tych samych allocations.
- Oryginalne 16 bajtów i niezależnie porównany SHA-256 zachowane; JS wrapper po powrocie inny. Allocation ID, rozmiar i global/category charge bez duplikacji. Nie ma `registerExisting` powrotu, drugiego ledgeru ani shadow payload copy.
- PREPARED przenosi sole ref do prywatnego lease, zawiesza caller key/operacje/close; detach wycofuje dawną capability i obraca ją na nowy prywatny controlled ref. Attached rollback odtwarza dokładnie stary ref/key/owner/charge; stary detached wrapper/ref nie odzyskuje authority.
- Jedyny transport factory jest zamknięty w kompozycji. Zamrożony pool jest składany bez zmian; jego 3 domeny są przechwytywane przez fasadę tego samego ledgeru, nie tworzone ponownie per request. Maksymalnie 2 Workers oraz 2 nieodebrane/pending rezultaty na instancję; trzeci BUSY bez constructor/send/detach.
- `wait(handle)` nie zwraca payloadu. Dopiero `accept(handle, consumerLease)` tworzy owning consumer refs w tym samym rdzeniu, następnie wycofuje controlled refs i udostępnia bufory zaufanemu konsumentowi. To nie capability do source/admission ani G4 publication fence.

## Dozwolone zmiany
1. **Zmodyfikowano wyłącznie istniejący** `src/compute/resourceLedger.ts`: wewnętrzny wspólny rdzeń + osobny `createNativeLedger`, prywatne tickets/bindings, PREPARED/IN_FLIGHT/REMOTE/RETURNING/MAIN, atomowy rebind/rollback/cleanup. Domyślne `createResourceLedger` nadal ma tę samą powierzchnię i runtime reserved/live; odebrane testy bez zmian.
2. Nowy `src/compute/nativeHandoff.ts`: input-only codec i kompozycja pool/core/native Worker, opaque handles, exact correlation, fail-closed guards, main-only deadline guards, consumer adoption.
3. Nowy `src/compute/nativeHandoff.worker.ts`: geometry-free kontrolowany endpoint input START/RECEIVED/RETURN, bez caller replacement i bez payload allocation. Reużywa rzeczywiście odebranych header/descriptors: maks. 4 logicznie posiadane nagłówki na slot, bez obietnicy GC/native working set.
4. Nowy `tests/v03-native-handoff.test.ts`.

Żadnych edycji poola/odebranych testów, compute index, App, planów ani verification docs. Nie wykonywano stage/commit/reset/stash/clean, instalacji, zmian profilu/skills ani build/replacement dist/ZIP. Start/end hash map obejmuje 2602 tracked pliki: zmienił się wyłącznie dozwolony ledger; pozostałe **2601 identyczne**. Ignored/untracked release dist/ZIP nie były w start mapie — nie deklaruję ich niezależnego porównania start/end; nie uruchomiono polecenia, które je przebudowuje/zastępuje.

## ABI / authority
- Normy pozostają identyczne: owner-design `800d85f0f368d76b3c7e8ae4ed908ebc9dec6b11f51c5c5eaf0c5112374ad3ce`; broker-design `45cc11a03a92218670bff1fdf77d5fcd1c8f089a318044bdfe9269cecd1285a3`.
- Header dokładnie 64 B LE, magic/version/type/slot/incarnation/generation/job/request/transfer/window, nonce16, reserved zero. Brak czasu na wire. Descriptors 12*n, n<=16, frozen roles 1..9, fixed/distinct intrinsic ABs, zamknięty envelope.
- Zaimplementowany wyłącznie podzbiór START=1 / RECEIVED=2 / RETURN=3; inne operacje odmawiają, nie udają grants/arena/lifecycle. One-shot physical binding ma generation=1 i n=1; kolejny submit tworzy nową inkarnację/nonce. Overflow uint32 zamyka kompozycję.
- Kolejność: captured exact Worker/private binding → closed schema → exact tuple/nonce/ordered plan → transition. Nie ma autoryzacji mniejszym numerem, diagnostic ID, hashem ani równymi bajtami.
- Snapshoty nie zawierają Worker, nonce, ticket/rebind authority ani payload buffers. Publicznego transport hooka/factory/URL lub flagi prevalidated nie ma.

## Faktyczna weryfikacja końcowa
- **UNIT 68/68, skip=0:** 16 odebranych G1a + 24 odebranych pool + 28 nowych. To Node/structuredClone/API/codec, nie native Worker proof.
- **Native 71/71 checks**, 12 rzeczywistych constructor i 12 terminate API invocations, peak=2, live=0. DevTools zaobserwował 9 endpoint Workers i 9 close przed zamknięciem context; 3 bardzo krótkie Workers (DataCloneError, alias, duplicate preflight) zakończono przed attach DevTools. Te liczby są rozdzielone, nie zsumowane.
- 9 real native RETURN groups, wszystkie worker-side intrinsic detached; obejmuje batch16 i fixed zero-byte AB. Native received/return/terminate chronologie i ledger snapshots zapisane.
- Genuine Chromium DataCloneError przez real native postMessage próbujący sklonować funkcję: attached AB, dokładny rollback całego grafu/ref/key/owner/charge, brak reply. To testowa modyfikacja argumentu przed real native call, **nie mock/fabrykowany throw**.
- 4 malformed RETURN warianty: padding, dodatkowy envelope key, descriptor bytes, nonce. Test-only server prefix zmienia control metadata tuż przed real native postMessage; faktyczne odebrane payload ABs i ACK nie są zastępowane. Main odmawia bez rebind/publication i kończy Worker. Served variants oraz prefix są jawnie zhashowane.
- Alias/duplicate/forged/diagnostic-ID/equal-byte lookalike/cross-composition handle refusal, rzeczywisty MessageChannel clone handle bez authority, double accept, retired h1 release przy nowym h2, closed-consumer atomic refusal.
- Mały strict compile heap128/semi8 PASS; pełny projektowy `tsc --noEmit --incremental false` heap512 PASS. **Nie uruchamiano pełnego suite projektu** — własność rodzica.
- Brak nieoczekiwanych page errors / zewnętrznych requestów. Context/browser/server zamknięte, port odmawia połączenia. Logiczne charges/pending własnych testów wyzerowane; nie deklaruję thread join/GC/RSS.
- Static scan nowych linii i nowych plików: zero findings. `git diff --check` PASS.

## TDD i zachowana historia
Każdy `phases/<nazwa>/` zachowuje command/actual exit, stdout, stderr i dokładne source/test snapshots. Native fazy mają też rzeczywiste served modules, fixture, hashes i native-results. Pełny indeks: `phase-index.json`.

Piony behawioralne:
- `native-legacy-red` (exit1): niezmieniony odebrany G1a z real Worker; stary detached ref odmawia, naiwny ingress podwaja charge, wymagany rebind nie istnieje.
- `core-prepare-red` → `core-prepare-green` (1→0): legal prepare w minimalnym niefunkcjonalnym scaffoldzie.
- `core-roundtrip-red` → `core-roundtrip-green` (1→0): actual structuredClone transfer i same-core rebind; **UNIT**, nie native.
- `native-composition-red` → `native-composition-green` (1→0): legal native START odmawiał w scaffoldzie; następnie real endpoint roundtrip.
- `prepared-private-owner-red` → `prepared-private-owner-green` (1→0), następnie native replay: source key musiał zniknąć podczas prywatnego PREPARED, nie tylko metadata lock.
- `native-reserved-phase-red` → `final-unit` (1→0): natywny RESERVED nie myli się z MAIN/legacy reserved.
- `native-header-bound-red` → `native-header-bound-green` (1→0): rzeczywista worker-side obserwacja identity controls wymusiła reużycie incoming controls, bez dorabiania RED mutacją działającego kodu.

Nowe negatywne assertion matrices, które od razu były GREEN, są **coverage**, nie zgłaszanym RED. Import/syntax/type failures nie są behavioral RED. Zachowano oba TS exit2 (narrowing; ES2022 RAB fixture overload), ich poprawki i późniejsze strict/full PASS. Zachowano też OOM exit134 w pierwszym heap128 compile: automatyczne ambient @types były zbyt duże; scratch-only `types: []` ogranicza mały compile do modułów przeglądarkowych, a pełny oryginalny projektowy tsc512 również PASS. Nie usunięto/nie nadpisano dawnych wyników ani digestów.

## Odbiór i późniejsze bramki
**Do rodzica:** niezależny spec/code review tych 4 plików + full regression/evidence/commit. Ten autor nie nadaje sobie niezależnego PASS.

Nieodebrane tutaj: G1b1c pełne cancel/release/error/deadline/main-SHA holds oraz native adversarial lifecycle matrix; worker-clock przed G2c/G3; native-output/remote-new grant/materialize; App/global cap/G1b2; ACTIVE/source admission/G2/G3/geometry/UI/CAD. Obecny `release` jest natychmiastowym revoke/terminate one-shot compute, nie retained-owner RELEASE/RELEASED/grace. Main-only watchdog i synchronous deadline gates są safety guardami, nie pełnym native deadline acceptance.

## Pliki dowodowe / replay
- `handoff.json` — machine-readable delivery + hash scope.
- `delivery-verification.json`, `integrity-start.json`, `integrity-end.json` — niezależne obliczenia hashów i policzone wyniki.
- `artifact-manifest.json` + `artifact-manifest.sha256` — pełny indeks byte hashes artefaktów, bez self-reference.
- `phases/native-header-bound-green/native-results.json` — końcowy native proof i source/served hashes.
- `phases/delivery-unit/vitest-results.json`, `phases/delivery-strict128/`, `phases/delivery-full-tsc512/`.
- Replay bez nadpisania historii: `node C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-handoff-core/phase.mjs parent-native native` (analogicznie nowa unikalna faza + `unit`, `strict`, `ts`).
