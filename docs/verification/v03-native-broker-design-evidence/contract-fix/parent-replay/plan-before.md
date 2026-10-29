# G1b — mały broker native Workers i ledger handoff (projekt)

## 1. Status, wejście i oddzielne bramki
- **DESIGN ONLY; wymaga niezależnego review rodzica przed kodem.** Nie wdraża brokera ani source admission.
- Baza: `feature/trimline-v03`, HEAD `2a586bd3abe3c801e7fe23764fecc77b8c770b50`; release 0.2 ZIP/dist pozostają zamrożone.
- Odebrany G1a: `resourceLedger.ts` SHA256 `f7b098fd05c129862226f2af75994017f273727bdfbb3a1c3911d1051cb49109`.
- Testy G1a SHA256 `643b4b3f76e4b17dae52b59b3bece3148f8da960721b43f04b2729d9b8497a95`.
- Normatywny owner-design SHA256 `800d85f0f368d76b3c7e8ae4ed908ebc9dec6b11f51c5c5eaf0c5112374ad3ce`, zwłaszcza §5.1.1/§5.2.
- **G1b1:** niezależny prymityw wspólnej puli + rzeczywisty transfer/ACK/return/terminate i main-settle; bez G2/G3.
- **G1b2:** migracja wszystkich konstruktorów i egzekwowalny legacy/source-session entry fence; brak aktywnej sesji do spełnienia ingress.
- **MIXED-POSITIVE: UNACCEPTED** aż real G2c arena-analyze i real G3 retained owner wykonają razem dodatni przypadek przez tę samą pulę/ledger.
- Nie wymagać pełnych G4 UI/recipe fences do rozpoczęcia G1b1; ACK nigdy nie zastępuje końcowego G4 publication fence.
- Pełne smooth 3D, cut both, full S+B, nonplanar shell i external collar pozostają zakresem produktu; brak obietnic clinical/EXE/RSS.

## 2. Co istnieje i dlaczego `transfer` nie wystarczy
- G1a `Lease.transfer(ref, realm)` tylko sprawdza i zmienia owner metadata. Nie wysyła, nie odłącza, nie czeka na ACK.
- `Allocation.buffer` pozostaje głównym AB; `backingBytes` odrzuca go po native detach. Zwykłe retain/reclassify/transfer nie naprawiają tego.
- Odebrany w Workerze/powrotny AB to inny obiekt JS; `registerExisting` powrotu utworzyłby drugi allocation, a diagnostic ID nie uwierzytelnia niczego.
- Obecny compute cap=2 nie obejmuje osobnego display Workera; `index.ts` kończy client w finally, SliceIndex utrzymuje client do dispose.
- `worker.ts` klonuje cały wynik i rekurencyjnie zbiera transferables; display klonuje task przed upload. To nie jest budgeted source path.

## 3. Jeden broker; skończone authority i realm domains
- Jeden process-local `workerPool.ts` w zaufanej kompozycji aplikacji, max **2** zajęte sloty łącznie: compute, display, index, owner.
- Slot jest zajęty już od synchronicznego acquire, także podczas kopii/startup, idle index/owner i REVOKING. Brak kolejki acquire; trzeci → BUSY przed kopią/constructor/upload.
- Zwykłe zadanie i legacy index nie stają się ownerem przez flagę callera. Backend wybiera prywatny enum/factory, nie publiczny URL/factory.
- Jeden ledger ma raz utworzone 3 realm capabilities: main oraz **dwie logiczne domeny własności slotów**, nie 3 fizyczne JS realms.
- Każda domena slotu ma najwyżej jeden aktualny physical Worker i monotoniczny incarnation; mapa `(slot, incarnation) → exact Worker object` jest prywatna.
- Reuse domeny dopiero po terminal transition starej instancji, odpięciu listenerów i usunięciu jej remote holds; nowy nonce/incarnation, nigdy stara authority.
- Snapshot realm oznacza domenę, nie tożsamość nowego wątku. Nie rejestrować nowego Realm co job, nie zwiększać domyślnego lifetime cap=32 ani dodawać publicznego recycle.
- Overflow safe-integer generation/incarnation/request/transfer counter → zamknięcie brokera, bez wrap/reuse. Nonce: 128 bit z native crypto przy acquire.
- Opaque PoolLease/Request/Handoff istnieją w prywatnych WeakMaps; TS brand, JSON, source ID, hash i allocation ID nie są authority.
- Handle release uwierzytelnia dokładnie własny record: autentyczny retired h1 → no-op zanim dotknie aktywnego capture h2; forged/foreign → INVALID_INPUT. Nowe capture/request ma odrębny binding/generation, nie wspólny mutable `current` jako cel starego release.
- Zaufane moduły nie są sandboxem dowolnego JS; plik/JSON/caller-report nie wybierają planu, realm, allocator ani ACK authority.

