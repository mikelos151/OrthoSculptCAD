# Handoff — ostatni auto-fix 2/2, Q2-INTEGRATION + B1

**Kandydat do świeżego review rodzica; bez akceptacji, stage/commit ani zamknięcia zadania.**

Repo: `C:/Users/sandr/OrthoSculptCAD`; HEAD `25980b612ced5dc79ce966208cb7ce4edbb1546b`.
Dowody: `C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-handoff-integration-fix`.

## Wynik
- Q2: best-effort obu listenerów puli, niezależnie od cleanup zawsze jedna próba native stop. Prawdziwy błąd native ma pierwszeństwo; sukces zwalnia tylko właściwy slot/rezerwację. Facade rozróżnia błąd cleanup po FREE od nieudanego stop i rozlicza dokładnie swój ticket.
- B1: reentrant dispose odwołuje uprawnienia natychmiast, ale nie przejmuje stopu od jego właściciela. Końcowy właściciel opróżnia odłożone pool.dispose; pierwotny obiekt E pozostaje w wait. FAILED nadal trzyma exact IDs/refs/charges; zero retry, early free i publikacji po revoke.
- Zmieniono wyłącznie cztery dozwolone pliki. Testy wyłącznie dopisane; stare 33 + 24 + 16 zachowane. Publiczne deklaracje API przed/po są byte-identical; brak zmian ABI/wire/codec, core, endpointu, norm, App i deps.

## Pionowe TDD i klasyfikacja
| Krok | RED (wybrane testy) | GREEN |
|---|---:|---:|
| listenery puli | 0/8 PASS, exit 1 | 8/8, exit 0 |
| rozliczenie kompozycji Q2 | 9/15 PASS, 6 FAIL, exit 1 | pełne 96/96, exit 0 |
| B1 identity | 12/30 PASS, 18 FAIL, exit 1 | pełne 126/126, exit 0 |

9 i 12 już-zielonych przypadków to coverage, nie nowy RED. Po B1 dopisano 80 testów coverage bez dalszych zmian produkcji. Wszystkie pary source/test, commands, rzeczywiste exits i stdout/stderr w `runs/`; `tdd-audit.json` potwierdza identyczne testy RED/GREEN i pionową ciągłość.

## Weryfikacja
- UNIT focused: **206/206**, zero skipped: handoff 158, pool 32, G1a 16. Dopisano 133 przypadki (32 red-capable + 101 coverage). Pełne 5 rejestracji identyfikowanych po parze event/callback; release/RETURN/dispose; reentry release/dispose; sukces/porażka native; osobne h2/consumer/main 7 B.
- Niezmienieni świadkowie, świeża kompilacja faktycznych źródeł do własnych katalogów: **87/87, boundary 55/55, repro 20/20, matrix 124/124**, wszystko exit 0. Zmieniono wyłącznie lokalizacje output/import, nie asercje.
- Strict TS **128 MiB / semi 8**, `types:[]`, DOM+ES2022: exit 0. Pełny projekt `tsc -p tsconfig.json --noEmit` **512 MiB / semi 8**: exit 0.
- Chromium **seryjnie**: pool **119/119**, 49 native Workers/49 terminate/49 close; handoff **71/71**, 9 Workers, native transfer/RETURN detach/terminate/close. Source/served hashes związane z kandydatem. Wszystkie własne workers, konteksty, przeglądarki, serwery zamknięte; oba porty odmawiają połączeń.
- Fault injection cleanup/terminate pozostaje dowodem **UNIT**, nie natywnym exploitem/default reachability ani twierdzeniem klinicznym. Terminate/close nie jest dowodem OS join/GC/RSS.
- `git diff --check` exit 0; added-lines static scan czysty. To nie niezależna akceptacja.

## Zakres i integralność
`scope-proof.json`: zamrożono 2605 istniejących ścieżek tracked oraz produkcję/testy/normy; zmieniły się tylko 4 dozwolone. Pełne przed/po SHA wszystkich 4 i niezmienione SHA core/endpoint/norm w `handoff.json`. Wyłączono `.git`, `node_modules`, nietrackowane dokumenty verification rodzica; metadata rodzica nie nadpisywano i nie deklaruje się jej pełnej identyczności. Oryginalne manifesty 68 i 53 zweryfikowano przed zmianami; ich scratch wpisy ponownie po zmianach. Historycznych dowodów nie modyfikowano.

## Polecenia i logi
Uruchomiono w repo (pełne argv/cwd/exits w `*.command.json`):
- `python C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-handoff-integration-fix/test_phase.py <q2-pool-red|q2-pool-green|q2-composition-red|q2-composition-green|b1-red|b1-green|final-focused>`; red selekcje przez `-t`, zapisane w meta. Vitest old-space 256/semi 8, maxWorkers=1, no-file-parallelism, cache wyłącznie scratch.
- `python C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-handoff-integration-fix/replay.py` — kompilacja actual fixed TS, oryginalne nieosłabione 87/55/20/124.
- `python C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-handoff-integration-fix/native_and_types.py` — pełny TS512, potem native pool119 i handoff71 w tej kolejności.
- `python C:/Users/sandr/AppData/Local/hermes/cache/scratch/v03-native-handoff-integration-fix/api_proof.py` i `audit.py` — API, SHA, scope, TDD i minimal.diff.

## Pozostało
Brak pozostałego lokalnego repro Q2/B1 ani blokera narzędziowego. Rodzic wykonuje świeże niezależne review i pełną regresję Node/Python. Pełnej suite nie uruchamiano tutaj zgodnie z podziałem pracy. Bez trzeciej pętli naprawczej.

Manifest: **224 wpisów**: scratch 216, repository 8; wyłączenia: sam manifest i efemeryczny `vite-cache/**`. Korzenie jawnie zapisane w `artifact-manifest.json`.
