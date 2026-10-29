# Niezależny review spec/runtime G1b1a

**Werdykt: PASS — wyłącznie `G1b1aPoolPrimitiveOnly`.** Brak wykazanych błędów logicznych lub problemów bezpieczeństwa w zamrożonym zakresie prymitywu. Nie jest to akceptacja globalnego limitu aplikacji, transportu ani całego CAD.

## Wejście i zakres

Repo `C:/Users/sandr/OrthoSculptCAD`, HEAD `2a586bd3abe3c801e7fe23764fecc77b8c770b50`. Review faktycznych untracked `src/compute/workerPool.ts` oraz `tests/v03-worker-pool.test.ts`, z prawdziwym zaakceptowanym `resourceLedger.ts`. Normatywne są jedynie odpowiednie klauzule §3 i pool w §8 planu o SHA `45cc11a03a92218670bff1fdf77d5fcd1c8f089a318044bdfe9269cecd1285a3` oraz jawnie przekazany zakres. Nie czytano cudzych WIP review; zakończone materiały autora potraktowano wyłącznie jako dane.

## Zgodność rzeczywistego API

- **Dwa sloty na instancję:** wybór wolnego slotu i BUSY następują przed odczytem planu, reserve i factory (`workerPool.ts:64–79`). STARTING jest publikowany prywatnie przed trusted factory; IDLE/REVOKING/FAILED zachowują zajętość. Niezależny świadek wykonał reentrant acquire podczas STARTING oraz trzeci acquire z planem-Proxy rzucającym przy każdym odczycie: BUSY bez dotykania planu.
- **Plan i rollback:** limit 16 przed reserve; pełny plan rezerwowany przez ten sam rzeczywisty ledger, bez payload allocation (`:72–86`). Odmowa budżetu nie zajmuje slotu. Błąd factory zwalnia tylko własną rezerwację; własny świadek zachował identyczny snapshot i wszystkie bajty niezależnego, materializowanego źródła.
- **Ownership i lifecycle:** prywatny WeakMap lease, zamrożony pusty obiekt; JSON/clone/foreign/cross-pool/diagnostyka nie uzyskują authority (`:26,59–62,91–104`). Retired h1 jest no-op i nie zmienia h2. Native error/messageerror zamyka dokładny captured binding; stary wywołany bezpośrednio callback nie działa na nową inkarnację (`:94–103`).
- **Terminal:** przed efektami znikają auth i możliwość ponownego release; slot/charge wracają dopiero po udanym terminate. Wyjątek terminate zachowuje FAILED/charge bez retry (`:29–38`). Dispose zamyka acquire i odbiera wszystkie publiczne lease przed pierwszym efektem (`:40–50`). Świadki obejmują reentrancy, nested STARTING, dispose→factory return oraz dispose→constructor throw, bez późnej publikacji.
- **Trzy domeny raz:** main + dwie logiczne domeny slotów, nie fizyczne tożsamości realm (`:23–25`). Własny test wykonał 80 inkarnacji drugiego slotu przy maxRealms=3/maxLeases=2/maxRefs=2 i zachował dwie używane domeny. Nie ma podnoszenia domyślnego limitu G1a.
- **Diagnostyka, RNG, liczniki:** snapshot i sloty frozen, tylko skalarne dane; brak Worker/lease/ref/nonce (`:53–56`). Auth nie opiera się na RNG. 128-bit native getRandomValues jest prywatne (`:81`). Guard safe-integer poprzedza inkrementację generation/incarnation i zamyka pool bez wrap (`:69–70,78–79`); granica MAX_SAFE_INTEGER została sprawdzona statycznie, nie przez tryliony wywołań. Globalny diagnostyczny generation tego prymitywu nie jest przyszłym wire generation=1.

## Faktycznie wykonane niezależne sprawdzenia

`commands.json`, surowe `*.log` oraz `run.log` zawierają komendy i rzeczywiste exit codes.

1. Strict compile **rzeczywistych** nowych modułów przez zainstalowany TypeScript: ES2022 + DOM, types=[], strict, noEmitOnError, CommonJS do własnego scratch; Node heap 128 MiB / semi-space 8 MiB; **exit 0**. Żaden mock nie zastępuje kompilowanego pool ani ledgeru.
2. **12/12 własnych świadków real-API: PASS**, w tym deterministyczne **360 przejść** porównanych z niezależnym małym grafem liczników własności; **exit 0**. `UnitWorker extends EventTarget` jest wyłącznie UNIT double i nie udaje fizycznego native Workera. To coverage istniejącego zachowania, nie nowe TDD RED.
3. Audyt **14 pionów autora RED→GREEN**: każde RED exit=1 i rzeczywista asercja zachowania, każde GREEN exit=0; testy byte-identical w każdej parze. Nie zaliczono bootstrap/import error. AST historycznych testów wskazuje tylko jedną późniejszą zmianę istniejącego testu: test 06 zaostrza controls o maxLeases=2/maxRefs=2; brak osłabienia asercji. Pozostałe 10 przypadków to istniejące coverage, nie 24 piony TDD. Faza `24-existing-coverage` jest tak nazwana i ma raw GREEN.
4. W finalnym logu autora **40/40**: **16 niezmienionych G1a + 24 pool**; finalne snapshoty kodu i testów są byte-identical z wejściem review. Tych 40 testów nie uruchamiano ponownie równolegle z regresją rodzica.
5. Sprawdzono jako zastane dane native autora: **119/119** checks, **49 Workers / 49 terminate**, 50 prób konstrukcji, peak=2, 0 main sends/payload allocator calls, zgodne 49 close notifications przed teardown, brak pageerrors/external requests, zamknięte context/browser/server i port-refusal. Zweryfikowano SHA źródeł i faktycznych zapisanych served modułów/fixture względem native-results. **Nie uruchamiano przeglądarki ani native replay w tym review**; fizyczny replay jest oddzielną czynnością rodzica. Te obserwacje nie dowodzą globalnego App cap ani physical thread join/GC/RSS.

## Granice i uwagi

Brak wymagania implementacji ACK/transport/proxy/main-SHA/WAIT_MAIN/sourceOwner/source admission lub migracji legacy w tej bramce. Brak deklaracji G1b2/G2c/G3, klinicznej gotowości, EXE, RSS ani pełnego smooth3D/cut/S+B/nonplanar shell/collar acceptance. Nie zmieniono wymagań tych funkcji. Trusted factory jest wewnętrznym seam kompozycji, nie sandboxem dowolnego JS i nie URL-em dostarczonym przez plik/użytkownika.

Repo, index, zależności, konfiguracja i skills pozostały readonly. Wszystkie własne pliki są pod `C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-worker-pool-spec-review/`. Start/end SHA i manifest artefaktów pozwalają odtworzyć zakres. Pełna regresja i niezależny native replay rodzica pozostają osobnymi gate'ami; ten PASS ich nie zastępuje.