## 4. Minimalny prywatny dodatek G1a — decyzja przed kodem
- Wymagana mała zmiana **wewnętrznego** rdzenia `resourceLedger.ts`, nie wrapper udający transport na starym publicznym API.
- Zachować eksport i semantykę `createResourceLedger()`/Lease oraz wszystkie odebrane testy; bez adaptera snapshot nadal tylko reserved/live.
- Dodać oddzielny internal composition factory (nie re-exportować z publicznego compute index) zwracający `{ ledger, handoff }` nad **tym samym** rdzeniem.
- Factory buduje adapter closure z dostępem do allocations/backings/refs; nie przyjmuje serializowanego tokenu ani caller-provided transport hooks.
- Nowe stany allocation: RESERVED → MAIN → PREPARED → IN_FLIGHT → REMOTE → RETURNING → MAIN lub RETIRED; bytes/ID/kategorie nie zmieniają się przy podróży.
- PREPARED blokuje zwykłe operacje na tym allocation; po detach usuń stary wpis backing i silną referencję do starego AB, zachowaj bytes i controlled ref.
- IN_FLIGHT/REMOTE/RETURNING nie mają lokalnego `buffer`; nie są RESERVED. Public allocate/retain/reclassify/transfer na takim ref → INVALID_INPUT, bez zmian grafu.
- Prywatny broker lease jest jedynym właścicielem wysyłanego backing; nie ujawnia się callerowi. Caller otrzymuje tylko uwierzytelniony request/owner handle.
- Wejściowy caller ref można retain do broker lease i zwolnić caller ref **przed** prepare; jeśli pozostał UI/Undo/SHA alias, odmówić TRANSFER_ALIASED lub reserve osobną kopię.
- Adapter kontroluje release własnego ref; public close cudzych lease nie może go usunąć. Nie wystawiać transport lease/ref w wyniku ani wiadomości.

