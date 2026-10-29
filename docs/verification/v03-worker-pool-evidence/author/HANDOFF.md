# G1b1a — przekazanie do review

- Wynik: **izolowany prymityw działa; odbiór rodzica nadal wymagany**.
- Nowe pliki repo: `src/compute/workerPool.ts`, `tests/v03-worker-pool.test.ts`. Bez integracji App/legacy.
- API: `createWorkerPool(ledger, trustedFactory)` → `acquire`, `release`, `dispose`, `snapshot`. Autentyczne lease rozpoznaje wyłącznie lokalny WeakMap; retired h1 jest no-op, obce/klony/diagnostyka → INVALID_INPUT.
- Limit 2 obejmuje STARTING/IDLE/REVOKING/FAILED; pełny plan rezerwowany w tym samym prawdziwym G1a przed constructor. BUSY przed reserve/copy/constructor/send. BUDGET nie zostawia slotu.
- 3 prywatne domeny powstają raz; per-slot incarnation i global generation nie zawijają. Nonce 128-bit z native crypto jest prywatny, nie jest dowodem fizycznej tożsamości.
- Release/error/dispose: auth znika przed efektami; slot wraca dopiero po udanym wywołaniu `Worker.terminate()`. Throw → zajęty FAILED i zachowany charge, bez retry. Dispose zamyka acquire synchronicznie, także przy reentrancy factory.
- Żaden snapshot nie ujawnia Worker/Realm/resource Lease/Ref ani nonce. Zamknięcie dotyka tylko własnego lease zasobów.

## Faktyczna weryfikacja

- **40/40 testów**: 16 zamrożonych G1a + 24 nowych pool. Heap 256 MiB, semi-space 8 MiB, maxWorkers=1, fileParallelism=false.
- **14 pionów RED→GREEN**: komendy, kody 1/0, raw output i snapshoty kodu w `phases/`. Natychmiastowe GREEN pozostałych przypadków jest coverage istniejącego zachowania, nie sfabrykowanym RED.
- Pełne `tsc --noEmit --incremental false`: exit 0, heap 512 MiB.
- Real Chromium **156.0.8078.4**: **119/119 checks PASS**, 50 prób native constructor, 49 rzeczywistych Workerów i 49 udanych terminate; peak created−terminated=2.
- 40 seryjnych inkarnacji przy maxRealms=3/maxLeases=2/maxRefs=2. Real native constructor SyntaxError bez sieci oraz 1 oczekiwany trusted worker error.
- 0 main postMessage, 0 payload allocator calls, 0 nieoczekiwanych pageerrors i 0 zewnętrznych requests. Idle fixture wysyła wyłącznie prawdziwy `idle-ready` z własnego natywnego skryptu — nie audyt ani udawany wynik produkcyjnego endpointu.
- 49/49 native close notifications jeszcze przed context teardown. Context/browser/server zamknięte; port rzeczywiście odmawia po zamknięciu. Nie jest to dowód thread join/GC/RSS.
- Vite transformuje rzeczywiste niezmienione moduły; `native-results.json`, `native-hashes.json` oraz `served/` wiążą source/served SHA.
- **1932 istniejących tracked plików bez zmian**, tracked/index diff pusty, HEAD zachowany. Równoległych untracked docs/evidence nie edytowano; nie twierdzę, że canonical plan pozostał niezmieniony.

## Hash nowych źródeł

- workerPool.ts: `b5a7457bde19616b61247ca690bf2b1bc5f387cd3067db3ad56cb9c115878e64`
- v03-worker-pool.test.ts: `0f977cb7b128492ec33667f805c553de074d1417c60c08bacd6316c0190bc5a7`

## Ograniczenia / następna bramka

Bez ACK/handoff/rebind/deadline ABI, remote grants, main-SHA/WAIT_MAIN, source ACTIVE, fake owner ani AuditedSource. Native opóźnionego starego eventu po terminate nie sfabrykowano — jawny TEST captured-callback pokrywa guard h1/h2. Niezmienione legacy ścieżki nadal omijają ten nowy helper; brak deklaracji globalnego cap aplikacji. Nie zmieniono G1a ani jego testów/defaultów 128/128/384 MiB. Full CAD/release 0.2/G2c+G3 pozostają poza zakresem.

Rodzic: serial full regression + dwa niezależne review przed akceptacją/commit. Nie stage'owano ani commitowano.

## Replay

```bash
node C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-worker-pool-core/verify-final.mjs
```

`handoff.json` zawiera dokładne exports/limity/error contracts, komendy i hashe. `source-start.json` + `source-end.json` zapisują niezmienność istniejących plików. Jedyny problem środowiskowy: pierwszy Python→git subprocess dostał WinError 5; shell git + Python hash zadziałały, bez zmian ustawień.
