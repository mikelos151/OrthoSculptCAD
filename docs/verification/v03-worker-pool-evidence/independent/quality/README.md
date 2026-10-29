# Niezależny quality/security review — G1b1a

**PASS wyłącznie izolowanego prymitywu.** Brak blokujących findings. Rzeczywiste niezmienione moduły `workerPool.ts` i odebrany `resourceLedger.ts` skompilowano zainstalowanym TypeScript; niezależne witnesses uruchamiają ich rzeczywiste API, nie model.

- 29/29 witnesses, 754 asercje; compile exit 0, witness exit 0.
- Node v24.19.0, heap 128 MiB, semi-space 8 MiB.
- EventTarget-based transport doubles: **UNIT**, nie native Worker. Wywołanie zachowanego starego callbacka nie udaje zdarzenia przeglądarki.
- Zweryfikowano SHA256 pool/testów/G1a/canonical plan przed i po wykonaniu; HEAD nadal `2a586bd3abe3c801e7fe23764fecc77b8c770b50`.
- Repo, testy, docs, skills, config i profile tylko odczyt. Brak stage/reset/commit, instalacji i ponownego pełnego suite/browser-heavy run.

## Powtórzenie

```bash
node --max-old-space-size=128 --max-semi-space-size=8 C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-worker-pool-quality-review/run.mjs
```

`run.mjs` odmawia przy zmianie któregokolwiek zamrożonego inputu, kompiluje tylko dwa rzeczywiste moduły z `types:[]` i `lib:ES2022,DOM`, zapisuje dokładne komendy/kody oraz raw logs, uruchamia witnesses i ponownie porównuje wejściowe hashe. Wszystkie zapisy pozostają w tym scratch.

- `review.json`: werdykt, zakres, coverage, nieblokujące przyszłe bramki i ograniczenia.
- `witnesses.cjs`: niezależne wykonywalne testy API z unit transport doubles.
- `witness-results.json`, `unit-witnesses.log`: rzeczywiste wyniki, per-case asercje.
- `commands.json`, `compile.log`: wykonane komendy i kody; bez pełnego suite.
- `input-start.json`, `input-end.json`: integralność zamrożonych wejść.
- `static-scan.json`: pomocniczy scan, wersja zainstalowanego TS.
- `hashmanifest.json`: SHA256 artefaktów tego review (z pominięciem samego manifestu).

Przy jednym rozszerzeniu pomocniczego skanera był SyntaxError we własnym runnerze, poprawiony wyłącznie w scratch; końcowa kompilacja i wszystkie 29 witnesses przeszły bez zmian kodu produkcyjnego lub osłabienia asercji.

Pełny regression i rzeczywisty native replay należą do rodzica. Handoff autora czytano jako dane, nie przyjęto jego flagi `passed`. Brak deklaracji globalnego cap aplikacji, migracji legacy, transport/ACK/rebind/deadline/main-SHA/WAIT_MAIN, source ACTIVE, G2/G3, native thread join/GC/RSS, clinical/EXE ani full CAD acceptance.