```ts
// Proponowane interfaces wewnętrzne, NIE obecne API; wszystkie capabilities runtime-authenticated.
interface NativePool {
  acquire(kind: 'compute'|'display'|'index'|'owner', plan: InternalPlan): PoolLease | BusyOrBudget;
  dispatch(lease: PoolLease, packet: PreparedPacket): void; // private authenticated encoder output only
  revoke(lease: PoolLease, cause: 'cancel'|'release'|'dispose'): void;
}
interface NativeHandoff {
  prepare(lease: Lease, refs: readonly Ref[], target: SlotBinding): Handoff; // atomic batch, each sole MAIN ref
  sent(ticket: Handoff): void; // private send path only; verify original AB actually detached
  sendThrew(ticket: Handoff): void; // rollback iff original AB remains attached
  received(ticket: Handoff, event: ValidatedAck): void;
  returned(ticket: Handoff, event: ValidatedReturn, actual: readonly ArrayBuffer[]): void;
  grant(lease: Lease, refs: readonly Ref[], request: RequestBinding): RemoteGrant; // already RESERVED
  materialized(grant: RemoteGrant, event: ValidatedAck): void;
  terminated(binding: SlotBinding): void; // remote refs only, once native terminate invoked
}
```
- InternalPlan to prywatna dense lista ≤16 `{key,bytes,category,owner,role}`; adapter przekazuje ledgerowi dokładnie pola PlanEntry. PreparedPacket/RemoteGrant/RequestBinding są runtime capabilities, nie dowolnymi obiektami.
- SlotBinding jest prywatną capability brokera z exact Worker/listener i incarnation, nie obiektem z cyframi przyjętym od publicznego callera.
- `sent/sendThrew/received/returned/terminated` dostępne wyłącznie w closure adapter↔broker, nie jako publiczna powierzchnia pluginu.
- `prepare` preflightuje cały pakiet, pełne intrinsic byteLengths, fixed nonshared AB, bez RAB/SAB i bez duplikatów/aliasów; nie alokuje shadow backing.
- Rzeczywiste postMessage wykonuje wyłącznie broker z listą przygotowanych AB. Sukces wymaga detach wszystkich; anomalia częściowego detach → fail-closed terminate.
- Synchroniczny throw z nieodłączonymi AB odtwarza MAIN/owner/mapę bez nowego ID/charge. Throw z detach nie może udawać rollback: terminal terminate, nie ponowny upload.
- `returned` atomowo waliduje cały expected pakiet, intrinsic rozmiary, distinct AB i brak konfliktu z backings; rebinduje otrzymane obiekty do **tych samych allocations**.
- Rebind nie zamyka lease ani nie publikuje raw AB. Dla wciąż current wyniku zaufany consumer robi G1a retain do własnego lease w main realm, następnie broker zwalnia job ref; brak przyjęcia/current → drop. Legacy raw results nie dostają pozornej authority.
- Zgodność po powrocie wynika z kontrolowanego worker endpointu trzymającego dokładnie przyjęte AB pod ordinalami i wysyłającego je transfer-listą; sama równość bytes/ID nie dowodzi pochodzenia.
- Trusted endpoint nie przyjmuje caller buffer replacement i nie zwraca kopii pod starym ticket. Prywatne ticket/Worker/channel correlation to authority, wire ordinal tylko lookup.
- Dla nowego remote output/arena: main rezerwuje osobny allocation przed dispatch; prywatny grant wiąże RESERVED z exact request+ordinal+bytes. Worker materializuje raz przez kontrolowany allocator.
- Materialized ACK przestawia ten sam rekord na REMOTE; przed nim reservation już nalicza bytes. Return wiąże ten rekord do actual AB; brak drugiego ledgeru/zero charge/dummy buffers.
- Controlled native SHA ma osobny fixed-output grant=32 B przed wywołaniem; internal `bindNativeResult(grant, actualAB)` wiąże rzeczywisty wynik do tego RESERVED ID, nie `registerExisting`. Brak wymiennego provider fallbacku; rejection zwalnia output reservation dopiero w settle.
- G1b1 może dowodzić input roundtrip bez remote-new allocator; G2c nie może użyć arena/output ścieżki przed osobnym testem grant/materialize/return/terminate.

## 5. Bounded ABI i rzeczywiste ACK
- Nowy kontrolowany endpoint, nie obecny generic `WorkerResponse`. Stały 64-byte header AB: magic/version/type/slot/incarnation/generation/job/request/transfer/window + 16-byte nonce + reserved zero.
- Little-endian uint32 offsets 0..36 kolejno jak wyżej, nonce 40..55, zero 56..63; magic `0x3142474e`, version=1. Dokładne długości/role/ordinals sprawdzane przed ACK.
- Pola licznikowe uint32; limit kończy generację przed przepełnieniem (nie wrap). Types zamknięte: START, RECEIVED, RETURN, RELEASE, RELEASED, CANCEL, ERROR, MATERIALIZED.
- Type codes odpowiednio 1..8; role codes: positions=1, indices=2, colors=3, uvs=4, baseline=5, preimage=6, digest=7, arena=8, report=9; wszystkie inne → reject. ERROR: enum 1=INVALID, 2=BUDGET, 3=DEADLINE, 4=INTERNAL w pojedynczym descriptor `(0,code,0)`, bez tekstu/buffers.
- Header jest **control metadata**, jawny stały narzut max 4 nagłówki na slot; nie payload/shadow. Zero data-bearing diagnostics; ERROR tylko zamknięty enum.
- Wiadomość ma dokładnie `{ header, descriptors, buffers }`; max 16 descriptors i payload AB. `descriptors` to fixed AB długości `12*n`, LE tuple `(ordinal, role, bytes)` uint32, role z zamkniętego enum; header/descriptors nie są payload grantami.
- START: pierwsze `buffers.length` descriptors opisują dokładnie input AB w tej kolejności; reszta to pre-reserved remote grants. RECEIVED echo input descriptors; MATERIALIZED echo grants, oba bez buffers. RETURN ma wyłącznie prywatnie zaplanowany ordered subset z actual AB; RELEASE/RELEASED/CANCEL bez descriptors/buffers. Transfer=0 tylko dla control bez payload/grants.
- Header/descriptors łącznie ≤1024 B/message; brak dowolnych nested objects, tekstur, nazw/metadanych i recursive clone/transfer discovery w source transport.
- Max jedno outstanding request na slot i jedna grupa handoff; max 4 kontrolne odpowiedzi na grupę. Unexpected/duplicate/wrong-schema od aktualnego Workera → protocol error + revoke/terminate.
- MATERIALIZED jest jednym batch ACK wszystkich grants, nie wiadomością per buffer. Idle owner odpowiada tylko na ograniczone bieżące request/release; brak unsolicited progress/heartbeat i ukrytej kolejki.
- Stary listener/nonce/incarnation/generation/job/request/window jest nieaktualny → ignoruj; nie zwalniaj nowej rezerwacji. Correlation sprawdzić **przed** przejściem allocation.
- RECEIVED dopiero po walidacji rzeczywistych przyjętych AB i zapisaniu ich w prywatnym worker record; to nie koniec job ani permission publikacji.
- RETURN zawiera dokładnie oczekiwane AB i detach po stronie worker; staje się MAIN dopiero po walidacji main. Nie release remote charge na samą zapowiedź RETURN.
- RELEASED dopiero po drop wszystkich wskazanych remote rekordów i zakończeniu ich worker continuations; nie ACK samego odebrania CANCEL/RELEASE.
- Nie mapować legacy result do tego ABI na siłę: G1b2 przekazuje stare protokoły tylko w legacy mode; G2c ma osobny bounded report encoder z pre-reserved reply.

