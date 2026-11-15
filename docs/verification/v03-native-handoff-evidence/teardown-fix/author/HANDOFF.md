# HANDOFF — Q1/Q2 G1b1b (bez akceptacji)

- Zmieniono wyłącznie `src/compute/nativeHandoff.ts` i `tests/v03-native-handoff.test.ts`.
- Q1: reentrant revoke jest tylko zatrzaskiem podczas trwającego terminala; pierwotne wywołanie zachowuje completion ownership. Po sukcesie kończy dokładny prywatny ticket; brak odtworzenia RETURNED/resolve po dispose.
- Q2: każda z trzech prób usunięcia listenera ma osobny catch. Błąd cleanup zachowany oddzielnie od błędu terminate; nie blokuje terminalnej próby. RETURN z błędem cleanup nie publikuje wyniku.
- Kontrolowane refs zwalniane dopiero po potwierdzonym sukcesie. Rzeczywisty błąd terminate zachowuje slot i 5 B job; release/dispose nie ponawiają terminate. Niezwiązany MAIN/history hold i dane pozostają nietknięte; stary callback nie wpływa na h2.

## Pionowe TDD
- Q1 RED: exit 1, 28 PASS + 1 FAIL (`pending=1` zamiast 0); GREEN: exit 0, 69/69 focused. Test identyczny RED→GREEN.
- Q2 RED po Q1 GREEN: exit 1, 29 PASS + 2 FAIL (`terminate=0` zamiast 1, release/RETURN); GREEN: exit 0, 71/71 focused. Testy identyczne RED→GREEN.
- Dwa dodatkowe przypadki fail-closed (terminate throw + reentrant dispose, bez/z cleanup throw) od razu GREEN: uczciwie existing-behavior coverage, bez sztucznego RED i bez dalszej zmiany zachowania produkcyjnego.
- Końcowe focused: 73/73 = G1a 16 + pool 24 + handoff 33 (stare 28 bez zmiany treści asercji + 5 przypadków).

## Weryfikacja
- Quality: 87/87, exit 0, witness i loader bajtowo identyczne; kompilacja bieżącego poprawionego źródła do własnego `quality/compiled`.
- Strict ES2022+DOM/types[] 128 MiB/semi8: exit 0. Pełny projekt TypeScript 512 MiB/semi8: exit 0.
- Chromium: 71/71, 12 constructor/12 terminate, peak=2, live=0; 9/9 DevTools Workers zamkniętych przed context teardown; context/browser/server zamknięte, port odmawia połączenia. Fixture-matrix i fixture-roundtrip bez zmian; runner zmienia wyłącznie jeden literal katalogu scratch. Czyta aktualne repo.
- Q1/Q2 są wyłącznie UNIT fault injection, NIE dowodem wykonalnego błędu natywnego Workera ani exploitu.
- Zachowano nieudany strict128 (TS2769); poprawka dotyczy wyłącznie typowania trzech cleanup closures. Node loader emituje oryginalne ostrzeżenie. `git diff --no-index --check` exit 1 oznacza różnice, stdout pusty i wyłącznie ostrzeżenia LF/CRLF; niezależny scan whitespace czysty.

## Integralność
- Zamrożono 7230 plików repo (bez `.git`/`node_modules`); dokładnie 2 dozwolone zmienione, 7228 identycznych, brak dodanych/usuniętych. `protected-unchanged.json` oraz pełne `input-start.json`/`input-end.json`.
- Oryginalny quality manifest o podanym SHA i wszystkie 39 entries ponownie zweryfikowane bez zmian. Chronione resourceLedger, worker, pool i oba plany bajtowo identyczne. HEAD bez zmian.
- Surowe stdout/stderr, rzeczywiste exits, komendy oraz source/test snapshots każdego kroku: `runs/`. Dokładny diff względem zastanego niecommitowanego źródła: `minimal.diff`. Końcowe kopie: `delivered-source/`.
- SHA256 `src/compute/nativeHandoff.ts`: `c57931244eb8a3b885fef9f55a9398417f16148a100ad3be9269de2f9a46a827`.
- SHA256 `tests/v03-native-handoff.test.ts`: `ca275490a8514f139afb32b838b9572bc16a34336b8b4e6de37073eea49d86bc`.

## Replay (z katalogu repo)
Każda dokładna komenda znajduje się w `runs/<nazwa>/command.json`; nie uruchamiać oryginalnego quality runnera w jego katalogu.
```bash
node --max-old-space-size=256 --max-semi-space-size=8 node_modules/vitest/vitest.mjs run --config C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-handoff-teardown-fix/vitest.config.mjs
node --max-old-space-size=128 --max-semi-space-size=8 node_modules/typescript/bin/tsc -p C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-handoff-teardown-fix/quality/tsconfig.json
node --max-old-space-size=128 --max-semi-space-size=8 --loader file:///C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-handoff-teardown-fix/quality/loader.mjs C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-handoff-teardown-fix/quality/witness.mjs
node --max-old-space-size=512 --max-semi-space-size=8 node_modules/typescript/bin/tsc --noEmit
node --max-old-space-size=256 --max-semi-space-size=8 C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-handoff-teardown-fix/native/native-cli.mjs parent-fresh-phase
```
Nowe replaye muszą mieć własne wyjścia/kopie, aby nie nadpisać zamrożonych dowodów. Q1/Q2 RED odtwarzalne z zachowanych snapshotów we własnej kopii, bez cofania wspólnego worktree.

## Pozostałe bramki
Brak stagingu/commitu i brak pełnego Node/Python suite (własność parenta). Świeży niezależny review, pełna regresja i decyzja o akceptacji należą do parenta. G1b1b nadal UNACCEPTED; brak rozszerzenia API/zakresu produktu.