## 6. Lifecycle i dokładne delty ledgeru
- Acquire atomowo sprawdza mode/slot i reserve całego planu; failure nie zostawia slotu/ref. Constructor throw cofa reservation, bez publication.
- `t0` przy acquire; `deadline=t0+120000ms` obejmuje kopie, serialization, native SHA, startup, audit i reply. Żadna wiadomość nie resetuje deadline.
- Synchronous gate sprawdza czas również przed allocation/send/ACK/publication; timer może być opóźniony przez event loop. Worker pętle później sprawdzają tę samą pozostałą duration.
- Idle retained owner/index nie traci slotu po 120s istnienia; każde jego nowe żądanie ma własne t0 i deadline, nie równoległy reset owner lifetime.
- Revoke synchronously unieważnia auth i blokuje dispatch/publication; cancel REQUEST **nie** zwalnia slotu. Grace release proponowane 1000ms, ograniczone pozostałym job deadline.
- Jeden `terminalTransition(binding, cause)` ma latch; odłącza listenery, kończy native Worker (także po clean RELEASED), wycofuje remote refs i zwraca slot **dokładnie raz**.
- Terminal usuwa także niewykorzystane RESERVED remote grants tej instancji. MAIN/PREPARED po pre-send cancel/constructor failure zwalnia dopiero lokalny cleanup po zakończeniu ich copy users; nie udawać, że terminate kończy kopię.
- Remote cleanup obejmuje IN_FLIGHT i RETURNING także bez RECEIVED ACK. Unexpected current-channel AB nie rejestruje się: drop i terminate, nie nadawanie ID z wiadomości. Native terminate throw → fail-closed broker bez reuse slotu, jawny błąd.
- Slot można oddać po terminal, ale końcowe close całego resource lease czeka na WAIT_MAIN; dwa niezależne latches (`workerTerminal`, `mainSettled`) zapobiegają podwójnemu cleanup. Zero expose tego lease callerowi.
- Normalny owner release: auth ginie od razu; resource lease trwa do RELEASED albo grace/deadline→terminate. Busy worker może nie odebrać CANCEL: deadline kończy go bez oczekiwania ACK.
- Zakończony one-shot compute/display nadal terminate-on-finish; idle index/owner zachowuje affinity i slot. Nie wykorzystuj ich jako dodatkowej puli.

| Zdarzenie / stan | Przejście / slot | Delta dla backing D kategorii job; eligibility |
|---|---|---|
| acquire/pre-send | RESERVED→MAIN, slot held | reserve `(+D,+D,0)` przed allocation; alias → odmowa przed detach |
| prepare + send throw attached | MAIN→PREPARED→MAIN | `(0,0,0)`, ten sam ID; retry tylko po jawnej ponownej kontroli deadline |
| send success, detached | PREPARED→IN_FLIGHT | `(0,0,0)`; nie wywoływać starego transfer/retain na detached AB |
| correlated RECEIVED | IN_FLIGHT→REMOTE | `(0,0,0)`; controlled ref żyje, slot held |
| return actual AB | REMOTE→RETURNING→MAIN | `(0,0,0)`; jeden rebind; current auth wymagane do wydania wyniku |
| cancel/release/dispose | *→REVOKING | `(0,0,0)`; auth revoked, nowe dispatches zabronione |
| RELEASED / error / deadline | terminal→terminate | usuń tylko remote controlled refs; ostatni job ref D daje `(-D,-D,0)` |
| main AB zwrócony, lecz revoked | MAIN→RETIRED | `(-D,-D,0)` dopiero po drop lokalnych użytkowników; nie publikuj |
| main copy/serialization/SHA pending | worker terminal + WAIT_MAIN | slot oddany, **brak** delty main refs; ich lease nadal zajmuje budżet |
| rzeczywisty main settle, także reject | WAIT_MAIN→RETIRED | usuń wyłącznie refs tego continuation; last ref dopiero teraz odejmuje D |
| late ACK / h1 release przy pending h2 | stan h2 bez zmian | `(0,0,0)`; brak nowego handle/zwolnienia h2 |

- Tuple oznacza `(managed,job,history)`; shared refs zachowują G1a kategoriowe union, nie sumować refów. Tabela dotyczy sole remote ref, nie cudzych holds.
- Uncancellable native SHA przechowuje real preimage do prawdziwego JS settle; worker terminate ani public reject nie zwalnia jego main lease. Dispose ma priorytet także nad późnym SHA rejection.
- Worker-owned payload zwalnia logical charge na terminal; nie obiecuje natychmiastowego końca wątku/GC/RSS. Uncancellable main promise nie ma gwarancji finite settle: poprawny HOLD, nie fałszywe zero.
- Ograniczyć liczbę main continuations istniejącymi lease/ref caps i osobnym broker cap=2 WAIT_MAIN; przy dwóch nierozliczonych main holds nowe acquire BUSY przed kopią.

## 7. Migracja istniejących właścicieli bez przepisywania CAD
| Plik / aktualny właściciel | Minimalna przyszła zmiana |
|---|---|
| `compute/client.ts` / activeWorkers | Usunąć lokalny licznik; broker lease przy konstrukcji, request generation z brokera, dispose→terminal; stary timeout per-message zastąpić deadline |
| `compute/index.ts` / finally dispose | Mode+acquire przed copyParameters/kopiami; legacy nodeOnly wyłącznie poza source mode; one-shot finally pozostaje, ale nie zwalnia pending main holds |
| `compute/copy.ts` / ownedTransfers | Legacy shape-check zachować; nowy private budgeted copy alokuje przez uprzednie plan refs, transfer-list z jawnych pól; bez claim accounting starego copy |
| `compute/service.ts`, `worker.ts`, `protocol.ts` | Legacy service/index i clone-result działają tylko legacy; nowy fixed transport endpoint ma ACK/drop/return; arena-analyze dopiero G2c |
| `compute/sliceEngine.ts` / active+latest pending | Cały client zajmuje wspólny slot. Jedno jawne latest-pending read zostaje adapterem UI, nie kolejką brokera; mode exit rejects oba i dispose cache |
| `hooks/runDisplayTask.ts`, `display.worker.ts` | Display acquire z tej samej puli przed structuredClone; active guard zostaje semantyczny, nie drugi cap; factory seam prywatny test-only |
| `hooks/workbenchState.ts` / generation tickets | Zachować cancel/dispose/revision scope i final commit kontrolę; broker ACK nie nadaje prawa commit. Pełna source registry dopiero G4 |
| `App.tsx:400–476` / backgroundControllers, interactiveEngine, oba readers | W G1b2 minimalny lifecycle adapter wywołuje istniejące abort/dispose oraz synchronicznie blokuje restarty effects w CLOSING/ACTIVE; nie przepisywać całego App. Rust/Tauri reader też musi być drained/blocked, nie liczy się jako dowód native Worker |
- Prywatny broker posiada jedyne produkcyjne `new Worker`; worker endpoints nie tworzą kolejnych. Nie utrzymywać dodatkowego retained-owner pool.
- Source-session begin: synchronicznie CLOSING blokuje wszystkie nowe legacy entrypoints, odwołuje background audit, zamyka oba slicing readers/display, czeka na terminal i main holds.
- Handshake drain również ma jeden deadline 120s; nierozliczony main hold po nim → odmowa sesji, zachować hold do settle. Nie czekać bezterminowo w CLOSING ani udawać, że bezpiecznie zwolniono preimage.
- Następnie private ingress rejestruje wszystkie istniejące UI/history backings intrinsic identity; refusal albo nieznany adapter → rollback własnych refs i legacy mode, bez ownera.
- Dopiero spełnione drain+ingress tworzą ACTIVE; do G2c wszystkie legacy ops (także analyze), display i index odmawiają przed kopią/upload. Po G2c dopuszczony tylko budgeted analyze.
- Import/Undo/export adaptery i background restarty muszą respektować CLOSING/ACTIVE; nie twierdzić, że samo istnienie enumu w brokerze aktywuje source-session. Nieogrodzona ścieżka → session unavailable.
- Exit: synchroniczne revoke ownera, brak nowych source dispatches; legacy przywrócić po terminal remote cleanup i rozliczeniu ingress/main holds. G1b1 nie wystawia użytkownikowi ACTIVE.
- G1b2 testuje prywatną gate state machine, nie fikcyjny AuditedSource; produkcyjne ACTIVE wymaga faktycznego G3 ownera. Zablokowane operacje/UNKNOWN nie są działającym backendem admission.

## 8. Cztery przyszłe piony RED→GREEN (nie wykonane w tym projekcie)
1. **G1b1a pool:** real native idle fixture zajmuje 2 sloty; trzecie acquire RED gdy stary display omija cap → minimalny broker. Constructor/copy/send counters: trzeci ma zero; terminate/reacquire i >32 inkarnacje bez nowych Realm; żadnego fake owner/token.
2. **G1b1b handoff:** real AB z G1a, native START→RECEIVED→RETURN; RED: detached G1a nie potrafi rebind → internal extension. Zachować bytes/hash/ID/charge, różne JS object identities, alias refusal; real DataCloneError attached rollback i malformed return fail-closed. Obserwować native send/receive/detach/terminate, nie sfabrykowane ACK.
3. **G1b1c lifecycle:** real busy worker + cancel/release/error/deadline, exactly-once terminal; delayed old native reply nie dotyka nowej lease. Real SHA preimage hold po revoke/terminate aż settle, także rejection/dispose, h1-release/pending-h2. Native event chronology + ledger snapshots; krótkie deadline tylko private test config, zero worker flags/bypass.
4. **G1b2→G2c/G3 mixed:** najpierw wszystkie legacy constructors przez broker i real slice/display caches drain, blocked source-mode copy counters zero; osobno remote-new grant/materialize roundtrip. **Później** real retained audited owner + dodatni arena-analyze (nie stub/all-UNKNOWN), max2, trzeci index/display blocked. Ostatnia część pozostaje UNACCEPTED do G2c/G3.
- Każdy pion: najpierw rzeczywisty behawioralny RED, minimalny GREEN, regresja odebranego G1a; zachować komendy/exit/raw logs. Native Chromium gate nie zastępuje Node fallback.
- Kryteria przed kodem: niezależne review API/coupling/states/ABI, poprawna granica main-settle, domain mapping i source-mode; nie wymagać już zaimplementowanego G2/G3 do startu pionu 1.
- Dowody tego projektu i source start/end hashes są w scratch `v03-native-broker-g1b-design/`; to weryfikacja projektu, nie odbiór aplikacji.

## 9. Faktyczna weryfikacja projektu
- Scratch-only probe z niezmienionym odebranym G1a wykonał rzeczywisty native Worker w Chromium; konstruktor, postMessage, odpowiedzi, obustronny detach i wywołanie terminate zapisano bez podstawiania reply.
- Potwierdzono: logical transfer nie detachuje; po native detach retain/reclassify/transfer odmawiają; powrotny AB ma nową JS identity; naiwne registerExisting nalicza dwa allocations (32 B dla faktycznego 16 B roundtrip). To uzasadnienie nowego adaptera, **nie jego GREEN**.
- Probe potwierdza też realny synchroniczny DataCloneError z attached AB; nie dowodzi korelacji G1b, terminate-thread completion, main SHA lifecycle ani mixed-positive.
- Pełne wyniki/wersja Chromium/hash transpile są w `native-probe-results.json`; compiled hash nie jest wcześniejszym acceptance bundle hash. Bez uruchamiania pełnego suite, zmian zależności, stage/commit i zmian release.
